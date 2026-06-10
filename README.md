# Atelier Cuisine — Constructeur de cuisine 3D avec devis en direct

Configurateur de cuisine 3D photoréaliste pensé pour le grand public : aucune connaissance
requise, une cuisine complète se génère automatiquement à partir de quelques choix simples,
et le devis (CAD, taxes québécoises incluses) se met à jour à chaque clic.

## Démarrage

Application **Next.js 15** (App Router) prête pour Vercel. Le moteur 3D reste en modules
ES vanilla (`src/`) montés dans une route client-only — la migration React/TypeScript se
fait progressivement, sans réécriture du moteur.

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # build de production Next (arrêter `dev` d'abord : ils partagent .next/)
npm run start      # serveur de production
```

URLs : `/` (configurateur), `/?client=cle` (marque blanche), `/admin.html` (boîte à leads),
`/embed.js` (intégration iframe). API : `POST /api/lead`, `GET /api/leads?client=&cle=`.

## Fonctionnalités

- **Génération paramétrique complète** : agencement linéaire, en L ou en U + îlot central,
  dimensions au curseur. Évier sous fenêtre, lave-vaisselle adjacent, cuisinière avec hotte,
  réfrigérateur + garde-manger en bout de ruban, caissons de coin, armoires murales — tout se
  replanifie automatiquement.
- **Contraintes réelles de la pièce** (section « Votre pièce ») : entrée d'eau (l'évier se place
  sur la plomberie existante, sur n'importe quel mur), prise 240 V (la cuisinière et sa hotte
  suivent), fenêtres et portes positionnables librement sur chaque mur. Les portes créent des
  zones interdites qui segmentent caissons, comptoirs et dosserets ; les fenêtres bloquent les
  armoires murales. Un solveur à deux niveaux reloge les éléments (frigo, garde-manger,
  lave-vaisselle…) vers un autre segment ou un autre mur quand la place manque, par ordre de
  priorité, au lieu de les faire disparaître.
- **Rendu physique réaliste** : Three.js avec tone mapping ACES, éclairage d'image (IBL),
  ombres douces, matériaux PBR. Toutes les textures (noyer, chêne, marbre, quartz, granit,
  zellige, métro, inox brossé, béton, planchers à lames) sont générées procéduralement sur
  canvas — aucune ressource externe.
- **Personnalisation totale** : 10 finitions d'armoires, façade plane ou shaker, finition
  d'îlot indépendante, 4 quincailleries, 6 comptoirs, 5 dosserets, 4 planchers, 5 couleurs de
  murs, électroménagers inox ou acier noir — plus 6 styles préconçus appliqués en un clic.
- **Édition par clic** : cliquer un caisson dans la 3D ouvre un popover pour le convertir
  (portes / tiroirs / niche ouverte).
- **Vue Plan interactive** (manipulation directe, sans dessin libre) : en vue Plan, glissez
  les fenêtres, portes, l'entrée d'eau et la prise 240 V le long des murs (changement de mur
  automatique au plus proche), étirez les murs par leurs poignées ⟷, cliquez un mur vide pour
  ajouter « Fenêtre / Porte / Entrée d'eau / Prise » à cet endroit, cliquez un élément pour le
  retirer ou le remettre en automatique. La cuisine se replanifie en direct pendant le drag
  (reconstruction throttlée ~7 fps) et les cotes s'affichent sur chaque mur. Le drag est
  contraint : aucun état invalide possible.
- **Vue Élévation (mur de face)** : depuis le menu d'un mur, « 👁 Voir ce mur de face » place la
  caméra perpendiculaire au mur, cadrée sur sa longueur. Les fenêtres, portes, entrée d'eau et
  prise y apparaissent en surlignages glissables à leur hauteur réelle ; un clic sur une zone
  vide du mur ajoute un élément à cet endroit précis. L'îlot (tabourets, suspensions) est
  automatiquement masqué pour ne pas boucher la vue, et réapparaît en sortant.
  Bouton « ↩ Vue du dessus » pour revenir.
  Les colonnes pleine hauteur (frigo, garde-manger) traitent les fenêtres comme zones
  interdites et déménagent de segment ou de mur plutôt que de les recouvrir.
- **Devis en direct** : itemisé (caissons × finition, quincaillerie au compte réel, surfaces
  en pi², électros, installation 15 %, livraison, TPS/TVQ), total animé, mensualité estimée,
  impression via `Ctrl+P` ou le bouton dédié.
- **Navigation simple** : vues prédéfinies (3D / Plan / Détail), orbite à la souris, murs en
  « maison de poupée » qui s'effacent quand la caméra passe derrière.

## Offre SaaS en marque blanche

Le configurateur se vend aux cuisinistes comme **machine à leads qualifiés** : le visiteur
configure sa cuisine, et pour télécharger son devis PDF il laisse ses coordonnées — le
cuisiniste reçoit un prospect avec configuration complète, budget et horizon de projet.

### Multi-tenant
Chaque entreprise cliente = un fichier `public/tenants/{cle}.json` (c'est le « back-office »
des premiers clients) : nom, couleurs d'accent, contact, multiplicateur de prix global,
surcharges de prix par article, finitions désactivées, taux d'installation, livraison, taxes,
financement, capture de leads on/off. Chargé par `?client=cle`.

**Électroménagers** : par défaut ils servent uniquement à la planification 3D (l'évier, la
cuisinière et la hotte structurent l'aménagement) et **ne sont pas facturés** — la section
l'indique au client et le PDF porte la mention. Un tenant qui en vend met
`"business": { "sellAppliances": true }` pour réactiver leur facturation.

**Theming** (`"theming"`) : `"neutral"` (défaut) = chrome gris neutre, l'accent du client est
réservé aux actions (boutons, états actifs, sélections, total, marqueurs du plan, PDF) —
résultat sûr pour n'importe quelle couleur de marque, et les nuanciers/rendus 3D ne sont pas
faussés par un fond teinté. `"tinted"` = tout le thème (surfaces sombres, papier, encres) est
dérivé algorithmiquement de la teinte de l'accent — opt-in pour les marques où ça flatte.
Démo : `atelier-demo` (tinted, brun chaud) et `cuisines-prestige` (neutral, accent vert).

### Capture de leads + devis PDF
Le bouton « Télécharger mon devis (PDF) » ouvre un formulaire (nom, courriel, téléphone,
code postal, horizon), envoie le lead à `api/lead.php` (repli silencieux en localStorage si
l'API est injoignable — le visiteur n'est jamais bloqué), puis génère un **PDF brandé aux
couleurs du tenant** (jsPDF) : en-tête, lignes détaillées, taxes, total, mensualité, mentions.

### API leads (Route Handlers Next, TypeScript)
- `POST /api/lead` — réception, validation, stockage durable. Clés clients :
  env `LEAD_CLIENTS` (JSON) ou démo locale (`lib/clients.ts`). Chaque lead inclut
  `lien`, l'URL de réouverture du projet 3D du visiteur. TODO : notification
  courriel (Resend).
- `GET /api/leads?client=&cle=` — lecture protégée par clé secrète (comparaison à temps
  constant).
- `/admin.html` — boîte à leads : stats (volume, budget moyen, projets chauds), tableau
  avec lien « ▶ Rouvrir » le projet 3D, export CSV.

**Stockage (`lib/leadStore.ts`)** — deux drivers derrière la même interface :
1. **Postgres (Neon)** dès que `DATABASE_URL` (ou `POSTGRES_URL`) est défini — durable,
   production. La table `leads` se crée toute seule au premier lead.
2. **Fichier JSON Lines** (`data/leads/`, gitignoré) sinon — dev local et
   auto-hébergement Node. ⚠ Sur Vercel sans base, `/tmp` est éphémère : les leads
   ne survivent pas aux redéploiements.

**Mise en service Neon sur Vercel (2 minutes)** : tableau de bord Vercel → projet →
*Storage* → *Create Database* → **Neon** (plan gratuit). L'intégration pose
`DATABASE_URL` automatiquement sur le projet. Redéployer — c'est tout.

### Intégration sur le site du client
```html
<script src="https://votre-domaine.ca/embed.js"
        data-client="cuisines-prestige" data-height="760px"></script>
