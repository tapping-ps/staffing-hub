/* =====================================================================
   Tapping PS — Semester 2 specialist timetable SOLVER  (v2)
   ---------------------------------------------------------------------
   Years 1-6 (Kindy/PP added separately). Hard constraints, in priority:
     1. Collaboration windows (7 teams)
     2. Period 6 release (per-class quota; 19 total)
     3. Leadership blocks (Carter fixed Mon P3)
     4. Subject quota per class
     5. STEM is a back-to-back double (consecutive period numbers, same day)
     6. PE only on Thursday, year teams synchronised across Lowndes/Bell/TBC
   Soft (priority order): Mon P0/P1 vacant; specialist DOTT early (teach late);
   max 2 specialist periods per class per day; DOTT equity.

   Locked decisions (Brad):
     - STEM/PE collab = Thursday (Uhe joins from office). Now lands Thu P5.
     - Peak = 20 teaching periods; 1 junior Auslan moved to Walker.
     - P0 counts toward DOTT.
   ===================================================================== */
"use strict";
const fs = require("fs");
const path = require("path");

const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const TRIES = +arg("--tries", 8000);
const MAXPERDAY = +arg("--maxday", 2);
const CAPN = +arg("--cap", 4000);
const NOP6 = process.argv.includes("--nop6");
const DBG = process.argv.includes("--dbg");
let gDepth = 0, gStuck = "";
let SEED = +arg("--seed", 20262);
function rand() { SEED = (SEED * 1664525 + 1013904223) >>> 0; return SEED / 4294967296; }
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = (rand() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }
function choice(a) { return a[(rand() * a.length) | 0]; }

/* ------------------------------- model ------------------------------- */
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const TEACH = ["P1", "P2", "P3", "P4", "P5", "P6"];
const NON_P6 = ["P1", "P2", "P3", "P4", "P5"];
const PMIN = { P0: 25, P1: 45, P2: 45, P3: 45, P4: 45, P5: 45, P6: 60 };
const dIdx = d => DAYS.indexOf(d);
const pIdx = p => TEACH.indexOf(p);
// STEM doubles: consecutive period NUMBERS (a break between P3/P4 or P5/P6 is allowed
// per Brad, who named "P5 and P6" as valid). Monday (P1,P2) excluded by Mon-P1 rule.
const PAIRS = [["P1", "P2"], ["P2", "P3"], ["P3", "P4"], ["P4", "P5"], ["P5", "P6"]];

const CLASSES = [
  { code: "LA6",  yrs: [5, 6], teacher: "Dunbar",      team: "Y5-6", grad: false },
  { code: "LA7",  yrs: [5],    teacher: "Pigott",      team: "Y4-5", grad: false },
  { code: "LA8",  yrs: [6],    teacher: "Crisp",       team: "Y5-6", grad: false },
  { code: "LA9",  yrs: [5, 6], teacher: "Rose",        team: "Y5-6", grad: false },
  { code: "LA14", yrs: [3, 4], teacher: "Sheehy",      team: "Y3-4", grad: false },
  { code: "LA15", yrs: [3],    teacher: "Mitchell",    team: "Y3-4", grad: false },
  { code: "LA16", yrs: [4],    teacher: "Thieme",      team: "Y4-5", grad: false },
  { code: "LA17", yrs: [4, 5], teacher: "Law",         team: "Y4-5", grad: false },
  { code: "LA18", yrs: [2],    teacher: "Bouwmeester", team: "Y2",   grad: true  },
  { code: "LA19", yrs: [2],    teacher: "Espach",      team: "Y2",   grad: false },
  { code: "LA20", yrs: [2],    teacher: "Hendron",     team: "Y2",   grad: false },
  { code: "LA21", yrs: [3],    teacher: "Sirr-Davis",  team: "Y3-4", grad: false },
  { code: "LA22", yrs: [1],    teacher: "Webb",        team: "Y1",   grad: true  },
  { code: "LA23", yrs: [1],    teacher: "Hutchings",   team: "Y1",   grad: true  },
  { code: "LA24", yrs: [1],    teacher: "Moore",       team: "Y1",   grad: true  },
];
const C = Object.fromEntries(CLASSES.map(c => [c.code, c]));
const isJunior = c => c.yrs.every(y => y <= 2);

