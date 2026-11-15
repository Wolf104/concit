-- Group photos. Run after avatar_large.sql and plan_manage.sql.
-- Any member can set or remove the group's photo; only members can fetch it.
alter table groups add column if not exists avatar text
  check (avatar is null or (char_length(avatar) <= 120000 and avatar ~ '^data:image/(jpeg|webp|png);base64,[A-Za-z0-9+/=]+$'));
alter table groups add column if not exists avatar_large text
  check (avatar_large is null or (char_length(avatar_large) <= 900000 and avatar_large ~ '^data:image/(jpeg|webp|png);base64,[A-Za-z0-9+/=]+$'));
alter table groups add column if not exists avatar_at timestamptz;

create or replace function set_group_avatar(p_group uuid, p_data text, p_large text default null)
returns bigint
language plpgsql security definer set search_path = public
as $$
declare
  v_at timestamptz := case when p_data is null then null else clock_timestamp() end;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  if not is_member(p_group) then raise exception 'not in this group'; end if;
  update groups set avatar = p_data, avatar_large = case when p_data is null then null else p_large end, avatar_at = v_at where id = p_group;
  return case when v_at is null then null else (extract(epoch from v_at) * 1000)::bigint end;
end;
$$;

create or replace function get_group_avatars(p_ids uuid[])
returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_object_agg(g.id, jsonb_build_object('v', (extract(epoch from g.avatar_at) * 1000)::bigint, 'img', g.avatar)), '{}'::jsonb)
  from groups g
  where g.id = any(p_ids[1:100]) and g.avatar is not null and is_member(g.id);
$$;

create or replace function get_group_avatar_large(p_id uuid)
returns text
language sql stable security definer set search_path = public
as $$ select coalesce(g.avatar_large, g.avatar) from groups g where g.id = p_id and is_member(g.id); $$;

-- my_groups: adds 'av', the group photo's version (null = none).
create or replace function my_groups()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', g.id, 'name', g.name, 'invite_code', g.invite_code,
    'av', (extract(epoch from g.avatar_at) * 1000)::bigint,
    'members', (select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name,
                  'online', coalesce(p.last_seen > now() - interval '60 seconds', false),
                  'av', (extract(epoch from p.avatar_at) * 1000)::bigint) order by p.name)
                from group_members m join profiles p on p.id = m.user_id where m.group_id = g.id),
    'unread', (select count(*) from messages x where x.group_id = g.id and x.id > me.last_read and x.user_id <> auth.uid()),
    'last', (select jsonb_build_object('name', p.name, 'body', left(x.body, 80), 'mine', x.user_id = auth.uid())
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

revoke all on function set_group_avatar(uuid, text, text) from public, anon;
revoke all on function get_group_avatars(uuid[]) from public, anon;
revoke all on function get_group_avatar_large(uuid) from public, anon;
grant execute on function set_group_avatar(uuid, text, text), get_group_avatars(uuid[]), get_group_avatar_large(uuid) to authenticated;
