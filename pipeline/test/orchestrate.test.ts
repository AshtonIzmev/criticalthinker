import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Skeleton } from '@criticalthinker/schema';
import { describe, expect, it } from 'vitest';
import type { StructuredCaller } from '../src/llm/structured.js';
import {
  type PipelineDeps,
  runCritiquePhase,
  runJudgePhase,
  runSkeletonPhase,
  runSourcePhase,
  runValidatePhase,
  runWritePhase,
  splitSentences,
} from '../src/orchestrate.js';
import { ArticleStore } from '../src/store.js';

/**
 * Test d'intégration du pipeline complet, toutes dépendances mockées :
 * seed → squelette → rédaction → sourçage → jugement → critique → validation.
 * Aucun appel réseau ni LLM — on vérifie l'orchestration, pas les modèles.
 */

function makeSkeleton(): Skeleton {
  const pillarIds = ['PIL_A', 'PIL_B', 'PIL_C'];
  const nodes: Skeleton['nodes'] = [];
  const allIds: string[] = [];
  for (const pillarId of pillarIds) {
    for (let i = 1; i <= 5; i++) allIds.push(`${pillarId}_N0${i}`);
  }
  allIds.forEach((id, index) => {
    const pillarId = pillarIds[Math.floor(index / 5)] as string;
    const nextId = allIds[(index + 1) % allIds.length] as string;
    nodes.push({
      id,
      pillar: pillarId,
      keyword: `concept-${index + 1}`,
      question: `Question de friction ${index + 1} ?`,
      cardinalities: [
        { label: 'Axe structurel', target_node_id: nextId },
        { label: 'Axe individuel', target_node_id: null },
      ],
    });
  });
  return {
    title: 'Article de test',
    hub: {
      text_md:
        'Intro avec [[entrée A|PIL_A_N01]], [[entrée B|PIL_B_N01]] et [[entrée C|PIL_C_N01]].',
      pillars: pillarIds.map((id, i) => ({ id, label: `Pilier ${i + 1}` })),
    },
    synthesis_intent: 'Faire ressortir les tensions.',
    nodes,
  };
}

function makeMockCaller(skeleton: Skeleton): StructuredCaller {
  return (async (request: { schemaName: string; user: string }) => {
    switch (request.schemaName) {
      case 'skeleton':
        return skeleton;
      case 'written_node': {
        const idMatch = /"id": "(PIL_[A-Z]_N\d+)"/.exec(request.user);
        const node = skeleton.nodes.find((n) => n.id === idMatch?.[1]);
        if (!node) throw new Error(`nœud introuvable dans le prompt : ${idMatch?.[1]}`);
        return {
          id: node.id,
          summary_text: `Fait vérifiable sur ${node.keyword}. Second fait chiffré.`,
          cardinalities: node.cardinalities.map((c) => ({
            label: c.label,
            text_md:
              c.target_node_id === null
                ? 'Perspective terminale sans lien.'
                : `Perspective qui renvoie vers [[la suite|${c.target_node_id}]].`,
            target_node_id: c.target_node_id,
          })),
        };
      }
      case 'sourcer_choice':
        return {
          chosen_index: 0,
          supporting_quote: 'Passage soutenant le fait.',
          publisher: 'Example Press',
          language: 'en',
          confidence: 'high',
        };
      case 'judge_verdict':
        return { verdict: 'supported', rationale: 'La source soutient l’affirmation.' };
      case 'critic_report':
        return { findings: [] };
      case 'synthesis_text':
        return { text_md: 'La synthèse du gris.' };
      default:
        throw new Error(`schéma inattendu : ${request.schemaName}`);
    }
    // biome-ignore lint/suspicious/noExplicitAny: mock volontairement lâche
  }) as any;
}

function makeDeps(): { deps: PipelineDeps; store: ArticleStore } {
  const store = new ArticleStore(mkdtempSync(join(tmpdir(), 'ct-pipeline-')));
  const skeleton = makeSkeleton();
  const deps: PipelineDeps = {
    call: makeMockCaller(skeleton),
    search: {
      search: async () => [
        { url: 'https://example.org/etude', title: 'Étude', snippet: 'extrait' },
      ],
    },
    retrieve: async (url) => ({
      url,
      title: 'Étude',
      text: `Texte intégral de la source. ${'Contenu détaillé. '.repeat(20)}`,
    }),
    store,
    language: 'fr',
    candidatesPerClaim: 2,
    criticMaxIterations: 3,
    log: () => {},
  };
  return { deps, store };
}

