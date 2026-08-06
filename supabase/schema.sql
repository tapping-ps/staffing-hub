-- ============================================================
-- Tapping PS Staffing Hub - foundation schema
-- Run in the Supabase SQL Editor (paste whole file, Run once).
-- Safe to re-run pieces individually if something fails partway.
--
-- Design rules this file enforces:
--   * Sign-ups restricted to @education.wa.edu.au addresses
--   * Every table locked with row-level security (RLS):
--       - any signed-in staff member can READ everything
--       - 'minor' tier (school officers) can edit daily data (DOTT entries)
--       - 'master' tier (principal + deputies) can edit everything
--       - new sign-ups start as 'viewer' automatically
--   * NO student data. Staff names only. Ever.
--   * Data is entered once: the staff list is shared by every module.
--     Timetable placement tables arrive with the timetable import.
--
-- Bootstrap note (one-off, after Brad's first sign-in):
--   update public.user_roles set tier = 'master'
--   where user_id = (select id from auth.users
--                    where email = 'bradley.trpchev@education.wa.edu.au');
-- ============================================================

-- ---------- 1. Shared staff list (one list for every module) ----------

create table public.staff (
  id         uuid primary key default gen_random_uuid(),
  full_name  text not null,
  email      text unique,
  staff_type text not null check (staff_type in
               ('classroom','specialist','leadership','ea','office')),
  fte        numeric(3,2) not null default 1.00
               check (fte > 0 and fte <= 1),
  active     boolean not null default true,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- 2. Terms (entered once at the start of each year) ----------

create table public.terms (
  id          uuid primary key default gen_random_uuid(),
  year        int  not null check (year between 2020 and 2040),
  term_number int  not null check (term_number between 1 and 4),
  start_date  date not null,
  week_count  int  not null check (week_count between 8 and 14),
  unique (year, term_number)
);

-- ---------- 3. DOTT exceptions ledger ----------
-- The timetable import provides the baseline (who has DOTT, when).
-- This table records only what CHANGES: minutes negative = DOTT lost,
-- positive = DOTT gained. One entry per staff member per day per term.

create table public.dott_entries (
  id         uuid primary key default gen_random_uuid(),
  staff_id   uuid not null references public.staff(id) on delete cascade,
  term_id    uuid not null references public.terms(id) on delete cascade,
  date       date not null,
  minutes    numeric not null,
  period     int check (period between 0 and 6),
  note       text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (staff_id, date, term_id)
);

-- ---------- 4. Access tiers (the two kinds of keys) ----------

create table public.user_roles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  tier       text not null default 'viewer'
               check (tier in ('master','minor','viewer')),
  staff_id   uuid references public.staff(id),
  created_at timestamptz not null default now()
);

-- Helper: which tier is the signed-in user? ('none' when signed out)
create or replace function public.current_tier()
returns text
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select tier from user_roles where user_id = auth.uid()),
    'none');
$$;

-- ---------- 5. The school-address lock on sign-ups ----------

create or replace function public.enforce_school_email()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.email is null
     or lower(new.email) not like '%@education.wa.edu.au' then
    raise exception
      'Sign-ups are restricted to education.wa.edu.au addresses';
  end if;
  return new;
end;
$$;

create trigger enforce_school_email
  before insert on auth.users
  for each row execute function public.enforce_school_email();

-- Every successful sign-up automatically starts as a 'viewer'
create or replace function public.grant_default_role()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.user_roles (user_id, tier)
  values (new.id, 'viewer')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger grant_default_role
  after insert on auth.users
  for each row execute function public.grant_default_role();

-- ---------- 6. Row-level security: the locks themselves ----------

alter table public.staff        enable row level security;
alter table public.terms        enable row level security;
alter table public.dott_entries enable row level security;
alter table public.user_roles   enable row level security;

-- Anyone signed in can read everything (the whole hub is view-for-all)
create policy "signed-in can read staff"
  on public.staff for select to authenticated using (true);
create policy "signed-in can read terms"
  on public.terms for select to authenticated using (true);
create policy "signed-in can read dott"
  on public.dott_entries for select to authenticated using (true);
create policy "read own role; masters read all"
  on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.current_tier() = 'master');

-- Staff list and terms: master keys only
create policy "masters insert staff"
  on public.staff for insert to authenticated
  with check (public.current_tier() = 'master');
create policy "masters update staff"
  on public.staff for update to authenticated
  using (public.current_tier() = 'master')
  with check (public.current_tier() = 'master');
create policy "masters delete staff"
  on public.staff for delete to authenticated
  using (public.current_tier() = 'master');

create policy "masters insert terms"
  on public.terms for insert to authenticated
  with check (public.current_tier() = 'master');
create policy "masters update terms"
  on public.terms for update to authenticated
  using (public.current_tier() = 'master')
  with check (public.current_tier() = 'master');
create policy "masters delete terms"
  on public.terms for delete to authenticated
  using (public.current_tier() = 'master');

-- DOTT entries: minor and master keys
create policy "keyholders insert dott"
  on public.dott_entries for insert to authenticated
  with check (public.current_tier() in ('master','minor'));
create policy "keyholders update dott"
  on public.dott_entries for update to authenticated
  using (public.current_tier() in ('master','minor'))
  with check (public.current_tier() in ('master','minor'));
create policy "keyholders delete dott"
  on public.dott_entries for delete to authenticated
  using (public.current_tier() in ('master','minor'));

-- Role assignments: master keys only
create policy "masters insert roles"
  on public.user_roles for insert to authenticated
  with check (public.current_tier() = 'master');
create policy "masters update roles"
  on public.user_roles for update to authenticated
  using (public.current_tier() = 'master')
  with check (public.current_tier() = 'master');
create policy "masters delete roles"
  on public.user_roles for delete to authenticated
  using (public.current_tier() = 'master');