```

### Déploiement
Déploiement standard Next.js (Vercel recommandé : `vercel deploy`, ou tout hôte Node avec
`npm run build && npm run start`). Variables d'environnement : `LEAD_CLIENTS`
(`{"cle-client":"secret",...}`). Créer un `public/tenants/{cle}.json` par client.
Les en-têtes `frame-ancestors *` (embed iframe) sont configurés dans `next.config.mjs`.

## Requis métier

Les règles de conception d'une vraie cuisine (panneaux de finition du frigo, zones
interdites, surfaces de dépôt, triangle de travail…) sont cataloguées dans
**[REQUIS.md](REQUIS.md)** avec identifiant, priorité et statut face au code. C'est à la fois
le backlog de réalisme et la mémoire de QA du planificateur.

## Architecture

```
app/                 # Next.js App Router
├── layout.tsx       # shell HTML, polices, CSS global
├── page.tsx         # route du configurateur (client-only, ssr: false)
└── api/lead(.s)/    # Route Handlers TypeScript (réception + lecture des leads)
components/
└── Configurator.tsx # balisage du configurateur + montage du moteur (useEffect)
lib/                 # clients.ts (clés), leadStore.ts (stockage, interface Phase 2)
src/                 # ← le moteur, en modules ES vanilla (voir tableau ci-dessous)
public/              # tenants/, catalogs/, admin.html, embed.js
```

### Le moteur (`src/`)

| Fichier       | Rôle |
|---------------|------|
| `textures.js` | Fabriques de textures procédurales (canvas → CanvasTexture) |
| `catalog.js`  | Catalogue finitions/surfaces : matériaux PBR mis en cache + prix |
| `kitchen.js`  | Générateur paramétrique + solveur de contraintes : segments libres par mur (portes retranchées), positions imposées (eau, 240 V), rééquilibrage inter-murs et inter-segments, comptoirs troués (évier), électros, îlot, déco — retourne aussi le manifeste de chiffrage |
| `pricing.js`  | Manifeste + état → lignes de devis (CAD, fr-CA) |
| `planEditor.js` | Vues Plan et Élévation interactives : drag contraint des marqueurs (raycast → coordonnée « le long du mur »), poignées de dimensions, caméra mur-de-face, menus contextuels d'ajout/retrait |
| `tenant.js`   | Multi-tenant : chargement de la config client, branding (CSS vars + textes), filtrage du catalogue, surcharges et multiplicateur de prix |
| `lead.js`     | Modal de capture de lead, envoi à l'API avec repli localStorage, anti-redemande par session |
| `pdf.js`      | Génération du devis PDF brandé (jsPDF) |
| `state.js`    | État central + pub/sub |
| `ui.js`       | Panneau guidé, nuanciers, presets, devis animé, popover |
| `scene.js`    | Rendu, lumières, OrbitControls, vols de caméra |
| `main.js`     | Orchestration : reconstructions, raycasting, vues |

Les prix (`catalog.js`, `pricing.js`) sont des constantes faciles à brancher sur une vraie
grille tarifaire ou une API.
