/**
 * Configuration du pipeline (ARCHITECTURE §4.3, §10).
 * Tout vient de l'environnement — aucun secret dans le repo.
 * Chaque rôle peut pointer vers un déploiement Azure différent ;
 * à défaut, tous utilisent AZURE_OPENAI_DEPLOYMENT.
 */

export type RoleName = 'architect' | 'writer' | 'sourcer' | 'judge' | 'critic';

export interface RoleConfig {
  deployment: string;
  /** Effort de raisonnement pour les modèles qui le supportent. */
  reasoningEffort?: 'low' | 'medium' | 'high';
}

export interface PipelineConfig {
  azure: {
    endpoint: string;
    /** Absent → auth Entra ID (DefaultAzureCredential). */
    apiKey?: string;
    apiVersion: string;
  };
  roles: Record<RoleName, RoleConfig>;
  search: {
    /** Endpoint du projet Azure AI Foundry (Agent Service). */
    projectEndpoint?: string;
    /** Id de la connexion Grounding with Bing. */
    bingConnectionId?: string;
    /** Déploiement utilisé par l'agent de recherche éphémère. */
    agentDeployment?: string;
    /** Nombre de candidats récupérés par affirmation. */
    candidatesPerClaim: number;
  };
  criticMaxIterations: number;
  articleLanguage: string;
}

function env(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value.trim() === '' ? undefined : value.trim();
}

function required(name: string): string {
  const value = env(name);
  if (value === undefined) {
    throw new Error(`Variable d'environnement requise absente : ${name}`);
  }
  return value;
}

function roleConfig(role: RoleName, fallbackDeployment: string): RoleConfig {
  const deployment = env(`CT_DEPLOYMENT_${role.toUpperCase()}`) ?? fallbackDeployment;
  const highEffortRoles: RoleName[] = ['architect', 'judge', 'critic'];
  return {
    deployment,
    reasoningEffort: highEffortRoles.includes(role) ? 'high' : 'medium',
  };
}

export function loadConfig(): PipelineConfig {
  const fallbackDeployment = required('AZURE_OPENAI_DEPLOYMENT');
  const config: PipelineConfig = {
    azure: {
      endpoint: required('AZURE_OPENAI_ENDPOINT'),
      apiVersion: env('AZURE_OPENAI_API_VERSION') ?? '2024-10-21',
    },
    roles: {
      architect: roleConfig('architect', fallbackDeployment),
      writer: roleConfig('writer', fallbackDeployment),
      sourcer: roleConfig('sourcer', fallbackDeployment),
      judge: roleConfig('judge', fallbackDeployment),
      critic: roleConfig('critic', fallbackDeployment),
    },
    search: {
      candidatesPerClaim: Number(env('CT_SEARCH_CANDIDATES') ?? '4'),
    },
    criticMaxIterations: Number(env('CT_CRITIC_MAX_ITERATIONS') ?? '3'),
    articleLanguage: env('CT_ARTICLE_LANGUAGE') ?? 'fr',
  };

  const apiKey = env('AZURE_OPENAI_API_KEY');
  if (apiKey !== undefined) config.azure.apiKey = apiKey;

  const projectEndpoint = env('AZURE_AI_PROJECT_ENDPOINT');
  if (projectEndpoint !== undefined) config.search.projectEndpoint = projectEndpoint;
  const bingConnectionId = env('AZURE_BING_CONNECTION_ID');
  if (bingConnectionId !== undefined) config.search.bingConnectionId = bingConnectionId;
  const agentDeployment = env('CT_DEPLOYMENT_SEARCH_AGENT');
  config.search.agentDeployment = agentDeployment ?? fallbackDeployment;

  return config;
}
