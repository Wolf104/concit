-- Notifications for chat messages. Run after push.sql.
-- Every message notifies the other members of the group, except anyone who has that chat open right now.

alter table group_members add column if not exists chat_at timestamptz;   -- last time this person had the chat open
alter table messages add column if not exists notified boolean not null default false;

-- chat_poll: same as before, and it now notes that the chat is open (the app calls this every few seconds while it is).
create or replace function chat_poll(p_group uuid, p_after bigint default 0)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_msgs jsonb;
  v_people jsonb;
begin
  if auth.uid() is null or not is_member(p_group) then return null; end if;
  update profiles set last_seen = now() where id = auth.uid();
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'body', x.body, 'at', x.created_at, 'by', x.user_id, 'name', p.name) order by x.id), '[]'::jsonb)
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
  return jsonb_build_object('messages', v_msgs, 'people', v_people);
end;
$$;

-- Called by api/push.js for the person who just sent message p_id. Sends once per message,
-- only for a message of their own from the last two minutes. Returns null if there is nothing to send.
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
  where s.user_id <> auth.uid() and coalesce(gm.chat_at < now() - interval '8 seconds', true);

  return jsonb_build_object(
    'title', left(coalesce((select name from groups where id = m.group_id), 'Concit'), 60),
    'body', left(coalesce((select name from profiles where id = m.user_id), 'Someone') || ': ' || regexp_replace(m.body, '\s+', ' ', 'g'), 160),
    'url', '/?chat=' || m.group_id, 'tag', 'msg-' || m.id, 'subs', v_subs);
end;
$$;

revoke all on function push_chat(bigint, text) from public, anon;
grant execute on function push_chat(bigint, text) to authenticated;
