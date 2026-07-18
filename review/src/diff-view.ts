import type { GraphDiff } from '@criticalthinker/schema';
import { escapeHtml, pageTemplate } from './html.js';

/**
 * Vue diff (SPEC §9.3) : différences structurelles entre deux versions —
 * nœuds, arêtes, textes, sources — pas un diff textuel de JSON.
 */
export function generateDiffView(diff: GraphDiff, title: string): string {
  if (diff.identical) {
    return pageTemplate(title, `<h1>${escapeHtml(title)}</h1><p class="ok">Aucune différence.</p>`);
  }

  const list = (items: string[], cssClass: string): string =>
    items.length === 0
      ? '<p class="muted">aucun</p>'
      : `<ul>${items.map((item) => `<li class="${cssClass}"><code>${escapeHtml(item)}</code></li>`).join('')}</ul>`;

  const changedRows = diff.nodesChanged
    .map(
      (change) =>
        `<tr><td><code>${change.id}</code></td><td>${change.changedFields
          .map((field) => `<code>${escapeHtml(field)}</code>`)
          .join(', ')}</td></tr>`,
    )
    .join('\n');

  const edges = (edges: GraphDiff['edgesAdded'], cssClass: string): string =>
    edges.length === 0
      ? '<p class="muted">aucune</p>'
      : `<ul>${edges
          .map(
            (edge) =>
              `<li class="${cssClass}"><code>${edge.from ?? 'HUB'}</code> → <code>${edge.to}</code></li>`,
          )
          .join('')}</ul>`;

  const body = `
<h1>${escapeHtml(title)}</h1>
${diff.hubChanged ? '<p class="warn">Le hub a été modifié.</p>' : ''}
${diff.synthesisChanged ? '<p class="warn">La synthèse a été modifiée.</p>' : ''}

<h2>Nœuds ajoutés</h2>${list(diff.nodesAdded, 'ok')}
<h2>Nœuds supprimés</h2>${list(diff.nodesRemoved, 'bad')}

<h2>Nœuds modifiés</h2>
${
  diff.nodesChanged.length === 0
    ? '<p class="muted">aucun</p>'
    : `<table><thead><tr><th>Nœud</th><th>Champs modifiés</th></tr></thead><tbody>${changedRows}</tbody></table>`
}

<h2>Arêtes ajoutées</h2>${edges(diff.edgesAdded, 'ok')}
<h2>Arêtes supprimées</h2>${edges(diff.edgesRemoved, 'bad')}

<h2>Sources</h2>
<p>Ajoutées : ${diff.sourcesAdded.length} · Supprimées : ${diff.sourcesRemoved.length} · Modifiées : ${diff.sourcesChanged.length}</p>
${list([...diff.sourcesAdded, ...diff.sourcesRemoved, ...diff.sourcesChanged], 'muted')}`;

  return pageTemplate(title, body);
}
