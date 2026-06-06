import type { TemplateToolInput } from '../tools/generateTemplate.tool';
import { type HttpClient, resolveHttpClient } from 'services/http/HttpClient';

export interface GeneratedTemplateSaveResult {
  templateId: string;
  action: string;
}

export interface TemplateStore {
  saveGeneratedTemplate(input: TemplateToolInput): Promise<GeneratedTemplateSaveResult>;
}

export class BrowserTemplateStore implements TemplateStore {
  private readonly http: HttpClient;

  constructor(getToken: () => string | null, httpClient?: HttpClient) {
    this.http = httpClient ?? resolveHttpClient(getToken);
  }

  async saveGeneratedTemplate(input: TemplateToolInput): Promise<GeneratedTemplateSaveResult> {
    const { data, response } = await this.http.json<GeneratedTemplateSaveResult>('/api/proxy/ai/templates', {
      method: 'POST',
      auth: true,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      let message = `Failed to save template (${String(response.status)})`;
      const errorMessage = (data as { message?: unknown }).message;
      if (typeof errorMessage === 'string') {
        message = errorMessage;
      }
      throw new Error(message);
    }

    return data;
  }
}
