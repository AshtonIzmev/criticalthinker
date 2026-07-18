# SPEC v2 — CriticalThinker : Usine à Articles-Graphes

**Statut :** référence d'implémentation — remplace la spec GORA v1.
**Version du document :** 2.0 (2026-07-18)

---

## 1. Vision et objectifs

CriticalThinker produit des **articles non linéaires en forme de graphe orienté**, destinés à pousser les lecteurs vers la pensée critique. La thèse fondatrice : *la réalité n'est jamais noire ou blanche, elle est grise*. L'article-graphe rend cette thèse mécanique :

- chaque concept est exploré à travers **plusieurs axes d'analyse non binaires** (pas de Pro/Con polarisé) ;
- le lecteur **choisit son parcours** en suivant sa curiosité, et le système **récompense la diversité du parcours** plutôt que la simple exhaustivité ;
- le **factuel et l'interprétatif sont visuellement distincts** : la base empirique de chaque nœud est sourcée de manière vérifiable, les axes d'analyse sont assumés comme des perspectives.

### Contrainte opérationnelle centrale

Le contenu est **généré, sourcé, critiqué et corrigé par IA**. L'humain (l'éditeur) n'intervient qu'à deux moments courts :

1. **Porte G1** — relecture du squelette du graphe (~5 min) ;
2. **Porte G2** — relecture d'une fiche de revue synthétique (~5 min), suivie d'itérations éventuelles par nœud.

Si une revue demande plus de ~10 minutes, le système a échoué sur sa seule exigence humaine.

### Entrée / Sortie

- **Entrée :** un sujet, plus ou moins spécifié (une phrase à un paragraphe).
- **Sortie :** un `graph.json` complet, validé, sourcé, versionné — prêt à être déposé dans un blog Astro pour publication.

---

## 2. Architecture d'ensemble

Le repo produit trois livrables distincts :

| Livrable | Rôle | Fréquence |
|---|---|---|
| **Pipeline de génération** | Sujet → `graph.json` validé, via agents IA adversariaux | À chaque article |
| **Moteur de lecture** | Composant Astro `<GraphArticle>` qui rend n'importe quel `graph.json` conforme | Écrit une fois, installé une fois dans le blog |
| **Outillage de revue** | Rendu du squelette, fiche de revue, diff structurel entre versions | À chaque porte humaine |

### Structure du repo

```
criticalthinker/
├── SPEC.md                     # ce document
├── schema/                     # LE contrat : schéma Zod partagé (source de vérité unique)
│   └── graph-article.ts        # utilisé par le pipeline, la revue ET le build du blog
├── pipeline/                   # agents de génération + orchestration
├── engine/                     # composant Astro <GraphArticle> + island TS
│   └── demo/                   # blog Astro minimal pour développer/tester le moteur
├── review/                     # outillage éditeur : squelette, fiche de revue, diff
└── articles/                   # un dossier par sujet
    └── <slug>/
        ├── seed.md             # le sujet tel que fourni par l'éditeur
        ├── v1/
        │   ├── graph.json
        │   ├── sources-cache/  # texte extrait de chaque source (audit hors-ligne)
        │   └── reports/        # rapports sourceur, juge, critique, validateur
        ├── v2/
        └── ...
```

**Règle de couplage :** le schéma Zod dans `schema/` est le contrat unique entre les quatre zones du repo et le blog. Toute évolution du schéma incrémente `schema_version` ; le moteur de lecture sait lire les versions antérieures.

---

## 3. Modèle conceptuel du graphe

