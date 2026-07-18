import {
  type CriticFinding,
  type GraphArticle,
  type GraphNode,
  type Skeleton,
  type Source,
  type ValidationResult,
  validateGraphArticle,
  type WrittenNode,
} from '@criticalthinker/schema';
import { runArchitect } from './agents/architect.js';
import { runCritic } from './agents/critic.js';
import { judgeSource } from './agents/judge.js';
import { buildSearchQuery, chooseSource } from './agents/sourcer.js';
import { reviseNode, writeNode, writeSynthesis } from './agents/writer.js';
import type { StructuredCaller } from './llm/structured.js';
import type { RetrievedPage, Retriever } from './retrieve/retrieve.js';
import type { SearchProvider } from './search/provider.js';
import type { ArticleStore } from './store.js';

/**
 * Orchestration des passes (SPEC §5). Du code TS ordinaire, délibérément :
 * boucles bornées, portée de nœud, rapports sur disque à chaque étape.
 * Toutes les dépendances (LLM, recherche, récupération, disque) sont
 * injectées — testable avec des mocks, remplaçable sans réécriture.
 */

export interface PipelineDeps {
  call: StructuredCaller;
  search: SearchProvider;
  retrieve: Retriever;
  store: ArticleStore;
  language: string;
  candidatesPerClaim: number;
  criticMaxIterations: number;
  log: (message: string) => void;
}

const SYNTHESIS_PLACEHOLDER = 'Synthèse à générer une fois le graphe stabilisé.';
const DEFAULT_UNLOCK = { min_coverage: 0.6, min_pillar_diversity: 1.0 };

// ---------------------------------------------------------------------------
// Passe 1 — ARCHITECTE (→ porte G1)
// ---------------------------------------------------------------------------

export async function runSkeletonPhase(deps: PipelineDeps, slug: string): Promise<Skeleton> {
  const seed = deps.store.readSeed(slug);
  deps.log(`Architecte : génération du squelette pour « ${slug} »…`);
  const skeleton = await runArchitect(deps.call, seed, deps.language);
  const path = deps.store.writeSkeleton(slug, skeleton);
  deps.store.writeReport(slug, 'skeleton', {
    pillars: skeleton.hub.pillars.length,
    nodes: skeleton.nodes.length,
    edges: skeleton.nodes.flatMap((n) => n.cardinalities).filter((c) => c.target_node_id !== null)
      .length,
  });
  deps.log(`Squelette écrit : ${path} — à relire (porte G1) avant ct write.`);
  return skeleton;
}

// ---------------------------------------------------------------------------
// Passe 2 — RÉDACTEUR
// ---------------------------------------------------------------------------

export async function runWritePhase(
  deps: PipelineDeps,
  slug: string,
  nodeIds?: string[],
): Promise<GraphArticle> {
  const skeleton = deps.store.readSkeleton(slug);
  const existing = tryReadGraph(deps.store, slug);
  const targets = skeleton.nodes.filter(
    (node) => nodeIds === undefined || nodeIds.includes(node.id),
  );
  if (targets.length === 0) throw new Error('Aucun nœud à rédiger (ids inconnus ?)');

  const written: WrittenNode[] = [];
  for (const node of targets) {
    deps.log(`Rédacteur : ${node.id} (${node.keyword})…`);
    const result = await writeNode(deps.call, skeleton, node, deps.language);
    assertTargetsMatch(node.id, skeleton, result);
    written.push(result);
  }

  const graph = assembleGraph(deps, slug, skeleton, written, existing);
  deps.store.writeGraph(slug, graph);
  deps.store.writeReport(slug, 'write', {
    written: written.map((w) => w.id),
    scope: nodeIds ?? 'all',
  });
  deps.log(`${written.length} nœud(s) rédigé(s).`);
  return graph;
}

