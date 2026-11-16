-- Usage analytics, kept in Concit's own database (no outside tracker, no cookies).
-- The app records a short list of actions through track(); only people listed in `admins` can read the totals, through admin_stats().
-- To make someone an admin: insert into admins (user_id) select id from auth.users where email = '<their email>';

create table if not exists analytics (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid references profiles(id) on delete set null,   -- emptied if the account is deleted
  guest boolean not null default false,
  event text not null,
  ref text,                                                  -- a place, event, plan or tab, depending on the action
  props jsonb not null default '{}'
);
create index if not exists analytics_at on analytics (at);
create index if not exists analytics_user_at on analytics (user_id, at);
create index if not exists analytics_event_at on analytics (event, at);
alter table analytics enable row level security;

create table if not exists admins (user_id uuid primary key references profiles(id) on delete cascade);
alter table admins enable row level security;

create or replace function track(p_event text, p_ref text default null, p_props jsonb default '{}')
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then return; end if;
  if p_event not in ('app_open', 'tab_view', 'book_tap', 'directions_tap', 'website_tap', 'share', 'guest_join', 'guest_upgrade', 'push_on') then return; end if;
  if pg_column_size(coalesce(p_props, '{}'::jsonb)) > 600 or length(coalesce(p_ref, '')) > 80 then return; end if;
  -- A runaway phone can't flood the table.
  if (select count(*) from analytics where user_id = auth.uid() and at > now() - interval '1 hour') >= 300 then return; end if;
  insert into analytics (user_id, guest, event, ref, props)
  values (auth.uid(), coalesce((auth.jwt()->>'is_anonymous')::boolean, false), p_event, nullif(p_ref, ''), coalesce(p_props, '{}'::jsonb));
end;
$$;

create or replace function is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from admins where user_id = auth.uid()); $$;

-- Totals for the Stats screen. Days are counted in Milan time.
create or replace function admin_stats(p_days int default 14)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  n int := least(greatest(coalesce(p_days, 14), 1), 90);
  v_today date := (now() at time zone 'Europe/Rome')::date;
  v_from timestamptz := ((v_today - (n - 1))::timestamp at time zone 'Europe/Rome');
begin
  if not is_admin() then raise exception 'not allowed'; end if;
  return jsonb_build_object(
    'days', n,
    'totals', jsonb_build_object(
      'people', (select count(*) from profiles),
      'guests', (select count(*) from auth.users where is_anonymous),
      'groups', (select count(*) from groups),
      'plans', (select count(*) from plans where data ? 'v'),
      'decided', (select count(*) from plans where data ? 'v' and (coalesce((data->>'finished')::boolean, false) or 'done' = any(notified))),
      'votes', (select count(*) from votes),
      'messages', (select count(*) from messages where kind is null)),
    'period', jsonb_build_object(
      'active', (select count(distinct user_id) from analytics where at >= v_from and user_id is not null),
      'new_people', (select count(*) from profiles where created_at >= v_from),
      'plans', (select count(*) from plans where data ? 'v' and created_at >= v_from),
      'decided', (select count(*) from plans where data ? 'v' and created_at >= v_from and (coalesce((data->>'finished')::boolean, false) or 'done' = any(notified))),
      'messages', (select count(*) from messages where kind is null and created_at >= v_from),
      'book_taps', (select count(*) from analytics where event = 'book_tap' and at >= v_from),
      'book_plans', (select count(distinct props->>'plan') from analytics where event = 'book_tap' and at >= v_from and props ? 'plan'),
      'directions', (select count(*) from analytics where event = 'directions_tap' and at >= v_from),
      'shares', (select count(*) from analytics where event = 'share' and at >= v_from),
      'guest_joins', (select count(*) from analytics where event = 'guest_join' and at >= v_from),
      'guest_upgrades', (select count(*) from analytics where event = 'guest_upgrade' and at >= v_from),
      'push_on', (select count(*) from analytics where event = 'push_on' and at >= v_from)),
    'daily', (select jsonb_agg(jsonb_build_object('day', d::date,
                'active', (select count(distinct user_id) from analytics a where a.user_id is not null and (a.at at time zone 'Europe/Rome')::date = d::date),
                'plans', (select count(*) from plans p where p.data ? 'v' and (p.created_at at time zone 'Europe/Rome')::date = d::date),
                'books', (select count(*) from analytics a where a.event = 'book_tap' and (a.at at time zone 'Europe/Rome')::date = d::date)) order by d)
              from generate_series(v_today - (n - 1), v_today, interval '1 day') d),
    'top_places', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
                     select coalesce(max(props->>'name'), ref) as name, count(*) as taps, count(distinct user_id) as people
                     from analytics where event = 'book_tap' and at >= v_from group by ref order by count(*) desc limit 15) x),
    'tabs', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
               select ref as tab, count(*) as views, count(distinct user_id) as people
               from analytics where event = 'tab_view' and at >= v_from group by ref order by count(*) desc) x));
end;
$$;

revoke all on function track(text, text, jsonb) from public, anon;
revoke all on function is_admin() from public, anon;
revoke all on function admin_stats(int) from public, anon;
grant execute on function track(text, text, jsonb), is_admin(), admin_stats(int) to authenticated;
