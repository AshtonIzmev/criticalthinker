import { type GraphArticle, graphArticleSchema } from './graph-article.js';
import {
  collectEdges,
  countSentences,
  inDegrees,
  nodesByPillar,
  parseInlineLinks,
  reachableFromHub,
} from './graph-utils.js';

/**
 * Validateur mécanique (SPEC §7). Script, pas une IA : il vérifie tout ce
 * qui est vérifiable sans jugement sémantique. Partagé entre le pipeline,
 * l'outillage de revue et le build Astro du blog — un graphe invalide ne
 * peut pas être publié.
 */

export type Severity = 'error' | 'warning';

export interface Finding {
  /** Numéro de règle de la SPEC §7 (ex: 'R4') ou 'R1' pour le schéma Zod. */
  rule: string;
  severity: Severity;
  message: string;
  /** Localisation : id de nœud, de source, ou chemin Zod. */
  where?: string;
}

export interface ValidationOptions {
  /**
   * Résout un cache_ref vers "le fichier archivé existe et n'est pas vide".
   * Fourni par l'appelant (CLI/CI) — le validateur reste pur (pas de fs),
   * donc utilisable au build Astro comme dans le pipeline.
   * Absent → la règle 11b émet un avertissement "non vérifié".
   */
  sourceCacheExists?: (cacheRef: string) => boolean;
  /** Bornes de taille (règle 3) — désactivables pour valider un brouillon. */
  sizeLimits?: boolean;
}

export interface ValidationResult {
  /** true si aucune erreur (les avertissements ne bloquent pas). */
  ok: boolean;
  findings: Finding[];
  /** Le graphe parsé si le schéma Zod est passé, sinon null. */
  graph: GraphArticle | null;
}

export const SIZE_LIMITS = {
  minNodes: 15,
  maxNodes: 40,
  minPillars: 3,
  maxPillars: 5,
  minNodesPerPillar: 2,
} as const;

export function validateGraphArticle(
  input: unknown,
  options: ValidationOptions = {},
): ValidationResult {
  const findings: Finding[] = [];

  // R1 — conformité au schéma Zod
  const parsed = graphArticleSchema.safeParse(input);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      findings.push({
        rule: 'R1',
        severity: 'error',
        message: issue.message,
        where: issue.path.join('.'),
      });
    }
    return { ok: false, findings, graph: null };
  }
  const graph = parsed.data;

  checkSummaries(graph, findings);
  if (options.sizeLimits !== false) checkSizes(graph, findings);
  checkGraphIntegrity(graph, findings);
  checkSourcing(graph, findings, options);
  checkProvenance(graph, findings);

  return { ok: !findings.some((f) => f.severity === 'error'), findings, graph };
}

// R2 — résumé = exactement 2 phrases
function checkSummaries(graph: GraphArticle, findings: Finding[]): void {
  for (const node of graph.nodes) {
    const count = countSentences(node.summary.text);
    if (count !== 2) {
      findings.push({
        rule: 'R2',
        severity: 'error',
        message: `Résumé de ${count} phrase(s) — exactement 2 attendues`,
        where: node.id,
      });
    }
  }
}

// R3 — bornes de taille
function checkSizes(graph: GraphArticle, findings: Finding[]): void {
  const { minNodes, maxNodes, minPillars, maxPillars, minNodesPerPillar } = SIZE_LIMITS;
  if (graph.nodes.length < minNodes || graph.nodes.length > maxNodes) {
    findings.push({
      rule: 'R3',
      severity: 'error',
      message: `${graph.nodes.length} nœuds — attendu entre ${minNodes} et ${maxNodes}`,
    });
  }
  const pillars = graph.article.hub.pillars;
  if (pillars.length < minPillars || pillars.length > maxPillars) {
    findings.push({
      rule: 'R3',
      severity: 'error',
      message: `${pillars.length} pilier(s) — attendu entre ${minPillars} et ${maxPillars}`,
    });
  }
  for (const [pillarId, nodes] of nodesByPillar(graph)) {
    if (nodes.length < minNodesPerPillar) {
      findings.push({
        rule: 'R3',
        severity: 'error',
        message: `Pilier avec ${nodes.length} nœud(s) — au moins ${minNodesPerPillar} attendus`,
        where: pillarId,
      });
    }
  }
}

