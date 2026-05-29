import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AiTokenUsageEvent } from '../ai/entities/ai-token-usage.entity';
import { TOKEN_USAGE_REPOSITORY, TypeOrmTokenUsageRepository } from '../ai/repositories';
import { AuthModule } from '../auth/auth.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [TypeOrmModule.forFeature([AiTokenUsageEvent]), AuthModule],
  controllers: [UsersController],
  providers: [
    UsersService,
    {
      provide: TOKEN_USAGE_REPOSITORY,
      useClass: TypeOrmTokenUsageRepository,
    },
  ],
  exports: [UsersService],
})
export class UsersModule {}
