-- After database.sql runs on the legacy tables, deleting a user must work.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\set E '11111111-1111-1111-1111-111111111111'
\set L '22222222-2222-2222-2222-222222222222'
insert into auth.users (id, email, raw_user_meta_data) values
    (:'E', 'e@test.dev', '{"role":"educator","full_name":"E"}'),
    (:'L', 'l@test.dev', '{"full_name":"L"}')
on conflict do nothing;
update public.profiles set onboarding_complete = true;
insert into public.courses (educator_id, title, published) values (:'E', 'Class', true);
insert into public.enrollments (learner_id, course_id) select :'L', max(id) from public.courses;
insert into public.messages (sender_id, receiver_id, message) values (:'E', :'L', 'hi');
begin;
select set_config('role', 'authenticated', true), set_config('request.jwt.claim.sub', :'L', true) \g /dev/null
select public.delete_my_account() \g /dev/null
commit;
select case when (select count(*) from auth.users where id = :'L') = 0
            then 'PASS  Old hand-made tables: deleting a user now works'
            else 'FAIL' end;
