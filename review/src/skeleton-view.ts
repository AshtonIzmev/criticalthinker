import { computeLayout, type Skeleton } from '@criticalthinker/schema';
import {
  escapeHtml,
  pageTemplate,
  pillarColor,
  renderGraphSvg,
  skeletonToGraphShape,
} from './html.js';

/**
 * Vue G1 (SPEC §9.1) : le squelette — graphe visuel + tableau des nœuds.
 * Zéro prose : l'éditeur juge la topologie, les questions et les axes.
 */
export function generateSkeletonView(skeleton: Skeleton): string {
  const shape = skeletonToGraphShape(skeleton);
  const layout = computeLayout(shape);
  const pillarIds = skeleton.hub.pillars.map((pillar) => pillar.id);
  const pillarOf = (nodeId: string) => shape.nodes.find((node) => node.id === nodeId)?.pillar ?? '';

  const legend = skeleton.hub.pillars
    .map(
      (pillar) =>
        `<span><span class="dot" style="background:${pillarColor(pillarIds, pillar.id)}"></span>${escapeHtml(pillar.label)} (<code>${pillar.id}</code>)</span>`,
    )
    .join('');

  const edgeCount = skeleton.nodes
    .flatMap((node) => node.cardinalities)
    .filter((cardinality) => cardinality.target_node_id !== null).length;

  const rows = skeleton.nodes
    .map((node) => {
      const axes = node.cardinalities
        .map((cardinality) =>
          cardinality.target_node_id === null
            ? `${escapeHtml(cardinality.label)} <span class="muted">(feuille)</span>`
            : `${escapeHtml(cardinality.label)} → <code>${cardinality.target_node_id}</code>`,
        )
        .join('<br>');
      return `<tr>
        <td><code>${node.id}</code></td>
        <td><code>${node.pillar}</code></td>
        <td>${escapeHtml(node.keyword)}</td>
        <td>${escapeHtml(node.question)}</td>
        <td>${axes}</td>
      </tr>`;
    })
    .join('\n');

  const body = `
<h1>Porte G1 — Squelette : ${escapeHtml(skeleton.title)}</h1>
<p class="muted">${skeleton.hub.pillars.length} piliers · ${skeleton.nodes.length} nœuds · ${edgeCount} liens récursifs.
À relire : la topologie, les questions, les axes. La prose n'existe pas encore — c'est le moment le moins cher pour corriger la structure.</p>

<h2>Hub</h2>
<p>${escapeHtml(skeleton.hub.text_md)}</p>
<p class="muted">Intention de synthèse : ${escapeHtml(skeleton.synthesis_intent)}</p>

<h2>Graphe</h2>
<div class="legend">${legend}</div>
<div class="graph">${renderGraphSvg(layout, pillarIds, pillarOf)}</div>

<h2>Nœuds</h2>
<table>
  <thead><tr><th>Id</th><th>Pilier</th><th>Mot-clé</th><th>Question de friction</th><th>Axes (cardinalités)</th></tr></thead>
  <tbody>
${rows}
  </tbody>
</table>`;

  return pageTemplate(`G1 — ${skeleton.title}`, body);
}
