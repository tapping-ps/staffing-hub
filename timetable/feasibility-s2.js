/* =====================================================================
   Tapping PS — Semester 2 specialist timetable FEASIBILITY ANALYSIS
   ---------------------------------------------------------------------
   Read-only. Encodes the Semester 2 build brief and reports whether the
   hard constraints can be satisfied BEFORE attempting a full solve.
   No files written.
   ===================================================================== */

const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];

// Schedulable teaching periods. P0 (25 min) is DOTT/admin, not full teaching.
const periods = [
  { id: "P0", min: 25, teaching: false },
  { id: "P1", min: 45, teaching: true },
  { id: "P2", min: 45, teaching: true },
  { id: "P3", min: 45, teaching: true },
  { id: "P4", min: 45, teaching: true },
  { id: "P5", min: 45, teaching: true },
  { id: "P6", min: 60, teaching: true },
];
const teaching = periods.filter(p => p.teaching);          // P1..P6
const PPD = teaching.length;                                // 6 teaching slots/day

// ---- classes ----
// year: list; team: collab team; grad: gets +Health in P6
const C = [
  { code: "LA6",  yrs: [5, 6], teacher: "Dunbar",       team: "Y5-6", grad: false },
  { code: "LA7",  yrs: [5],    teacher: "Pigott",       team: "Y4-5", grad: false },
  { code: "LA8",  yrs: [6],    teacher: "Crisp",        team: "Y5-6", grad: false },
  { code: "LA9",  yrs: [5, 6], teacher: "Rose",         team: "Y5-6", grad: false },
  { code: "LA14", yrs: [3, 4], teacher: "Sheehy",       team: "Y3-4", grad: false },
  { code: "LA15", yrs: [3],    teacher: "Mitchell",     team: "Y3-4", grad: false },
  { code: "LA16", yrs: [4],    teacher: "Thieme",       team: "Y4-5", grad: false },
  { code: "LA17", yrs: [4, 5], teacher: "Law",          team: "Y4-5", grad: false },
  { code: "LA18", yrs: [2],    teacher: "Bouwmeester",  team: "Y2",   grad: true  },
  { code: "LA19", yrs: [2],    teacher: "Espach",       team: "Y2",   grad: false },
  { code: "LA20", yrs: [2],    teacher: "Hendron",      team: "Y2",   grad: false },
  { code: "LA21", yrs: [3],    teacher: "Sirr-Davis",   team: "Y3-4", grad: false },
  { code: "LA22", yrs: [1],    teacher: "Webb",         team: "Y1",   grad: true  },
  { code: "LA23", yrs: [1],    teacher: "Hutchings",    team: "Y1",   grad: true  },
  { code: "LA24", yrs: [1],    teacher: "Moore",        team: "Y1",   grad: true  },
];
const cls = code => C.find(c => c.code === code);
const isJunior = c => c.yrs.every(y => y <= 2);  // Yr1-2

// ---- specialists: working days + teaching FTE ----
const S = {
  Uhe:     { subj: ["STEM"],                      days: ["Tue", "Wed"],               fte: 0.4 },
  TBC:     { subj: ["PE"],                         days: ["Thu"],                      fte: null },
  Lowndes: { subj: ["STEM", "PE", "Health"],      days: ["Mon","Tue","Wed","Thu","Fri"], fte: 1.0 },
  Carter:  { subj: ["Visual Art"],                days: ["Mon", "Tue", "Wed"],        fte: 0.6 },
  Peak:    { subj: ["Performing Arts", "Auslan"], days: ["Tue","Wed","Thu","Fri"],    fte: 0.8 },
  Walker:  { subj: ["Auslan"],                    days: ["Wed", "Thu"],               fte: 0.4 },
  Bell:    { subj: ["PE", "Health", "STEM"],      days: ["Thu", "Fri"],               fte: 0.4 },
};

