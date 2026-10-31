-- RLS proof for Skinly Plus. Run with `supabase test db` (pgTAP; docs/backend/supabase.md).
begin;
select plan(14);

select ok((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass), 'RLS on profiles');
select ok((select relrowsecurity from pg_class where oid = 'public.plans'::regclass), 'RLS on plans');
select ok((select relrowsecurity from pg_class where oid = 'public.entitlements'::regclass), 'RLS on entitlements');
select ok((select relrowsecurity from pg_class where oid = 'public.billing_events'::regclass), 'RLS on billing_events');

-- fixtures (as the owner; synthetic addresses on a reserved test domain)
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.test'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.test');
insert into public.plans (id, name, interval, price_minor, currency, provider_ref, active) values
  ('plus-month', 'Plus monthly', 'month', 300, 'EUR', 'test_plus_month', true),
  ('old-plan', 'Old', 'month', 100, 'EUR', 'test_old', false);
insert into public.entitlements (user_id, plan, status, current_period_end, provider) values
  ('00000000-0000-0000-0000-00000000000a', 'plus', 'active', now() + interval '30 days', 'test'),
  ('00000000-0000-0000-0000-00000000000b', 'plus', 'active', now() + interval '30 days', 'test');
insert into public.billing_events (provider_event_id, type) values ('evt_1', 'activated');

select is((select count(*)::int from public.profiles), 2, 'the trigger made one profile per user');

-- user A
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

select is((select count(*)::int from public.entitlements), 1, 'A sees one entitlement');
select is((select user_id::text from public.entitlements), '00000000-0000-0000-0000-00000000000a', 'and it is their own');
select is((select count(*)::int from public.profiles), 1, 'A sees only their own profile');
select is((select count(*)::int from public.plans), 1, 'A sees only active plans');
select throws_ok($q$ select count(*) from public.billing_events $q$, '42501', null, 'A cannot read billing events');
select throws_ok($q$ update public.entitlements set plan = 'plus' where user_id = '00000000-0000-0000-0000-00000000000b' $q$, '42501', null, 'A cannot update entitlements');
select throws_ok($q$ insert into public.entitlements (user_id, plan, status, provider) values ('00000000-0000-0000-0000-00000000000a', 'plus', 'active', 'x') $q$, '42501', null, 'A cannot insert an entitlement');
select throws_ok($q$ delete from public.plans $q$, '42501', null, 'A cannot delete plans');

-- anonymous
reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select is((select count(*)::int from public.entitlements), 0, 'anon sees no entitlements');

select * from finish();
rollback;
