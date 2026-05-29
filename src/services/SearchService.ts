import { type HttpClient, resolveHttpClient } from './http/HttpClient';
import type { CreateWithAiResult, SearchIntentResponse, SearchTemplatesResult } from '@shared/types/search.types';

export type {
  CreateWithAiResult,
  SearchIntentResponse,
  SearchTemplatesResult,
  TemplateSummary,
} from '@shared/types/search.types';

// ─── Service ──────────────────────────────────────────────────────

export class SearchService {
  private readonly base = '/api/proxy/search';
  private readonly http: HttpClient;

  constructor(clientOrTokenProvider?: HttpClient | (() => string | null)) {
    this.http = resolveHttpClient(clientOrTokenProvider);
  }

  async submit(query: string): Promise<SearchIntentResponse> {
    const { data, response } = await this.http.json<Partial<SearchIntentResponse> & { message?: string }>(this.base, {
      method: 'POST',
      auth: true,
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });
    if (!response.ok) {
      throw new Error(data.message ?? `Search request failed (${response.status})`);
    }
    return data as SearchIntentResponse;
  }

  /** Type guard: check if response is a search result */
  isSearchResult(response: SearchIntentResponse): response is SearchTemplatesResult {
    return response.mode === 'search_templates';
  }

  /** Type guard: check if response is a create result */
  isCreateResult(response: SearchIntentResponse): response is CreateWithAiResult {
    return response.mode === 'create_with_ai';
  }
}
