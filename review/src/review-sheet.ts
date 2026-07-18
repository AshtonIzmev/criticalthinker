import { computeLayout, type Finding, type GraphArticle } from '@criticalthinker/schema';
import {
  escapeHtml,
  fittedLayoutOptions,
  maxNodesPerPillar,
  type NodeStatus,
  pageTemplate,
  pillarLegend,
  renderGraphSvg,
  renderTiles,
  type StatusKind,
  statusChip,
  type Tile,
} from './html.js';

/**
 * Fiche G2 (SPEC §9.2) : feux tricolores par nœud, objections survivantes,
 * verdicts partial à arbitrer, nœuds triés par priorité d'audit
 * (confiance faible et flags d'abord). L'éditeur ne relit pas la prose :
 * il audite l'auditeur.
 */
export function generateReviewSheet(graph: GraphArticle, findings: Finding[] = []): string {
  const pillarIds = graph.article.hub.pillars.map((pillar) => pillar.id);
  const sourcesById = new Map(graph.sources.map((source) => [source.id, source]));
  const layout = computeLayout(graph, fittedLayoutOptions(maxNodesPerPillar(graph.nodes)));

  const auditPriority = (nodeId: string): number => {
    const node = graph.nodes.find((n) => n.id === nodeId);
    if (node === undefined) return 0;
    let score = 0;
    score += node.provenance.critic_flags_open.length * 10;
    for (const sourceId of node.summary.source_ids) {
      const source = sourcesById.get(sourceId);
      if (source?.verification.verdict === 'partial') score += 8;
      if (source?.confidence === 'medium') score += 3;
    }
    if (!node.provenance.passes.sourced) score += 15;
    return score;
  };

  const statusOf = (nodeId: string): StatusKind => {
    const score = auditPriority(nodeId);
    return score >= 8 ? 'critical' : score > 0 ? 'warning' : 'good';
  };

  const statuses = new Map<string, NodeStatus>(
    graph.nodes.map((node) => {
      const status = statusOf(node.id);
      const badge = status === 'critical' ? '⚠' : status === 'warning' ? '!' : undefined;
      return [node.id, badge !== undefined ? { status, badge } : { status }];
    }),
  );

  const sortedNodes = [...graph.nodes].sort((a, b) => auditPriority(b.id) - auditPriority(a.id));

  const rows = sortedNodes
    .map((node) => {
      const { passes } = node.provenance;
      const lights = [
        statusChip(
          passes.sourced ? 'good' : 'critical',
          passes.sourced ? 'sourcé' : 'sourçage incomplet',
        ),
        statusChip(
          passes.critiqued ? 'good' : 'warning',
          passes.critiqued ? 'critiqué' : 'critique en attente',
        ),
        node.provenance.revisions > 0
          ? statusChip('warning', `révisé ×${node.provenance.revisions}`)
          : '',
      ]
        .filter((chip) => chip !== '')
        .join('');

      const sources = node.summary.source_ids
        .map((sourceId) => {
          const source = sourcesById.get(sourceId);
          if (source === undefined) return `${statusChip('critical', `${sourceId} manquante`)}`;
          return `<div>
            <a href="${escapeHtml(source.url)}">${escapeHtml(source.title)}</a>
            <span class="muted">· ${escapeHtml(source.publisher)}</span><br>
            <span class="verdict verdict-${source.verification.verdict}">[${source.verification.verdict}]</span>
            <span class="muted">confiance ${source.confidence}</span>
            <blockquote class="quote">«&nbsp;${escapeHtml(source.supporting_quote)}&nbsp;»</blockquote>
          </div>`;
        })
        .join('');

      const flags = node.provenance.critic_flags_open
        .map((flag) => `<div class="flag">${escapeHtml(flag)}</div>`)
        .join('');

      return `<tr>
        <td>
          <div class="status-lines">
            ${statusChip(statusOf(node.id))}
            <span><code>${node.id}</code></span>
            <span class="keyword">${escapeHtml(node.keyword)}</span>
          </div>
        </td>
        <td><div class="status-lines">${lights}</div></td>
        <td>${escapeHtml(node.summary.text)}
          ${flags !== '' ? flags : ''}
        </td>
        <td>${sources !== '' ? sources : statusChip('critical', 'aucune source')}</td>
      </tr>`;
    })
    .join('\n');

  const errorCount = findings.filter((finding) => finding.severity === 'error').length;
  const validationSection =
    findings.length === 0
      ? '<p class="ok-note">✓ Validation mécanique : aucune erreur.</p>'
      : `<ul class="findings">${findings
          .map(
            (finding) =>
              `<li>${statusChip(finding.severity === 'error' ? 'critical' : 'warning', finding.rule)} <code>${escapeHtml(finding.where ?? '')}</code> ${escapeHtml(finding.message)}</li>`,
          )
          .join('\n')}</ul>`;

  const partialCount = graph.sources.filter(
    (source) => source.verification.verdict === 'partial',
  ).length;
  const openFlags = graph.nodes.reduce(
    (total, node) => total + node.provenance.critic_flags_open.length,
    0,
  );

  const tiles: Tile[] = [
    { value: String(graph.nodes.length), label: 'nœuds' },
    { value: String(graph.sources.length), label: 'sources' },
    {
      value: String(partialCount),
      label: 'verdicts « partial »',
      ...(partialCount > 0 ? { status: 'warning' as const } : {}),
    },
    {
      value: String(openFlags),
      label: 'flags ouverts',
      ...(openFlags > 0 ? { status: 'critical' as const } : {}),
    },
    {
      value: String(errorCount),
      label: 'erreurs de validation',
      status: errorCount > 0 ? ('critical' as const) : ('good' as const),
    },
  ];

  const body = `
<h1>Fiche de revue — ${escapeHtml(graph.article.title)}</h1>
<p class="lede">Tu n'as pas à relire la prose : audite l'auditeur. Les nœuds sont triés par priorité
d'audit — commence par le haut, les verdicts «&nbsp;partial&nbsp;» et les flags d'abord.</p>

${renderTiles(tiles)}

<h2>Graphe — statut éditorial</h2>
<div class="legend">
  <span class="legend-item">${statusChip('good')}</span>
  <span class="legend-item">${statusChip('warning')}</span>
  <span class="legend-item">${statusChip('critical')}</span>
</div>
<div class="card graph">${renderGraphSvg(
    layout,
    pillarIds,
    (nodeId) => graph.nodes.find((n) => n.id === nodeId)?.pillar ?? pillarIds[0] ?? '',
    statuses,
  )}</div>
${pillarLegend(graph.article.hub.pillars)}

<h2>Validation mécanique</h2>
<div class="card">${validationSection}</div>

<h2>Nœuds — par priorité d'audit</h2>
<div class="tablewrap">
<table>
  <thead><tr><th style="width:16%">Nœud</th><th style="width:16%">Passes</th><th style="width:34%">Base empirique &amp; flags</th><th>Sources &amp; verdicts</th></tr></thead>
  <tbody>
${rows}
  </tbody>
</table>
</div>

<h2>Synthèse</h2>
<div class="card"><p style="margin:0">${escapeHtml(graph.article.synthesis.text_md)}</p></div>`;

  return pageTemplate(`G2 — ${graph.article.title}`, 'Porte G2 · fiche de revue', body);
}
