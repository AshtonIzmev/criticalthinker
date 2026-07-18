import { type Skeleton, skeletonSchema } from '@criticalthinker/schema';
import type { StructuredCaller } from '../llm/structured.js';

/**
 * ARCHITECTE (SPEC §5.1, passe 1) : sujet → squelette du graphe.
 * Structure seule — piliers, mots-clés, questions, axes, arêtes.
 * AUCUNE prose : c'est ce qui rend la porte G1 relisable en 5 minutes.
 */

const SYSTEM = `Tu es l'architecte d'un article non linéaire en forme de graphe orienté, destiné à développer la pensée critique du lecteur. La thèse du format : la réalité n'est jamais noire ou blanche, elle est grise.

Tu produis UNIQUEMENT la structure du graphe — jamais de prose développée.

Règles de structure (contraintes dures, vérifiées mécaniquement) :
- 3 à 5 piliers : les domaines catégoriels du sujet, complémentaires et non redondants.
- 15 à 40 nœuds au total, au moins 2 par pilier, chaque nœud rattaché à exactement un pilier.
- Identifiants : piliers PIL_A, PIL_B… ; nœuds PILA_N01, PILA_N02… (MAJUSCULES_SOULIGNÉES).
- Chaque nœud : un mot-clé (keyword) unique dans tout le graphe, et une question de friction — la question que le mot-clé soulève réellement, jamais rhétorique ni orientée.
- Chaque nœud : 2 à 4 cardinalités = des AXES D'ANALYSE non binaires (ex. structurel/institutionnel, individuel/agentif, historique, économique, éthique…). Jamais de « pour/contre ».
- Chaque cardinalité a soit target_node_id: null (feuille terminale), soit l'id d'un AUTRE nœud — de préférence dans un AUTRE pilier (boucles de rétroaction transversales, c'est le cœur du format).
- Jamais d'auto-boucle. Le graphe entier doit être joignable depuis le hub.
- Le hub (text_md) : un texte introductif court qui pose le sujet et contient un lien [[mot-clé|NODE_ID]] vers au moins un nœud d'entrée par pilier.
- synthesis_intent : une phrase décrivant ce que la synthèse finale devra faire ressortir comme « gris » (tensions entre perspectives).

Équilibre du graphe : distribue les liens récursifs pour qu'aucun nœud ne concentre toutes les entrées, et pour qu'un lecteur curieux traverse naturellement plusieurs piliers.`;

export async function runArchitect(
  call: StructuredCaller,
  seed: string,
  language: string,
): Promise<Skeleton> {
  return call({
    role: 'architect',
    system: SYSTEM,
    user: `Langue de l'article : ${language}\n\nSujet fourni par l'éditeur :\n\n${seed}`,
    schema: skeletonSchema,
    schemaName: 'skeleton',
  });
}