const SDAYS = {
  Uhe: ["Tue", "Wed"], TBC: ["Thu"], Lowndes: DAYS.slice(),
  Carter: ["Mon", "Tue", "Wed"], Peak: ["Tue", "Wed", "Thu", "Fri"],
  Walker: ["Wed", "Thu"], Bell: ["Thu", "Fri"],
};
const SROOM = { Uhe: "STEM Class", Lowndes: "STEM Lab", TBC: "Gym", Bell: "Gym", Carter: "Art room", Peak: "Music room", Walker: "Auslan room" };
const SFTE = { Uhe: 0.4, TBC: 0.2, Lowndes: 1.0, Carter: 0.6, Peak: 0.8, Walker: 0.4, Bell: 0.4 };

// Peak room logic: Auslan shares the Auslan room with Walker (Wed & Thu), so Peak's
// Auslan must avoid those days -> all on Friday. Performing Arts on Tue/Wed/Thu.
// This keeps every Peak day single-room (no Auslan/PA flip-flop within a day).
const PEAK_AUS_DAYS = ["Fri"];
const PEAK_PA_DAYS = ["Tue", "Wed", "Thu"];

const UHE_STEM = ["LA6", "LA7", "LA8", "LA9", "LA16", "LA17"];
const WALK_AUS = ["LA6", "LA7", "LA8", "LA9", "LA14", "LA15", "LA16", "LA17", "LA21"];
const JUN_AUS  = ["LA18", "LA19", "LA20", "LA22", "LA23", "LA24"];

const TEAMS = { "Y1": ["LA22", "LA23", "LA24"], "Y2": ["LA18", "LA19", "LA20"], "Y3-4": ["LA14", "LA15", "LA21"], "Y4-5": ["LA7", "LA16", "LA17"], "Y5-6": ["LA6", "LA8", "LA9"] };
const TEAM_OF = {}; Object.entries(TEAMS).forEach(([t, cs]) => cs.forEach(c => TEAM_OF[c] = t));
const SPEC_TEAMS = { Arts: { day: "Wed", members: ["Peak", "Carter", "Walker"] }, "STEM/PE": { day: "Thu", members: ["Bell", "Lowndes"] } };

const GRADS = CLASSES.filter(c => c.grad).map(c => c.code);
// classroom leaders get an EXTRA Health period (Bell), on top of their 285, as
// their leadership release. Bell only works Thu/Fri and Thu is full of PE, so Friday.
// Pre-placed (Bell free Fri P2-P4 after his ECE covers at P1/P5) for a clean solve.
// Leadership release for Rose (LA9) & Sirr-Davis (LA21) is added deterministically
// as a post-process overlay in build-outputs (Bell Health, Friday), NOT searched
// here - it pushed the grid into an unsolvable zero-slack packing. The solver keeps
// the clean 94-period Years 1-6 grid; Bell's Friday P2-P4 stay free for the overlay.
const P6QUOTA = {}; CLASSES.forEach(c => P6QUOTA[c.code] = c.grad ? 2 : 1);
// LA18's Health is a Bell-Friday 45-min lesson (off-P6), so LA18 needs only its base P6.
// LA22 keeps 2 P6s (PE + one 60-min from another subject) so Webb stays level with the
// other grads at +75 (Brad's equity fix); LA18 carries the structural +60 (accepted).
P6QUOTA.LA18 = 1;
// LA24's Health is gone (grad days instead), so it needs only its base P6 (PE Thu P6).
P6QUOTA.LA24 = 1;

const REQDOTT = {}; Object.keys(SFTE).forEach(s => { if (SFTE[s] != null) REQDOTT[s] = Math.round(270 * SFTE[s]); });

/* --------- PE block: Thursday, year teams synchronised (Lowndes/Bell/TBC) ---------
   P5 left free => STEM/PE collab. Y1 (grads) in P6 (they need 2 P6 anyway). */
const PE_TEACHERS = ["Lowndes", "Bell", "TBC"];
// Thu P1 = STEM/PE collaboration meeting (no PE early, so classes stay in for
// literacy). PE runs P2-P6; Y4-5 (was P1) now at P3; Y1 grads stay in P6.
const PE_PLAN = [
  { p: "P2", team: "Y5-6" },
  { p: "P3", team: "Y4-5" },
  { p: "P4", team: "Y3-4" },
  { p: "P5", team: "Y2" },
  { p: "P6", team: "Y1" },
];