// R4–R9 — intégrité du graphe
function checkGraphIntegrity(graph: GraphArticle, findings: Finding[]): void {
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const pillarIds = new Set(graph.article.hub.pillars.map((pillar) => pillar.id));

  // ids uniques (précondition de tout le reste)
  const seenIds = new Set<string>();
  for (const node of graph.nodes) {
    if (seenIds.has(node.id)) {
      findings.push({
        rule: 'R4',
        severity: 'error',
        message: 'Identifiant de nœud dupliqué',
        where: node.id,
      });
    }
    seenIds.add(node.id);
  }

  // rattachement à un pilier existant
  for (const node of graph.nodes) {
    if (!pillarIds.has(node.pillar)) {
      findings.push({
        rule: 'R3',
        severity: 'error',
        message: `Pilier inconnu : ${node.pillar}`,
        where: node.id,
      });
    }
  }

  // R4 — liens pendants (cardinalités et hub)
  for (const edge of collectEdges(graph)) {
    if (!nodeIds.has(edge.to)) {
      findings.push({
        rule: 'R4',
        severity: 'error',
        message: `Lien vers un nœud inexistant : ${edge.to}`,
        where: edge.from ?? 'hub',
      });
    }
  }

  // R5 — atteignabilité depuis le hub
  const reachable = reachableFromHub(graph);
  for (const node of graph.nodes) {
    if (!reachable.has(node.id)) {
      findings.push({
        rule: 'R5',
        severity: 'error',
        message: 'Nœud injoignable depuis le hub',
        where: node.id,
      });
    }
  }

  // R6 — degré entrant ≥ 1
  for (const [nodeId, degree] of inDegrees(graph)) {
    if (degree === 0) {
      findings.push({
        rule: 'R6',
        severity: 'error',
        message: 'Aucune arête entrante (nœud orphelin)',
        where: nodeId,
      });
    }
  }

  // R7 — cohérence lien inline ↔ target_node_id, au plus un lien par cardinalité
  for (const node of graph.nodes) {
    node.cardinalities.forEach((cardinality, index) => {
      const links = parseInlineLinks(cardinality.text_md);
      const where = `${node.id}.cardinalities[${index}]`;
      if (links.length > 1) {
        findings.push({
          rule: 'R7',
          severity: 'error',
          message: `${links.length} liens inline — au plus 1 par cardinalité`,
          where,
        });
      }
      const inlineTarget = links[0]?.nodeId ?? null;
      if (inlineTarget !== cardinality.target_node_id) {
        findings.push({
          rule: 'R7',
          severity: 'error',
          message: `Lien inline (${inlineTarget ?? 'aucun'}) ≠ target_node_id (${cardinality.target_node_id ?? 'null'})`,
          where,
        });
      }
    });
  }

  // R8 — pas de collision de mots-clés
  const keywords = new Map<string, string>();
  for (const node of graph.nodes) {
    const key = node.keyword.trim().toLowerCase();
    const existing = keywords.get(key);
    if (existing !== undefined) {
      findings.push({
        rule: 'R8',
        severity: 'error',
        message: `Mot-clé en collision avec ${existing} : « ${node.keyword} »`,
        where: node.id,
      });
    } else {
      keywords.set(key, node.id);
    }
  }

  // R9 — pas d'auto-boucle
  for (const node of graph.nodes) {
    for (const cardinality of node.cardinalities) {
      if (cardinality.target_node_id === node.id) {
        findings.push({
          rule: 'R9',
          severity: 'error',
          message: 'Auto-boucle : le nœud pointe vers lui-même',
          where: node.id,
        });
      }
    }
  }
}

// R10–R12b — sourçage
function checkSourcing(graph: GraphArticle, findings: Finding[], options: ValidationOptions): void {
  const sourceIds = new Set(graph.sources.map((source) => source.id));
  const referenced = new Set<string>();

  // R10 — source_ids non vide, sources référencées existantes
  for (const node of graph.nodes) {
    if (node.summary.source_ids.length === 0) {
      findings.push({
        rule: 'R10',
        severity: 'error',
        message: 'Résumé sans source — « pas de source, pas de nœud »',
        where: node.id,
      });
    }
    for (const sourceId of node.summary.source_ids) {
      referenced.add(sourceId);
      if (!sourceIds.has(sourceId)) {
        findings.push({
          rule: 'R10',
          severity: 'error',
          message: `Source référencée inexistante : ${sourceId}`,
          where: node.id,
        });
      }
    }
  }

  // R11 — archive présente (via résolveur fourni par l'appelant)
  for (const source of graph.sources) {
    if (options.sourceCacheExists === undefined) {
      findings.push({
        rule: 'R11',
        severity: 'warning',
        message: 'Archive non vérifiée (pas de résolveur de cache fourni)',
        where: source.id,
      });
    } else if (!options.sourceCacheExists(source.cache_ref)) {
      findings.push({
        rule: 'R11',
        severity: 'error',
        message: `Archive absente ou vide : ${source.cache_ref}`,
        where: source.id,
      });
    }
  }

  // R12 — sources orphelines (avertissement)
  for (const source of graph.sources) {
    if (!referenced.has(source.id)) {
      findings.push({
        rule: 'R12',
        severity: 'warning',
        message: 'Source déclarée mais jamais référencée',
        where: source.id,
      });
    }
  }

  // R12b — verdict du juge sémantique
  for (const source of graph.sources) {
    if (source.verification.verdict !== 'supported') {
      findings.push({
        rule: 'R12b',
        severity: 'error',
        message:
          source.verification.verdict === 'partial'
            ? 'Verdict « partial » — arbitrage G2 requis avant publication'
            : 'Verdict « unsupported » — source invalide',
        where: source.id,
      });
    }
  }
}

// R13 — provenance : passes complètes, aucun flag critique ouvert
function checkProvenance(graph: GraphArticle, findings: Finding[]): void {
  for (const node of graph.nodes) {
    const { passes, critic_flags_open } = node.provenance;
    if (!passes.sourced || !passes.critiqued || !passes.validated) {
      const missing = (['sourced', 'critiqued', 'validated'] as const)
        .filter((pass) => !passes[pass])
        .join(', ');
      findings.push({
        rule: 'R13',
        severity: 'error',
        message: `Passes incomplètes : ${missing}`,
        where: node.id,
      });
    }
    if (critic_flags_open.length > 0) {
      findings.push({
        rule: 'R13',
        severity: 'error',
        message: `${critic_flags_open.length} flag(s) critique(s) ouvert(s) — arbitrage G2 requis`,
        where: node.id,
      });
    }
  }
}
