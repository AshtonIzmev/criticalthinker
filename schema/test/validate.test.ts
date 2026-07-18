import { describe, expect, it } from 'vitest';
import { validateGraphArticle } from '../src/index.js';
import { cloneGraph, makeValidGraph } from './fixtures.js';

const cacheAlwaysThere = { sourceCacheExists: () => true };

function errorRules(input: unknown, options = cacheAlwaysThere): string[] {
  const result = validateGraphArticle(input, options);
  return result.findings.filter((f) => f.severity === 'error').map((f) => f.rule);
}

describe('validateGraphArticle', () => {
  it('accepte un graphe valide sans erreur', () => {
    const result = validateGraphArticle(makeValidGraph(), cacheAlwaysThere);
    expect(result.findings.filter((f) => f.severity === 'error')).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.graph).not.toBeNull();
  });

  it('R1 — rejette un document non conforme au schéma', () => {
    const result = validateGraphArticle({ schema_version: '1.0' });
    expect(result.ok).toBe(false);
    expect(result.graph).toBeNull();
    expect(result.findings.every((f) => f.rule === 'R1')).toBe(true);
  });

  it('R2 — rejette un résumé qui ne fait pas exactement deux phrases', () => {
    const graph = cloneGraph(makeValidGraph());
    const node = graph.nodes[0];
    if (!node) throw new Error('fixture vide');
    node.summary.text = 'Une seule phrase.';
    expect(errorRules(graph)).toContain('R2');

    node.summary.text = 'Une. Deux. Trois.';
    expect(errorRules(graph)).toContain('R2');
  });

  it('R3 — rejette un graphe trop petit', () => {
    const graph = cloneGraph(makeValidGraph());
    graph.nodes = graph.nodes.slice(0, 10);
    const rules = errorRules(graph);
    expect(rules).toContain('R3');
  });

  it('R3 — accepte un brouillon hors bornes quand sizeLimits est désactivé', () => {
    const graph = cloneGraph(makeValidGraph());
    // on retire le pilier C entier (nœuds + entrées de hub + arêtes vers lui)
    graph.nodes = graph.nodes.filter((node) => node.pillar !== 'PIL_C');
    graph.article.hub.pillars = graph.article.hub.pillars.filter((p) => p.id !== 'PIL_C');
    graph.article.hub.text_md = 'Intro avec [[entrée 1|PIL_A_N01]] et [[entrée 2|PIL_B_N01]].';
    for (const node of graph.nodes) {
      for (const cardinality of node.cardinalities) {
        if (cardinality.target_node_id?.startsWith('PIL_C')) {
          cardinality.target_node_id = 'PIL_A_N01';
          cardinality.text_md = 'Renvoi vers [[le début|PIL_A_N01]].';
        }
      }
    }
    const withLimits = validateGraphArticle(graph, cacheAlwaysThere);
    expect(withLimits.ok).toBe(false);
    const withoutLimits = validateGraphArticle(graph, { ...cacheAlwaysThere, sizeLimits: false });
    expect(withoutLimits.findings.filter((f) => f.rule === 'R3')).toEqual([]);
  });

  it('R4 — détecte un lien pendant', () => {
    const graph = cloneGraph(makeValidGraph());
    const cardinality = graph.nodes[0]?.cardinalities[0];
    if (!cardinality) throw new Error('fixture vide');
    cardinality.target_node_id = 'PIL_Z_N99';
    cardinality.text_md = 'Renvoi vers [[nulle part|PIL_Z_N99]].';
    expect(errorRules(graph)).toContain('R4');
  });

  it('R5/R6 — détecte un nœud injoignable et orphelin', () => {
    const graph = cloneGraph(makeValidGraph());
    // casse la boucle : le nœud 2 n'est plus référencé par personne
    const first = graph.nodes[0]?.cardinalities[0];
    if (!first) throw new Error('fixture vide');
    const skipTo = graph.nodes[2]?.id;
    if (!skipTo) throw new Error('fixture vide');
    first.target_node_id = skipTo;
    first.text_md = `Renvoi vers [[plus loin|${skipTo}]].`;
    const rules = errorRules(graph);
    expect(rules).toContain('R5');
    expect(rules).toContain('R6');
  });

  it('R7 — détecte l’incohérence lien inline / target_node_id', () => {
    const graph = cloneGraph(makeValidGraph());
    const cardinality = graph.nodes[0]?.cardinalities[0];
    if (!cardinality) throw new Error('fixture vide');
    cardinality.text_md = 'Aucun lien inline ici.';
    expect(errorRules(graph)).toContain('R7');
  });

  it('R7 — détecte plusieurs liens dans une cardinalité', () => {
    const graph = cloneGraph(makeValidGraph());
    const cardinality = graph.nodes[0]?.cardinalities[0];
    if (!cardinality?.target_node_id) throw new Error('fixture vide');
    cardinality.text_md = `[[un|${cardinality.target_node_id}]] et [[deux|PIL_B_N01]].`;
    expect(errorRules(graph)).toContain('R7');
  });

  it('R8 — détecte une collision de mots-clés (insensible à la casse)', () => {
    const graph = cloneGraph(makeValidGraph());
    const [a, b] = graph.nodes;
    if (!a || !b) throw new Error('fixture vide');
    a.keyword = 'Concept';
    b.keyword = 'concept';
    expect(errorRules(graph)).toContain('R8');
  });

  it('R9 — détecte une auto-boucle', () => {
    const graph = cloneGraph(makeValidGraph());
    const node = graph.nodes[0];
    const cardinality = node?.cardinalities[0];
    if (!node || !cardinality) throw new Error('fixture vide');
    cardinality.target_node_id = node.id;
    cardinality.text_md = `Renvoi vers [[soi-même|${node.id}]].`;
    expect(errorRules(graph)).toContain('R9');
  });

  it('R10 — rejette un résumé sans source', () => {
    const graph = cloneGraph(makeValidGraph());
    const node = graph.nodes[0];
    if (!node) throw new Error('fixture vide');
    node.summary.source_ids = [];
    expect(errorRules(graph)).toContain('R10');
  });

  it('R11 — rejette une archive absente, avertit sans résolveur', () => {
    const graph = makeValidGraph();
    const missing = validateGraphArticle(graph, { sourceCacheExists: () => false });
    expect(missing.findings.some((f) => f.rule === 'R11' && f.severity === 'error')).toBe(true);

    const unchecked = validateGraphArticle(graph);
    expect(unchecked.findings.some((f) => f.rule === 'R11' && f.severity === 'warning')).toBe(true);
    expect(unchecked.ok).toBe(true); // avertissement, pas blocage
  });

  it('R12 — avertit sur une source orpheline', () => {
    const graph = cloneGraph(makeValidGraph());
    const source = graph.sources[0];
    if (!source) throw new Error('fixture vide');
    graph.sources.push({ ...source, id: 'SRC_99' });
    const result = validateGraphArticle(graph, cacheAlwaysThere);
    expect(result.findings.some((f) => f.rule === 'R12' && f.where === 'SRC_99')).toBe(true);
    expect(result.ok).toBe(true);
  });

  it('R12b — bloque un verdict partial ou unsupported', () => {
    const graph = cloneGraph(makeValidGraph());
    const source = graph.sources[0];
    if (!source) throw new Error('fixture vide');
    source.verification.verdict = 'partial';
    expect(errorRules(graph)).toContain('R12b');
    source.verification.verdict = 'unsupported';
    expect(errorRules(graph)).toContain('R12b');
  });

  it('R13 — bloque des passes incomplètes ou des flags critiques ouverts', () => {
    const graph = cloneGraph(makeValidGraph());
    const node = graph.nodes[0];
    if (!node) throw new Error('fixture vide');
    node.provenance.passes.critiqued = false;
    expect(errorRules(graph)).toContain('R13');

    node.provenance.passes.critiqued = true;
    node.provenance.critic_flags_open = ['axe 1 et 3 se recouvrent'];
    expect(errorRules(graph)).toContain('R13');
  });
});
