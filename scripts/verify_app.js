/* The Secret Formula — tier-1 gate. Node only, no browser, no dependencies.
   Lifts the shipped CORE block out of index.html by marker index and proves the
   chemistry before any pixel is trusted.

   Run:  node scripts/verify_app.js
   Exit: 0 only when every assertion passes. */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const HTML = path.join(ROOT, "index.html");
const html = fs.readFileSync(HTML, "utf8");

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; }
  else { fail++; failures.push(name + (detail ? "  [" + detail + "]" : "")); }
  const tag = cond ? "ok  " : "FAIL";
  console.log(tag + "  " + name + (detail && !cond ? "   " + detail : ""));
}
function eq(name, a, b) { check(name, a === b, "got " + JSON.stringify(a) + " want " + JSON.stringify(b)); }

console.log("== tier 1: shipped core ==");

/* ---------- extract by marker index, never a non-greedy regex ---------- */
const CS = "/* CORE-START */", CE = "/* CORE-END */";
const ci = html.indexOf(CS), cj = html.indexOf(CE);
check("CORE-START marker present", ci > 0);
check("CORE-END marker present", cj > ci);
const body = html.slice(ci + CS.length, cj);
check("core block is non-trivial", body.length > 4000, body.length + " bytes");

let Core;
try {
  Core = new Function(body + "\nreturn Core;")();
  check("core evaluates in Node", true);
} catch (e) {
  check("core evaluates in Node", false, e.message);
  process.exit(1);
}

