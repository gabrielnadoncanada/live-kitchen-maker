// Stockage des leads — JSON Lines par client dans data/leads/ (gitignoré).
//
// ⚠ Vercel : le système de fichiers serverless est éphémère — ce driver fichier
// convient au dev local et à l'auto-hébergement Node. La Phase 2 ajoute un driver
// Postgres (Neon) derrière la même interface ; seules ces deux fonctions changeront.
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

// Sur Vercel, seul /tmp est inscriptible (et éphémère : les leads y survivent le temps
// de la lambda — assez pour s'amuser, pas pour la production). En local : data/leads/.
const DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), 'leads')
  : path.join(process.cwd(), 'data', 'leads');

export interface Lead {
  client: string;
  contact: { nom: string; courriel: string; [k: string]: unknown };
  recu?: string;
  ip?: string;
  [k: string]: unknown;
}

export async function appendLead(client: string, lead: Lead): Promise<void> {
  await fs.mkdir(DIR, { recursive: true });
  await fs.appendFile(path.join(DIR, `${client}.jsonl`), JSON.stringify(lead) + '\n', 'utf8');
}

export async function readLeads(client: string): Promise<Lead[]> {
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