/* --------- Year 1 collaboration window anchor ---------
   Y1 (LA22,23,24) do PE together in Thu P6, which is 60 min (not a 45-min
   window), so their 45-min collaboration window is anchored here on Wed P4,
   where Carter+Peak+Walker all work. LA24 is the one junior Auslan that moves
   to Walker. These three lessons are pre-placed (and skipped in buildLessons). */
const Y1_ANCHOR = { day: "Wed", p: "P4", lessons: [
  { cls: "LA22", subj: "Visual Art", spec: "Carter" },
  { cls: "LA23", subj: "Performing Arts", spec: "Peak" },
  { cls: "LA24", subj: "Auslan", spec: "Walker" },
] };
const ANCHORED = new Set(Y1_ANCHOR.lessons.map(l => l.cls + "|" + l.subj));

/* --------- Uhe STEM doubles (fixed day + periods) ---------
   Tue: LA8(P1,P2) LA9(P3,P4) LA6(P5,P6) ; Wed: LA17(P1,P2) LA16(P3,P4) LA7(P5,P6) */
const UHE_FIXED = [
  { cls: "LA8", day: "Tue", periods: ["P1", "P2"] },
  { cls: "LA9", day: "Tue", periods: ["P3", "P4"] },
  { cls: "LA6", day: "Tue", periods: ["P5", "P6"] },
  { cls: "LA17", day: "Wed", periods: ["P1", "P2"] },
  { cls: "LA16", day: "Wed", periods: ["P3", "P4"] },
  { cls: "LA7", day: "Wed", periods: ["P5", "P6"] },
];

/* --------- lessons to be SOLVED (PE + Uhe STEM are pre-placed) --------- */
let LID = 0;
const mk = (cls, subj, specs, kind, p6, daysOnly) => ({ id: "L" + (LID++), cls, subj, specs, kind, p6, daysOnly });
function buildLessons() {
  const out = [];
  const add = (code, subj, specs, kind, p6, daysOnly) => { if (!ANCHORED.has(code + "|" + subj)) out.push(mk(code, subj, specs, kind, p6, daysOnly)); };
  for (const c of CLASSES) {
    const code = c.code;
    // LA21's STEM stays off Friday so Bell keeps a Friday slot free for Sirr-Davis'
    // leadership release (LA9 has no placeable Friday subjects, so it is safe).
    if (!UHE_STEM.includes(code)) add(code, "STEM", ["Lowndes"], "double", "maybe",
      code === "LA21" ? ["Mon", "Tue", "Wed", "Thu"] : null);
    add(code, "Visual Art", ["Carter"], "single", "maybe");
    add(code, "Performing Arts", ["Peak"], "single", "maybe", PEAK_PA_DAYS);   // Peak PA: Tue/Wed/Thu
    // Auslan: seniors -> Walker; juniors -> Peak (the single junior->Walker, LA24, is anchored)
    add(code, "Auslan", WALK_AUS.includes(code) ? ["Walker"] : ["Peak"], "single", "maybe",
      WALK_AUS.includes(code) ? null : PEAK_AUS_DAYS);                          // Peak Auslan: Friday only
    // Grad Health: LA18 & LA22 take theirs with Bell on Friday (45-min, off-P6) - this
    // replaces the old build-time overlay and frees Lowndes P6 supply (her Fri P6 now
    // covers Nikki's LA1). LA23/LA24 keep a 60-min P6 Health.
    if (c.grad) {
      if (code === "LA18" || code === "LA22") add(code, "Health", ["Bell"], "single", "no", ["Fri"]);
      // LA24 (Moore): grad Health removed 2026-07-03 - delivered as grad days instead
      // (Lis's freed Wed P6 covers Parkin's LA2 grad DOTT; see ece-data externalCover).
      else if (code !== "LA24") add(code, "Health", ["Bell", "Lowndes"], "single", "must");
    }
  }
  return out;
}

