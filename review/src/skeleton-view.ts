import { computeLayout, type Skeleton } from '@criticalthinker/schema';
import {
  escapeHtml,
  fittedLayoutOptions,
  maxNodesPerPillar,
  pageTemplate,
  pillarLegend,
  renderGraphSvg,
  renderInlineMarkup,
  renderTiles,
  skeletonToGraphShape,
} from './html.js';

/**
 * Vue G1 (SPEC §9.1) : le squelette — graphe visuel + tableau des nœuds.
 * Zéro prose : l'éditeur juge la topologie, les questions et les axes.
 */
export function generateSkeletonView(skeleton: Skeleton): string {
  const shape = skeletonToGraphShape(skeleton);
  const layout = computeLayout(shape, fittedLayoutOptions(maxNodesPerPillar(skeleton.nodes)));
  const pillarIds = skeleton.hub.pillars.map((pillar) => pillar.id);
  const pillarOf = (nodeId: string) => shape.nodes.find((node) => node.id === nodeId)?.pillar ?? '';

  const edgeCount = skeleton.nodes
    .flatMap((node) => node.cardinalities)
    .filter((cardinality) => cardinality.target_node_id !== null).length;
  const leafCount = skeleton.nodes
    .flatMap((node) => node.cardinalities)
    .filter((cardinality) => cardinality.target_node_id === null).length;

  const rows = skeleton.nodes
    .map((node) => {
      const axes = node.cardinalities
        .map((cardinality) =>
          cardinality.target_node_id === null
            ? `<li>${escapeHtml(cardinality.label)} <span class="muted">· feuille</span></li>`
            : `<li>${escapeHtml(cardinality.label)} <span class="muted">→</span> <code>${cardinality.target_node_id}</code></li>`,
        )
        .join('');
      return `<tr>
        <td><code>${node.id}</code><br><span class="keyword">${escapeHtml(node.keyword)}</span></td>
        <td>${escapeHtml(node.question)}</td>
        <td><ul class="axis-list">${axes}</ul></td>
      </tr>`;
    })
    .join('\n');

  const body = `
<h1>Squelette — ${escapeHtml(skeleton.title)}</h1>
<p class="lede">La prose n'existe pas encore : c'est le moment le moins cher pour corriger la structure.
À relire — la topologie, les questions de friction, la distinction des axes.</p>

${renderTiles([
  { value: String(skeleton.hub.pillars.length), label: 'piliers' },
  { value: String(skeleton.nodes.length), label: 'nœuds' },
  { value: String(edgeCount), label: 'liens récursifs' },
  { value: String(leafCount), label: 'feuilles terminales' },
])}

<h2>Graphe</h2>
${pillarLegend(skeleton.hub.pillars)}
<div class="card graph">${renderGraphSvg(layout, pillarIds, pillarOf)}</div>

<h2>Hub</h2>
<div class="card">
  <p style="margin:0">${renderInlineMarkup(skeleton.hub.text_md)}</p>
  <p class="muted" style="margin:.8rem 0 0">Intention de synthèse : ${escapeHtml(skeleton.synthesis_intent)}</p>
</div>

<h2>Nœuds</h2>
<div class="tablewrap">
<table>
  <thead><tr><th style="width:22%">Nœud</th><th style="width:38%">Question de friction</th><th>Axes (cardinalités)</th></tr></thead>
  <tbody>
${rows}
  </tbody>
</table>
</div>`;

  return pageTemplate(`G1 — ${skeleton.title}`, 'Porte G1 · revue du squelette', body);
}
