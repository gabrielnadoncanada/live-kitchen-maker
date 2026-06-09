import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '../src/styles.css';

export const metadata: Metadata = {
  title: 'Atelier Cuisine — Concevez votre cuisine de rêve en 3D',
  description:
    'Configurateur de cuisine 3D photoréaliste avec devis instantané. Matériaux, couleurs, agencements — voyez votre cuisine avant de la construire.',
  icons: {
    // remplacé dynamiquement par tenant.js avec la couleur du client
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect x='4' y='14' width='24' height='14' rx='1.5' fill='%23b08d57'/><rect x='4' y='10' width='24' height='3' rx='1' fill='%23e9e2d4'/><rect x='9' y='2' width='14' height='6' rx='1' fill='%232a2724'/></svg>",
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,500;9..144,600&family=Albert+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