/* --------------------------- solver state --------------------------- */
function newState() { return { classAt: {}, specAt: {}, placed: [], teach: {}, p6cls: {}, clsDay: {}, fixed: [] }; }
const ck = (c, d, p) => c + "|" + d + "|" + p;
const sk = (s, d, p) => s + "|" + d + "|" + p;
const classFree = (st, c, d, p) => !st.classAt[ck(c, d, p)];
const specFree = (st, s, d, p) => !st.specAt[sk(s, d, p)];

function specBlocked(st, sp, d, p) {
  if (d === "Mon" && p === "P1") return true;
  // Carter leadership (PBS) moved Mon P3 -> Mon P1 (P1 is blocked for teaching anyway,
  // so this frees her Mon P3 for a class - Brad item 5).
  // Friday P1 = whole-school assembly: no specialist teaches any class then.
  if (d === "Fri" && p === "P1") return true;
  // Lowndes' Fri P6 is reserved: she covers Nikki Luca's LA1 (PP) DOTT then (ECE overlay).
  if (sp === "Lowndes" && d === "Fri" && p === "P6") return true;
  // Lowndes' Wed P6 is reserved: she covers Caroline Parkin's LA2 (PP) grad DOTT (ECE overlay).
  if (sp === "Lowndes" && d === "Wed" && p === "P6") return true;
  if (st.win) {
    if (st.win.Arts && d === st.win.Arts.day && p === st.win.Arts.p && SPEC_TEAMS.Arts.members.includes(sp)) return true;
    if (st.win.STEMPE && d === st.win.STEMPE.day && p === st.win.STEMPE.p && ["Bell", "Lowndes"].includes(sp)) return true;
    if (st.win.PeakLead && sp === "Peak" && d === st.win.PeakLead.day && p === st.win.PeakLead.p) return true;
  }
  return false;
}
function place(st, L, d, periods, sp, fixed) {
  L.day = d; L.periods = periods; L.spec = sp;
  for (const p of periods) { st.classAt[ck(L.cls, d, p)] = L; st.specAt[sk(sp, d, p)] = L; if (p === "P6") st.p6cls[L.cls] = (st.p6cls[L.cls] || 0) + 1; }
  st.teach[sp] = (st.teach[sp] || 0) + periods.length;
  st.clsDay[L.cls + "|" + d] = (st.clsDay[L.cls + "|" + d] || 0) + periods.length;
  (fixed ? st.fixed : st.placed).push(L);
}
function unplace(st, L) {
  for (const p of L.periods) { delete st.classAt[ck(L.cls, L.day, p)]; delete st.specAt[sk(L.spec, L.day, p)]; if (p === "P6") st.p6cls[L.cls]--; }
  st.teach[L.spec] -= L.periods.length;
  st.clsDay[L.cls + "|" + L.day] -= L.periods.length;
  const i = st.placed.indexOf(L); if (i >= 0) st.placed.splice(i, 1);
  L.day = L.periods = L.spec = undefined;
}
const MAXTEACH = { Peak: 20, Carter: 15, Walker: 10, Bell: 12, Lowndes: 26, TBC: 6, Uhe: 12 };

function candidates(st, L) {
  const out = [];
  for (const sp of L.specs) {
    const add = L.kind === "double" ? 2 : 1;
    if ((st.teach[sp] || 0) + add > (MAXTEACH[sp] ?? 99)) continue;
    const days = SDAYS[sp];
    if (L.kind === "double") {
      for (const d of days) {
        if (L.daysOnly && !L.daysOnly.includes(d)) continue;
        if ((st.clsDay[L.cls + "|" + d] || 0) > MAXPERDAY - 2) continue;  // room for a 2-period double
        for (const [a, b] of PAIRS) {
          if (d === "Mon" && a === "P1") continue;
          if (specBlocked(st, sp, d, a) || specBlocked(st, sp, d, b)) continue;
          if (!specFree(st, sp, d, a) || !specFree(st, sp, d, b)) continue;
          if (!classFree(st, L.cls, d, a) || !classFree(st, L.cls, d, b)) continue;
          if (!NOP6 && b === "P6" && (st.p6cls[L.cls] || 0) >= P6QUOTA[L.cls]) continue;
          out.push({ d, periods: [a, b], sp });
        }
      }
    } else {
      const periods = L.p6 === "must" ? ["P6"] : L.p6 === "no" ? NON_P6 : TEACH;
      for (const d of days) for (const p of periods) {
        if (L.daysOnly && !L.daysOnly.includes(d)) continue;
        if (d === "Mon" && p === "P1") continue;
        if (specBlocked(st, sp, d, p)) continue;
        if (!specFree(st, sp, d, p)) continue;
        if (!classFree(st, L.cls, d, p)) continue;
        if (!NOP6 && p === "P6" && (st.p6cls[L.cls] || 0) >= P6QUOTA[L.cls]) continue;
        if ((st.clsDay[L.cls + "|" + d] || 0) >= MAXPERDAY) continue;
        out.push({ d, periods: [p], sp });
      }
    }
  }
  return out;
}
function p6Reachable(st, remaining) {
  const need = {}, can = {};
  CLASSES.forEach(c => { need[c.code] = P6QUOTA[c.code] - (st.p6cls[c.code] || 0); can[c.code] = 0; });
  for (const L of remaining) { if (L.p6 === "no") continue; can[L.cls]++; }
  for (const c of CLASSES) if (need[c.code] > can[c.code]) return false;
  return true;
}

