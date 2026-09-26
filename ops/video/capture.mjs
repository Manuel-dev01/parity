// Captures real product footage for the demo video: high-resolution stills of every state
// the film needs, plus the viewport geometry of the elements the camera zooms to.
//
//   node ops/video/capture.mjs [baseUrl]
//
// Nothing here fabricates product behaviour, and two rules enforce that:
//
//  1. Every interaction waits for the page to actually hydrate. On a 150 KB/s link the
//     Next client chunks take far longer to arrive than they do in dev, and a click on an
//     un-hydrated page is silently a no-op — which is how an earlier run produced three
//     byte-identical "different" ticker states.
//  2. A shot that is supposed to show a change is hashed against the shot before it and
//     REJECTED if it is identical. A still that didn't change is not evidence.
//
// The order slip needs a connected wallet (`disabled={!address}`), so the refusal state is
// not reachable here. It is presented in the film as a labelled evidence panel built from a
// real POST /api/v1/swap response — see ops/video/evidence.mjs.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const BASE = process.argv[2] || "https://parity-manuel-dev01s-projects.vercel.app";
const OUT = "ops/video/src";
mkdirSync(OUT, { recursive: true });

const W = 1440;
const H = 900;
const SCALE = 2; // capture at 2x so the camera can push in without softening type

const shots = [];
const hashes = new Map();
const problems = [];

const hash = (buf) => createHash("md5").update(buf).digest("hex");

/**
 * React attaches its props to the DOM node once a tree hydrates. Until then the markup is
 * the server's HTML and every handler is missing, so clicks do nothing.
 */
async function waitHydrated(page, timeout = 180_000) {
  const t0 = Date.now();
  await page.waitForFunction(
    () => {
      for (const el of document.querySelectorAll("button, a")) {
        const k = Object.keys(el).find((x) => x.startsWith("__reactProps$"));
        if (k && el[k] && typeof el[k].onClick === "function") return true;
      }
      return false;
    },
    null,
    { timeout, polling: 400 },
  );
  return Date.now() - t0;
}

/**
 * Screenshot, and record it. `mustDifferFrom` names an earlier shot this one is claiming to
 * differ from; if the pixels are identical the interaction did not happen and we say so
 * rather than shipping a still that misrepresents the product.
 */
async function shoot(page, name, note, mustDifferFrom = null) {
  await page.evaluate(() => Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 8000))])).catch(() => {});
  const buf = await page.screenshot({ timeout: 120_000, animations: "disabled" });
  const h = hash(buf);
  if (mustDifferFrom && hashes.get(mustDifferFrom) === h) {
    problems.push(`${name}: identical to ${mustDifferFrom} — the interaction did not take effect, shot NOT saved`);
    console.log("  ✗ REJECTED", name, `(identical to ${mustDifferFrom})`);
    return false;
  }
  writeFileSync(`${OUT}/${name}.png`, buf);
  hashes.set(name, h);
  shots.push({ name, note, bytes: buf.length, md5: h.slice(0, 12) });
  console.log("  ✓", name, note ? `— ${note}` : "");
  return true;
}

/** Viewport rect of a selector, in CSS pixels, for the camera to target. */
async function rectOf(page, selector, index = 0) {
  return page
    .evaluate(
      ([sel, i]) => {
        const el = document.querySelectorAll(sel)[i];
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
      },
      [selector, index],
    )
    .catch(() => null);
}

/** Scroll a real element into view rather than guessing pixel offsets past the page end. */
async function scrollToText(page, text, block = "center") {
  const ok = await page.evaluate(
    ([t, b]) => {
      // Not every section marker is a heading — "What Parity does not know" is a list
      // label — so search broadly and take the tightest element that contains the text.
      const hits = [...document.querySelectorAll("h1,h2,h3,h4,p,li,dt,span,strong,figure,section,canvas")].filter(
        (e) => (e.textContent || "").toLowerCase().includes(t.toLowerCase()),
      );
      const el = hits.sort((a, b2) => (a.textContent || "").length - (b2.textContent || "").length)[0];
      if (!el) return false;
      el.scrollIntoView({ block: b, behavior: "instant" });
      return true;
    },
    [text, block],
  );
  if (!ok) problems.push(`scroll target not found: ${text}`);
  await page.waitForTimeout(1200);
  return ok;
}

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: SCALE,
  reducedMotion: "reduce", // stills must not catch a transition mid-flight
});
const page = await ctx.newPage();
page.setDefaultTimeout(180_000);

const go = async (path, settle = 2500) => {
  await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 180_000 });
  const ms = await waitHydrated(page).catch(() => null);
  console.log(`  · ${path} hydrated in ${ms == null ? "NEVER" : `${(ms / 1000).toFixed(1)}s`}`);
  if (ms == null) problems.push(`${path} never hydrated`);
  await page.waitForTimeout(settle);
};

console.log("capturing from", BASE);

// ── Landing ────────────────────────────────────────────────────────────────
await go("/", 4000);
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(800);
await shoot(page, "landing-hero", "three inks out of register");
const heroRect = await rectOf(page, ".display");

