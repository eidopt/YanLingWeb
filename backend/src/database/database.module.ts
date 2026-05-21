import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ConfigService } from '../config/config.service';
import { DatabaseFlushService } from './database-flush.service';
import { createDatabaseOptions } from './database-options.factory';

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => createDatabaseOptions(config.raw),
    }),
  ],
  providers: [DatabaseFlushService],
  exports: [DatabaseFlushService],
})
export class DatabaseModule {}
