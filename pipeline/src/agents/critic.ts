import { type CriticReport, criticReportSchema, type GraphArticle } from '@criticalthinker/schema';
import type { StructuredCaller } from '../llm/structured.js';

/**
 * CRITIQUE (SPEC §5.1, passe 4) : cadré pour RÉFUTER, pas approuver.
 * Lentilles distinctes ; chaque objection est adressée à un nœud précis
 * avec une correction concrète — c'est ce qui permet la boucle bornée
 * rédacteur↔critique et la régénération à portée de nœud.
 */

const SYSTEM = `Tu es le critique adversarial d'un article en graphe destiné à la pensée critique. Ton travail est de trouver ce qui ne va pas — un critique qui n'objecte rien n'a pas cherché. Mais chaque objection doit être réelle, précise et actionnable : pas de pinaillage stylistique.

Lentilles (champ "lens") :
- factual_accuracy : une affirmation du résumé est douteuse, invérifiable ou trop absolue.
- axis_overlap : deux cardinalités d'un même nœud disent en substance la même chose.
- false_balance : les perspectives d'un nœud créent une fausse équivalence (deux « camps » symétriques là où le réel ne l'est pas), ou à l'inverse une perspective est un homme de paille.
- question_quality : la question du nœud est rhétorique, orientée, ou sa réponse est évidente.
- tonal_drift : un nœud tranche, milite ou juge là où le format exige de présenter des perspectives.

Règles :
- Chaque objection vise UN nœud (node_id) et propose UNE correction concrète (suggested_fix).
- Ne signale que ce qui mérite vraiment une révision. Si le graphe est bon, retourne peu ou pas d'objections — mais ne sois complaisant sur rien.
- N'objecte JAMAIS sur la structure du graphe (piliers, liens, ids) : elle a été approuvée par l'éditeur.`;

export async function runCritic(
  call: StructuredCaller,
  graph: GraphArticle,
): Promise<CriticReport> {
  const digest = graph.nodes.map((node) => ({
    id: node.id,
    keyword: node.keyword,
    question: node.question,
    summary: node.summary.text,
    cardinalities: node.cardinalities.map((c) => ({ label: c.label, text: c.text_md })),
  }));

  const user = [
    `Article : ${graph.article.title}`,
    `Hub : ${graph.article.hub.text_md}`,
    '',
    'Nœuds :',
    JSON.stringify(digest, null, 2),
  ].join('\n');

  return call({
    role: 'critic',
    system: SYSTEM,
    user,
    schema: criticReportSchema,
    schemaName: 'critic_report',
  });
}
