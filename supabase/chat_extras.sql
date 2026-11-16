-- Chat and groups, round two. Run after chat_push.sql.
-- Plans show up in the chat as cards, messages can be replied to, reacted to and carry a photo,
-- a group can be renamed, and each member can mute a group's chat notifications.

alter table messages add column if not exists kind text check (kind in ('plan', 'result'));  -- null for an ordinary message
alter table messages add column if not exists plan_code text;
alter table messages add column if not exists reply_to bigint;
alter table messages add column if not exists image text check (image is null or length(image) <= 500000);
alter table group_members add column if not exists muted boolean not null default false;

create table if not exists message_reactions (
  message_id bigint not null references messages(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  emoji text not null check (emoji in ('👍', '❤️', '😂', '😮', '😢', '🙏')),
  primary key (message_id, user_id)
);
alter table message_reactions enable row level security;

-- "Food · Wed 18 Nov · 20:30", used for the plan cards' text.
create or replace function plan_label(p jsonb)
returns text
language plpgsql stable set search_path = public
as $$
declare
  v text := case p->>'what' when 'coffee' then 'Coffee' when 'eat' then 'Food' when 'drinks' then 'Drinks'
              when 'clubs' then 'Clubs' when 'culture' then 'Culture' when 'event' then 'An event' else 'A plan' end;
begin
  begin v := v || ' · ' || to_char((p->>'day')::date, 'Dy FMDD Mon'); exception when others then null; end;
  if coalesce(p->>'time', '') ~ '^\d\d:\d\d$' then v := v || ' · ' || (p->>'time'); end if;
  return v;
end;
$$;
revoke all on function plan_label(jsonb) from public, anon, authenticated;

-- A message can now answer another one and carry a photo (a small JPEG the app has already shrunk).
drop function if exists send_message(uuid, text);
create or replace function send_message(p_group uuid, p_body text, p_reply bigint default null, p_image text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_body text := left(trim(coalesce(p_body, '')), 1000);
  m messages;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  if not is_member(p_group) then raise exception 'not a member'; end if;
  if p_image is not null then
    if p_image !~ '^data:image/(jpeg|webp);base64,[A-Za-z0-9+/=]+$' or length(p_image) > 500000 then raise exception 'bad image'; end if;
    if v_body = '' then v_body := 'Photo'; end if;
  end if;
  if v_body = '' then raise exception 'empty message'; end if;
  if (select count(*) from messages where user_id = auth.uid() and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'slow down';
  end if;
  if p_reply is not null and not exists (select 1 from messages where id = p_reply and group_id = p_group) then p_reply := null; end if;
  insert into messages (group_id, user_id, body, reply_to, image) values (p_group, auth.uid(), v_body, p_reply, p_image) returning * into m;
  update group_members set last_read = m.id where group_id = p_group and user_id = auth.uid();
  return jsonb_build_object('id', m.id, 'body', m.body, 'at', m.created_at, 'by', m.user_id,
    'name', (select name from profiles where id = m.user_id), 'reply', m.reply_to, 'img', m.image is not null);
end;
$$;
revoke all on function send_message(uuid, text, bigint, text) from public, anon;
grant execute on function send_message(uuid, text, bigint, text) to authenticated;

-- chat_poll: as before, plus each message's kind, plan, reply and photo flag, and the reactions on the latest 200 messages.
create or replace function chat_poll(p_group uuid, p_after bigint default 0)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_msgs jsonb;
  v_people jsonb;
  v_reacts jsonb;
begin
  if auth.uid() is null or not is_member(p_group) then return null; end if;
  update profiles set last_seen = now() where id = auth.uid();
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'body', x.body, 'at', x.created_at, 'by', x.user_id, 'name', p.name,
           'kind', x.kind, 'plan', x.plan_code, 'reply', x.reply_to, 'img', x.image is not null) order by x.id), '[]'::jsonb)
  into v_msgs
  from (select * from messages where group_id = p_group and id > coalesce(p_after, 0) order by id desc limit 200) x
  left join profiles p on p.id = x.user_id;
  update group_members set last_read = greatest(last_read, coalesce((select max(id) from messages where group_id = p_group), 0)),
                           chat_at = now()
  where group_id = p_group and user_id = auth.uid();
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name,
           'online', coalesce(p.last_seen > now() - interval '60 seconds', false),
           'typing', coalesce(m.typing_at > now() - interval '6 seconds', false),
           'read', m.last_read,
           'av', (extract(epoch from p.avatar_at) * 1000)::bigint) order by p.name), '[]'::jsonb)
  into v_people
  from group_members m join profiles p on p.id = m.user_id
  where m.group_id = p_group and m.user_id <> auth.uid();
  select coalesce(jsonb_agg(jsonb_build_array(r.message_id, r.emoji, r.user_id)), '[]'::jsonb)
  into v_reacts
  from message_reactions r
  where r.message_id in (select id from messages where group_id = p_group order by id desc limit 200);
  return jsonb_build_object('messages', v_msgs, 'people', v_people, 'reacts', v_reacts);
