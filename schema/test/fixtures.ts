import type { Cardinality, GraphArticle, GraphNode, Source } from '../src/index.js';

/**
 * Génère un graph.json valide pour les tests : 3 piliers × 5 nœuds,
 * chaque nœud lié au suivant (boucle), tous liés depuis le hub,
 * une source « supported » par nœud.
 */
export function makeValidGraph(): GraphArticle {
  const pillarIds = ['PIL_A', 'PIL_B', 'PIL_C'];
  const nodes: GraphNode[] = [];
  const sources: Source[] = [];
  const nodeIds: string[] = [];

  for (const pillarId of pillarIds) {
    for (let nodeIndex = 1; nodeIndex <= 5; nodeIndex++) {
      nodeIds.push(`${pillarId}_N0${nodeIndex}`);
    }
  }

  nodeIds.forEach((nodeId, index) => {
    const pillarId = pillarIds[Math.floor(index / 5)] as string;
    const nextId = nodeIds[(index + 1) % nodeIds.length] as string;
    const sourceId = `SRC_${String(index + 1).padStart(2, '0')}`;

    const cardinalities: Cardinality[] = [
      {
        label: 'Axe structurel',
        text_md: `Analyse structurelle qui renvoie vers [[le concept suivant|${nextId}]].`,
        target_node_id: nextId,
      },
      {
        label: 'Axe individuel',
        text_md: 'Analyse individuelle, feuille terminale.',
        target_node_id: null,
      },
    ];

    nodes.push({
      id: nodeId,
      pillar: pillarId,
      keyword: `concept-${index + 1}`,
      question: `Quelle friction soulève le concept ${index + 1} ?`,
      summary: {
        text: `Première phrase factuelle du nœud ${index + 1}. Seconde phrase factuelle sourcée.`,
        source_ids: [sourceId],
      },
      cardinalities,
      provenance: {
        written_by: 'writer',
        revisions: 0,
        passes: { sourced: true, critiqued: true, validated: true },
        critic_flags_open: [],
      },
    });

    sources.push({
      id: sourceId,
      url: `https://example.org/source-${index + 1}`,
      title: `Source ${index + 1}`,
      publisher: 'Example Press',
      accessed: '2026-07-18',
      language: 'en',
      claim: `Affirmation factuelle du nœud ${index + 1}.`,
      supporting_quote: `Passage soutenant l'affirmation ${index + 1}.`,
      cache_ref: `sources-cache/${sourceId}.txt`,
      confidence: 'high',
      verification: {
        verdict: 'supported',
        method: 'llm-judge',
        rationale: 'Le passage soutient directement l’affirmation.',
        judged_by: 'verifier-judge',
      },
    });
  });

  const hubLinks = nodeIds
    .filter((_, index) => index % 5 === 0)
    .map((nodeId, index) => `[[entrée ${index + 1}|${nodeId}]]`)
    .join(' puis ');

  return {
    schema_version: '2.0',
    article: {
      id: 'article-de-test',
      title: 'Article de test',
      language: 'fr',
      graph_version: 1,
      created: '2026-07-18',
      seed: 'Un sujet de test.',
      hub: {
        text_md: `Introduction du sujet, avec ${hubLinks}.`,
        pillars: pillarIds.map((id, index) => ({ id, label: `Pilier ${index + 1}` })),
      },
      synthesis: {
        unlock: { min_coverage: 0.6, min_pillar_diversity: 1.0 },
        text_md: 'La synthèse du gris.',
      },
    },
    nodes,
    sources,
  };
}

/** Clone profond pour muter une copie dans les tests. */
export function cloneGraph(graph: GraphArticle): GraphArticle {
  return structuredClone(graph);
}
