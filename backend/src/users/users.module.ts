import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AiTokenUsageEvent } from '../ai/entities/aiTokenUsage.entity';
import { TOKEN_USAGE_REPOSITORY, TypeOrmTokenUsageRepository } from '../ai/repositories';
import { AuthModule } from '../auth/auth.module';
import { UserQuotaService } from './services/userQuota.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [TypeOrmModule.forFeature([AiTokenUsageEvent]), AuthModule],
  controllers: [UsersController],
  providers: [
    UsersService,
    UserQuotaService,
    {
      provide: TOKEN_USAGE_REPOSITORY,
      useClass: TypeOrmTokenUsageRepository,
    },
  ],
  exports: [UsersService, UserQuotaService],
})
export class UsersModule {}