function assembleGraph(
  deps: PipelineDeps,
  slug: string,
  skeleton: Skeleton,
  written: WrittenNode[],
  existing: GraphArticle | null,
): GraphArticle {
  const writtenById = new Map(written.map((w) => [w.id, w]));
  const existingById = new Map(existing?.nodes.map((n) => [n.id, n]) ?? []);

  const nodes: GraphNode[] = skeleton.nodes.map((skeletonNode) => {
    const fresh = writtenById.get(skeletonNode.id);
    if (fresh !== undefined) {
      const previous = existingById.get(skeletonNode.id);
      return {
        id: skeletonNode.id,
        pillar: skeletonNode.pillar,
        keyword: skeletonNode.keyword,
        question: skeletonNode.question,
        summary: { text: fresh.summary_text, source_ids: [] },
        cardinalities: fresh.cardinalities,
        provenance: {
          written_by: 'writer',
          revisions: previous !== undefined ? previous.provenance.revisions + 1 : 0,
          passes: { sourced: false, critiqued: false, validated: false },
          critic_flags_open: [],
        },
      };
    }
    const kept = existingById.get(skeletonNode.id);
    if (kept === undefined) {
      throw new Error(`Nœud ${skeletonNode.id} ni rédigé ni présent dans le graphe existant`);
    }
    return kept;
  });

  const keptSourceIds = new Set(nodes.flatMap((n) => n.summary.source_ids));

  return {
    schema_version: '2.0',
    article: existing?.article ?? {
      id: slug,
      title: skeleton.title,
      language: deps.language,
      graph_version: deps.store.latestVersion(slug) ?? 1,
      created: today(),
      seed: deps.store.readSeed(slug),
      hub: skeleton.hub,
      synthesis: { unlock: DEFAULT_UNLOCK, text_md: SYNTHESIS_PLACEHOLDER },
    },
    nodes,
    sources: (existing?.sources ?? []).filter((source) => keptSourceIds.has(source.id)),
  };
}

function assertTargetsMatch(nodeId: string, skeleton: Skeleton, written: WrittenNode): void {
  const skeletonNode = skeleton.nodes.find((n) => n.id === nodeId);
  if (skeletonNode === undefined) throw new Error(`Nœud inconnu du squelette : ${nodeId}`);
  const expected = skeletonNode.cardinalities.map((c) => c.target_node_id).join(',');
  const actual = written.cardinalities.map((c) => c.target_node_id).join(',');
  if (expected !== actual) {
    throw new Error(
      `Le rédacteur a modifié les cibles de ${nodeId} (attendu ${expected}, reçu ${actual})`,
    );
  }
}

// ---------------------------------------------------------------------------
// Passe 3 — SOURCEUR
// ---------------------------------------------------------------------------

export interface PendingSource {
  id: string;
  node_id: string;
  claim: string;
  url: string;
  title: string;
  publisher: string;
  language: string;
  supporting_quote: string;
  cache_ref: string;
  confidence: 'high' | 'medium';
  accessed: string;
}

export interface SourcingReport {
  pending: PendingSource[];
  unsourced: { node_id: string; claim: string }[];
}

export async function runSourcePhase(
  deps: PipelineDeps,
  slug: string,
  nodeIds?: string[],
): Promise<SourcingReport> {
  const graph = deps.store.readGraph(slug);
  const targets = graph.nodes.filter((node) => nodeIds === undefined || nodeIds.includes(node.id));
  const pending: PendingSource[] = [];
  const unsourced: SourcingReport['unsourced'] = [];

  for (const node of targets) {
    const claims = splitSentences(node.summary.text);
    for (const [claimIndex, claim] of claims.entries()) {
      deps.log(`Sourceur : ${node.id}, affirmation ${claimIndex + 1}/${claims.length}…`);
      const candidates = await gatherCandidates(deps, claim, node.keyword);
      if (candidates.length === 0) {
        unsourced.push({ node_id: node.id, claim });
        continue;
      }
      const choice = await chooseSource(deps.call, claim, candidates);
      const chosen = choice.chosen_index !== null ? candidates[choice.chosen_index] : undefined;
      if (chosen === undefined) {
        unsourced.push({ node_id: node.id, claim });
        continue;
      }
      const sourceId = `SRC_${node.id}_C${claimIndex + 1}`;
      const cacheRef = deps.store.writeSourceCache(slug, sourceId, chosen.text);
      pending.push({
        id: sourceId,
        node_id: node.id,
        claim,
        url: chosen.url,
        title: chosen.title,
        publisher: choice.publisher,
        language: normalizeLanguage(choice.language),
        supporting_quote: choice.supporting_quote,
        cache_ref: cacheRef,
        confidence: choice.confidence,
        accessed: today(),
      });
    }
  }

  // les affirmations non sourçables deviennent des flags bloquants sur le nœud
  for (const failure of unsourced) {
    const node = graph.nodes.find((n) => n.id === failure.node_id);
    node?.provenance.critic_flags_open.push(`Affirmation non sourçable : ${failure.claim}`);
  }
  deps.store.writeGraph(slug, graph);

  const report: SourcingReport = { pending, unsourced };
  deps.store.writeReport(slug, 'sourcing', report);
  deps.log(
    `${pending.length} source(s) candidate(s), ${unsourced.length} affirmation(s) non sourçable(s).`,
  );
  return report;
}

