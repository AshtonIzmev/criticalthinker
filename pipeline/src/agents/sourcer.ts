import { z } from 'zod';
import type { StructuredCaller } from '../llm/structured.js';
import type { RetrievedPage } from '../retrieve/retrieve.js';

/**
 * SOURCEUR (SPEC §5.1, passe 3) : pour une affirmation factuelle, choisit
 * parmi des pages RÉCUPÉRÉES ET ARCHIVÉES la meilleure source et en extrait
 * le passage de soutien. Jamais la mémoire du modèle : uniquement les
 * candidats fournis. L'esprit prime — le passage n'a pas à être un
 * copier-coller littéral, mais il doit refléter fidèlement la source.
 */

const SYSTEM = `Tu es le sourceur d'un article factuel. On te donne une affirmation et des extraits de pages web réellement récupérées. Tu choisis la page qui soutient le mieux l'affirmation et tu en extrais le passage de soutien.

Règles :
- Tu ne t'appuies QUE sur les extraits fournis — jamais sur ta mémoire.
- supporting_quote : le passage de la page qui soutient l'affirmation, dans la langue de la page, aussi proche du texte réel que possible. Pas de reformulation créative.
- confidence "high" : la page affirme directement la chose ; "medium" : elle la soutient indirectement ou partiellement.
- Si AUCUNE page ne soutient réellement l'affirmation, retourne chosen_index: null — ne force jamais une source qui ne colle pas. C'est une réponse valable et précieuse.
- Privilégie les sources primaires ou institutionnelles aux blogs et agrégateurs.`;

export const sourcerChoiceSchema = z.object({
  /** Index du candidat choisi, ou null si aucun ne soutient l'affirmation. */
  chosen_index: z.number().int().min(0).nullable(),
  supporting_quote: z.string(),
  publisher: z.string(),
  /** Code langue de la source (ex: en, fr). */
  language: z.string(),
  confidence: z.enum(['high', 'medium']),
});

export type SourcerChoice = z.infer<typeof sourcerChoiceSchema>;

const EXCERPT_LENGTH = 2500;

export async function chooseSource(
  call: StructuredCaller,
  claim: string,
  candidates: RetrievedPage[],
): Promise<SourcerChoice> {
  const user = [
    `Affirmation à sourcer :\n${claim}`,
    '',
    'Candidats (pages récupérées) :',
    ...candidates.map(
      (page, index) =>
        `--- Candidat ${index} ---\nURL : ${page.url}\nTitre : ${page.title}\nExtrait :\n${page.text.slice(0, EXCERPT_LENGTH)}`,
    ),
  ].join('\n');

  return call({
    role: 'sourcer',
    system: SYSTEM,
    user,
    schema: sourcerChoiceSchema,
    schemaName: 'sourcer_choice',
  });
}

/** Construit la requête de recherche pour une affirmation. */
export function buildSearchQuery(claim: string, keyword: string): string {
  return `${keyword} — ${claim}`;
}
