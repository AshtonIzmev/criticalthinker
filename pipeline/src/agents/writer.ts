import {
  type CriticFinding,
  type GraphNode,
  type Skeleton,
  type SkeletonNode,
  type WrittenNode,
  writtenNodeSchema,
} from '@criticalthinker/schema';
import { z } from 'zod';
import type { StructuredCaller } from '../llm/structured.js';

/**
 * RÉDACTEUR (SPEC §5.1, passe 2) : remplit résumés et cardinalités,
 * nœud par nœud, contraint par le squelette approuvé à G1.
 * Portée : UN nœud par appel — c'est ce qui rend la régénération ciblée
 * possible sans invalider le reste du graphe.
 */

const SYSTEM = `Tu es le rédacteur d'un article non linéaire en graphe, destiné à développer la pensée critique. Tu rédiges le contenu d'UN nœud, dans le cadre strict du squelette approuvé par l'éditeur.

Règles de rédaction (contraintes dures, vérifiées mécaniquement) :
- summary_text : EXACTEMENT deux phrases, factuelles, objectives, vérifiables — la base empirique. Aucune opinion, aucun adjectif orienté. Chaque affirmation devra être sourçable sur le web.
- Chaque cardinalité : un paragraphe court (2-4 phrases) qui analyse le nœud à travers l'axe indiqué par son label. C'est de l'interprétatif assumé : une perspective, pas la vérité.
- Les cardinalités d'un même nœud ne doivent JAMAIS se recouvrir : chaque axe apporte un éclairage réellement distinct, et elles peuvent se contredire partiellement — c'est voulu, le réel est gris.
- Cardinalité avec target_node_id non nul : le texte se termine naturellement par un lien [[texte d'ancrage|TARGET_ID]] vers le nœud cible — exactement UN lien, avec l'id imposé par le squelette. Le texte d'ancrage est une expression naturelle de la phrase, pas le mot « ici ».
- Cardinalité avec target_node_id null : AUCUN lien [[…]] dans le texte.
- Ton : sobre, précis, sans jargon inutile. Jamais de « il faut », « on doit », « clairement ».`;

export async function writeNode(
  call: StructuredCaller,
  skeleton: Skeleton,
  node: SkeletonNode,
  language: string,
): Promise<WrittenNode> {
  const user = [
    `Langue : ${language}`,
    `Article : ${skeleton.title}`,
    `Contexte du graphe (piliers) : ${skeleton.hub.pillars.map((p) => `${p.id}=${p.label}`).join(' ; ')}`,
    '',
    'Nœud à rédiger :',
    JSON.stringify(node, null, 2),
    '',
    'Mots-clés des nœuds cibles (pour des ancrages naturels) :',
    describeTargets(skeleton, node),
  ].join('\n');

  return call({
    role: 'writer',
    system: SYSTEM,
    user,
    schema: writtenNodeSchema,
    schemaName: 'written_node',
  });
}

export async function reviseNode(
  call: StructuredCaller,
  skeleton: Skeleton,
  current: GraphNode,
  findings: CriticFinding[],
  language: string,
): Promise<WrittenNode> {
  const user = [
    `Langue : ${language}`,
    `Article : ${skeleton.title}`,
    '',
    'Nœud actuel :',
    JSON.stringify(
      {
        id: current.id,
        keyword: current.keyword,
        question: current.question,
        summary_text: current.summary.text,
        cardinalities: current.cardinalities,
      },
      null,
      2,
    ),
    '',
    'Objections du critique à corriger (et rien d’autre — ne réécris pas ce qui n’est pas visé) :',
    JSON.stringify(findings, null, 2),
    '',
    'Contrainte : conserve les mêmes target_node_id. Si tu modifies summary_text, il devra être re-sourcé.',
  ].join('\n');

  return call({
    role: 'writer',
    system: SYSTEM,
    user,
    schema: writtenNodeSchema,
    schemaName: 'written_node',
  });
}

const synthesisOutputSchema = z.object({ text_md: z.string().trim().min(1) });

export async function writeSynthesis(
  call: StructuredCaller,
  skeleton: Skeleton,
  nodes: GraphNode[],
  language: string,
): Promise<string> {
  const digest = nodes.map((node) => ({
    id: node.id,
    keyword: node.keyword,
    question: node.question,
    axes: node.cardinalities.map((c) => c.label),
  }));
  const user = [
    `Langue : ${language}`,
    `Article : ${skeleton.title}`,
    `Intention de synthèse (fixée à G1) : ${skeleton.synthesis_intent}`,
    '',
    'Nœuds du graphe :',
    JSON.stringify(digest, null, 2),
    '',
    'Rédige la synthèse débloquée en fin de parcours : elle nomme les tensions entre les perspectives que le lecteur a traversées et montre en quoi le sujet est « gris » — sans trancher à sa place. 2 à 4 paragraphes courts. Pas de liens [[…]].',
  ].join('\n');

  const result = await call({
    role: 'writer',
    system: SYSTEM,
    user,
    schema: synthesisOutputSchema,
    schemaName: 'synthesis_text',
  });
  return result.text_md;
}

function describeTargets(skeleton: Skeleton, node: SkeletonNode): string {
  const byId = new Map(skeleton.nodes.map((n) => [n.id, n]));
  return node.cardinalities
    .map((cardinality) => {
      if (cardinality.target_node_id === null) return `- ${cardinality.label} : feuille terminale`;
      const target = byId.get(cardinality.target_node_id);
      return `- ${cardinality.label} → ${cardinality.target_node_id} (mot-clé : ${target?.keyword ?? '?'}, question : ${target?.question ?? '?'})`;
    })
    .join('\n');
}
