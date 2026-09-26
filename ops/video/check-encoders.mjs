// Decides the encoder for the demo render: can a browser here encode H.264 (and AAC)
// via WebCodecs? If yes we need no native ffmpeg to produce the MP4.
import { chromium } from "playwright";
import { createServer } from "node:http";

// WebCodecs is gated on a secure context; 127.0.0.1 counts as one.
const srv = createServer((_q, r) => { r.writeHead(200, { "content-type": "text/html" }); r.end("<!doctype html><title>probe</title>"); });
await new Promise((ok) => srv.listen(0, "127.0.0.1", ok));
const ORIGIN = `http://127.0.0.1:${srv.address().port}/`;

const targets = [
  ["bundled-chromium", {}],
  ["msedge", { channel: "msedge" }],
  ["chrome", { channel: "chrome" }],
];

for (const [label, opts] of targets) {
  let b;
  try {
    b = await chromium.launch(opts);
  } catch (e) {
    console.log(label, "LAUNCH FAIL:", String(e.message).split("\n")[0].slice(0, 100));
    continue;
  }
  const p = await b.newPage();
  await p.goto(ORIGIN);
  const r = await p
    .evaluate(async () => {
      const out = {
        ua: (navigator.userAgent.match(/(Chrome|Edg)\/[\d.]+/g) || []).join(" "),
        VideoEncoder: typeof VideoEncoder,
        AudioEncoder: typeof AudioEncoder,
        video: {},
        audio: {},
      };
      if (typeof VideoEncoder !== "undefined") {
        for (const codec of ["avc1.640028", "avc1.4D0028", "avc1.42E01E", "vp09.00.10.08", "vp8"]) {
          for (const acc of ["prefer-software", "no-preference"]) {
            try {
              const s = await VideoEncoder.isConfigSupported({
                codec,
                width: 1920,
                height: 1080,
                bitrate: 12_000_000,
                framerate: 60,
                hardwareAcceleration: acc,
              });
              out.video[`${codec}/${acc}`] = !!s.supported;
            } catch (e) {
              out.video[`${codec}/${acc}`] = "err:" + e.name;
            }
          }
        }
      }
      if (typeof AudioEncoder !== "undefined") {
        for (const codec of ["mp4a.40.2", "opus"]) {
          try {
            const s = await AudioEncoder.isConfigSupported({
              codec,
              sampleRate: 48000,
              numberOfChannels: 2,
              bitrate: 192000,
            });
            out.audio[codec] = !!s.supported;
          } catch (e) {
            out.audio[codec] = "err:" + e.name;
          }
        }
      }
      return out;
    })
    .catch((e) => ({ error: String(e.message).slice(0, 160) }));
  console.log(label, JSON.stringify(r, null, 1));
  await b.close();
}
srv.close();