// ---- subject delivery responsibilities (from brief s8 / s9) ----
// STEM x2 each:
const UHE_STEM   = ["LA6", "LA7", "LA8", "LA9", "LA16", "LA17"];          // upper, Tue/Wed
const LOW_STEM   = ["LA14","LA15","LA18","LA19","LA20","LA21","LA22","LA23","LA24"]; // remaining 9
// Auslan x1:
const PEAK_AUS   = ["LA18","LA19","LA20","LA22","LA23","LA24"];           // Yr1-2
const WALK_AUS   = ["LA6","LA7","LA8","LA9","LA14","LA15","LA16","LA17","LA21"]; // Yr3-6
// Performing Arts x1 (all 15) -> Peak
// Visual Art x1 (all 15) -> Carter
// PE x1 each (15) -> split Bell / Lowndes(junior) / TBC(Uhe's old Thu PE)
// Health: 4 grad extras (P6) -> Bell (historically)

const grads = C.filter(c => c.grad).map(c => c.code);

console.log("================ SEMESTER 2 FEASIBILITY ================\n");

// ---------- DEMAND per specialist (periods/week) ----------
const demand = {};
const add = (s, n) => demand[s] = (demand[s] || 0) + n;
add("Uhe", UHE_STEM.length * 2);          // 12
add("Lowndes", LOW_STEM.length * 2);      // 18 STEM
add("Carter", 15);                         // Visual Art all
add("Peak", 15 + PEAK_AUS.length);         // PA 15 + Auslan 6 = 21
add("Walker", WALK_AUS.length);            // 9 Auslan
add("Bell", grads.length);                 // 4 grad Health (P6)
// PE: 15 total. TBC covers Uhe's former Thursday PE. Junior PE -> Lowndes. Bell PE -> remainder.
// We'll resolve PE split below; record subtotal-less for now.

console.log("---- STEM supply vs demand ----");
console.log(`  Uhe STEM:     ${UHE_STEM.length} classes x2 = ${UHE_STEM.length*2} periods`);
console.log(`  Lowndes STEM: ${LOW_STEM.length} classes x2 = ${LOW_STEM.length*2} periods`);
console.log(`  Total STEM = ${UHE_STEM.length*2 + LOW_STEM.length*2} (need 15x2 = 30)`);

console.log("\n---- Auslan supply vs demand ----");
console.log(`  Peak (Yr1-2):  ${PEAK_AUS.length}`);
console.log(`  Walker (Yr3-6): ${WALK_AUS.length}`);
console.log(`  Total Auslan = ${PEAK_AUS.length + WALK_AUS.length} (need 15)`);

// ---------- CAPACITY per specialist ----------
// teaching slots = days x 6. DOTT entitlement = 270*fte (specialists).
// Convention A: P0 (25/day) counts toward DOTT. Convention B: it does not.
function capacity(name) {
  const s = S[name];
  const dn = s.days.length;
  const slots = dn * PPD;
  if (s.fte == null) return { name, dn, slots, note: "FTE TBC" };
  const req = Math.round(270 * s.fte);
  const p0 = 25 * dn;
  // free P1-P5 periods needed (Convention A: P0 helps)
  const freeA = Math.max(0, Math.ceil((req - p0) / 45));
  const freeB = Math.max(0, Math.ceil(req / 45));
  return {
    name, dn, slots, req, p0,
    teachCapA: slots - freeA,   // P0 counts as DOTT
    teachCapB: slots - freeB,   // P0 does NOT count
  };
}

console.log("\n---- SPECIALIST CAPACITY vs DEMAND ----");
console.log("(teachCapA: P0 counts as DOTT.  teachCapB: P0 does NOT count.  +leadership/collab reduce further)");
const lead = { Carter: 1, Peak: 1 };  // leadership periods that eat teaching capacity
["Uhe","Lowndes","Carter","Peak","Walker","Bell"].forEach(name => {
  const c = capacity(name);
  const dem = demand[name] || 0;
  const L = lead[name] || 0;
  const availA = c.teachCapA - L;
  const availB = c.teachCapB - L;
  const flagA = dem > availA ? `  OVER by ${dem-availA} (A)` : "";
  const flagB = dem > availB ? `  OVER by ${dem-availB} (B)` : "";
  console.log(`  ${name.padEnd(8)} days=${c.dn} slots=${c.slots} DOTTreq=${c.req}m lead=${L}  demand=${dem}  availA=${availA}${flagA}  availB=${availB}${flagB}`);
});
console.log("  (PE not yet added to Lowndes/Bell demand; see PE split below.)");

