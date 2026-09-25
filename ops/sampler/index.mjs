// Pings Parity's snapshot endpoint once, then exits. Railway runs this on a cron
// schedule; Vercel's Hobby plan caps its own cron at one run per day, which is far
// too sparse for a divergence tape.
const url = process.env.PARITY_URL;
const secret = process.env.CRON_SECRET;
// Railway runs the service once as soon as it deploys, which is before variables can be
// set on a brand-new project. Treat that as a no-op rather than a crash alert.
if (!url) {
  console.log("PARITY_URL not set — nothing to ping yet");
  process.exit(0);
}

const r = await fetch(`${url.replace(/\/$/, "")}/api/cron/snapshot`, {
  headers: secret ? { authorization: `Bearer ${secret}` } : {},
  signal: AbortSignal.timeout(60_000),
});
const body = await r.text();
console.log(new Date().toISOString(), r.status, body.slice(0, 200));
if (!r.ok) process.exitCode = 1;
