import type { GraphArticle, GraphLayout, Skeleton } from '@criticalthinker/schema';

/**
 * Briques partagées des pages de revue (SPEC §9) : gabarit HTML autonome
 * (un fichier, zéro dépendance, ouvrable localement, light + dark) et rendu
 * SVG du graphe — le même layout déterministe que la mini-map du moteur.
 *
 * Couleurs : palette catégorielle validée (identité des piliers, ordre fixe)
 * et palette de statut réservée (jamais réutilisée pour une série) ; un
 * statut porte toujours icône + libellé, jamais la couleur seule.
 */

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * Affiche un texte porteur de micro-syntaxe [[texte|NODE_ID]] : le lien
 * devient un mot-clé stylé suivi de sa cible — l'éditeur voit à la fois
 * le texte d'ancrage et l'id, sans syntaxe brute.
 */
export function renderInlineMarkup(text: string): string {
  return escapeHtml(text).replace(
    /\[\[([^|\]]+)\|([^\]]+)\]\]/g,
    (_match, label: string, nodeId: string) =>
      `<span class="kw">${label.trim()}</span>&thinsp;<code>${nodeId.trim()}</code>`,
  );
}

/** Slots catégoriels 1..5 (ordre fixe — c'est le mécanisme de sécurité CVD). */
export function pillarClass(pillarIds: string[], pillarId: string): string {
  const index = Math.max(0, pillarIds.indexOf(pillarId));
  return `p${(index % 5) + 1}`;
}

export type StatusKind = 'good' | 'warning' | 'critical';

/** Options de layout cadrées sur le contenu réel (pas de blanc inutile). */
export function fittedLayoutOptions(maxNodesInPillar: number): {
  size: number;
  innerRadius: number;
  ringGap: number;
  maxPerRing: number;
} {
  const innerRadius = 130;
  const ringGap = 46;
  const maxPerRing = 5;
  const rings = Math.max(1, Math.ceil(maxNodesInPillar / maxPerRing));
  const size = 2 * (innerRadius + (rings - 1) * ringGap + 42);
  return { size, innerRadius, ringGap, maxPerRing };
}

export function maxNodesPerPillar(nodes: { pillar: string }[]): number {
  const counts = new Map<string, number>();
  for (const node of nodes) counts.set(node.pillar, (counts.get(node.pillar) ?? 0) + 1);
  return Math.max(1, ...counts.values());
}

export interface NodeStatus {
  status?: StatusKind;
  badge?: string;
}

export function renderGraphSvg(
  layout: GraphLayout,
  pillarIds: string[],
  pillarOf: (nodeId: string) => string,
  statuses: Map<string, NodeStatus> = new Map(),
): string {
  const edges = layout.edges
    .map(
      (edge) =>
        `<line class="edge${edge.from === null ? ' edge-hub' : ''}" x1="${edge.x1}" y1="${edge.y1}" x2="${edge.x2}" y2="${edge.y2}" marker-end="url(#arrow)"/>`,
    )
    .join('\n      ');

  const nodes = layout.nodes
    .map((point) => {
      const status = statuses.get(point.id);
      const colorClass =
        status?.status !== undefined
          ? `st-${status.status}`
          : pillarClass(pillarIds, pillarOf(point.id));
      const badge =
        status?.badge !== undefined
          ? `<text class="badge" x="${point.x + 10}" y="${point.y - 9}">${escapeHtml(status.badge)}</text>`
          : '';
      return `<g class="node">
        <circle class="dot ${colorClass}" cx="${point.x}" cy="${point.y}" r="7"><title>${escapeHtml(point.id)}</title></circle>
        <text class="nlabel" x="${point.x}" y="${point.y + 20}" text-anchor="middle">${escapeHtml(shortId(point.id))}</text>
        ${badge}
      </g>`;
    })
    .join('\n      ');

  return `<svg viewBox="0 0 ${layout.width} ${layout.height}" role="img" aria-label="Graphe de l'article">
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="17" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto-start-reverse">
          <path d="M 0 1.5 L 8.5 5 L 0 8.5 z" class="arrowhead"/>
        </marker>
      </defs>
      ${edges}
      <circle class="hubdot" cx="${layout.hub.x}" cy="${layout.hub.y}" r="11"/>
      <text class="hublabel" x="${layout.hub.x}" y="${layout.hub.y + 3.5}" text-anchor="middle">HUB</text>
      ${nodes}
    </svg>`;
}

/** PIL_A_N01 → A·01 : les libellés du graphe restent lisibles à 9 px. */
function shortId(nodeId: string): string {
  const match = /^PIL_?([A-Z])_N?(\d+)$/.exec(nodeId);
  return match ? `${match[1]}·${match[2]}` : nodeId;
}

export interface Tile {
  value: string;
  label: string;
  status?: StatusKind;
}

export function renderTiles(tiles: Tile[]): string {
  return `<div class="tiles">${tiles
    .map(
      (tile) =>
        `<div class="tile${tile.status !== undefined ? ` tile-${tile.status}` : ''}">
          <div class="tile-value">${escapeHtml(tile.value)}</div>
          <div class="tile-label">${escapeHtml(tile.label)}</div>
        </div>`,
    )
    .join('')}</div>`;
}

