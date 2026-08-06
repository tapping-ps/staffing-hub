# Tapping Primary School Staffing Hub

One web app, one address, one login (coming): the school's staffing tools in a
single place. Built for Tapping Primary School (WA). Owner: Brad Trpchev
(principal). This repo is the ONLY repo for the hub — modules are folders in
this app, never separate repos or separate sites.

**Live site:** https://tapping-ps.github.io/staffing-hub/ (link-shareable with
staff; not search-indexed — `noindex` meta plus `robots.txt`).

## Hard rules

- **No student names or student information anywhere in this system.** Staff
  names are fine. This is a departmental compliance line, not a preference.
- **Copy, never migrate.** The hub is built from copies of the school's
  existing working tools. The originals (`btrpchev/tapping-s2-timetable` live
  timetable, `btrpchev/DOTT-Tracker`, the offline EA tracker) stay untouched
  and operational until staff are switched over deliberately.
- **No Microsoft 365 / Compass / Department system integration.** Blocked by
  the Department. Sending email TO education.wa.edu.au inboxes via an email
  service is the one allowed direction (used later by relief days).
- Secrets live in `.env.local` (gitignored), never in the repo.

## How it works

- React 19 + Vite. No router yet; module screens are added to `App.jsx` as
  they are built. The tile registry is `src/modules.js` — one entry per
  module with a status (`live` / `building` / `planned`).
- School brand tokens: `src/styles/tokens.css` (deep teal #2d7671, bright
  teal #29a39a, sage #8abbb7, mist #d4dfde). Logo: `public/tapping-logo.svg`.
  No external fonts or CDNs — the site is self-contained.
- **Deploy:** `npm run build` writes the site to `docs/`, which is COMMITTED.
  GitHub Pages serves the `main` branch `/docs` folder. No Actions, no build
  secrets. After any change: build, commit (including `docs/`), push — Pages
  redeploys automatically.

```
npm install
npm run dev      # local dev server
npm run build    # writes docs/ (commit this)
```

## Module plan (in order)

1. **App shell** — this. Branded home with module tiles.
2. **Supabase** — one project, the hub's only database and login. Accounts
   restricted to @education.wa.edu.au. Two edit tiers enforced by row-level
   security: minor keys (school officers) and master keys (principal and
   deputies). Nothing that needs auth ships publicly before RLS exists —
   the anon key ends up readable in the served bundle, so the database must
   protect itself.
3. **DOTT module** — copy of the DOTT tracker (already Supabase-shaped),
   plus auth and shared multi-admin state.
4. **Specialist timetable** — read-only teacher/class views from the solved
   Semester 2 data, then admin edit screens with the timetable rules
   enforced in code. Domain rules live in the source project's docs; port
   them here when the module is built.
5. **EA timetables** — built from EA timetables supplied by the deputy
   (staff names and times only). NOT a port of the offline EA tracker,
   which stores student data and stays offline as his planning tool.
6. **Duty roster** — rebuild from the deputy's design.
7. **Relief days** — only after the modules share one database AND Brad has
   written the relief policies. Never introduce relief or external staffing
   without Brad's explicit sign-off.

## Working agreements

- Everyday data edits happen in the app by logged-in admins. Structural
  changes (re-solves, redesigns, new rules) happen through Claude in this
  repo.
- Each change that staff can see gets a clear commit message; keep the
  module tiles' statuses in `src/modules.js` honest.