async function gatherCandidates(
  deps: PipelineDeps,
  claim: string,
  keyword: string,
): Promise<RetrievedPage[]> {
  const results = await deps.search.search(
    buildSearchQuery(claim, keyword),
    deps.candidatesPerClaim + 2, // marge : certaines pages seront irrécupérables
  );
  const pages: RetrievedPage[] = [];
  for (const result of results) {
    if (pages.length >= deps.candidatesPerClaim) break;
    const page = await deps.retrieve(result.url);
    if (page !== null) pages.push(page);
  }
  return pages;
}

// ---------------------------------------------------------------------------
// Passe 3b — JUGE SÉMANTIQUE
// ---------------------------------------------------------------------------

export async function runJudgePhase(deps: PipelineDeps, slug: string): Promise<GraphArticle> {
  const graph = deps.store.readGraph(slug);
  const report = readSourcingReport(deps.store, slug);
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const verdicts: { source_id: string; verdict: string; rationale: string }[] = [];

  for (const pendingSource of report.pending) {
    deps.log(`Juge : ${pendingSource.id}…`);
    const cachedText = deps.store.readSourceCache(slug, pendingSource.cache_ref);
    const verdict = await judgeSource(
      deps.call,
      pendingSource.claim,
      pendingSource.supporting_quote,
      cachedText,
    );
    verdicts.push({
      source_id: pendingSource.id,
      verdict: verdict.verdict,
      rationale: verdict.rationale,
    });

    const node = nodesById.get(pendingSource.node_id);
    if (node === undefined) continue;

    if (verdict.verdict === 'unsupported') {
      node.provenance.critic_flags_open.push(
        `Source ${pendingSource.id} rejetée par le juge : ${verdict.rationale}`,
      );
      continue;
    }

    const source: Source = {
      id: pendingSource.id,
      url: pendingSource.url,
      title: pendingSource.title,
      publisher: pendingSource.publisher,
      accessed: pendingSource.accessed,
      language: pendingSource.language,
      claim: pendingSource.claim,
      supporting_quote: pendingSource.supporting_quote,
      cache_ref: pendingSource.cache_ref,
      confidence: pendingSource.confidence,
      verification: {
        verdict: verdict.verdict,
        method: 'llm-judge',
        rationale: verdict.rationale,
        judged_by: 'verifier-judge',
      },
    };
    graph.sources = graph.sources.filter((s) => s.id !== source.id).concat(source);
    if (!node.summary.source_ids.includes(source.id)) {
      node.summary.source_ids.push(source.id);
    }
  }

  // un nœud est « sourcé » si chaque affirmation a une source retenue et
  // qu'aucun flag de sourçage n'est ouvert
  for (const node of graph.nodes) {
    const claims = splitSentences(node.summary.text);
    const hasSourcingFlags = node.provenance.critic_flags_open.some(
      (flag) => flag.startsWith('Affirmation non sourçable') || flag.startsWith('Source '),
    );
    node.provenance.passes.sourced =
      node.summary.source_ids.length >= claims.length && !hasSourcingFlags;
  }

  deps.store.writeGraph(slug, graph);
  deps.store.writeReport(slug, 'judging', { verdicts });
  deps.log(`${verdicts.length} verdict(s) rendu(s).`);
  return graph;
}

// ---------------------------------------------------------------------------
// Passe 4 — CRITIQUE (boucle bornée rédacteur↔critique)
// ---------------------------------------------------------------------------

export interface CritiqueOutcome {
  iterations: number;
  /** Nœuds dont le résumé a changé : à re-sourcer (ct source --nodes …). */
  needsResourcing: string[];
}

