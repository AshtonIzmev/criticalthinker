import { describe, expect, it } from 'vitest';
import {
  collectEdges,
  countSentences,
  inDegrees,
  parseInlineLinks,
  reachableFromHub,
} from '../src/index.js';
import { makeValidGraph } from './fixtures.js';

describe('parseInlineLinks', () => {
  it('extrait les liens [[texte|ID]]', () => {
    const links = parseInlineLinks('Avant [[le concept|PIL_A_N01]] et [[autre|PIL_B_N02]].');
    expect(links).toEqual([
      { label: 'le concept', nodeId: 'PIL_A_N01' },
      { label: 'autre', nodeId: 'PIL_B_N02' },
    ]);
  });

  it('retourne un tableau vide sans lien', () => {
    expect(parseInlineLinks('Aucun lien, même avec [des crochets] simples.')).toEqual([]);
  });
});

describe('collectEdges / reachableFromHub / inDegrees', () => {
  it('collecte les arêtes du hub et des cardinalités', () => {
    const graph = makeValidGraph();
    const edges = collectEdges(graph);
    const hubEdges = edges.filter((edge) => edge.from === null);
    expect(hubEdges).toHaveLength(3); // une entrée par pilier dans la fixture
    expect(edges.length).toBe(3 + graph.nodes.length); // + un lien récursif par nœud
  });

  it('atteint tous les nœuds de la fixture depuis le hub', () => {
    const graph = makeValidGraph();
    expect(reachableFromHub(graph).size).toBe(graph.nodes.length);
  });

  it('calcule les degrés entrants', () => {
    const graph = makeValidGraph();
    const degrees = inDegrees(graph);
    // chaque nœud est ciblé par son prédécesseur ; les entrées de hub s'ajoutent
    for (const node of graph.nodes) {
      expect(degrees.get(node.id)).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('countSentences', () => {
  it('compte deux phrases simples', () => {
    expect(countSentences('Première phrase. Seconde phrase.')).toBe(2);
  });

  it('gère ! ? et …', () => {
    expect(countSentences('Vraiment ? Oui ! Enfin…')).toBe(3);
  });

  it('ignore les nombres décimaux', () => {
    expect(countSentences('Le taux atteint 3.5 pour cent. Il progresse.')).toBe(2);
  });

  it('ignore les abréviations usuelles', () => {
    expect(countSentences('Voir les travaux de M. Durand sur le sujet. Ils datent de 2020.')).toBe(
      2,
    );
  });

  it('compte 1 pour un texte sans ponctuation finale', () => {
    expect(countSentences('Un fragment sans point')).toBe(1);
  });
});
