# ARCHITECTURE — Stack technique et organisation du repo

**Statut :** référence d'implémentation, complète `SPEC.md` (qui définit le *quoi* ; ce document définit le *comment*).
**Version :** 1.0 (2026-07-18)

---

## 1. Principes directeurs

1. **Un seul langage.** TypeScript partout (pipeline, moteur, revue, schéma). Le contrat central est un schéma Zod — le dupliquer dans un autre langage recréerait exactement la classe de bugs qu'on veut rendre impossible.
2. **Le moins de frameworks possible.** Le pipeline est un DAG fixe et reproductible, pas un agent autonome : l'orchestration est du code TS ordinaire, testable, auditable. L'island lecteur fait du toggle de classes et du hash routing : aucun framework réactif.
3. **Déterminisme là où c'est critique.** Layout du graphe calculé au build (versionnable), passes du pipeline relançables individuellement, rapports écrits sur disque à chaque étape.
4. **Le provider de modèles est une couche fine et remplaçable.** Interfaces typées (`entrée → sortie Zod`) pour chaque agent ; changer de fournisseur ne touche qu'une implémentation.

---

## 2. Stack retenue

| Zone | Choix |
|---|---|
| Langage / runtime | TypeScript, Node.js LTS |
| Monorepo | pnpm workspaces |
| Contrat de données | Zod (`schema/`) — partagé par pipeline, revue, moteur et build du blog |
| Modèles | **Azure AI Foundry (modèles OpenAI)** via le SDK `openai` (client `AzureOpenAI`) |
| Sorties structurées | Structured outputs `strict: true` + helper `zodResponseFormat` |
| Recherche web | **Grounding with Bing** (Foundry Agent Service), derrière une interface `SearchProvider` |
| Récupération sources | fetch natif + `@mozilla/readability` (extraction), archivage dans `sources-cache/` |
| Vérification sources | Juge sémantique LLM indépendant (verdict `supported`/`partial`/`unsupported`) |
| Frontend | Astro 5, island **vanilla TS**, SVG généré au build, thème par CSS custom properties |
| Revue éditeur | Générateurs HTML statiques autonomes (templates TS) |
| Tests | Vitest |
| Lint / format | Biome |
| CI | GitHub Actions : tests + validation de tous les `graph.json` à chaque PR |

---

## 3. Arborescence du monorepo

```
criticalthinker/
├── SPEC.md
├── ARCHITECTURE.md
├── package.json                  # workspace racine
├── pnpm-workspace.yaml
├── biome.json
├── .github/workflows/ci.yml     # tests + validation des graphes
│
├── schema/                       # ★ LE contrat — aucune dépendance vers les autres packages
│   ├── src/
│   │   ├── graph-article.ts      # schéma Zod complet (article, nodes, sources)
│   │   ├── fragments.ts          # sous-schémas réutilisés par les agents (squelette, nœud, source…)
│   │   ├── validate.ts           # règles mécaniques §7 de la SPEC (intégrité graphe, sourçage…)
│   │   ├── graph-utils.ts        # atteignabilité, degrés, parcours — partagés
│   │   ├── layout.ts             # layout déterministe (secteurs par pilier) — partagé mini-map/revue
│   │   └── diff.ts               # diff structurel entre deux graph.json
│   └── package.json
│
├── pipeline/
│   ├── src/
│   │   ├── cli.ts                # point d'entrée `ct`
│   │   ├── config.ts             # mapping rôle → déploiement Azure + paramètres
│   │   ├── llm/
│   │   │   ├── client.ts         # client AzureOpenAI (Entra ID ou clé API)
│   │   │   └── structured.ts     # appel générique : prompt + sous-schéma Zod → objet validé
│   │   ├── search/
│   │   │   ├── provider.ts       # interface SearchProvider
│   │   │   └── bing-grounding.ts # implémentation Foundry Agent Service
│   │   ├── retrieve/
│   │   │   ├── fetch.ts          # récupération de page
│   │   │   └── extract.ts        # readability → texte propre → sources-cache/
│   │   ├── agents/
│   │   │   ├── architect.ts      # sujet → squelette (aucune prose)
│   │   │   ├── writer.ts         # squelette approuvé → nœuds rédigés (portée : 1 nœud)
│   │   │   ├── sourcer.ts        # affirmations → sources archivées + passages de soutien
│   │   │   ├── judge.ts          # (affirmation, texte archivé) → verdict sémantique
│   │   │   └── critic.ts         # lentilles de réfutation (exactitude, chevauchement, faux équilibre…)
│   │   ├── orchestrate.ts        # enchaînement des passes, boucle critique bornée, reprises
│   │   └── reports.ts            # écriture des rapports vN/reports/
│   └── package.json
│
├── review/
│   ├── src/
│   │   ├── skeleton-view.ts      # page G1 : graphe SVG + tableau des nœuds (zéro prose)
│   │   ├── review-sheet.ts       # page G2 : feux tricolores, objections, tri par priorité d'audit
│   │   └── diff-view.ts          # rendu du diff structurel v(N)/v(N+1)
│   └── package.json
│
├── engine/
│   ├── src/
│   │   ├── GraphArticle.astro    # composant : rendu statique complet + mini-map SVG au build
│   │   ├── island.ts             # orchestration client : hash routing, localStorage, métriques, anti-vortex
│   │   └── styles.css            # thème par variables CSS (--accent, --text-link…)
│   ├── demo/                     # blog Astro minimal pour développer et tester
│   └── package.json
│
└── articles/                     # données pures, pas un package
    └── <slug>/
        ├── seed.md
        └── vN/ { graph.json, sources-cache/, reports/ }
```

