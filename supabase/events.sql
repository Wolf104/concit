-- Events, readable by everyone, edited in the Table Editor or by loading research files.
create table if not exists events (
  id text primary key,
  name text not null,
  cat text not null check (cat in ('music','sport','art','theatre','festival')),
  start_date text not null,
  end_date text not null,
  venue text not null default '',
  zone text,
  time text not null default '',
  price_num numeric,
  price_text text not null default '',
  sold boolean not null default false,
  src text not null default '',
  checked date not null default current_date
);
create index if not exists events_end_idx on events(end_date);
alter table events enable row level security;
drop policy if exists "Anyone can read events" on events;
create policy "Anyone can read events" on events for select to anon, authenticated using (true);
