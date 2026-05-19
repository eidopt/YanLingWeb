import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ConfigFactory } from '../config/config.factory';
import { DatabaseFlushService } from './database-flush.service';
import { createDatabaseOptions } from './database-options.factory';

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => createDatabaseOptions(ConfigFactory.build()),
    }),
  ],
  providers: [DatabaseFlushService],
  exports: [DatabaseFlushService],
})
export class DatabaseModule {}
