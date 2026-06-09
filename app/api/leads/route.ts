// Consultation de la boîte à leads (remplace l'ancien api/leads.php).
// GET /api/leads?client=xxx&cle=SECRET — utilisé par admin.html.
import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getClients, sanitizeClientKey } from '@/lib/clients';
import { readLeads } from '@/lib/leadStore';

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export async function GET(req: NextRequest) {
  const client = sanitizeClientKey(req.nextUrl.searchParams.get('client'));
  const cle = req.nextUrl.searchParams.get('cle') ?? '';
  const secret = getClients()[client];
  if (!secret || !safeEqual(secret, cle)) {
    return NextResponse.json({ erreur: 'Accès refusé' }, { status: 403 });
  }
  const leads = await readLeads(client);
  return NextResponse.json({ client, total: leads.length, leads: leads.reverse() });
}
