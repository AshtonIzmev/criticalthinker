# criticalthinker

Usine à **articles-graphes** : des articles non linéaires en forme de graphe orienté, générés/sourcés/critiqués par IA, destinés à développer la pensée critique — parce que le réel n'est jamais noir ou blanc.

- **`SPEC.md`** — le *quoi* : format, pipeline, portes de revue, moteur de lecture.
- **`ARCHITECTURE.md`** — le *comment* : stack, packages, contrats.

## Structure

| Package | Rôle |
|---|---|
| `schema/` | Le contrat : schéma Zod du `graph.json`, validateur mécanique, layout, diff |
| `pipeline/` | Génération : architecte → rédacteur → sourceur → juge → critique (CLI `ct`) |
| `review/` | Pages HTML des portes humaines G1/G2 et diff de versions (CLI `ctr`) |
| `engine/` | Moteur de lecture : composant Astro `<GraphArticle>` + island vanilla TS |
| `articles/` | Un dossier par article : seed, versions, sources archivées, rapports |

## Démarrage

```bash
pnpm install
pnpm test            # tous les packages
pnpm lint
pnpm --filter @criticalthinker/engine demo:dev   # démo du moteur de lecture
```

## Produire un article

```bash
cd pipeline
cp .env.example .env          # endpoint Azure + déploiements (voir ARCHITECTURE §10)

pnpm ct new mon-sujet         # crée articles/mon-sujet/seed.md — rédige le sujet
pnpm ct run mon-sujet         # architecte → squelette, puis s'arrête
# ── PORTE G1 : pnpm --filter @criticalthinker/review ctr g1 articles/mon-sujet/v1
pnpm ct run mon-sujet         # rédaction → sourçage → jugement → critique → validation
# ── PORTE G2 : pnpm --filter @criticalthinker/review ctr g2 articles/mon-sujet/v1
pnpm ct version mon-sujet     # fige v1, ouvre v2 pour itérer (ct write --nodes …)
```

Le `graph.json` validé se dépose ensuite dans la content collection du blog Astro avec le composant `<GraphArticle>` — voir `engine/demo/` pour l'exemple d'intégration.
