-- Account settings: change your name, delete your account. Run after accounts.sql.

create or replace function set_name(p_name text)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_name text := left(trim(p_name), 30);
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  if v_name is null or v_name = '' then raise exception 'name required'; end if;
  update profiles set name = v_name where id = auth.uid();
  return v_name;
end;
$$;

-- Removes everything tied to you: votes, your place in plans, group memberships and the account itself.
-- Groups left with nobody in them are deleted with their plans.
create or replace function delete_account()
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'login required'; end if;
  delete from votes where person = v_uid::text;
  update plans set data = jsonb_set(data, '{people}', (data->'people') - v_uid::text)
  where (data->'people') ? v_uid::text;
  delete from group_members where user_id = v_uid;
  delete from groups g where not exists (select 1 from group_members m where m.group_id = g.id);
  delete from plans p where p.group_id is null and p.data ? 'v' and jsonb_array_length(p.data->'people') = 0;
  delete from auth.users where id = v_uid;
end;
$$;

revoke all on function set_name(text) from public, anon;
revoke all on function delete_account() from public, anon;
grant execute on function set_name(text), delete_account() to authenticated;
