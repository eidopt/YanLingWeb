export interface SearchIntentResponse {
  status: 'stub';
  mode: 'search_templates' | 'create_blank_template';
  query: string;
  message: string;
}

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
}
