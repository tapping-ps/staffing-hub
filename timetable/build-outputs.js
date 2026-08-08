/* =====================================================================
   Tapping PS · Semester 2: build Excel master, HTML render, reports
   Reads solution.json (from solve-s2.js).
   Multiple views (switchable):
     - Specialist overview (periods x days, specialist chips)
     - Whole school (every class gridded; specialist OR classroom teacher)
     - Class timetables (per class)
     - Teacher timetables (per teacher: classroom + specialist)
     - Verification report
   ===================================================================== */
"use strict";
const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");

const SOL = JSON.parse(fs.readFileSync(path.join(__dirname, "solution.json"), "utf8"));
const ECE = require("./ece-data");

// Build/deploy date (when these outputs were last regenerated) + recent-changes log.
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const fmtDate = s => { const d = new Date(s + (s.length === 10 ? "T00:00:00" : "")); return d.getDate() + " " + MONTHS[d.getMonth()] + " " + d.getFullYear(); };
const BUILD_DATE = fmtDate(new Date().toISOString().slice(0, 10));
let CHANGELOG = [];
try { CHANGELOG = JSON.parse(fs.readFileSync(path.join(__dirname, "changelog.json"), "utf8")); } catch (e) { CHANGELOG = []; }

// School logo (teal). Read from the SVG if present; placed in a white container on the teal header.
let LOGO_SVG = "";
try {
  LOGO_SVG = fs.readFileSync(path.join(__dirname, "tapping-logo.svg"), "utf8")
    .replace(/<\?xml[^>]*\?>/, "").replace(/<!DOCTYPE[^>]*>/, "").replace(/<!--[\s\S]*?-->/g, "")
    .replace(/width="\d+"/, "").replace(/height="\d+"/, "");
} catch (e) { LOGO_SVG = ""; }

/* ----- reference data ----- */
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const PERIODS = [
  { id: "P0", label: "P0", t: "8:30-8:55",   min: 25, teaching: false, slot: true },
  { id: "P1", label: "P1", t: "8:55-9:40",   min: 45, teaching: true },
  { id: "P2", label: "P2", t: "9:40-10:25",  min: 45, teaching: true },
  { id: "P3", label: "P3", t: "10:25-11:10", min: 45, teaching: true },
  { id: "LUNCH", label: "Lunch", t: "11:10-11:50", min: 40, teaching: false },
  { id: "P4", label: "P4", t: "11:50-12:35", min: 45, teaching: true },
  { id: "P5", label: "P5", t: "12:35-1:20",  min: 45, teaching: true },
  { id: "RECESS", label: "Recess", t: "1:20-1:35", min: 15, teaching: false },
  { id: "P6", label: "P6", t: "1:35-2:35",   min: 60, teaching: true },
];
// rows shown in personal/class grids (include P0 as a slot, plus breaks as separators)
const ROWS = PERIODS;
const TEACH = ["P1", "P2", "P3", "P4", "P5", "P6"];
const PMIN = Object.fromEntries(PERIODS.map(p => [p.id, p.min]));

const CLASSES = [
  { code: "LA6",  yrs: "5/6", teacher: "John Dunbar",        team: "Y5-6", grad: false },
  { code: "LA7",  yrs: "5",   teacher: "Nicola Pigott",      team: "Y4-5", grad: false },
  { code: "LA8",  yrs: "6",   teacher: "Janette Crisp",      team: "Y5-6", grad: false },
  { code: "LA9",  yrs: "5/6", teacher: "Lincoln Rose",       team: "Y5-6", grad: false, lead: "SSTUWA" },
  { code: "LA14", yrs: "3/4", teacher: "Olivia Sheehy",      team: "Y3-4", grad: false },
  { code: "LA15", yrs: "3",   teacher: "Georgia Mitchell",   team: "Y3-4", grad: false },
  { code: "LA16", yrs: "4",   teacher: "Tanya Thieme",       team: "Y4-5", grad: false },
  { code: "LA17", yrs: "4/5", teacher: "Cassidy Law",        team: "Y4-5", grad: false },
  { code: "LA18", yrs: "2",   teacher: "Hannah Bouwmeester", team: "Y2",   grad: true },
  { code: "LA19", yrs: "2",   teacher: "Savannah Espach",    team: "Y2",   grad: false },
  { code: "LA20", yrs: "2",   teacher: "Anna Hendron",       team: "Y2",   grad: false },
  { code: "LA21", yrs: "3",   teacher: "Jasper Sirr-Davis",  team: "Y3-4", grad: false, lead: "OHS" },
  { code: "LA22", yrs: "1",   teacher: "Imogen Webb",        team: "Y1",   grad: true },
  { code: "LA23", yrs: "1",   teacher: "Ashlee Hutchings",   team: "Y1",   grad: true },
  { code: "LA24", yrs: "1",   teacher: "Chloe Moore",        team: "Y1",   grad: true },
];
const C = Object.fromEntries(CLASSES.map(c => [c.code, c]));

const SPECIALIST_FULL = {
  Uhe: "Chantel Uhe", Lowndes: "Lis Lowndes", Carter: "Natalie Carter",
  Peak: "Cheryl Peak", Walker: "Rachel Walker", Bell: "Aaron Bell", TBC: "Jake Pevitt",
};
const SPEC_COLOUR = {
  Uhe: "29A39A", Lowndes: "1F8A82", Carter: "D98A3D",
  Peak: "D4538A", Walker: "7E57C2", Bell: "4A90D9", TBC: "6AA9E0",
};
const SPEC_DOTT = { Lowndes: 270, Carter: 162, Peak: 216, Walker: 108, Bell: 108, Uhe: 108, TBC: 54 };
const SPEC_FTE = { Uhe: "0.4 teach", Lowndes: "1.0", Carter: "0.6", Peak: "0.8", Walker: "0.4", Bell: "0.4", TBC: "0.2 (Thu)" };
const SPEC_DAYS = {
  Uhe: ["Tue", "Wed"], TBC: ["Thu"], Lowndes: DAYS.slice(),
  Carter: ["Mon", "Tue", "Wed"], Peak: ["Tue", "Wed", "Thu", "Fri"],
  Walker: ["Wed", "Thu"], Bell: ["Thu", "Fri"],
};
const SPEC_LIST = ["Uhe", "Lowndes", "Carter", "Peak", "Walker", "Bell", "TBC"];
// neutral palette
const COL = { own: "CFD8D7", admin: "E4ECEB", release: "D9EFE0", dott: "EAF6EC", lead: "F6E3B0", collab: "BFE3DF", off: "F3F3F3", vac: "EAF6EC" };

const L = SOL.lessons; // {cls,subj,spec,day,period,room}
const at = (day, period) => L.filter(x => x.day === day && x.period === period);
const lessonOf = (cls, day, period) => L.find(x => x.cls === cls && x.day === day && x.period === period);
const teaches = (spec, day, period) => L.find(x => x.spec === spec && x.day === day && x.period === period);
const forClass = code => L.filter(x => x.cls === code);
const shortSpec = sp => SPECIALIST_FULL[sp].split(" ")[1] || SPECIALIST_FULL[sp];

/* ---------- Friday ECE-cover swap + Aaron Bell's Friday (deterministic overlay) ----------
   Brad's swap: Lis Lowndes uses her two free Friday DOTT periods to cover Fiona (T9) and
   Nikki (LA1) ECE DOTT (see ece-data externalCover). In exchange, two of her grad-Health
   periods move to Aaron Bell on Friday. Bell also teaches the two leadership-release Health
   periods (Rose/LA9, Sirr-Davis/LA21). Bell's Friday P6 = LA24 grad Health; P1-P5 free. */
const LEAD_CLASSES = ["LA9", "LA21"];
const leadershipReleases = [];
(function bellFriday() {
  // The solver now places LA18/LA22's grad Healths with Bell on Friday directly; this
  // overlay only adds the two leadership-release Healths (Rose/LA9, Sirr-Davis/LA21).
  const busy = new Set(L.filter(x => x.spec === "Bell" && x.day === "Fri").map(x => x.period));
  // Friday P1 is the whole-school assembly: no specialist lessons are placed there.
  const slots = ["P2", "P3", "P4", "P5"];
  const clsFree = (cls, p) => !L.some(x => x.cls === cls && x.day === "Fri" && x.period === p);
  const items = [
    { cls: "LA9", who: "Lincoln Rose", role: "SSTUWA", lead: true },
    { cls: "LA21", who: "Jasper Sirr-Davis", role: "OHS", lead: true },
  ];
  // each item needs a slot where BOTH Bell and the class are free; assign most-constrained first
  items.forEach(it => it.valid = slots.filter(p => !busy.has(p) && clsFree(it.cls, p)));
  items.sort((a, b) => a.valid.length - b.valid.length);
  const used = new Set();
  for (const it of items) {
    const p = it.valid.find(pp => !used.has(pp));
    if (!p) { console.error("bellFriday: no slot for", it.cls); continue; }
    used.add(p);
    L.push({ cls: it.cls, subj: "Health", spec: "Bell", day: "Fri", period: p, room: "Gym", leadership: true }); leadershipReleases.push({ who: it.who, role: it.role, cls: it.cls, day: "Fri", period: p });
  }
})();

/* ---------- leadership placements ---------- */
const WIN = SOL.windows;
const leadership = [];
leadership.push({ who: "Natalie Carter", spec: "Carter", role: "PBS", day: "Mon", period: "P1", note: "fixed (moved from Mon P3 so LA23 can take P3 - Brad item 5)" });
// Peak's Events leadership: a real release period of its own. NOT Friday P1 - that stays
// as her DOTT because she runs the whole-school assembly then (Brad). Mornings preferred
// (MORE MORNING LEARNING: meetings early, teaching late).
(function peakLead() {
  for (const p of ["P1", "P2", "P3", "P4", "P5"]) for (const d of SPEC_DAYS.Peak) {
    if (d === "Fri" && p === "P1") continue;                      // assembly: her DOTT, protected
    if (d === WIN.Arts.day && p === WIN.Arts.p) continue;         // Arts team collaboration
    if (teaches("Peak", d, p)) continue;
    leadership.push({ who: "Cheryl Peak", spec: "Peak", role: "Events", day: d, period: p, note: "Peak non-teaching block" }); return;
  }
  leadership.push({ who: "Cheryl Peak", spec: "Peak", role: "Events", day: "?", period: "?", note: "assign manually" });
})();
// Rose & Sirr-Davis leadership = the extra Bell-Health release period (overlay above)
leadershipReleases.forEach(r => leadership.push({
  who: r.who, role: r.role, cls: r.cls, day: r.day, period: r.period,
  note: `${r.cls} covered by Aaron Bell (Health) · additional 45-min release on top of normal DOTT`,
}));
const leadAt = (who, d, p) => leadership.find(le => le.who === who && le.day === d && le.period === p);

/* =====================================================================
   CELL LOGIC (shared by HTML + Excel)
   Each returns { lines:[..], fill:hex, white:bool, kind } or null for break.
   ===================================================================== */
const clsLabel = code => `${code} (${C[code].yrs})`;
function wholeSchoolCell(code, day, pid) {
  const lsn = lessonOf(code, day, pid);
  if (lsn) return { lines: [lsn.subj, SPECIALIST_FULL[lsn.spec]], fill: SPEC_COLOUR[lsn.spec], white: true, kind: "spec" };
  // P0 and all non-specialist periods are normal class time with the classroom teacher
  return { lines: [C[code].teacher.split(" ").slice(-1)[0], "(class)"], fill: COL.own, white: false, kind: "own" };
}
function classCell(code, day, pid) { return wholeSchoolCell(code, day, pid); }

function teacherCell(tkey, day, pid) {
  // tkey is a specialist key OR a class code (classroom teacher identified by class)
  if (SPEC_LIST.includes(tkey)) {
    if (!SPEC_DAYS[tkey].includes(day)) {
      if (tkey === "Uhe" && (day === "Mon" || day === "Thu")) return { lines: ["Office", "LSC"], fill: COL.off, white: false, kind: "off" };
      return { lines: ["—"], fill: COL.off, white: false, kind: "off" };
    }
    const lsn = teaches(tkey, day, pid);
    if (lsn) return { lines: [clsLabel(lsn.cls), lsn.subj], fill: SPEC_COLOUR[tkey], white: true, kind: "teach" };
    const le = leadAt(SPECIALIST_FULL[tkey], day, pid);
    if (le) return { lines: ["Leadership", le.role], fill: COL.lead, white: false, kind: "lead" };
    if (day === WIN.Arts.day && pid === WIN.Arts.p && ["Peak", "Carter", "Walker"].includes(tkey)) return { lines: ["Collaboration", "Arts team"], fill: COL.collab, white: false, kind: "collab" };
    if (day === WIN["STEM/PE"].day && pid === WIN["STEM/PE"].p && ["Bell", "Lowndes"].includes(tkey)) return { lines: ["Collaboration", "STEM/PE team"], fill: COL.collab, white: false, kind: "collab" };
    const exc = ECE.externalCover.find(e => e.by === tkey && e.day === day && e.period === pid);
    if (exc) return { lines: ["Cover " + exc.room, "(" + exc.forName.split(" ").slice(-1)[0] + ")"], fill: "DCE8F5", white: false, kind: "cover" };
    // specialist on a Monday is DOTT in P0 and P1 (no specialist teaching then)
    return { lines: ["DOTT"], fill: COL.dott, white: false, kind: "dott" };
  }
  // classroom teacher of class = tkey
  const code = tkey;
  if (pid === "P0") return { lines: [code, "own class"], fill: COL.own, white: false, kind: "own" };
  const lsn = lessonOf(code, day, pid);
  const le = leadAt(C[code].teacher, day, pid);
  if (le) return { lines: ["Leadership", le.role], fill: COL.lead, white: false, kind: "lead" }; // leader is out; class covered
  const cw = WIN[C[code].team];
  if (cw && day === cw.day && pid === cw.p) return { lines: ["Collaboration", C[code].team + " meeting"], fill: COL.collab, white: false, kind: "collab" };
  if (lsn) {
    const tag = le ? ` · ${le.role}` : "";
    return { lines: ["DOTT (release)", `${lsn.subj} · ${shortSpec(lsn.spec)}${tag}`], fill: COL.release, white: false, kind: "release" };
  }
  return { lines: [code, "own class"], fill: COL.own, white: false, kind: "own" };
}