// Value ordering for the feasibility search: mostly random (good for tightly
// coupled CSPs via restarts), with a gentle nudge to teach later (#7) and to
// co-locate team-mates (helps form collaboration windows). Kept small so it
// never dominates feasibility.
const prevP = p => TEACH[pIdx(p) - 1];
const nextP = p => TEACH[pIdx(p) + 1];
const isLowerPh = code => Math.max(...C[code].yrs) <= 3;   // Lower Primary = up to Yr 3
const phaseOf = code => (Math.max(...C[code].yrs) >= 4 ? "U" : "L");
// Graded early-period penalty (Brad: "even early morning learning is priority"):
// a specialist lesson at P1 is worst, then P2, then P3; afternoons are free.
const EARLY_W = { P1: 8, P2: 5, P3: 2, P4: 0, P5: 0, P6: 0 };
function scoreCand(st, L, c) {
  let s = rand() * 10;
  const team = TEAM_OF[L.cls];
  // (item 1) reward releasing team-mates together -> shared collaboration DOTT
  if (team) { let m = 0; for (const x of TEAMS[team]) if (x !== L.cls) for (const p of c.periods) if (st.classAt[ck(x, c.d, p)]) m++; s += m * 9; }
  // (item 4 + early-morning priority) graded push out of P1 > P2 > P3; Lower Primary harder
  s -= c.periods.reduce((a, p) => a + EARLY_W[p], 0) * (isLowerPh(L.cls) ? 2 : 1);
  // (item 3) Carter Visual Art: sit beside a same-phase class so she doesn't repack resources
  if (c.sp === "Carter") { const ph = phaseOf(L.cls);
    for (const p of c.periods) for (const adj of [prevP(p), nextP(p)]) {
      const nb = adj && st.specAt[sk("Carter", c.d, adj)];
      if (nb && phaseOf(nb.cls) === ph) s += 6;
    } }
  s += c.periods.reduce((a, p) => a + pIdx(p), 0) * 0.4;   // #7 gentle: teach later
  return s;
}

function chooseWindows() {
  // MORE MORNING LEARNING (Brad): specialist idle time (meetings, leadership, DOTT)
  // stacks at P1 first, then P2, then P3 - teaching pushes as late as possible so
  // classes keep the early morning with their own teacher. Meetings therefore sit at P1.
  const artsP = "P1";
  // Peak's Events leadership: its own period, earliest available on Tue-Thu. Never
  // Friday P1 - that stays as her DOTT because she runs the assembly (Brad).
  let pl = null;
  for (const p of ["P1", "P2", "P3"]) { for (const d of shuffle(["Tue", "Wed", "Thu"])) { if (d === "Wed" && p === artsP) continue; pl = { day: d, p }; break; } if (pl) break; }
  return { Arts: { day: "Wed", p: artsP }, STEMPE: { day: "Thu", p: "P1" }, PeakLead: pl };
}

