-- Guests (people who voted from a plan link without an account) can only vote. Run after analytics.sql.
-- The app already hides everything else from them; these checks refuse it in the database too.
-- Chat, reactions, group photos, renaming and muting need no check of their own: they all require being
-- in a group, and a guest can no longer create or join one.

create or replace function is_guest()
returns boolean
language sql stable set search_path = public
as $$ select coalesce((auth.jwt()->>'is_anonymous')::boolean, false); $$;

create or replace function create_group(p_name text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  if is_guest() then raise exception 'account required'; end if;
  insert into groups (name, created_by) values (left(trim(p_name), 40), auth.uid()) returning id into v_id;
  insert into group_members (group_id, user_id) values (v_id, auth.uid());
  return v_id;
end;
$$;

create or replace function join_group(p_code text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  g groups;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  if is_guest() then raise exception 'account required'; end if;
  select * into g from groups where invite_code = lower(trim(p_code));
  if not found then return null; end if;
  insert into group_members (group_id, user_id) values (g.id, auth.uid()) on conflict do nothing;
  return jsonb_build_object('id', g.id, 'name', g.name);
end;
$$;

create or replace function create_plan(p_data jsonb, p_group uuid default null)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_code text := left(replace(gen_random_uuid()::text, '-', ''), 16);
  v_people jsonb;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  if is_guest() then raise exception 'account required'; end if;
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

create or replace function set_avatar(p_data text, p_large text default null)
returns bigint
language plpgsql security definer set search_path = public
as $$
declare
  v_at timestamptz := case when p_data is null then null else clock_timestamp() end;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  if is_guest() and p_data is not null then raise exception 'account required'; end if;
  update profiles set avatar = p_data, avatar_large = case when p_data is null then null else p_large end, avatar_at = v_at
  where id = auth.uid();
  return case when v_at is null then null else (extract(epoch from v_at) * 1000)::bigint end;
end;
$$;

revoke all on function is_guest() from public, anon;
grant execute on function is_guest() to authenticated;
