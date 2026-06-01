/**
 * 预生成图片素材库 CLI
 *
 * 按 manifest 批量生成常用 APP 示例图，落盘到 public/template-assets/pool/，并写入
 * asset_library_images 表（带 大类 + 关键词 + 角色 索引）。模板生成时可通过
 * PooledTemplateAssetStore.findByIndex 按语义命中复用，省去重复生图。
 *
 * 使用：
 *   pnpm assets:pregenerate -- --dry-run            # 只打印将生成什么，不调 API
 *   pnpm assets:pregenerate -- --count 15           # 只跑前 15 条（小批验证）
 *   pnpm assets:pregenerate -- --category fruit      # 只跑某大类
 *   pnpm assets:pregenerate                          # 跑全部 manifest（几百张，按张计费）
 *   pnpm assets:pregenerate -- --reindex            # 给没有 embedding 的历史行补算向量
 *
 * 已在库里的 slug 会自动跳过 → 可断点续跑。生成的图会算 embedding 入库供语义复用。
 */
import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { AppModule } from '../src/app.module';
import { AssetLibraryService } from '../src/templates/asset-library.service';
import { ASSET_LIBRARY_MANIFEST } from './asset-library-manifest';

interface CliOptions {
  count?: number;
  category?: string;
  dryRun: boolean;
  reindex: boolean;
  reindexAll: boolean;
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const opts: CliOptions = { dryRun: false, reindex: false, reindexAll: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--count' && args[i + 1]) {
      opts.count = Number(args[++i]);
    } else if (arg === '--category' && args[i + 1]) {
      opts.category = args[++i];
    } else if (arg === '--dry-run') {
      opts.dryRun = true;
    } else if (arg === '--reindex') {
      opts.reindex = true;
    } else if (arg === '--reindex-all') {
      opts.reindex = true;
      opts.reindexAll = true;
    }
  }
  return opts;
}

async function main(): Promise<void> {
  const opts = parseArgs();

  let specs = ASSET_LIBRARY_MANIFEST;
  if (opts.category) {
    specs = specs.filter((s) => s.category === opts.category);
  }
  if (typeof opts.count === 'number') {
    specs = specs.slice(0, opts.count);
  }

  console.log(
    `Asset library manifest: ${ASSET_LIBRARY_MANIFEST.length} total, running ${specs.length}` +
      `${opts.dryRun ? ' (dry-run)' : ''}`,
  );

  if (opts.dryRun) {
    for (const s of specs) {
      console.log(`  [${s.category}/${s.role}] ${s.slug}  alt="${s.alt}"  kw=[${s.keywords.join(',')}]`);
    }
    console.log(`\nDry-run only. ${specs.length} specs would be generated.`);
    return;
  }

  console.log('Starting NestJS application context without HTTP...');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const library = app.get(AssetLibraryService);

  if (opts.reindex) {
    const updated = await library.reindexMissing(opts.reindexAll);
    console.log(
      `Reindexed embeddings for ${updated} row(s)${opts.reindexAll ? ' (forced all)' : ' (missing only)'}.`,
    );
  }

  const stats = { created: 0, skipped: 0, failed: 0 };
  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i];
    const result = await library.pregenerateOne(spec);
    stats[result.status] += 1;
    const tag = `[${i + 1}/${specs.length}]`;
    if (result.status === 'created') {
      console.log(`${tag} ✓ ${spec.slug} → ${result.url}`);
    } else if (result.status === 'skipped') {
      console.log(`${tag} • ${spec.slug} (skipped: ${result.reason})`);
    } else {
      console.error(`${tag} ✗ ${spec.slug} (failed: ${result.reason})`);
    }
  }

  const total = await library.count();
  console.log('\n========== Summary ==========');
  console.log(`  Created: ${stats.created}  Skipped: ${stats.skipped}  Failed: ${stats.failed}`);
  console.log(`  Asset library now holds ${total} images.`);

  await app.close();
  process.exit(stats.failed > 0 && stats.created === 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal CLI error:', err);
  process.exit(1);
});
