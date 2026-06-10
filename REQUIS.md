# Requis métier — règles d'une vraie cuisine

Ce document est le **référentiel des règles de conception** qu'une cuisine générée doit
respecter pour être crédible aux yeux d'un cuisiniste et constructible dans la vraie vie.
Chaque requis a un identifiant, une priorité et un statut tenu à jour face au code
(`src/kitchen.js` = planificateur, `src/pricing.js` = chiffrage).

Statuts : ✅ implémenté · 🟡 partiel · ⬜ à faire

Sources :
- **NKBA — The 31 Rules of Kitchen Design** (seuils repris du validateur de l'ancien projet
  `D:\dilamco_render` — 21 règles y étaient codées avec tests ; PDF de référence dans ce repo)
- **Catalogue Dilamco** (514 variations réelles, extrait dans `public/catalogs/dilamco.json`)
- Pratique métier québécoise

---

## 1. Colonnes et électroménagers

| ID | Requis | Prio | Statut |
|----|--------|------|--------|
| REQ-101 | **Panneau de finition latéral au réfrigérateur** : un frigo n'est jamais flanqué directement d'un caisson — un panneau pleine hauteur (gable) de chaque côté cache son flanc et le sépare des armoires. Facturé au devis. Produit réel : *Refrigerator Return Panel* ¾ po × 27 prof × 96/103½ haut, 100–145 $ (notre prix 165 $ ✓, notre prof. 27,5 po ✓). | Haute | ✅ |
| REQ-102 | Le frigo et le garde-manger se placent en **bout de ruban**, jamais au milieu d'un plan de travail qu'ils couperaient. | Haute | ✅ |
| REQ-103 | Les colonnes pleine hauteur (frigo, garde-manger) **ne recouvrent jamais une fenêtre** ; elles changent de segment ou de mur. | Haute | ✅ |
| REQ-104 | Le **lave-vaisselle est adjacent à l'évier** (raccordement plomberie + ergonomie). | Haute | ✅ |
| REQ-105 | La **hotte est centrée au-dessus de la cuisinière** et plus large qu'elle (90 cm vs 77 cm). | Haute | ✅ |
| REQ-106 | Dégagement hotte–plaque ≈ 60 cm (min. 24 po pour une cuisinière électrique). | Moyenne | ✅ |
| REQ-107 | La **cuisinière ne doit pas être directement adjacente au frigo** (chaleur) ni à une colonne sans surface de dépôt entre les deux. | Moyenne | ✅ marge de comptoir de 31 cm imposée par le solveur entre cuisinière et colonnes |
| REQ-108 | **Cuisinière sous fenêtre** (NKBA 20) : interdite sous une fenêtre ouvrante (sauf > 24 po au-dessus) ; à ≥ 30 cm d'une porte. | Moyenne | ✅ la cuisinière auto fuit les fenêtres ; position 240 V imposée → avertissement NKBA 20 |
| REQ-110 | **Armoire au-dessus du réfrigérateur** : la niche du frigo se ferme par une armoire dédiée entre les panneaux latéraux (murales hauteurs 12–24 po en profondeur 18/20/27 au catalogue interne). | Haute | ✅ armoire 2 portes entre les panneaux, SKU réel |
| REQ-109 | Micro-ondes : emplacement dédié — produits réels au catalogue : armoire micro-ondes de bas (27 po, 372 $) et murale (24–27 po, 218–294 $). | Basse | ⬜ |

## 2. Implantation et circulation