**Règle de dépendance :** `schema/` ne dépend de rien ; `pipeline/`, `review/` et `engine/` dépendent de `schema/` et jamais les uns des autres.

---

## 4. Couche modèles (Azure AI Foundry)

### 4.1 Client et authentification

- SDK `openai`, classe `AzureOpenAI` (endpoint + `api-version` en config).
- Auth : **Entra ID via `DefaultAzureCredential`** de préférence (aucun secret dans le repo) ; clé API en repli. Variables : `AZURE_OPENAI_ENDPOINT`, et selon le mode `AZURE_OPENAI_API_KEY`.

### 4.2 Sorties structurées

Toutes les passes LLM passent par un unique helper `structured.ts` :

```
appel(prompt système, prompt utilisateur, sousSchémaZod) → objet validé
```

- Structured outputs `strict: true` (`zodResponseFormat`) : la conformité au JSON Schema est garantie côté API.
- Les sous-schémas des agents (`fragments.ts`) sont des **projections du schéma final** — le squelette de l'architecte, le nœud du rédacteur, le verdict du juge sont des morceaux du `graph.json`, jamais des formats ad hoc à re-mapper.
- Retry avec backoff sur erreurs transitoires ; échec de validation résiduel → erreur explicite dans le rapport de passe.

### 4.3 Modèles par rôle

Mapping en config (`pipeline/src/config.ts`), pas dans le code. Valeurs de départ suggérées — à ajuster aux noms de déploiements réels du Foundry :

| Rôle | Profil requis | Suggestion de départ |
|---|---|---|
| Architecte | Raisonnement fort (structure du graphe) | déploiement GPT-5.x, effort de raisonnement élevé |
| Rédacteur | Qualité rédactionnelle, volume | GPT-5.x standard ou mini |
| Sourceur | Rigueur d'extraction | GPT-5.x standard |
| Juge sémantique | Raisonnement fort, cadré réfutation | GPT-5.x, effort élevé — **déploiement ≠ rédacteur si possible** |
| Critique | Raisonnement fort | GPT-5.x, effort élevé |

---

## 5. Couche recherche et sources

### 5.1 Recherche : `SearchProvider`

Interface minimale : `search(query) → [{url, title, snippet}]`.

- Implémentation par défaut : **Grounding with Bing** via le Foundry Agent Service (100 % Azure, couvert par le sponsorship).
- L'interface permet de brancher un autre fournisseur (Tavily, Brave…) sans toucher au pipeline.

### 5.2 Récupération et archivage

Pour chaque candidat retenu : fetch de la page → extraction du contenu principal (`@mozilla/readability`) → texte propre archivé dans `articles/<slug>/vN/sources-cache/<SRC_ID>.txt`.

- L'archive est la **matière du juge et de l'audit G2** : reproductible hors-ligne, insensible aux pages qui changent ou disparaissent.
- On archive le texte extrait (pas le HTML complet) pour garder le repo léger.
- Pages non récupérables (paywall dur, JS requis) : la source est écartée, le sourceur cherche un remplaçant — jamais de source non archivée.

### 5.3 Flux complet du sourçage

```
affirmation (résumé niveau 4)
  → SearchProvider.search()
  → fetch + extraction des 3–5 meilleurs candidats → sources-cache/
  → sourceur : choisit la source, extrait le passage de soutien (langue de la source)
  → juge sémantique (passe indépendante) : affirmation + texte archivé
      → supported  : source acceptée
      → partial    : flag d'arbitrage G2 (bloque la publication tant que non arbitré)
      → unsupported: source rejetée → retour au sourceur (borné), sinon
                     réécriture de l'affirmation en interprétatif explicite
```

