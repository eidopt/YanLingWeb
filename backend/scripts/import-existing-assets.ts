/**
 * 手动触发：扫描整个 public/template-assets/，把尚未入库的图片登记 + 算 embedding。
 *
 * 与后端启动时的自动同步（AssetLibraryService.onModuleInit → syncFromDisk）走同一逻辑，
 * 幂等（按 storageKey 去重）。平时往该目录新增图片后，下次后端启动会自动入库；
 * 想立刻入库就跑这个命令。
 *
 * 使用：
 *   pnpm assets:import-existing       # 扫描并入库新图
 */
import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { AppModule } from '../src/app.module';
import { AssetLibraryService } from '../src/templates/asset-library.service';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const library = app.get(AssetLibraryService);
  const result = await library.syncFromDisk();
  const total = await library.count();
  console.log(
    `Asset library sync: scanned ${result.scanned}, indexed ${result.indexed} new, ` +
      `skipped ${result.skipped}. Library now holds ${total}.`,
  );
  await app.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
