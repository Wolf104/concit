-- Group chat. Run after accounts.sql and account.sql.
-- Only members of a group can read or post its messages, and only through the functions below.
-- A member's messages are deleted with their account (profiles cascade).

create table if not exists messages (
  id bigint generated always as identity primary key,
  group_id uuid not null references groups(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists messages_group_idx on messages(group_id, id);
alter table messages enable row level security;

-- The last message each member has seen, for unread counts.
alter table group_members add column if not exists last_read bigint not null default 0;

create or replace function send_message(p_group uuid, p_body text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_body text := left(trim(p_body), 1000);
  m messages;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  if not is_member(p_group) then raise exception 'not a member'; end if;
  if v_body is null or v_body = '' then raise exception 'empty message'; end if;
  if (select count(*) from messages where user_id = auth.uid() and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'slow down';
  end if;
  insert into messages (group_id, user_id, body) values (p_group, auth.uid(), v_body) returning * into m;
  update group_members set last_read = m.id where group_id = p_group and user_id = auth.uid();
  return jsonb_build_object('id', m.id, 'body', m.body, 'at', m.created_at, 'by', m.user_id,
    'name', (select name from profiles where id = m.user_id));
end;
$$;

-- The latest 200 messages, or only those after p_after. Opening the chat marks it read.
create or replace function get_messages(p_group uuid, p_after bigint default 0)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v jsonb;
begin
  if auth.uid() is null or not is_member(p_group) then return null; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'body', x.body, 'at', x.created_at, 'by', x.user_id, 'name', p.name) order by x.id), '[]'::jsonb)
  into v
  from (select * from messages where group_id = p_group and id > coalesce(p_after, 0) order by id desc limit 200) x
  left join profiles p on p.id = x.user_id;
  update group_members set last_read = greatest(last_read, coalesce((select max(id) from messages where group_id = p_group), 0))
  where group_id = p_group and user_id = auth.uid();
  return v;
end;
$$;

revoke all on function send_message(uuid, text) from public, anon;
revoke all on function get_messages(uuid, bigint) from public, anon;
grant execute on function send_message(uuid, text), get_messages(uuid, bigint) to authenticated;

-- my_groups, now with unread counts and the latest message.
create or replace function my_groups()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', g.id, 'name', g.name, 'invite_code', g.invite_code,
    'members', (select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name) order by p.name)
                from group_members m join profiles p on p.id = m.user_id where m.group_id = g.id),
    'unread', (select count(*) from messages x where x.group_id = g.id and x.id > me.last_read and x.user_id <> auth.uid()),
    'last', (select jsonb_build_object('name', p.name, 'body', left(x.body, 80), 'mine', x.user_id = auth.uid())
             from messages x left join profiles p on p.id = x.user_id where x.group_id = g.id order by x.id desc limit 1),
    'plans', (select coalesce(jsonb_agg(jsonb_build_object(
                  'code', pl.code, 'what', pl.data->>'what', 'day', pl.data->>'day',
                  'finished', coalesce((pl.data->>'finished')::boolean, false),
                  'by', (select name from profiles where id = pl.created_by),
                  'people', jsonb_array_length(pl.data->'people'),
                  'options', jsonb_array_length(pl.data->'options'),
                  'in_plan', (pl.data->'people') ? auth.uid()::text,
                  'mine', (select count(*) from votes v where v.plan_code = pl.code and v.person = auth.uid()::text),
                  'done', (select count(*) from (select person from votes v where v.plan_code = pl.code group by person
                           having count(*) >= jsonb_array_length(pl.data->'options')) d)
                ) order by pl.created_at desc), '[]'::jsonb)
                from plans pl where pl.group_id = g.id and pl.data->>'day' >= (current_date - 1)::text)
  ) order by g.name), '[]'::jsonb)
  from groups g join group_members me on me.group_id = g.id and me.user_id = auth.uid();
$$;
