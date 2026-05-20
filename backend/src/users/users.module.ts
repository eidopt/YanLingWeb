import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AiTokenUsageEvent } from '../ai/entities/ai-token-usage.entity';
import { ConfigFactory } from '../config/config.factory';
import { User } from './entities/user.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, AiTokenUsageEvent]),
    JwtModule.registerAsync({
      useFactory: () => {
        const env = ConfigFactory.build();
        return {
          secret: env.jwt.secret,
          signOptions: { expiresIn: env.jwt.expiresIn },
        };
      },
    }),
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
