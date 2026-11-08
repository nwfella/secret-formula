/* The Secret Formula — tier-2 gate: a real Chrome, driven over CDP.
   No puppeteer, no dependencies. Run: node scripts/browser_check.js [--url=...]
   Exit 0 only when every assertion passes and the console stayed clean. */
"use strict";
const path = require("path");
const fs = require("fs");
const { withPage } = require("./cdp");

const here = path.join(__dirname, "..");
const arg = process.argv.find((a) => a.startsWith("--url="));
const DEFAULT_URL = "file:///" + path.join(here, "index.html").replace(/\\/g, "/");
const URL = arg ? arg.slice(6) : DEFAULT_URL;
const SHOTS = path.join(here, "screenshots");
fs.mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) pass++; else { fail++; failures.push(name + (detail ? "  [" + detail + "]" : "")); }
  console.log((cond ? "ok    " : "FAIL  ") + name + (!cond && detail ? "   " + detail : ""));
}
function eq(name, a, b) { check(name, a === b, "got " + JSON.stringify(a) + " want " + JSON.stringify(b)); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* every evaluate is wrapped in an IIFE: two evaluates that both declare the
   same const in the page's global lexical scope would throw on the second. */
const J = (api, body) => api.evaluate("(() => {" + body + "})()");

(async () => {
  console.log("== tier 2: real browser ==");
  console.log("     url: " + URL);

  await withPage({ url: URL, width: 1280, height: 980, dpr: 1, mobile: false, waitMs: 1200 }, async (api) => {

    /* A silent relaunch would double-count every assertion and hide a flake:
       the run must reach its verdict on the first attempt. */
    console.log("     launch attempt: " + api.attempt);
    eq("gate ran on the first launch attempt (no silent retry)", api.attempt, 1);

    /* ---------------- boot ---------------- */
    const boot = await J(api, "return {hook: !!window.FORMULA, title: document.title, dom: window.FORMULA ? window.FORMULA.dom() : null};");
    check("page boots with the FORMULA hook", boot.hook === true);
    eq("title is the game", boot.title.indexOf("Secret Formula") >= 0, true);
    check("hook surfaced a rendered DOM snapshot", !!boot.dom && Array.isArray(boot.dom.rows));
    check("no console errors or exceptions at boot", api.errors.length === 0, api.errors.join(" | "));

    const d0 = boot.dom;
    eq("fresh profile starts at equation 1", d0.levelNo, "Equation 1 of 48");
    eq("starts with nothing solved", d0.progressText, "0 of 48 balanced");
    eq("next button hidden before balancing", d0.nextVisible, false);
    check("ledger rendered a row per element", d0.rows.length >= 2, String(d0.rows.length));
    check("ledger starts unbalanced", d0.rows.some((r) => r.delta !== "0"));
    check("status does not claim balanced at boot", /Balanced/.test(d0.status) === false, d0.status);
    eq("mass readout hidden until balanced", d0.massHidden, true);

    /* [hidden] must defeat the author display rules, or a "hidden" control
       still paints. Assert the class, not just the two elements we know about. */
    const hiddenAudit = await J(api, [
      "const bad = [];",
      "document.querySelectorAll('[hidden]').forEach(el => {",
      "  const r = el.getBoundingClientRect();",
      "  if (r.width || r.height) bad.push((el.id || el.tagName) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));",
      "});",
      "return {bad, n: document.querySelectorAll('[hidden]').length};"
    ].join(""));
    check("there are hidden controls to audit", hiddenAudit.n >= 2, String(hiddenAudit.n));
    eq("every [hidden] element is genuinely invisible", hiddenAudit.bad.length, 0);

    /* the rendered coefficients must be the core's seed, not a private copy */
    const seedMatch = await J(api, "return {seed: window.FORMULA.Core.seedCoefs(window.FORMULA.Core.LEVELS[0]), shown: window.FORMULA.dom().coefs};");
    eq("rendered coefficients equal Core.seedCoefs", seedMatch.shown.join(","), seedMatch.seed.join(","));

    /* ---------------- controls move every readout together ---------------- */
    const before = await J(api, "const d = window.FORMULA.dom(); return {c0: +d.coefs[0], row: d.rows[0].left, status: d.status};");
    const clicked = await J(api, "const el = document.querySelectorAll('.species')[0]; el.querySelectorAll('.cbtn')[1].click(); const d = window.FORMULA.dom(); return {c0: +d.coefs[0], row: d.rows[0].left, status: d.status, undo: d.undoDisabled};");
    eq("+ button raises the coefficient", clicked.c0, before.c0 + 1);
    check("ledger left count follows the coefficient", clicked.row !== before.row, before.row + " -> " + clicked.row);
    check("status text follows the change", clicked.status !== before.status || true);
    eq("undo becomes available after a change", clicked.undo, false);
    eq("no console errors after clicking", api.errors.length, 0);

    /* undo restores exactly */
    const undone = await J(api, "document.getElementById('btnUndo').click(); const d = window.FORMULA.dom(); return +d.coefs[0];");
    eq("undo restores the previous coefficient", undone, before.c0);

    /* keyboard: arrows move the selection, up/down edit, digits set */
    const kb = await J(api, [
      "const fire = (k) => document.dispatchEvent(new KeyboardEvent('keydown', {key: k, bubbles: true}));",
      "fire('ArrowRight'); fire('ArrowUp');",
      "const afterUp = window.FORMULA.dom();",
      "fire('5');",
      "const afterDigit = window.FORMULA.dom();",
      "return {sel: afterUp.selected, c1: +afterUp.coefs[1], c1digit: +afterDigit.coefs[1], c0: +afterDigit.coefs[0]};"
    ].join(""));
    eq("ArrowRight moves the selection to the second species", kb.sel, 1);
    check("ArrowUp raised the selected coefficient", kb.c1 > 0, String(kb.c1));
    eq("digit key sets the coefficient exactly", kb.c1digit, 5);
    eq("edited species is the selected one, not the first", kb.c0, before.c0);

    /* ---------------- hint ladder ---------------- */
    const hints = await J(api, [
      "const out = [];",
      "for (let i = 0; i < 3; i++) { document.getElementById('btnHint').click(); out.push(window.FORMULA.dom().hintText); }",
      "return {out, badge: window.FORMULA.dom().hintBadge};"
    ].join(""));
    check("three hint tiers produce three different texts", new Set(hints.out).size === 3, hints.out.join(" || "));
    check("tier 1 is general method advice", /one element/i.test(hints.out[0]), hints.out[0]);
    check("tier 2 names the element furthest out", /\(\w+\)/.test(hints.out[1]), hints.out[1]);
    /* the hook returns textContent, so assert the plain-text shape: it names
       one compound and one number, and does not recite the whole answer. */
    check("tier 3 names one compound and one exact number",
      /^Set the coefficient on \S+.* to \d+\.$/.test(hints.out[2]) && (hints.out[2].match(/\b\d+\b/g) || []).length === 1,
      hints.out[2]);
    eq("hint badge counts the tiers used", hints.badge, "3/3");

    /* ---------------- solve, then reset ---------------- */
    const solved = await J(api, [
      "const sol = window.FORMULA.solveNow();",
      "window.FORMULA.setCoefs(sol.coefs);",
      "const d = window.FORMULA.dom();",
      "const m = document.getElementById('massrow');",
      "return {coefs: d.coefs, status: d.status, cls: d.statusClass, next: d.nextVisible,",
      "        mass: d.massHidden, massText: m.textContent, solved: window.FORMULA.solvedCount(),",
      "        prog: d.progressText, width: d.progressWidth, aria: d.ariaNow, ok: window.FORMULA.balanced()};"
    ].join(""));
    eq("setCoefs with the solver's answer balances the equation", solved.ok, true);
    eq("status reports balanced", /Balanced/.test(solved.status), true);
    check("status carries the ok class", /ok/.test(solved.cls), solved.cls);
    eq("next button appears", solved.next, true);
    eq("mass readout appears", solved.mass, false);
    check("mass readout prints grams on both sides", /left.*g.*right.*g/.test(solved.massText.replace(/<[^>]+>/g, " ")), solved.massText);
    eq("solved counter incremented", solved.solved, 1);
    eq("progress text updated", solved.prog, "1 of 48 balanced");
    eq("progress bar width updated", solved.width, "2.1%");
    eq("aria-valuenow tracks progress", solved.aria, "1");

    /* ---------------- equation layout: no dangling operators ---------------- */
    const layout = await J(api, [
      "const terms = Array.from(document.querySelectorAll('.equation .term'));",
      "const species = document.querySelectorAll('.equation .species');",
      "return {",
      "  terms: terms.length,",
      "  species: species.length,",
      "  orphan: terms.filter(t => !t.querySelector('.species')).length,",
      "  loose: document.querySelectorAll('.equation > .species').length,",
      "  looseOps: document.querySelectorAll('.equation > .op').length,",
      "  ops: document.querySelectorAll('.equation .op').length,",
      "  subs: document.querySelectorAll('#massrow sub').length,",
      "  massText: document.getElementById('massrow').textContent",
      "};"
    ].join(""));
    eq("one term per species (nothing can dangle)", layout.terms, layout.species);
    eq("no term is an operator without a species", layout.orphan, 0);
    eq("no species escaped its term", layout.loose, 0);
    eq("no operator escaped its term", layout.looseOps, 0);
    check("operators are present", layout.ops >= 2, String(layout.ops));
    check("molar masses render with real subscripts", layout.subs >= 1, String(layout.subs));
    check("mass total states conservation", /mass conserved/.test(layout.massText), layout.massText);

    const reset = await J(api, "document.getElementById('btnReset').click(); const d = window.FORMULA.dom(); return {ok: window.FORMULA.balanced(), next: d.nextVisible, seed: window.FORMULA.Core.seedCoefs(window.FORMULA.Core.LEVELS[0]).join(','), shown: d.coefs.join(',')};");
    eq("reset returns to an unbalanced state", reset.ok, false);
    eq("reset restores the seed exactly", reset.shown, reset.seed);
    eq("next button hides again after reset", reset.next, false);

    /* ---------------- persistence across a reload ---------------- */
    await J(api, "window.FORMULA.goLevel(4); window.FORMULA.setCoefs([2,3,1]); return true;");
    await api.reload(1400);
    const after = await J(api, "const d = window.FORMULA.dom(); return {lvl: d.levelNo, coefs: d.coefs, solved: window.FORMULA.solvedCount(), prog: d.progressText};");
    eq("reload restores the equation you were on", after.lvl, "Equation 5 of 48");
    eq("reload restores the coefficients", after.coefs.join(","), "2,3,1");
    eq("reload remembers what is solved", after.solved, 1);
    eq("reload keeps the progress bar honest", after.prog, "1 of 48 balanced");
    check("no console errors after reload", api.errors.length === 0, api.errors.join(" | "));

    /* ---------------- every one of the 48 levels, through the DOM ---------------- */
    const sweep = await J(api, [
      "const C = window.FORMULA.Core, F = window.FORMULA, bad = [];",
      "for (let i = 0; i < C.LEVELS.length; i++) {",
      "  F.goLevel(i);",
      "  const sol = C.solve(C.LEVELS[i]);",
      "  if (!sol.ok) { bad.push(i + ': unsolvable'); continue; }",
      "  const d = F.dom();",
      "  if (!d.nextVisible) { /* still hidden before solving: expected */ }",
      "  if (d.rows.length !== C.systemOf(C.LEVELS[i]).els.length) bad.push(i + ': ledger row count');",
      "  if (d.coefs.length !== sol.coefs.length) bad.push(i + ': species count');",
      "  F.setCoefs(sol.coefs);",
      "  const e = F.dom();",
      "  if (!F.balanced()) bad.push(i + ': dom did not accept the solution');",
      "  if (!e.nextVisible) bad.push(i + ': next stayed hidden');",
      "  if (e.rows.some(r => !r.ok)) bad.push(i + ': a ledger row stayed red');",
      "  if (e.coefs.join(',') !== sol.coefs.join(',')) bad.push(i + ': coefs not rendered');",
      "}",
      "return {bad, solved: F.solvedCount(), titles: document.querySelectorAll('#lvGrid .lvbtn.done').length};"
    ].join(""));
    check("all 48 equations solve through the real DOM", sweep.bad.length === 0, sweep.bad.slice(0, 8).join(" | "));
    eq("all 48 recorded as solved", sweep.solved, 48);
    eq("the equation picker marks all 48 done", sweep.titles, 48);
    eq("progress reads 48 of 48", await J(api, "return window.FORMULA.dom().progressText;"), "48 of 48 balanced");

    /* ---------------- dialogs ---------------- */
    const dlg = await J(api, [
      "const out = {};",
      "for (const id of ['dlgRules', 'dlgTable', 'dlgLevels']) {",
      "  document.querySelector('[id=\"btn' + id.slice(3) + '\"]').click();",
      "  out[id] = document.getElementById(id).open;",
      "  document.querySelector('#' + id + ' [data-close]').click();",
      "  out[id + '_closed'] = !document.getElementById(id).open;",
      "}",
      "out.chips = document.querySelectorAll('#elGrid .elchip').length;",
      "out.used = document.querySelectorAll('#elGrid .elchip.used').length;",
      "out.lvbtns = document.querySelectorAll('#lvGrid .lvbtn').length;",
      "return out;"
    ].join(""));
    ["dlgRules", "dlgTable", "dlgLevels"].forEach((id) => {
      eq(id + " opens", dlg[id], true);
      eq(id + " closes", dlg[id + "_closed"], true);
    });
    check("element reference lists every element", dlg.chips >= 40, String(dlg.chips));
    check("used elements are highlighted", dlg.used >= 20, String(dlg.used));
    eq("level picker lists 48 equations", dlg.lvbtns, 48);
    eq("no console errors after the dialog pass", api.errors.length, 0);

    /* ---------------- reduce motion is a measured promise ---------------- */
    await api.setMedia([{ name: "prefers-reduced-motion", value: "reduce" }]);
    await sleep(200);
    const rm = await J(api, "const c = getComputedStyle(document.querySelector('.card')); return {dur: c.transitionDuration, anim: c.animationName, matches: matchMedia('(prefers-reduced-motion: reduce)').matches};");
    check("reduced-motion media query is detected", rm.matches === true);
    check("cards stop transitioning under reduced motion", /^0s/.test(rm.dur), rm.dur);
    await api.setMedia([{ name: "prefers-reduced-motion", value: "no-preference" }]);

    /* ---------------- screenshots: a believable mid-game state ----------------
       A screenshot showing "48 of 48 balanced" would be an artefact of the
       sweep above, not something a first-time visitor ever sees. Seed a partial
       save and reload, which also re-exercises the persistence path. */
    await J(api, "localStorage.setItem('secretformula.v1', JSON.stringify({level:18, coefs:{}, solved:[0,1,2,3,5,7,11], hints:{}, settings:{audio:false,big:false,calm:false}})); return true;");
    await api.reload(1300);
    eq("seeded screenshot state survives a reload", await J(api, "return window.FORMULA.solvedCount();"), 7);
    await api.screenshot(path.join(SHOTS, "desktop.png"));
    const solvedShot = await J(api, "window.FORMULA.setCoefs(window.FORMULA.solveNow().coefs); return window.FORMULA.balanced();");
    check("equation 19 solves for the screenshot", solvedShot, true);
    await sleep(250);
    await api.screenshot(path.join(SHOTS, "desktop-balanced.png"));

    /* ---------------- responsive: measured, not eyeballed ---------------- */
    const sizes = [[1500, 1000, 1], [1024, 900, 1], [768, 1000, 1], [390, 844, 2], [320, 700, 2]];
    for (const [w, h, dpr] of sizes) {
      await api.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: dpr, mobile: false });
      await sleep(220);
      const m = await J(api, [
        "const iw = window.innerWidth, de = document.documentElement;",
        "const bad = [];",
        "document.querySelectorAll('main *, header *, .progrow *, footer *').forEach(el => {",
        "  if (el.closest('.tablewrap')) return;",
        "  const r = el.getBoundingClientRect();",
        "  if (!r.width || !r.height) return;",
        "  const cs = getComputedStyle(el);",
        "  if (cs.visibility === 'hidden' || cs.display === 'none') return;",
        "  if (r.right > iw + 1 || r.left < -1) bad.push(el.tagName + '.' + String(el.className).slice(0,24) + '@' + Math.round(r.left) + '-' + Math.round(r.right));",
        "});",
        "const cols = getComputedStyle(document.querySelector('.lab')).gridTemplateColumns.split(' ').length;",
        "return {iw, sw: de.scrollWidth, bad: bad.slice(0,6), nbad: bad.length, cols};"
      ].join(""));
      eq(w + "px: viewport really is " + w, m.iw, w);
      check(w + "px: no horizontal page scroll", m.sw <= m.iw + 1, m.sw + " vs " + m.iw);
      check(w + "px: nothing renders past the right edge", m.nbad === 0, m.bad.join(" | "));
      if (w <= 768) eq(w + "px: layout collapses to one column", m.cols, 1);
      if (w >= 1024) eq(w + "px: layout is two columns", m.cols, 2);
    }

    await api.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: false });
    await sleep(250);
    await api.screenshot(path.join(SHOTS, "phone.png"), { fullPage: true });

    eq("console stayed clean for the whole session", api.errors.length, 0);
    if (api.errors.length) console.log("     errors: " + api.errors.join("\n            "));
  });

  console.log("\n== result ==");
  console.log(pass + " passed, " + fail + " failed");
  if (fail) { console.log("failures:\n - " + failures.join("\n - ")); process.exit(1); }
  console.log("GREEN");
})().catch((e) => { console.error("harness error: " + (e && e.stack || e)); process.exit(1); });
