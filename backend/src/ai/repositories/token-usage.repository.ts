import type { AiTokenUsageEndpoint, AiTokenUsageEvent } from '../entities/ai-token-usage.entity';

export const TOKEN_USAGE_REPOSITORY = Symbol('TOKEN_USAGE_REPOSITORY');

export interface CreateTokenUsageEventInput {
  ownerUserId: string;
  endpoint: AiTokenUsageEndpoint;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheHitTokens: number | null;
  cacheMissTokens: number | null;
}

export interface TokenUsageRepository {
  recordEvent(input: CreateTokenUsageEventInput): Promise<AiTokenUsageEvent>;
  findForOwner(ownerUserId: string): Promise<AiTokenUsageEvent[]>;
  findCacheRecords(ownerUserId: string, limit: number): Promise<AiTokenUsageEvent[]>;
}
