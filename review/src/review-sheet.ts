import { computeLayout, type Finding, type GraphArticle } from '@criticalthinker/schema';
import { escapeHtml, type NodeStatus, pageTemplate, pillarColor, renderGraphSvg } from './html.js';

/**
 * Fiche G2 (SPEC §9.2) : feux tricolores par nœud, objections survivantes,
 * verdicts partial à arbitrer, nœuds triés par priorité d'audit
 * (confiance faible et flags d'abord). L'éditeur ne relit pas la prose :
 * il audite l'auditeur.
 */
export function generateReviewSheet(graph: GraphArticle, findings: Finding[] = []): string {
  const pillarIds = graph.article.hub.pillars.map((pillar) => pillar.id);
  const sourcesById = new Map(graph.sources.map((source) => [source.id, source]));
  const layout = computeLayout(graph);

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

  const statuses = new Map<string, NodeStatus>(
    graph.nodes.map((node) => {
      const score = auditPriority(node.id);
      const status: NodeStatus =
        score >= 8
          ? { fill: '#c62828', badge: '⚠' }
          : score > 0
            ? { fill: '#b26a00', badge: '•' }
            : { fill: '#2e7d32', badge: '✓' };
      return [node.id, status];
    }),
  );

  const sortedNodes = [...graph.nodes].sort((a, b) => auditPriority(b.id) - auditPriority(a.id));

  const rows = sortedNodes
    .map((node) => {
      const { passes } = node.provenance;
      const lights = [
        passes.sourced ? '<span class="ok">✓ sourcé</span>' : '<span class="bad">✗ sourçage</span>',
        passes.critiqued
          ? '<span class="ok">✓ critiqué</span>'
          : '<span class="warn">… critique</span>',
        node.provenance.revisions > 0
          ? `<span class="warn">↻ ${node.provenance.revisions} révision(s)</span>`
          : '<span class="muted">—</span>',
      ].join('<br>');

      const sources = node.summary.source_ids
        .map((sourceId) => {
          const source = sourcesById.get(sourceId);
          if (source === undefined) return `<span class="bad">${sourceId} manquante</span>`;
          const verdictClass =
            source.verification.verdict === 'supported'
              ? 'ok'
              : source.verification.verdict === 'partial'
                ? 'warn'
                : 'bad';
          return `<a href="${escapeHtml(source.url)}">${escapeHtml(source.title)}</a>
            <span class="${verdictClass}">[${source.verification.verdict}]</span>
            <span class="muted">(${source.confidence})</span><br>
            <span class="muted">« ${escapeHtml(source.supporting_quote)} »</span>`;
        })
        .join('<hr style="border:none;border-top:1px solid #eee">');

      const flags = node.provenance.critic_flags_open
        .map((flag) => `<div class="flag">${escapeHtml(flag)}</div>`)
        .join('');

      return `<tr>
        <td><code>${node.id}</code><br><strong>${escapeHtml(node.keyword)}</strong></td>
        <td>${lights}</td>
        <td>${escapeHtml(node.summary.text)}</td>
        <td>${sources !== '' ? sources : '<span class="bad">aucune source</span>'}</td>
        <td>${flags !== '' ? flags : '<span class="muted">aucun</span>'}</td>
      </tr>`;
    })
    .join('\n');

  const validationSection =
    findings.length === 0
      ? '<p class="ok">Validation mécanique : aucune erreur.</p>'
      : `<ul>${findings
          .map(
            (finding) =>
              `<li class="${finding.severity === 'error' ? 'bad' : 'warn'}">[${finding.rule}] <code>${escapeHtml(finding.where ?? '')}</code> ${escapeHtml(finding.message)}</li>`,
          )
          .join('\n')}</ul>`;

  const partialCount = graph.sources.filter(
    (source) => source.verification.verdict === 'partial',
  ).length;
  const openFlags = graph.nodes.reduce(
    (total, node) => total + node.provenance.critic_flags_open.length,
    0,
  );

  const body = `
<h1>Porte G2 — Fiche de revue : ${escapeHtml(graph.article.title)}</h1>
<p class="muted">${graph.nodes.length} nœuds · ${graph.sources.length} sources · ${partialCount} verdict(s) « partial » à arbitrer · ${openFlags} flag(s) ouvert(s).
Les nœuds sont triés par priorité d'audit — commence par le haut.</p>

<h2>Graphe</h2>
<div class="legend">
  <span><span class="dot" style="background:#2e7d32"></span>rien à signaler</span>
  <span><span class="dot" style="background:#b26a00"></span>à regarder</span>
  <span><span class="dot" style="background:#c62828"></span>arbitrage requis</span>
</div>
<div class="graph">${renderGraphSvg(
    layout,
    pillarIds,
    (nodeId) => graph.nodes.find((n) => n.id === nodeId)?.pillar ?? pillarIds[0] ?? '',
    statuses,
  )}</div>

<h2>Validation mécanique</h2>
${validationSection}

<h2>Nœuds (par priorité d'audit)</h2>
<table>
  <thead><tr><th>Nœud</th><th>Statut</th><th>Base empirique</th><th>Sources &amp; verdicts</th><th>Flags ouverts</th></tr></thead>
  <tbody>
${rows}
  </tbody>
</table>

<h2>Synthèse</h2>
<p>${escapeHtml(graph.article.synthesis.text_md)}</p>`;

  return pageTemplate(`G2 — ${graph.article.title}`, body);
}
