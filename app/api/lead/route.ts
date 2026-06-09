// Réception d'un lead depuis le configurateur (remplace l'ancien api/lead.php).
import { NextRequest, NextResponse } from 'next/server';
import { getClients, sanitizeClientKey } from '@/lib/clients';
import { appendLead, type Lead } from '@/lib/leadStore';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  let lead: Lead;
  try {
    lead = (await req.json()) as Lead;
  } catch {
    return NextResponse.json({ erreur: 'JSON invalide' }, { status: 400, headers: CORS });
  }

  const client = sanitizeClientKey(lead?.client);
  const courriel = lead?.contact?.courriel;
  if (!client || typeof courriel !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(courriel)) {
    return NextResponse.json({ erreur: 'Lead invalide' }, { status: 400, headers: CORS });
  }
  if (!getClients()[client]) {
    return NextResponse.json({ erreur: 'Client inconnu' }, { status: 404, headers: CORS });
  }

  lead.client = client;
  lead.recu = new Date().toISOString();
  lead.ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '';

  try {
    await appendLead(client, lead);
  } catch (e) {
    console.error('Écriture du lead impossible :', e);
    return NextResponse.json({ erreur: 'Écriture impossible' }, { status: 500, headers: CORS });
  }

  // TODO Phase 2 : notification courriel au cuisiniste (Resend)
  return NextResponse.json({ ok: true }, { headers: CORS });
}
