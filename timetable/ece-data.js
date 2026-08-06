/* =====================================================================
   Tapping PS — Pre-Primary & Kindy (ECE) data, shared by build-outputs.js
   Whole-day model, fortnightly (Week A = even = teach Wed; Week B = odd =
   whole-day Wed DOTT). Activity codes per period: 'class' | 'dott' | 'off'
   | 'cov:<TeacherName>' (relieving that teacher, i.e. teaching their room).
   ===================================================================== */
"use strict";
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const PIDS = ["P0", "P1", "P2", "P3", "P4", "P5", "P6"];
const PMIN = { P0: 25, P1: 45, P2: 45, P3: 45, P4: 45, P5: 45, P6: 60 };

const C = "class", D = "dott", O = "off";
const rep = v => Array(7).fill(v);
const split = (map, base = C) => PIDS.map((_, i) => map[i] !== undefined ? map[i] : base);

const katieFri = split({ 5: C }, D);                 // P5 class (covers Nikki), rest dott; LA1 then needs external cover at P6 (Lis), keeping Fri P1 clear for assembly
const nikkiFri = split({ 5: D, 6: D }, "cov:Katie Digney"); // DOTT P5 (Katie teaches) + P6 (Lis Lowndes covers) = 105 min; -23 residual paid back outside the timetable (Brad)
const kellyMon = split({ 5: D, 6: D }, C);           // P5,P6 dott (Anita covers)
const donnaMon = split({ 3: D, 4: D }, C);           // P3,P4 dott (Anita covers)
const fionaFri = split({ 1: D }, C);                 // P1 dott (Lis Lowndes covers T9 during assembly); Fiona teaches P6 herself
const anitaMon = ["dott", "dott", "dott", "cov:Donna Campbell", "cov:Donna Campbell", "cov:Kelly Duggan", "cov:Kelly Duggan"];
const parkinWed = split({ 6: D }, C);                // P6 grad DOTT (Lis Lowndes covers LA2; Moore's former Health slot)

const eceTeachers = [
  { name: "Jenny Martin", phase: "PP", room: "LA5", fte: 1.0,
    A: { Mon: rep(C), Tue: rep(C), Wed: rep(C), Thu: rep(C), Fri: rep(D) },
    B: { Mon: rep(C), Tue: rep(C), Wed: rep(C), Thu: rep(C), Fri: rep(D) },
    note: "DOTT all Friday (Kelly Duggan covers LA5)." },
  { name: "Caroline Parkin", phase: "PP", room: "LA2", fte: 1.0,
    A: { Mon: rep(C), Tue: rep(C), Wed: parkinWed, Thu: rep(C), Fri: rep(D) },
    B: { Mon: rep(C), Tue: rep(C), Wed: parkinWed, Thu: rep(C), Fri: rep(D) },
    note: "DOTT all Friday (Donna Campbell covers LA2), plus Wed P6 grad DOTT (Lis Lowndes covers; her 0.05 FTE graduate allocation). Replaces Amy Hindmarsh." },
  { name: "Katie Digney", phase: "PP", room: "LA1", fte: 0.8,
    A: { Mon: rep(C), Tue: rep(C), Wed: rep(C), Thu: rep(O), Fri: katieFri },
    B: { Mon: rep(C), Tue: rep(C), Wed: rep(C), Thu: rep(O), Fri: katieFri },
    note: "Job-share LA1 with Nikki Luca. Does NOT work Thursday. Fri: DOTT except P5, where she teaches to give Nikki her P5 DOTT (Lis Lowndes covers LA1 at P6 for Nikki's other DOTT period)." },
  { name: "Nikki Luca", phase: "PP", room: "LA1", fte: 0.4,
    A: { Mon: rep(O), Tue: rep(O), Wed: rep(O), Thu: rep(C), Fri: nikkiFri },
    B: { Mon: rep(O), Tue: rep(O), Wed: rep(O), Thu: rep(C), Fri: nikkiFri },
    note: "Works Thu & Fri (0.4). Teaches LA1 all Thursday (Katie off). Fri DOTT = P5 (Katie teaches) + P6 (Lis Lowndes covers) = 105 min vs 128 target; the -23 residual is paid back outside the timetable (Brad)." },
  { name: "Kelly Duggan", phase: "Kindy", room: "LA4", fte: 0.8,
    A: { Mon: kellyMon, Tue: rep(C), Wed: rep(C), Thu: rep(O), Fri: rep("cov:Jenny Martin") },
    B: { Mon: kellyMon, Tue: rep(C), Wed: rep(D), Thu: rep(O), Fri: rep("cov:Jenny Martin") },
    note: "Mon P5-P6 DOTT (Anita covers). Whole-day DOTT odd-week (B) Wed. Covers Jenny Martin all Friday." },
  { name: "Donna Campbell", phase: "Kindy", room: "T10", fte: 0.8,
    A: { Mon: donnaMon, Tue: rep(C), Wed: rep(C), Thu: rep(O), Fri: rep("cov:Caroline Parkin") },
    B: { Mon: donnaMon, Tue: rep(C), Wed: rep(D), Thu: rep(O), Fri: rep("cov:Caroline Parkin") },
    note: "Mon P3-P4 DOTT (Anita covers). Whole-day DOTT odd-week (B) Wed. Covers Caroline Parkin all Friday." },
  { name: "Fiona Dyer", phase: "Kindy", room: "T9", fte: 0.6,
    A: { Mon: rep(O), Tue: rep(O), Wed: rep(C), Thu: rep(C), Fri: fionaFri },
    B: { Mon: rep(O), Tue: rep(O), Wed: rep(D), Thu: rep(C), Fri: fionaFri },
    note: "Whole-day DOTT odd-week (B) Wed. Fri P1 DOTT covered by Lis Lowndes (during assembly); teaches her own P6." },
  { name: "Anita Currion", phase: "Kindy", room: "LA3", fte: 0.8,
    A: { Mon: anitaMon, Tue: rep(O), Wed: rep(C), Thu: rep(C), Fri: rep(C) },
    B: { Mon: anitaMon, Tue: rep(O), Wed: rep(D), Thu: rep(C), Fri: rep(C) },
    note: "No class Monday: own DOTT P0-P2; covers Donna (P3-P4) & Kelly (P5-P6). Whole-day DOTT odd-week (B) Wed. Assumed off Tuesday." },
];