function buildOnce() {
  const st = newState();
  st.win = chooseWindows(); if (!st.win) return null;
  // pre-place PE block
  for (const slot of PE_PLAN) {
    const cls = TEAMS[slot.team];
    for (let i = 0; i < 3; i++) {
      const L = mk(cls[i], "PE", [PE_TEACHERS[i]], "single", "fixed");
      place(st, L, "Thu", [slot.p], PE_TEACHERS[i], true);
    }
  }
  // pre-place Uhe STEM doubles
  for (const f of UHE_FIXED) { const L = mk(f.cls, "STEM", ["Uhe"], "double", "fixed"); place(st, L, f.day, f.periods, "Uhe", true); }
  // pre-place Year 1 collaboration window anchor
  for (const a of Y1_ANCHOR.lessons) { const L = mk(a.cls, a.subj, [a.spec], "single", "fixed"); place(st, L, Y1_ANCHOR.day, [Y1_ANCHOR.p], a.spec, true); }

  const all = buildLessons();
  const remaining = new Set(all);
  let nodes = 0, CAP = 4000;

  function rec() {
    if (remaining.size === 0) return true;
    if (++nodes > CAPN) return false;
    if (!NOP6 && !p6Reachable(st, [...remaining])) return false;
    let pick = null, pc = null, best = 1e9;
    for (const L of remaining) { const cs = candidates(st, L); if (!cs.length) { if (DBG && st.placed.length > gDepth) { gDepth = st.placed.length; gStuck = `${L.cls} ${L.subj} (placed ${st.placed.length}/${all.length})`; } return false; } if (cs.length < best) { best = cs.length; pick = L; pc = cs; if (best === 1) break; } }
    pc.forEach(c => c._s = scoreCand(st, pick, c)); pc.sort((a, b) => b._s - a._s);
    remaining.delete(pick);
    const lim = pc.length;
    for (let i = 0; i < lim; i++) { const c = pc[i]; place(st, pick, c.d, c.periods, c.sp); if (rec()) return true; unplace(st, pick); }
    remaining.add(pick);
    return false;
  }
  return rec() ? st : null;
}

/* ----------------------- windows / validation ---------------------- */
const allPlaced = st => st.fixed.concat(st.placed);
function classTeamWindows(st) {
  const res = {};
  for (const [t, cs] of Object.entries(TEAMS)) {
    let found = null;
    for (const d of DAYS) { for (const p of NON_P6) { if (cs.every(c => st.classAt[ck(c, d, p)])) { found = { day: d, p }; break; } } if (found) break; }
    res[t] = found;
  }
  return res;
}
function specTeamWindows(st) {
  const a = st.win.Arts, s = st.win.STEMPE;
  return {
    Arts: SPEC_TEAMS.Arts.members.every(m => specFree(st, m, a.day, a.p)) ? a : null,
    "STEM/PE": ["Bell", "Lowndes"].every(m => specFree(st, m, s.day, s.p)) ? s : null,
  };
}
function allWindows(st) { const all = { ...classTeamWindows(st), ...specTeamWindows(st) }; return { ok: Object.values(all).every(Boolean), all }; }

