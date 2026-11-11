-- "Can't make it" for plans, kept by the server like the list of people. Run after avatars.sql.
-- A plan's data gets 'out': the people who said they're not coming. Their votes are removed
-- and they no longer count towards "everyone has voted". The meet time is plain plan data ('time').

create or replace function set_attending(p_code text, p_going boolean)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_me text := auth.uid()::text;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  update plans
  set data = jsonb_set(data, '{out}',
    case when p_going then coalesce(data->'out', '[]'::jsonb) - v_me
         else (coalesce(data->'out', '[]'::jsonb) - v_me) || to_jsonb(v_me) end)
  where code = p_code and (data->'people') ? v_me and data ? 'v';
  if not found then raise exception 'not part of this plan'; end if;
  if not p_going then delete from votes where plan_code = p_code and person = v_me; end if;
end;
$$;
revoke all on function set_attending(text, boolean) from public, anon;
grant execute on function set_attending(text, boolean) to authenticated;

-- Plan edits from the app can't overwrite who is in or out.
create or replace function update_plan(p_code text, p_data jsonb, p_reset_votes boolean default false)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if pg_column_size(p_data) > 20000 then raise exception 'plan too large'; end if;
  update plans
  set data = (p_data - 'votes' - 'names' - 'group_id' - 'group_name' - 'out')
             || jsonb_build_object('people', data->'people', 'out', coalesce(data->'out', '[]'::jsonb), 'v', 2)
  where code = p_code and (data->'people') ? auth.uid()::text;
  if not found then raise exception 'not part of this plan'; end if;
  if p_reset_votes then
    delete from votes where plan_code = p_code;
  end if;
end;
$$;

-- New plans start with nobody out, and the app can't pre-fill it.
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
  values (v_code, (p_data - 'votes' - 'out') || jsonb_build_object('people', v_people, 'out', '[]'::jsonb, 'v', 2), p_group, auth.uid());
  return v_code;
end;
$$;

-- my_groups: plan counts leave out people who aren't coming; adds the meet time and whether you're out.
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
                  'people', jsonb_array_length(pl.data->'people') - coalesce(jsonb_array_length(pl.data->'out'), 0),
                  'options', jsonb_array_length(pl.data->'options'),
                  'in_plan', (pl.data->'people') ? auth.uid()::text,
                  'me_out', coalesce(pl.data->'out', '[]'::jsonb) ? auth.uid()::text,
                  'mine', (select count(*) from votes v where v.plan_code = pl.code and v.person = auth.uid()::text),
                  'done', (select count(*) from (select person from votes v where v.plan_code = pl.code
                           and not coalesce(pl.data->'out', '[]'::jsonb) ? v.person group by person
                           having count(*) >= jsonb_array_length(pl.data->'options')) d)
                ) order by pl.created_at desc), '[]'::jsonb)
                from plans pl where pl.group_id = g.id and pl.data->>'day' >= (current_date - 1)::text)
  ) order by g.name), '[]'::jsonb)
  from groups g join group_members me on me.group_id = g.id and me.user_id = auth.uid();
$$;
