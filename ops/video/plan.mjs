// Synthesise the narration, measure it, and fit the picture to the voice.
//
// Shot durations are never hand-written: each one is the measured length of its spoken line
// plus a lead-in and a tail, so the cut can never drift out of sync with what is being said.
// Any slack left over against the 5:00 target is spread across the holds, so the film lands
// on exactly 300.000 seconds without speeding anyone up.
//
//   node ops/video/plan.mjs            synthesise anything missing, then plan
//   node ops/video/plan.mjs --force    re-synthesise every line
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import QRCode from "qrcode";
import { shots, VOICE, TARGET_SECONDS, URL_BAR } from "./film.mjs";
import { speak } from "./voice.mjs";

const AUDIO = "ops/video/audio";
const BUILD = "ops/video/build";
mkdirSync(AUDIO, { recursive: true });
mkdirSync(BUILD, { recursive: true });

const force = process.argv.includes("--force");
const LEAD_IN = 0.38; // the picture cuts, then the voice starts
const BITRATE = 96_000;

/** Exact for the constant-bitrate MP3 the endpoint returns. */
const secondsOf = (file) => (statSync(file).size * 8) / BITRATE;

console.log(`synthesising ${shots.length} lines as ${VOICE.voice}\n`);

const timed = [];
for (const s of shots) {
  const file = `${AUDIO}/${s.id}.mp3`;
  const sidecar = `${AUDIO}/${s.id}.txt`;
  // Re-synthesise whenever the line changes: a cached clip of an older script is the one
  // way the voice can end up saying something the film no longer claims.
  const stale = !existsSync(sidecar) || readFileSync(sidecar, "utf8") !== s.vo;
  let engine = "cached";
  if (force || !existsSync(file) || stale) {
    const r = await speak(s.vo, `${AUDIO}/${s.id}`, VOICE);
    engine = r.engine + (r.attempts > 1 ? ` (${r.attempts} tries)` : "");
    if (r.engine !== "neural") {
      // Never leave a stale clip in place claiming to be the current line.
      console.error(`\n  ! ${s.id}: neural voice unavailable — ${r.error}`);
      console.error(`    refusing to plan against a stale or robotic clip. Re-run when the endpoint answers.\n`);
      process.exit(1);
    }
    writeFileSync(sidecar, s.vo);
  }
  const vo = secondsOf(file);
  const body = LEAD_IN + vo + (s.tail ?? 0.8);
  const duration = Math.max(s.minHold ?? 0, body);
  timed.push({ ...s, voFile: `audio/${s.id}.mp3`, voSeconds: vo, duration });
  console.log(`  ${s.id.padEnd(18)} ${vo.toFixed(2).padStart(6)}s voice  ${duration.toFixed(2).padStart(6)}s shot  ${engine}`);
}

/**
 * Two rules the camera tracks in film.mjs express as intent rather than keyframes:
 *
 *  · every shot settles on its opening framing before it moves, so the cut lands on a
 *    still image and the viewer can read it;
 *  · a long move eases in AND out, because the signature ease is front-loaded and over
 *    eight seconds it spends most of the shot drifting through the middle of the move.
 */
function normalizeCamera(track) {
  if (!track || track.length < 2) return track;
  const out = [...track];
  if (out[0].at === 0) {
    const settle = Math.min(1.3, out[1].at * 0.35);
    if (settle > 0.2) out.splice(1, 0, { ...out[0], at: settle });
  }
  return out.map((k, i) => {
    if (i === 0 || k.ease) return k;
    const gap = k.at - out[i - 1].at;
    return gap > 4 ? { ...k, ease: "inOut" } : k;
  });
}
for (const s of timed) s.camera = normalizeCamera(s.camera);

const spoken = timed.reduce((a, s) => a + s.voSeconds, 0);
const natural = timed.reduce((a, s) => a + s.duration, 0);
console.log(`\nspoken: ${spoken.toFixed(1)}s   picture: ${natural.toFixed(1)}s   target: ${TARGET_SECONDS}s`);