function validate(st) {
  const e = [], P = allPlaced(st);
  for (const c of CLASSES) {
    const g = {}; P.filter(L => L.cls === c.code).forEach(L => g[L.subj] = (g[L.subj] || 0) + L.periods.length);
    const need = { STEM: 2, "Visual Art": 1, "Performing Arts": 1, Auslan: 1, PE: 1 }; if (c.grad) need.Health = 1;
    for (const [s, n] of Object.entries(need)) if ((g[s] || 0) !== n) e.push(`${c.code} ${s} ${g[s] || 0}/${n}`);
  }
  if (!NOP6) { for (const c of CLASSES) { const n = st.p6cls[c.code] || 0; if (n !== P6QUOTA[c.code]) e.push(`${c.code} P6 ${n}/${P6QUOTA[c.code]}`); }
  const p6tot = Object.values(st.p6cls).reduce((a, b) => a + b, 0); if (p6tot !== 17) e.push(`P6 total ${p6tot}`); }
  for (const L of P) for (const p of L.periods) {
    if (!SDAYS[L.spec].includes(L.day)) e.push(`${L.spec} off-day ${L.day}`);
    if (L.day === "Mon" && p === "P1") e.push(`Mon P1 used ${L.cls}`);
    if (L.day === "Fri" && p === "P1") e.push(`Fri P1 used ${L.cls} (assembly)`);
  }
  P.filter(L => L.subj === "Health").forEach(L => {
    if (L.cls === "LA18" || L.cls === "LA22") { if (L.day !== "Fri" || L.spec !== "Bell" || L.periods[0] === "P6") e.push(`${L.cls} Health must be Bell Fri non-P6`); }
    else if (L.periods[0] !== "P6") e.push(`${L.cls} Health not P6`);
  });
  P.filter(L => L.subj === "PE").forEach(L => { if (L.day !== "Thu") e.push(`${L.cls} PE not Thu`); });
  P.filter(L => L.subj === "STEM").forEach(L => { if (pIdx(L.periods[1]) - pIdx(L.periods[0]) !== 1) e.push(`${L.cls} STEM not consecutive`); });
  for (const k in st.clsDay) if (st.clsDay[k] > MAXPERDAY) e.push(`${k} ${st.clsDay[k]} periods/day`);
  // Peak room logic: Auslan only Friday; no day mixes Peak PA and Peak Auslan
  const peakDaySubj = {};
  P.filter(L => L.spec === "Peak").forEach(L => { (peakDaySubj[L.day] = peakDaySubj[L.day] || new Set()).add(L.subj); });
  for (const d in peakDaySubj) {
    if (peakDaySubj[d].has("Auslan") && d !== "Fri") e.push(`Peak Auslan on ${d} (must be Fri)`);
    if (peakDaySubj[d].size > 1) e.push(`Peak mixes ${[...peakDaySubj[d]].join("+")} on ${d}`);
  }
  return e;
}
function dottReport(st) {
  const rows = [];
  for (const sp of ["Uhe", "Lowndes", "Carter", "Peak", "Walker", "Bell", "TBC"]) {
    let free = 0; for (const d of SDAYS[sp]) for (const p of TEACH) if (specFree(st, sp, d, p) && !specBlocked0(st, sp, d, p)) free += PMIN[p];
    const dott = free + 25 * SDAYS[sp].length;
    rows.push({ sp, taught: st.teach[sp] || 0, dott, req: REQDOTT[sp] ?? null });
  }
  return rows;
}
function specBlocked0(st, sp, d, p) { // leadership-only (not DOTT). Carter Mon P1, Peak lead.
  if (sp === "Carter" && d === "Mon" && p === "P1") return true;
  if (st.win.PeakLead && sp === "Peak" && d === st.win.PeakLead.day && p === st.win.PeakLead.p) return true;
  return false;
}
function equitySpread(st) { const v = dottReport(st).filter(r => r.req != null && r.sp !== "Uhe").map(r => r.dott); return Math.max(...v) - Math.min(...v); }
// (item 1) periods where 2+ team-mates share a release; all-3 counts triple
function teamShared(st) { let n = 0; for (const cs of Object.values(TEAMS)) for (const d of DAYS) for (const p of TEACH) { const k = cs.filter(c => st.classAt[ck(c, d, p)]).length; if (k >= 2) n += (k === 3 ? 3 : 1); } return n; }
// HARD FLOOR (Brad): every team must have >=2 periods where all three teachers are
// released together. Y4-5 is exempt - its three classes all ride Uhe's fixed staggered
// STEM doubles, which makes a second full-team period structurally impossible.
function teamFloorOK(st) {
  for (const [t, cs] of Object.entries(TEAMS)) {
    if (t === "Y4-5") continue;
    let n = 0;
    for (const d of DAYS) for (const p of TEACH) if (cs.every(c => st.classAt[ck(c, d, p)])) n++;
    if (n < 2) return false;
  }
  return true;
}
// (item 4 + early-morning priority) graded early load: P1 lessons cost most, then P2, P3
function morningLoad(st) { let n = 0; for (const L of allPlaced(st)) for (const p of L.periods) n += EARLY_W[p] * (isLowerPh(L.cls) ? 2 : 1); return n; }
// (item 3) Carter Visual Art same-phase adjacencies across her Mon-Wed
function artAdj(st) { let n = 0; for (const d of ["Mon", "Tue", "Wed"]) for (let i = 0; i < TEACH.length - 1; i++) { const a = st.specAt[sk("Carter", d, TEACH[i])], b = st.specAt[sk("Carter", d, TEACH[i + 1])]; if (a && b && phaseOf(a.cls) === phaseOf(b.cls)) n++; } return n; }

