import type { GraphArticle, GraphNode } from './graph-article.js';

/** Un lien inline [[texte affiché|NODE_ID]] (micro-syntaxe, SPEC §4.3). */
export interface InlineLink {
  label: string;
  nodeId: string;
}

const INLINE_LINK_RE = /\[\[([^|\]]+)\|([^\]]+)\]\]/g;

/** Extrait les liens [[texte|NODE_ID]] d'un texte markdown. */
export function parseInlineLinks(text: string): InlineLink[] {
  const links: InlineLink[] = [];
  for (const match of text.matchAll(INLINE_LINK_RE)) {
    links.push({ label: (match[1] ?? '').trim(), nodeId: (match[2] ?? '').trim() });
  }
  return links;
}

/** Une arête orientée du graphe. `from === null` désigne le hub. */
export interface Edge {
  from: string | null;
  to: string;
  /** Index de la cardinalité d'origine (absent pour les arêtes du hub). */
  cardinalityIndex?: number;
}

/** Toutes les arêtes déclarées : liens du hub + target_node_id des cardinalités. */
export function collectEdges(graph: GraphArticle): Edge[] {
  const edges: Edge[] = parseInlineLinks(graph.article.hub.text_md).map((link) => ({
    from: null,
    to: link.nodeId,
  }));
  for (const node of graph.nodes) {
    node.cardinalities.forEach((cardinality, index) => {
      if (cardinality.target_node_id !== null) {
        edges.push({ from: node.id, to: cardinality.target_node_id, cardinalityIndex: index });
      }
    });
  }
  return edges;
}

/** Ensemble des nœuds atteignables depuis le hub en suivant les arêtes. */
export function reachableFromHub(graph: GraphArticle): Set<string> {
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const adjacency = new Map<string, string[]>();
  const queue: string[] = [];
  for (const edge of collectEdges(graph)) {
    if (!nodeIds.has(edge.to)) continue;
    if (edge.from === null) {
      queue.push(edge.to);
    } else {
      const targets = adjacency.get(edge.from) ?? [];
      targets.push(edge.to);
      adjacency.set(edge.from, targets);
    }
  }
  const visited = new Set<string>();
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined || visited.has(current)) continue;
    visited.add(current);
    for (const next of adjacency.get(current) ?? []) {
      if (!visited.has(next)) queue.push(next);
    }
  }
  return visited;
}

/** Degré entrant de chaque nœud (les liens du hub comptent). */
export function inDegrees(graph: GraphArticle): Map<string, number> {
  const degrees = new Map<string, number>(graph.nodes.map((node) => [node.id, 0]));
  for (const edge of collectEdges(graph)) {
    const current = degrees.get(edge.to);
    if (current !== undefined) degrees.set(edge.to, current + 1);
  }
  return degrees;
}

/** Nœuds groupés par pilier, dans l'ordre de déclaration des piliers. */
export function nodesByPillar(graph: GraphArticle): Map<string, GraphNode[]> {
  const groups = new Map<string, GraphNode[]>(
    graph.article.hub.pillars.map((pillar) => [pillar.id, []]),
  );
  for (const node of graph.nodes) {
    groups.get(node.pillar)?.push(node);
  }
  return groups;
}

/**
 * Compte les phrases d'un texte (règle 2 : résumé = exactement 2 phrases).
 * Heuristique : séquences terminées par . ! ? ou …, en ignorant les
 * abréviations usuelles et les nombres décimaux.
 */
export function countSentences(text: string): number {
  const cleaned = text
    .trim()
    // protège les nombres décimaux (3.5 → 3_5)
    .replace(/(\d)\.(\d)/g, '$1_$2')
    // protège quelques abréviations fréquentes fr/en
    .replace(/\b(etc|cf|ex|p|M|Mme|Dr|vs|e\.g|i\.e)\./gi, '$1_');
  const matches = cleaned.match(/[^.!?…]+[.!?…]+(?:\s|$)/g);
  if (matches) return matches.length;
  return cleaned.length > 0 ? 1 : 0;
}