/* ---------- isolation: the core must not touch the DOM ---------- */
const code = body.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const banned = [
  [/\bdocument\s*\.(getElementById|querySelector|createElement|body|documentElement)\b/, "document.*"],
  [/\bwindow\s*\.(addEventListener|document|location|innerWidth|devicePixelRatio)\b/, "window.*"],
  [/\blocalStorage\s*\./, "localStorage"],
  [/\bfetch\s*\(/, "fetch("],
  [/\bnew\s+Image\s*\(/, "new Image("],
  [/\bXMLHttpRequest\b/, "XMLHttpRequest"]
];
banned.forEach(([re, label]) => check("core free of " + label, !re.test(code)));

/* ---------- packaging ---------- */
check("no external script tags", !/<script[^>]+src=/i.test(html));
check("no offsite assets (only the footer's outbound repo link is http)", 
  !/<(script|img|link|iframe|source|video|audio)[^>]+(src|href)\s*=\s*["']https?:/i.test(html));
check("index.html ships .nojekyll companion", fs.existsSync(path.join(ROOT, ".nojekyll")));
check("no setTimeout in the app (no timers)", !/\bsetTimeout\s*\(/.test(html));
check("no setInterval in the app (no timers)", !/\bsetInterval\s*\(/.test(html));
check("honours prefers-reduced-motion", /prefers-reduced-motion/.test(html));
check("CSS forces [hidden] over author display rules", /\[hidden\]\s*\{\s*display:\s*none\s*!important/.test(html));
check("audio checkbox is not pre-checked in markup", /id="optAudio"/.test(html) && !/id="optAudio"[^>]*\bchecked/.test(html));

/* ---------- element table ---------- */
const E = Core.ELEMENTS;
check("element table present", Object.keys(E).length >= 40, Object.keys(E).length + " elements");
check("H mass is 1.008", Math.abs(E.H.mass - 1.008) < 1e-9);
check("O mass is 15.999", Math.abs(E.O.mass - 15.999) < 1e-9);
check("Pb is element 82", E.Pb.z === 82);
check("Hg is element 80", E.Hg.z === 80);

/* ---------- formula parser ---------- */
const parseCases = [
  ["H2O", { H: 2, O: 1 }],
  ["H2O2", { H: 2, O: 2 }],
  ["C6H12O6", { C: 6, H: 12, O: 6 }],
  ["Ca(OH)2", { Ca: 1, O: 2, H: 2 }],
  ["Ca3(PO4)2", { Ca: 3, P: 2, O: 8 }],
  ["Fe2(SO4)3", { Fe: 2, S: 3, O: 12 }],
  ["(NH4)2SO4", { N: 2, H: 8, S: 1, O: 4 }],
  ["P4O10", { P: 4, O: 10 }],
  ["Cu(NO3)2", { Cu: 1, N: 2, O: 6 }],
  ["NaHCO3", { Na: 1, H: 1, C: 1, O: 3 }]
];
parseCases.forEach(([f, want]) => {
  let got;
  try { got = Core.parseFormula(f); } catch (e) { got = { error: e.message }; }
  eq("parse " + f, JSON.stringify(got), JSON.stringify(want));
});
["H2O)", "Ca(OH2", "Xx2", "2H2O", ""].forEach((bad) => {
  let threw = false;
  try { Core.parseFormula(bad); } catch (e) { threw = true; }
  check("parser rejects " + JSON.stringify(bad), threw);
});

/* ---------- molar mass against textbook values ---------- */
const massCases = [["H2O", 18.015], ["NaCl", 58.44], ["C6H12O6", 180.156], ["Ca3(PO4)2", 310.174], ["CO2", 44.009]];
massCases.forEach(([f, want]) => {
  const got = Core.molarMass(f);
  check("molar mass " + f, got !== null && Math.abs(got - want) < 0.01, "got " + got + " want " + want);
});

/* ---------- every shipped level ---------- */
const L = Core.LEVELS;
eq("level count", L.length, 48);
check("five chapters", Core.BANDS.length === 5, Core.BANDS.length + " bands");

const bandCounts = [0, 0, 0, 0, 0];
let worst = 0, maxCoefSeen = 0;
L.forEach((lv, i) => {
  bandCounts[lv.band]++;
  const tag = "#" + String(i + 1).padStart(2, "0");
  check(tag + " band in range", lv.band >= 0 && lv.band < Core.BANDS.length);
  check(tag + " has reactants and products", lv.reactants.length > 0 && lv.products.length > 0);
  check(tag + " has a note", typeof lv.note === "string" && lv.note.length > 12);

  const sol = Core.solve(lv);
  check(tag + " has exactly one balancing ratio", sol.ok === true, sol.reason || "");
  if (!sol.ok) return;

  const c = sol.coefs;
  check(tag + " coefficients are positive integers", c.every((v) => Number.isInteger(v) && v > 0), JSON.stringify(c));
  check(tag + " coefficients are in lowest terms", (function () {
    const g = c.reduce((a, b) => { while (b) { const t = a % b; a = b; b = t; } return a; });
    return g === 1;
  })(), JSON.stringify(c));

  maxCoefSeen = Math.max(maxCoefSeen, sol.max);
  check(tag + " max coefficient fits the UI cap (<=30)", sol.max <= 30, String(sol.max));

  /* the ledger must agree with the solver */
  const rows = Core.ledger(lv, c);
  check(tag + " ledger balances at the solution", rows.every((r) => r.delta === 0), JSON.stringify(rows.map((r) => r.el + ":" + r.delta)));

  /* mass is conserved at the solution (implied by atoms, asserted anyway) */
  const mr = Core.massReport(lv, c);
  check(tag + " mass conserved at the solution", !mr.unknown && Math.abs(mr.left - mr.right) < 0.02,
    mr.left.toFixed(3) + " vs " + mr.right.toFixed(3));

  /* the seeded start must never hand the player a solved puzzle */
  const seed = Core.seedCoefs(lv);
  check(tag + " seed has one value per species", seed.length === c.length, JSON.stringify(seed));
  check(tag + " seed is all positive", seed.every((v) => Number.isInteger(v) && v > 0), JSON.stringify(seed));
  check(tag + " seeded start is NOT already balanced", Core.isBalanced(lv, seed) === false, JSON.stringify(seed));
  check(tag + " seeded start is not the solution", seed.join(":") !== c.join(":"), JSON.stringify(seed));
  check(tag + " seeded start is deterministic", Core.seedCoefs(lv).join(":") === seed.join(":"));

  /* uniqueness: nudging any single coefficient must break it */
  let allBreak = true;
  for (let k = 0; k < c.length; k++) {
    const t = c.slice(); t[k] = t[k] + 1;
    if (Core.isBalanced(lv, t)) { allBreak = false; break; }
  }
  check(tag + " solution is unique (any single nudge breaks it)", allBreak);

  /* hints must be about THIS level and tier 3 must name a real coefficient */
  /* a genuinely unbalanced vector: the seed is guaranteed unbalanced, and a
     naive "flip every 1 to a 2" produces [2,2,2] on 1:1:1 reactions, which IS
     balanced and would test nothing. */
  const wrong = Core.seedCoefs(lv);
  const h1 = Core.hintText(lv, wrong, 1);
  const h3 = Core.hintText(lv, wrong, 3);
  check(tag + " tier-1 hint is general advice", /one element/i.test(h1));
  check(tag + " tier-3 hint names a coefficient from the solution", /<strong>\d+<\/strong>/.test(h3), h3);
  check(tag + " tier-3 never dumps the whole answer", (h3.match(/<strong>/g) || []).length <= 3, h3);

  worst = Math.max(worst, Core.difficulty(lv));
});
console.log("     band counts: " + bandCounts.join(" / ") + "  (max coefficient shipped: " + maxCoefSeen + ")");
check("all five chapters populated", bandCounts.every((n) => n > 0), bandCounts.join(","));
check("progression spans 38-48 levels", L.length === 48);

/* ---------- the app's own UI cap must not block a real answer ---------- */
check("UI coefficient cap covers the largest shipped answer", maxCoefSeen <= 30, String(maxCoefSeen));
check("UI cap constant is 30", /MAXC\s*=\s*30/.test(html));

/* ---------- every literal getElementById resolves to markup ---------- */
const ids = new Set();
const idRe = /getElementById\("([^"]+)"\)/g;
let m;
while ((m = idRe.exec(html))) ids.add(m[1]);
let missing = [];
ids.forEach((id) => {
  if (!new RegExp('id="' + id + '"').test(html)) missing.push(id);
});
check("all " + ids.size + " getElementById targets exist in markup", missing.length === 0, missing.join(","));

/* ---------- the hook the browser gate drives ---------- */
["FORMULA"].forEach((h) => check("exposes window." + h + " hook", new RegExp("window\\." + h + "\\s*=").test(html)));

console.log("\n== result ==");
console.log(pass + " passed, " + fail + " failed");
if (fail) { console.log("failures:\n - " + failures.join("\n - ")); process.exit(1); }
console.log("GREEN");