Le validateur mécanique ne juge jamais le sens : il vérifie la présence de l'archive, du passage, et d'un verdict `supported` (règles 11 et 12b de la SPEC). **L'esprit prime sur la lettre** : aucune exigence de présence littérale du passage dans l'archive (sources multilingues, reformatage d'extraction).

---

## 6. CLI du pipeline

Une commande par passe — le pipeline est relançable à n'importe quelle étape, la régénération est à portée de nœud.

| Commande | Effet |
|---|---|
| `ct new <slug>` | Crée `articles/<slug>/` + `seed.md` (l'éditeur y écrit le sujet) |
| `ct skeleton <slug>` | Architecte → squelette + page G1 (`review/`) |
| `ct write <slug> [--nodes id1,id2]` | Rédacteur (tout le graphe, ou nœuds ciblés) |
| `ct source <slug> [--nodes …]` | Sourceur + archivage |
| `ct judge <slug> [--sources …]` | Juge sémantique |
| `ct critique <slug>` | Critique + boucle rédacteur↔critique bornée (3 itérations max) |
| `ct validate <slug>` | Validateur mécanique (mêmes règles que le build du blog) |
| `ct review <slug>` | Génère la fiche G2 |
| `ct diff <slug> v1 v2` | Diff structurel entre versions |
| `ct run <slug>` | Enchaîne tout (skeleton → … → review), en s'arrêtant aux portes humaines |

Exécution : en local (`ANTHROPIC`-free — uniquement les variables Azure), ou pilotée depuis une session Claude Code.

---

## 7. Moteur de lecture (`engine/`)

- **`GraphArticle.astro`** : reçoit une entrée de content collection (validée par le Zod de `schema/` au build du blog). Rend en HTML statique : hub, tous les nœuds (masqués), badges sources dépliables, mini-map SVG (positions calculées au build via `schema/layout.ts`), nœud de synthèse verrouillé.
- **`island.ts`** (vanilla TS, unique JS livré au lecteur) : hash routing `#node-id`, machine à états de la SPEC §8.3, persistance `localStorage` par `article.id`, métriques (couverture / diversité / contradiction), déblocage de la synthèse, règle anti-vortex, mini-map (toggle de classes sur le SVG existant — l'island ne dessine rien).
- **Dégradation sans JS** : lecture linéaire complète (hub puis nœuds par pilier) — c'est le rendu statique de base, l'island ne fait que le réorganiser.
- **Intégration blog** : copie (ou dépendance workspace publiée) du composant + du schéma dans le blog Astro cible ; publier un article = déposer le `graph.json` approuvé dans la collection + une page `.astro` de trois lignes.
- **`engine/demo/`** : blog minimal pour développer le moteur et prévisualiser les articles avant publication.

---

## 8. Outillage de revue (`review/`)

Pages HTML **autonomes** (un fichier, ouvrable localement, aucune infrastructure) générées par templates TS. Les trois vues réutilisent `schema/layout.ts` : l'éditeur regarde le même graphe que les lecteurs, annoté.

- **G1 (`skeleton-view`)** : SVG du graphe + tableau mots-clés/questions/axes/cibles. Zéro prose.
- **G2 (`review-sheet`)** : feux tricolores par nœud (sourcé ✓ / flag ⚠ / révisé ↻), objections survivantes du critique, verdicts `partial` à arbitrer, nœuds triés par priorité d'audit (confiance faible d'abord).
- **Diff (`diff-view`)** : nœuds ajoutés/supprimés, arêtes modifiées, textes réécrits, sources changées entre v(N) et v(N+1).

---

## 9. Qualité et CI

- **Vitest** : tests unitaires de `schema/` (validation, graph-utils, layout, diff) et de l'orchestration (agents mockés — les prompts se testent à part, sur de vrais appels, hors CI).
- **Biome** : lint + format, une seule config à la racine.
- **CI (GitHub Actions)** : à chaque PR — install, lint, tests, puis `ct validate` sur **tous** les `graph.json` de `articles/`. Un graphe invalide ne peut pas être mergé.
- Les appels LLM ne tournent **jamais** en CI (coût, non-déterminisme) : la CI valide des artefacts, le pipeline les produit.

---

## 10. Variables d'environnement

| Variable | Rôle |
|---|---|
| `AZURE_OPENAI_ENDPOINT` | Endpoint du Foundry |
| `AZURE_OPENAI_API_KEY` | Repli si pas d'Entra ID |
| `AZURE_BING_GROUNDING_*` | Connexion Grounding with Bing (Agent Service) — noms exacts à fixer à l'implémentation |

Aucun secret dans le repo ; `.env` local ignoré par git, secrets GitHub Actions inutiles tant que la CI ne fait pas d'appels LLM (§9).

---

## 11. Ordre d'implémentation

1. **`schema/`** — schéma Zod + validateur + graph-utils + layout (+ tests). Tout le reste s'appuie dessus.
2. **`pipeline/`** — client Azure + structured outputs, puis agents dans l'ordre du flux (architecte → … → critique), CLI au fil de l'eau.
3. **`review/`** — G1 dès que l'architecte produit des squelettes ; G2 quand le pipeline complet tourne.
4. **`engine/`** — composant + island + demo ; mini-map en dernier (la plus visible, la moins structurante).
5. Premier article réel de bout en bout → calibrage (seuils de synthèse, tailles, prompts).