if (natural > TARGET_SECONDS) {
  const over = natural - TARGET_SECONDS;
  console.log(`\nOVER by ${over.toFixed(1)}s. Trim narration in ops/video/film.mjs — longest lines:`);
  [...timed]
    .sort((a, b) => b.voSeconds - a.voSeconds)
    .slice(0, 6)
    .forEach((s) => console.log(`  ${s.id.padEnd(18)} ${s.voSeconds.toFixed(1)}s  ${s.vo.split(" ").length} words`));
  process.exitCode = 1;
} else {
  // Spread the slack across holds, weighted to the shots that can carry a longer beat:
  // cards and captioned shots breathe well, dense read-alouds less so.
  const slack = TARGET_SECONDS - natural;
  const weight = (s) => (s.kind === "card" ? 2.2 : s.captions ? 1.5 : 1);
  const totalWeight = timed.reduce((a, s) => a + weight(s), 0);
  let t = 0;
  for (const s of timed) {
    s.duration += (slack * weight(s)) / totalWeight;
    s.start = t;
    s.voAt = t + LEAD_IN;
    t += s.duration;
  }
  // absorb any float drift into the final shot so the total is exact
  timed[timed.length - 1].duration += TARGET_SECONDS - t;

  console.log(`\nadded ${slack.toFixed(1)}s of holds → exactly ${TARGET_SECONDS}s`);

  // The refusal panel, rendered from the captured API response — never hand-written.
  let evidence = null;
  const evPath = "ops/video/src/refusal.json";
  if (existsSync(evPath)) {
    const r = JSON.parse(readFileSync(evPath, "utf8"));
    const f = r.response?.refusal;
    if (f) {
      evidence = {
        note: r.presentation.note,
        request: [
          `POST /api/v1/swap`,
          `  symbol     ${r.request.symbol}`,
          `  usd        ${r.request.usd}`,
          `  maxDevBps  ${r.request.maxDevBps}`,
          `  owner      ${r.request.owner.slice(0, 8)}…${r.request.owner.slice(-6)}`,
        ],
        response: [
          `HTTP ${r.status} — the transaction was not built`,
          `  ${f.token} would fill ${f.devBps > 0 ? "+" : ""}${f.devBps} bps from fair value`,
          `  fair ${f.fairPx}   fill ${Number(f.fillPx).toFixed(2)}   guard ±${f.maxDevBps} bps`,
          `  that is $${Number(f.awayUsd).toFixed(2)} above fair on $${f.usd}`,
          `  nothing was signed and nothing was spent`,
          ...(f.options || []).map((o) => `  → ${o.title} — ${o.detail}`),
        ],
      };
    } else console.log("! refusal.json has no refusal object — the panel will be omitted");
  } else console.log("! no refusal.json — run ops/video/evidence.mjs first");

  // The closing card carries a scannable link to the live app, generated here rather than
  // drawn by hand so it is a real, decodable QR rather than a picture of one.
  const liveUrl = `https://${URL_BAR}`;
  const qr = await QRCode.toDataURL(liveUrl, {
    margin: 1,
    width: 420,
    errorCorrectionLevel: "M",
    color: { dark: "#1A1512", light: "#F7F3EB" },
  });
  for (const s of timed) if (s.card && s.id === "close") s.card.qr = { href: liveUrl, image: qr };

  const film = {
    duration: TARGET_SECONDS,
    fps: 60,
    width: 1920,
    height: 1080,
    url: URL_BAR,
    builtAt: new Date().toISOString(),
    evidence,
    shots: timed.map(({ vo, minHold, tail, ...rest }) => rest),
  };
  writeFileSync(`${BUILD}/film.json`, JSON.stringify(film, null, 2));

  console.log(`\n→ ${BUILD}/film.json`);
  console.log("\nrunning order:");
  for (const s of timed) {
    const mm = String(Math.floor(s.start / 60)).padStart(2, "0");
    const ss = (s.start % 60).toFixed(1).padStart(4, "0");
    console.log(`  ${mm}:${ss}  ${s.id.padEnd(18)} ${s.duration.toFixed(1).padStart(5)}s  ${s.shot || "(card)"}`);
  }
}
