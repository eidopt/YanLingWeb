import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { ExportRecord } from './entities/exportRecord.entity';
import { ExportsController } from './exports.controller';
import { ExportsService } from './exports.service';
import { EXPORT_RECORD_REPOSITORY } from './repositories/exportRecord.repository';
import { TypeOrmExportRecordRepository } from './repositories/typeormExportRecord.repository';

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
