// Tiny Neon-over-HTTP client. Uses Neon's SQL-over-HTTP endpoint so we need no driver;
// DATABASE_URL is the normal postgres:// connection string from Neon / Vercel Marketplace.
// Every function degrades to "no data" when DATABASE_URL is unset so the app still runs.

const url = process.env.DATABASE_URL;

function httpEndpoint(conn: string) {
  const u = new URL(conn);
  return `https://${u.hostname}/sql`;
}

export const dbConfigured = !!url;

export async function sql<T = Record<string, unknown>>(query: string, params: unknown[] = []): Promise<T[]> {
  if (!url) return [];
  const r = await fetch(httpEndpoint(url), {
    method: "POST",
    headers: { "content-type": "application/json", "neon-connection-string": url, "neon-array-mode": "false" },
    body: JSON.stringify({ query, params }),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`db ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = (await r.json()) as { rows: T[] };
  return j.rows;
}

export async function migrate() {
  await sql(`create table if not exists snapshots (
    ts timestamptz not null,
    symbol text not null,
    issuer text not null,
    mint text not null,
    px double precision,
    ref double precision,
    bps integer,
    liquidity double precision,
    primary key (ts, mint)
  )`);
  await sql(`create index if not exists snapshots_symbol_ts on snapshots (symbol, ts desc)`);
  await sql(`create table if not exists fills (
    sig text primary key,
    ts timestamptz not null default now(),
    wallet text not null,
    symbol text not null,
    issuer text not null,
    mint text not null,
    usd double precision not null,
    shares double precision not null,
    fill_px double precision not null,
    fair_px double precision not null,
    dev_bps integer not null,
    saved_usd double precision,
    guarded boolean not null default false,
    receipt text
  )`);
}
