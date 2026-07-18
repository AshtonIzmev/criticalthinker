import type { Skeleton } from '@criticalthinker/schema';
import { diffGraphs } from '@criticalthinker/schema';
import { describe, expect, it } from 'vitest';
import { cloneGraph, makeValidGraph } from '../../schema/test/fixtures.js';
import { generateDiffView } from '../src/diff-view.js';
import { generateReviewSheet } from '../src/review-sheet.js';
import { generateSkeletonView } from '../src/skeleton-view.js';

function makeSkeleton(): Skeleton {
  const graph = makeValidGraph();
  return {
    title: graph.article.title,
    hub: graph.article.hub,
    synthesis_intent: 'Faire ressortir le gris.',
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      pillar: node.pillar,
      keyword: node.keyword,
      question: node.question,
      cardinalities: node.cardinalities.map((cardinality) => ({
        label: cardinality.label,
        target_node_id: cardinality.target_node_id,
      })),
    })),
  };
}

describe('generateSkeletonView (G1)', () => {
  it('rend le graphe et le tableau des nœuds, sans prose', () => {
    const html = generateSkeletonView(makeSkeleton());
    expect(html).toContain('Porte G1');
    expect(html).toContain('PIL_A_N01');
    expect(html).toContain('Question de friction');
    expect(html).toContain('<svg');
    expect(html).not.toContain('à rédiger)</td>'); // les textes factices ne fuient pas dans le tableau
  });
});

describe('generateReviewSheet (G2)', () => {
  it('affiche les feux tricolores et les sources avec verdicts', () => {
    const graph = makeValidGraph();
    const html = generateReviewSheet(graph);
    expect(html).toContain('Porte G2');
    expect(html).toContain('[supported]');
    expect(html).toContain('✓ sourcé');
    expect(html).toContain('aucun</span>'); // pas de flags ouverts
  });

  it('trie les nœuds à arbitrer en tête', () => {
    const graph = cloneGraph(makeValidGraph());
    const lastNode = graph.nodes[graph.nodes.length - 1];
    if (!lastNode) throw new Error('fixture vide');
    lastNode.provenance.critic_flags_open.push('Objection non résolue.');
    const html = generateReviewSheet(graph);
    const flaggedIndex = html.indexOf(`<code>${lastNode.id}</code>`);
    const firstCleanIndex = html.indexOf('<code>PIL_A_N01</code>', html.indexOf('<tbody>'));
    expect(flaggedIndex).toBeGreaterThan(-1);
    expect(flaggedIndex).toBeLessThan(firstCleanIndex);
    expect(html).toContain('Objection non résolue.');
  });
});

describe('generateDiffView', () => {
  it('signale l’absence de différence', () => {
    const graph = makeValidGraph();
    const html = generateDiffView(diffGraphs(graph, cloneGraph(graph)), 'Diff test');
    expect(html).toContain('Aucune différence');
  });

  it('liste les champs modifiés', () => {
    const before = makeValidGraph();
    const after = cloneGraph(before);
    const node = after.nodes[0];
    if (!node) throw new Error('fixture vide');
    node.question = 'Nouvelle question ?';
    const html = generateDiffView(diffGraphs(before, after), 'Diff test');
    expect(html).toContain('question');
    expect(html).toContain(node.id);
  });
});
