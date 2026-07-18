/**
 * Rendu build-time des textes du graphe (composant Astro).
 * La micro-syntaxe [[texte|NODE_ID]] devient un lien-ancre #NODE_ID —
 * navigation par hash : le bouton retour du navigateur fonctionne,
 * chaque nœud est partageable en lien profond (SPEC §8.1).
 */

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

const INLINE_LINK_RE = /\[\[([^|\]]+)\|([^\]]+)\]\]/g;

/** Échappe le HTML puis transforme les [[liens]] en ancres cliquables. */
export function renderRichText(text: string): string {
  const escaped = escapeHtml(text);
  return escaped.replace(
    INLINE_LINK_RE,
    (_match, label: string, nodeId: string) =>
      `<a class="ct-keyword" href="#${escapeHtml(nodeId.trim())}" data-node="${escapeHtml(nodeId.trim())}">${label.trim()}</a>`,
  );
}

/** Paragraphes séparés par des lignes vides → <p>. */
export function renderParagraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${renderRichText(paragraph.trim())}</p>`)
    .join('\n');
}