/* ------------------------------- search ----------------------------- */
let best = null, bestScore = -1, fb = null, fbScore = -1, fValid = 0, fWin = 0, fDott = 0;
for (let t = 0; t < TRIES; t++) {
  if (t % 200 === 0) process.stderr.write(`  try ${t}: valid=${fValid} win=${fWin} dott=${fDott}\n`);
  const st = buildOnce(); if (!st) continue;
  if (validate(st).length) continue; fValid++;
  const w = allWindows(st); if (!w.ok) continue; fWin++;
  if (!teamFloorOK(st)) continue; // every team (except Y4-5) needs >=2 full-team shared periods
  st.windows = w.all;
  const mon = allPlaced(st).filter(L => L.day === "Mon").length;
  const early = allPlaced(st).filter(L => L.spec !== "Uhe" && L.subj !== "PE").reduce((a, L) => a + L.periods.reduce((x, p) => x + pIdx(p), 0), 0);
  // coordinated-redesign objective: team-shared DOTT up, early-morning teaching down
  // (graded P1>P2>P3 - Brad: early morning learning is the priority), Art phase-aligned
  const sc = 100000 - equitySpread(st) * 4 - mon * 2 + early + teamShared(st) * 18 - morningLoad(st) * 2 + artAdj(st) * 10;
  const dr = dottReport(st); const dottOK = dr.every(r => r.req == null || r.sp === "Uhe" || r.dott >= r.req);
  if (!dottOK) { if (sc > fbScore) { fbScore = sc; fb = st; } continue; }
  fDott++;
  if (sc > bestScore) { bestScore = sc; best = st; }
  if (fDott >= 25) break;
}
if (!best && fb) { best = fb; console.log("NOTE: using best windows-valid grid; a specialist may sit slightly under DOTT."); }
if (!best) { console.log(`No valid grid with all windows in ${TRIES} tries. valid=${fValid} win=${fWin}`); if (DBG) console.log(`deepest=${gDepth}/${"?"} last stuck on: ${gStuck}`); process.exit(1); }

/* ------------------------------- output ----------------------------- */
console.log(`Solved (STEM doubles; PE Thu synchronised; max ${MAXPERDAY}/class/day). valid=${fValid} win=${fWin} dottOK=${fDott}`);
console.log("\n=== COLLABORATION WINDOWS ===");
for (const [t, w] of Object.entries(best.windows)) {
  if (TEAMS[t]) console.log(`  ${t.padEnd(8)} ${w.day} ${w.p}  -> ${TEAMS[t].map(c => c + "/" + best.classAt[ck(c, w.day, w.p)].spec).join(", ")}`);
  else console.log(`  ${t.padEnd(8)} ${w.day} ${w.p}  -> free: ${SPEC_TEAMS[t].members.join(", ")}${t === "STEM/PE" ? " (+Uhe office)" : ""}`);
}
console.log("\n=== PERIOD 6 ===");
allPlaced(best).filter(L => L.periods.includes("P6")).sort((a, b) => dIdx(a.day) - dIdx(b.day) || a.cls.localeCompare(b.cls)).forEach(L => console.log(`  ${L.day} ${L.cls.padEnd(5)} ${L.subj.padEnd(15)} ${L.spec}`));
console.log("\n=== LOAD & DOTT ===");
dottReport(best).forEach(r => console.log(`  ${r.sp.padEnd(8)} teach ${String(r.taught).padStart(2)}  DOTT ${String(r.dott).padStart(3)}m / ${r.req == null ? "  -" : r.req + "m"}  ${r.req == null || r.sp === "Uhe" ? "" : (r.dott >= r.req ? "OK" : "SHORT")}`));
console.log("\nVALIDATION:", validate(best).length ? validate(best).join("; ") : "PASS");

const out = {
  meta: { school: "Tapping Primary School", semester: "Semester 2", generated: "2026-06-24" },
  windows: best.windows, specTeams: SPEC_TEAMS,
  lessons: allPlaced(best).flatMap(L => L.periods.map(p => ({ cls: L.cls, subj: L.subj, spec: L.spec, day: L.day, period: p, room: SROOM[L.spec] }))),
};
fs.writeFileSync(path.join(__dirname, "solution.json"), JSON.stringify(out, null, 2));
console.log("\nWrote solution.json");
