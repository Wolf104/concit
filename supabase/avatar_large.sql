-- A larger copy of each profile picture, fetched only when someone opens it full-size. Run after avatars.sql.

alter table profiles add column if not exists avatar_large text;
-- Up to ~1080px square, so it stays sharp full-screen on high-density phone screens.
alter table profiles drop constraint if exists profiles_avatar_large_check;
alter table profiles add constraint profiles_avatar_large_check
  check (avatar_large is null or (char_length(avatar_large) <= 900000 and avatar_large ~ '^data:image/(jpeg|webp|png);base64,[A-Za-z0-9+/=]+$'));

drop function if exists set_avatar(text);
create or replace function set_avatar(p_data text, p_large text default null)
returns bigint
language plpgsql security definer set search_path = public
as $$
declare
  v_at timestamptz := case when p_data is null then null else clock_timestamp() end;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  update profiles set avatar = p_data, avatar_large = case when p_data is null then null else p_large end, avatar_at = v_at
  where id = auth.uid();
  return case when v_at is null then null else (extract(epoch from v_at) * 1000)::bigint end;
end;
$$;

-- Same rule as get_avatars: only yourself and people who share a group with you.
create or replace function get_avatar_large(p_id uuid)
returns text
language sql stable security definer set search_path = public
as $$
  select coalesce(p.avatar_large, p.avatar)
  from profiles p
  where p.id = p_id and (p.id = auth.uid() or exists (
    select 1 from group_members a join group_members b on a.group_id = b.group_id
    where a.user_id = auth.uid() and b.user_id = p.id));
$$;

revoke all on function set_avatar(text, text) from public, anon;
revoke all on function get_avatar_large(uuid) from public, anon;
grant execute on function set_avatar(text, text), get_avatar_large(uuid) to authenticated;
