-- Boards: a named collection of places, events and sights that belongs to one account.
-- The table is locked; the app reaches it only through these functions.
-- A board's id is 16 random hex characters made on the phone. Knowing the id is what lets someone look at a board
-- (get_board, open to anyone, logged in or not); only the owner can change or delete it. Guests can't keep boards.
create table if not exists public.boards (
  id text primary key check (id ~ '^[a-f0-9]{16}$'),
  owner uuid not null references auth.users(id) on delete cascade,
  name text not null,
  items jsonb not null default '[]'::jsonb,   -- [{ "id": "<place, event or sight id>", "note": "<optional>" }]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.boards enable row level security;
create index if not exists boards_owner_idx on public.boards (owner);

create or replace function public.my_boards() returns jsonb
language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'items', items) order by updated_at desc), '[]'::jsonb)
  from boards where owner = auth.uid();
$$;

create or replace function public.save_board(p_id text, p_name text, p_items jsonb) returns void
language plpgsql security definer set search_path to 'public' as $$
declare v_owner uuid; v_items jsonb; v_name text := left(btrim(coalesce(p_name, '')), 60);
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  if is_guest() then raise exception 'guests cannot keep boards'; end if;
  if p_id is null or p_id !~ '^[a-f0-9]{16}$' then raise exception 'bad board id'; end if;
  if v_name = '' then v_name := 'Saved'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 200 or length(p_items::text) > 60000 then
    raise exception 'bad items';
  end if;
  -- keep only what a board item may hold, whatever was sent
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', e->>'id', 'note', nullif(left(btrim(coalesce(e->>'note', '')), 200), ''))) order by n), '[]'::jsonb)
    into v_items
  from jsonb_array_elements(p_items) with ordinality as t(e, n)
  where jsonb_typeof(e) = 'object' and jsonb_typeof(e->'id') = 'string' and length(e->>'id') between 1 and 120;
  select owner into v_owner from boards where id = p_id;
  if found then
    if v_owner <> auth.uid() then raise exception 'not your board'; end if;
    update boards set name = v_name, items = v_items, updated_at = now() where id = p_id;
  else
    if (select count(*) from boards where owner = auth.uid()) >= 30 then raise exception 'too many boards'; end if;
    insert into boards (id, owner, name, items) values (p_id, auth.uid(), v_name, v_items);
  end if;
end;
$$;

create or replace function public.delete_board(p_id text) returns void
language sql security definer set search_path to 'public' as $$
  delete from boards where id = p_id and owner = auth.uid();
$$;

create or replace function public.get_board(p_id text) returns jsonb
language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object('id', b.id, 'name', b.name, 'items', b.items,
    'owner', coalesce(nullif(split_part(btrim(p.name), ' ', 1), ''), 'Someone'),
    'mine', b.owner = auth.uid())
  from boards b left join profiles p on p.id = b.owner
  where b.id = p_id and p_id ~ '^[a-f0-9]{16}$';
$$;

revoke all on function public.my_boards() from public, anon;
revoke all on function public.save_board(text, text, jsonb) from public, anon;
revoke all on function public.delete_board(text) from public, anon;
revoke all on function public.get_board(text) from public;
grant execute on function public.my_boards() to authenticated;
grant execute on function public.save_board(text, text, jsonb) to authenticated;
grant execute on function public.delete_board(text) to authenticated;
grant execute on function public.get_board(text) to anon, authenticated;
