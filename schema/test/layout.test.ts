import { describe, expect, it } from 'vitest';
import { computeLayout } from '../src/index.js';
import { makeValidGraph } from './fixtures.js';

describe('computeLayout', () => {
  it('est déterministe : même graphe, mêmes coordonnées', () => {
    const graph = makeValidGraph();
    expect(computeLayout(graph)).toEqual(computeLayout(graph));
  });

  it('place tous les nœuds dans le canevas', () => {
    const layout = computeLayout(makeValidGraph());
    expect(layout.nodes).toHaveLength(15);
    for (const point of layout.nodes) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(layout.width);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(layout.height);
    }
  });

  it('ne superpose pas deux nœuds', () => {
    const layout = computeLayout(makeValidGraph());
    const seen = new Set<string>();
    for (const point of layout.nodes) {
      const key = `${point.x},${point.y}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('produit une arête positionnée par arête du graphe', () => {
    const graph = makeValidGraph();
    const layout = computeLayout(graph);
    expect(layout.edges.length).toBe(3 + graph.nodes.length);
    const hubEdge = layout.edges.find((edge) => edge.from === null);
    expect(hubEdge?.x1).toBe(layout.hub.x);
    expect(hubEdge?.y1).toBe(layout.hub.y);
  });
});