end;
$$;

-- React to a message with one emoji; the same emoji again takes it back.
create or replace function react(p_msg bigint, p_emoji text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  if not exists (select 1 from messages x where x.id = p_msg and is_member(x.group_id)) then raise exception 'not a member'; end if;
  if exists (select 1 from message_reactions where message_id = p_msg and user_id = auth.uid() and emoji = p_emoji) then
    delete from message_reactions where message_id = p_msg and user_id = auth.uid();
  else
    insert into message_reactions (message_id, user_id, emoji) values (p_msg, auth.uid(), p_emoji)
    on conflict (message_id, user_id) do update set emoji = excluded.emoji;
  end if;
end;
$$;

-- A message's photo, for members of its group. Fetched one at a time so opening a chat stays quick.
create or replace function get_message_image(p_id bigint)
returns text
language sql stable security definer set search_path = public
as $$
  select x.image from messages x where x.id = p_id and is_member(x.group_id);
$$;

create or replace function set_group_muted(p_group uuid, p_muted boolean)
returns void
language sql security definer set search_path = public
as $$
  update group_members set muted = coalesce(p_muted, false) where group_id = p_group and user_id = auth.uid();
$$;

create or replace function rename_group(p_group uuid, p_name text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v text := left(trim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), 40);
begin
  if auth.uid() is null or not is_member(p_group) then raise exception 'not a member'; end if;
  if v = '' then raise exception 'empty name'; end if;
  update groups set name = v where id = p_group;
end;
$$;

revoke all on function react(bigint, text) from public, anon;
revoke all on function get_message_image(bigint) from public, anon;
revoke all on function set_group_muted(uuid, boolean) from public, anon;
revoke all on function rename_group(uuid, text) from public, anon;
grant execute on function react(bigint, text), get_message_image(bigint), set_group_muted(uuid, boolean), rename_group(uuid, text) to authenticated;

-- A new group plan posts a card into the group's chat.
create or replace function create_plan(p_data jsonb, p_group uuid default null)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_code text := left(replace(gen_random_uuid()::text, '-', ''), 16);
  v_people jsonb;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  if pg_column_size(p_data) > 20000 then raise exception 'plan too large'; end if;
  if p_group is not null then
    if not is_member(p_group) then raise exception 'not in this group'; end if;
    select jsonb_agg(user_id::text) into v_people from group_members where group_id = p_group;
  else
    v_people := jsonb_build_array(auth.uid()::text);
  end if;
  insert into plans (code, data, group_id, created_by)
  values (v_code, (p_data - 'votes' - 'out' - 'left' - 'mine') || jsonb_build_object('people', v_people, 'out', '[]'::jsonb, 'v', 2), p_group, auth.uid());
  if p_group is not null then
    insert into messages (group_id, user_id, body, kind, plan_code, notified)
    values (p_group, auth.uid(), left('Started a plan: ' || plan_label(p_data), 1000), 'plan', v_code, true);
  end if;
  return v_code;
end;
$$;

-- push_claim: as before, and when a group plan's votes are in it also posts a result card into the chat.
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
  if p_kind = 'done' and pl.group_id is not null then
    insert into messages (group_id, user_id, body, kind, plan_code, notified)
    values (pl.group_id, auth.uid(), left('The votes are in: ' || plan_label(pl.data), 1000), 'result', pl.code, true);
  end if;

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

-- push_chat: as before, but members who muted the group are skipped, and a photo says so.
create or replace function push_chat(p_id bigint, p_secret text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  m messages%rowtype;
  v_subs jsonb;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  if p_secret is null or not exists (select 1 from push_config where secret = p_secret) then raise exception 'not allowed'; end if;
  select * into m from messages where id = p_id and user_id = auth.uid() and not notified
    and created_at > now() - interval '2 minutes' for update;
  if not found or not is_member(m.group_id) then return null; end if;
  update messages set notified = true where id = m.id;

  select coalesce(jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)), '[]'::jsonb)
  into v_subs
  from push_subs s join group_members gm on gm.user_id = s.user_id and gm.group_id = m.group_id
  where s.user_id <> auth.uid() and not gm.muted and coalesce(gm.chat_at < now() - interval '8 seconds', true);

  return jsonb_build_object(
    'title', left(coalesce((select name from groups where id = m.group_id), 'Concit'), 60),
    'body', left(coalesce((select name from profiles where id = m.user_id), 'Someone') || ': '
                 || case when m.image is not null then '📷 ' else '' end || regexp_replace(m.body, '\s+', ' ', 'g'), 160),
    'url', '/?chat=' || m.group_id, 'tag', 'msg-' || m.id, 'subs', v_subs);
