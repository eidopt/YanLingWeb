// ─── Response Types ───────────────────────────────────────────────

export interface TemplateSummary {
  templateId: string;
  name: string;
  tagline: string;
  description: string;
  category: string;
  displayCategory?: string;
  accent: string;
  traits: string[];
  tags: string[];
}

export interface SearchTemplatesResult {
  status: 'ok';
  mode: 'search_templates';
  query: string;
  results: TemplateSummary[];
  total: number;
}

export interface CreateWithAiResult {
  status: 'ok';
  mode: 'create_with_ai';
  query: string;
}

export type SearchIntentResponse = SearchTemplatesResult | CreateWithAiResult;

// ─── Service ──────────────────────────────────────────────────────

export class SearchService {
  private readonly base = '/api/proxy/search';

  constructor(private readonly getToken?: () => string | null) {}

  async submit(query: string): Promise<SearchIntentResponse> {
    const token = this.getToken?.();
    const res = await fetch(this.base, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ query }),
    });
    const data = await res.json().catch(() => ({})) as Partial<SearchIntentResponse> & {
      message?: string;
    };
    if (!res.ok) {
      throw new Error(data.message ?? `Search request failed (${res.status})`);
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