| ID | Requis | Prio | Statut |
|----|--------|------|--------|
| REQ-201 | **Triangle de travail** (NKBA 26) : chaque côté entre 4 et 9 pi (1,22–2,74 m), somme ≤ 26 pi (7,92 m). Afficher un avertissement doux si violé. | Moyenne | ✅ validateur doux — badge « recommandations d'ergonomie » |
| REQ-202 | **Allées** (NKBA 3) : allée de travail ≥ 42 po (1,07 m) pour 1 cuisinier, 48 po pour 2 ; passage ≥ 36 po. | Haute | ✅ allée îlot fixée à 1,06 m |
| REQ-208 | **Lave-vaisselle** (NKBA 16) : à ≤ 36 po (91 cm) de l'évier, avec 21 po de dégagement debout de chaque côté (pas de colonne collée). | Haute | ✅ adjacence par le solveur + avertissement NKBA 16 sur le dégagement debout |
| REQ-209 | **Séparation des centres de travail** (NKBA 12) : jamais de frigo, colonne ou four mural **entre** l'évier et la cuisinière. | Haute | ✅ zone interdite aux colonnes entre évier et cuisinière (solveur) + filet NKBA 12 |
| REQ-210 | **Ventilation** (NKBA 24) : une hotte au-dessus de chaque cuisinière. | Haute | ✅ |
| REQ-211 | **Dégagement vertical cuisinière** (NKBA 25) : ≥ 24 po sous surface protégée (hotte), ≥ 30 po sinon. | Haute | ✅ 60 cm sous la hotte |
| REQ-203 | Les **portes sont des zones interdites** : aucun caisson, comptoir ou dosseret devant une porte (+ marge de 7 cm de chaque côté). | Haute | ✅ |
| REQ-204 | L'**évier se place sur l'entrée d'eau** existante ; sinon sous la fenêtre ; sinon au centre du plus grand segment. | Haute | ✅ |
| REQ-205 | La **cuisinière suit la prise 240 V** quand elle est précisée. | Haute | ✅ |
| REQ-206 | Aucun appareil (évier, cuisinière, lave-vaisselle) **collé dans un coin** : l'emprise du caisson de coin (92 cm) est réservée. | Haute | ✅ via les segments |
| REQ-207 | Quand un mur déborde (évier imposé sur un petit mur), les éléments **déménagent par priorité** (garde-manger → lave-vaisselle → frigo) au lieu de disparaître. | Haute | ✅ |

## 3. Surfaces de travail (seuils NKBA)

