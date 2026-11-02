-- Concit database. Paste this whole file into the Supabase SQL Editor and press Run.
-- Safe to run again: it only creates what is missing and replaces the functions.

create table if not exists plans (
  code text primary key,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists votes (
  plan_code text not null references plans(code) on delete cascade,
  person text not null,
  place_id text not null,
  value smallint not null check (value in (0, 1)),
  primary key (plan_code, person, place_id)
);

-- Nobody reads or writes these tables directly from the app.
-- All access goes through the functions below, and each one needs a plan's code,
-- so people can only reach a plan if they have its link.
alter table plans enable row level security;
alter table votes enable row level security;

create or replace function create_plan(p_data jsonb)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_code text;
begin
  if pg_column_size(p_data) > 20000 then
    raise exception 'plan too large';
  end if;
  v_code := left(replace(gen_random_uuid()::text, '-', ''), 16);
  insert into plans (code, data) values (v_code, p_data);
  return v_code;
end;
$$;

create or replace function get_plan(p_code text)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select p.data || jsonb_build_object('votes', coalesce((
    select jsonb_object_agg(person, picks)
    from (
      select person, jsonb_object_agg(place_id, value) as picks
      from votes where plan_code = p.code group by person
    ) v
  ), '{}'::jsonb))
  from plans p where p.code = p_code;
$$;

create or replace function add_person(p_code text, p_name text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_name text := left(trim(p_name), 20);
begin
  if v_name = '' then
    raise exception 'name required';
  end if;
  update plans
  set data = jsonb_set(data, '{people}', (data->'people') || to_jsonb(v_name))
  where code = p_code
    and not (data->'people') ? v_name
    and jsonb_array_length(data->'people') < 30;
end;
$$;

create or replace function cast_vote(p_code text, p_person text, p_place text, p_value smallint)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from plans where code = p_code and (data->'people') ? p_person) then
    raise exception 'unknown plan or person';
  end if;
  insert into votes (plan_code, person, place_id, value)
  values (p_code, p_person, left(p_place, 40), p_value)
  on conflict (plan_code, person, place_id) do update set value = excluded.value;
end;
$$;

create or replace function update_plan(p_code text, p_data jsonb, p_reset_votes boolean default false)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if pg_column_size(p_data) > 20000 then
    raise exception 'plan too large';
  end if;
  update plans set data = p_data where code = p_code;
  if p_reset_votes then
    delete from votes where plan_code = p_code;
  end if;
end;
$$;

revoke all on function create_plan(jsonb) from public;
revoke all on function get_plan(text) from public;
revoke all on function add_person(text, text) from public;
revoke all on function cast_vote(text, text, text, smallint) from public;
revoke all on function update_plan(text, jsonb, boolean) from public;
grant execute on function create_plan(jsonb) to anon, authenticated;
grant execute on function get_plan(text) to anon, authenticated;
grant execute on function add_person(text, text) to anon, authenticated;
grant execute on function cast_vote(text, text, text, smallint) to anon, authenticated;
grant execute on function update_plan(text, jsonb, boolean) to anon, authenticated;

-- Hotspots. Everyone can read these. Edit them in the Supabase Table Editor.
create table if not exists places (
  id text primary key,
  name text not null,
  kind text not null,
  zone text not null,
  addr text not null,
  metro jsonb not null default '[]',
  price smallint not null check (price between 1 and 4),
  hot smallint not null check (hot between 0 and 3),
  why text not null,
  detail text not null,
  src text not null,
  closed jsonb not null default '[]',
  occ jsonb not null default '[]',
  lat double precision,
  lng double precision
);

alter table places enable row level security;
drop policy if exists "Anyone can read places" on places;
create policy "Anyone can read places" on places for select to anon, authenticated using (true);
