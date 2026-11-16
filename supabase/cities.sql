-- More than one city. Every place and event belongs to a city; everything that existed before this is Milan.
-- The app asks for one city at a time (places?city=eq.madrid) and falls back to "everything is Milan" if the column is missing.
alter table public.places add column if not exists city text not null default 'milan';
alter table public.events add column if not exists city text not null default 'milan';
create index if not exists places_city_idx on public.places (city);
create index if not exists events_city_idx on public.events (city, end_date);

-- Madrid was loaded on 16 Nov 2026 from supabase/seed/madrid_places_2026-11-16.json (1,708 places, built by
-- seed/build_madrid_places.py from Google Maps listings) and seed/madrid_events_2026-11-16.json (519 events).
-- The load, run once with the http add-on switched on and removed straight after:
--   insert into public.places (id,name,kind,zone,addr,metro,price,hot,why,detail,src,closed,occ,lat,lng,costs,cuisine,web,stars,reviews,hours,city)
--   select id,name,kind,zone,addr,metro,price,hot,why,detail,src,closed,occ,lat,lng,costs,cuisine,web,stars,reviews,hours,city
--   from jsonb_to_recordset((select content::jsonb from extensions.http_get('<raw file address>')))
--     as x(id text,name text,kind text,zone text,addr text,metro jsonb,price smallint,hot smallint,why text,detail text,src text,closed jsonb,occ jsonb,
--          lat float8,lng float8,costs jsonb,cuisine jsonb,web text,stars numeric,reviews int,hours text,city text)
--   on conflict (id) do nothing;
-- and the same shape for events (id,name,cat,start_date,end_date,venue,zone,time,price_num,price_text,sold,src,type,descr,wiki,city).
