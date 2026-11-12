create or replace function public._pn(t text) returns text language sql immutable as $f$
  select btrim(regexp_replace(regexp_replace(lower(translate(t, 'àáâäãåèéêëìíîïòóôöõùúûüçñÀÁÂÄÃÅÈÉÊËÌÍÎÏÒÓÔÖÕÙÚÛÜÇÑøØæ', 'aaaaaaeeeeiiiiooooouuuucnAAAAAAEEEEIIIIOOOOOUUUUCNoOa')),
    '[^a-z0-9]+', ' ', 'g'), '\m(milano|milan|ristorante|pizzeria|trattoria|osteria|bar|caffe|cafe|pasticceria|gelateria|enoteca|the|di|da|del|della|la|il|lo|le|al|e|and|dal|l|d)\M', ' ', 'g'))
$f$;
create or replace function public._pw(t text) returns text language sql immutable as $f$ select split_part(regexp_replace(public._pn(t), '\s+', ' ', 'g'), ' ', 1) $f$;
create or replace function public._import_places(t text) returns int language plpgsql security definer set search_path=public as $$
declare
  l text; f text[]; n int := 0; c int; nm text; pid text; kd text; pr int; pl int; hrs text[]; d text; prev text;
  cl int[]; late bool; i int; cu jsonb; lab text; costs jsonb; occ jsonb; metro jsonb; lines text; mname text; det text;
  dn text[] := array['Mondays','Tuesdays','Wednesdays','Thursdays','Fridays','Saturdays','Sundays'];
  zn jsonb := '{"duomo":"Duomo","brera":"Brera","sempione":"Sempione","garibaldi":"Garibaldi","isola":"Isola","sarpi":"Sarpi","venezia":"Porta Venezia","centrale":"Centrale","cittastudi":"Città Studi","lambrate":"Lambrate","romana":"Porta Romana","lodi":"Lodi","navigli":"Navigli","tortona":"Tortona","bovisa":"Bovisa","bicocca":"Bicocca","sansiro":"San Siro","santagiulia":"Santa Giulia","forlanini":"Forlanini","nolo":"NoLo","assago":"Assago","rho":"Rho Fiera"}';
