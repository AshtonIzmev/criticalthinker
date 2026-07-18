import type { MessageTextContent, ThreadMessage } from '@azure/ai-agents';
import { AgentsClient, isOutputOfType, ToolUtility } from '@azure/ai-agents';
import { DefaultAzureCredential } from '@azure/identity';
import type { PipelineConfig } from '../config.js';
import type { SearchProvider, SearchResult } from './provider.js';

/**
 * Grounding with Bing via le Foundry Agent Service (ARCHITECTURE §5.1).
 * Un agent éphémère est créé avec l'outil Bing, interrogé, puis supprimé ;
 * les URL citées dans les annotations de la réponse forment les résultats.
 *
 * NOTE : nécessite un smoke test contre un vrai projet Foundry
 * (AZURE_AI_PROJECT_ENDPOINT + AZURE_BING_CONNECTION_ID).
 */
export function createBingGroundingProvider(config: PipelineConfig): SearchProvider {
  const { projectEndpoint, bingConnectionId, agentDeployment } = config.search;
  if (projectEndpoint === undefined || bingConnectionId === undefined) {
    throw new Error(
      'Grounding with Bing non configuré : AZURE_AI_PROJECT_ENDPOINT et AZURE_BING_CONNECTION_ID requis',
    );
  }
  if (agentDeployment === undefined) {
    throw new Error('CT_DEPLOYMENT_SEARCH_AGENT ou AZURE_OPENAI_DEPLOYMENT requis');
  }

  const client = new AgentsClient(projectEndpoint, new DefaultAzureCredential());

  return {
    async search(query: string, maxResults: number): Promise<SearchResult[]> {
      const bingTool = ToolUtility.createBingGroundingTool([
        { connectionId: bingConnectionId, count: maxResults },
      ]);

      const agent = await client.createAgent(agentDeployment, {
        name: 'ct-search',
        instructions:
          'Tu es un moteur de recherche documentaire. Recherche sur le web et cite tes sources. ' +
          'Réponds par une courte synthèse des résultats trouvés, avec une citation par source.',
        tools: [bingTool.definition],
      });

      try {
        const thread = await client.threads.create();
        await client.messages.create(thread.id, 'user', query);
        const run = await client.runs.createAndPoll(thread.id, agent.id);
        if (run.status !== 'completed') {
          throw new Error(`Recherche Bing échouée : run ${run.status}`);
        }

        const results: SearchResult[] = [];
        const seen = new Set<string>();
        const messages = client.messages.list(thread.id, { order: 'asc' });
        for await (const message of messages) {
          collectCitations(message, results, seen, maxResults);
        }
        return results.slice(0, maxResults);
      } finally {
        await client.deleteAgent(agent.id);
      }
    },
  };
}

function collectCitations(
  message: ThreadMessage,
  results: SearchResult[],
  seen: Set<string>,
  maxResults: number,
): void {
  if (message.role !== 'assistant') return;
  for (const content of message.content) {
    if (!isOutputOfType<MessageTextContent>(content, 'text')) continue;
    for (const annotation of content.text.annotations) {
      if (results.length >= maxResults) return;
      const urlCitation = (annotation as { urlCitation?: { url?: string; title?: string } })
        .urlCitation;
      if (urlCitation?.url === undefined || seen.has(urlCitation.url)) continue;
      seen.add(urlCitation.url);
      results.push({
        url: urlCitation.url,
        title: urlCitation.title ?? urlCitation.url,
        snippet: annotation.text ?? '',
      });
    }
  }
}
