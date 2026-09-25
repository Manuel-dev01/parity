// Live browser sweep. Loads every screen at desktop and mobile, exercises the controls,
// and reports console errors, failed requests, horizontal overflow, layout spills and
// dead controls. Screenshots land in ops/shots/.
//   node ops/sweep.mjs [baseUrl]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] || "https://parity-manuel-dev01s-projects.vercel.app";
const SHOTS = "ops/shots";
mkdirSync(SHOTS, { recursive: true });

const SCREENS = [
  ["landing", "/"],
  ["markets-now", "/markets"],
  ["markets-history", "/markets?view=history"],
  ["ticker-spcx", "/s/SPCX"],
  ["ticker-nvda", "/s/NVDA"],
  ["holdings", "/holdings"],
  ["receipts", "/receipts"],
  ["methodology", "/methodology"],
  ["notfound", "/s/ZZZZNOPE"],
];

const VIEWPORTS = [
  ["desktop", 1440, 900],
  ["mobile", 390, 844],
];

const findings = [];
const note = (screen, vp, kind, detail) => findings.push({ screen, vp, kind, detail });

async function audit(page, screen, vpName, width) {
  // horizontal overflow: the page body must never scroll sideways
  const overflow = await page.evaluate((w) => {
    const de = document.documentElement;
    const spills = [];
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right > w + 1 || r.left < -1) {
        const cs = getComputedStyle(el);
        if (cs.position === "fixed") continue;
        spills.push({
          tag: el.tagName.toLowerCase(),
          cls: (el.className || "").toString().slice(0, 40),
          text: (el.textContent || "").trim().slice(0, 50),
          left: Math.round(r.left),
          right: Math.round(r.right),
        });
      }
    }
    return { scrollW: de.scrollWidth, clientW: de.clientWidth, spills: spills.slice(0, 6) };
  }, width);
  if (overflow.scrollW > overflow.clientW + 1) {
    note(screen, vpName, "overflow", `page scrolls sideways: scrollWidth ${overflow.scrollW} > ${overflow.clientW}`);
    for (const s of overflow.spills) note(screen, vpName, "spill", `<${s.tag} class="${s.cls}"> right=${s.right} "${s.text}"`);
  }

  // controls that lead nowhere
  const dead = await page.evaluate(() => {
    const out = [];
    for (const a of document.querySelectorAll("a")) {
      const href = a.getAttribute("href");
      if (!href || href === "#") out.push(`<a> with no href: "${(a.textContent || "").trim().slice(0, 40)}"`);
    }
    for (const b of document.querySelectorAll("button")) {
      if (!(b.textContent || "").trim() && !b.getAttribute("aria-label")) out.push("<button> with no label or aria-label");
    }
    return out.slice(0, 8);
  });
  for (const d of dead) note(screen, vpName, "dead-control", d);

  // tiny tap targets on mobile
  if (width < 500) {
    const small = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll("button, a, input[type=range], select")) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.height < 24) out.push(`${el.tagName.toLowerCase()} ${Math.round(r.width)}x${Math.round(r.height)} "${(el.textContent || "").trim().slice(0, 30)}"`);
      }
      return out.slice(0, 6);
    });
    for (const s of small) note(screen, vpName, "tap-target", s);
  }

  // states that never resolve
  const stuck = await page.evaluate(() => {
    const t = document.body.innerText;
    const hits = [];
    for (const p of ["Reading your balances", "Loading", "undefined", "NaN", "[object Object]", "Invalid Date"]) {
      if (t.includes(p)) hits.push(p);
    }
    return hits;
  });
  for (const s of stuck) note(screen, vpName, "bad-text", `page shows "${s}"`);
}

const browser = await chromium.launch();
for (const [vpName, width, height] of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  for (const [screen, path] of SCREENS) {
    const page = await ctx.newPage();
    const errors = [];
    const failed = [];
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text().slice(0, 160));
    });
    page.on("pageerror", (e) => errors.push(`pageerror: ${String(e).slice(0, 160)}`));
    page.on("requestfailed", (r) => failed.push(`${r.method()} ${r.url().slice(0, 90)} — ${r.failure()?.errorText}`));
    page.on("response", (r) => {
      if (r.status() >= 400) failed.push(`${r.status()} ${r.url().slice(0, 90)}`);
    });

    let status = 0;
    try {
      const resp = await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90_000 });
      status = resp?.status() ?? 0;
      await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
      await page.waitForTimeout(5000); // let client polling settle
    } catch (e) {
      note(screen, vpName, "navigation", `failed to load: ${String(e).slice(0, 120)}`);
    }
    if (status && status >= 400 && screen !== "notfound") note(screen, vpName, "http", `HTTP ${status}`);

    try {
      await audit(page, screen, vpName, width);
    } catch (e) {
      // a client-side navigation can destroy the execution context mid-audit
      note(screen, vpName, "audit-skipped", String(e).slice(0, 100));
    }
    for (const e of [...new Set(errors)]) note(screen, vpName, "console", e);
    for (const f of [...new Set(failed)].slice(0, 6)) note(screen, vpName, "request", f);

    await page.screenshot({ path: `${SHOTS}/${screen}-${vpName}.png`, fullPage: true }).catch(() => {});
    await page.close();
  }
  await ctx.close();
}
await browser.close();

const byKind = {};
for (const f of findings) (byKind[f.kind] ??= []).push(f);
console.log(`\n=== SWEEP: ${findings.length} findings across ${SCREENS.length} screens x ${VIEWPORTS.length} viewports ===\n`);
for (const [kind, list] of Object.entries(byKind)) {
  console.log(`## ${kind} (${list.length})`);
  for (const f of list) console.log(`  [${f.screen}/${f.vp}] ${f.detail}`);
  console.log();
}
if (!findings.length) console.log("clean\n");
