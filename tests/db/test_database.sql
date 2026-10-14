-- HobbyNest — automated database tests (messaging, session notices, deletion).
-- Runs on a THROWAWAY local Postgres that has supabase_shim.sql + database.sql
-- loaded (run-db-tests.sh does all of that). NEVER run this on your real Supabase project.
-- Every check prints PASS, or stops with "FAIL: …".

\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\set E  '11111111-1111-1111-1111-111111111111'
\set L  '22222222-2222-2222-2222-222222222222'
\set L2 '33333333-3333-3333-3333-333333333333'

-- helpers (test database only)
create or replace function public.t_check(ok boolean, name text) returns text language plpgsql as $$
begin
    if ok is not true then raise exception 'FAIL: %', name; end if;
    return 'PASS  ' || name;
end $$;

-- try to send a message as the CURRENT role/user; false if security rules block it
create or replace function public.t_try_message(p_sender uuid, p_receiver uuid, p_kind text) returns boolean
language plpgsql as $$
begin
    insert into public.messages (sender_id, receiver_id, message, kind) values (p_sender, p_receiver, 'test', p_kind);
    return true;
exception when insufficient_privilege or check_violation then
    return false;
end $$;
grant execute on function public.t_try_message(uuid, uuid, text) to authenticated;

-- people
insert into auth.users (id, email, raw_user_meta_data) values
    (:'E',  'edu@test.dev',     '{"full_name":"Edu Teacher","role":"educator"}'),
    (:'L',  'learner@test.dev', '{"full_name":"Lea Learner","role":"learner"}'),
    (:'L2', 'other@test.dev',   '{"full_name":"Not Enrolled","role":"learner"}');
update public.profiles set onboarding_complete = true;
select public.t_check((select count(*) from public.profiles) = 3, 'Signup creates a profile for every new user');

-- educator publishes a class, learner enrolls
begin;
select set_config('role', 'authenticated', true), set_config('request.jwt.claim.sub', :'E', true) \g /dev/null
select public.publish_course('{"title":"Guitar 101","published":true}'::jsonb, '[{"title":"Lesson 1"}]'::jsonb) as course_id \gset
commit;
begin;
select set_config('role', 'authenticated', true), set_config('request.jwt.claim.sub', :'L', true) \g /dev/null
insert into public.enrollments (learner_id, course_id) values (:'L', :course_id);
commit;

-- ISSUE 3: educator → enrolled learner messaging
begin;
select set_config('role', 'authenticated', true), set_config('request.jwt.claim.sub', :'E', true) \g /dev/null
select public.t_check(public.t_try_message(:'E', :'L', 'text'), 'Educator can message an enrolled learner');
select public.t_check(not public.t_try_message(:'E', :'L2', 'text'), 'Educator cannot message a learner who is not enrolled');
insert into public.sessions (educator_id, course_id, title, description, session_date, meeting_link)
values (:'E', :course_id, 'Live Q&A', 'Bring your guitar', now() + interval '1 day', 'https://meet.google.com/abc')
returning id as session_id \gset
commit;

begin;
select set_config('role', 'authenticated', true), set_config('request.jwt.claim.sub', :'L', true) \g /dev/null
select public.t_check((select count(*) from public.messages where receiver_id = :'L' and kind = 'text') = 1,
                      'Learner receives the educator''s message');
select public.t_check((select count(*) from public.messages where receiver_id = :'L' and kind = 'session'
                       and message like '%Live Q&A%' and message like '%https://meet.google.com/abc%') = 1,
                      'Scheduling a session puts a notice (with join link) in the learner''s Messages');
select public.t_check((select count(*) from public.sessions) = 1, 'Learner sees the session on Schedule');
select public.t_check(public.t_try_message(:'L', :'E', 'text'), 'Learner can reply to the educator');
select public.t_check(not public.t_try_message(:'L', :'E', 'session'), 'Nobody can fake a "session notice" message');
commit;

begin;
select set_config('role', 'authenticated', true), set_config('request.jwt.claim.sub', :'L2', true) \g /dev/null
select public.t_check((select count(*) from public.messages) = 0, 'Other users cannot read someone else''s messages');
commit;

begin;
select set_config('role', 'authenticated', true), set_config('request.jwt.claim.sub', :'E', true) \g /dev/null
delete from public.sessions where id = :session_id;
commit;
select public.t_check((select count(*) from public.messages where receiver_id = :'L' and message like '❌ Live session cancelled%') = 1,
                      'Cancelling a session notifies enrolled learners');

-- privacy of the email log
select public.t_check(not has_table_privilege('authenticated', 'public.email_log', 'select'), 'Browser cannot read the email log');

-- ISSUE 2: deletion (what the delete-account function does: delete the auth user)
insert into public.sessions (educator_id, course_id, title, session_date) values (:'E', :course_id, 'Another', now() + interval '2 days');
select public.t_check(not has_function_privilege('anon', 'public.delete_my_account()', 'execute'), 'Logged-out visitors cannot call delete_my_account');
select public.t_check((select (public.hobbynest_setup_check()->>'blocking_foreign_keys')::int) = 0, 'Setup check: no foreign key can block deletion');
-- the learner deletes THEIR OWN account through the app's function
begin;
select set_config('role', 'authenticated', true), set_config('request.jwt.claim.sub', :'L', true) \g /dev/null
select public.t_check(public.delete_my_account(), 'Learner can delete their own account (rpc delete_my_account)');
commit;
select public.t_check((select count(*) from auth.users where id = :'L') = 0 and (select count(*) from auth.users) = 2,
                      'Only the caller was deleted — nobody else');
select public.t_check((select count(*) from public.profiles where id = :'L') = 0, 'Deleting a learner removes their profile');
select public.t_check((select count(*) from public.enrollments where learner_id = :'L') = 0, 'Deleting a learner removes their enrollments');
begin;
select set_config('role', 'authenticated', true), set_config('request.jwt.claim.sub', :'E', true) \g /dev/null
select public.t_check(public.delete_my_account(), 'Educator can delete their own account');
commit;
select public.t_check((select count(*) from public.courses) = 0, 'Deleting an educator (with live sessions) removes their classes');
select public.t_check((select count(*) from public.messages) = 0, 'Deleted users'' messages are removed');

drop function public.t_try_message(uuid, uuid, text);
\echo
\echo All database tests passed.
