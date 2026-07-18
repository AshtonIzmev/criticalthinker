import type { GraphDiff } from '@criticalthinker/schema';
import { escapeHtml, pageTemplate, renderTiles, statusChip, type Tile } from './html.js';

/**
 * Vue diff (SPEC §9.3) : différences structurelles entre deux versions —
 * nœuds, arêtes, textes, sources — pas un diff textuel de JSON.
 */
export function generateDiffView(diff: GraphDiff, title: string): string {
  if (diff.identical) {
    return pageTemplate(
      title,
      'Diff structurel',
      `<h1>${escapeHtml(title)}</h1><p class="ok-note">✓ Aucune différence entre les deux versions.</p>`,
    );
  }

  const idList = (items: string[]): string =>
    items.length === 0
      ? '<p class="muted" style="margin:.3rem 0">aucun</p>'
      : `<p style="margin:.3rem 0">${items.map((item) => `<code>${escapeHtml(item)}</code>`).join(' ')}</p>`;

  const changedRows = diff.nodesChanged
    .map(
      (change) =>
        `<tr><td><code>${change.id}</code></td><td>${change.changedFields
          .map((field) => `<code>${escapeHtml(field)}</code>`)
          .join(' ')}</td></tr>`,
    )
    .join('\n');

  const edgeList = (edges: GraphDiff['edgesAdded']): string =>
    edges.length === 0
      ? '<p class="muted" style="margin:.3rem 0">aucune</p>'
      : `<p style="margin:.3rem 0">${edges
          .map((edge) => `<code>${edge.from ?? 'HUB'} → ${edge.to}</code>`)
          .join(' ')}</p>`;

  const tiles: Tile[] = [
    {
      value: `+${diff.nodesAdded.length} / −${diff.nodesRemoved.length}`,
      label: 'nœuds ajoutés / supprimés',
    },
    { value: String(diff.nodesChanged.length), label: 'nœuds modifiés' },
    {
      value: `+${diff.edgesAdded.length} / −${diff.edgesRemoved.length}`,
      label: 'arêtes ajoutées / supprimées',
    },
    {
      value: `+${diff.sourcesAdded.length} / ~${diff.sourcesChanged.length} / −${diff.sourcesRemoved.length}`,
      label: 'sources',
    },
  ];

  const body = `
<h1>${escapeHtml(title)}</h1>
${renderTiles(tiles)}
${diff.hubChanged ? `<p>${statusChip('warning', 'le hub a été modifié')}</p>` : ''}
${diff.synthesisChanged ? `<p>${statusChip('warning', 'la synthèse a été modifiée')}</p>` : ''}

<h2>Nœuds</h2>
<div class="card">
  <p class="muted" style="margin:0">Ajoutés</p>${idList(diff.nodesAdded)}
  <p class="muted" style="margin:.8rem 0 0">Supprimés</p>${idList(diff.nodesRemoved)}
</div>

<h2>Nœuds modifiés</h2>
${
  diff.nodesChanged.length === 0
    ? '<div class="card"><p class="muted" style="margin:0">aucun</p></div>'
    : `<div class="tablewrap"><table>
        <thead><tr><th style="width:25%">Nœud</th><th>Champs modifiés</th></tr></thead>
        <tbody>${changedRows}</tbody>
      </table></div>`
}

<h2>Arêtes</h2>
<div class="card">
  <p class="muted" style="margin:0">Ajoutées</p>${edgeList(diff.edgesAdded)}
  <p class="muted" style="margin:.8rem 0 0">Supprimées</p>${edgeList(diff.edgesRemoved)}
</div>

<h2>Sources</h2>
<div class="card">
  <p class="muted" style="margin:0">Ajoutées</p>${idList(diff.sourcesAdded)}
  <p class="muted" style="margin:.8rem 0 0">Modifiées</p>${idList(diff.sourcesChanged)}
  <p class="muted" style="margin:.8rem 0 0">Supprimées</p>${idList(diff.sourcesRemoved)}
</div>`;

  return pageTemplate(title, 'Diff structurel', body);
}
