// In-page encoder: turns the render surface into an H.264 + AAC MP4.
//
// There is no native ffmpeg on this machine (the 196 MB build would not download over this
// link), but Chromium can encode H.264 High profile and AAC through WebCodecs, so the whole
// film is produced in the browser and handed back as a file.
//
// Exposes window.encodeFilm(opts) -> { bytes, frames, seconds, codec }.
import { Muxer, ArrayBufferTarget } from "/vendor/mp4-muxer.mjs";

const SAMPLE_RATE = 48_000;

/** 1080p60 needs level 4.2; fall back through the levels the browser will take. */
async function pickVideoCodec(width, height, bitrate, framerate) {
  for (const codec of ["avc1.64002A", "avc1.640028", "avc1.4D402A", "avc1.4D0028"]) {
    try {
      const s = await VideoEncoder.isConfigSupported({ codec, width, height, bitrate, framerate });
      if (s.supported) return codec;
    } catch {}
  }
  throw new Error("no supported H.264 configuration");
}

/** Mix the narration into one continuous track, each line at its planned start. */
async function buildAudio(film, from, to) {
  const span = to - from;
  const lines = film.shots.filter((s) => s.voFile && s.voAt + 60 > from && s.voAt < to);
  const ctx = new OfflineAudioContext(2, Math.ceil(span * SAMPLE_RATE), SAMPLE_RATE);

  for (const s of lines) {
    const res = await fetch(`../${s.voFile}`);
    if (!res.ok) throw new Error(`missing narration: ${s.voFile}`);
    const buf = await ctx.decodeAudioData(await res.arrayBuffer());
    const src = ctx.createBufferSource();
    src.buffer = buf;
    // a touch of headroom so the voice never clips against the mix bus
    const gain = ctx.createGain();
    gain.gain.value = 0.92;
    src.connect(gain).connect(ctx.destination);
    const at = s.voAt - from;
    at >= 0 ? src.start(at) : src.start(0, -at);
  }
  return ctx.startRendering();
}

window.encodeFilm = async function encodeFilm(opts = {}) {
  const film = window.__film;
  const fps = film.fps || 60;
  const from = opts.from ?? 0;
  const to = opts.to ?? film.duration;
  const width = film.width;
  const height = film.height;
  const bitrate = opts.bitrate ?? 12_000_000;
  const frames = Math.round((to - from) * fps);

  const codec = await pickVideoCodec(width, height, bitrate, fps);
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: "avc", width, height, frameRate: fps },
    audio: { codec: "aac", numberOfChannels: 2, sampleRate: SAMPLE_RATE },
    fastStart: "in-memory", // so the file plays immediately, including over http
  });

  // ── audio ──────────────────────────────────────────────────────────────
  const mixed = await buildAudio(film, from, to);
  const audioEncoder = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: (e) => { throw e; },
  });
  audioEncoder.configure({ codec: "mp4a.40.2", sampleRate: SAMPLE_RATE, numberOfChannels: 2, bitrate: 192_000 });

  const L = mixed.getChannelData(0);
  const R = mixed.numberOfChannels > 1 ? mixed.getChannelData(1) : L;
  const BLOCK = 1024;
  for (let i = 0; i < mixed.length; i += BLOCK) {
    const n = Math.min(BLOCK, mixed.length - i);
    const planar = new Float32Array(n * 2);
    planar.set(L.subarray(i, i + n), 0);
    planar.set(R.subarray(i, i + n), n);
    const ad = new AudioData({
      format: "f32-planar",
      sampleRate: SAMPLE_RATE,
      numberOfFrames: n,
      numberOfChannels: 2,
      timestamp: Math.round((i / SAMPLE_RATE) * 1e6),
      data: planar,
    });
    audioEncoder.encode(ad);
    ad.close();
    if (audioEncoder.encodeQueueSize > 48) await new Promise((r) => setTimeout(r, 0));
  }
  await audioEncoder.flush();
  audioEncoder.close();

  // ── video ──────────────────────────────────────────────────────────────
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { throw e; },
  });
  videoEncoder.configure({
    codec,
    width,
    height,
    bitrate,
    framerate: fps,
    latencyMode: "quality",
    avc: { format: "avc" },
  });

  const canvas = window.studio.canvas;
  const frameDur = 1e6 / fps;
  for (let i = 0; i < frames; i++) {
    const t = from + i / fps;
    window.studio.seek(t);
    const frame = new VideoFrame(canvas, {
      timestamp: Math.round(i * frameDur),
      duration: Math.round(frameDur),
    });
    // a keyframe every two seconds keeps seeking responsive in a player
    videoEncoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
    frame.close();
    if (videoEncoder.encodeQueueSize > 12) {
      while (videoEncoder.encodeQueueSize > 4) await new Promise((r) => setTimeout(r, 0));
    }
    if (i % 60 === 0) window.__progress?.(i, frames);
  }
  await videoEncoder.flush();
  videoEncoder.close();

  muxer.finalize();
  const buffer = muxer.target.buffer;

  // hand the file to Playwright as a download
  const blob = new Blob([buffer], { type: "video/mp4" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = opts.filename || "parity-demo.mp4";
  document.body.appendChild(a);
  a.click();

  return { bytes: buffer.byteLength, frames, seconds: to - from, codec };
};
