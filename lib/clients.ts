// Clés d'accès à la boîte à leads, par entreprise cliente.
// En production : variable d'environnement LEAD_CLIENTS = {"cle-client":"secret",...}
// (les valeurs ci-dessous ne servent qu'aux démos locales).

const DEMO_CLIENTS: Record<string, string> = {
  'atelier-demo': 'demo-secret-123',
  'cuisines-prestige': 'prestige-secret-456',
};

export function getClients(): Record<string, string> {
  const env = process.env.LEAD_CLIENTS;
  if (env) {
    try {
      return JSON.parse(env);
    } catch {
      console.error('LEAD_CLIENTS invalide — JSON attendu ; clés de démo utilisées.');
    }
  }
  return DEMO_CLIENTS;
}

export function sanitizeClientKey(raw: unknown): string {
  return String(raw ?? '').replace(/[^a-z0-9-]/gi, '');
}
