import type { ThemeSpec } from 'types/theme.types';
import type {
  ThemeLayoutDocument,
  ThemeLayoutDocumentSource,
} from 'ui/layout/types';
import { normalizeThemeLayoutDocument } from 'ui/layout/types';
import type { ComponentTemplateMap, ThemeRuntime } from 'ui/renderer';

interface TemplateRecord {
  id: string;
  templateId: string;
  ownerUserId: string | null;
  sourceTemplateId: string | null;
  isPublic: boolean;
  name: string;
  tagline: string;
  description: string;
  accent: string;
  category: string;
  traits: string[];
  tags?: string[];
  cssVars: Record<string, string>;
  cssAnimations?: Record<string, string> | null;
  componentTemplates: Record<string, unknown>;
  layoutDocument: ThemeLayoutDocumentSource;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateSaveInput {
  name?: string;
  tagline?: string;
  description?: string;
  category?: string;
  traits?: string[];
  tags?: string[];
  layoutDocument?: ThemeLayoutDocument;
  componentTemplates?: Record<string, unknown>;
  cssVars?: Record<string, string>;
  cssAnimations?: Record<string, string> | null;
}

export class TemplateService {
  private readonly base = '/api/proxy/templates';

  constructor(private readonly getToken?: () => string | null) {}

  private toThemeSpec(record: TemplateRecord): ThemeSpec {
    const runtime: ThemeRuntime = {
      id: record.templateId,
      cssVars: record.cssVars,
      componentTemplates: record.componentTemplates as ComponentTemplateMap,
      ...(record.cssAnimations && { cssAnimations: record.cssAnimations }),
    };
    return {
      id: record.templateId,
      recordId: record.id,
      ownerUserId: record.ownerUserId,
      sourceTemplateId: record.sourceTemplateId,
      isPublic: record.isPublic,
      name: record.name,
      tagline: record.tagline,
      description: record.description,
      accent: record.accent,
      category: record.category,
      traits: [...record.traits],
      tags: [...(record.tags ?? [])],
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      layoutDocument: normalizeThemeLayoutDocument(
        record.layoutDocument,
      ),
      runtime,
    };
  }

  private buildQuery(params?: Record<string, string | undefined>) {
    const query = new URLSearchParams();
    Object.entries(params ?? {}).forEach(([key, value]) => {
      if (value?.trim()) {
        query.set(key, value.trim());
      }
    });
    const serialized = query.toString();
    return serialized ? `?${serialized}` : '';
  }

  private authHeaders(requireAuth: boolean): HeadersInit {
    const headers: HeadersInit = {};
    const token = this.getToken?.();
    if (requireAuth && token) {
      headers.authorization = `Bearer ${token}`;
    }
    return headers;
  }

  private async request<T>(
    path: string,
    options: RequestInit & { auth?: boolean } = {},
  ): Promise<T> {
    const { auth = false, headers, ...init } = options;
    const res = await fetch(`${this.base}${path}`, {
      ...init,
      headers: {
        ...this.authHeaders(auth),
        ...headers,
      },
    });
    const data = await res.json().catch(() => ({})) as T & { message?: string };
    if (!res.ok) {
      throw new Error(
        data.message ?? `Request failed (${res.status})`,
      );
    }
    return data;
  }

  async fetchAll(params?: {
    search?: string;
    category?: string;
  }): Promise<ThemeSpec[]> {
    const { data } = await this.request<{
      data: TemplateRecord[];
      total: number;
    }>(this.buildQuery(params));
    return data.map((r) => this.toThemeSpec(r));
  }

  async fetchMine(params?: {
    search?: string;
    category?: string;
  }): Promise<ThemeSpec[]> {
    const { data } = await this.request<{
      data: TemplateRecord[];
      total: number;
    }>(`/mine${this.buildQuery(params)}`, { auth: true });
    return data.map((r) => this.toThemeSpec(r));
  }

  async fetchRecentMine(): Promise<ThemeSpec[]> {
    const data = await this.request<TemplateRecord[]>('/recent', { auth: true });
    return data.map((r) => this.toThemeSpec(r));
  }

  async fetchById(templateId: string): Promise<ThemeSpec> {
    const record = await this.request<TemplateRecord>(`/${templateId}`);
    return this.toThemeSpec(record);
  }

  async fetchOwnedById(templateId: string): Promise<ThemeSpec> {
    const record = await this.request<TemplateRecord>(`/mine/${templateId}`, {
      auth: true,
    });
    return this.toThemeSpec(record);
  }

  async duplicate(templateId: string): Promise<ThemeSpec> {
    const record = await this.request<TemplateRecord>(
      `/${templateId}/duplicate`,
      {
        method: 'POST',
        auth: true,
      },
    );
    return this.toThemeSpec(record);
  }

  async saveOwned(
    templateId: string,
    input: TemplateSaveInput,
  ): Promise<ThemeSpec> {
    const record = await this.request<TemplateRecord>(`/mine/${templateId}`, {
      method: 'PUT',
      auth: true,
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(input),
    });
    return this.toThemeSpec(record);
  }
}
