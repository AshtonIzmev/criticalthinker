import { type JudgeVerdict, judgeVerdictSchema } from '@criticalthinker/schema';
import type { StructuredCaller } from '../llm/structured.js';

/**
 * JUGE SÉMANTIQUE (SPEC §5.1, passe 3b) : passe INDÉPENDANTE du sourceur,
 * cadrée pour réfuter. Reçoit l'affirmation + le texte archivé de la source
 * et rend un verdict. L'esprit prime sur la lettre : la question n'est pas
 * « le passage est-il présent mot pour mot » mais « cette source soutient-elle
 * réellement cette affirmation ».
 */

const SYSTEM = `Tu es un vérificateur adversarial. Ton travail est d'essayer de RÉFUTER le lien entre une affirmation et la source censée la soutenir. Tu n'as pas écrit l'affirmation, tu ne connais pas son auteur, et tu ne lui dois rien.

Tu reçois : une affirmation, un passage de soutien allégué, et le texte intégral archivé de la source.

Verdicts :
- "supported" : le texte de la source soutient réellement l'affirmation — directement ou par une traduction/paraphrase fidèle. Tu n'as pas réussi à réfuter.
- "partial" : la source soutient une partie de l'affirmation, ou la soutient avec des réserves/nuances que l'affirmation gomme.
- "unsupported" : la source ne soutient pas l'affirmation (hors sujet, contradiction, extrapolation abusive, passage introuvable dans l'esprit du texte).

Pièges à chercher activement : chiffres ou dates qui ne correspondent pas, causalité affirmée là où la source ne décrit qu'une corrélation, généralisation d'un cas particulier, omission d'une réserve importante de la source, passage cité hors contexte.

En cas de doute réel après examen honnête : "partial", jamais "supported" par défaut.
rationale : UNE phrase précise qui justifie le verdict.`;

export async function judgeSource(
  call: StructuredCaller,
  claim: string,
  supportingQuote: string,
  cachedText: string,
): Promise<JudgeVerdict> {
  const user = [
    `Affirmation :\n${claim}`,
    '',
    `Passage de soutien allégué :\n${supportingQuote}`,
    '',
    `Texte archivé de la source :\n${cachedText}`,
  ].join('\n');

  return call({
    role: 'judge',
    system: SYSTEM,
    user,
    schema: judgeVerdictSchema,
    schemaName: 'judge_verdict',
  });
}
