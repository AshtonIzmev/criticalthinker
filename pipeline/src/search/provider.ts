/**
 * Interface de recherche web (ARCHITECTURE §5.1).
 * Implémentation par défaut : Grounding with Bing (Foundry Agent Service).
 * L'interface permet d'en brancher une autre sans toucher au pipeline.
 */

export interface SearchResult {
  url: string;
  title: string;
  snippet: string;
}

export interface SearchProvider {
  search(query: string, maxResults: number): Promise<SearchResult[]>;
}
