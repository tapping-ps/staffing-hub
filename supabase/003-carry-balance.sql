-- Carry-in balances (Brad, 2026-08-08): when the hub goes live mid-year,
-- each staff member can be given one signed minutes figure representing
-- their DOTT surplus (+) or deficit (-) carried from earlier terms,
-- with a note saying where it came from. Master keys edit it in the app
-- (staff table update policy already restricts writes to masters).
-- Safe to re-run.

alter table public.staff
  add column if not exists carry_minutes numeric not null default 0;
alter table public.staff
  add column if not exists carry_note text;
