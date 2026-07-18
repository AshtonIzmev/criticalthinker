import type { AzureOpenAI } from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import type { z } from 'zod';
import type { PipelineConfig, RoleName } from '../config.js';

/**
 * Appel structuré générique (ARCHITECTURE §4.2) : prompt + sous-schéma Zod
 * → objet validé. Structured outputs strict côté API, validation Zod côté
 * client, retry borné sur erreurs transitoires. TOUTES les passes LLM
 * passent par ici — c'est le seul point de contact avec l'API.
 */

export interface StructuredRequest<T> {
  role: RoleName;
  system: string;
  user: string;
  schema: z.ZodType<T>;
  schemaName: string;
}

export type StructuredCaller = <T>(request: StructuredRequest<T>) => Promise<T>;

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2000;

export function createStructuredCaller(
  client: AzureOpenAI,
  config: PipelineConfig,
): StructuredCaller {
  return async function callStructured<T>(request: StructuredRequest<T>): Promise<T> {
    const roleConfig = config.roles[request.role];
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const completion = await client.chat.completions.parse({
          model: roleConfig.deployment,
          messages: [
            { role: 'system', content: request.system },
            { role: 'user', content: request.user },
          ],
          response_format: zodResponseFormat(request.schema, request.schemaName),
          ...(roleConfig.reasoningEffort !== undefined
            ? { reasoning_effort: roleConfig.reasoningEffort }
            : {}),
        });
        const parsed = completion.choices[0]?.message.parsed;
        if (parsed === null || parsed === undefined) {
          throw new Error(
            `Réponse sans contenu structuré (rôle ${request.role}, ${request.schemaName})`,
          );
        }
        return parsed;
      } catch (error) {
        lastError = error;
        if (attempt < MAX_ATTEMPTS && isTransient(error)) {
          await sleep(RETRY_DELAY_MS * attempt);
          continue;
        }
        throw error;
      }
    }
    throw lastError;
  };
}

function isTransient(error: unknown): boolean {
  const status = (error as { status?: number }).status;
  return status === 429 || (status !== undefined && status >= 500);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