Graphe orienté avec boucles de rétroaction (pas un arbre : pas d'impasses, des liens récursifs entre piliers).

### Les 5 niveaux de profondeur

1. **Niveau 1 — Hub Macro :** texte introductif contenant les piliers du sujet et les premiers mots-clés cliquables.
2. **Niveau 2 — Mot-clé ancre :** entité surlignée dans le texte, qui invite au clic.
3. **Niveau 3 — Question interrogative :** la question de friction que soulève le mot-clé, affichée en expansion inline (pas de modale).
4. **Niveau 4 — Base empirique :** exactement deux phrases de contexte factuel objectif, **chaque affirmation adossée à une source vérifiée** (voir §6).
5. **Niveau 5 — Cardinalités :** 2 à 4 axes d'analyse non binaires. Chaque cardinalité contient **au plus un lien récursif** vers un autre nœud (règle dure, voir §4.3).

### Contraintes de taille

- **15 à 40 nœuds** par article. En dessous, le graphe n'a pas d'intérêt ; au-dessus, la mini-map devient illisible et la revue humaine dépasse le budget de 10 minutes.
- 3 à 5 piliers.
- Chaque pilier contient au moins 2 nœuds ; chaque nœud est rattaché à exactement un pilier.

---

## 4. Format de données : `graph.json`

### 4.1 Structure générale

```json
{
  "schema_version": "2.0",
  "article": {
    "id": "slug-de-l-article",
    "title": "Titre de l'article",
    "language": "fr",
    "graph_version": 3,
    "created": "2026-07-18",
    "seed": "Le sujet tel que fourni par l'éditeur.",
    "hub": {
      "text_md": "Texte introductif avec des [[mots-clés|NODE_ID]] cliquables...",
      "pillars": [
        { "id": "PIL_A", "label": "Nom du domaine catégoriel A" },
        { "id": "PIL_B", "label": "Nom du domaine catégoriel B" }
      ]
    },
    "synthesis": {
      "unlock": { "min_coverage": 0.6, "min_pillar_diversity": 1.0 },
      "text_md": "Texte de synthèse débloqué en fin de parcours..."
    }
  },
  "nodes": [ ... ],
  "sources": [ ... ]
}
```

### 4.2 Nœud

```json
{
  "id": "PILA_N01",
  "pillar": "PIL_A",
  "keyword": "Le mot ancre",
  "question": "La question de friction déclenchée au clic ?",
  "summary": {
    "text": "Exactement deux phrases de contexte factuel. Chaque affirmation est traçable à une source.",
    "source_ids": ["SRC_01", "SRC_02"]
  },
  "cardinalities": [
    {
      "label": "Axe analytique Alpha (ex : Structurel / Institutionnel)",
      "text_md": "Analyse via l'axe Alpha, avec un lien vers [[concept alternatif|PILB_N02]].",
      "target_node_id": "PILB_N02"
    },
    {
      "label": "Axe analytique Bêta (ex : Individuel / Agentif)",
      "text_md": "Analyse via l'axe Bêta. Feuille terminale : aucun saut.",
      "target_node_id": null
    }
  ],
  "provenance": {
    "written_by": "writer",
    "revisions": 1,
    "passes": { "sourced": true, "critiqued": true, "validated": true },
    "critic_flags_open": []
  }
}
```

### 4.3 Micro-syntaxe des liens (règle dure)

- Syntaxe unique : `[[texte affiché|NODE_ID]]`, utilisable dans `hub.text_md` et `cardinalities[].text_md`.
- **Au plus un lien par cardinalité**, et le `NODE_ID` du lien inline doit être identique au `target_node_id` de la cardinalité. Un lien sans `target_node_id` correspondant (ou l'inverse) est une erreur de validation.
- Le hub peut contenir autant de liens que de nœuds d'entrée souhaités.

### 4.4 Source

```json
{
  "id": "SRC_01",
  "url": "https://...",
  "title": "Titre de la page/du document",
  "publisher": "Éditeur ou institution",
  "accessed": "2026-07-18",
  "language": "en",
  "claim": "L'affirmation précise du résumé que cette source soutient.",
  "supporting_quote": "Le passage de la source qui soutient l'affirmation — dans la langue de la source, aussi proche du verbatim que possible.",
  "cache_ref": "sources-cache/SRC_01.txt",
  "confidence": "high | medium",
  "verification": {
    "verdict": "supported | partial | unsupported",
    "method": "llm-judge",
    "rationale": "Une phrase : pourquoi la source soutient (ou non) l'affirmation.",
    "judged_by": "verifier-judge"
  }
}
```

- `supporting_quote` est **obligatoire** : il force l'agent sourceur à lire réellement la source (pas de sourçage de mémoire) et donne à l'éditeur un élément de contrôle ponctuel immédiat. Il n'a **pas** à être littéralement présent dans le texte archivé : la source peut être dans une autre langue que l'article, et l'extraction peut reformater le texte. **C'est l'esprit qui doit être respecté**, et c'est le juge sémantique (§6) qui en décide.
- `cache_ref` pointe vers le texte extrait de la source, archivé dans la version de l'article — la vérification et l'audit G2 restent reproductibles hors-ligne même si la page change ou disparaît.
- `verification` est le verdict du **juge sémantique indépendant** : `supported` requis pour publier ; `partial` remonte en flag d'arbitrage à G2 ; `unsupported` invalide la source.

---

## 5. Pipeline de génération

### 5.1 Principe : adversarial, pas monologue

Une IA qui relit sa propre production approuve ses propres hallucinations. Le pipeline sépare donc les rôles en **passes distinctes, avec des accès à l'information différents**, pour que les erreurs doivent survivre à plusieurs filtres non corrélés.

```
[ Sujet (seed.md) ]
        │
        ▼
┌─────────────────┐
│ 1. ARCHITECTE    │  Produit le SQUELETTE seul : piliers, mots-clés,
│                  │  questions, labels d'axes, arêtes. AUCUNE prose.
└────────┬────────┘
         ▼
╔═════════════════╗
║ PORTE G1 (humain)║  Revue du squelette (~5 min) : topologie, questions,
║                  ║  axes. Approbation ou régénération ciblée.
╚════════╤════════╝
         ▼
┌─────────────────┐
│ 2. RÉDACTEUR     │  Remplit résumés et cardinalités, nœud par nœud,
│                  │  contraint par le squelette approuvé.
└────────┬────────┘
         ▼
┌─────────────────┐
│ 3. SOURCEUR      │  Passe SÉPARÉE. Pour chaque affirmation factuelle :
│                  │  recherche web, ancrage dans une source RÉCUPÉRÉE
│                  │  et ARCHIVÉE (jamais la mémoire du modèle), extraction
│                  │  du passage de soutien. Affirmation non ançrable →
│                  │  flag ou réécriture en interprétatif explicite.
└────────┬────────┘
         ▼
┌─────────────────┐
│ 3b. JUGE         │  Passe INDÉPENDANTE, cadrée pour réfuter :
│     SÉMANTIQUE   │  affirmation + texte archivé → verdict
│                  │  supported / partial / unsupported (§6).
└────────┬────────┘
         ▼
┌─────────────────┐
│ 4. CRITIQUE      │  Cadré pour RÉFUTER, pas approuver. Lentilles
│                  │  distinctes : exactitude factuelle, chevauchement
│                  │  d'axes, faux équilibre, qualité des questions,
│                  │  dérive de ton entre nœuds.
└────────┬────────┘
         │   findings → retour au RÉDACTEUR (nœud par nœud),
         │   boucle bornée à 3 itérations max.
         ▼
┌─────────────────┐
│ 5. VALIDATEUR    │  Script, PAS une IA. Schéma Zod + règles de graphe
│    MÉCANIQUE     │  (§7). Aucun appel modèle, aucune attention humaine
│                  │  sur ce qu'un script peut vérifier.
└────────┬────────┘
         ▼
╔═════════════════╗
║ PORTE G2 (humain)║  Fiche de revue (~5 min). Approbation, contrôle
║                  ║  ponctuel des nœuds signalés, ou rejet ciblé.
╚════════╤════════╝
         ▼
[ graph.json vN publiable ]
```

### 5.2 Règles du pipeline

- **Régénération à portée de nœud.** Un rejet à G2 réécrit *uniquement* les nœuds visés, le reste du graphe est figé. Une itération ne doit jamais invalider le travail de revue déjà fait.
- **Boucle critique bornée** à 3 allers-retours rédacteur↔critique par nœud ; au-delà, le nœud est flaggé pour arbitrage humain à G2.
- **Règle "pas de source, pas de nœud".** Un nœud dont le résumé contient une affirmation factuelle sans source vérifiée (avec `supporting_quote`) ne peut pas exister dans un graphe publiable. C'est le validateur mécanique qui l'applique, pas une consigne de prompt.
- **Le contrôle humain audite l'auditeur.** À G2, les contrôles ponctuels de l'éditeur ciblent en priorité les nœuds dont les sources ont la confiance la plus faible (`confidence: medium`) et les `critic_flags_open`.
- Chaque passe écrit son rapport dans `articles/<slug>/vN/reports/` (traçabilité + matière pour la fiche de revue).

---

## 6. Sourçage (exigence n°1 du projet)

- **Niveau 4 (base empirique) : 100 % sourcé.** Chaque phrase du résumé est couverte par ≥ 1 source avec passage de soutien et verdict `supported`. Sans cela, le nœud est invalide.
- **Niveau 5 (cardinalités) : interprétatif assumé.** Les axes d'analyse peuvent citer des sources mais n'y sont pas obligés — c'est leur rôle d'être des perspectives. La distinction factuel/interprétatif est **rendue visible au lecteur** (voir §8.4).
- **Vérification ancrée, jamais de mémoire.** Le sourceur doit récupérer la page (le texte extrait est archivé dans `sources-cache/`) et en tirer le passage de soutien.
- **L'esprit prime sur la lettre.** Un **juge sémantique indépendant** — passe distincte du sourceur, prompt cadré pour réfuter — reçoit l'affirmation + le texte archivé et rend un verdict `supported` / `partial` / `unsupported`. Ce n'est jamais le rédacteur ni le sourceur qui note sa propre copie. Une URL réelle qui ne soutient pas vraiment l'affirmation est le mode d'échec principal : le juge indépendant + l'audit ciblé de G2 (priorité aux `partial` et aux confiances faibles) sont les deux mitigations.
- Les sources sont mutualisées au niveau de l'article (tableau `sources`) et référencées par ID depuis les nœuds.

---

## 7. Validation mécanique (script, build-time)

Le schéma Zod dans `schema/` est **partagé** entre le pipeline, l'outillage de revue et le build Astro du blog : un graphe invalide fait échouer le build — il est physiquement impossible de publier un graphe cassé.

Règles vérifiées (liste initiale, extensible) :

**Schéma**
1. Conformité Zod complète (types, champs requis, `schema_version` connu).
2. Résumé = exactement 2 phrases.
3. 2 à 4 cardinalités par nœud ; 15 à 40 nœuds ; 3 à 5 piliers ; ≥ 2 nœuds par pilier.

**Intégrité du graphe**
4. Tout `target_node_id` référence un nœud existant (pas de lien pendant).
5. Tout nœud est joignable depuis le hub (pas de sous-graphe orphelin).
6. Tout nœud a ≥ 1 arête entrante (hub inclus comme origine).
7. Le lien inline `[[…|ID]]` d'une cardinalité correspond exactement à son `target_node_id` ; au plus un lien par cardinalité.
8. Pas de collision de mots-clés (deux nœuds avec le même `keyword`).
9. Pas d'auto-boucle (un nœud ne pointe pas vers lui-même).

**Sourçage**
10. Chaque nœud : `summary.source_ids` non vide ; chaque source référencée existe.
11. Chaque source : `url`, `supporting_quote`, `claim`, `accessed`, `cache_ref` non vides ; le fichier pointé par `cache_ref` existe et n'est pas trivialement vide.
12. Pas de source orpheline (déclarée mais jamais référencée) — avertissement.
12b. Chaque source porte un `verification.verdict = "supported"` rendu par le juge sémantique (un `partial` bloque la publication tant qu'il n'est pas arbitré à G2 ; un `unsupported` invalide la source). Le validateur vérifie la présence et la valeur du verdict — le jugement sémantique lui-même relève du juge (§6), pas du script.

**Provenance**
13. `passes.sourced`, `passes.critiqued`, `passes.validated` à `true` ; `critic_flags_open` vide (sinon publication bloquée, arbitrage G2 requis).

---

## 8. Moteur de lecture (`<GraphArticle>`, island Astro)

### 8.1 Intégration Astro

- **Une island unique**, vanilla TS (pas de framework lourd). Le reste de la page est statique.
- **Content collection** : chaque `graph.json` est une entrée de collection validée par le schéma Zod partagé. Publier = déposer le JSON + une page `.astro` de trois lignes.
- **SEO / no-JS : amélioration progressive.** Tout le contenu des nœuds est rendu en HTML statique au build (masqué, révélé par interaction). Sans JS, l'article se dégrade en lecture linéaire complète (hub, puis nœuds groupés par pilier). Le JS de l'island ne fait que l'orchestration. L'article entier est indexable.
- **Routing par hash** : `#node-id` à chaque navigation. Le bouton retour du navigateur fonctionne (c'est l'outil anti-vortex instinctif du lecteur), chaque nœud est partageable en lien profond.
- **Persistance** : état de parcours dans `localStorage` (par `article.id`), sinon la progression se réinitialise à chaque rechargement.

### 8.2 Composants UI persistants

**A. Mini-map (graphe visuel)**
- Desktop : panneau fixe latéral (SVG léger). Nœuds = coordonnées circulaires groupées par pilier ; arêtes = lignes vectorielles.
- **Mobile : bottom-sheet repliable** (ou bandeau de progression simplifié) — prévu dès le premier jour, pas en retrofit.
- États : non visité (opacité faible), actif (pulsation), visité (couleur pleine + coche), arête traversée (ligne allumée au moment du saut récursif).

**B. Progression : diversité, pas seulement complétion**
La jauge de complétion brute récompense l'exhaustivité ; l'objectif du projet est de récompenser la **curiosité**. Trois métriques :
- **Couverture** = cardinalités lues / cardinalités totales (l'unité de progression est la *cardinalité*, pas le nœud — voir §8.3) ;
- **Diversité** = piliers dont ≥ 1 nœud a été exploré / piliers totaux ;
- **Contradiction** = nombre de nœuds dont ≥ 2 axes ont été lus.

Ces métriques conditionnent le **déblocage de la synthèse** (`article.synthesis.unlock`) : le moment de payoff qui reflète le parcours du lecteur — "tu as lu N perspectives partiellement contradictoires sur X ; voilà le gris." La thèse du projet, rendue mécanique de jeu.

**C. Mots-clés contextuels**
- Style distinctif (`border-bottom: 2px dashed var(--accent)`, curseur pointeur).
- Survol : micro-tooltip prévisualisant la question du nœud cible. Clic : mise à jour du viewport principal.

### 8.3 Machine à états et sémantique de "visité"

Deux niveaux de progression, distincts :
- **Nœud ouvert** : le lecteur a affiché question + résumé (compte pour la mini-map et la diversité) ;
- **Cardinalité lue** : le lecteur a déplié/affiché un axe (compte pour la couverture et la contradiction).

```
[ Clic mot-clé ] → [ résolution NODE_ID ]
   → nœud non ouvert ? → marquer ouvert, MAJ métriques, MAJ mini-map
   → rendre question + résumé + badges sources + axes repliés
   → hash ← #NODE_ID
[ Dépli d'une cardinalité ] → marquer lue, MAJ couverture/contradiction
[ Clic lien récursif ] → hash ← #TARGET_ID, tracer l'arête sur la mini-map,
                          rendre le nœud cible
[ Seuils de synthèse atteints ] → déverrouiller le nœud de synthèse
```

**Règle anti-vortex.** Retour sur un nœud déjà ouvert : le contenu est rendu intégralement (cohérence narrative), mais les cardinalités déjà lues sont stylées distinctement (opacité réduite, coche) pour guider le prochain clic vers les segments inexplorés.

### 8.4 Affichage des sources (face lecteur)

Chaque résumé (niveau 4) porte des **badges de source** dépliables : titre, éditeur, lien, et la citation exacte (`supporting_quote`). Les cardinalités sont visuellement marquées comme perspectives (label d'axe apparent). Un article généré par IA qui montre ses sources par affirmation est crédible ; c'est aussi la leçon de pensée critique rendue visible.

### 8.5 Accessibilité

- Navigation clavier complète (mots-clés et liens = éléments focusables).
- `aria-live` sur le viewport principal (le swap de nœud est annoncé).
- Mini-map SVG avec alternative textuelle (liste des nœuds et de leur état).
- Le mode no-JS linéaire (§8.1) sert aussi de fallback d'accessibilité.

---

## 9. Outillage de revue (face éditeur)

Livrable de premier rang, spécifié au même titre que l'UI lecteur. Budget : **≤ 10 min par porte**.

### 9.1 Porte G1 — vue squelette
Une page HTML générée : graphe visuel (piliers, nœuds, arêtes) + tableau des nœuds (mot-clé / question / labels d'axes / cible des liens). Aucune prose. L'éditeur approuve, ou demande la régénération ciblée d'éléments du squelette.

### 9.2 Porte G2 — fiche de revue
Une page HTML générée :
- le graphe rendu visuellement ;
- par nœud, des **feux tricolores** : sourcé ✓ / flag critique ⚠ / révisé ↻ ;
- les objections du critique ayant survécu à la boucle de révision ;
- les nœuds triés par priorité d'audit (confiance de source la plus faible d'abord).

L'éditeur approuve, contrôle ponctuellement les nœuds signalés, ou rejette des nœuds précis (→ régénération à portée de nœud, nouvelle version).

### 9.3 Diff structurel entre versions
Comparaison v(N) / v(N+1) **au niveau du graphe** : nœuds ajoutés/supprimés, arêtes modifiées, textes réécrits, sources changées — pas un diff textuel brut. Git fournit l'historique ; cet outil fournit la lisibilité.

---

## 10. Versionnage et workflow d'itération

- Chaque article vit dans `articles/<slug>/`, avec des versions numérotées (`v1/`, `v2/`…) contenant `graph.json` + `reports/`.
- `schema_version` (format du JSON) et `article.graph_version` (itération du contenu) sont indépendants.
- Workflow type : seed → G1 → v1 complète → G2 → rejets ciblés → v2 → G2 → … → publication (copie du `graph.json` approuvé dans la collection du blog).
- Toute évolution du schéma est rétro-compatible ou versionnée ; le moteur sait lire les `schema_version` antérieures.

---

## 11. Non-objectifs (v2)

- Pas de backend, pas de base de données : tout est statique (JSON + island).
- Pas de comptes utilisateurs ni de synchronisation multi-appareils (le parcours vit en `localStorage`).
- Pas de commentaires ni de contribution des lecteurs.
- Pas de génération à la volée côté lecteur : le graphe est figé à la publication.
- Analytics : hors périmètre v2 (le hash routing rend l'ajout trivial plus tard).

## 12. Questions ouvertes

- **Layout de la mini-map** : positions calculées au build (déterministe, versionnable) ou force-directed au runtime ? Tendance : au build.
- **Multilinguisme** : `article.language` existe ; la génération multilingue d'un même graphe est envisageable mais hors périmètre v2.
- **Seuils de synthèse** : les valeurs par défaut (`min_coverage: 0.6`, `min_pillar_diversity: 1.0`) sont des hypothèses à tester sur les premiers articles.
- **Ordre d'implémentation recommandé** : (1) schéma Zod + validateur, (2) pipeline, (3) moteur de lecture, (4) mini-map en dernier — c'est la partie la plus visible mais la moins structurante.