const eceClasses = [
  { code: "LA1", room: "LA1", phase: "PP", yrs: "PP", teachers: ["Katie Digney", "Nikki Luca"] },
  { code: "LA2", room: "LA2", phase: "PP", yrs: "PP", teachers: ["Caroline Parkin"] },
  { code: "LA5", room: "LA5", phase: "PP", yrs: "PP", teachers: ["Jenny Martin"] },
  { code: "LA3", room: "LA3", phase: "Kindy", yrs: "K", teachers: ["Anita Currion"] },
  { code: "LA4", room: "LA4", phase: "Kindy", yrs: "K", teachers: ["Kelly Duggan"] },
  { code: "T9",  room: "T9",  phase: "Kindy", yrs: "K", teachers: ["Fiona Dyer"] },
  { code: "T10", room: "T10", phase: "Kindy", yrs: "K", teachers: ["Donna Campbell"] },
];

const roomOf = name => (eceTeachers.find(t => t.name === name) || {}).room;

// covers provided by NON-ECE staff (Year 1-6 specialists) into an ECE room.
// `by` is the Year 1-6 specialist key; byName is for display.
// Friday P1 is the whole-school assembly (no Yr 1-6 specialist lessons), so Lis Lowndes
// uses it to cover Fiona's T9 (45 min); her Fri P6 is reserved in the solver to cover
// Nikki's LA1 DOTT (60 min; Katie teaching P5 provides Nikki's other 45). No relief needed.
const externalCover = [
  { room: "T9", day: "Fri", period: "P1", by: "Lowndes", byName: "Lis Lowndes", forName: "Fiona Dyer" },
  { room: "LA1", day: "Fri", period: "P6", by: "Lowndes", byName: "Lis Lowndes", forName: "Nikki Luca" },
  { room: "LA2", day: "Wed", period: "P6", by: "Lowndes", byName: "Lis Lowndes", forName: "Caroline Parkin" },
];

// who is in `roomCode` at (day, period index, week 'A'|'B')
function occupant(roomCode, day, pi, week) {
  for (const t of eceTeachers) {
    const act = (t[week][day] || [])[pi];
    if (act === "class" && t.room === roomCode) return { teacher: t.name, kind: "class" };
    if (typeof act === "string" && act.startsWith("cov:")) {
      const tgt = act.slice(4);
      if (roomOf(tgt) === roomCode) return { teacher: t.name, kind: "cover", of: tgt };
    }
  }
  const ext = externalCover.find(e => e.room === roomCode && e.day === day && e.period === PIDS[pi]);
  if (ext) return { teacher: ext.byName, kind: "cover", of: ext.forName, external: true, by: ext.by };
  return { kind: "empty" };
}

// weekly DOTT achieved (fortnight average) and target
function ledger() {
  const wk = (t, w) => DAYS.reduce((m, d) => m + (t[w][d] || []).reduce((s, a, i) => s + (a === "dott" ? PMIN[PIDS[i]] : 0), 0), 0);
  return eceTeachers.map(t => {
    const target = Math.round(320 * t.fte);
    const weekly = Math.round((wk(t, "A") + wk(t, "B")) / 2);
    return { name: t.name, phase: t.phase, room: t.room, fte: t.fte, target, weekly, gap: weekly - target, note: t.note };
  });
}

module.exports = { DAYS, PIDS, PMIN, eceTeachers, eceClasses, externalCover, roomOf, occupant, ledger };
