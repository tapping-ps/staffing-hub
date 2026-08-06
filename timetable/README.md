# Tapping Primary School — Semester 2 Timetable

Interactive whole-school specialist timetable (Kindy, Pre-Primary and Years 1–6).

**Live site:** https://btrpchev.github.io/tapping-s2-timetable/ (link-shareable with staff; not search-indexed)

## What's here
- `index.html` / `Tapping_S2_Specialist_Timetable.html` — the interactive app (open in any browser).
- `Tapping_S2_Specialist_Timetable.xlsx` — Excel version.
- `Tapping_S2_Verification_Report.md` — checks, DOTT ledger and notes.

## How it's built
The site is generated, not hand-edited. Source of truth:
- `solution.json` — the solved Years 1–6 specialist grid.
- `ece-data.js` — Kindy / Pre-Primary data and relief cover.
- `changelog.json` — the "Recent updates" shown on the home page.

Rebuild all outputs with:

```
npm install      # first time only
node build-outputs.js
```

This regenerates `index.html`, the named HTML, the Excel file and the verification report.

## Updating
Changes are made to the data files above, then `node build-outputs.js` is run and the result is committed and pushed. GitHub Pages redeploys automatically.