| ID | Requis | Prio | Statut |
|----|--------|------|--------|
| REQ-301 | **Dépôt cuisinière** (NKBA 19) : 9 po d'un côté **et** 15 po de l'autre (23/38 cm) ; exception mur d'extrémité : 3 po + écran thermique. | Moyenne | ✅ avertissement NKBA 19 |
| REQ-302 | **Dépôt évier** (NKBA 13) : 24 po d'un côté **et** 18 po de l'autre (61/46 cm), mesurés depuis le caisson d'évier ; le lave-vaisselle compte comme comptoir traversant. | Moyenne | ✅ avertissement NKBA 13 |
| REQ-307 | **Centre de préparation** (NKBA 17) : ≥ 36 po (91 cm) de comptoir continu adjacent à l'évier. | Moyenne | ✅ avertissement NKBA 17 |
| REQ-308 | **Dépôt frigo** (NKBA 18) : ≥ 15 po (38 cm) côté poignée, ou comptoir en face à ≤ 48 po. | Moyenne | ✅ avertissement NKBA 18 (l'îlot compte comme dépôt en face) |
| REQ-309 | **Évier près d'un coin** (NKBA 14) : ≥ 3 po du coin intérieur, ≥ 18 po d'un cul-de-sac. | Moyenne | ✅ via l'emprise du caisson de coin (92 cm > 3 po) |
| REQ-303 | Hauteur de comptoir standard **90 cm** (36 po), épaisseur 4 cm, débord avant ~5 cm. | Haute | ✅ |
| REQ-304 | Le comptoir est **troué à l'évier** (cuve encastrée) et **s'interrompt à la cuisinière** (appareil à son propre dessus). | Haute | ✅ |
| REQ-305 | **Dosseret continu** entre comptoir et armoires murales (55 cm), y compris derrière la cuisinière, interrompu aux portes et fenêtres. | Haute | ✅ |
| REQ-306 | Îlot : **porte-à-faux d'assise ~30 cm** côté tabourets, chants finis (cascade en option). | Moyenne | ✅ |

## 4. Caissons et finition

| ID | Requis | Prio | Statut |
|----|--------|------|--------|
| REQ-401 | **Caisson de coin** dédié (92 cm d'emprise) avec retour plein — jamais deux caissons en collision dans l'angle. | Haute | ✅ |
| REQ-402 | Largeurs de modules réalistes : remplissage par caissons de ~60 cm ; un reste < 32 cm devient un **fileur** (panneau), pas un mini-caisson. | Haute | ✅ |
| REQ-403 | **Socle en retrait** (toe-kick) de 10 cm sous tous les caissons bas et colonnes. | Haute | ✅ |
| REQ-404 | Bouts de ruban exposés : flanc fini dans le matériau des façades (gable de finition). | Moyenne | ✅ via REQ-711 (fausses portes facturées) |
| REQ-405 | Armoires murales : **bande lumineuse sous-armoire**, profondeur 35 cm, alignement haut à 2,25 m avec les colonnes. | Moyenne | ✅ |
| REQ-406 | Les armoires murales **évitent fenêtres, hotte et colonnes** ; aucun module < 34 cm. | Haute | ✅ |
| REQ-407 | Poignées cohérentes : barre verticale sur portes, horizontale sur tiroirs, comptées au devis (même « intégrées »). | Moyenne | ✅ |

## 5. Fenêtres, portes et enveloppe

| ID | Requis | Prio | Statut |
|----|--------|------|--------|
| REQ-501 | Allège de fenêtre alignée à la bande des armoires murales (au-dessus du dosseret) ; les caissons bas passent dessous. | Haute | ✅ |
| REQ-502 | Porte intérieure : cadre + battant + **arc de débattement visible en vue plan**. | Moyenne | ✅ |
| REQ-503 | Hauteur de pièce 2,72 m ; cheminée de hotte jusqu'au plafond. | Basse | ✅ |
| REQ-504 | Fenêtres multiples par mur (max 3) et portes (max 2), positions libres contraintes aux murs. | Haute | ✅ |

## 6. Chiffrage

| ID | Requis | Prio | Statut |
|----|--------|------|--------|
| REQ-601 | Les **électroménagers ne sont pas facturés** par défaut (planification seulement) ; mention au devis et au PDF. Option `sellAppliances` par tenant. | Haute | ✅ |
| REQ-602 | Le devis reflète **exactement ce qui est généré** (manifeste de construction), jamais une estimation forfaitaire. | Haute | ✅ |
| REQ-603 | Multiplicateur de finition appliqué aux caissons, pas aux panneaux d'appareils. | Moyenne | ✅ |
| REQ-604 | Taxes, installation, livraison et financement **paramétrés par tenant**. | Haute | ✅ |

---

## 7. Contraintes du catalogue Dilamco (produits réels)

Le générateur doit converger vers ce qui se **fabrique réellement**. Sources :
- **`catalog.xlsx`** (racine du projet) — catalogue opérationnel interne : **290 produits avec
  prix réels**, 44 catégories, dimensions précises. Source primaire.
- `public/catalogs/dilamco.json` — extrait du catalogue WooCommerce public (514 variations,
  sans prix).

**Le système produit Dilamco (catalog.xlsx) :**

| Famille | Largeurs (po) | Hauteurs (po) | Prof. (po) | Prix réels |
|---------|---------------|----------------|------------|------------|
| Bas standard (1 porte/1 tiroir) | 9 → 42 par pas de 3 | 34 ½ | 24 | 148–342 $ |
| Bas à tiroirs (×3) | 12 → 36 | 34 ½ | 24 | 318–549 $ |
| Bas coin mort | 33–48 | 34 ½ | 24 | 361–501 $ |
| Évier farmhouse | 33, 36 | 34 ½ | 24 | 261–318 $ |
| Range-épices coulissant | **6, 9, 12** | 34 ½ | 24 | 166–224 $ |
| Tiroir à déchets coulissant | 18 | 34 ½ | 24 | 318–359 $ |
| Micro-ondes (bas 27 / mural 24–27) | — | — | — | 218–372 $ |
| Murale standard | 9 → 42 ½ | 12 → 67 ½ (riche) | 12 (aussi 18/20/27) | 35–532 $ |
| Coin aveugle mural (+ tall) | 15–36 | 30/36/48 | 12 | 53–416 $ |
| Coin mural 45° | 24 | 30/36/48 | 12 | 69–404 $ |
| Garde-manger | 12 → 30 | 84 → 103 ½ | **27** | 407–979 $ |
| Armoire four mural | 30, 33 | 103 ½ | 27 | 134–1016 $ |

**Pièces de finition (toutes facturables, toutes au catalogue) :** panneau de retour
réfrigérateur (¾ po × 27 prof × 96/103½ — 100–145 $), panneau de retour lave-vaisselle
(3 × 34½ × 24 — 50 $), **fausses portes** (bouts de bas, murales, garde-manger — 45–200 $),
panneaux d'îlot (arrière 96×18/36 — 67–134 $ ; habillage — 36–53 $), panneau d'extrémité
mural, **fillers 1½ / 3 / 6 po** en hauteurs 30 → 126, moulures (base, scribe, coin
extérieur), **toe-kick vendu en longueurs de 96 po**. Quincaillerie : charnières (3 $),
poubelle (11 $). Finis en production : Blanc Pur, Chêne blanc (**+13 %**).
Fillers pleine hauteur en 96/120/126 po → la **hauteur de plafond (8/10/10½ pi) est un
paramètre produit**.

| ID | Requis | Prio | Statut |
|----|--------|------|--------|
| REQ-701 | **Largeurs modulaires** : les caissons générés se posent en largeurs catalogue (pas de 3 po) + fillers 1½/3/6 po pour le reste — au lieu de largeurs continues arbitraires. | Haute | ✅ caissons au pas de 3 po (9–36) + fillers catalogue facturés |
| REQ-702 | Dimensions normalisées : bas 34½ po + comptoir ≈ 36 po ✅ ; murales prof. 12 po (nous : 13,8 po → ajuster) ; **garde-manger prof. 27 po** (nous : 23,6) ; hauteurs murales choisies dans la gamme selon le plafond. | Moyenne | ✅ murales 12 po, garde-manger 27 po |
| REQ-703 | **Moulure shaker 1 po ou 3 po** : notre cadre est fixé à 2,6 po — offrir les deux largeurs réelles. | Basse | ⬜ |
| REQ-704 | Coins : **coin mort** au bas (33–48 po), **coin aveugle** et **45°** au mural — notre coin unique ≈ coin mort 90°. Les armoires murales de coin n'existent pas chez nous. | Moyenne | 🟡 coin aveugle mural 90° ✅ (WBC, les rubans muraux tournent le coin) ; coin 45° à faire |
| REQ-705 | **Devis par SKU** : chaque pièce générée référence un SKU réel (`W0930`, `DRBC12`, `RRP103.5`…) avec son prix catalogue — le devis devient un bon de commande. | Haute | ✅ lignes de devis par SKU réel (DRBC30, W0930, WP249027, RRP, IBP…) × finition |
| REQ-706 | Finitions alignées sur l'offre réelle du tenant via le filtre catalogue. | Moyenne | ✅ mécanique en place — reste à configurer le tenant Dilamco |
| REQ-707 | **Multiplicateur de fini réaliste** : Chêne blanc = +13 % vs Blanc Pur au catalogue réel — nos multiplicateurs bois (×1,45–1,6) sont trop agressifs pour ce fabricant. Paramétrer par tenant. | Moyenne | ✅ `catalog.finishMultipliers` par tenant |
| REQ-708 | **Hauteur de plafond paramétrable** (8 / 10 / 10½ pi) pilotant hauteurs de murales, garde-manger et fillers pleine hauteur. | Moyenne | ✅ sélecteur 8/9/10 pi (murs, cheminée de hotte, suspensions) |
| REQ-709 | **Panneaux d'îlot facturés** : le panneau arrière et l'habillage d'îlot sont des produits (66–134 $) — nous les dessinons sans les facturer. | Haute | ✅ panneau arrière + 2 habillages facturés |
| REQ-710 | **Panneau de retour lave-vaisselle** (3 po) quand le LV termine un ruban — produit réel DWR. | Moyenne | ✅ détection bout de segment + panneau DWR facturé |
| REQ-711 | **Fausses portes** sur les flancs visibles (bouts de bas, murales, garde-manger) — raffinement de REQ-404 avec le produit réel (dummy doors). | Moyenne | ✅ fausses portes (BDD) posées et facturées sur les flancs exposés des bas |
| REQ-712 | **Tiroir à déchets coulissant** près de l'évier — couvre NKBA 15 (waste receptacles) avec un produit réel au catalogue (18 po). | Basse | ⬜ |
| REQ-713 | **Range-épices coulissant 6/9/12 po** : utiliser les petits restes de ruban comme produit utile plutôt que comme filler perdu. | Basse | ⬜ |
| REQ-714 | **Toe-kick et moulures facturés au linéaire** (longueurs de 96 po) plutôt qu'inclus silencieusement. | Basse | ✅ facturée en longueurs de 96 po (TK8) selon le linéaire réel |

---

## 8. Intégrité géométrique (anti-collision)

Hérité des règles G1–G8 du validateur de `D:\dilamco_render`. Philosophie : **prévenir à la
source** (le planificateur et les contrôles ne peuvent pas produire d'état invalide) plutôt
que détecter après coup ; la détection AABB généralisée reste le filet de sécurité final.

| ID | Requis | Prio | Statut |
|----|--------|------|--------|
| REQ-801 | **Comptoirs et dosserets découpés aux colonnes** : ils s'interrompent au frigo et au garde-manger (et à la cuisinière ✅, aux portes ✅) — jamais de comptoir qui traverse un caisson, et leur emprise ne se facture pas en pi². | Haute | ✅ |
| REQ-802 | **Ouvertures sans chevauchement** : deux fenêtres/portes ne peuvent jamais se superposer sur un même mur (jeu min. 6 cm). Toutes les voies de modification passent par le résolveur (`src/openings.js`) : drag plan/élévation, curseurs position/largeur, changement de mur, menus d'ajout — l'élément s'arrête au bord de son voisin, l'ajout est refusé si le mur est plein. | Haute | ✅ |
| REQ-803 | **Collision AABB généralisée** (G3 de l'ancien validateur) : vérification paire-à-paire de tous les éléments générés en coordonnées monde, comme filet de sécurité avec rapport de violations en console dev. | Moyenne | ✅ filet par intervalles le long des murs, rapport console en dev |
| REQ-804 | **Débattement de porte libre** (G6/NKBA 2) : le balayage à 90° d'une porte ne heurte ni caisson, ni îlot, ni électroménager. | Moyenne | ✅ avertissement NKBA 2 (îlot et caissons des autres murs) |
| REQ-805 | Aucun élément hors des limites de la pièce ou de son mur (G2/G5) : garanti par construction (clamps des segments et des ouvertures). | Haute | ✅ |
| REQ-806 | Les ouvertures ne chevauchent pas les caissons pleine hauteur (G4) : portes = segments interdits ✅, fenêtres = interdites aux colonnes ✅, armoires murales évitent les fenêtres ✅. | Haute | ✅ |

---

## Processus

1. Tout nouveau requis s'ajoute ici avec un ID, une priorité et le statut ⬜.
2. À l'implémentation : passer à ✅ avec, si utile, une note sur la mécanique retenue.
3. Un requis qui révèle un bug (ex. : REQ-103 découvert en vue élévation) se note ici
   même s'il est corrigé immédiatement — le référentiel sert aussi de mémoire de QA.

Prochaines cibles suggérées (par valeur/effort) :
1. **REQ-701 + REQ-705** — largeurs modulaires (pas de 3 po) puis devis par SKU avec les
   prix réels de `catalog.xlsx` : le devis devient un bon de commande Dilamco.
2. **REQ-110** — armoire au-dessus du frigo (vide visible actuellement).
3. **REQ-709/710/711** — pièces de finition facturées (panneaux d'îlot, retour LV, fausses
   portes) : revenus réels présents au catalogue, absents de nos devis.
4. **REQ-301/302/307** — surfaces de dépôt NKBA garanties autour de la cuisinière et de
   l'évier.
5. **REQ-201** — validation douce du triangle de travail avec avertissement dans l'UI.
