import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ExportRecord } from './entities/export-record.entity';
import { ExportsController } from './exports.controller';
import { ExportsService } from './exports.service';

@Module({
  imports: [TypeOrmModule.forFeature([ExportRecord])],
  controllers: [ExportsController],
  providers: [ExportsService],
})
export class ExportsModule {}
