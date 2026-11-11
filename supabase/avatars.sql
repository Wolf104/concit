-- Profile pictures. Run after presence.sql.
-- The app shrinks the photo to a small square JPEG before upload and stores it on the profile.
-- Only you and people who share a group with you can fetch it. It is deleted with the account.

alter table profiles add column if not exists avatar text
  check (avatar is null or (char_length(avatar) <= 120000 and avatar ~ '^data:image/(jpeg|webp|png);base64,[A-Za-z0-9+/=]+$'));
alter table profiles add column if not exists avatar_at timestamptz;

-- Pass null to remove your picture.
create or replace function set_avatar(p_data text)
returns bigint
language plpgsql security definer set search_path = public
as $$
declare
  v_at timestamptz := case when p_data is null then null else clock_timestamp() end;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  update profiles set avatar = p_data, avatar_at = v_at where id = auth.uid();
  return case when v_at is null then null else (extract(epoch from v_at) * 1000)::bigint end;
end;
$$;

-- Pictures for the given people, limited to yourself and people in your groups.
create or replace function get_avatars(p_ids uuid[])
returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_object_agg(p.id, jsonb_build_object('v', (extract(epoch from p.avatar_at) * 1000)::bigint, 'img', p.avatar)), '{}'::jsonb)
  from profiles p
  where p.id = any(p_ids[1:100]) and p.avatar is not null
    and (p.id = auth.uid() or exists (
      select 1 from group_members a join group_members b on a.group_id = b.group_id
      where a.user_id = auth.uid() and b.user_id = p.id));
$$;

revoke all on function set_avatar(text) from public, anon;
revoke all on function get_avatars(uuid[]) from public, anon;
grant execute on function set_avatar(text), get_avatars(uuid[]) to authenticated;

-- 'av' is a version number for each person's picture (null = none), so the app only downloads a picture when it changes.
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
           'typing', coalesce(m.typing_at > now() - interval '6 seconds', false),
           'read', m.last_read,
           'av', (extract(epoch from p.avatar_at) * 1000)::bigint) order by p.name), '[]'::jsonb)
  into v_people
  from group_members m join profiles p on p.id = m.user_id
  where m.group_id = p_group and m.user_id <> auth.uid();
  return jsonb_build_object('messages', v_msgs, 'people', v_people);
end;
$$;

create or replace function my_groups()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', g.id, 'name', g.name, 'invite_code', g.invite_code,
    'members', (select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name,
                  'online', coalesce(p.last_seen > now() - interval '60 seconds', false),
                  'av', (extract(epoch from p.avatar_at) * 1000)::bigint) order by p.name)
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

-- Your own picture version, for the account screen and header.
create or replace function my_avatar()
returns bigint
language sql stable security definer set search_path = public
as $$
  select (extract(epoch from avatar_at) * 1000)::bigint from profiles where id = auth.uid();
$$;
revoke all on function my_avatar() from public, anon;
grant execute on function my_avatar() to authenticated;