const STATUS_META: Record<StatusKind, { icon: string; label: string }> = {
  good: { icon: '✓', label: 'rien à signaler' },
  warning: { icon: '●', label: 'à regarder' },
  critical: { icon: '⚠', label: 'arbitrage requis' },
};

/** Chip de statut : toujours icône + libellé, jamais la couleur seule. */
export function statusChip(status: StatusKind, label?: string): string {
  const meta = STATUS_META[status];
  return `<span class="chip chip-${status}"><span class="chip-icon">${meta.icon}</span>${escapeHtml(label ?? meta.label)}</span>`;
}

export function pillarLegend(pillars: { id: string; label: string }[]): string {
  const ids = pillars.map((pillar) => pillar.id);
  return `<div class="legend">${pillars
    .map(
      (pillar) =>
        `<span class="legend-item"><span class="swatch ${pillarClass(ids, pillar.id)}"></span>${escapeHtml(pillar.label)}&nbsp;<code>${pillar.id}</code></span>`,
    )
    .join('')}</div>`;
}

export function pageTemplate(title: string, kicker: string, body: string): string {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root {
    color-scheme: light dark;
    /* chrome & encre */
    --page: #f9f9f7; --surface: #fcfcfb; --ink: #0b0b0b; --ink-2: #52514e;
    --muted: #898781; --hairline: #e1e0d9; --ring: rgba(11,11,11,0.10);
    /* piliers — palette catégorielle validée, ordre fixe */
    --p1: #2a78d6; --p2: #008300; --p3: #e87ba4; --p4: #eda100; --p5: #1baf7a;
    /* statuts — palette réservée */
    --good: #0ca30c; --warning: #fab219; --critical: #d03b3b;
    --good-ink: #006300; --warning-ink: #8a5b00; --critical-ink: #b02a2a;
    --good-wash: rgba(12,163,12,0.09); --warning-wash: rgba(250,178,25,0.14); --critical-wash: rgba(208,59,59,0.09);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --page: #0d0d0d; --surface: #1a1a19; --ink: #ffffff; --ink-2: #c3c2b7;
      --muted: #898781; --hairline: #2c2c2a; --ring: rgba(255,255,255,0.10);
      --p1: #3987e5; --p2: #008300; --p3: #d55181; --p4: #c98500; --p5: #199e70;
      --good-ink: #0ca30c; --warning-ink: #fab219; --critical-ink: #e66767;
      --good-wash: rgba(12,163,12,0.16); --warning-wash: rgba(250,178,25,0.14); --critical-wash: rgba(208,59,59,0.18);
    }
  }

  * { box-sizing: border-box; }
  body {
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    margin: 0; padding: 2.5rem 1.25rem 5rem; background: var(--page); color: var(--ink);
    line-height: 1.55; font-size: 15px;
  }
  main { max-width: 1080px; margin: 0 auto; }

  .kicker { font-size: .78rem; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); margin: 0 0 .35rem; }
  h1 { font-size: 1.6rem; letter-spacing: -0.015em; margin: 0 0 .4rem; }
  .lede { color: var(--ink-2); margin: 0 0 1.75rem; max-width: 62ch; }
  h2 { font-size: .95rem; letter-spacing: .02em; text-transform: uppercase; color: var(--ink-2); margin: 2.5rem 0 .8rem; }

  /* tuiles de stats */
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: .6rem; margin: 1.25rem 0 .5rem; }
  .tile { background: var(--surface); border: 1px solid var(--ring); border-radius: 10px; padding: .7rem .9rem; }
  .tile-value { font-size: 1.45rem; font-weight: 650; letter-spacing: -0.01em; }
  .tile-label { font-size: .78rem; color: var(--muted); margin-top: .1rem; }
  .tile-warning .tile-value { color: var(--warning-ink); }
  .tile-critical .tile-value { color: var(--critical-ink); }
  .tile-good .tile-value { color: var(--good-ink); }

  /* cartes */
  .card { background: var(--surface); border: 1px solid var(--ring); border-radius: 12px; padding: 1.1rem 1.25rem; }
  .card.graph { display: flex; justify-content: center; padding: 1.4rem; }
  .card.graph svg { width: min(560px, 100%); height: auto; }

  /* graphe */
  .edge { stroke: var(--muted); stroke-width: 1.2; opacity: .38; }
  .edge-hub { stroke-dasharray: 3 4; opacity: .22; }
  .arrowhead { fill: var(--muted); opacity: .75; }
  .hubdot { fill: var(--ink); opacity: .85; }
  .hublabel { fill: var(--surface); font-size: 7.5px; font-weight: 700; letter-spacing: .05em; }
  .dot { stroke: var(--surface); stroke-width: 2; }
  .node:hover .dot { stroke-width: 3; }
  .nlabel { fill: var(--muted); font-size: 8px; font-variant-numeric: tabular-nums; }
  .badge { font-size: 10px; fill: var(--ink-2); }
  .p1 { fill: var(--p1); } .p2 { fill: var(--p2); } .p3 { fill: var(--p3); } .p4 { fill: var(--p4); } .p5 { fill: var(--p5); }
  .st-good { fill: var(--good); } .st-warning { fill: var(--warning); } .st-critical { fill: var(--critical); }
  span.swatch { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: .45rem; }
  span.swatch.p1 { background: var(--p1); } span.swatch.p2 { background: var(--p2); } span.swatch.p3 { background: var(--p3); }
  span.swatch.p4 { background: var(--p4); } span.swatch.p5 { background: var(--p5); }

  .legend { display: flex; flex-wrap: wrap; gap: .4rem 1.4rem; margin: .8rem 0; font-size: .85rem; color: var(--ink-2); }
  .legend-item { display: inline-flex; align-items: center; }

  /* chips de statut — icône + libellé, jamais la couleur seule */
  .chip { display: inline-flex; align-items: center; gap: .35rem; font-size: .78rem; font-weight: 600;
          padding: .18rem .6rem .18rem .5rem; border-radius: 999px; white-space: nowrap; }
  .chip-icon { font-size: .82em; }
  .chip-good { background: var(--good-wash); color: var(--good-ink); }
  .chip-warning { background: var(--warning-wash); color: var(--warning-ink); }
  .chip-critical { background: var(--critical-wash); color: var(--critical-ink); }

  /* tableaux */
  .tablewrap { background: var(--surface); border: 1px solid var(--ring); border-radius: 12px; overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; font-size: .875rem; }
  th { text-align: left; font-size: .72rem; letter-spacing: .06em; text-transform: uppercase; color: var(--muted);
       padding: .65rem .9rem; border-bottom: 1px solid var(--hairline); position: sticky; top: 0; background: var(--surface); }
  td { padding: .7rem .9rem; border-bottom: 1px solid var(--hairline); vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  tbody tr:hover td { background: color-mix(in srgb, var(--hairline) 30%, transparent); }

  code { background: color-mix(in srgb, var(--hairline) 55%, transparent); color: var(--ink-2);
         padding: .1rem .38rem; border-radius: 5px; font-size: .82em; font-variant-numeric: tabular-nums; }
  .muted { color: var(--muted); font-size: .84rem; }
  .keyword { font-weight: 650; }
  .kw { font-weight: 600; border-bottom: 2px dashed var(--p1); }
  a { color: var(--p1); text-decoration: none; }
  a:hover { text-decoration: underline; }

  .status-lines { display: grid; gap: .3rem; }
  .verdict { font-weight: 600; font-size: .78rem; }
  .verdict-supported { color: var(--good-ink); }
  .verdict-partial { color: var(--warning-ink); }
  .verdict-unsupported { color: var(--critical-ink); }
  blockquote.quote { margin: .35rem 0 0; padding-left: .7rem; border-left: 2px solid var(--hairline);
                     color: var(--ink-2); font-style: italic; font-size: .84rem; }
  .flag { background: var(--warning-wash); border-left: 3px solid var(--warning); border-radius: 0 6px 6px 0;
          padding: .4rem .7rem; margin: .35rem 0; font-size: .84rem; }
  .axis-list { margin: 0; padding: 0; list-style: none; display: grid; gap: .25rem; }

  ul.findings { margin: .5rem 0; padding-left: 1.2rem; }
  ul.findings li { margin: .3rem 0; }
  .ok-note { color: var(--good-ink); font-weight: 600; }
</style>
</head>
<body>
<main>
<p class="kicker">${escapeHtml(kicker)}</p>
${body}
</main>
</body>
</html>
`;
}

/**
 * Un squelette n'est pas encore un GraphArticle ; pour réutiliser le layout
 * partagé, on le projette vers la forme minimale attendue (textes factices,
 * seules la topologie et les métadonnées comptent pour le rendu G1).
 */
export function skeletonToGraphShape(skeleton: Skeleton): GraphArticle {
  return {
    schema_version: '2.0',
    article: {
      id: 'skeleton-preview',
      title: skeleton.title,
      language: 'fr',
      graph_version: 1,
      created: '1970-01-01',
      seed: '(squelette)',
      hub: skeleton.hub,
      synthesis: { unlock: { min_coverage: 0.6, min_pillar_diversity: 1 }, text_md: '(à venir)' },
    },
    nodes: skeleton.nodes.map((node) => ({
      id: node.id,
      pillar: node.pillar,
      keyword: node.keyword,
      question: node.question,
      summary: { text: '(à rédiger)', source_ids: [] },
      cardinalities: node.cardinalities.map((cardinality) => ({
        label: cardinality.label,
        text_md: '(à rédiger)',
        target_node_id: cardinality.target_node_id,
      })),
      provenance: {
        written_by: 'architect',
        revisions: 0,
        passes: { sourced: false, critiqued: false, validated: false },
        critic_flags_open: [],
      },
    })),
    sources: [],
  };
}