export async function runCritiquePhase(deps: PipelineDeps, slug: string): Promise<CritiqueOutcome> {
  let graph = deps.store.readGraph(slug);
  const skeleton = deps.store.readSkeleton(slug);
  const needsResourcing = new Set<string>();
  const history: { iteration: number; findings: CriticFinding[] }[] = [];
  let iteration = 0;

  while (iteration < deps.criticMaxIterations) {
    iteration++;
    deps.log(`Critique : itération ${iteration}…`);
    const report = await runCritic(deps.call, graph);
    history.push({ iteration, findings: report.findings });
    if (report.findings.length === 0) break;

    const byNode = new Map<string, CriticFinding[]>();
    for (const finding of report.findings) {
      const list = byNode.get(finding.node_id) ?? [];
      list.push(finding);
      byNode.set(finding.node_id, list);
    }

    for (const [nodeId, findings] of byNode) {
      const node = graph.nodes.find((n) => n.id === nodeId);
      if (node === undefined) continue;
      deps.log(`Rédacteur (révision) : ${nodeId}…`);
      const revised = await reviseNode(deps.call, skeleton, node, findings, deps.language);
      const summaryChanged = revised.summary_text !== node.summary.text;
      node.summary.text = revised.summary_text;
      node.cardinalities = revised.cardinalities;
      node.provenance.revisions++;
      if (summaryChanged) {
        node.summary.source_ids = [];
        node.provenance.passes.sourced = false;
        needsResourcing.add(nodeId);
      }
    }
    deps.store.writeGraph(slug, graph);
    graph = deps.store.readGraph(slug);
  }

  // objections survivantes → flags ouverts (arbitrage G2)
  const lastFindings = history[history.length - 1]?.findings ?? [];
  if (iteration >= deps.criticMaxIterations && lastFindings.length > 0) {
    for (const finding of lastFindings) {
      const node = graph.nodes.find((n) => n.id === finding.node_id);
      node?.provenance.critic_flags_open.push(`[${finding.lens}] ${finding.objection}`);
    }
  }

  for (const node of graph.nodes) {
    node.provenance.passes.critiqued = true;
  }

  // synthèse rédigée une fois le graphe stabilisé
  if (graph.article.synthesis.text_md === SYNTHESIS_PLACEHOLDER) {
    deps.log('Rédacteur : synthèse finale…');
    graph.article.synthesis.text_md = await writeSynthesis(
      deps.call,
      skeleton,
      graph.nodes,
      deps.language,
    );
  }

  deps.store.writeGraph(slug, graph);
  deps.store.writeReport(slug, 'critique', {
    iterations: iteration,
    history,
    needs_resourcing: [...needsResourcing],
  });
  deps.log(
    `Critique terminée en ${iteration} itération(s) ; ${needsResourcing.size} nœud(s) à re-sourcer.`,
  );
  return { iterations: iteration, needsResourcing: [...needsResourcing] };
}

// ---------------------------------------------------------------------------
// Passe 5 — VALIDATEUR MÉCANIQUE (→ porte G2)
// ---------------------------------------------------------------------------

export function runValidatePhase(deps: PipelineDeps, slug: string): ValidationResult {
  const graph = deps.store.readGraph(slug);
  // passes.validated est tentativement posé, puis persisté seulement si tout passe
  const tentative = structuredClone(graph);
  for (const node of tentative.nodes) {
    node.provenance.passes.validated = true;
  }
  const result = validateGraphArticle(tentative, {
    sourceCacheExists: (cacheRef) => deps.store.sourceCacheExists(slug, cacheRef),
  });
  if (result.ok) {
    deps.store.writeGraph(slug, tentative);
    deps.log('Validation : OK — graphe publiable (après revue G2).');
  } else {
    const errors = result.findings.filter((f) => f.severity === 'error');
    deps.log(`Validation : ${errors.length} erreur(s).`);
  }
  deps.store.writeReport(slug, 'validation', { ok: result.ok, findings: result.findings });
  return result;
}

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

/**
 * Découpe un texte en phrases — mêmes protections que countSentences (schema).
 * Les points protégés (décimaux, abréviations) sont remplacés par une
 * sentinelle, puis restaurés dans chaque phrase.
 */
export function splitSentences(text: string): string[] {
  const SENTINEL = '\u0091';
  const protectedText = text
    .trim()
    .replace(/(\d)\.(\d)/g, `$1${SENTINEL}$2`)
    .replace(/\b(etc|cf|ex|p|M|Mme|Dr|vs|e\.g|i\.e)\./gi, `$1${SENTINEL}`);
  const parts = protectedText.match(/[^.!?…]+[.!?…]+(?:\s|$)/g) ?? [protectedText];
  return parts
    .map((part) => part.replaceAll(SENTINEL, '.').trim())
    .filter((part) => part.length > 0);
}

function normalizeLanguage(language: string): string {
  const cleaned = language.trim().toLowerCase().slice(0, 2);
  return /^[a-z]{2}$/.test(cleaned) ? cleaned : 'en';
}

function today(): string {
  const now = new Date();
  return now.toISOString().slice(0, 10);
}

function tryReadGraph(store: ArticleStore, slug: string): GraphArticle | null {
  try {
    return store.readGraph(slug);
  } catch {
    return null;
  }
}

function readSourcingReport(store: ArticleStore, slug: string): SourcingReport {
  const parsed = store.readReport<SourcingReport>(slug, 'sourcing');
  if (!Array.isArray(parsed.pending)) {
    throw new Error('reports/sourcing.json invalide — relancer ct source');
  }
  return parsed;
}