describe('pipeline de bout en bout (mocké)', () => {
  it('produit un graphe valide depuis un seed', async () => {
    const { deps, store } = makeDeps();
    store.init('test-article');
    writeFileSync(store.seedPath('test-article'), 'Un sujet de test complet.');
    store.createVersion('test-article');

    // Passe 1 — squelette (porte G1)
    const skeleton = await runSkeletonPhase(deps, 'test-article');
    expect(skeleton.nodes).toHaveLength(15);
    expect(store.readSkeleton('test-article').title).toBe('Article de test');

    // Passe 2 — rédaction
    const draft = await runWritePhase(deps, 'test-article');
    expect(draft.nodes).toHaveLength(15);
    expect(draft.nodes.every((n) => !n.provenance.passes.sourced)).toBe(true);

    // Passe 3 — sourçage (2 affirmations par nœud → 30 sources en attente)
    const sourcing = await runSourcePhase(deps, 'test-article');
    expect(sourcing.pending).toHaveLength(30);
    expect(sourcing.unsourced).toHaveLength(0);

    // Passe 3b — jugement
    const judged = await runJudgePhase(deps, 'test-article');
    expect(judged.sources).toHaveLength(30);
    expect(judged.nodes.every((n) => n.provenance.passes.sourced)).toBe(true);

    // Passe 4 — critique (aucune objection dans ce mock) + synthèse
    const outcome = await runCritiquePhase(deps, 'test-article');
    expect(outcome.needsResourcing).toHaveLength(0);
    const critiqued = store.readGraph('test-article');
    expect(critiqued.article.synthesis.text_md).toBe('La synthèse du gris.');
    expect(critiqued.nodes.every((n) => n.provenance.passes.critiqued)).toBe(true);

    // Passe 5 — validation mécanique : le graphe complet est publiable
    const result = runValidatePhase(deps, 'test-article');
    expect(result.findings.filter((f) => f.severity === 'error')).toEqual([]);
    expect(result.ok).toBe(true);
    const final = store.readGraph('test-article');
    expect(final.nodes.every((n) => n.provenance.passes.validated)).toBe(true);
  });

  it('sourçage ciblé : --nodes ne touche que les nœuds demandés', async () => {
    const { deps, store } = makeDeps();
    store.init('cible');
    writeFileSync(store.seedPath('cible'), 'Un sujet.');
    store.createVersion('cible');
    await runSkeletonPhase(deps, 'cible');
    await runWritePhase(deps, 'cible');

    const sourcing = await runSourcePhase(deps, 'cible', ['PIL_A_N01']);
    expect(sourcing.pending.every((p) => p.node_id === 'PIL_A_N01')).toBe(true);
    expect(sourcing.pending).toHaveLength(2);
  });

  it('affirmation non sourçable → flag bloquant sur le nœud', async () => {
    const { deps, store } = makeDeps();
    deps.search = { search: async () => [] }; // la recherche ne trouve rien
    store.init('sec');
    writeFileSync(store.seedPath('sec'), 'Un sujet.');
    store.createVersion('sec');
    await runSkeletonPhase(deps, 'sec');
    await runWritePhase(deps, 'sec');

    const sourcing = await runSourcePhase(deps, 'sec', ['PIL_A_N01']);
    expect(sourcing.unsourced).toHaveLength(2);
    const graph = store.readGraph('sec');
    const node = graph.nodes.find((n) => n.id === 'PIL_A_N01');
    expect(node?.provenance.critic_flags_open.length).toBe(2);
  });
});

describe('splitSentences', () => {
  it('découpe en deux phrases et restaure les points protégés', () => {
    const claims = splitSentences('Le taux atteint 3.5 pour cent. Il progresse depuis 2020.');
    expect(claims).toEqual(['Le taux atteint 3.5 pour cent.', 'Il progresse depuis 2020.']);
  });

  it('gère les abréviations', () => {
    const claims = splitSentences('Les travaux de M. Durand font référence. Ils datent de 2019.');
    expect(claims).toHaveLength(2);
    expect(claims[0]).toContain('M. Durand');
  });
});
