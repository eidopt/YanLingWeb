import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';

import { AiTokenUsageEvent } from '../entities/aiTokenUsage.entity';
import type { CreateTokenUsageEventInput, TokenUsageRepository } from './tokenUsage.repository';

@Injectable()
export class TypeOrmTokenUsageRepository implements TokenUsageRepository {
  constructor(
    @InjectRepository(AiTokenUsageEvent)
    private readonly repo: Repository<AiTokenUsageEvent>,
  ) {}

  recordEvent(input: CreateTokenUsageEventInput): Promise<AiTokenUsageEvent> {
    return this.repo.save(this.repo.create(input));
  }

  findForOwner(ownerUserId: string): Promise<AiTokenUsageEvent[]> {
    return this.repo.find({
      where: { ownerUserId },
      order: { createdAt: 'DESC' },
    });
  }

  findCacheRecords(ownerUserId: string, limit: number): Promise<AiTokenUsageEvent[]> {
    return this.repo.find({
      where: { ownerUserId, cacheHitTokens: Not(IsNull()) },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }
}
