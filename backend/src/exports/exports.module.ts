import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { ExportRecord } from './entities/export-record.entity';
import { ExportsController } from './exports.controller';
import { ExportsService } from './exports.service';
import { EXPORT_RECORD_REPOSITORY } from './repositories/export-record.repository';
import { TypeOrmExportRecordRepository } from './repositories/typeorm-export-record.repository';

@Module({
  imports: [TypeOrmModule.forFeature([ExportRecord]), AuthModule],
  controllers: [ExportsController],
  providers: [
    ExportsService,
    {
      provide: EXPORT_RECORD_REPOSITORY,
      useClass: TypeOrmExportRecordRepository,
    },
  ],
})
export class ExportsModule {}
