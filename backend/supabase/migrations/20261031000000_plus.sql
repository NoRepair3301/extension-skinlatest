-- Skinly Plus (v0.3.0). Data held: email (auth.users), plan status and billing references. Nothing else (docs/PLUS_SPEC.md 3).
-- RLS on every table. Users may only read their own profile and entitlement, and the active plans. No insert, update or delete
-- policy exists, so only the service role (inside Edge Functions) writes.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.plans (
  id text primary key check (id ~ '^[a-z0-9-]{1,40}$'),
  name text not null check (char_length(name) between 1 and 60),
  interval text not null check (interval in ('month', 'year')),
  price_minor integer not null check (price_minor >= 0 and price_minor <= 10000000),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  provider_ref text not null check (char_length(provider_ref) between 1 and 120),
  active boolean not null default true
);

create table public.entitlements (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan text not null check (plan in ('free', 'plus')),
  status text not null check (status in ('active', 'cancelled', 'expired', 'refunded')),
  current_period_end timestamptz,
  provider text not null check (char_length(provider) between 1 and 40),
  provider_customer_ref text check (char_length(provider_customer_ref) <= 120),
  provider_subscription_ref text check (char_length(provider_subscription_ref) <= 120),
  updated_at timestamptz not null default now()
);

-- Idempotency only: never the raw payload, never user data.
create table public.billing_events (
  provider_event_id text primary key check (char_length(provider_event_id) between 1 and 120),
  type text not null check (type in ('activated', 'renewed', 'cancelled', 'expired', 'refunded')),
  received_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.plans enable row level security;
alter table public.entitlements enable row level security;
alter table public.billing_events enable row level security;

alter table public.profiles force row level security;
alter table public.plans force row level security;
alter table public.entitlements force row level security;
alter table public.billing_events force row level security;

create policy "own profile" on public.profiles for select to authenticated using (id = auth.uid());
create policy "active plans" on public.plans for select to anon, authenticated using (active);
create policy "own entitlement" on public.entitlements for select to authenticated using (user_id = auth.uid());
-- billing_events: no policy at all (service role only).

revoke insert, update, delete on public.profiles, public.plans, public.entitlements, public.billing_events from anon, authenticated;
revoke select on public.billing_events from anon, authenticated;

-- A profile row for every new auth user (no PII copied: the email stays in auth.users).
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
