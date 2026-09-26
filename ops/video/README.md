# The demo film

A 5:00 product film at 1920×1080, 60 fps, with a neural voiceover — built from real footage
of the deployed app, rendered and encoded entirely on this machine.

```
node ops/video/capture.mjs      # real stills from the deployed app  -> src/
node ops/video/evidence.mjs     # a real API refusal                 -> src/refusal.json
node ops/video/plan.mjs         # narration + timing                 -> build/film.json
node ops/video/contact.mjs      # one frame per shot (seconds)       -> out/contact/
node ops/video/render.mjs --preview   # 18s motion test              -> out/
node ops/video/render.mjs       # the full 5:00 cut                  -> out/
node ops/video/verify.mjs out/parity-demo-5min.mp4 30 120 210
```

## What is real, and what is presentation

This matters more than the production value, and the pipeline enforces it rather than
relying on good intentions.

**Real, captured from the deployed app:**

- every screen in the film — the stills in `src/` are Playwright screenshots of
  `parity-manuel-dev01s-projects.vercel.app`, at 2× device scale;
- every number on those screens: live fair values, live spreads, live quotes, real receipts;
- the guard refusal — a genuine `HTTP 409` from `POST /api/v1/swap`, captured in
  `src/refusal.json` and rendered from that file, never typed by hand;
- the QR code on the closing card, generated from the live URL so it actually scans.

**Added in the edit, and disclosed on screen:**

- the browser window frame, shadow, background and camera moves;
- the **cursor**. It is not a recording of a real pointer. Wherever it appears, the frame
  carries the label *"presentation cursor — added in edit"*;
- the **refusal panel**, which carries the label *"LIVE API RESPONSE — NOT A SCREEN
  RECORDING"* and shows the request beside the response. The narration says the same thing
  out loud: the order slip requires a connected wallet, so the refusal was requested from
  the endpoint the button calls rather than staged with a fake wallet session.

Nothing in the film depicts a transaction being signed, confirmed or settled.

## Three failures worth knowing about

**The narration has to match the session that was captured, not the session you imagined.**
The stills were taken with the US market closed, so fair value on the ticker falls back to
the Backpack perpetual mark and the popover reads `Source: backpack-perp`, `Confidence: not
published`. An earlier cut of the script said fair value "comes from Pyth's on-chain accounts"
with "the confidence band around it" — true of the method, false of the footage on screen.
It was rewritten to say what the screen says, which turned out to be the better moment
anyway: it shows the provenance panel doing its job. **If the stills are re-captured during
market hours, the `fair`, `source` and `steps` lines have to be revisited.**


**Clicks on an un-hydrated page do nothing, silently.** The first capture run produced three
byte-identical "different" ticker states, because `/s/SPCX` needs ~21 s to hydrate on this
link and the script waited 9 s. `capture.mjs` now waits for React to attach handlers, and
hashes each shot against the previous one — a still that was supposed to change and did not
is **rejected rather than saved**.

**A cached clip of an old script is how a voiceover starts lying.** `plan.mjs` writes a
`.txt` sidecar next to each `.mp3` and re-synthesises whenever the line changes. If the
neural endpoint is unreachable it exits rather than plan against a stale or robotic clip.

## Why there is no ffmpeg here

The 196 MB ffmpeg build would not come down this link (it managed 1.2 MB in 2.5 minutes),
and the `ffmpeg-static` npm binary arrived truncated — `EFTYPE`. So the film is composited
on a canvas and encoded with **WebCodecs** inside Chromium: H.264 High profile at level 4.2
(`avc1.64002A`) plus AAC-LC, muxed with `mp4-muxer` and handed back as a download.

`verify.mjs` therefore does its own checking: it parses the MP4 box tree for the container's
claimed duration and sample counts, then decodes the file back in a browser that has H.264
decoding (Playwright's bundled Chromium can *encode* H.264 but not decode it — use Edge or
Chrome) and writes out frames so the type can be read.

## The voice

Microsoft's `en-US-AndrewNeural`, over the same free endpoint Edge's Read Aloud uses. Three
things about it are load-bearing and were each found the hard way:

| Symptom | Cause |
|---|---|
| every handshake `403` | the `Sec-MS-GEC` token hashes a Windows FILETIME (~1.8×10¹⁹), which silently loses precision as a JS number — it must be `BigInt` |
| still `403` | the socket rejects older Chrome version strings; `130.x` fails, `133.x` works |
| `1007 Unsupported Edge output format` | it serves no PCM and no 48 kHz format; the best available is `audio-24khz-96kbitrate-mono-mp3` |

Node's built-in `WebSocket` drops custom headers, which the endpoint requires, hence the `ws`
dependency. If the endpoint is unreachable, `voice.mjs` falls back to the Windows OneCore
voices so the film is never silent — but `plan.mjs` treats that as a failure and stops.

## Timing

Shot durations are never hand-written. `plan.mjs` synthesises each line, measures it exactly
(the MP3 is constant-bitrate, so bytes map straight to seconds), and sets each shot to
`lead-in + voice + tail`. Whatever is left against the 300 s target is distributed across the
holds, weighted toward the cards and captioned shots, so the film lands on exactly 5:00
without altering the pace of the narration.

`plan.mjs` also normalises the camera tracks: every shot settles on its opening framing
before it moves, and any move longer than four seconds eases in and out.

## Files

| Path | What it is |
|---|---|
| `film.mjs` | the edit: narration, camera keyframes, cursor paths, captions |
| `plan.mjs` | synthesises the voice, measures it, fits the picture, writes `build/film.json` |
| `studio/studio.html` | the render surface — every frame is a pure function of a timestamp |
| `studio/encode.mjs` | in-page H.264 + AAC encoder and muxer |
| `render.mjs` | drives the render and saves the MP4 |
| `verify.mjs` | container parse + real decode + frame extraction |
| `contact.mjs` | one frame per shot, in seconds rather than an hour |
| `capture.mjs` | real product stills, with hydration waits and duplicate rejection |
| `evidence.mjs` | captures a real API refusal |
| `voice.mjs` | neural TTS, with a Windows fallback |
| `src/` | captured stills + `manifest.json` + `refusal.json` |
| `check-encoders.mjs` | which H.264 / AAC configurations this machine's browsers will take |
| `out/` | rendered video, contact sheets and extracted frames |

Re-rendering the same range produces the same frames: nothing reads the wall clock.
