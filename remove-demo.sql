-- =====================================================================
-- HobbyNest — remove the starter catalog (demo content)
-- =====================================================================
-- Deletes the 6 sample educators from seed-demo.sql. Their classes, lessons,
-- lectures, meetups, and any enrollments/messages/reviews linked to them are
-- removed with them. Real users and their content are not touched.
-- Paste into the Supabase SQL Editor → Run.
-- =====================================================================

delete from auth.users where id in ('5eed0000-0000-4000-a000-000000000001', '5eed0000-0000-4000-a000-000000000002', '5eed0000-0000-4000-a000-000000000003', '5eed0000-0000-4000-a000-000000000004', '5eed0000-0000-4000-a000-000000000005', '5eed0000-0000-4000-a000-000000000006');
delete from public.profiles where id in ('5eed0000-0000-4000-a000-000000000001', '5eed0000-0000-4000-a000-000000000002', '5eed0000-0000-4000-a000-000000000003', '5eed0000-0000-4000-a000-000000000004', '5eed0000-0000-4000-a000-000000000005', '5eed0000-0000-4000-a000-000000000006');

select 'Demo educators left' as item, count(*)::text as result from public.profiles where id in ('5eed0000-0000-4000-a000-000000000001', '5eed0000-0000-4000-a000-000000000002', '5eed0000-0000-4000-a000-000000000003', '5eed0000-0000-4000-a000-000000000004', '5eed0000-0000-4000-a000-000000000005', '5eed0000-0000-4000-a000-000000000006');
