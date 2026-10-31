-- Test-mode catalogue. The price comes from this table, never from the extension. Replace before production.
insert into public.plans (id, name, interval, price_minor, currency, provider_ref, active)
values ('plus-month', 'Skinly Plus (monthly)', 'month', 300, 'EUR', 'test_plus_month', true)
on conflict (id) do nothing;