// ---------- PE split ----------
console.log("\n---- PE split (15 periods) ----");
const juniorClasses = C.filter(isJunior).map(c => c.code);   // Yr1-2 = LA18,19,20,22,23,24
console.log(`  Junior (Yr1-2) classes -> Lowndes PE: ${juniorClasses.join(",")} = ${juniorClasses.length}`);
// TBC covers "Uhe's former Thursday PE load". Uhe formerly = senior STEM/PE on Thu.
// In the old grid Uhe(t_stem_snr) taught Thu PE to senior classes. We must size this.
const seniorClasses = C.filter(c => !isJunior(c)).map(c => c.code);
console.log(`  Senior (Yr3-6) classes needing PE: ${seniorClasses.join(",")} = ${seniorClasses.length}`);
console.log(`  These split between Bell (Thu/Fri) and TBC (Thu). Bell also has 4 grad Health.`);

// ---------- COLLAB WINDOW common days ----------
console.log("\n---- COLLABORATION WINDOW common-day check ----");
const teams = {
  "Y1":   { members: ["Webb","Hutchings","Moore"], kind: "class", classes: ["LA22","LA23","LA24"] },
  "Y2":   { members: ["Bouwmeester","Espach","Hendron"], kind: "class", classes: ["LA18","LA19","LA20"] },
  "Y3-4": { members: ["Sheehy","Mitchell","Sirr-Davis"], kind: "class", classes: ["LA14","LA15","LA21"] },
  "Y4-5": { members: ["Pigott","Thieme","Law"], kind: "class", classes: ["LA7","LA16","LA17"] },
  "Y5-6": { members: ["Dunbar","Crisp","Rose"], kind: "class", classes: ["LA6","LA8","LA9"] },
  "STEM/PE": { members: ["Bell","Uhe","Lowndes"], kind: "spec" },
  "Arts":    { members: ["Peak","Carter","Walker"], kind: "spec" },
};
// classroom teachers present all 5 days. The CONSTRAINT for class teams is that all
// their classes are simultaneously WITH a specialist (released) in one 45-min slot.
// For specialist teams the constraint is the members share a free day.
Object.entries(teams).forEach(([name, t]) => {
  if (t.kind === "spec") {
    const common = days.filter(d => t.members.every(m => S[m].days.includes(d)));
    console.log(`  ${name.padEnd(8)} members=${t.members.join(",")}  common on-site days = ${common.length ? common.join(",") : "** NONE **"}`);
  } else {
    console.log(`  ${name.padEnd(8)} classes=${t.classes.join(",")}  (class teachers all 5 days; window = any period all are released)`);
  }
});

// ---------- PERIOD 6 supply ----------
console.log("\n---- PERIOD 6 supply vs demand ----");
console.log("  Brief states supply = 19 P6 specialist slots (Uhe Mon P6 not replaced; TBC not used Mon).");
console.log("  Demand = 15 base class releases + 4 grad Health = 19.");
console.log("  Each specialist can offer at most 1 P6 slot per working day:");
let p6supply = 0;
["Uhe","TBC","Lowndes","Carter","Peak","Walker","Bell"].forEach(name => {
  const s = S[name];
  // Mon excluded per brief soft constraint? P6 Monday: Uhe not working Mon; TBC not Mon.
  // Carter works Mon; could offer Mon P6. Lowndes works Mon. So Mon P6 IS available from Carter/Lowndes.
  const offerDays = s.days;
  console.log(`     ${name.padEnd(8)} works ${offerDays.join(",")} -> up to ${offerDays.length} P6 slots`);
  p6supply += offerDays.length;
});
console.log(`  Raw theoretical P6 capacity (1/specialist/day) = ${p6supply} (far above 19; 19 is the chosen committed count)`);

console.log("\n================ END FEASIBILITY ================");
