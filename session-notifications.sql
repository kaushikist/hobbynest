-- HobbyNest: install/reinstall course-specific session inbox notifications.
-- Run this in Supabase SQL Editor if the project was deployed before the
-- course-session notification trigger was added to database.sql.

alter table public.messages
  add column if not exists kind text not null default 'text';
alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check
  check (kind in ('text', 'session')) not valid;

create or replace function public.notify_session_learners()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
  note text;
  when_text text;
begin
  if tg_op = 'DELETE' then
    s := old;
    if pg_trigger_depth() > 1 or s.session_date < now() then
      return old;
    end if;
  else
    s := new;
  end if;

  -- Only course-specific sessions create inbox notices. The app requires a
  -- course when scheduling so notices cannot accidentally go to unrelated users.
  if s.course_id is null then
    return coalesce(new, old);
  end if;

  when_text := to_char(s.session_date at time zone 'Asia/Kolkata',
                       'Dy, DD Mon YYYY "at" HH12:MI AM') || ' IST';

  if tg_op = 'DELETE' then
    note := 'Live session cancelled: ' || s.title || E'\n' || when_text;
  else
    note := 'New live session: ' || s.title || E'\n' || when_text
      || coalesce(E'\n' || nullif(trim(s.description), ''), '')
      || coalesce(E'\nJoin link: ' || s.meeting_link,
                  E'\nThe join link will be shared before the session.')
      || E'\nIt is also on your Schedule page.';
  end if;

  insert into public.messages (sender_id, receiver_id, message, kind)
  select s.educator_id, e.learner_id, left(note, 2000), 'session'
  from public.enrollments e
  where e.course_id = s.course_id
    and e.learner_id <> s.educator_id;

  return coalesce(new, old);
end;
$$;

revoke execute on function public.notify_session_learners() from public, anon, authenticated;
drop trigger if exists notify_session_learners on public.sessions;
create trigger notify_session_learners
after insert or delete on public.sessions
for each row execute procedure public.notify_session_learners();
