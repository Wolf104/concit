-- Online status and "typing…" for group chat. Run after chat.sql.
-- Someone counts as online if their app checked in within the last minute,
-- and as typing if they typed in that group's chat within the last 6 seconds.

alter table profiles add column if not exists last_seen timestamptz;
alter table group_members add column if not exists typing_at timestamptz;

-- Called every so often while the app is open.
create or replace function heartbeat()
returns void
language sql security definer set search_path = public
as $$
  update profiles set last_seen = now() where id = auth.uid();
$$;

create or replace function set_typing(p_group uuid, p_on boolean)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null or not is_member(p_group) then return; end if;
  update group_members set typing_at = case when p_on then now() end
  where group_id = p_group and user_id = auth.uid();
  update profiles set last_seen = now() where id = auth.uid();
end;
$$;

-- Everything the open chat needs in one call: new messages and who is online or typing.
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
  update group_members set last_read = greatest(last_read, coalesce((select max(id) from messages where group_id = p_group), 0))
  where group_id = p_group and user_id = auth.uid();
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name,
           'online', coalesce(p.last_seen > now() - interval '60 seconds', false),
           'typing', coalesce(m.typing_at > now() - interval '6 seconds', false)) order by p.name), '[]'::jsonb)
  into v_people
  from group_members m join profiles p on p.id = m.user_id
  where m.group_id = p_group and m.user_id <> auth.uid();
  return jsonb_build_object('messages', v_msgs, 'people', v_people);
end;
$$;

revoke all on function heartbeat() from public, anon;
revoke all on function set_typing(uuid, boolean) from public, anon;
revoke all on function chat_poll(uuid, bigint) from public, anon;
grant execute on function heartbeat(), set_typing(uuid, boolean), chat_poll(uuid, bigint) to authenticated;

-- my_groups, now saying which members are online.
create or replace function my_groups()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', g.id, 'name', g.name, 'invite_code', g.invite_code,
    'members', (select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name,
                  'online', coalesce(p.last_seen > now() - interval '60 seconds', false)) order by p.name)
                from group_members m join profiles p on p.id = m.user_id where m.group_id = g.id),
    'unread', (select count(*) from messages x where x.group_id = g.id and x.id > me.last_read and x.user_id <> auth.uid()),
    'last', (select jsonb_build_object('name', p.name, 'body', left(x.body, 80), 'mine', x.user_id = auth.uid())
             from messages x left join profiles p on p.id = x.user_id where x.group_id = g.id order by x.id desc limit 1),
    'plans', (select coalesce(jsonb_agg(jsonb_build_object(
                  'code', pl.code, 'what', pl.data->>'what', 'day', pl.data->>'day',
                  'finished', coalesce((pl.data->>'finished')::boolean, false),
                  'by', (select name from profiles where id = pl.created_by),
                  'people', jsonb_array_length(pl.data->'people'),
                  'options', jsonb_array_length(pl.data->'options'),
                  'in_plan', (pl.data->'people') ? auth.uid()::text,
                  'mine', (select count(*) from votes v where v.plan_code = pl.code and v.person = auth.uid()::text),
                  'done', (select count(*) from (select person from votes v where v.plan_code = pl.code group by person
                           having count(*) >= jsonb_array_length(pl.data->'options')) d)
                ) order by pl.created_at desc), '[]'::jsonb)
                from plans pl where pl.group_id = g.id and pl.data->>'day' >= (current_date - 1)::text)
  ) order by g.name), '[]'::jsonb)
  from groups g join group_members me on me.group_id = g.id and me.user_id = auth.uid();
$$;
