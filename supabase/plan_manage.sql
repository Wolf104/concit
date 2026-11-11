-- Deleting and leaving plans. Run after plan_extras.sql.
-- The person who made a plan can delete it (votes go with it).
-- Anyone else can leave: they come off the plan, their votes are removed,
-- and opening the plan again won't silently add them back (data->'left').

create or replace function delete_plan(p_code text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  delete from plans where code = p_code and created_by = auth.uid();
  if not found then raise exception 'only the person who made this plan can delete it'; end if;
end;
$$;

create or replace function leave_plan(p_code text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_me text := auth.uid()::text;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  update plans
  set data = data
    || jsonb_build_object(
      'people', (data->'people') - v_me,
      'out', coalesce(data->'out', '[]'::jsonb) - v_me,
      'left', (coalesce(data->'left', '[]'::jsonb) - v_me) || to_jsonb(v_me))
  where code = p_code and (data->'people') ? v_me and data ? 'v'
    and created_by is distinct from auth.uid();
  if not found then raise exception 'cannot leave this plan'; end if;
  delete from votes where plan_code = p_code and person = v_me;
end;
$$;

-- Come back to a plan you left (from the plan screen).
create or replace function rejoin_plan(p_code text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_me text := auth.uid()::text;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  update plans p
  set data = p.data || jsonb_build_object(
      'people', (p.data->'people') || to_jsonb(v_me),
      'left', coalesce(p.data->'left', '[]'::jsonb) - v_me)
  where p.code = p_code and p.data ? 'v'
    and (p.group_id is null or is_member(p.group_id))
    and not (p.data->'people') ? v_me
    and jsonb_array_length(p.data->'people') < 50;
end;
$$;

revoke all on function delete_plan(text), leave_plan(text), rejoin_plan(text) from public, anon;
grant execute on function delete_plan(text), leave_plan(text), rejoin_plan(text) to authenticated;

-- Opening a plan you left doesn't add you back.
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
    and not coalesce(p.data->'left', '[]'::jsonb) ? auth.uid()::text
    and not coalesce((p.data->>'finished')::boolean, false)
    and jsonb_array_length(p.data->'people') < 50;
end;
$$;

-- get_plan also says whether you made the plan ('mine').
create or replace function get_plan(p_code text)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select p.data || jsonb_build_object(
    'group_id', p.group_id,
    'group_name', (select name from groups where id = p.group_id),
    'mine', p.created_by = auth.uid(),
    'votes', coalesce((select jsonb_object_agg(person, picks) from (
        select person, jsonb_object_agg(place_id, value) as picks from votes where plan_code = p.code group by person
      ) v), '{}'::jsonb),
    'names', coalesce((select jsonb_object_agg(pr.id::text, pr.name) from profiles pr
        where (p.data->'people') ? pr.id::text), '{}'::jsonb))
  from plans p
  where p.code = p_code and auth.uid() is not null and p.data ? 'v'
    and (p.group_id is null or is_member(p.group_id));
$$;

-- The app can't overwrite who is in, out or has left.
create or replace function update_plan(p_code text, p_data jsonb, p_reset_votes boolean default false)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if pg_column_size(p_data) > 20000 then raise exception 'plan too large'; end if;
  update plans
  set data = (p_data - 'votes' - 'names' - 'group_id' - 'group_name' - 'out' - 'left' - 'mine')
             || jsonb_build_object('people', data->'people', 'out', coalesce(data->'out', '[]'::jsonb),
                                   'left', coalesce(data->'left', '[]'::jsonb), 'v', 2)
  where code = p_code and (data->'people') ? auth.uid()::text;
  if not found then raise exception 'not part of this plan'; end if;
  if p_reset_votes then
    delete from votes where plan_code = p_code;
  end if;
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
  if pg_column_size(p_data) > 20000 then raise exception 'plan too large'; end if;
  if p_group is not null then
    if not is_member(p_group) then raise exception 'not in this group'; end if;
    select jsonb_agg(user_id::text) into v_people from group_members where group_id = p_group;
  else
    v_people := jsonb_build_array(auth.uid()::text);
  end if;
  insert into plans (code, data, group_id, created_by)
  values (v_code, (p_data - 'votes' - 'out' - 'left' - 'mine') || jsonb_build_object('people', v_people, 'out', '[]'::jsonb, 'v', 2), p_group, auth.uid());
  return v_code;
end;
$$;

-- my_groups: plans you left drop off your list; 'mine' marks plans you made.
create or replace function my_groups()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', g.id, 'name', g.name, 'invite_code', g.invite_code,
    'members', (select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name,
                  'online', coalesce(p.last_seen > now() - interval '60 seconds', false),
                  'av', (extract(epoch from p.avatar_at) * 1000)::bigint) order by p.name)
                from group_members m join profiles p on p.id = m.user_id where m.group_id = g.id),
    'unread', (select count(*) from messages x where x.group_id = g.id and x.id > me.last_read and x.user_id <> auth.uid()),
    'last', (select jsonb_build_object('name', p.name, 'body', left(x.body, 80), 'mine', x.user_id = auth.uid())
             from messages x left join profiles p on p.id = x.user_id where x.group_id = g.id order by x.id desc limit 1),
    'plans', (select coalesce(jsonb_agg(jsonb_build_object(
                  'code', pl.code, 'what', pl.data->>'what', 'day', pl.data->>'day', 'time', pl.data->>'time',
                  'cuisine', pl.data->>'cuisine',
                  'finished', coalesce((pl.data->>'finished')::boolean, false),
                  'by', (select name from profiles where id = pl.created_by),
                  'made', pl.created_by = auth.uid(),
                  'people', jsonb_array_length(pl.data->'people') - coalesce(jsonb_array_length(pl.data->'out'), 0),
                  'options', jsonb_array_length(pl.data->'options'),
                  'in_plan', (pl.data->'people') ? auth.uid()::text,
                  'me_out', coalesce(pl.data->'out', '[]'::jsonb) ? auth.uid()::text,
                  'mine', (select count(*) from votes v where v.plan_code = pl.code and v.person = auth.uid()::text),
                  'done', (select count(*) from (select person from votes v where v.plan_code = pl.code
                           and not coalesce(pl.data->'out', '[]'::jsonb) ? v.person group by person
                           having count(*) >= jsonb_array_length(pl.data->'options')) d)
                ) order by pl.created_at desc), '[]'::jsonb)
                from plans pl where pl.group_id = g.id and pl.data->>'day' >= (current_date - 1)::text
                  and not coalesce(pl.data->'left', '[]'::jsonb) ? auth.uid()::text)
  ) order by g.name), '[]'::jsonb)
  from groups g join group_members me on me.group_id = g.id and me.user_id = auth.uid();
$$;
