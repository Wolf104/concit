-- Phone notifications (web push). Run after plan_manage.sql.
-- A phone that turns notifications on stores its push address here. The tables are locked:
-- the app reaches them only through the functions below.
-- Sending is done by api/push.js on Vercel, which holds the private signing key. It proves who it is
-- with a shared secret kept in push_config, set once by hand:
--   insert into push_config (secret) values ('<same value as PUSH_SECRET in Vercel>');

create table if not exists push_subs (
  endpoint text primary key check (length(endpoint) < 600),
  user_id uuid not null references profiles(id) on delete cascade,
  p256dh text not null check (length(p256dh) < 200),
  auth text not null check (length(auth) < 100),
  created_at timestamptz not null default now()
);
create index if not exists push_subs_user on push_subs (user_id);
alter table push_subs enable row level security;

create table if not exists push_config (
  id boolean primary key default true check (id),
  secret text not null check (length(secret) >= 32)
);
alter table push_config enable row level security;

-- Which notifications a plan has already sent ('new', 'done'), so each goes out once.
alter table plans add column if not exists notified text[] not null default '{}';

-- This phone wants notifications for the signed-in person. Only real push services are accepted.
create or replace function push_subscribe(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  if p_endpoint !~ '^https://([a-z0-9-]+\.)*(push\.apple\.com|fcm\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com)/[^[:space:]]+$' then
    raise exception 'unknown push service';
  end if;
  insert into push_subs (endpoint, user_id, p256dh, auth) values (p_endpoint, auth.uid(), p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
  -- Keep at most 8 devices per person, newest first.
  delete from push_subs where user_id = auth.uid() and endpoint not in
    (select endpoint from push_subs where user_id = auth.uid() order by created_at desc limit 8);
end;
$$;

create or replace function push_unsubscribe(p_endpoint text)
returns void
language sql security definer set search_path = public
as $$
  delete from push_subs where endpoint = p_endpoint and user_id = auth.uid();
$$;

-- Called by api/push.js on behalf of the signed-in person. Checks that the notification is due,
-- marks it as sent, and returns the wording and the phones to send it to. Returns null if there is nothing to send.
--   'new'  : the person who made a group plan, within 10 minutes of making it -> everyone else in the plan
--   'done' : anyone in the plan, once everyone going has voted (or it was finished) -> everyone else going
create or replace function push_claim(p_code text, p_kind text, p_secret text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_me text := auth.uid()::text;
  pl plans%rowtype;
  v_out jsonb;
  v_going int;
  v_done int;
  v_label text;
  v_day date;
  v_today date := (now() at time zone 'Europe/Rome')::date;
  v_title text;
  v_body text;
  v_subs jsonb;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  if p_secret is null or not exists (select 1 from push_config where secret = p_secret) then raise exception 'not allowed'; end if;
  if p_kind not in ('new', 'done') then raise exception 'unknown kind'; end if;

  select * into pl from plans where code = p_code and (data->'people') ? v_me and data ? 'v' for update;
  if not found or p_kind = any(pl.notified) then return null; end if;
  v_out := coalesce(pl.data->'out', '[]'::jsonb);

  if p_kind = 'new' then
    if pl.group_id is null or pl.created_by is distinct from auth.uid() or pl.created_at < now() - interval '10 minutes' then return null; end if;
  else
    select count(*) into v_going from jsonb_array_elements_text(pl.data->'people') x where not v_out ? x;
    select count(*) into v_done from (select person from votes v where v.plan_code = pl.code and not v_out ? v.person
      group by person having count(*) >= jsonb_array_length(pl.data->'options')) d;
    if v_going < 2 or not (coalesce((pl.data->>'finished')::boolean, false) or v_done >= v_going) then return null; end if;
  end if;

  update plans set notified = array_append(notified, p_kind) where code = pl.code;

  v_label := case pl.data->>'what' when 'coffee' then 'Coffee' when 'eat' then 'Food' when 'drinks' then 'Drinks'
               when 'clubs' then 'Clubs' when 'culture' then 'Culture' when 'event' then 'An event' else 'A plan' end;
  begin v_day := (pl.data->>'day')::date; exception when others then v_day := null; end;
  if v_day is not null then
    v_label := v_label || case when v_day = v_today then ' tonight' when v_day = v_today + 1 then ' tomorrow'
                               else ' on ' || to_char(v_day, 'FMDay FMDD Mon') end;
  end if;
  if coalesce(pl.data->>'time', '') ~ '^\d\d:\d\d$' then v_label := v_label || ' at ' || (pl.data->>'time'); end if;

  v_title := coalesce((select name from groups where id = pl.group_id), 'Concit');
  if p_kind = 'new' then
    v_body := coalesce((select name from profiles where id = auth.uid()), 'Someone') || ' started a plan: ' || v_label || '. Tap to vote.';
  else
    v_body := 'The votes are in for ' || lower(left(v_label, 1)) || substr(v_label, 2) || '. Tap to see where you''re going.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)), '[]'::jsonb)
  into v_subs
  from push_subs s
  where s.user_id::text <> v_me and (pl.data->'people') ? s.user_id::text and not v_out ? s.user_id::text;

  return jsonb_build_object('title', left(v_title, 60), 'body', left(v_body, 160),
                            'url', '/?plan=' || pl.code, 'tag', p_kind || '-' || pl.code, 'subs', v_subs);
end;
$$;

-- Called by api/push.js when a push service says a phone's address is no longer valid.
create or replace function push_drop(p_endpoints text[], p_secret text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_secret is null or not exists (select 1 from push_config where secret = p_secret) then raise exception 'not allowed'; end if;
  delete from push_subs where endpoint = any(p_endpoints);
end;
$$;

-- Asking for more options clears the votes, so the "everyone has voted" notification can go out again.
create or replace function update_plan(p_code text, p_data jsonb, p_reset_votes boolean default false)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if pg_column_size(p_data) > 20000 then raise exception 'plan too large'; end if;
  update plans
  set data = (p_data - 'votes' - 'names' - 'group_id' - 'group_name' - 'out' - 'left' - 'mine')
             || jsonb_build_object('people', data->'people', 'out', coalesce(data->'out', '[]'::jsonb),
                                   'left', coalesce(data->'left', '[]'::jsonb), 'v', 2),
      notified = case when p_reset_votes then array_remove(notified, 'done') else notified end
  where code = p_code and (data->'people') ? auth.uid()::text;
  if not found then raise exception 'not part of this plan'; end if;
  if p_reset_votes then
    delete from votes where plan_code = p_code;
  end if;
end;
$$;

revoke all on function push_subscribe(text, text, text) from public, anon;
revoke all on function push_unsubscribe(text) from public, anon;
revoke all on function push_claim(text, text, text) from public, anon;
revoke all on function push_drop(text[], text) from public;
grant execute on function push_subscribe(text, text, text) to authenticated;
grant execute on function push_unsubscribe(text) to authenticated;
grant execute on function push_claim(text, text, text) to authenticated;
grant execute on function push_drop(text[], text) to anon, authenticated;
