import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

interface SqlJsDriverLike {
  options: {
    location?: string;
  };
  save(location?: string): Promise<void>;
}

@Injectable()
export class DatabaseFlushService {
  private readonly logger = new Logger(DatabaseFlushService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async flush(reason?: string): Promise<void> {
    const driver = this.dataSource.driver;

    if (!isSqlJsDriver(driver)) {
      return;
    }

    try {
      await driver.save(driver.options.location);
      this.logger.debug(
        `Database flushed${reason ? ` after ${reason}` : ''}`
          + ` to ${driver.options.location ?? 'default location'}`,
      );
    } catch (err) {
      this.logger.error(
        'Database flush failed',
        err instanceof Error ? err.message : err,
      );
    }
  }
}

function isSqlJsDriver(driver: unknown): driver is SqlJsDriverLike {
  if (!driver || typeof driver !== 'object') {
    return false;
  }

  const candidate = driver as Partial<SqlJsDriverLike>;
  return typeof candidate.save === 'function';
}
