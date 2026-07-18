import { DefaultAzureCredential, getBearerTokenProvider } from '@azure/identity';
import { AzureOpenAI } from 'openai';
import type { PipelineConfig } from '../config.js';

/**
 * Client Azure OpenAI (ARCHITECTURE §4.1).
 * Entra ID (DefaultAzureCredential) de préférence ; clé API en repli.
 */
export function createAzureClient(config: PipelineConfig): AzureOpenAI {
  const { endpoint, apiKey, apiVersion } = config.azure;
  if (apiKey !== undefined) {
    return new AzureOpenAI({ endpoint, apiKey, apiVersion });
  }
  const azureADTokenProvider = getBearerTokenProvider(
    new DefaultAzureCredential(),
    'https://cognitiveservices.azure.com/.default',
  );
  return new AzureOpenAI({ endpoint, azureADTokenProvider, apiVersion });
}
