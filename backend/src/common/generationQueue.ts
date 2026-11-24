import { Injectable } from '@nestjs/common';

/**
 * In-process limiter for paid generation work. Jobs are not durable across restart.
 */
@Injectable()
export class GenerationQueue {
  private imageActive = 0;
  private templateActive = 0;
  private readonly imageWaiters: (() => void)[] = [];
  private readonly templateWaiters: (() => void)[] = [];

  constructor(
    private readonly imageLimit = 2,
    private readonly templateLimit = 1,
  ) {}

  runImage<T>(task: () => Promise<T>): Promise<T> {
    return this.run(
      this.imageLimit,
      () => this.imageActive,
      (value) => {
        this.imageActive = value;
      },
      this.imageWaiters,
      task,
    );
  }

  runTemplate<T>(task: () => Promise<T>): Promise<T> {
    return this.run(
      this.templateLimit,
      () => this.templateActive,
      (value) => {
        this.templateActive = value;
      },
      this.templateWaiters,
      task,
    );
  }

  private async run<T>(
    limit: number,
    readActive: () => number,
    writeActive: (value: number) => void,
    waiters: (() => void)[],
    task: () => Promise<T>,
  ): Promise<T> {
    if (readActive() >= limit) {
      await new Promise<void>((resolve) => {
        waiters.push(resolve);
      });
    }
    writeActive(readActive() + 1);
    try {
      return await task();
    } finally {
      writeActive(readActive() - 1);
      waiters.shift()?.();
    }
  }
}
