import { Inject, Injectable, Logger } from '@nestjs/common';

import { USER_ACCOUNT_REPOSITORY, type UserAccountRepository } from '../../users/repositories';
import type { AiTokenUsageEndpoint } from '../entities/aiTokenUsage.entity';
import {
  TOKEN_USAGE_REPOSITORY,
  type TokenUsageRepository,
} from '../repositories/tokenUsage.repository';

export interface AiCacheStatsDto {
  totalRequests: number;
  totalCacheHitTokens: number;
  totalCacheMissTokens: number;
  overallCacheHitRate: string;
  byEndpoint: {
    endpoint: AiTokenUsageEndpoint | 'unknown';
    count: number;
    cacheHitTokens: number;
    cacheMissTokens: number;
    hitRate: string;
  }[];
  recentRequests: {
    timestamp: string;
    endpoint: AiTokenUsageEndpoint;
    model: string;
    cacheHitTokens: number | null;
    cacheMissTokens: number | null;
    hitRate: string;
  }[];
}

interface TokenUsagePayload {
  inputTokens: number;
  outputTokens: number;
  cacheHitTokens?: number;
  cacheMissTokens?: number;
}

@Injectable()
export class TokenUsageService {
  private readonly logger = new Logger(TokenUsageService.name);
  private readonly userBalanceLocks = new Map<string, Promise<void>>();

  constructor(
    @Inject(TOKEN_USAGE_REPOSITORY)
    private readonly tokenUsage: TokenUsageRepository,
    @Inject(USER_ACCOUNT_REPOSITORY)
    private readonly users: UserAccountRepository,
  ) {}

  async recordTokenUsage(
    ownerUserId: string,
    model: string,
    usage: TokenUsagePayload,
    endpoint: AiTokenUsageEndpoint,
    provider: string,
  ): Promise<number | undefined> {
    const inputTokens = this.sanitizeTokenCount(usage.inputTokens);
    const outputTokens = this.sanitizeTokenCount(usage.outputTokens);
    const totalTokens = inputTokens + outputTokens;

    if (totalTokens <= 0) {
      return undefined;
    }

    try {
      await this.tokenUsage.recordEvent({
        ownerUserId,
        endpoint,
        provider,
        model,
        inputTokens,
        outputTokens,
        totalTokens,
        cacheHitTokens: this.sanitizeOptionalTokenCount(usage.cacheHitTokens),
        cacheMissTokens: this.sanitizeOptionalTokenCount(usage.cacheMissTokens),
      });

      return await this.enqueueUserBalanceUpdate(ownerUserId, totalTokens);
    } catch (err) {
      this.logger.error(
        'Failed to record AI token usage',
        err instanceof Error ? err.message : err,
      );
    }
  }

  private applyUserBalanceUpdate(ownerUserId: string, totalTokens: number): Promise<number> {
    return this.users.debitTokens(ownerUserId, totalTokens);
  }

  private enqueueUserBalanceUpdate(ownerUserId: string, totalTokens: number): Promise<number> {
    const previous = this.userBalanceLocks.get(ownerUserId) ?? Promise.resolve();
    const next = previous.then(() => this.applyUserBalanceUpdate(ownerUserId, totalTokens));
    const settled = next.then(
      () => undefined,
      () => undefined,
    );
    const tracked = settled.finally(() => {
      if (this.userBalanceLocks.get(ownerUserId) === tracked) {
        this.userBalanceLocks.delete(ownerUserId);
      }
    });
    this.userBalanceLocks.set(ownerUserId, tracked);
    return next;
  }

  logCacheUsage(
    ownerUserId: string,
    model: string,
    usage: TokenUsagePayload,
    endpoint: AiTokenUsageEndpoint,
  ): void {
    const hitTokens = this.sanitizeTokenCount(usage.cacheHitTokens);
    const missTokens = this.sanitizeTokenCount(usage.cacheMissTokens);
    const total = hitTokens + missTokens;
    if (total <= 0) {
      return;
    }

    const rate = hitTokens / total;
    const ratio = (rate * 100).toFixed(1);
    const user = ownerUserId.slice(0, 8);
    this.logger.log(
      `[Cache] endpoint=${endpoint} user=${user} model=${model} ` +
        `hit=${hitTokens} miss=${missTokens} ratio=${ratio}%`,
    );
    if (rate < 0.3) {
      this.logger.warn(
        `[Cache] low hit rate (${ratio}%) for endpoint=${endpoint}; ` +
          'check whether stable context is being placed before per-turn data.',
      );
    }
  }

  async getCacheStats(ownerUserId: string): Promise<AiCacheStatsDto> {
    const records = await this.tokenUsage.findCacheRecords(ownerUserId, 100);

    const totalHit = records.reduce((sum, record) => sum + (record.cacheHitTokens ?? 0), 0);
    const totalMiss = records.reduce((sum, record) => sum + (record.cacheMissTokens ?? 0), 0);
    const byEndpoint = new Map<
      AiTokenUsageEndpoint,
      {
        count: number;
        cacheHitTokens: number;
        cacheMissTokens: number;
      }
    >();

    for (const record of records) {
      const current = byEndpoint.get(record.endpoint) ?? {
        count: 0,
        cacheHitTokens: 0,
        cacheMissTokens: 0,
      };
      current.count += 1;
      current.cacheHitTokens += record.cacheHitTokens ?? 0;
      current.cacheMissTokens += record.cacheMissTokens ?? 0;
      byEndpoint.set(record.endpoint, current);
    }

    return {
      totalRequests: records.length,
      totalCacheHitTokens: totalHit,
      totalCacheMissTokens: totalMiss,
      overallCacheHitRate: this.formatHitRate(totalHit, totalMiss),
      byEndpoint: [...byEndpoint.entries()].map(([endpoint, stats]) => ({
        endpoint,
        count: stats.count,
        cacheHitTokens: stats.cacheHitTokens,
        cacheMissTokens: stats.cacheMissTokens,
        hitRate: this.formatHitRate(stats.cacheHitTokens, stats.cacheMissTokens),
      })),
      recentRequests: records.slice(0, 20).map((record) => ({
        timestamp: record.createdAt.toISOString(),
        endpoint: record.endpoint,
        model: record.model,
        cacheHitTokens: record.cacheHitTokens,
        cacheMissTokens: record.cacheMissTokens,
        hitRate: this.formatHitRate(record.cacheHitTokens ?? 0, record.cacheMissTokens ?? 0),
      })),
    };
  }

  private sanitizeTokenCount(value: number | undefined): number {
    if (!Number.isFinite(value) || value === undefined || value <= 0) {
      return 0;
    }
    return Math.floor(Math.min(value, Number.MAX_SAFE_INTEGER));
  }

  private sanitizeOptionalTokenCount(value: number | undefined): number | null {
    const sanitized = this.sanitizeTokenCount(value);
    return sanitized > 0 ? sanitized : null;
  }

  private formatHitRate(hitTokens: number, missTokens: number): string {
    const total = hitTokens + missTokens;
    return total > 0 ? `${((hitTokens / total) * 100).toFixed(1)}%` : 'N/A';
  }
}
