import { z } from 'zod';
import {
  cardinalitySchema,
  hubSchema,
  idSchema,
  type nodeSummarySchema,
  sourceVerificationSchema,
  synthesisSchema,
} from './graph-article.js';

/**
 * Sous-schémas des sorties structurées des agents (ARCHITECTURE §4.2).
 * Ce sont des PROJECTIONS du graph.json final — jamais des formats ad hoc
 * à re-mapper. Chaque agent produit un morceau du contrat, le pipeline
 * assemble.
 */

/** Sortie de l'ARCHITECTE : le squelette — structure sans prose (porte G1). */
export const skeletonNodeSchema = z.object({
  id: idSchema,
  pillar: idSchema,
  keyword: z.string().trim().min(1),
  question: z.string().trim().min(1),
  cardinalities: z
    .array(
      z.object({
        label: z.string().trim().min(1),
        /** Cible du saut récursif — null pour une feuille terminale. */
        target_node_id: idSchema.nullable(),
      }),
    )
    .min(2)
    .max(4),
});

export const skeletonSchema = z.object({
  title: z.string().trim().min(1),
  hub: hubSchema,
  synthesis_intent: z.string().trim().min(1),
  nodes: z.array(skeletonNodeSchema),
});

/** Sortie du RÉDACTEUR pour un nœud : la prose, contrainte par le squelette. */
export const writtenNodeSchema = z.object({
  id: idSchema,
  summary_text: z.string().trim().min(1),
  cardinalities: z.array(cardinalitySchema).min(2).max(4),
});

/** Sortie du SOURCEUR pour une affirmation : la source candidate archivée. */
export const sourcedClaimSchema = z.object({
  node_id: idSchema,
  claim: z.string().trim().min(1),
  url: z.string().url(),
  title: z.string().trim().min(1),
  publisher: z.string().trim().min(1),
  language: z.string().trim().min(2),
  supporting_quote: z.string().trim().min(1),
  confidence: z.enum(['high', 'medium']),
});

/** Sortie du JUGE SÉMANTIQUE : le verdict (l'esprit prime sur la lettre). */
export const judgeVerdictSchema = sourceVerificationSchema.omit({ method: true, judged_by: true });

/** Sortie du CRITIQUE : objections par lentille, adressées à un nœud. */
export const criticFindingSchema = z.object({
  node_id: idSchema,
  lens: z.enum([
    'factual_accuracy',
    'axis_overlap',
    'false_balance',
    'question_quality',
    'tonal_drift',
  ]),
  objection: z.string().trim().min(1),
  /** Suggestion de correction concrète pour le rédacteur. */
  suggested_fix: z.string().trim().min(1),
});

export const criticReportSchema = z.object({
  findings: z.array(criticFindingSchema),
});

/** Sortie de synthèse (rédigée en fin de pipeline, une fois le graphe stable). */
export const synthesisTextSchema = synthesisSchema.pick({ text_md: true });

export type SkeletonNode = z.infer<typeof skeletonNodeSchema>;
export type Skeleton = z.infer<typeof skeletonSchema>;
export type WrittenNode = z.infer<typeof writtenNodeSchema>;
export type SourcedClaim = z.infer<typeof sourcedClaimSchema>;
export type JudgeVerdict = z.infer<typeof judgeVerdictSchema>;
export type CriticFinding = z.infer<typeof criticFindingSchema>;
export type CriticReport = z.infer<typeof criticReportSchema>;
export type NodeSummary = z.infer<typeof nodeSummarySchema>;
