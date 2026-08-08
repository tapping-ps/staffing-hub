-- ============================================================
-- Relief Planner - phase 1 schema
-- Paste into the Supabase SQL Editor and Run once. Safe to re-run.
--
-- Design (Brad, 2026-08-08):
--   * One absence record per staff member per day is the spine.
--   * Relief teachers are remembered as they are used - no pre-loaded
--     list, no type-casting. First use creates them.
--   * Absences cover ALL staff (teachers, EAs, office). Key holders can
--     add a staff member met during mapping (e.g. an EA not in the
--     timetable registry).
--   * Payment codes / HRMIS deliberately OUT of scope.
--   * dott_entries gains an absence link so the later "DOTT ripple" can
--     write ledger entries tied to the absence that caused them.
-- ============================================================

create table if not exists public.relief_teachers (
  id         uuid primary key default gen_random_uuid(),
  full_name  text not null unique,
  active     boolean not null default true,
  notes      text,
  created_at timestamptz not null default now()
);

create table if not exists public.absences (
  id                uuid primary key default gen_random_uuid(),
  staff_id          uuid not null references public.staff(id) on delete cascade,
  date              date not null,
  part              text not null default 'full'
                      check (part in ('full','am','pm')),
  reason            text,
  cover             text not null default 'tbc'
                      check (cover in ('tbc','relief','internal','none')),
  relief_teacher_id uuid references public.relief_teachers(id),
  cover_note        text,
  notes             text,
  created_by        uuid references auth.users(id),
  created_at        timestamptz not null default now(),
  unique (staff_id, date)
);

alter table public.dott_entries
  add column if not exists absence_id uuid references public.absences(id) on delete set null;

alter table public.relief_teachers enable row level security;
alter table public.absences        enable row level security;

-- Signed-in staff can read; minor + master keys manage
create policy "signed-in read relief teachers"
  on public.relief_teachers for select to authenticated using (true);
create policy "keyholders insert relief teachers"
  on public.relief_teachers for insert to authenticated
  with check (public.current_tier() in ('master','minor'));
create policy "keyholders update relief teachers"
  on public.relief_teachers for update to authenticated
  using (public.current_tier() in ('master','minor'))
  with check (public.current_tier() in ('master','minor'));
create policy "keyholders delete relief teachers"
  on public.relief_teachers for delete to authenticated
  using (public.current_tier() in ('master','minor'));

create policy "signed-in read absences"
  on public.absences for select to authenticated using (true);
create policy "keyholders insert absences"
  on public.absences for insert to authenticated
  with check (public.current_tier() in ('master','minor'));
create policy "keyholders update absences"
  on public.absences for update to authenticated
  using (public.current_tier() in ('master','minor'))
  with check (public.current_tier() in ('master','minor'));
create policy "keyholders delete absences"
  on public.absences for delete to authenticated
  using (public.current_tier() in ('master','minor'));

-- Key holders may ADD staff met while mapping relief (EAs, office staff).
-- Updating/deleting staff stays master-only.
create policy "minors insert staff"
  on public.staff for insert to authenticated
  with check (public.current_tier() = 'minor');
