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
