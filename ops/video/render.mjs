// Render the film.
//
//   node ops/video/render.mjs --preview      18s motion test  -> ops/video/out/
//   node ops/video/render.mjs                the full 5:00 cut
//   node ops/video/render.mjs --from=83 --to=101 --name=foo
//
// Frames are composited and encoded inside Chromium (see studio/encode.mjs), because this
// machine has no native ffmpeg. Everything is driven off a timestamp, so a re-render of the
// same range produces the same file.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright";

const ROOT = "ops/video";
const OUT = `${ROOT}/out`;
mkdirSync(OUT, { recursive: true });

const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.split("=").slice(1).join("=") : d;
};
const preview = process.argv.includes("--preview");

const filmPath = `${ROOT}/build/film.json`;
if (!existsSync(filmPath)) {
  console.error("no build/film.json — run: node ops/video/plan.mjs");
  process.exit(1);
}
const film = JSON.parse(await readFile(filmPath, "utf8"));

// The preview deliberately spans a cut, so both the camera moves and the transition between
// two shots can be judged before committing to a full render.
const from = Number(arg("from", preview ? 77 : 0));
const to = Number(arg("to", preview ? 95 : film.duration));
const name = arg("name", preview ? "parity-demo-preview" : "parity-demo-5min");
const bitrate = Number(arg("bitrate", 12_000_000));

// ── a tiny static server: WebCodecs needs a secure context, 127.0.0.1 counts ──
const TYPES = {
  ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript",
  ".json": "application/json", ".png": "image/png", ".mp3": "audio/mpeg", ".wav": "audio/wav",
};
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
    res.writeHead(404).end("not found");
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;

// ── render ────────────────────────────────────────────────────────────────
const browser = await chromium.launch({
  args: ["--autoplay-policy=no-user-gesture-required", "--disable-gpu-vsync", "--js-flags=--max-old-space-size=4096"],
});
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 760 },
  acceptDownloads: true,
});
const page = await ctx.newPage();
page.on("pageerror", (e) => console.error("  page error:", String(e.message).slice(0, 220)));
page.on("console", (m) => m.type() === "error" && console.error("  console:", m.text().slice(0, 220)));

await page.goto(`${origin}/studio/studio.html`, { waitUntil: "load" });

const loaded = await page.evaluate(async (f) => {
  window.__film = f;
  return window.studio.load(f);
}, film);
console.log(`loaded ${loaded.shots} shots, ${loaded.images} stills, ${film.duration}s film`);

const frames = Math.round((to - from) * film.fps);
console.log(`rendering ${from}s → ${to}s  (${frames} frames at ${film.fps}fps, ${(bitrate / 1e6).toFixed(0)} Mbps)`);

const t0 = Date.now();
let lastPct = -1;
await page.exposeFunction("__progress", (i, n) => {
  const pct = Math.floor((i / n) * 100);
  if (pct !== lastPct && pct % 5 === 0) {
    const el = (Date.now() - t0) / 1000;
    const eta = i ? (el / i) * (n - i) : 0;
    console.log(`  ${String(pct).padStart(3)}%  ${i}/${n} frames  ${el.toFixed(0)}s elapsed  ~${eta.toFixed(0)}s left`);
    lastPct = pct;
  }
});
await page.addScriptTag({ url: "/studio/encode.mjs", type: "module" });
await page.waitForFunction(() => typeof window.encodeFilm === "function", null, { timeout: 30_000 });

const downloadPromise = page.waitForEvent("download", { timeout: 40 * 60_000 });
const result = await page.evaluate(
  (o) => window.encodeFilm(o),
  { from, to, bitrate, filename: `${name}.mp4` },
);
const download = await downloadPromise;
const dest = join(OUT, `${name}.mp4`);
await download.saveAs(dest);

const size = statSync(dest).size;
console.log(`\n${dest}`);
console.log(`  ${result.frames} frames · ${result.seconds.toFixed(3)}s · ${result.codec} · ${(size / 1e6).toFixed(1)} MB`);
console.log(`  encoded in ${((Date.now() - t0) / 1000).toFixed(0)}s`);

await browser.close();
server.close();
