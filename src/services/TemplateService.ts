import { type HttpClient, resolveHttpClient } from './http/HttpClient';
import { normalizeVisualAssets } from '@shared/theme-layout/visualAssets';
import type { TemplateAgentConfig, ThemeSpec } from 'types/theme.types';
import type { ThemeLayoutDocument, ThemeLayoutDocumentSource } from 'ui/layout/types';
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
  categoryLabel?: string;
  displayCategory?: string;
  displayCategoryLabel?: string;
  platformCategories?: string[];
  platformCategoryLabels?: Record<string, string>;
  functionalCategories?: string[];
  functionalCategoryLabels?: Record<string, string>;
  traits: string[];
  tags?: string[];
  cssVars: Record<string, string>;
  visualAssets?: unknown;
  cssAnimations?: Record<string, string> | null;
  componentTemplates: Record<string, unknown>;
  layoutDocument: ThemeLayoutDocumentSource;
  agentConfig?: TemplateAgentConfig;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateSaveInput {
  name?: string;
  tagline?: string;
  description?: string;
  category?: string;
  displayCategory?: string;
  platformCategories?: string[];
  functionalCategories?: string[];
  traits?: string[];
  tags?: string[];
  layoutDocument?: ThemeLayoutDocument;
  componentTemplates?: Record<string, unknown>;
  cssVars?: Record<string, string>;
  cssAnimations?: Record<string, string> | null;
}

export class TemplateRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'TemplateRequestError';
  }
}

function retryAfterMs(headers: Headers): number | undefined {
  const value = headers.get('retry-after');
  if (!value) {
    return undefined;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.min(seconds * 1000, 60_000);
  }
  const date = Date.parse(value);
  if (!Number.isFinite(date)) {
    return undefined;
  }
  return Math.max(0, Math.min(date - Date.now(), 60_000));
}

export class TemplateService {
  private readonly base = '/api/proxy/templates';
  private readonly http: HttpClient;

  constructor(clientOrTokenProvider?: HttpClient | (() => string | null)) {
    this.http = resolveHttpClient(clientOrTokenProvider);
  }

  private toThemeSpec(record: TemplateRecord): ThemeSpec {
    const runtime: ThemeRuntime = {
      id: record.templateId,
      cssVars: record.cssVars,
      componentTemplates: record.componentTemplates as ComponentTemplateMap,
      ...(record.cssAnimations && { cssAnimations: record.cssAnimations }),
    };
    const visualAssets = normalizeVisualAssets(record.visualAssets ?? record.agentConfig?.assets?.visualAssets);
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
      categoryLabel: record.categoryLabel ?? record.category,
      displayCategory: record.displayCategory,
      displayCategoryLabel: record.displayCategoryLabel ?? record.displayCategory,
      platformCategories: [...(record.platformCategories ?? [])],
      platformCategoryLabels: { ...(record.platformCategoryLabels ?? {}) },
      functionalCategories: [...(record.functionalCategories ?? [])],
      functionalCategoryLabels: { ...(record.functionalCategoryLabels ?? {}) },
      traits: [...record.traits],
      tags: [...(record.tags ?? [])],
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      layoutDocument: normalizeThemeLayoutDocument(record.layoutDocument),
      runtime,
      ...(visualAssets.length > 0 && { visualAssets }),
      ...(record.agentConfig && { agentConfig: record.agentConfig }),
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

  private async request<T>(path: string, options: RequestInit & { auth?: boolean } = {}): Promise<T> {
    const { auth = false, headers, ...init } = options;
    const { data, response } = await this.http.json<T & { message?: string }>(`${this.base}${path}`, {
      ...init,
      auth,
      headers,
    });
    if (!response.ok) {
      throw new TemplateRequestError(
        data.message ?? `Request failed (${response.status})`,
        response.status,
        retryAfterMs(response.headers),
      );
    }
    return data;
  }

  async fetchAll(params?: {
    search?: string;
    category?: string;
    displayCategory?: string;
    platformCategory?: string;
  }): Promise<ThemeSpec[]> {
    // HttpClient already unwraps the success envelope's top-level `data`, so the
    // paginated list endpoint resolves to the TemplateRecord[] array directly
    // (mirrors fetchRecentMine). The `total` lives in the discarded envelope meta.
    const records = await this.request<TemplateRecord[]>(this.buildQuery(params));
    return records.map((r) => this.toThemeSpec(r));
  }

  async fetchMine(params?: {
    search?: string;
    category?: string;
    displayCategory?: string;
    platformCategory?: string;
  }): Promise<ThemeSpec[]> {
    const records = await this.request<TemplateRecord[]>(`/mine${this.buildQuery(params)}`, { auth: true });
    return records.map((r) => this.toThemeSpec(r));
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
    const record = await this.request<TemplateRecord>(`/${templateId}/duplicate`, {
      method: 'POST',
      auth: true,
    });
    return this.toThemeSpec(record);
  }

  async saveOwned(templateId: string, input: TemplateSaveInput): Promise<ThemeSpec> {
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
