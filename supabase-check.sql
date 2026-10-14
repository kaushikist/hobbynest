-- HobbyNest health check — paste into Supabase SQL Editor, Run, and share the result.
-- Read-only: it changes nothing.

select 1 as n, 'App functions installed (should list 10)' as item,
       coalesce(string_agg(proname, ', ' order by proname), 'NONE — run database.sql') as result
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('publish_course', 'update_course', 'enrollment_count',
                  'first_lecture_id', 'get_my_profile', 'check_course_capacity',
                  'can_message', 'meetup_counts', 'my_contacts', 'check_meetup_capacity')

union all
select 2, 'Security rules per table',
       string_agg(tablename || ': ' || n, ', ' order by tablename)
from (select tablename, count(*) n from pg_policies where schemaname = 'public' group by tablename) t

union all
select 3, 'Required columns the app does NOT fill (should be empty)',
       coalesce(string_agg(table_name || '.' || column_name, ', '), 'none ✓')
from information_schema.columns c
where table_schema = 'public'
  and table_name in ('profiles', 'courses', 'lessons', 'course_lectures', 'enrollments',
                     'progress', 'saved_courses', 'sessions', 'messages', 'reviews',
                     'social_posts', 'post_likes', 'post_comments', 'meetups', 'meetup_registrations')
  and is_nullable = 'NO' and column_default is null and is_identity = 'NO' and column_name <> 'id'
  and (table_name || '.' || column_name) not in (
      'profiles.role', 'courses.educator_id', 'courses.title', 'lessons.course_id', 'lessons.title',
      'course_lectures.course_id', 'course_lectures.title', 'course_lectures.youtube_url',
      'enrollments.learner_id', 'enrollments.course_id', 'progress.learner_id', 'progress.lesson_id',
      'saved_courses.learner_id', 'saved_courses.course_id', 'sessions.educator_id', 'sessions.title',
      'sessions.session_date', 'messages.sender_id', 'messages.receiver_id', 'messages.message',
      'reviews.learner_id', 'reviews.course_id', 'reviews.rating', 'social_posts.user_id',
      'post_likes.post_id', 'post_likes.user_id', 'post_comments.post_id', 'post_comments.user_id', 'post_comments.comment',
      'meetups.created_by', 'meetups.title', 'meetups.starts_at', 'meetup_registrations.meetup_id', 'meetup_registrations.user_id')

union all
select 4, 'Columns: ' || table_name,
       string_agg(column_name || case when is_nullable = 'NO' then '*' else '' end, ', ' order by ordinal_position)
from information_schema.columns
where table_schema = 'public' and table_name in ('progress', 'sessions', 'saved_courses', 'enrollments')
group by table_name

union all
select 5, 'Row counts',
       'courses ' || (select count(*) from public.courses) ||
       ', enrollments ' || (select count(*) from public.enrollments) ||
       ', progress ' || (select count(*) from public.progress) ||
       ', saved ' || (select count(*) from public.saved_courses) ||
       ', sessions ' || (select count(*) from public.sessions) ||
       ', meetups ' || (select count(*) from public.meetups) ||
       ', messages ' || (select count(*) from public.messages)

union all
select 6, 'Live messages (Realtime) turned on',
       case when exists (select 1 from pg_publication_tables
                         where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages')
            then 'yes ✓' else 'no — messages refresh every few seconds instead' end

union all
select 7, 'Logged-out visitors blocked from app functions',
       case when exists (select 1 from pg_proc p
                         where p.pronamespace = 'public'::regnamespace
                           and p.proname in ('meetup_counts', 'can_message', 'enrollment_count', 'my_contacts')
                           and has_function_privilege('anon', p.oid, 'execute'))
            then 'NO — run the latest database.sql' else 'yes ✓' end

union all
select 8, 'Starter catalog (seed-demo.sql, optional)',
       (select count(*) from public.courses where educator_id::text like '5eed0000-%') || ' demo classes, ' ||
       (select count(distinct category) from public.courses where published) || ' categories with published classes'

order by n, item;
