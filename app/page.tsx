'use client';

import dynamic from 'next/dynamic';

// Le configurateur est un canvas WebGL plein écran qui touche au DOM dès son
// chargement : il vit exclusivement côté client (pas de SSR).
const Configurator = dynamic(() => import('../components/Configurator'), {
  ssr: false,
  loading: () => <div className="boot-veil" aria-label="Chargement du configurateur" />,
});

export default function Page() {
  return <Configurator />;
}
