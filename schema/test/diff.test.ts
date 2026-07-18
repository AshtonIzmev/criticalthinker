import { describe, expect, it } from 'vitest';
import { diffGraphs } from '../src/index.js';
import { cloneGraph, makeValidGraph } from './fixtures.js';

describe('diffGraphs', () => {
  it('déclare identiques deux graphes égaux', () => {
    const graph = makeValidGraph();
    expect(diffGraphs(graph, cloneGraph(graph)).identical).toBe(true);
  });

  it('détecte un nœud ajouté et retiré', () => {
    const before = makeValidGraph();
    const after = cloneGraph(before);
    const removed = after.nodes.pop();
    if (!removed) throw new Error('fixture vide');
    const added = { ...cloneGraph(before).nodes[0], id: 'PIL_A_N99' };
    // biome-ignore lint/suspicious/noExplicitAny: fixture de test
    after.nodes.push(added as any);

    const diff = diffGraphs(before, after);
    expect(diff.nodesRemoved).toEqual([removed.id]);
    expect(diff.nodesAdded).toEqual(['PIL_A_N99']);
    expect(diff.identical).toBe(false);
  });

  it('détecte un champ modifié avec sa localisation', () => {
    const before = makeValidGraph();
    const after = cloneGraph(before);
    const node = after.nodes[0];
    if (!node) throw new Error('fixture vide');
    node.summary.text = 'Nouvelle première phrase. Nouvelle seconde phrase.';
    const cardinality = node.cardinalities[1];
    if (!cardinality) throw new Error('fixture vide');
    cardinality.label = 'Axe renommé';

    const diff = diffGraphs(before, after);
    expect(diff.nodesChanged).toHaveLength(1);
    expect(diff.nodesChanged[0]?.changedFields).toContain('summary.text');
    expect(diff.nodesChanged[0]?.changedFields).toContain('cardinalities[1].label');
  });

  it('détecte les arêtes ajoutées/retirées', () => {
    const before = makeValidGraph();
    const after = cloneGraph(before);
    const cardinality = after.nodes[0]?.cardinalities[0];
    if (!cardinality) throw new Error('fixture vide');
    const oldTarget = cardinality.target_node_id;
    const newTarget = after.nodes[3]?.id;
    if (!oldTarget || !newTarget) throw new Error('fixture vide');
    cardinality.target_node_id = newTarget;
    cardinality.text_md = `Renvoi vers [[ailleurs|${newTarget}]].`;

    const diff = diffGraphs(before, after);
    expect(diff.edgesRemoved.map((e) => e.to)).toContain(oldTarget);
    expect(diff.edgesAdded.map((e) => e.to)).toContain(newTarget);
  });

  it('détecte une source modifiée', () => {
    const before = makeValidGraph();
    const after = cloneGraph(before);
    const source = after.sources[0];
    if (!source) throw new Error('fixture vide');
    source.confidence = 'medium';
    const diff = diffGraphs(before, after);
    expect(diff.sourcesChanged).toEqual([source.id]);
  });

  it('détecte un changement de hub et de synthèse', () => {
    const before = makeValidGraph();
    const after = cloneGraph(before);
    after.article.hub.text_md += ' Ajout.';
    after.article.synthesis.text_md = 'Autre synthèse.';
    const diff = diffGraphs(before, after);
    expect(diff.hubChanged).toBe(true);
    expect(diff.synthesisChanged).toBe(true);
  });
});
