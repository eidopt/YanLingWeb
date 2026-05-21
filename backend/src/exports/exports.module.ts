import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ConfigService } from '../config/config.service';
import { ExportRecord } from './entities/export-record.entity';
import { ExportsController } from './exports.controller';
import { ExportsService } from './exports.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ExportRecord]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.jwt.secret,
      }),
    }),
  ],
  controllers: [ExportsController],
  providers: [ExportsService, JwtAuthGuard],
})
export class ExportsModule {}
