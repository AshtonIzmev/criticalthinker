/**
 * Logique pure de l'island (SPEC §8.2-B, §8.3) — aucune dépendance DOM,
 * testable en isolation. L'island (island.ts) n'est que la couche
 * événements/classes CSS au-dessus de ces fonctions.
 */

export interface TraversalState {
  /** Nœuds ouverts (question + résumé affichés). */
  opened: string[];
  /** Cardinalités dépliées, encodées "NODE_ID:index". */
  read: string[];
  /** Arêtes traversées, encodées "FROM→TO". */
  edges: string[];
}

export interface ArticleTotals {
  totalCardinalities: number;
  totalPillars: number;
  /** nodeId → pillarId */
  pillarOf: Record<string, string>;
}

export interface Metrics {
  /** Cardinalités lues / total (0..1). */
  coverage: number;
  /** Piliers dont ≥ 1 nœud est ouvert / total (0..1). */
  diversity: number;
  /** Nombre de nœuds dont ≥ 2 cardinalités sont lues. */
  contradiction: number;
}

export function emptyState(): TraversalState {
  return { opened: [], read: [], edges: [] };
}

export function openNode(state: TraversalState, nodeId: string): TraversalState {
  if (state.opened.includes(nodeId)) return state;
  return { ...state, opened: [...state.opened, nodeId] };
}

export function readCardinality(
  state: TraversalState,
  nodeId: string,
  index: number,
): TraversalState {
  const key = `${nodeId}:${index}`;
  if (state.read.includes(key)) return state;
  return { ...state, read: [...state.read, key] };
}

export function traverseEdge(state: TraversalState, from: string, to: string): TraversalState {
  const key = `${from}→${to}`;
  if (state.edges.includes(key)) return state;
  return { ...state, edges: [...state.edges, key] };
}

export function computeMetrics(state: TraversalState, totals: ArticleTotals): Metrics {
  const coverage =
    totals.totalCardinalities === 0 ? 0 : state.read.length / totals.totalCardinalities;

  const pillarsVisited = new Set(
    state.opened
      .map((nodeId) => totals.pillarOf[nodeId])
      .filter((pillar): pillar is string => pillar !== undefined),
  );
  const diversity = totals.totalPillars === 0 ? 0 : pillarsVisited.size / totals.totalPillars;

  const readPerNode = new Map<string, number>();
  for (const key of state.read) {
    const nodeId = key.slice(0, key.lastIndexOf(':'));
    readPerNode.set(nodeId, (readPerNode.get(nodeId) ?? 0) + 1);
  }
  const contradiction = [...readPerNode.values()].filter((count) => count >= 2).length;

  return { coverage, diversity, contradiction };
}

export interface UnlockThresholds {
  min_coverage: number;
  min_pillar_diversity: number;
}

export function isSynthesisUnlocked(metrics: Metrics, unlock: UnlockThresholds): boolean {
  return (
    metrics.coverage >= unlock.min_coverage && metrics.diversity >= unlock.min_pillar_diversity
  );
}

export function serializeState(state: TraversalState): string {
  return JSON.stringify(state);
}

export function deserializeState(raw: string | null): TraversalState {
  if (raw === null) return emptyState();
  try {
    const parsed = JSON.parse(raw) as Partial<TraversalState>;
    return {
      opened: Array.isArray(parsed.opened) ? parsed.opened : [],
      read: Array.isArray(parsed.read) ? parsed.read : [],
      edges: Array.isArray(parsed.edges) ? parsed.edges : [],
    };
  } catch {
    return emptyState();
  }
}
