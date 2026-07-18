import type { GraphArticle } from './graph-article.js';
import { collectEdges, type Edge } from './graph-utils.js';

/**
 * Diff structurel entre deux versions d'un graph.json (SPEC §9.3).
 * Compare au niveau du graphe — nœuds, arêtes, textes, sources — pas au
 * niveau des lignes de JSON. Consommé par review/diff-view.
 */

export interface NodeChange {
  id: string;
  /** Champs modifiés, en notation pointée (ex: 'summary.text', 'cardinalities[1].text_md'). */
  changedFields: string[];
}

export interface GraphDiff {
  nodesAdded: string[];
  nodesRemoved: string[];
  nodesChanged: NodeChange[];
  edgesAdded: Edge[];
  edgesRemoved: Edge[];
  sourcesAdded: string[];
  sourcesRemoved: string[];
  sourcesChanged: string[];
  hubChanged: boolean;
  synthesisChanged: boolean;
  /** true si aucune différence. */
  identical: boolean;
}

export function diffGraphs(before: GraphArticle, after: GraphArticle): GraphDiff {
  const beforeNodes = new Map(before.nodes.map((node) => [node.id, node]));
  const afterNodes = new Map(after.nodes.map((node) => [node.id, node]));

  const nodesAdded = [...afterNodes.keys()].filter((id) => !beforeNodes.has(id));
  const nodesRemoved = [...beforeNodes.keys()].filter((id) => !afterNodes.has(id));

  const nodesChanged: NodeChange[] = [];
  for (const [id, beforeNode] of beforeNodes) {
    const afterNode = afterNodes.get(id);
    if (afterNode === undefined) continue;
    const changedFields: string[] = [];
    compareValue(beforeNode.keyword, afterNode.keyword, 'keyword', changedFields);
    compareValue(beforeNode.question, afterNode.question, 'question', changedFields);
    compareValue(beforeNode.pillar, afterNode.pillar, 'pillar', changedFields);
    compareValue(beforeNode.summary.text, afterNode.summary.text, 'summary.text', changedFields);
    compareValue(
      [...beforeNode.summary.source_ids].sort().join(','),
      [...afterNode.summary.source_ids].sort().join(','),
      'summary.source_ids',
      changedFields,
    );
    const maxCardinalities = Math.max(
      beforeNode.cardinalities.length,
      afterNode.cardinalities.length,
    );
    for (let index = 0; index < maxCardinalities; index++) {
      const beforeCardinality = beforeNode.cardinalities[index];
      const afterCardinality = afterNode.cardinalities[index];
      if (beforeCardinality === undefined || afterCardinality === undefined) {
        changedFields.push(`cardinalities[${index}]`);
        continue;
      }
      compareValue(
        beforeCardinality.label,
        afterCardinality.label,
        `cardinalities[${index}].label`,
        changedFields,
      );
      compareValue(
        beforeCardinality.text_md,
        afterCardinality.text_md,
        `cardinalities[${index}].text_md`,
        changedFields,
      );
      compareValue(
        beforeCardinality.target_node_id,
        afterCardinality.target_node_id,
        `cardinalities[${index}].target_node_id`,
        changedFields,
      );
    }
    if (changedFields.length > 0) nodesChanged.push({ id, changedFields });
  }

  const beforeEdges = collectEdges(before);
  const afterEdges = collectEdges(after);
  const edgeKey = (edge: Edge) => `${edge.from ?? 'hub'}→${edge.to}`;
  const beforeEdgeKeys = new Set(beforeEdges.map(edgeKey));
  const afterEdgeKeys = new Set(afterEdges.map(edgeKey));
  const edgesAdded = afterEdges.filter((edge) => !beforeEdgeKeys.has(edgeKey(edge)));
  const edgesRemoved = beforeEdges.filter((edge) => !afterEdgeKeys.has(edgeKey(edge)));

  const beforeSources = new Map(before.sources.map((source) => [source.id, source]));
  const afterSources = new Map(after.sources.map((source) => [source.id, source]));
  const sourcesAdded = [...afterSources.keys()].filter((id) => !beforeSources.has(id));
  const sourcesRemoved = [...beforeSources.keys()].filter((id) => !afterSources.has(id));
  const sourcesChanged = [...beforeSources.keys()].filter((id) => {
    const afterSource = afterSources.get(id);
    return (
      afterSource !== undefined &&
      JSON.stringify(beforeSources.get(id)) !== JSON.stringify(afterSource)
    );
  });

  const hubChanged = JSON.stringify(before.article.hub) !== JSON.stringify(after.article.hub);
  const synthesisChanged =
    JSON.stringify(before.article.synthesis) !== JSON.stringify(after.article.synthesis);

  const identical =
    nodesAdded.length === 0 &&
    nodesRemoved.length === 0 &&
    nodesChanged.length === 0 &&
    edgesAdded.length === 0 &&
    edgesRemoved.length === 0 &&
    sourcesAdded.length === 0 &&
    sourcesRemoved.length === 0 &&
    sourcesChanged.length === 0 &&
    !hubChanged &&
    !synthesisChanged;

  return {
    nodesAdded,
    nodesRemoved,
    nodesChanged,
    edgesAdded,
    edgesRemoved,
    sourcesAdded,
    sourcesRemoved,
    sourcesChanged,
    hubChanged,
    synthesisChanged,
    identical,
  };
}

function compareValue(
  before: string | null,
  after: string | null,
  field: string,
  out: string[],
): void {
  if (before !== after) out.push(field);
}