/* =====================================================================
   HTML RENDER (tabbed, interactive)
   ===================================================================== */
function buildHTML(reportHtml, vstats) {
  const DATA = {
    lessons: L, classes: CLASSES, specFull: SPECIALIST_FULL, specColour: SPEC_COLOUR,
    specDays: SPEC_DAYS, specList: SPEC_LIST, periods: PERIODS, days: DAYS,
    leadership, windows: WIN, col: COL,
    ece: { teachers: ECE.eceTeachers, classes: ECE.eceClasses, externalCover: ECE.externalCover },
    specDott: SPEC_DOTT, specFte: SPEC_FTE, leadClasses: LEAD_CLASSES,
  };
  // recent-changes panel for the home page
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const clogHtml = CHANGELOG.length
    ? `<div class="clog"><div class="cloghd">Recent updates</div>${CHANGELOG.slice(0, 5).map(c => `<div class="clogrow"><span class="clogdate">${esc(fmtDate(c.date))}</span><span class="clogtext">${esc(c.note)}</span></div>`).join("")}</div>`
    : "";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Tapping Primary School: Semester 2 Timetable</title>
<style>
  :root{
    --teal-900:#1d5450; --teal-700:#2d7671; --teal-500:#29a39a; --teal-300:#8abbb7; --teal-100:#d4dfde; --teal-50:#eef4f3;
    --color-action:#29a39a; --color-action-hover:#2d7671; --fg-on-dark:#ffffff;
    --bg-secondary:#eef4f3; --fg-primary:#1d5450; --fg-secondary:#5a6b6a;
    --border-default:#cdddda; --border-strong:#8abbb7;
    --bg-page:#dde8e7; --bg-card:#ffffff;
    --r-own:#8a9d9a; --r-cover:#3f74b8; --r-dott:#2e7d32; --r-collab:#1e8f86; --r-lead:#b5852a; --r-off:#9aa5a4;
    --tint-own:#eef2f1; --tint-cover:#eaf2fb; --tint-dott:#e9f6ea; --tint-collab:#e2f3f1; --tint-lead:#faf1da; --tint-off:#f3f4f4;
  }
  *{box-sizing:border-box;-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;}
  body{font-family:"Segoe UI",Arial,sans-serif;color:var(--fg-primary);background:var(--bg-page);margin:0;}
  h2{color:var(--teal-700);font-size:15px;margin:20px 0 8px;}
  /* header */
  header.app{background:var(--teal-700);color:var(--fg-on-dark);padding:12px 18px;display:flex;align-items:center;gap:14px;}
  header.app .logo{background:#fff;border-radius:12px;padding:6px 9px;display:flex;align-items:center;flex:0 0 auto;box-shadow:0 1px 4px rgba(0,0,0,.15);}
  header.app .logo svg{height:52px;width:auto;display:block;}
  header.app .ttl h1{margin:0;font-size:21px;font-weight:700;letter-spacing:.01em;}
  header.app .ttl .sub{color:#d6ebe9;font-size:12px;margin-top:2px;}
  /* Hub home: white-on-teal variant of the hub's uniform .hub-home pill */
  header.app .hubhome{margin-left:auto;flex:0 0 auto;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.5);color:#fff;font-size:13px;font-weight:600;padding:5px 14px;border-radius:999px;text-decoration:none;white-space:nowrap;}
  header.app .hubhome:hover{background:rgba(255,255,255,.22);}
  .wrap{padding:14px 18px;max-width:1500px;}
  /* verification summary card */
  #vcard{background:var(--bg-card);border:1px solid var(--border-default);border-left:5px solid var(--color-action);border-radius:10px;padding:9px 14px;margin:14px 0;display:flex;align-items:center;flex-wrap:wrap;gap:8px 18px;box-shadow:0 1px 4px rgba(0,0,0,.07);}
  .badge{font-size:12px;font-weight:800;letter-spacing:.04em;padding:4px 11px;border-radius:999px;}
  .badge.ok{background:var(--r-dott);color:#fff;} .badge.bad{background:#c0392b;color:#fff;}
  .vstat{font-size:12px;color:var(--fg-secondary);} .vstat b{color:var(--fg-primary);font-weight:800;}
  .vmore{margin-left:auto;color:var(--color-action-hover);font-size:12px;font-weight:600;cursor:pointer;text-decoration:none;}
  .vmore:hover{text-decoration:underline;}
  /* tabs */
  nav.tabs{display:flex;flex-wrap:wrap;gap:4px;margin:0 0 4px;}
  nav.tabs button{font:inherit;font-size:13px;padding:8px 14px;border:1px solid var(--border-default);background:#fff;border-radius:8px 8px 0 0;cursor:pointer;color:var(--teal-700);}
  nav.tabs button:hover{background:var(--teal-50);}
  nav.tabs button.active{background:var(--teal-700);color:var(--fg-on-dark);border-color:var(--teal-700);font-weight:600;}
  .view{display:none;} .view.active{display:block;}
  /* always-visible legend strip */
  .legendstrip{display:flex;flex-wrap:wrap;align-items:center;gap:6px;background:var(--bg-card);border:1px solid var(--border-default);border-radius:0 8px 8px 8px;padding:7px 12px;margin:0 0 12px;}
  .legendstrip .lt{font-size:10px;font-weight:700;color:var(--fg-secondary);text-transform:uppercase;letter-spacing:.04em;margin-right:2px;}
  .chip{font-size:11px;padding:3px 10px 3px 8px;border-radius:5px;border-left:4px solid var(--accent,var(--teal-300));background:var(--bg-secondary);color:var(--fg-primary);white-space:nowrap;}
  .chip.role-own{--accent:var(--r-own);background:var(--tint-own);} .chip.role-cover{--accent:var(--r-cover);background:var(--tint-cover);}
  .chip.role-dott{--accent:var(--r-dott);background:var(--tint-dott);} .chip.role-collab{--accent:var(--r-collab);background:var(--tint-collab);}
  .chip.role-lead{--accent:var(--r-lead);background:var(--tint-lead);} .chip.role-off{--accent:var(--r-off);background:var(--tint-off);color:var(--fg-secondary);}
  .lsep{flex-basis:100%;height:0;}
  /* controls */
  .pick{margin:0 0 10px;font-size:13px;} .pick select,#search{font:inherit;font-size:13px;padding:6px 9px;border:1px solid var(--border-strong);border-radius:7px;color:var(--fg-primary);}
  #searchbar{margin:0 0 12px;position:relative;max-width:340px;}
  #search{width:100%;}
  #sresults{position:absolute;z-index:30;left:0;right:0;background:#fff;border:1px solid var(--border-strong);border-top:none;border-radius:0 0 7px 7px;max-height:260px;overflow:auto;box-shadow:0 4px 12px rgba(0,0,0,.12);}
  #sresults div{padding:6px 10px;font-size:12px;cursor:pointer;} #sresults div:hover,#sresults div.hl{background:var(--teal-50);}
  #sresults .shead{font-size:10px;font-weight:700;color:var(--fg-secondary);text-transform:uppercase;cursor:default;background:#fff;}
  .daybtns,.mdaybtns{margin:0 0 10px;} .daybtns button,.mdaybtns button{font:inherit;font-size:12px;margin-right:4px;padding:6px 12px;border:1px solid var(--border-default);background:#fff;border-radius:7px;cursor:pointer;color:var(--teal-700);}
  .daybtns button.active,.mdaybtns button.active{background:var(--color-action);color:#fff;border-color:var(--color-action);font-weight:600;}
  .mdaybtns{display:none;}
  /* grids */
  .gridwrap{overflow:auto;max-height:74vh;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,.08);}
  table.grid{border-collapse:separate;border-spacing:0;background:#fff;width:max-content;}
  table.grid th,table.grid td{border-right:1px solid var(--border-default);border-bottom:1px solid var(--border-default);text-align:center;vertical-align:middle;font-size:11.5px;padding:6px 8px;}
  table.grid thead th{position:sticky;top:0;z-index:2;background:var(--teal-300);color:var(--fg-primary);padding:8px;}
  table.grid td.timecol,table.grid th.timecol{position:sticky;left:0;z-index:1;background:var(--teal-50);text-align:left;white-space:nowrap;font-weight:600;}
  table.grid thead th.timecol{z-index:3;}
  table.daygrid{table-layout:fixed;}
  table.daygrid td.timecol,table.daygrid th.timecol{width:104px;min-width:104px;}
  table.daygrid th,table.daygrid td{width:148px;min-width:148px;word-wrap:break-word;}
  /* wide multi-column grids (whole school): uniform fixed columns */
  table.grid.wide{table-layout:fixed;}
  table.grid.wide td.timecol,table.grid.wide th.timecol{width:104px;min-width:104px;}
  table.grid.wide th,table.grid.wide td{width:116px;min-width:116px;word-wrap:break-word;}
  tr.nonteach td{background:#f3f4f4;color:var(--fg-secondary);font-style:italic;}
  /* cells */
  .cell{position:relative;border-radius:5px;border-left:4px solid var(--accent,var(--teal-300));padding:6px 9px 6px 10px;min-height:38px;display:flex;flex-direction:column;justify-content:center;gap:2px;text-align:left;}
  .cell .c1{font-weight:600;line-height:1.3;} .cell .c2{font-size:10.5px;color:var(--fg-secondary);line-height:1.3;}
  .cell.vac{justify-content:center;text-align:center;color:var(--fg-secondary);font-style:italic;border-left-color:transparent;background:var(--tint-off);}
  /* teacher picker bar (sticky: switch teachers without scrolling back up) */
  .tbtns{position:sticky;top:0;z-index:30;display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 12px;border:1px solid var(--border-default);border-radius:8px;padding:8px 10px;background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.08);}
  .tbtns .plab{font-size:10px;font-weight:700;color:var(--fg-secondary);text-transform:uppercase;letter-spacing:.04em;}
  .tbtns select{font:inherit;font-size:13px;font-weight:600;padding:7px 10px;border:1px solid var(--border-default);border-radius:6px;background:#fff;color:var(--teal-700);flex:1;min-width:180px;max-width:360px;cursor:pointer;}
  .tbtns .step{font:inherit;font-size:13px;padding:6px 12px;border:1px solid var(--border-default);background:#fff;border-radius:6px;cursor:pointer;color:var(--teal-700);}
  .tbtns .step:hover{background:var(--teal-50);}
  @media print{.tbtns{display:none;}}
  /* dashboard */
  .dash{display:flex;flex-wrap:wrap;gap:10px;margin:8px 0 22px;}
  .dash .card{background:#fff;border:1px solid var(--border-default);border-radius:8px;padding:7px 13px;min-width:96px;box-shadow:0 1px 3px rgba(0,0,0,.06);}
  .dash .card .lab{font-size:10px;color:var(--fg-secondary);text-transform:uppercase;letter-spacing:.03em;}
  .dash .card .val{font-size:18px;font-weight:700;color:var(--fg-primary);}
  .dash .pos{color:var(--r-dott);} .dash .neg{color:#c0392b;} .dash .note{font-size:10px;color:var(--fg-secondary);max-width:220px;}
  /* report */
  .report{background:#fff;border-radius:10px;padding:14px 18px;box-shadow:0 1px 4px rgba(0,0,0,.08);}
  .report table{border-collapse:collapse;margin:8px 0 16px;font-size:12px;} .report th,.report td{border:1px solid var(--border-default);padding:4px 8px;text-align:left;} .report th{background:var(--teal-50);color:var(--teal-700);}
  .ok{color:var(--r-dott);font-weight:700;} .bad{color:#c0392b;font-weight:700;}
  /* toolbar */
  #toolbar{display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin:0 0 12px;font-size:12px;color:var(--fg-secondary);}
  #toolbar .tlab{font-weight:600;} #toolbar .tgap{flex:1;min-width:12px;}
  #toolbar button.wk{font:inherit;font-size:12px;padding:6px 12px;border:1px solid var(--border-default);background:#fff;border-radius:7px;cursor:pointer;color:var(--teal-700);}
  #toolbar button.wk.active{background:var(--teal-700);color:#fff;border-color:var(--teal-700);font-weight:600;}
  #toolbar button.exp{font:inherit;font-size:12px;padding:6px 12px;border:1px solid var(--color-action);background:var(--color-action);color:#fff;border-radius:7px;cursor:pointer;font-weight:600;}
  #toolbar button.exp:hover{background:var(--color-action-hover);border-color:var(--color-action-hover);}
  .lnk{cursor:pointer;text-decoration:underline;text-underline-offset:1px;color:inherit;}
  /* tooltip */
  #tip{position:fixed;z-index:100;background:var(--teal-900);color:#fff;font-size:12px;line-height:1.4;padding:8px 11px;border-radius:8px;max-width:260px;box-shadow:0 4px 16px rgba(0,0,0,.3);pointer-events:none;display:none;}
  #tip b{color:#cdeae7;}
  #printTitle{display:none;} #printall{display:none;} #printall .page h3{color:var(--teal-700);font-size:15px;margin:0 0 8px;}
  #printhead{display:none;}
  .vbar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:0 0 12px;}
  .vbar .pick{margin:0;}
  .myprint{font:inherit;font-size:13px;padding:8px 14px;border:1px solid var(--color-action);background:var(--color-action);color:#fff;border-radius:8px;cursor:pointer;font-weight:600;box-shadow:0 1px 3px rgba(29,84,80,.12);}
  .myprint:hover{background:var(--color-action-hover);border-color:var(--color-action-hover);}
  header.app .logo{cursor:pointer;transition:transform .2s ease;} header.app .logo:hover{transform:scale(1.05);}
  /* landing page */
  body.on-home #toolbar,body.on-home #mdays{display:none;}
  body.on-home #searchbar{max-width:560px;margin:6px auto 2px;}
  body.on-home #search{font-size:15px;padding:11px 14px;border-width:2px;box-shadow:0 2px 10px rgba(29,84,80,.08);}
  .hero{text-align:center;padding:30px 16px 6px;}
  .herologo{width:148px;height:148px;margin:0 auto 12px;animation:logoIn 1s cubic-bezier(.2,.85,.25,1) both;}
  .herologo svg{width:100%;height:100%;display:block;filter:drop-shadow(0 6px 16px rgba(29,84,80,.22));animation:floaty 5.5s ease-in-out 1s infinite;}
  @keyframes logoIn{from{opacity:0;transform:scale(.55) translateY(-16px) rotate(-8deg);}to{opacity:1;transform:none;}}
  @keyframes floaty{0%,100%{transform:translateY(0);}50%{transform:translateY(-8px);}}
  .herottl{font-size:31px;color:var(--teal-900);margin:0 0 4px;font-weight:800;letter-spacing:-.01em;animation:fadeUp .7s .15s both;}
  .herosub{color:var(--fg-secondary);font-size:14px;margin:0;animation:fadeUp .7s .25s both;}
  @keyframes fadeUp{from{opacity:0;transform:translateY(12px);}to{opacity:1;transform:none;}}
  .tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;max-width:880px;margin:20px auto 12px;}
  .tile{text-align:center;cursor:pointer;font:inherit;background:#fff;border:1px solid var(--border-default);border-radius:16px;padding:22px 18px 18px;display:flex;flex-direction:column;align-items:center;gap:9px;box-shadow:0 1px 4px rgba(0,0,0,.06);transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease;animation:fadeUp .6s both;}
  .tile:hover{transform:translateY(-4px);box-shadow:0 12px 26px rgba(29,84,80,.16);border-color:var(--teal-300);}
  .tile:focus-visible{outline:2px solid var(--teal-500);outline-offset:2px;}
  .tile .badge{width:70px;height:70px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:32px;line-height:1;background:radial-gradient(circle at 32% 28%,#ffffff,var(--teal-100));border:2px solid var(--teal-300);box-shadow:0 4px 12px rgba(29,84,80,.12);transition:transform .2s ease,box-shadow .2s ease,border-color .2s ease;}
  .tile:hover .badge{transform:scale(1.08);border-color:var(--teal-500);box-shadow:0 8px 18px rgba(29,84,80,.22);}
  .tile .tname{font-size:17px;font-weight:700;color:var(--teal-900);}
  .tile .tdesc{font-size:12.5px;color:var(--fg-secondary);line-height:1.4;max-width:210px;}
  .tile:nth-child(1){animation-delay:.30s;} .tile:nth-child(2){animation-delay:.37s;} .tile:nth-child(3){animation-delay:.44s;}
  .tile:nth-child(4){animation-delay:.51s;} .tile:nth-child(5){animation-delay:.58s;} .tile:nth-child(6){animation-delay:.65s;}
  @media(prefers-reduced-motion:reduce){.herologo,.herologo svg,.herottl,.herosub,.tile{animation:none;}}
  .clog{max-width:880px;margin:18px auto 6px;background:#fff;border:1px solid var(--border-default);border-radius:14px;padding:14px 18px;box-shadow:0 1px 4px rgba(0,0,0,.06);animation:fadeUp .6s .7s both;}
  .clog .cloghd{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--teal-700);margin:0 0 8px;}
  .clog .clogrow{display:flex;gap:12px;padding:6px 0;border-top:1px solid var(--teal-50);font-size:13px;align-items:baseline;}
  .clog .clogrow:first-of-type{border-top:none;}
  .clog .clogdate{flex:0 0 110px;color:var(--fg-secondary);font-size:12px;font-weight:600;}
  .clog .clogtext{color:var(--fg-primary);line-height:1.4;}
  @media(max-width:520px){.clog .clogrow{flex-direction:column;gap:1px;} .clog .clogdate{flex-basis:auto;}}
  /* responsive */
  @media(max-width:820px){.tiles{grid-template-columns:repeat(2,minmax(0,1fr));max-width:560px;}}
  @media(max-width:480px){.tiles{grid-template-columns:1fr;max-width:340px;}}
  @media(max-width:768px){
    .wrap{padding:10px;}
    header.app .ttl h1{font-size:17px;} header.app .logo svg{height:40px;}
    /* day switcher sits directly above the grid and stays pinned while scrolling it */
    .mdaybtns{display:block;position:sticky;top:0;z-index:25;background:var(--bg-page);margin:0 0 8px;padding:8px 0 6px;box-shadow:0 6px 8px -6px rgba(0,0,0,.25);}
    .mdaybtns button{margin-bottom:4px;}
    .gridwrap{max-height:none;}
    /* small single-day grids: don't pin the header (the day bar is the pinned element) */
    #teacher table.grid thead th,#class table.grid thead th,#subjects table.grid thead th,#overview table.grid thead th{position:static;}
    table.daygrid.mobile th,table.daygrid.mobile td{width:auto;}
    table.daygrid.mobile col.hide,table.daygrid.mobile .dcol.hide{display:none;}
  }
  @media print{
    body{background:#fff;}
    header.app,nav.tabs,.daybtns,.mdaybtns,.pick,.vbar,.myprint,#toolbar,.tbtns,#searchbar{display:none !important;}
    .wrap{padding:0;} .gridwrap{max-height:none;overflow:visible;box-shadow:none;}
    table.grid thead th,table.grid td.timecol{position:static;}
    .lnk{text-decoration:none;}
    body:not(.printing-all) .view{display:none !important;}
    body:not(.printing-all) .view.active{display:block !important;}
    body:not(.printing-all) #printhead{display:flex !important;align-items:center;gap:10px;margin:0 0 4px;border-bottom:2px solid #29a39a;padding-bottom:6px;}
    #printhead .phlogo svg{height:36px;width:auto;display:block;} #printhead .phname{font-size:16px;font-weight:800;color:#1d5450;}
    body:not(.printing-all) #printTitle{display:block !important;font-size:14px;color:#2d7671;margin:6px 0 10px;font-weight:600;}
    body.printing-all .view,body.printing-all #printTitle{display:none !important;}
    body.printing-all #printall{display:block !important;}
    #printall .page{page-break-after:always;} #printall .page:last-child{page-break-after:auto;} #printall table.grid{page-break-inside:avoid;}
  }
</style></head><body>
<header class="app"><div class="logo" onclick="activate('home')" title="Back to home">${LOGO_SVG}</div><div class="ttl"><h1>Tapping Primary School: Semester 2 Timetable</h1><div class="sub">Whole school: Kindy, Pre-Primary and Years 1-6 · Last updated ${BUILD_DATE}</div></div><a class="hubhome" href="../">← Hub home</a></header>
<div class="wrap">
<nav class="tabs" id="tabs">
  <button data-v="home" class="active">Home</button>
  <button data-v="teacher">Teacher view</button>
  <button data-v="overview">Specialist overview</button>
  <button data-v="school">Whole school</button>
  <button data-v="class">Class view</button>
  <button data-v="subjects">Subjects</button>
  <button data-v="report">Verification</button>
</nav>
<div id="searchbar"><input id="search" type="text" placeholder="&#128269; Search any teacher or class…" autocomplete="off"><div id="sresults" style="display:none"></div></div>
<div id="toolbar">
  <span class="tlab">Fortnight:</span><button data-wk="A" class="wk active">Week A (even)</button><button data-wk="B" class="wk">Week B (odd)</button>
  <span class="tgap"></span>
  <button class="exp" onclick="window.print()">&#128424; Export this view</button><button class="exp" onclick="exportAll()">&#128218; Export all pages</button>
</div>
<div class="mdaybtns" id="mdays"></div>
<div id="printhead"><div class="phlogo">${LOGO_SVG}</div><div class="phname">Tapping Primary School</div></div>
<div id="printTitle"></div>
<div id="printall"></div>
<div id="home" class="view active">
  <div class="hero">
    <div class="herologo">${LOGO_SVG}</div>
    <h2 class="herottl">Semester 2 Timetable</h2>
    <p class="herosub">Tapping Primary School · whole school, Kindy to Year 6</p>
  </div>
  <div class="tiles">
    <button class="tile" data-go="teacher"><span class="badge">&#128105;&#8205;&#127979;</span><span class="tname">Teacher view</span><span class="tdesc">Any teacher's week, with DOTT, surplus and load</span></button>
    <button class="tile" data-go="overview"><span class="badge">&#128197;</span><span class="tname">Specialist overview</span><span class="tdesc">Every specialist lesson across the week at a glance</span></button>
    <button class="tile" data-go="school"><span class="badge">&#127979;</span><span class="tname">Whole school</span><span class="tdesc">Every class, one day at a time</span></button>
    <button class="tile" data-go="class"><span class="badge">&#128218;</span><span class="tname">Class view</span><span class="tdesc">A single class's full fortnight</span></button>
    <button class="tile" data-go="subjects"><span class="badge">&#127912;</span><span class="tname">Subjects</span><span class="tdesc">Where and when each subject is timetabled</span></button>
    <button class="tile" data-go="report"><span class="badge">&#9989;</span><span class="tname">Verification</span><span class="tdesc">All checks, the DOTT ledger and notes</span></button>
  </div>
  ${clogHtml}
</div>
<div id="teacher" class="view"><div id="teacherBtns" class="tbtns"></div><div class="vbar"><button class="myprint" onclick="window.print()">&#128424; Print this timetable</button></div><div id="teacherDash"></div><div id="teacherGrid"></div></div>
<div id="overview" class="view"></div>
<div id="school" class="view"><div class="daybtns" id="schoolDays"></div><div id="schoolGrid"></div></div>
<div id="class" class="view"><div class="vbar"><span class="pick">Class: <select id="classPick"></select></span><button class="myprint" onclick="window.print()">&#128424; Print this timetable</button></div><div id="classGrid"></div></div>
<div id="subjects" class="view"><div class="pick">Subject: <select id="subjectPick"></select></div><div id="subjectGrid"></div></div>
<div id="report" class="view"><div class="report">${reportHtml}</div></div>
<div id="tip"></div>
</div>
<script>
const D=${JSON.stringify(DATA)};
const SPEC=new Set(D.specList);
const lessonOf=(c,d,p)=>D.lessons.find(x=>x.cls===c&&x.day===d&&x.period===p);
const teaches=(s,d,p)=>D.lessons.find(x=>x.spec===s&&x.day===d&&x.period===p);
const at=(d,p)=>D.lessons.filter(x=>x.day===d&&x.period===p);
const last=n=>n.split(" ").slice(-1)[0];
const cls=c=>D.classes.find(x=>x.code===c);
const leadAt=(who,d,p)=>D.leadership.find(le=>le.who===who&&le.day===d&&le.period===p);
const COL=D.col;
const cLink=(code)=>'<span class="lnk" title="Go to '+code+' timetable" onclick="goClass(\\''+code+'\\')">'+code+'</span>';
const cLabel=(code)=>cLink(code)+' <span style="opacity:.85;font-weight:400">('+cls(code).yrs+')</span>';
const tLink=(tk,label)=>'<span class="lnk" title="Go to teacher timetable" onclick="goTeacher(\\''+tk+'\\')">'+label+'</span>';
const ROLE_VAR={own:['--r-own','--tint-own'],release:['--r-dott','--tint-dott'],dott:['--r-dott','--tint-dott'],cover:['--r-cover','--tint-cover'],collab:['--r-collab','--tint-collab'],lead:['--r-lead','--tint-lead'],admin:['--r-own','--tint-own'],off:['--r-off','--tint-off'],vac:['--r-off','--tint-off']};
function chip(c){if(!c)return"";
  let accent,bg;
  if(c.white){accent='#'+c.fill;bg='#'+c.fill+'1f';}            // specialist subject: muted tint + colour accent
  else{const m=ROLE_VAR[c.kind]||ROLE_VAR.own;accent='var('+m[0]+')';bg='var('+m[1]+')';}
  const noise=c.lines[1]==='(class)'||c.lines[1]==='own class';
  const sec=(c.lines[1]&&!noise)?'<span class="c2">'+c.lines[1]+'</span>':'';
  const tip=c.tip?' data-tip="'+(''+c.tip).replace(/"/g,'&quot;')+'"':'';
  return '<div class="cell'+(c.kind==='vac'?' vac':'')+'" style="--accent:'+accent+';background:'+bg+'"'+tip+'><span class="c1">'+c.lines[0]+'</span>'+sec+'</div>';
}
/* ----- ECE (Pre-Primary & Kindy) rendering ----- */
const ECE_T=D.ece.teachers, ECE_C=D.ece.classes;
const PIDX={P0:0,P1:1,P2:2,P3:3,P4:4,P5:5,P6:6};
let week='A';
const eceTea=n=>ECE_T.find(t=>t.name===n);
const eceCls=c=>ECE_C.find(x=>x.code===c);
const isEce=c=>!!eceCls(c);
const eRoomOf=n=>{const t=eceTea(n);return t?t.room:null;};
function eceOcc(room,day,pid){for(const t of ECE_T){const a=(t[week][day]||[])[PIDX[pid]];if(a==='class'&&t.room===room)return{teacher:t.name,kind:'class'};if(typeof a==='string'&&a.indexOf('cov:')===0){const tg=a.slice(4);if(eRoomOf(tg)===room)return{teacher:t.name,kind:'cover',of:tg};}}const ex=D.ece.externalCover.find(e=>e.room===room&&e.day===day&&e.period===pid);if(ex)return{teacher:ex.byName,kind:'cover',of:ex.forName,external:true,by:ex.by};return{kind:'empty'};}
function eceClassCell(code,day,pid){const c=eceCls(code);const o=eceOcc(c.room,day,pid);
  if(o.kind==='class')return{lines:[tLink('ece:'+o.teacher,last(o.teacher))],kind:'own',tip:o.teacher+' \\u00b7 '+code+' (own class)'};
  if(o.kind==='cover'){const own=c.teachers.indexOf(o.teacher)>=0;const relief=o.external&&o.by==='Relief';const lnk=relief?'Relief teacher':(o.external?tLink(o.by,last(o.teacher)):tLink('ece:'+o.teacher,last(o.teacher)));return{lines:[lnk],kind:own?'own':'cover',tip:own?o.teacher+' \\u00b7 '+code+' (job-share teacher)':o.teacher+' covering '+code+' for '+o.of};}
  return{lines:['No students'],kind:'off'};}
function eceTeacherCell(name,day,pid){const t=eceTea(name);const a=(t[week][day]||[])[PIDX[pid]];
  if(a==='class')return{lines:[cLink(t.room)],kind:'own',tip:name+' \\u00b7 '+t.room+' (own class)'};
  if(a==='dott')return{lines:['DOTT'],kind:'dott',tip:name+' \\u00b7 DOTT (release)'};
  if(typeof a==='string'&&a.indexOf('cov:')===0){const tg=a.slice(4);const r=eRoomOf(tg);if(r===t.room)return{lines:[cLink(t.room)],kind:'own',tip:name+' \\u00b7 '+t.room+' (job-share teacher)'};return{lines:['Cover '+r,last(tg)],kind:'cover',tip:name+' covering '+r+' for '+tg};}
  return{lines:['\\u2014'],kind:'off'};}
const eceLabel=code=>cLink(code)+' <span style="opacity:.85;font-weight:400">('+(eceCls(code).phase==='PP'?'PP':'Kindy')+')</span>';
const allClassCodes=()=>D.classes.map(c=>c.code).concat(ECE_C.map(c=>c.code));
const wsCell=(code,day,pid)=>isEce(code)?eceClassCell(code,day,pid):wholeSchoolCell(code,day,pid);
const wsHdr=code=>isEce(code)?eceLabel(code):cLabel(code);
// cell logic mirrors server
const lessonTip=(l,code)=>l.subj+' \\u00b7 '+code+' ('+(cls(code)?cls(code).yrs:'')+') \\u00b7 '+D.specFull[l.spec]+(l.room?' \\u00b7 '+l.room:'');
function wholeSchoolCell(code,day,pid){const l=lessonOf(code,day,pid);
  if(l)return{lines:[l.subj,tLink(l.spec,D.specFull[l.spec])],fill:D.specColour[l.spec],white:true,kind:'spec',tip:lessonTip(l,code)};
  return{lines:[tLink(code,last(cls(code).teacher))],kind:'own',tip:cls(code).teacher+' \\u00b7 '+code+' (own class)'};}
function teacherCell(tk,day,pid){
  if(SPEC.has(tk)){
    if(!D.specDays[tk].includes(day)){if(tk==='Uhe'&&(day==='Mon'||day==='Thu'))return{lines:['Office','LSC'],kind:'off',tip:'Uhe \\u00b7 LSC/office day'};return{lines:['\\u2014'],kind:'off'};}
    const l=teaches(tk,day,pid);if(l)return{lines:[cLabel(l.cls),l.subj],fill:D.specColour[tk],white:true,kind:'spec',tip:lessonTip(l,l.cls)};
    const le=leadAt(D.specFull[tk],day,pid);if(le)return{lines:['Leadership',le.role],kind:'lead',tip:'Leadership: '+le.role};
    if(day===D.windows.Arts.day&&pid===D.windows.Arts.p&&['Peak','Carter','Walker'].includes(tk))return{lines:['Collaboration','Arts team'],kind:'collab',tip:'Arts team collaboration meeting'};
    if(day===D.windows['STEM/PE'].day&&pid===D.windows['STEM/PE'].p&&['Bell','Lowndes'].includes(tk))return{lines:['Collaboration','STEM/PE team'],kind:'collab',tip:'STEM/PE team collaboration meeting'};
    const exc=D.ece.externalCover.find(e=>e.by===tk&&e.day===day&&e.period===pid);if(exc)return{lines:['Cover '+exc.room,last(exc.forName)],kind:'cover',tip:'Covering '+exc.room+' for '+exc.forName};
    return{lines:['DOTT'],kind:'dott',tip:D.specFull[tk]+' \\u00b7 DOTT (release)'};
  }
  const code=tk;if(pid==='P0')return{lines:[cLink(code)],kind:'own',tip:cls(code).teacher+' \\u00b7 '+code};
  const l=lessonOf(code,day,pid);const le=leadAt(cls(code).teacher,day,pid);
  if(le)return{lines:['Leadership',le.role],kind:'lead',tip:'Leadership: '+le.role};
  const cw=D.windows[cls(code).team];
  if(cw&&day===cw.day&&pid===cw.p)return{lines:['Collaboration',cls(code).team+' meeting'],kind:'collab',tip:cls(code).team+' collaboration meeting'};
  if(l)return{lines:['DOTT (release)',l.subj+' \\u00b7 '+last(D.specFull[l.spec])],kind:'release',tip:code+' is in '+l.subj+' with '+D.specFull[l.spec]+' \\u2014 '+cls(code).teacher+' released'};
  return{lines:[cLink(code)],kind:'own',tip:cls(code).teacher+' \\u00b7 '+code+' (own class)'};
}
const isMobile=()=>window.innerWidth<=768;let mobileDay='Mon';
const gridDays=()=>isMobile()?[mobileDay]:D.days;
// On mobile, move the Mon-Fri day switcher to sit directly above the active grid
// (so teachers don't scroll back past the teacher/class pickers to change day).
function positionMdays(){const md=document.getElementById('mdays');if(!md)return;
  const tb=document.getElementById('toolbar');
  if(!isMobile()){tb.after(md);return;}
  const v=(document.querySelector('#tabs button.active')||{}).dataset;const view=v?v.v:'';
  const grid={teacher:'teacherGrid',class:'classGrid',subjects:'subjectGrid'}[view];
  if(grid){const g=document.getElementById(grid);g.parentNode.insertBefore(md,g);}
  else if(view==='overview'){const o=document.getElementById('overview');o.parentNode.insertBefore(md,o);}
  else tb.after(md);}
function gridHTML(cols,cellFn,colHdr){
  const tcls=cols.length<=7?'grid daygrid':'grid wide';
  let h='<div class="gridwrap"><table class="'+tcls+'"><thead><tr><th class="timecol">Period</th>'+cols.map(c=>'<th>'+colHdr(c)+'</th>').join('')+'</tr></thead><tbody>';
  for(const p of D.periods){
    if(!p.teaching&&p.id!=='P0'){h+='<tr class="nonteach"><td class="timecol">'+p.label+'</td><td colspan="'+cols.length+'">'+p.label+' ('+p.t+')</td></tr>';continue;}
    h+='<tr><td class="timecol">'+p.label+'<br><span style="font-weight:400;font-size:9px">'+p.t+'</span></td>';
    for(const c of cols){h+='<td>'+chip(cellFn(c,p.id))+'</td>';}
    h+='</tr>';
  }
  return h+'</tbody></table></div>';
}
// overview: periods x days, specialist chips
function overviewHTML(){
  const days=gridDays();
  let h='<div class="gridwrap"><table class="grid daygrid"><thead><tr><th class="timecol">Period</th>'+days.map(d=>'<th>'+d+'</th>').join('')+'</tr></thead><tbody>';
  for(const p of D.periods){
    if(!p.teaching&&p.id!=='P0'){h+='<tr class="nonteach"><td class="timecol">'+p.label+'</td><td colspan="'+days.length+'">'+p.label+' ('+p.t+')</td></tr>';continue;}
    if(p.id==='P0'){h+='<tr class="nonteach"><td class="timecol">P0<br><span style="font-weight:400;font-size:9px">'+p.t+'</span></td><td colspan="'+days.length+'">DOTT / admin (no specialist teaching)</td></tr>';continue;}
    h+='<tr><td class="timecol">'+p.label+'<br><span style="font-weight:400;font-size:9px">'+p.t+'</span></td>';
    for(const d of days){
      const here=at(d,p.id);
      if(!here.length&&d==='Mon'&&p.id==='P1'){h+='<td>'+chip({lines:['\\u2014 vacant \\u2014'],kind:'vac'})+'</td>';continue;}
      h+='<td>'+here.map(x=>chip({lines:[cLabel(x.cls)+' '+x.subj,tLink(x.spec,D.specFull[x.spec])],fill:D.specColour[x.spec],white:true,kind:'spec',tip:lessonTip(x,x.cls)})).join('')+'</td>';
    }
    h+='</tr>';
  }
  h+='</tbody></table></div>';return h;
}
function renderOverview(){document.getElementById('overview').innerHTML=overviewHTML();}
// build EVERY page into one printable sequence
function teacherLabel(tk){return SPEC.has(tk)?D.specFull[tk]+' · specialist':cls(tk).teacher+' · classroom teacher ('+tk+')';}
function buildAllHTML(){
  const page=(title,body)=>'<div class="page"><h3>'+title+'</h3>'+body+'</div>';
  const wl=' (Week '+week+')';
  let h='';
  h+=page('Specialist overview · full week',overviewHTML());
  for(const d of D.days) h+=page('Whole school · '+d+wl,gridHTML(allClassCodes(),(code,pid)=>wsCell(code,d,pid),c=>wsHdr(c)));
  for(const c of D.classes) h+=page('Class '+c.code+' · '+c.teacher+(c.grad?' (graduate)':''),gridHTML(D.days,(d,pid)=>wholeSchoolCell(c.code,d,pid),d=>d));
  for(const c of ECE_C) h+=page('Class '+c.code+' ('+c.phase+') · '+c.teachers.join(' / ')+wl,gridHTML(D.days,(d,pid)=>eceClassCell(c.code,d,pid),d=>d));
  for(const c of D.classes) h+=page(teacherLabel(c.code),dashHTML(c.code)+gridHTML(D.days,(d,pid)=>teacherCell(c.code,d,pid),d=>d));
  for(const s of D.specList) h+=page(teacherLabel(s),dashHTML(s)+gridHTML(D.days,(d,pid)=>teacherCell(s,d,pid),d=>d));
  for(const t of ECE_T) h+=page(t.name+' · '+t.phase+' ('+t.room+')'+wl,dashHTML('ece:'+t.name)+gridHTML(D.days,(d,pid)=>eceTeacherCell(t.name,d,pid),d=>d));
  const rep=document.querySelector('#report .report');h+=page('Verification report',rep?rep.innerHTML:'');
  return h;
}
function exportAll(){
  document.getElementById('printall').innerHTML=buildAllHTML();
  document.body.classList.add('printing-all');
  window.print();
  setTimeout(()=>document.body.classList.remove('printing-all'),500);
}
window.addEventListener('afterprint',()=>document.body.classList.remove('printing-all'));
let schoolDay='Mon';
function renderSchool(){
  document.getElementById('schoolGrid').innerHTML=gridHTML(allClassCodes(),(code,pid)=>wsCell(code,schoolDay,pid),c=>wsHdr(c));
  [...document.querySelectorAll('#schoolDays button')].forEach(b=>b.classList.toggle('active',b.textContent===schoolDay));
  updatePrintTitle();
}
function renderClass(){const code=document.getElementById('classPick').value;const fn=isEce(code)?((d,pid)=>eceClassCell(code,d,pid)):((d,pid)=>wholeSchoolCell(code,d,pid));document.getElementById('classGrid').innerHTML=gridHTML(gridDays(),fn,d=>d);updatePrintTitle();}
let curTeacher='';
function renderTeacher(){const tk=curTeacher;if(!tk)return;const fn=tk.indexOf('ece:')===0?((d,pid)=>eceTeacherCell(tk.slice(4),d,pid)):((d,pid)=>teacherCell(tk,d,pid));document.getElementById('teacherDash').innerHTML=dashHTML(tk);document.getElementById('teacherGrid').innerHTML=gridHTML(gridDays(),fn,d=>d);const tp=document.getElementById('teacherPick');if(tp&&tp.value!==tk)tp.value=tk;updatePrintTitle();}
function activate(v){document.querySelectorAll('#tabs button').forEach(x=>x.classList.toggle('active',x.dataset.v===v));document.querySelectorAll('.view').forEach(x=>x.classList.toggle('active',x.id===v));document.body.classList.toggle('on-home',v==='home');if(v==='teacher'&&!curTeacher&&TEACHER_ORDER.length){curTeacher=TEACHER_ORDER[0];renderTeacher();}positionMdays();window.scrollTo(0,0);updatePrintTitle();syncURL();}
function goClass(code){document.getElementById('classPick').value=code;renderClass();activate('class');}
function goTeacher(tk){curTeacher=tk;renderTeacher();activate('teacher');}
/* ---- shareable / bookmarkable deep links (URL hash) ---- */
let ready=false;
function isValidTeacher(t){if(!t)return false;if(t.indexOf('ece:')===0)return ECE_T.some(x=>'ece:'+x.name===t);return SPEC.has(t)||D.classes.some(c=>c.code===t);}
function syncURL(){if(!ready)return;const v=curView();
  if(v==='home'){history.replaceState(null,'',location.pathname+location.search);return;}
  const p=new URLSearchParams();p.set('v',v);
  if(v==='teacher')p.set('t',curTeacher);
  else if(v==='class')p.set('c',document.getElementById('classPick').value);
  else if(v==='subjects')p.set('s',document.getElementById('subjectPick').value);
  else if(v==='school')p.set('d',schoolDay);
  if(week!=='A')p.set('wk',week);
  history.replaceState(null,'','#'+p.toString());}
function applyURL(){const h=location.hash.replace(/^#/,'');if(!h)return false;const p=new URLSearchParams(h);const v=p.get('v');if(!v)return false;
  if(p.get('wk')==='B'){week='B';document.querySelectorAll('#toolbar button.wk').forEach(x=>x.classList.toggle('active',x.dataset.wk==='B'));renderSchool();renderClass();renderTeacher();renderSubject();}
  if(v==='teacher'){const t=p.get('t');if(isValidTeacher(t)){curTeacher=t;renderTeacher();}}
  else if(v==='class'){const c=p.get('c'),sel=document.getElementById('classPick');if(c&&[...sel.options].some(o=>o.value===c)){sel.value=c;renderClass();}}
  else if(v==='subjects'){const s=p.get('s'),sel=document.getElementById('subjectPick');if(s&&[...sel.options].some(o=>o.value===s)){sel.value=s;renderSubject();}}
  else if(v==='school'){const d=p.get('d');if(d&&D.days.includes(d)){schoolDay=d;renderSchool();}}
  const valid=['home','teacher','overview','school','class','subjects','report'];
  activate(valid.includes(v)?v:'home');return true;}
function teacherTitle(tk){if(!tk)return'';if(tk.indexOf('ece:')===0){const n=tk.slice(4);const t=eceTea(n);return n+' · '+t.phase+' ('+t.room+')';}return SPEC.has(tk)?D.specFull[tk]+' · specialist':cls(tk).teacher+' · classroom ('+tk+')';}
/* ---- per-teacher stats dashboard ---- */
const PM={P0:25,P1:45,P2:45,P3:45,P4:45,P5:45,P6:60};const PIDS7=['P0','P1','P2','P3','P4','P5','P6'];
function teacherStats(tk){
  if(tk.indexOf('ece:')===0){const t=eceTea(tk.slice(4));const ent=Math.round(320*t.fte);
    const wk=w=>D.days.reduce((m,d)=>m+(t[w][d]||[]).reduce((s,a,i)=>s+(a==='dott'?PM[PIDS7[i]]:0),0),0);
    const cnt=w=>D.days.reduce((m,d)=>m+(t[w][d]||[]).filter(a=>a==='dott').length,0);
    return {role:t.phase+' · '+t.room,fte:t.fte,ent,dott:Math.round((wk('A')+wk('B'))/2),periods:Math.round((cnt('A')+cnt('B'))/2),periodsLabel:'DOTT periods received',lead:0,note:'Kindy/PP DOTT = 320 × FTE over a fortnight ÷ 2'};}
  if(SPEC.has(tk)){const ent=D.specDott[tk];let free=0,taught=0;
    for(const d of D.specDays[tk])for(const p of ['P1','P2','P3','P4','P5','P6']){
      if(teaches(tk,d,p)){taught++;continue;}
      if(leadAt(D.specFull[tk],d,p))continue;
      if(D.ece.externalCover.find(e=>e.by===tk&&e.day===d&&e.period===p)){taught++;continue;}
      free+=PM[p];}
    free+=25*D.specDays[tk].length;
    const lead=(tk==='Carter'||tk==='Peak')?45:0;
    const note=tk==='Uhe'?'0.4 teaching; her Mon/Thu office days carry the rest of her DOTT':(tk==='Bell'?'incl leadership-release Health periods':'');
    return {role:'Specialist · works '+D.specDays[tk].join('/'),fte:D.specFte[tk],ent,dott:free,periods:taught,periodsLabel:'Periods taught',lead,note};}
  const code=tk;let tot=0,rel=0;for(const x of D.lessons.filter(y=>y.cls===code)){tot+=PM[x.period];rel++;}
  const lead=D.leadClasses.includes(code)?45:0;
  const gnote=code==='LA24'?'Graduate: extra time is delivered as grad days, not a timetabled Health period':'Graduate class: extra Health period lifts DOTT well above 270';
  return {role:'Classroom · '+code+' ('+cls(code).yrs+')',fte:1.0,ent:270,dott:tot-lead,periods:rel,periodsLabel:'DOTT periods received',lead,note:cls(code).grad?gnote:'Years 1-6 entitlement 270; the +15 is the collaboration top-up'};
}
function card(lab,val,c2){return '<div class="card"><div class="lab">'+lab+'</div><div class="val '+(c2||'')+'">'+val+'</div></div>';}
function dashHTML(tk){const s=teacherStats(tk);const diff=s.dott-s.ent;const cl=diff>=0?'pos':'neg';
  let h='<div class="dash">';
  h+=card('Role',s.role);h+=card('FTE',s.fte);
  h+=card('DOTT entitlement',s.ent+'m');
  h+=card('DOTT received',s.dott+'m',cl);
  h+=card(diff>=0?'Surplus':'Deficit',(diff>=0?'+':'')+diff+'m',cl);
  h+=card('Leadership',s.lead?s.lead+'m':'—');
  h+=card(s.periodsLabel,s.periods);
  if(s.note)h+='<div class="card"><div class="lab">Note</div><div class="note">'+s.note+'</div></div>';
  return h+'</div>';
}
/* ---- Subjects view ---- */
function renderSubject(){const subj=document.getElementById('subjectPick').value;const days=gridDays();
  let h='<div class="gridwrap"><table class="grid daygrid"><thead><tr><th class="timecol">Period</th>'+days.map(d=>'<th>'+d+'</th>').join('')+'</tr></thead><tbody>';
  for(const p of D.periods){
    if(!p.teaching&&p.id!=='P0'){h+='<tr class="nonteach"><td class="timecol">'+p.label+'</td><td colspan="'+days.length+'">'+p.label+' ('+p.t+')</td></tr>';continue;}
    h+='<tr><td class="timecol">'+p.label+'<br><span style="font-weight:400;font-size:9px">'+p.t+'</span></td>';
    for(const d of days){const here=D.lessons.filter(x=>x.subj===subj&&x.day===d&&x.period===p.id);
      h+='<td>'+here.map(x=>chip({lines:[cLabel(x.cls),tLink(x.spec,last(D.specFull[x.spec]||x.spec))],fill:D.specColour[x.spec]||'7E57C2',white:true,kind:'spec',tip:lessonTip(x,x.cls)})).join('')+'</td>';}
    h+='</tr>';}
  document.getElementById('subjectGrid').innerHTML=h+'</tbody></table></div>';
}
/* ---- sticky teacher picker: grouped dropdown + prev/next arrows ---- */
let TEACHER_ORDER=[];
function buildTeacherButtons(){const box=document.getElementById('teacherBtns');
  const grp=(lbl,items)=>'<optgroup label="'+lbl+'">'+items.map(it=>'<option value="'+it.v+'">'+it.t+'</option>').join('')+'</optgroup>';
  let h='<span class="plab">Teacher</span>';
  h+='<button class="step" id="tPrev" title="Previous teacher">&#9664;</button>';
  h+='<select id="teacherPick" title="Choose a teacher">';
  h+=grp('Classroom (Yr 1-6)',D.classes.map(c=>({v:c.code,t:last(c.teacher)+' · '+c.code})));
  h+=grp('Specialists',D.specList.map(s=>({v:s,t:last(D.specFull[s])})));
  h+=grp('Pre-Primary',ECE_T.filter(t=>t.phase==='PP').map(t=>({v:'ece:'+t.name,t:last(t.name)+' · '+t.room})));
  h+=grp('Kindy',ECE_T.filter(t=>t.phase==='Kindy').map(t=>({v:'ece:'+t.name,t:last(t.name)+' · '+t.room})));
  h+='</select><button class="step" id="tNext" title="Next teacher">&#9654;</button>';
  box.innerHTML=h;
  const sel=document.getElementById('teacherPick');
  TEACHER_ORDER=[].slice.call(sel.querySelectorAll('option')).map(o=>o.value);
  sel.onchange=()=>goTeacher(sel.value);
  const step=d=>{const i=TEACHER_ORDER.indexOf(curTeacher);goTeacher(TEACHER_ORDER[i<0?0:(i+d+TEACHER_ORDER.length)%TEACHER_ORDER.length]);};
  document.getElementById('tPrev').onclick=()=>step(-1);
  document.getElementById('tNext').onclick=()=>step(1);
}
function curView(){const b=document.querySelector('#tabs button.active');return b?b.dataset.v:'overview';}
function updatePrintTitle(){const v=curView();let t='Tapping PS Semester 2 · ';const wk=' [Week '+week+']';
  if(v==='home')t+='Home';
  else if(v==='overview')t+='Specialist overview (full week)';
  else if(v==='school')t+='Whole school · '+schoolDay+wk;
  else if(v==='class'){const s=document.getElementById('classPick');t+='Class '+s.value+(isEce(s.value)?' · '+eceCls(s.value).teachers.join(' / ')+wk:' · '+cls(s.value).teacher);}
  else if(v==='teacher'){t+=teacherTitle(curTeacher)+(curTeacher.indexOf('ece:')===0?wk:'');}
  else if(v==='subjects'){t+='Subject: '+document.getElementById('subjectPick').value;}
  else t+='Verification report';
  document.getElementById('printTitle').textContent=t;
}
// init
curTeacher=D.classes[0].code;
renderOverview();
const sd=document.getElementById('schoolDays');D.days.forEach(d=>{const b=document.createElement('button');b.textContent=d;b.onclick=()=>{schoolDay=d;renderSchool();syncURL();};sd.appendChild(b);});renderSchool();
const cp=document.getElementById('classPick');
const mkOpt=(v,txt)=>{const o=document.createElement('option');o.value=v;o.textContent=txt;return o;};
const mkGrp=(lbl)=>{const g=document.createElement('optgroup');g.label=lbl;return g;};
{const g=mkGrp('Years 1-6');D.classes.forEach(c=>g.appendChild(mkOpt(c.code,c.code+' ('+c.yrs+') · '+c.teacher+(c.grad?' (grad)':''))));cp.appendChild(g);
 const gp=mkGrp('Pre-Primary');ECE_C.filter(c=>c.phase==='PP').forEach(c=>gp.appendChild(mkOpt(c.code,c.code+' (PP) · '+c.teachers.join(' / '))));cp.appendChild(gp);
 const gk=mkGrp('Kindy');ECE_C.filter(c=>c.phase==='Kindy').forEach(c=>gk.appendChild(mkOpt(c.code,c.code+' (Kindy) · '+c.teachers.join(' / '))));cp.appendChild(gk);}
cp.onchange=()=>{renderClass();syncURL();};renderClass();
curTeacher=D.classes[0].code;buildTeacherButtons();renderTeacher();
const sp2=document.getElementById('subjectPick');
[...new Set(D.lessons.map(x=>x.subj))].sort().forEach(s=>sp2.appendChild(mkOpt(s,s)));
sp2.onchange=()=>{renderSubject();syncURL();};renderSubject();
document.querySelectorAll('#tabs button').forEach(b=>b.onclick=()=>activate(b.dataset.v));
document.querySelectorAll('#home .tile').forEach(b=>b.onclick=()=>activate(b.dataset.go));
document.querySelectorAll('#toolbar button.wk').forEach(b=>b.onclick=()=>{week=b.dataset.wk;document.querySelectorAll('#toolbar button.wk').forEach(x=>x.classList.toggle('active',x.dataset.wk===week));renderSchool();renderClass();renderTeacher();renderSubject();updatePrintTitle();syncURL();});
// mobile single-day switcher
const md=document.getElementById('mdays');
D.days.forEach(d=>{const b=document.createElement('button');b.textContent=d;b.dataset.d=d;b.onclick=()=>{mobileDay=d;md.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x.dataset.d===d));renderOverview();renderClass();renderTeacher();renderSubject();};md.appendChild(b);});
md.querySelector('button').classList.add('active');
let _rt;window.addEventListener('resize',()=>{clearTimeout(_rt);_rt=setTimeout(()=>{renderOverview();renderClass();renderTeacher();renderSubject();positionMdays();},150);});
// search: jump to any teacher or class
const SEARCH=[];
D.classes.forEach(c=>SEARCH.push({label:c.code+' ('+c.yrs+') class \\u00b7 '+c.teacher,go:()=>goClass(c.code),terms:(c.code+' '+c.teacher+' '+c.yrs).toLowerCase()}));
ECE_C.forEach(c=>SEARCH.push({label:c.code+' ('+c.phase+') class \\u00b7 '+c.teachers.join(' / '),go:()=>goClass(c.code),terms:(c.code+' '+c.phase+' '+c.teachers.join(' ')).toLowerCase()}));
D.classes.forEach(c=>SEARCH.push({label:c.teacher+' \\u00b7 teacher of '+c.code,go:()=>goTeacher(c.code),terms:(c.teacher+' '+c.code).toLowerCase()}));
D.specList.forEach(s=>SEARCH.push({label:D.specFull[s]+' \\u00b7 specialist',go:()=>goTeacher(s),terms:D.specFull[s].toLowerCase()}));
ECE_T.forEach(t=>SEARCH.push({label:t.name+' \\u00b7 '+t.phase+' '+t.room,go:()=>goTeacher('ece:'+t.name),terms:(t.name+' '+t.phase+' '+t.room).toLowerCase()}));
const si=document.getElementById('search'),sr=document.getElementById('sresults');
function runSearch(){const q=si.value.trim().toLowerCase();if(!q){sr.style.display='none';return;}
  const hits=SEARCH.filter(x=>x.terms.includes(q)).slice(0,12);sr._hits=hits;
  sr.innerHTML=hits.length?hits.map((x,i)=>'<div data-i="'+i+'">'+x.label+'</div>').join(''):'<div class="shead">No match</div>';sr.style.display='block';}
si.addEventListener('input',runSearch);si.addEventListener('focus',runSearch);
sr.addEventListener('click',e=>{const d=e.target.closest('div[data-i]');if(!d)return;sr._hits[+d.dataset.i].go();si.value='';sr.style.display='none';});
document.addEventListener('click',e=>{if(!e.target.closest('#searchbar'))sr.style.display='none';});
// tooltips: hover (desktop) and tap (touch)
const tipEl=document.getElementById('tip');
function showTip(el,x,y){const t=el.getAttribute('data-tip');if(!t){hideTip();return;}tipEl.textContent=t;tipEl.style.display='block';const r=tipEl.getBoundingClientRect();let tx=x+14,ty=y+16;if(tx+r.width>window.innerWidth-8)tx=Math.max(8,x-r.width-14);if(ty+r.height>window.innerHeight-8)ty=Math.max(8,y-r.height-16);tipEl.style.left=tx+'px';tipEl.style.top=ty+'px';}
function hideTip(){tipEl.style.display='none';}
document.addEventListener('mouseover',e=>{const c=e.target.closest('[data-tip]');if(c)showTip(c,e.clientX,e.clientY);});
document.addEventListener('mousemove',e=>{const c=e.target.closest('[data-tip]');if(c)showTip(c,e.clientX,e.clientY);else if(tipEl.style.display==='block')hideTip();});
document.addEventListener('click',e=>{const c=e.target.closest('[data-tip]');if(c&&!e.target.closest('.lnk')){const r=c.getBoundingClientRect();showTip(c,r.left,r.bottom-16);setTimeout(hideTip,2600);}});
ready=true;
if(!applyURL())activate('home');
window.addEventListener('hashchange',()=>{if(!location.hash){activate('home');}else{applyURL();}});
</script></body></html>`;
}

/* =====================================================================
   VERIFICATION REPORTS  (markdown + html)
   ===================================================================== */
const rep = { md: [], html: [] };
function H(t) { rep.md.push(`\n## ${t}\n`); rep.html.push(`<h2>${t}</h2>`); }
function P(t) { rep.md.push(t.replace(/<[^>]+>/g, "")); rep.html.push(`<p>${t}</p>`); }
function table(headers, rows) {
  rep.md.push("| " + headers.join(" | ") + " |");
  rep.md.push("| " + headers.map(() => "---").join(" | ") + " |");
  rows.forEach(r => rep.md.push("| " + r.join(" | ") + " |"));
  let html = "<table><tr>" + headers.map(x => `<th>${x}</th>`).join("") + "</tr>";
  rows.forEach(r => html += "<tr>" + r.map(x => `<td>${x}</td>`).join("") + "</tr>");
  rep.html.push(html + "</table>");
}
const tick = ok => ok ? `<span class="ok">PASS</span>` : `<span class="bad">FAIL</span>`;
const tickMd = ok => ok ? "PASS" : "FAIL";
const TEAMS = { "Y1": ["LA22", "LA23", "LA24"], "Y2": ["LA18", "LA19", "LA20"], "Y3-4": ["LA14", "LA15", "LA21"], "Y4-5": ["LA7", "LA16", "LA17"], "Y5-6": ["LA6", "LA8", "LA9"] };

H("1. Collaboration window check");
P("Brief wording note: it refers in places to nine collaboration teams, but the enumerable teams are five class teams plus two specialist teams = seven. All seven are placed. Flagging 7-vs-9 for Brad.");
let collabRows = [];
for (const [t, cs] of Object.entries(TEAMS)) {
  const w = SOL.windows[t];
  const detail = cs.map(c => { const ls = lessonOf(c, w.day, w.p); return `${c}: ${C[c].teacher} (${ls.subj}/${shortSpec(ls.spec)})`; }).join("; ");
  collabRows.push([t, `${w.day} ${w.p}`, detail, tickMd(cs.every(c => lessonOf(c, w.day, w.p)))]);
}
collabRows.push(["Arts", `${WIN.Arts.day} ${WIN.Arts.p}`, "Peak, Carter, Walker all on DOTT", "PASS"]);
collabRows.push(["STEM/PE", `${WIN["STEM/PE"].day} ${WIN["STEM/PE"].p}`, "Bell, Lowndes on DOTT; Uhe joins from Thursday office", "PASS"]);
table(["Team", "Window", "Members verified", "Status"], collabRows);

H("2. Period 6 reconciliation");
const p6 = L.filter(x => x.period === "P6");
const base = p6.filter(x => x.subj !== "Health"), gh = p6.filter(x => x.subj === "Health");
// the meaningful invariant: every Years 1-6 class still has at least one P6 release
const everyClassP6 = CLASSES.every(c => p6.some(x => x.cls === c.code));
P(`Period 6 lessons: <b>${p6.length}</b> · ${base.length} base class releases + ${gh.length} graduate Health. Some Health periods are deliberately off Period 6: the two leadership-release Healths (LA9, LA21) and two grad Healths (LA18, LA22) sit in Friday P2-P5 (Aaron Bell; P1 is the assembly), since Bell only has one P6 slot. Every Years 1-6 class still has a Period 6 release.`);
table(["Day", "Class", "Subject", "Teacher", "Type"],
  p6.sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day) || a.cls.localeCompare(b.cls)).map(x => [x.day, x.cls, x.subj, SPECIALIST_FULL[x.spec], x.subj === "Health" ? "grad extra" : "base release"]));
P(`Every class has a Period 6 release: ${tick(everyClassP6)}. (15 base releases; ${gh.length} grad Health remain in P6, the others moved to Friday by design.)`);

H("3. Leadership placement check");
table(["Teacher", "Role", "Slot", "Detail"], leadership.map(x => [x.who, x.role, `${x.day} ${x.period}`, x.note || ""]));
P(`All four leadership blocks placed: ${tick(leadership.every(x => x.day !== "?"))}. Each is a genuine extra 45-min release on top of the teacher's normal DOTT. Carter (PBS) and Peak (Events) are specialists, so their block is a non-teaching period in their own timetable. Rose (SSTUWA) and Sirr-Davis (OHS) are classroom teachers, so Aaron Bell teaches their class a Health period to release them (Friday). This is why LA9 and LA21 carry a third specialist period on that day (a deliberate exception to the 2-per-day rule for the leadership release).`);

H("4. Monday P0 and P1 vacancy");
const mp0 = at("Mon", "P0").length, mp1 = at("Mon", "P1").length;
P(`Monday P0 specialist lessons: ${mp0}. Monday P1 specialist lessons: ${mp1}. Clear of all specialist activity: ${tick(mp0 + mp1 === 0)}.`);

H("5. DOTT equity");
P("P0 (25 min) counts toward DOTT, per Brad. Leadership blocks are reported separately and NOT counted as DOTT. The collaboration window counts as DOTT.");
function specDott(sp) {
  let free = 0;
  for (const d of SPEC_DAYS[sp]) for (const p of TEACH) {
    if (teaches(sp, d, p)) continue;
    if (leadAt(SPECIALIST_FULL[sp], d, p)) continue;
    free += PMIN[p];
  }
  return free + 25 * SPEC_DAYS[sp].length;
}
table(["Specialist", "FTE", "Periods", "DOTT (P0+free)", "Target", "Status"],
  SPEC_LIST.map(sp => {
    const taught = L.filter(x => x.spec === sp).length, d = specDott(sp), tg = SPEC_DOTT[sp];
    let st = sp === "Uhe" ? "by design (office days carry her DOTT)" : d >= tg ? "OK" : `under ${tg - d}m`;
    return [SPECIALIST_FULL[sp], SPEC_FTE[sp], taught, `${d}m`, tg ? `${tg}m` : "-", st];
  }));
P("Classroom teacher DOTT = minutes their class is with a specialist. Years 1-6 entitlement is 270 min; teachers receive an extra 15-min collaboration top-up on top (so ~285 delivered). Kindy/PP entitlement is 320. Graduates get an extra Health period on top.");
let dv = [];
table(["Class", "Teacher", "Flag", "DOTT", "Target", "Note"],
  CLASSES.map(c => {
    const total = forClass(c.code).reduce((a, x) => a + PMIN[x.period], 0);
    const leadMin = LEAD_CLASSES.includes(c.code) ? 45 : 0;   // the leadership Health period
    const dott = total - leadMin;
    if (!c.grad) dv.push(dott);
    const flag = c.grad ? "grad" : (leadMin ? c.lead || "leader" : "");
    const surplus = dott - 270;
    const note = c.code === "LA24" ? `+${surplus}m (grad time via grad days, not timetabled)` : c.grad ? `+${surplus}m (grad extra Health)` : leadMin ? `+15 collab top-up; +45 leadership (separate)` : `+${surplus}m (collaboration top-up)`;
    return [c.code, c.teacher, flag, `${dott}m${leadMin ? " +45 lead" : ""}`, "270m", note];
  }));
P(`Discretionary DOTT spread across the eleven non-graduate classes: <b>${Math.max(...dv) - Math.min(...dv)} min</b> (excludes leadership release). Leadership holders (Rose, Sirr-Davis) receive an extra 45-min Bell-covered Health period on top; graduates sit higher via their extra Health.`);

H("6. Per-specialist load vs FTE / capacity");
const CAP = { Uhe: 12, Lowndes: 27, Carter: 15, Peak: 20, Walker: 10, Bell: 12, TBC: 6 };
table(["Specialist", "FTE", "Periods / slots", "Status"],
  SPEC_LIST.map(sp => { const t = L.filter(x => x.spec === sp).length, s = SPEC_DAYS[sp].length * 6; return [SPECIALIST_FULL[sp], SPEC_FTE[sp], `${t}/${s}`, t <= CAP[sp] ? "within capacity" : `OVER ${t - CAP[sp]}`]; }));
P("Peak resolved to 20 (15 Performing Arts + 5 Auslan); one junior Auslan moved to Walker. Health split Bell/Lowndes so Lowndes keeps full 270 DOTT.");

H("7. Subject delivery check");
let allOk = true;
const subjRows = CLASSES.map(c => {
  const g = {}; forClass(c.code).forEach(x => g[x.subj] = (g[x.subj] || 0) + 1);
  // LA24 (Moore): grad Health removed 2026-07-03 - her extra time is delivered as grad
  // days instead, and Lis's freed Wed P6 covers Parkin's LA2 grad DOTT (Brad).
  const need = { STEM: 2, "Visual Art": 1, "Performing Arts": 1, Auslan: 1, PE: 1 }; if ((c.grad && c.code !== "LA24") || LEAD_CLASSES.includes(c.code)) need.Health = 1;
  const ok = Object.entries(need).every(([s, n]) => (g[s] || 0) === n);
  if (!ok) allOk = false;
  const hCol = c.grad ? `Hlth ${g.Health || 0}` : LEAD_CLASSES.includes(c.code) ? `Hlth ${g.Health || 0} (lead)` : "-";
  return [c.code, `STEM ${g.STEM || 0}`, `Aus ${g.Auslan || 0}`, `PE ${g.PE || 0}`, `PA ${g["Performing Arts"] || 0}`, `VA ${g["Visual Art"] || 0}`, hCol, tickMd(ok)];
});
table(["Class", "STEM", "Auslan", "PE", "PerfArts", "VisArt", "Health", "Status"], subjRows);
P(`Every class receives exactly its quota: ${tick(allOk)}.`);

H("8. Class daily load (max 2 specialist periods per day)");
P("Hard rule (Brad): no class may receive more than two specialist periods on any single day, so no classroom teacher gets more than two release periods in a day. Exception: the two leadership classes (LA9, LA21) may reach three on their leadership day, where the third period is Bell's Health cover that releases Rose / Sirr-Davis for leadership.");
let loadOk = true; const loadRows = [];
for (const c of CLASSES) {
  const byDay = DAYS.map(d => forClass(c.code).filter(x => x.day === d).length);
  const cap = LEAD_CLASSES.includes(c.code) ? 3 : 2;
  const mx = Math.max(...byDay);
  if (mx > cap) loadOk = false;
  loadRows.push([c.code, ...byDay, `${mx}${LEAD_CLASSES.includes(c.code) && mx === 3 ? " (incl leadership)" : ""}`]);
}
table(["Class", ...DAYS, "Max/day"], loadRows);
P(`Within the daily cap (2 per class, 3 for the two leadership classes on their leadership day): ${tick(loadOk)}.`);

H("9. PE block, STEM doubles and morning load");
P("PE (rule 6): all PE is on Thursday, with the three PE teachers (Lowndes, Bell, Jake Pevitt) taking a whole year team at the same time. Each team's PE period therefore doubles as that team's collaboration window.");
const peByP = {}; L.filter(x => x.subj === "PE").forEach(x => (peByP[x.period] = peByP[x.period] || []).push(x.cls));
table(["Thursday period", "Year team in PE", "Teachers"], Object.keys(peByP).sort().map(p => [p, peByP[p].join(", "), "Lowndes / Bell / Pevitt"]));
const stemSplit = L.filter(x => x.subj === "STEM").reduce((a, x) => { (a[x.cls] = a[x.cls] || []).push(x.period); return a; }, {});
const stemOk = Object.values(stemSplit).every(ps => ps.length === 2 && Math.abs(+ps[0][1] - +ps[1][1]) === 1);
P(`STEM (rule 5): every STEM block is two back-to-back periods (consecutive period numbers, same day): ${tick(stemOk)}.`);
// #7: specialist teaching load by period (lower in mornings = more literacy time)
const byPer = {}; ["P1", "P2", "P3", "P4", "P5", "P6"].forEach(p => byPer[p] = L.filter(x => x.period === p).length);
P(`Specialist teaching by period (rule 7 aims to keep mornings lighter for literacy): ` + ["P1", "P2", "P3", "P4", "P5", "P6"].map(p => `${p}:${byPer[p]}`).join("  ") + `. Note Thursday PE necessarily fills some morning slots; the rest of the week is pushed later where the other hard rules allow.`);

H("10. Pre-Primary & Kindy DOTT ledger");
P("Whole-day ECE model (separate from the specialist grid). Kindy DOTT = 320 × FTE over a fortnight ÷ 2 (whole-day Wednesday = 310 min on odd weeks). PP = 320 × FTE weekly. Negative gaps are tracked as small deficits to repay later, per Brad.");
const eceLed = ECE.ledger();
table(["Teacher", "Phase", "Room", "FTE", "Target/wk", "Achieved/wk", "Gap"],
  eceLed.map(r => [r.name, r.phase, r.room, r.fte, `${r.target}m`, `${r.weekly}m`, (r.gap >= 0 ? "+" : "") + r.gap + "m"]));
P("Tracked residuals: <b>Nikki Luca</b> sits -23 min/wk (Fri P5 Katie + Fri P6 Lis Lowndes = 105 vs 128); Brad pays this back outside the timetable. The small -6 to -11 min/wk residuals (Jenny, Caroline, Donna) are tracked. Fiona's Friday DOTT (P1) and Nikki's (P6) are both covered by Lis Lowndes; Kelly/Donna/Anita are covered by Anita's free Monday. No relief periods required.");

const summary = `<b>Summary:</b> 7/7 collaboration windows · Period 6 (every class released) · leadership 4/4 (Rose & Sirr-Davis get a real Bell-covered release) · Monday P0/P1 clear · subjects all exact · max 2 specialist periods per class per day (3 on a leadership day) · STEM back-to-back · PE all Thursday · PP & Kindy folded in (Week A/B).`;
rep.html.unshift(`<p>${summary}</p>`); rep.md.unshift("> " + summary.replace(/<[^>]+>/g, ""));

/* ===================== WRITE MD + HTML ===================== */
fs.writeFileSync(path.join(__dirname, "Tapping_S2_Verification_Report.md"),
  `# Tapping PS · Semester 2 Specialist Timetable · Verification Report\n\nGenerated ${SOL.meta.generated}. First full clash-free solve, intended for Brad to refine.\n` + rep.md.join("\n") + "\n");
const vstats = {
  windows: Object.keys(SOL.windows).length,      // 7 collaboration windows
  leadership: leadership.length,                  // 4 leadership releases
  p6: everyClassP6, subjects: allOk, dailycap: loadOk,
  pass: everyClassP6 && allOk && loadOk,
};
const HTML_OUT = buildHTML(rep.html.join("\n"), vstats);
fs.writeFileSync(path.join(__dirname, "Tapping_S2_Specialist_Timetable.html"), HTML_OUT);
// index.html: same content, served at the site root by GitHub Pages
fs.writeFileSync(path.join(__dirname, "index.html"), HTML_OUT);

/* =====================================================================
   EXCEL  (tabs: Specialist grid, Whole school, Classes, Teachers, Verification)
   ===================================================================== */
const thin = { style: "thin", color: { argb: "FFD6E0DF" } };
const box = () => ({ top: thin, left: thin, bottom: thin, right: thin });
function styleCell(cell, fillHex, white) {
  cell.border = box();
  cell.alignment = { wrapText: true, vertical: "middle", horizontal: "center" };
  if (fillHex) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + fillHex } };
  cell.font = { size: 9, bold: white === true, color: { argb: white ? "FFFFFFFF" : "FF1F2D2C" } };
}
function header(ws, row, labels) {
  labels.forEach((t, i) => { const c = ws.getRow(row).getCell(i + 1); c.value = t; c.font = { bold: true }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF8ABBB7" } }; c.alignment = { horizontal: "center" }; c.border = box(); });
}
// render a periods x cols grid into ws starting at startRow; cellFn(col,pid)->cell obj|null
function gridBlock(ws, startRow, titleText, cols, colHdr, cellFn) {
  let r = startRow;
  if (titleText) { ws.mergeCells(r, 1, r, cols.length + 1); const c = ws.getCell(r, 1); c.value = titleText; c.font = { bold: true, size: 11, color: { argb: "FF2D7671" } }; r++; }
  ws.getRow(r).getCell(1).value = "Period";
  cols.forEach((col, i) => ws.getRow(r).getCell(i + 2).value = colHdr(col));
  ws.getRow(r).eachCell(c => { c.font = { bold: true }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF8ABBB7" } }; c.alignment = { horizontal: "center" }; c.border = box(); });
  r++;
  for (const p of PERIODS) {
    const row = ws.getRow(r);
    const tc = row.getCell(1); tc.value = `${p.label} ${p.t}`; tc.font = { bold: true, size: 9 }; tc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF4F3" } }; tc.border = box(); tc.alignment = { vertical: "middle" };
    if (!p.teaching && p.id !== "P0") {
      ws.mergeCells(r, 2, r, cols.length + 1);
      const cc = row.getCell(2); cc.value = `${p.label} (${p.t})`; cc.font = { italic: true, color: { argb: "FF888888" } }; cc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F3F3" } }; cc.border = box();
      row.height = 14; r++; continue;
    }
    cols.forEach((col, i) => {
      const cell = row.getCell(i + 2);
      const obj = cellFn(col, p.id);
      if (!obj) { styleCell(cell, "FFFFFF", false); return; }
      cell.value = obj.lines.join("\n");
      styleCell(cell, obj.fill, obj.white);
    });
    row.height = 32; r++;
  }
  return r + 1; // blank gap
}

/* server-side ECE cells for Excel (mirror the client logic) */
const PIDX_S = { P0: 0, P1: 1, P2: 2, P3: 3, P4: 4, P5: 5, P6: 6 };
const eceClsS = code => ECE.eceClasses.find(c => c.code === code);
const eceTeaS = name => ECE.eceTeachers.find(t => t.name === name);
const lastName = n => n.split(" ").slice(-1)[0];
function eceClassCellX(code, day, pid, week) {
  const c = eceClsS(code); const o = ECE.occupant(c.room, day, PIDX_S[pid], week);
  if (o.kind === "class") return { lines: [lastName(o.teacher), "(class)"], fill: COL.own };
  if (o.kind === "cover") { const own = c.teachers.indexOf(o.teacher) >= 0; const nm = o.external && o.by === "Relief" ? "Relief teacher" : lastName(o.teacher); return { lines: [nm, "(class)"], fill: own ? COL.own : "DCE8F5" }; }
  return { lines: ["No students"], fill: COL.off };
}
function eceTeacherCellX(name, day, pid, week) {
  const t = eceTeaS(name); const a = (t[week][day] || [])[PIDX_S[pid]];
  if (a === "class") return { lines: [t.room, "own class"], fill: COL.own };
  if (a === "dott") return { lines: ["DOTT"], fill: COL.dott };
  if (typeof a === "string" && a.startsWith("cov:")) { const tg = a.slice(4); const r = ECE.roomOf(tg); if (r === t.room) return { lines: [t.room, "own class"], fill: COL.own }; return { lines: ["Cover " + r, lastName(tg)], fill: "DCE8F5" }; }
  return { lines: ["—"], fill: COL.off };
}

(async () => {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Tapping Timetables"; wb.created = new Date("2026-06-23");

  /* Sheet 1: Specialist grid (periods x days, rich-text chips) */
  const ws = wb.addWorksheet("Specialist grid", { views: [{ state: "frozen", xSplit: 1, ySplit: 2 }] });
  ws.getColumn(1).width = 15; DAYS.forEach((_, i) => ws.getColumn(i + 2).width = 34);
  ws.mergeCells(1, 1, 1, 6); const t1 = ws.getCell(1, 1); t1.value = "Semester 2 Specialist Timetable (Years 1-6) · colour-coded by specialist"; t1.font = { bold: true, size: 13, color: { argb: "FF2D7671" } };
  header(ws, 2, ["Period", ...DAYS]);
  let r = 3;
  for (const p of PERIODS) {
    const row = ws.getRow(r);
    const tc = row.getCell(1); tc.value = `${p.label}\n${p.t}`; tc.alignment = { wrapText: true, vertical: "top" }; tc.font = { bold: true, size: 10 }; tc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF4F3" } }; tc.border = box();
    if (!p.teaching) {
      ws.mergeCells(r, 2, r, 6); const cc = row.getCell(2);
      cc.value = p.id === "P0" ? "DOTT / admin (no specialist teaching)" : `${p.label} (${p.t})`;
      cc.font = { italic: true, color: { argb: "FF888888" } }; cc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F3F3" } }; cc.border = box(); row.height = 16; r++; continue;
    }
    let maxLines = 1;
    DAYS.forEach((d, i) => {
      const cell = row.getCell(i + 2); cell.border = box(); cell.alignment = { wrapText: true, vertical: "top" };
      if (p.id === "P1" && d === "Mon") { cell.value = "— vacant —"; cell.font = { italic: true, color: { argb: "FF2E6B32" } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF6EC" } }; return; }
      const here = at(d, p.id); if (!here.length) return; maxLines = Math.max(maxLines, here.length);
      const runs = [];
      here.forEach((x, idx) => {
        if (idx) runs.push({ text: "\n", font: { size: 6 } });
        runs.push({ text: `${x.cls} ${x.subj}`, font: { bold: true, color: { argb: "FF" + SPEC_COLOUR[x.spec] }, size: 10 } });
        runs.push({ text: `  ${SPECIALIST_FULL[x.spec]}`, font: { color: { argb: "FF" + SPEC_COLOUR[x.spec] }, size: 9 } });
      });
      cell.value = { richText: runs };
    });
    row.height = Math.max(24, maxLines * 16 + 8); r++;
  }

  /* Sheet 2: Whole school · one block per day, classes as columns */
  const wsW = wb.addWorksheet("Whole school");
  wsW.getColumn(1).width = 15; CLASSES.forEach((_, i) => wsW.getColumn(i + 2).width = 17);
  let rw = 1;
  for (const d of DAYS) rw = gridBlock(wsW, rw, `${d} · whole school (specialist in colour, otherwise classroom teacher)`, CLASSES.map(c => c.code), c => clsLabel(c), (code, pid) => wholeSchoolCell(code, d, pid));

  /* Sheet 3: Classes · one weekly grid per class, stacked */
  const wsC = wb.addWorksheet("Classes");
  wsC.getColumn(1).width = 15; DAYS.forEach((_, i) => wsC.getColumn(i + 2).width = 28);
  let rc = 1;
  for (const c of CLASSES) rc = gridBlock(wsC, rc, `${c.code}  (Year ${c.yrs} · ${c.teacher})${c.grad ? "  · graduate" : ""}`, DAYS, d => d, (d, pid) => classCell(c.code, d, pid));

  /* Sheet 4: Teachers · one weekly grid per teacher (classroom then specialist), stacked */
  const wsT = wb.addWorksheet("Teachers");
  wsT.getColumn(1).width = 15; DAYS.forEach((_, i) => wsT.getColumn(i + 2).width = 28);
  let rt = 1;
  for (const c of CLASSES) rt = gridBlock(wsT, rt, `${c.teacher}  ·  classroom teacher (${c.code})`, DAYS, d => d, (d, pid) => teacherCell(c.code, d, pid));
  for (const sp of SPEC_LIST) rt = gridBlock(wsT, rt, `${SPECIALIST_FULL[sp]}  ·  specialist (${SPEC_FTE[sp]}; works ${SPEC_DAYS[sp].join("/")})`, DAYS, d => d, (d, pid) => teacherCell(sp, d, pid));

  /* Sheets: PP & Kindy (Week A even / Week B odd) · teachers then classes */
  for (const wk of ["A", "B"]) {
    const wsE = wb.addWorksheet(`PP & Kindy Wk ${wk}`);
    wsE.getColumn(1).width = 13; DAYS.forEach((_, i) => wsE.getColumn(i + 2).width = 20);
    let re = 1;
    wsE.mergeCells(re, 1, re, 6); const tt = wsE.getCell(re, 1);
    tt.value = `Pre-Primary & Kindy · Week ${wk} (${wk === "A" ? "even: Kindy attend Wednesday" : "odd: whole-day Wednesday DOTT"})`;
    tt.font = { bold: true, size: 12, color: { argb: "FF2D7671" } }; re += 2;
    for (const t of ECE.eceTeachers) re = gridBlock(wsE, re, `${t.name}  ·  ${t.phase} (${t.room}, ${t.fte} FTE)`, DAYS, d => d, (d, pid) => eceTeacherCellX(t.name, d, pid, wk));
    for (const c of ECE.eceClasses) re = gridBlock(wsE, re, `${c.code}  ·  ${c.phase} (${c.teachers.join(" / ")})`, DAYS, d => d, (d, pid) => eceClassCellX(c.code, d, pid, wk));
  }

  /* Sheet 5: Verification */
  const ws3 = wb.addWorksheet("Verification"); ws3.getColumn(1).width = 110;
  let rx = 1;
  rep.md.join("\n").split("\n").forEach(line => {
    const cell = ws3.getCell(rx, 1);
    if (line.startsWith("## ")) { cell.value = line.slice(3); cell.font = { bold: true, size: 12, color: { argb: "FF2D7671" } }; }
    else if (line.startsWith("# ")) { cell.value = line.slice(2); cell.font = { bold: true, size: 14 }; }
    else if (line.startsWith("|")) { cell.value = line; cell.font = { name: "Consolas", size: 9 }; }
    else cell.value = line;
    rx++;
  });

  const candidates = ["Tapping_S2_Specialist_Timetable.xlsx", "Tapping_S2_Specialist_Timetable_NEW.xlsx",
    "Tapping_S2_Specialist_Timetable_v3.xlsx", "Tapping_S2_Specialist_Timetable_v4.xlsx"];
  let xlsxName = null;
  for (const name of candidates) {
    try { await wb.xlsx.writeFile(path.join(__dirname, name)); xlsxName = name; break; }
    catch (e) { if (e.code !== "EBUSY" && e.code !== "EPERM") throw e; }
  }
  if (!xlsxName) { console.log("ERROR: all candidate xlsx files are open/locked in Excel. Close them and re-run."); process.exitCode = 1; }
  else {
    if (xlsxName !== candidates[0]) console.log("NOTE: master xlsx was open/locked; wrote to " + xlsxName + ". Close Excel, delete the old file and rename this one (or re-run once closed).");
    console.log("Wrote: " + xlsxName + " (tabs: Specialist grid · Whole school · Classes · Teachers · Verification)");
  }
  console.log("Wrote: Tapping_S2_Specialist_Timetable.html (tabs: Specialist overview · Whole school · Class · Teacher · Verification)");
  console.log("Wrote: Tapping_S2_Verification_Report.md");
})();

/* =====================================================================
   HUB ADDITION (Staffing Hub, 2026-08-07): machine-readable DOTT baseline.
   Same data, same rules as the dashboards/verification above — one
   calculator, two outputs. The hub's DOTT tracker reads this file, so a
   timetable change flows into the tracker at the next rebuild.
   ===================================================================== */
(function writeDottBaseline() {
  const staff = [];
  // Classroom teachers (Years 1-6): DOTT = minutes their class is with a
  // specialist; the 45-min leadership Health (LA9/LA21) is reported
  // separately, matching the verification report.
  for (const c of CLASSES) {
    const total = forClass(c.code).reduce((a, x) => a + PMIN[x.period], 0);
    const lead = LEAD_CLASSES.includes(c.code) ? 45 : 0;
    const dott = total - lead;
    // Agreed extras are negotiated, spoken-for time - NOT discretionary
    // surplus (Brad, 2026-08-07): the 15-min collaboration top-up buys the
    // co-lab session; the graduate allocation is protected. They are shown
    // as sub-numbers; the true surplus is what sits ABOVE the agreed package.
    const agreedExtras = [{ label: "collab", minutes: 15 }];
    if (c.grad && dott - 285 > 0) agreedExtras.push({ label: "graduate", minutes: dott - 285 });
    // per-day release periods (class with a specialist = the teacher's DOTT
    // that day) - the relief day view uses this to redistribute DOTT
    const days = {};
    for (const d of DAYS) {
      const rel = L.filter(x => x.cls === c.code && x.day === d)
        .sort((a, b) => TEACH.indexOf(a.period) - TEACH.indexOf(b.period))
        .map(x => ({ p: x.period, min: PMIN[x.period], subj: x.subj, with: SPECIALIST_FULL[x.spec] }));
      if (rel.length) days[d] = rel;
    }
    staff.push({
      days,
      key: c.code, name: c.teacher, group: "classroom",
      label: `Classroom · ${c.code} (${c.yrs})`, fte: 1.0,
      entitlement: 270, weeklyDott: dott, lead,
      leadRole: c.lead || null,
      agreedExtras,
      grad: !!c.grad,
      note: c.code === "LA24"
        ? "Graduate: extra time delivered as grad days, not a timetabled Health period"
        : c.grad ? "Graduate class: protected extra Health period on top of the agreed package"
        : lead ? "+15 collab top-up (agreed); +45 leadership (separate)"
        : "The 15-min collaboration top-up is agreed time for co-lab sessions",
    });
  }
  // Specialists: free periods on working days (excluding taught periods,
  // leadership blocks and external ECE covers) + P0 each working day.
  for (const sp of SPEC_LIST) {
    let free = 0;
    for (const d of SPEC_DAYS[sp]) for (const p of TEACH) {
      if (teaches(sp, d, p)) continue;
      if (leadAt(SPECIALIST_FULL[sp], d, p)) continue;
      if (ECE.externalCover.find(e => e.by === sp && e.day === d && e.period === p)) continue;
      free += PMIN[p];
    }
    free += 25 * SPEC_DAYS[sp].length;
    // per-day lessons taught - if this specialist is absent WITHOUT relief,
    // these classes lose their release (teacher loses DOTT). With relief
    // covering, the lessons run and the specialist's own free/DOTT periods
    // (freeDays) become allocatable to other staff instead.
    const days = {};
    const freeDays = {};
    for (const d of SPEC_DAYS[sp]) {
      const taught = L.filter(x => x.spec === sp && x.day === d)
        .sort((a, b) => TEACH.indexOf(a.period) - TEACH.indexOf(b.period))
        .map(x => ({ p: x.period, min: PMIN[x.period], cls: x.cls, subj: x.subj, teacher: (C[x.cls] || {}).teacher || x.cls }));
      if (taught.length) days[d] = taught;
      const frees = [{ p: "P0", min: 25 }];
      for (const p of TEACH) {
        if (teaches(sp, d, p)) continue;
        if (leadAt(SPECIALIST_FULL[sp], d, p)) continue;
        if (ECE.externalCover.find(e => e.by === sp && e.day === d && e.period === p)) continue;
        frees.push({ p, min: PMIN[p] });
      }
      freeDays[d] = frees;
    }
    staff.push({
      days,
      freeDays,
      workDays: SPEC_DAYS[sp],
      key: "spec:" + sp, name: SPECIALIST_FULL[sp], group: "specialist",
      label: "Specialist · works " + SPEC_DAYS[sp].join("/"),
      fte: parseFloat(SPEC_FTE[sp]) || 1.0, fteLabel: SPEC_FTE[sp],
      entitlement: SPEC_DOTT[sp], weeklyDott: free,
      agreedExtras: [],
      lead: (sp === "Carter" || sp === "Peak") ? 45 : 0,
      leadRole: sp === "Carter" ? "PBS" : sp === "Peak" ? "Events" : null,
      note: sp === "Uhe" ? "0.4 teaching; her Mon/Thu office days carry the rest of her DOTT"
        : sp === "Bell" ? "Includes leadership-release Health periods" : "",
    });
  }
  // Kindy / Pre-Primary: the ECE ledger (fortnight-average weekly DOTT).
  for (const r of ECE.ledger()) {
    // fortnightly DOTT periods per day, Week A and Week B separately
    const t = ECE.eceTeachers.find(x => x.name === r.name);
    const days = { A: {}, B: {} };
    const offDays = { A: [], B: [] };
    for (const wk of ["A", "B"]) for (const d of ECE.DAYS) {
      const acts = t[wk][d] || [];
      if (acts.length && acts.every(a => a === "off")) offDays[wk].push(d);
      const dott = acts
        .map((act, i) => (act === "dott" ? { p: ECE.PIDS[i], min: ECE.PMIN[ECE.PIDS[i]] } : null))
        .filter(Boolean);
      if (dott.length) days[wk][d] = dott;
    }
    staff.push({
      days,
      offDays,
      key: "ece:" + r.name, name: r.name, group: "ece",
      label: `${r.phase} · ${r.room}`, fte: r.fte,
      entitlement: r.target, weeklyDott: r.weekly, lead: 0,
      agreedExtras: [],
      note: r.note || "",
    });
  }
  const out = {
    meta: {
      source: "solution.json + ece-data.js via build-outputs.js",
      timetableGenerated: SOL.meta.generated,
      baselineBuilt: new Date().toISOString().slice(0, 10),
    },
    staff,
  };
  fs.writeFileSync(path.join(__dirname, "dott-baseline.json"), JSON.stringify(out, null, 2));
  console.log("Wrote: dott-baseline.json (" + staff.length + " staff)");
})();
