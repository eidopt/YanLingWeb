import type { ThemeLayoutDocument } from '../types';
import { buildTemplateProfile } from './buildTemplateProfile';
import type { TemplateProfile } from './templateProfile';
import { applyTemplateProfileOverride, type TemplateProfileOverride } from './templateProfileOverride';

interface ProfileCacheEntry {
  templateId: string;
  templateVersion: string;
  profile: TemplateProfile;
  buildTime: number;
  createdAt: number;
  accessCount: number;
}

export interface ProfileCacheMetrics {
  hits: number;
  misses: number;
  builds: number;
  averageBuildTime: number;
  size: number;
}

export class ProfileCache {
  private cache = new Map<string, ProfileCacheEntry>();
  private hits = 0;
  private misses = 0;
  private buildTimes: number[] = [];

  constructor(
    private readonly maxCacheSize = 50,
    private readonly cacheTtlMs = 5 * 60 * 1000,
  ) {}

  getProfile(
    document: ThemeLayoutDocument,
    templateVersion = String(document.version),
    override?: TemplateProfileOverride | null,
  ): TemplateProfile {
    const overrideKey = override ? JSON.stringify(override) : 'base';
    const cacheKey = `${document.themeId}@${templateVersion}@${overrideKey}`;
    const cached = this.cache.get(cacheKey);
    if (cached && this.isValid(cached)) {
      cached.accessCount += 1;
      this.hits += 1;
      return cached.profile;
    }

    this.misses += 1;
    const startedAt = Date.now();
    const profile = applyTemplateProfileOverride(
      buildTemplateProfile(document, { templateVersion }),
      override,
    );
    const buildTime = Date.now() - startedAt;
    this.buildTimes.push(buildTime);

    this.cache.set(cacheKey, {
      templateId: document.themeId,
      templateVersion,
      profile,
      buildTime,
      createdAt: Date.now(),
      accessCount: 1,
    });

    if (this.cache.size > this.maxCacheSize) {
      this.evictLeastUsed();
    }
    return profile;
  }

  warmup(documents: ThemeLayoutDocument[], override?: TemplateProfileOverride | null): void {
    documents.forEach((document) => this.getProfile(document, String(document.version), override));
  }

  cleanup(): number {
    let removed = 0;
    for (const [key, entry] of this.cache) {
      if (!this.isValid(entry)) {
        this.cache.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    this.buildTimes = [];
  }

  metrics(): ProfileCacheMetrics {
    const totalBuildTime = this.buildTimes.reduce((sum, value) => sum + value, 0);
    return {
      hits: this.hits,
      misses: this.misses,
      builds: this.buildTimes.length,
      averageBuildTime: this.buildTimes.length ? totalBuildTime / this.buildTimes.length : 0,
      size: this.cache.size,
    };
  }

  private isValid(entry: ProfileCacheEntry): boolean {
    return Date.now() - entry.createdAt < this.cacheTtlMs;
  }

  private evictLeastUsed(): void {
    let minKey = '';
    let minAccess = Infinity;
    for (const [key, entry] of this.cache) {
      if (entry.accessCount < minAccess) {
        minAccess = entry.accessCount;
        minKey = key;
      }
    }
    if (minKey) {
      this.cache.delete(minKey);
    }
  }
}

export const profileCache = new ProfileCache();
