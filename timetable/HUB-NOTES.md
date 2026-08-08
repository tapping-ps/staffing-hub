# Timetable module: provenance and operating rules

This folder is an EXACT copy of the school's Semester 2 timetable project,
taken 2026-08-06 from the repo `btrpchev/tapping-s2-timetable` at commit
`008b35e` ("Wed P6: Lis covers Parkin's LA2 grad DOTT; Moore's Health to
grad days"). The original repo and its live site
(btrpchev.github.io/tapping-s2-timetable) remain untouched and OPERATIONAL.

## Deliberate divergence from the original (Brad, 2026-08-08)

The hub's timetable page is now the DEVELOPMENT LINE and no longer
byte-identical to the original site: Brad is refining the UI here before
releasing to staff. First divergence: the Teacher view's button wall was
replaced with a sticky picker bar (grouped dropdown + prev/next arrows)
so you can switch teachers without scrolling. The original live site
keeps the old UI until switch-over. DATA still syncs from the original
(see below); UI improvements happen here.

## Which copy is the source of truth?

Until Brad deliberately switches staff over to the hub, the ORIGINAL repo is
the operational source of truth. If the timetable data changes over there,
re-copy `solution.json`, `ece-data.js` and `changelog.json` here and
republish (steps below). Never edit the original from this repo.

## How the published page works

- `../public/timetable/index.html` is the page served at
  https://tapping-ps.github.io/staffing-hub/timetable/ .
  It is currently the original's generated `index.html`, byte-identical.
- To republish after a data change IN THIS FOLDER:
  1. `cd timetable && npm install && node build-outputs.js`
  2. Copy the freshly written `timetable/index.html` over
     `public/timetable/index.html`
  3. Copy `timetable/dott-baseline.json` over `public/dott-baseline.json`
     (build-outputs.js regenerates it; the DOTT tracker reads it, which is
     how timetable changes flow into the tracker)
  4. If teachers were added/renamed: `node scripts/gen-staff-sync.mjs`
     from the repo root, then paste `supabase/002-staff-sync.sql` into the
     Supabase SQL Editor and Run (safe to re-run, upserts by hub_key)
  5. From the repo root: `npm run build`, then commit (including `docs/`)
     and push. Pages redeploys automatically.
  Note: `build-outputs.js` stamps "Last updated" with the build date.
- `index.html` / `Tapping_S2_Specialist_Timetable.html` / `.xlsx` /
  `Tapping_S2_Verification_Report.md` in this folder are generated outputs.
  Source of truth: `solution.json` + `ece-data.js` + `changelog.json`.

## Hard-won domain rules (violating these caused real problems)

- Do NOT re-run `solve-s2.js` casually: it regenerates every placement.
  Hand-edit data for small changes and re-run the verification inside
  `build-outputs.js`.
- In the ORIGINAL repo, the git tag `default-grid` marks the Brad-approved
  state (currently one commit behind its HEAD; that is expected). Trials go
  live clearly labelled in `changelog.json`; "back to default" means
  restoring grid data files from that tag. Tags were not copied here.
- Friday P1 is whole-school assembly: no specialist lessons, and Peak's
  Friday P1 is her protected assembly DOTT, never teaching or leadership.
- P0 (25 min) counts as DOTT. STEM is always a back-to-back double.
  Thursday is the all-PE day. Max 2 specialist periods per class per day.
  LA24 has grad days instead of grad Health (her timetabled DOTT is 285,
  deliberately level with peers).
- Never introduce relief or external staffing without Brad's explicit
  sign-off. He treats unfunded relief as a cost he must personally approve.
- Lowndes's Friday is loaded with ECE covers; check `externalCover` in
  `ece-data.js` before touching any of her Friday lessons. The specialist
  dashboard can hide double-bookings as surplus.
- Every timetable data change gets a `changelog.json` entry (newest first,
  `{date, note}`, staff-facing tone).