end;
$$;

-- my_groups: adds when the last message was sent and whether you muted the group.
create or replace function my_groups()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', g.id, 'name', g.name, 'invite_code', g.invite_code, 'muted', me.muted,
    'av', (extract(epoch from g.avatar_at) * 1000)::bigint,
    'members', (select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name,
                  'online', coalesce(p.last_seen > now() - interval '60 seconds', false),
                  'av', (extract(epoch from p.avatar_at) * 1000)::bigint) order by p.name)
                from group_members m join profiles p on p.id = m.user_id where m.group_id = g.id),
    'unread', (select count(*) from messages x where x.group_id = g.id and x.id > me.last_read and x.user_id <> auth.uid()),
    'last', (select jsonb_build_object('name', p.name, 'body', left(x.body, 80), 'mine', x.user_id = auth.uid(), 'at', x.created_at, 'kind', x.kind)
             from messages x left join profiles p on p.id = x.user_id where x.group_id = g.id order by x.id desc limit 1),
    'plans', (select coalesce(jsonb_agg(jsonb_build_object(
                  'code', pl.code, 'what', pl.data->>'what', 'day', pl.data->>'day', 'time', pl.data->>'time',
                  'cuisine', pl.data->>'cuisine',
                  'finished', coalesce((pl.data->>'finished')::boolean, false),
                  'by', (select name from profiles where id = pl.created_by),
                  'made', pl.created_by = auth.uid(),
                  'people', jsonb_array_length(pl.data->'people') - coalesce(jsonb_array_length(pl.data->'out'), 0),
                  'options', jsonb_array_length(pl.data->'options'),
                  'in_plan', (pl.data->'people') ? auth.uid()::text,
                  'me_out', coalesce(pl.data->'out', '[]'::jsonb) ? auth.uid()::text,
                  'mine', (select count(*) from votes v where v.plan_code = pl.code and v.person = auth.uid()::text),
                  'done', (select count(*) from (select person from votes v where v.plan_code = pl.code
                           and not coalesce(pl.data->'out', '[]'::jsonb) ? v.person group by person
                           having count(*) >= jsonb_array_length(pl.data->'options')) d)
                ) order by pl.created_at desc), '[]'::jsonb)
                from plans pl where pl.group_id = g.id and pl.data->>'day' >= (current_date - 1)::text
                  and not coalesce(pl.data->'left', '[]'::jsonb) ? auth.uid()::text)
  ) order by g.name), '[]'::jsonb)
  from groups g join group_members me on me.group_id = g.id and me.user_id = auth.uid();
$$;
