import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ConfigService } from '../config/config.service';
import { User } from '../users/entities/user.entity';
import { TypeOrmUserAccountRepository, USER_ACCOUNT_REPOSITORY } from '../users/repositories';
import { AdminGuard } from './admin.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwtAuth.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.jwt.secret,
        signOptions: { expiresIn: config.jwt.expiresIn },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtAuthGuard,
    AdminGuard,
    {
      provide: USER_ACCOUNT_REPOSITORY,
      useClass: TypeOrmUserAccountRepository,
    },
  ],
  exports: [AuthService, JwtModule, JwtAuthGuard, AdminGuard, USER_ACCOUNT_REPOSITORY],
})
export class AuthModule {}
