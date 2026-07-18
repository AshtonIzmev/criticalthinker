import { describe, expect, it } from 'vitest';
import {
  computeMetrics,
  deserializeState,
  emptyState,
  isSynthesisUnlocked,
  openNode,
  readCardinality,
  serializeState,
  traverseEdge,
} from '../src/island-core.js';

const totals = {
  totalCardinalities: 10,
  totalPillars: 2,
  pillarOf: {
    A1: 'PIL_A',
    A2: 'PIL_A',
    B1: 'PIL_B',
  },
};

describe('état de parcours', () => {
  it('ouvre un nœud une seule fois', () => {
    let state = emptyState();
    state = openNode(state, 'A1');
    state = openNode(state, 'A1');
    expect(state.opened).toEqual(['A1']);
  });

  it('enregistre cardinalités lues et arêtes traversées sans doublon', () => {
    let state = emptyState();
    state = readCardinality(state, 'A1', 0);
    state = readCardinality(state, 'A1', 0);
    state = traverseEdge(state, 'A1', 'B1');
    state = traverseEdge(state, 'A1', 'B1');
    expect(state.read).toEqual(['A1:0']);
    expect(state.edges).toEqual(['A1→B1']);
  });

  it('sérialise et désérialise sans perte, et survit aux données corrompues', () => {
    let state = emptyState();
    state = openNode(state, 'A1');
    state = readCardinality(state, 'A1', 1);
    expect(deserializeState(serializeState(state))).toEqual(state);
    expect(deserializeState(null)).toEqual(emptyState());
    expect(deserializeState('{pas du json')).toEqual(emptyState());
  });
});

describe('computeMetrics — curiosité, pas seulement complétion', () => {
  it('couverture = cardinalités lues / total', () => {
    let state = emptyState();
    state = readCardinality(state, 'A1', 0);
    state = readCardinality(state, 'B1', 0);
    expect(computeMetrics(state, totals).coverage).toBeCloseTo(0.2);
  });

  it('diversité = piliers explorés / total', () => {
    let state = emptyState();
    state = openNode(state, 'A1');
    state = openNode(state, 'A2'); // même pilier : ne change rien
    expect(computeMetrics(state, totals).diversity).toBeCloseTo(0.5);
    state = openNode(state, 'B1');
    expect(computeMetrics(state, totals).diversity).toBeCloseTo(1);
  });

  it('contradiction = nœuds dont ≥ 2 axes sont lus', () => {
    let state = emptyState();
    state = readCardinality(state, 'A1', 0);
    expect(computeMetrics(state, totals).contradiction).toBe(0);
    state = readCardinality(state, 'A1', 1);
    expect(computeMetrics(state, totals).contradiction).toBe(1);
  });
});

describe('isSynthesisUnlocked', () => {
  it('exige couverture ET diversité', () => {
    const unlock = { min_coverage: 0.6, min_pillar_diversity: 1 };
    expect(isSynthesisUnlocked({ coverage: 0.7, diversity: 0.5, contradiction: 0 }, unlock)).toBe(
      false,
    );
    expect(isSynthesisUnlocked({ coverage: 0.5, diversity: 1, contradiction: 0 }, unlock)).toBe(
      false,
    );
    expect(isSynthesisUnlocked({ coverage: 0.6, diversity: 1, contradiction: 0 }, unlock)).toBe(
      true,
    );
  });
});
