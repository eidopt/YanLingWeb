import type { ThemeSpec } from 'types/theme.types';
import type { ThemeLayoutDocumentSource } from 'ui/layout/types';
import { normalizeThemeLayoutDocument } from 'ui/layout/types';
import type { ComponentTemplateMap, ThemeRuntime } from 'ui/renderer';

interface TemplateRecord {
  id: string;
  templateId: string;
  name: string;
  tagline: string;
  description: string;
  accent: string;
  category: string;
  traits: string[];
  cssVars: Record<string, string>;
  cssAnimations?: Record<string, string>;
  componentTemplates: Record<string, unknown>;
  layoutDocument: ThemeLayoutDocumentSource;
  createdAt: string;
  updatedAt: string;
}

export class TemplateService {
  private readonly base = '/api/proxy/templates';

  private toThemeSpec(record: TemplateRecord): ThemeSpec {
    const runtime: ThemeRuntime = {
      id: record.templateId,
      cssVars: record.cssVars,
      componentTemplates: record.componentTemplates as ComponentTemplateMap,
      ...(record.cssAnimations && { cssAnimations: record.cssAnimations }),
    };
    return {
      id: record.templateId,
      name: record.name,
      tagline: record.tagline,
      description: record.description,
      accent: record.accent,
      category: record.category,
      traits: [...record.traits],
      layoutDocument: normalizeThemeLayoutDocument(
        record.layoutDocument,
      ),
      runtime,
    };
  }

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.base}${path}`);
    const data = await res.json() as T & { message?: string };
    if (!res.ok) {
      throw new Error(
        (data as { message?: string }).message ?? `Request failed (${res.status})`,
      );
    }
    return data;
  }

  async fetchAll(): Promise<ThemeSpec[]> {
    const { data } = await this.get<{ data: TemplateRecord[]; total: number }>('');
    return data.map((r) => this.toThemeSpec(r));
  }

  async fetchById(templateId: string): Promise<ThemeSpec> {
    const record = await this.get<TemplateRecord>(`/${templateId}`);
    return this.toThemeSpec(record);
  }
}