// the registration snap is a real product interaction, not an edit
await page.hover(".display").catch(() => {});
await page.waitForTimeout(2200);
await shoot(page, "landing-hero-aligned", "hovered: inks in register", "landing-hero");
await page.mouse.move(20, 20);
await page.waitForTimeout(1600);

await page.evaluate(() => window.scrollBy({ top: 620, behavior: "instant" }));
await page.waitForTimeout(1200);
await shoot(page, "landing-headline", "headline + live spread", "landing-hero");
await scrollToText(page, "How Parity lines them up", "start");
await shoot(page, "landing-steps", "how Parity lines them up", "landing-headline");
// "Spreads, this minute" and "Receipts" are adjacent columns of one section, so a single
// frame carries both — there is no second shot to take here.
await scrollToText(page, "Spreads, this minute", "start");
await shoot(page, "landing-board", "spreads this minute, and the receipts rail", "landing-steps");

// Fig. 1 builds from live polling, so give it time to draw a line worth showing
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(400);
await scrollToText(page, "", "center").catch(() => {});
const figFound = await page.evaluate(() => {
  const c = document.querySelector("canvas");
  if (!c) return false;
  c.scrollIntoView({ block: "center", behavior: "instant" });
  return true;
});
if (figFound) {
  await page.waitForTimeout(25_000); // let the live buffer actually accumulate
  await shoot(page, "landing-fig1", "Fig. 1, sampled live this session");
} else problems.push("Fig. 1 canvas not found");

// ── Markets ────────────────────────────────────────────────────────────────
await go("/markets", 3500);
await shoot(page, "markets-now", "ranked by spread");
const rowRect = await rectOf(page, 'a[href^="/s/"]', 0);
await go("/markets?view=history", 3500);
await shoot(page, "markets-history", "sampled history", "markets-now");

// ── Ticker ─────────────────────────────────────────────────────────────────
await go("/s/SPCX", 9000);
await shoot(page, "ticker-1k", "the answer at $1,000");
const headlineRect = await rectOf(page, "h1");
const fairRect = await rectOf(page, ".provenance");

// real size change → the ranking genuinely reorders
const headingText = () =>
  page.locator("h2").filter({ hasText: /tokens at/i }).first().textContent().catch(() => null);
const before25 = await headingText();
const chip = page.locator("button", { hasText: /^\$25k$/ });
if (await chip.count()) {
  await chip.first().click();
  await page.waitForFunction(
    (prev) => {
      const h = [...document.querySelectorAll("h2")].find((e) => /tokens at/i.test(e.textContent || ""));
      return h && h.textContent !== prev;
    },
    before25,
    { timeout: 30_000 },
  ).catch(() => problems.push("size chip: heading never changed"));
  await page.waitForTimeout(9000); // let every issuer re-quote at the new size
  await shoot(page, "ticker-25k", "same screen at $25,000", "ticker-1k");
} else problems.push("$25k chip not found");

// provenance popover: a real product surface
await page.locator(".provenance").first().click().catch(() => {});
await page
  .getByText("Where this figure comes from")
  .first()
  .waitFor({ state: "visible", timeout: 20_000 })
  .catch(() => problems.push("provenance popover never opened"));
await page.waitForTimeout(900);
await shoot(page, "ticker-source", "where fair value comes from", "ticker-25k");
await page.mouse.click(12, 12);
await page.waitForTimeout(800);

// guard slider: real UI state, reachable without a wallet
const slider = page.locator('input[type="range"]').first();
const slipRect = await rectOf(page, "input[type=range]");
if (await slider.count()) {
  await slider.fill("10");
  await page.waitForTimeout(2500);
  await shoot(page, "ticker-guard-10", "guard tightened to ±10 bps", "ticker-source");
} else problems.push("guard slider not found");

// ── Receipts ───────────────────────────────────────────────────────────────
await go("/receipts", 3500);
await shoot(page, "receipts", "the public ledger");
const fills = await page.evaluate(() =>
  [...document.querySelectorAll('a[href^="/r/"]')].map((a) => a.getAttribute("href")).filter(Boolean),
);
if (fills[0]) {
  await go(fills[0], 4000);
  await shoot(page, "receipt-top", "a single receipt", "receipts");
  await scrollToText(page, "Check it yourself", "start");
  await shoot(page, "receipt-verify", "check it yourself", "receipt-top");
} else problems.push("no receipts linked on /receipts");

// ── Methodology ────────────────────────────────────────────────────────────
await go("/methodology", 2500);
await scrollToText(page, "does not know", "start");
await shoot(page, "methodology-unknown", "what Parity does not know");

writeFileSync(
  `${OUT}/manifest.json`,
  JSON.stringify(
    {
      base: BASE,
      capturedAt: new Date().toISOString(),
      viewport: { width: W, height: H, scale: SCALE },
      rects: { hero: heroRect, row: rowRect, headline: headlineRect, fair: fairRect, slip: slipRect },
      shots,
      problems,
    },
    null,
    2,
  ),
);

console.log(`\n${shots.length} stills → ${OUT}`);
if (problems.length) {
  console.log("\nPROBLEMS (nothing was faked to cover these):");
  for (const p of problems) console.log("  !", p);
}
await ctx.close();
await browser.close();
