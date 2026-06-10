// Stockage des leads — deux drivers derrière la même interface :
//
// 1. Postgres (Neon) quand DATABASE_URL/POSTGRES_URL est défini — durable, c'est le
//    driver de production. Sur Vercel : Storage → Create Database → Neon (l'intégration
//    pose DATABASE_URL toute seule), puis redéployer. La table se crée au premier lead.
// 2. Fichier JSON Lines (data/leads/, gitignoré) sinon — dev local et auto-hébergement.
//    ⚠ Sur Vercel sans base, /tmp est éphémère : les leads ne survivent pas.
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { neon } from '@neondatabase/serverless';

export interface Lead {
  client: string;
  contact: { nom: string; courriel: string; [k: string]: unknown };
  recu?: string;
  ip?: string;
  [k: string]: unknown;
}

// ——— driver Postgres (Neon serverless, HTTP — aucun pool à gérer) ———
const DB_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';

let pgReady: Promise<void> | null = null;
function pg() {
  const sql = neon(DB_URL);
  pgReady ||= (async () => {
    await sql`CREATE TABLE IF NOT EXISTS leads (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      client TEXT NOT NULL,
      recu TIMESTAMPTZ NOT NULL DEFAULT now(),
      payload JSONB NOT NULL
    )`;
    await sql`CREATE INDEX IF NOT EXISTS leads_client_idx ON leads (client, recu)`;
  })();
  return { sql, ready: pgReady };
}

async function pgAppend(client: string, lead: Lead): Promise<void> {
  const { sql, ready } = pg();
  await ready;
  await sql`INSERT INTO leads (client, payload) VALUES (${client}, ${JSON.stringify(lead)}::jsonb)`;
}

async function pgRead(client: string): Promise<Lead[]> {
  const { sql, ready } = pg();
  await ready;
  const rows = await sql`SELECT payload FROM leads WHERE client = ${client} ORDER BY recu ASC`;
  return rows.map((r) => r.payload as Lead);
}

// ——— driver fichier (dev local / auto-hébergement) ———
const DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), 'leads')
  : path.join(process.cwd(), 'data', 'leads');

async function fileAppend(client: string, lead: Lead): Promise<void> {
  await fs.mkdir(DIR, { recursive: true });
  await fs.appendFile(path.join(DIR, `${client}.jsonl`), JSON.stringify(lead) + '\n', 'utf8');
}

async function fileRead(client: string): Promise<Lead[]> {
  try {
    const raw = await fs.readFile(path.join(DIR, `${client}.jsonl`), 'utf8');
    return raw
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as Lead;
        } catch {
          return null;
        }
      })
      .filter((l): l is Lead => l !== null);
  } catch {
    return [];
  }
}

// ——— interface publique ———
export async function appendLead(client: string, lead: Lead): Promise<void> {
  if (DB_URL) return pgAppend(client, lead);
  return fileAppend(client, lead);
}

export async function readLeads(client: string): Promise<Lead[]> {
  if (DB_URL) return pgRead(client);
  return fileRead(client);
}
