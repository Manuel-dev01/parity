// Verify a rendered MP4 the hard way: parse the container, then decode it back and look.
//
//   node ops/video/verify.mjs out/parity-demo-preview.mp4 [stillSeconds...]
//
// Reports the container's own duration and sample count (so a claim of "5:00, 18000 frames"
// is checked against the file, not against what the encoder said), then decodes frames and
// writes them out so the type can actually be read.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { mkdirSync, statSync, existsSync } from "node:fs";
import { basename, dirname, extname, join, normalize, resolve } from "node:path";
import { chromium } from "playwright";

const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.split("=").slice(1).join("=") : d;
};
const file = process.argv[2] || "ops/video/out/parity-demo-preview.mp4";
const stills = process.argv.slice(3).filter((a) => !a.startsWith("--")).map(Number).filter((n) => !Number.isNaN(n));
const OUT = "ops/video/out/frames";
mkdirSync(OUT, { recursive: true });

// ── container ─────────────────────────────────────────────────────────────
const buf = await readFile(file);

/** Walk the box tree and collect what the file claims about itself. */
function boxes(b, start, end, depth = 0, out = []) {
  let p = start;
  while (p + 8 <= end) {
    let size = b.readUInt32BE(p);
    const type = b.toString("ascii", p + 4, p + 8);
    let head = 8;
    if (size === 1) {
      size = Number(b.readBigUInt64BE(p + 8));
      head = 16;
    } else if (size === 0) size = end - p;
    if (size < head) break;
    out.push({ type, start: p, size, depth });
    if (["moov", "trak", "mdia", "minf", "stbl", "edts"].includes(type)) {
      boxes(b, p + head, p + size, depth + 1, out);
    }
    p += size;
  }
  return out;
}

const tree = boxes(buf, 0, buf.length);
const find = (t) => tree.find((x) => x.type === t);

const mvhd = find("mvhd");
let movie = null;
if (mvhd) {
  const v = buf[mvhd.start + 8];
  const off = mvhd.start + (v === 1 ? 8 + 4 + 8 + 8 : 8 + 4 + 4 + 4);
  const timescale = v === 1 ? buf.readUInt32BE(mvhd.start + 28) : buf.readUInt32BE(off);
  const dur = v === 1 ? Number(buf.readBigUInt64BE(mvhd.start + 32)) : buf.readUInt32BE(off + 4);
  movie = { timescale, duration: dur, seconds: dur / timescale };
}

// count video samples from every stsz, and pick the one belonging to the video track
const stszs = tree.filter((x) => x.type === "stsz").map((x) => ({
  count: buf.readUInt32BE(x.start + 16),
  sampleSize: buf.readUInt32BE(x.start + 12),
}));
const hasAvc = tree.some((x) => x.type === "stbl") && buf.includes(Buffer.from("avcC"));
const hasAac = buf.includes(Buffer.from("mp4a"));
const faststart = tree.findIndex((x) => x.type === "moov") < tree.findIndex((x) => x.type === "mdat");

console.log(`file      ${file}`);
console.log(`size      ${(statSync(file).size / 1e6).toFixed(1)} MB`);
console.log(`boxes     ${tree.filter((t) => t.depth === 0).map((t) => t.type).join(" ")}`);
if (movie) console.log(`duration  ${movie.seconds.toFixed(3)}s  (${movie.duration}/${movie.timescale})`);
console.log(`samples   ${stszs.map((s) => s.count).join(" + ")}  (video track is the larger)`);
console.log(`codecs    avcC:${hasAvc ? "yes" : "NO"}  mp4a:${hasAac ? "yes" : "NO"}`);
console.log(`faststart ${faststart ? "yes (moov before mdat)" : "no"}`);

