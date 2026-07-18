import type { GraphArticle, GraphLayout, Skeleton } from '@criticalthinker/schema';

/**
 * Briques partagées des pages de revue (SPEC §9) : gabarit HTML autonome
 * (un fichier, zéro dépendance, ouvrable localement) et rendu SVG du graphe
 * — le même layout déterministe que la mini-map du moteur (schema/layout).
 */

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

const PILLAR_COLORS = ['#4f7cac', '#a4574f', '#5d8a5e', '#8a6d9c', '#b08a45'];

export function pillarColor(pillarIds: string[], pillarId: string): string {
  const index = Math.max(0, pillarIds.indexOf(pillarId));
  return PILLAR_COLORS[index % PILLAR_COLORS.length] as string;
}

export interface NodeStatus {
  /** Couleur de remplissage — statut éditorial (feux tricolores G2). */
  fill?: string;
  /** Marqueur textuel affiché à côté du nœud. */
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
        `<line x1="${edge.x1}" y1="${edge.y1}" x2="${edge.x2}" y2="${edge.y2}" stroke="${edge.from === null ? '#c9c9c9' : '#9aa7b5'}" stroke-width="${edge.from === null ? 1 : 1.4}" ${edge.from === null ? 'stroke-dasharray="3 3"' : ''} marker-end="url(#arrow)"/>`,
    )
    .join('\n    ');

  const nodes = layout.nodes
    .map((point) => {
      const status = statuses.get(point.id);
      const fill = status?.fill ?? pillarColor(pillarIds, pillarOf(point.id));
      const badge =
        status?.badge !== undefined
          ? `<text x="${point.x + 12}" y="${point.y - 8}" font-size="11">${escapeHtml(status.badge)}</text>`
          : '';
      return `<g>
      <circle cx="${point.x}" cy="${point.y}" r="9" fill="${fill}" stroke="#fff" stroke-width="1.5"><title>${escapeHtml(point.id)}</title></circle>
      <text x="${point.x}" y="${point.y + 22}" font-size="9" text-anchor="middle" fill="#555">${escapeHtml(point.id)}</text>
      ${badge}
    </g>`;
    })
    .join('\n    ');

  return `<svg viewBox="0 0 ${layout.width} ${layout.height}" width="${layout.width}" height="${layout.height}" role="img" aria-label="Graphe de l'article">
    <defs>
      <marker id="arrow" viewBox="0 0 10 10" refX="16" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#9aa7b5"/>
      </marker>
    </defs>
    <circle cx="${layout.hub.x}" cy="${layout.hub.y}" r="13" fill="#333"/>
    <text x="${layout.hub.x}" y="${layout.hub.y + 4}" font-size="9" text-anchor="middle" fill="#fff">HUB</text>
    ${edges}
    ${nodes}
  </svg>`;
}

export function pageTemplate(title: string, body: string): string {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font-family: system-ui, sans-serif; margin: 0; padding: 2rem; background: #fafafa; color: #222; line-height: 1.5; }
  main { max-width: 1100px; margin: 0 auto; }
  h1 { font-size: 1.5rem; } h2 { font-size: 1.15rem; margin-top: 2rem; }
  table { border-collapse: collapse; width: 100%; font-size: .9rem; background: #fff; }
  th, td { border: 1px solid #ddd; padding: .5rem .6rem; text-align: left; vertical-align: top; }
  th { background: #f0f2f5; }
  .graph { background: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 1rem; overflow-x: auto; }
  .legend span { display: inline-block; margin-right: 1rem; font-size: .85rem; }
  .dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: .3rem; }
  .ok { color: #2e7d32; } .warn { color: #b26a00; } .bad { color: #c62828; }
  .muted { color: #777; font-size: .85rem; }
  code { background: #eef1f4; padding: .1rem .3rem; border-radius: 3px; font-size: .85em; }
  .flag { background: #fff7e6; border-left: 3px solid #b26a00; padding: .3rem .6rem; margin: .3rem 0; font-size: .85rem; }
</style>
</head>
<body>
<main>
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
