import { z } from 'zod';

/**
 * Schéma Zod du graph.json — LE contrat du projet (SPEC §4).
 *
 * Ce fichier définit la forme des données (types, champs, bornes locales).
 * Les invariants de graphe (atteignabilité, liens pendants, sourçage…)
 * relèvent du validateur (`validate.ts`), qui produit des messages
 * exploitables par l'éditeur — pas de la forme.
 */

export const SCHEMA_VERSION = '2.0' as const;

const nonEmpty = z.string().trim().min(1);

/** Identifiant de nœud/pilier/source : stable, lisible, utilisable en hash d'URL. */
export const idSchema = z.string().regex(/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/, {
  message: 'Identifiant attendu en MAJUSCULES_SOULIGNÉES (ex: PILA_N01)',
});

export const slugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'Slug attendu en kebab-case' });

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Date attendue au format YYYY-MM-DD' });

export const pillarSchema = z.object({
  id: idSchema,
  label: nonEmpty,
});

export const hubSchema = z.object({
  /** Texte introductif ; les mots-clés cliquables utilisent la micro-syntaxe [[texte|NODE_ID]]. */
  text_md: nonEmpty,
  pillars: z.array(pillarSchema).min(1),
});

export const synthesisSchema = z.object({
  unlock: z.object({
    /** Part des cardinalités lues requise (0..1). */
    min_coverage: z.number().min(0).max(1),
    /** Part des piliers explorés requise (0..1). */
    min_pillar_diversity: z.number().min(0).max(1),
  }),
  text_md: nonEmpty,
});

export const articleMetaSchema = z.object({
  id: slugSchema,
  title: nonEmpty,
  language: z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/),
  graph_version: z.number().int().min(1),
  created: isoDateSchema,
  /** Le sujet tel que fourni par l'éditeur (seed.md). */
  seed: nonEmpty,
  hub: hubSchema,
  synthesis: synthesisSchema,
});

export const cardinalitySchema = z.object({
  label: nonEmpty,
  /** Au plus un lien [[texte|NODE_ID]], qui doit correspondre à target_node_id (règle 7). */
  text_md: nonEmpty,
  /** null = feuille terminale, pas de saut récursif. */
  target_node_id: idSchema.nullable(),
});

export const nodeProvenanceSchema = z.object({
  written_by: nonEmpty,
  revisions: z.number().int().min(0),
  passes: z.object({
    sourced: z.boolean(),
    critiqued: z.boolean(),
    validated: z.boolean(),
  }),
  critic_flags_open: z.array(nonEmpty),
});

export const nodeSummarySchema = z.object({
  /** Exactement deux phrases (règle 2, vérifiée par le validateur). */
  text: nonEmpty,
  source_ids: z.array(idSchema),
});

export const graphNodeSchema = z.object({
  id: idSchema,
  pillar: idSchema,
  keyword: nonEmpty,
  question: nonEmpty,
  summary: nodeSummarySchema,
  cardinalities: z.array(cardinalitySchema).min(2).max(4),
  provenance: nodeProvenanceSchema,
});

export const sourceVerificationSchema = z.object({
  verdict: z.enum(['supported', 'partial', 'unsupported']),
  method: z.literal('llm-judge'),
  rationale: nonEmpty,
  judged_by: nonEmpty,
});

export const sourceSchema = z.object({
  id: idSchema,
  url: z.string().url(),
  title: nonEmpty,
  publisher: nonEmpty,
  accessed: isoDateSchema,
  /** Langue de la source — peut différer de celle de l'article. */
  language: z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/),
  claim: nonEmpty,
  /**
   * Passage de la source qui soutient l'affirmation, aussi proche du verbatim
   * que possible, dans la langue de la source. L'esprit prime sur la lettre :
   * la fidélité est jugée sémantiquement (verification), jamais littéralement.
   */
  supporting_quote: nonEmpty,
  /** Chemin relatif à la version de l'article, ex: sources-cache/SRC_01.txt */
  cache_ref: nonEmpty,
  confidence: z.enum(['high', 'medium']),
  verification: sourceVerificationSchema,
});

export const graphArticleSchema = z.object({
  schema_version: z.literal(SCHEMA_VERSION),
  article: articleMetaSchema,
  nodes: z.array(graphNodeSchema),
  sources: z.array(sourceSchema),
});

export type Pillar = z.infer<typeof pillarSchema>;
export type Hub = z.infer<typeof hubSchema>;
export type Synthesis = z.infer<typeof synthesisSchema>;
export type ArticleMeta = z.infer<typeof articleMetaSchema>;
export type Cardinality = z.infer<typeof cardinalitySchema>;
export type NodeProvenance = z.infer<typeof nodeProvenanceSchema>;
export type GraphNode = z.infer<typeof graphNodeSchema>;
export type SourceVerification = z.infer<typeof sourceVerificationSchema>;
export type Source = z.infer<typeof sourceSchema>;
export type GraphArticle = z.infer<typeof graphArticleSchema>;