// ── decode ────────────────────────────────────────────────────────────────
const dir = resolve(dirname(file));
const server = createServer(async (req, res) => {
  const url = normalize(decodeURIComponent(req.url.split("?")[0])).replace(/^([/\\])+/, "");
  // The player must be served from the same origin as the file, and media loading needs
  // real byte-range support — a 200 to a Range request stalls the decoder.
  if (url === "" || url === "index.html") {
    res.writeHead(200, { "content-type": "text/html" });
    return res.end(
      `<body style="margin:0;background:#000"><video id="v" src="/${basename(file)}" style="width:1920px;height:1080px" muted playsinline></video></body>`,
    );
  }
  if (url === "jsqr.mjs") {
    // the QR decoder, served to the page so the closing card can actually be scanned
    const src = await readFile("node_modules/jsqr/dist/jsQR.js", "utf8");
    res.writeHead(200, { "content-type": "text/javascript" });
    return res.end(`${src}\nexport default (typeof jsQR !== "undefined" ? jsQR : globalThis.jsQR);`);
  }
  try {
    const body = await readFile(join(dir, url));
    const type = extname(url) === ".mp4" ? "video/mp4" : "application/octet-stream";
    const range = req.headers.range;
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      const start = m[1] ? Number(m[1]) : 0;
      const end = m[2] ? Number(m[2]) : body.length - 1;
      res.writeHead(206, {
        "content-type": type,
        "accept-ranges": "bytes",
        "content-range": `bytes ${start}-${end}/${body.length}`,
        "content-length": end - start + 1,
      });
      return res.end(body.subarray(start, end + 1));
    }
    res.writeHead(200, { "content-type": type, "accept-ranges": "bytes", "content-length": body.length });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;

// Playwright's bundled Chromium can ENCODE H.264 (OpenH264) but cannot DECODE it, so a
// real browser build is needed to prove the file plays.
let browser = null;
let via = null;
for (const opts of [{ channel: "msedge" }, { channel: "chrome" }, {}]) {
  try {
    browser = await chromium.launch(opts);
    via = opts.channel || "bundled-chromium";
    break;
  } catch {}
}
if (!browser) throw new Error("no browser available to decode with");
console.log(`decoder   ${via}`);
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(`${origin}/`, { waitUntil: "load" });

const meta = await page.evaluate(async () => {
  const v = document.getElementById("v");
  // metadata may already have arrived before this runs — never wait for an event that fired
  if (v.readyState < 1) {
    await new Promise((res, rej) => {
      v.onloadedmetadata = res;
      v.onerror = () => rej(new Error("decode failed: " + (v.error?.message || v.error?.code)));
      setTimeout(() => (v.readyState >= 1 ? res() : rej(new Error("metadata timeout"))), 60_000);
    });
  }
  if (v.error) throw new Error("decode failed: " + v.error.message);
  return { duration: v.duration, w: v.videoWidth, h: v.videoHeight, readyState: v.readyState };
});
console.log(`\ndecoded   ${meta.w}x${meta.h}  ${meta.duration.toFixed(3)}s`);

// play a stretch and count frames the decoder actually presents
const played = await page.evaluate(async () => {
  const v = document.getElementById("v");
  let n = 0;
  v.currentTime = 0;
  await v.play().catch(() => {});
  const tick = () => { n++; v.requestVideoFrameCallback(tick); };
  v.requestVideoFrameCallback(tick);
  await new Promise((r) => setTimeout(r, 3000));
  v.pause();
  return { frames: n, at: v.currentTime };
});
console.log(`playback  ${played.frames} frames presented in ~3s up to t=${played.at.toFixed(2)}s`);

// ── the QR on the closing card must actually scan ─────────────────────────
if (process.argv.includes("--qr") || !stills.length) {
  const at = Number(arg("qrAt", meta.duration - 4));
  const decoded = await page.evaluate(async ([sec, jsqrSrc]) => {
    const v = document.getElementById("v");
    v.currentTime = sec;
    await new Promise((res) => { v.onseeked = res; setTimeout(res, 8000); });
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d").drawImage(v, 0, 0);
    const img = c.getContext("2d").getImageData(0, 0, c.width, c.height);
    // eslint-disable-next-line no-new-func
    const mod = await import(jsqrSrc);
    const jsQR = mod.default || mod;
    const r = jsQR(img.data, img.width, img.height);
    return r ? r.data : null;
  }, [at, "/jsqr.mjs"]);
  console.log(`qr        ${decoded ? `scans → ${decoded}` : "NOT DETECTED"}  (at t=${at.toFixed(1)}s)`);
}

// ── transitions: every cut should actually change the picture ─────────────
if (existsSync("ops/video/build/film.json")) {
  const plan = JSON.parse(await readFile("ops/video/build/film.json", "utf8"));
  const grab = async (sec) =>
    page.evaluate(async (s) => {
      const v = document.getElementById("v");
      v.currentTime = s;
      await new Promise((res) => { v.onseeked = res; setTimeout(res, 8000); });
      const c = document.createElement("canvas");
      c.width = 320;
      c.height = 180;
      c.getContext("2d").drawImage(v, 0, 0, 320, 180);
      const d = c.getContext("2d").getImageData(0, 0, 320, 180).data;
      let sum = 0;
      const out = new Array(320 * 180);
      for (let i = 0; i < out.length; i++) {
        const l = (d[i * 4] * 299 + d[i * 4 + 1] * 587 + d[i * 4 + 2] * 114) / 1000;
        out[i] = l;
        sum += l;
      }
      return { px: out, mean: sum / out.length };
    }, sec);

  console.log("\ncuts (mean luma change across each boundary, and black-frame check):");
  let bad = 0;
  for (const s of plan.shots.slice(1)) {
    const a = await grab(Math.max(0, s.start - 0.25));
    const b = await grab(Math.min(meta.duration - 0.05, s.start + 0.25));
    let diff = 0;
    for (let i = 0; i < a.px.length; i++) diff += Math.abs(a.px[i] - b.px[i]);
    diff /= a.px.length;
    const black = Math.min(a.mean, b.mean) < 6;
    const flag = black ? " BLACK FRAME" : diff < 0.6 ? " no visible change" : "";
    if (flag) bad++;
    console.log(`  ${s.start.toFixed(1).padStart(6)}s → ${s.id.padEnd(18)} Δ${diff.toFixed(1).padStart(6)}${flag}`);
  }
  console.log(bad ? `  ${bad} boundary(s) to look at` : "  every cut changes the picture, none go black");
}

for (const t of stills) {
  await page.evaluate(async (sec) => {
    const v = document.getElementById("v");
    v.currentTime = sec;
    await new Promise((res) => { v.onseeked = res; setTimeout(res, 8000); });
  }, t);
  const name = `${basename(file, ".mp4")}-t${String(t).replace(".", "_")}.png`;
  await page.locator("#v").screenshot({ path: join(OUT, name) });
  console.log(`still     ${join(OUT, name)}`);
}

await browser.close();
server.close();