begin
  foreach l in array string_to_array(t, E'\n') loop
    if btrim(l) = '' then continue; end if;
    f := string_to_array(l, '~');
    nm := f[2]; lab := f[13]; pl := f[8]::int; pr := least(pl, 3);
    pid := 'p:' || coalesce(nullif(f[1], ''), btrim(left(btrim(regexp_replace(lower(translate(nm,
      'àáâäãåèéêëìíîïòóôöõùúûüçñÀÁÂÄÃÅÈÉÊËÌÍÎÏÒÓÔÖÕÙÚÛÜÇÑøØæ', 'aaaaaaeeeeiiiiooooouuuucnAAAAAAEEEEIIIIOOOOOUUUUCNoOa')), '[^a-z0-9]+', '-', 'g'), '-'), 40), '-'));
    kd := case f[3] when 'e' then 'eat' when 'c' then 'cheap' when 'f' then 'cafe' when 'd' then 'drink' when 'w' then 'wine' when 'b' then 'beer' when 'n' then 'club' else 'culture' end;
    costs := case when kd = 'cafe' then jsonb_build_object('coffee', (array[3,5,8,8])[pl])
                  when kd in ('eat','cheap') then jsonb_build_object('meal', (array[15,30,55,90])[pl])
                  when kd in ('drink','wine','beer') then jsonb_build_object('drink', (array[6,10,14,18])[pl])
                  when kd = 'club' then jsonb_build_object('entry', (array[15,20,30,30])[pl])
                  else jsonb_build_object('ticket', (array[5,15,25,25])[pl]) end;
    occ := case kd when 'eat' then '["dinner"]' when 'cheap' then '["cheap"]' when 'cafe' then '["coffee"]' when 'club' then '["night"]'
                   when 'culture' then '["culture"]' else (case when kd = 'beer' and pr = 1 then '["drinks","cheap"]' else '["drinks"]' end) end::jsonb;
    cu := '[]'::jsonb;
    if kd in ('eat','cheap') then
      cu := case
        when lab = 'Pizzeria' then '["pizza"]'
        when lab in ('Sushi','Japanese') then '["sushi"]'
        when lab in ('Ramen bar','Chinese','Thai','Indian','Korean','Vietnamese','Asian') then '["asian"]'
        when lab in ('Mexican','Peruvian','Lebanese','Middle Eastern','Greek','Spanish','African','Turkish','Brazilian') then '["world"]'
        when lab = 'Seafood' then '["seafood"]'
        when lab in ('Steakhouse','Grill') then '["meat"]'
        when lab in ('Burgers','Sandwiches','Kebab','Street food','Deli') then '["street"]'
        when lab in ('Vegan','Vegetarian') then '["veggie"]'
        when lab = 'Fine dining' then '["fine"]'
        when lab in ('Trattoria','Osteria','Italian') then '["pasta"]'
        else '[]' end::jsonb;
      if nm ~* 'milanese|cotolett|meneghin' and not cu ? 'milanese' then cu := cu || '["milanese"]'; end if;
      if pl = 4 and not cu ? 'fine' then cu := cu || '["fine"]'; end if;
    end if;
    metro := '[]'::jsonb;
    if coalesce(f[12], '') <> '' then
      lines := substring(f[12] from '^\d+'); mname := substring(f[12] from '^\d+(.*)$');
      select coalesce(jsonb_agg(jsonb_build_array(ch::int, mname)), '[]') into metro from regexp_split_to_table(lines, '') ch;
    end if;
    cl := '{}'; late := false; det := 'Hours not listed, check before going';
    if coalesce(f[11], '') <> '' then
      hrs := string_to_array(f[11], '|'); prev := null;
      for i in 1..7 loop
        d := case when hrs[i] = '=' then prev else hrs[i] end; prev := d;
        if d = 'C' then cl := cl || (i % 7); elsif d ~ '-0[1-6]' then late := true; end if;
      end loop;
      det := case when cardinality(cl) = 0 then 'Open every day'
                  when cardinality(cl) = 1 then 'Closed on ' || dn[case when cl[1] = 0 then 7 else cl[1] end]
                  else 'Closed ' || cardinality(cl) || ' days a week' end
             || case when late then ', open until late' else '' end;
    end if;
    if exists (select 1 from places e where e.src not like 'Google Maps listing%' and (lower(e.name) = lower(nm)
        or (e.lat is not null and abs(e.lat - f[6]::float8) < 0.0013 and abs(e.lng - f[7]::float8) < 0.0018
            and ((length(_pw(e.name)) >= 4 and position(_pw(e.name) in _pn(nm)) > 0) or (length(_pw(nm)) >= 4 and position(_pw(nm) in _pn(e.name)) > 0))))) then
      continue;
    end if;
    insert into places(id, name, kind, zone, addr, metro, price, hot, why, detail, src, closed, occ, lat, lng, costs, cuisine, web, stars, reviews, hours)
    values (pid, nm, kd, f[4], f[5], metro, pr, 1, lab || ' in ' || (zn ->> f[4]), det, 'Google Maps listing, checked 12 Nov 2026',
            to_jsonb(cl), occ, f[6]::float8, f[7]::float8, costs, cu, null, f[9]::numeric, f[10]::int, nullif(f[11], ''))
    on conflict (id) do nothing;
    get diagnostics c = row_count; n := n + c;
  end loop;
  return n;
end $$;
revoke all on function public._import_places(text) from public, anon, authenticated;
revoke all on function public._pn(text) from public, anon, authenticated;
revoke all on function public._pw(text) from public, anon, authenticated;
