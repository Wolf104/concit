-- Take back your own vote on one option while the plan is still open.
create or replace function undo_vote(p_code text, p_place text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  if not exists (select 1 from plans where code = p_code and (data->'people') ? auth.uid()::text
                 and not coalesce((data->>'finished')::boolean, false)) then
    raise exception 'cannot change votes on this plan';
  end if;
  delete from votes where plan_code = p_code and person = auth.uid()::text and place_id = p_place;
end;
$$;
revoke all on function undo_vote(text, text) from public, anon;
grant execute on function undo_vote(text, text) to authenticated;
