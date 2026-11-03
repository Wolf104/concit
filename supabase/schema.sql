-- Concit database. Run this file first, then accounts.sql.

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
-- All access goes through the functions in accounts.sql, which need a logged-in user.
alter table plans enable row level security;
alter table votes enable row level security;

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

-- Typical price per unit, for example {"meal":30} or {"drink":14,"meal":30}.
alter table places add column if not exists costs jsonb not null default '{}';
