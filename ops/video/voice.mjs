// Neural voiceover for the demo film.
//
// pip could not reach files.pythonhosted.org on this link, so rather than ship a robotic
// SAPI voice this speaks to the same free Microsoft endpoint Edge's Read Aloud uses. Falls
// back to the Windows OneCore voices if that endpoint is unreachable, so the film is never
// silent. Three things about the endpoint were learned the hard way and are load-bearing:
//
//   · the Sec-MS-GEC token is a SHA-256 over a Windows FILETIME, which overflows a JS
//     number — it must be BigInt or every handshake returns 403;
//   · the socket 403s on older Chrome version strings (130 fails, 133 works);
//   · it serves no PCM or 48 kHz format, so the best available is 24 kHz 96 kbit MP3.
//
//   node ops/video/voice.mjs --list          list the available neural voices
//   node ops/video/voice.mjs --say "hello"   synthesise one line to ops/video/audio/test.*
import { createHash, randomUUID } from "node:crypto";
import { writeFileSync, mkdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
// Node's built-in WebSocket silently drops custom headers, which this endpoint requires.
import WebSocket from "ws";

const TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const ENDPOINT = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TOKEN}`;
const VOICES_URL = `https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken=${TOKEN}`;
const CHROME_VERSION = "133.0.3065.82";
const OUTPUT_FORMAT = "audio-24khz-96kbitrate-mono-mp3";
const BITRATE = 96_000;

export const DEFAULT_VOICE = "en-US-AndrewNeural";

function secMsGec() {
  let ticks = BigInt(Math.floor(Date.now() / 1000) + 11_644_473_600);
  ticks -= ticks % 300n; // round down to a five-minute boundary
  ticks *= 10_000_000n; // seconds -> 100ns units
  return createHash("sha256").update(`${ticks}${TOKEN}`).digest("hex").toUpperCase();
}

const HEADERS = {
  "User-Agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_VERSION} Safari/537.36 Edg/${CHROME_VERSION}`,
  Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
  "Accept-Language": "en-US,en;q=0.9",
};

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function listVoices() {
  const r = await fetch(`${VOICES_URL}&Sec-MS-GEC=${secMsGec()}&Sec-MS-GEC-Version=1-${CHROME_VERSION}`, {
    headers: HEADERS,
  });
  if (!r.ok) throw new Error(`voice list ${r.status}`);
  return r.json();
}

/** Synthesise one line. Resolves to MP3 bytes. */
export function speakNeural(text, { voice = DEFAULT_VOICE, rate = "+0%", pitch = "+0Hz", volume = "+0%" } = {}) {
  return new Promise((resolve, reject) => {
    const url = `${ENDPOINT}&Sec-MS-GEC=${secMsGec()}&Sec-MS-GEC-Version=1-${CHROME_VERSION}&ConnectionId=${randomUUID().replace(/-/g, "")}`;
    const ws = new WebSocket(url, { headers: HEADERS });
    const chunks = [];
    let settled = false;
    const finish = (err, val) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws.close(); } catch {}
      err ? reject(err) : resolve(val);
    };
    const timer = setTimeout(() => finish(new Error("timeout")), 90_000);

    ws.on("open", () => {
      const ts = new Date().toString();
      ws.send(
        `X-Timestamp:${ts}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
          JSON.stringify({
            context: {
              synthesis: {
                audio: {
                  metadataoptions: { sentenceBoundaryEnabled: "false", wordBoundaryEnabled: "false" },
                  outputFormat: OUTPUT_FORMAT,
                },
              },
            },
          }),
      );
      const ssml =
        `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>` +
        `<voice name='${voice}'><prosody pitch='${pitch}' rate='${rate}' volume='${volume}'>${esc(text)}</prosody></voice></speak>`;
      ws.send(
        `X-RequestId:${randomUUID().replace(/-/g, "")}\r\nContent-Type:application/ssml+xml\r\n` +
          `X-Timestamp:${ts}Z\r\nPath:ssml\r\n\r\n${ssml}`,
      );
    });

    ws.on("message", (data, isBinary) => {
      if (!isBinary) {
        if (data.toString().includes("Path:turn.end")) finish(null, Buffer.concat(chunks));
        return;
      }
      // binary frame: 2-byte big-endian header length, header text, then audio
      const buf = Buffer.from(data);
      const headLen = buf.readUInt16BE(0);
      if (buf.subarray(2, 2 + headLen).toString("utf8").includes("Path:audio")) chunks.push(buf.subarray(2 + headLen));
    });

    ws.on("error", (e) => finish(new Error("ws error: " + String(e?.message || "unknown").slice(0, 120))));
    ws.on("close", (code, reason) =>
      chunks.length
        ? finish(null, Buffer.concat(chunks))
        : finish(new Error(`socket closed with no audio (code ${code}, ${reason || "no reason"})`)),
    );
  });
}

/** Last resort so the film is never silent: the Windows OneCore voices. */
export function speakWindows(text, outWav, { windowsVoice = "Microsoft Mark" } = {}) {
  const ps = `
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
try { $s.SelectVoice(${JSON.stringify(windowsVoice)}) } catch { }
$s.Rate = -1
$s.SetOutputToWaveFile(${JSON.stringify(outWav)})
$s.Speak(${JSON.stringify(text)})
$s.Dispose()
`;
  execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], { stdio: "pipe" });
}

/**
 * Neural if we can reach it, Windows if we cannot. Writes `<outBase>.mp3` or `<outBase>.wav`
 * and reports which engine spoke. The duration is a planning estimate — the renderer
 * decodes the file for exact sample-accurate timing.
 */
export async function speak(text, outBase, opts = {}, attempts = 4) {
  mkdirSync(outBase.replace(/[/\\][^/\\]+$/, ""), { recursive: true });
  // The socket drops connections under load, and one bad roll of the dice must not put a
  // robotic line into the middle of the film — retry before ever giving up on the voice.
  let last = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const mp3 = await speakNeural(text, opts);
      if (!mp3.length) throw new Error("no audio returned");
      const file = `${outBase}.mp3`;
      writeFileSync(file, mp3);
      return { engine: "neural", file, seconds: (mp3.length * 8) / BITRATE, attempts: i + 1 };
    } catch (e) {
      last = e;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 1200 * (i + 1)));
    }
  }
  const file = `${outBase}.wav`;
  speakWindows(text, file, opts);
  const bytes = statSync(file).size - 44;
  return { engine: "windows-fallback", file, seconds: Math.max(0, bytes / 2 / 16_000), error: String(last?.message) };
}

// ── CLI ────────────────────────────────────────────────────────────────────
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = process.argv[2];
  if (arg === "--list") {
    const v = await listVoices();
    const en = v.filter((x) => x.Locale.startsWith("en-US"));
    console.log(`${v.length} voices, ${en.length} en-US:`);
    for (const x of en) {
      console.log(`  ${x.ShortName.padEnd(34)} ${x.Gender.padEnd(7)} ${(x.VoiceTag?.VoicePersonalities || []).join(", ")}`);
    }
  } else if (arg === "--say") {
    console.log(await speak(process.argv[3] || "Parity. Every stock on Solana, one fair price.", "ops/video/audio/test"));
  } else {
    console.log("usage: voice.mjs --list | --say <text>");
  }
}
