import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ConfigService } from '../config/config.service';
import { createDatabaseOptions } from './databaseOptions.factory';

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => createDatabaseOptions(config.raw),
    }),
  ],
})
export class DatabaseModule {}
