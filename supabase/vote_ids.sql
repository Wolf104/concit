-- cast_vote used to cut the place id to 40 characters. A vote for a place or event with a longer id (84 Madrid places,
-- 196 Madrid events, 7 Milan places on 16 Nov 2026) was saved under a name the plan did not contain, so the app kept
-- showing that card again. Ids are now kept whole, up to 120 characters.
create or replace function public.cast_vote(p_code text, p_place text, p_value smallint)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not exists (select 1 from plans where code = p_code and (data->'people') ? auth.uid()::text) then
    raise exception 'not part of this plan';
  end if;
  if p_place is null or length(p_place) > 120 then raise exception 'bad place'; end if;
  insert into votes (plan_code, person, place_id, value)
  values (p_code, auth.uid()::text, p_place, p_value)
  on conflict (plan_code, person, place_id) do update set value = excluded.value;
end;
$function$;
