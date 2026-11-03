-- Accounts and groups. Everything here needs a logged-in user.
-- Nobody reads these tables directly: all access goes through the functions below.

drop function if exists create_plan(jsonb);
drop function if exists add_person(text, text);
drop function if exists cast_vote(text, text, text, smallint);

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 30),
  created_at timestamptz not null default now()
);

create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  invite_code text not null unique default left(replace(gen_random_uuid()::text, '-', ''), 12),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists group_members (
  group_id uuid not null references groups(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

alter table plans add column if not exists group_id uuid references groups(id) on delete cascade;
alter table plans add column if not exists created_by uuid references profiles(id) on delete set null;

alter table profiles enable row level security;
alter table groups enable row level security;
alter table group_members enable row level security;

create index if not exists plans_group_idx on plans(group_id);
create index if not exists group_members_user_idx on group_members(user_id);

-- Every new account gets a profile with the name given at sign-up.
create or replace function handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into profiles (id, name)
  values (new.id, left(coalesce(nullif(trim(new.raw_user_meta_data->>'name'), ''), 'New member'), 30))
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

create or replace function is_member(p_group uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from group_members where group_id = p_group and user_id = auth.uid());
$$;

create or replace function create_group(p_name text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
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
  select * into g from groups where invite_code = lower(trim(p_code));
  if not found then return null; end if;
  insert into group_members (group_id, user_id) values (g.id, auth.uid()) on conflict do nothing;
  return jsonb_build_object('id', g.id, 'name', g.name);
end;
$$;

create or replace function leave_group(p_group uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  delete from group_members where group_id = p_group and user_id = auth.uid();
  delete from groups g where g.id = p_group and not exists (select 1 from group_members m where m.group_id = g.id);
end;
$$;

-- Your groups, their members and their current plans.
create or replace function my_groups()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', g.id, 'name', g.name, 'invite_code', g.invite_code,
    'members', (select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name) order by p.name)
                from group_members m join profiles p on p.id = m.user_id where m.group_id = g.id),
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
  values (v_code, (p_data - 'votes') || jsonb_build_object('people', v_people, 'v', 2), p_group, auth.uid());
  return v_code;
end;
$$;

-- Older plans from before accounts have no 'v' and are treated as expired.
create or replace function get_plan(p_code text)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select p.data || jsonb_build_object(
    'group_id', p.group_id,
    'group_name', (select name from groups where id = p.group_id),
    'votes', coalesce((select jsonb_object_agg(person, picks) from (
        select person, jsonb_object_agg(place_id, value) as picks from votes where plan_code = p.code group by person
      ) v), '{}'::jsonb),
    'names', coalesce((select jsonb_object_agg(pr.id::text, pr.name) from profiles pr
        where (p.data->'people') ? pr.id::text), '{}'::jsonb))
  from plans p
  where p.code = p_code and auth.uid() is not null and p.data ? 'v'
    and (p.group_id is null or is_member(p.group_id));
$$;

-- Adds you to a plan you open by link, or to a group plan made before you joined.
create or replace function join_plan(p_code text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  update plans p
  set data = jsonb_set(p.data, '{people}', (p.data->'people') || to_jsonb(auth.uid()::text))
  where p.code = p_code and p.data ? 'v'
    and (p.group_id is null or is_member(p.group_id))
    and not (p.data->'people') ? auth.uid()::text
    and not coalesce((p.data->>'finished')::boolean, false)
    and jsonb_array_length(p.data->'people') < 50;
end;
$$;

create or replace function cast_vote(p_code text, p_place text, p_value smallint)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from plans where code = p_code and (data->'people') ? auth.uid()::text) then
    raise exception 'not part of this plan';
  end if;
  insert into votes (plan_code, person, place_id, value)
  values (p_code, auth.uid()::text, left(p_place, 40), p_value)
  on conflict (plan_code, person, place_id) do update set value = excluded.value;
end;
$$;

-- The server keeps control of who is in a plan.
create or replace function update_plan(p_code text, p_data jsonb, p_reset_votes boolean default false)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if pg_column_size(p_data) > 20000 then raise exception 'plan too large'; end if;
  update plans
  set data = (p_data - 'votes' - 'names' - 'group_id' - 'group_name') || jsonb_build_object('people', data->'people', 'v', 2)
  where code = p_code and (data->'people') ? auth.uid()::text;
  if not found then raise exception 'not part of this plan'; end if;
  if p_reset_votes then
    delete from votes where plan_code = p_code;
  end if;
end;
$$;

revoke all on function handle_new_user() from public, anon, authenticated;
revoke all on function is_member(uuid) from public, anon;
revoke all on function create_group(text) from public, anon;
revoke all on function join_group(text) from public, anon;
revoke all on function leave_group(uuid) from public, anon;
revoke all on function my_groups() from public, anon;
revoke all on function create_plan(jsonb, uuid) from public, anon;
revoke all on function get_plan(text) from public, anon;
revoke all on function join_plan(text) from public, anon;
revoke all on function cast_vote(text, text, smallint) from public, anon;
revoke all on function update_plan(text, jsonb, boolean) from public, anon;
grant execute on function is_member(uuid), create_group(text), join_group(text), leave_group(uuid), my_groups(),
  create_plan(jsonb, uuid), get_plan(text), join_plan(text), cast_vote(text, text, smallint), update_plan(text, jsonb, boolean)
  to authenticated;
