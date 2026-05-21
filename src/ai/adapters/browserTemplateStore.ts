import type { TemplateToolInput } from '../tools/generate-template.tool';

export interface GeneratedTemplateSaveResult {
  templateId: string;
  action: string;
}

export interface TemplateStore {
  saveGeneratedTemplate(input: TemplateToolInput): Promise<GeneratedTemplateSaveResult>;
}

export class BrowserTemplateStore implements TemplateStore {
  constructor(private readonly getToken: () => string | null) {}

  async saveGeneratedTemplate(input: TemplateToolInput): Promise<GeneratedTemplateSaveResult> {
    const token = this.getToken();
    const res = await fetch('/api/proxy/ai/templates', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(input),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let message = `Failed to save template (${String(res.status)})`;
      try {
        message = (JSON.parse(text) as { message?: string }).message ?? message;
      } catch {
        // keep status-based message
      }
      throw new Error(message);
    }

    return await res.json() as GeneratedTemplateSaveResult;
  }
}
