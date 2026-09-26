// Contact sheet: render single frames straight off the canvas, with no encoding.
//
//   node ops/video/contact.mjs              one frame per shot, mid-shot
//   node ops/video/contact.mjs 12 44 180    those exact timestamps
//
// A full render is ~55 minutes, so every framing decision gets checked here first.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { mkdirSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright";

const ROOT = "ops/video";
const OUT = `${ROOT}/out/contact`;
mkdirSync(OUT, { recursive: true });

const film = JSON.parse(await readFile(`${ROOT}/build/film.json`, "utf8"));
const times = process.argv.slice(2).map(Number).filter((n) => !Number.isNaN(n));

const TYPES = { ".html": "text/html", ".mjs": "text/javascript", ".json": "application/json", ".png": "image/png" };
const server = createServer(async (req, res) => {
  try {
    const url = decodeURIComponent(req.url.split("?")[0]);
    const path = url.startsWith("/vendor/")
      ? join("node_modules/mp4-muxer/build", url.slice("/vendor/".length))
      : join(ROOT, normalize(url).replace(/^([/\\])+/, ""));
    const body = await readFile(path);
    res.writeHead(200, { "content-type": TYPES[extname(path)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
page.on("pageerror", (e) => console.error("  page error:", String(e.message).slice(0, 200)));
await page.goto(`${origin}/studio/studio.html`, { waitUntil: "load" });
await page.evaluate(async (f) => {
  window.__film = f;
  return window.studio.load(f);
}, film);

// Default: a frame from each shot, taken late enough that the camera move has travelled.
const picks = times.length
  ? times.map((t) => ({ t, label: `t${String(t).replace(".", "_")}` }))
  : film.shots.map((s) => ({ t: s.start + s.duration * 0.72, label: s.id }));

for (const { t, label } of picks) {
  await page.evaluate((x) => window.studio.seek(x), t);
  await page.locator("#stage").screenshot({ path: join(OUT, `${label}.png`) });
  console.log(`  ${String(t.toFixed(1)).padStart(6)}s  ${label}`);
}
console.log(`\n${picks.length} frames → ${OUT}`);

await browser.close();
server.close();
