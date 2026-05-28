/**
 * 批量模板生成 CLI
 *
 * 使用：
 *   pnpm templates:generate                  # 跑全部 seed briefs
 *   pnpm templates:generate -- --count 5     # 跑前 5 个
 *   pnpm templates:generate -- --id commerce-fresh-delivery  # 跑单个（按 prompt 关键词匹配）
 *   pnpm templates:generate -- --dry-run     # 仅打印 brief，不写文件
 *
 * 通过 NestFactory.createApplicationContext 启动一个无 HTTP 的 Nest 上下文，
 * 直接调用 AiTemplatesService.generate()。不走 HTTP，省一层认证 + SSE 解码。
 */
// reflect-metadata 必须最先 import，否则 TypeORM 装饰器读不到列类型
import 'reflect-metadata';

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { NestFactory } from '@nestjs/core';

import { AiTemplatesService } from '../src/ai-templates/ai-templates.service';
import type { PipelineResult } from '../src/ai-templates/orchestrator/pipeline.types';
import { AppModule } from '../src/app.module';
import { SEED_BRIEFS } from './briefs/seed-briefs';

/**
 * displayCategory slug → 中文标签的标准映射。
 * 来自 README §1 displayCategory 分类约定。
 */
const DISPLAY_CATEGORY_LABELS: Record<string, string> = {
  commerce: '电商购物',
  service: '本地服务',
  content: '内容资讯',
  education: '教育培训',
  health: '健康医疗',
  social: '社交娱乐',
  finance: '金融理财',
  marketing: '营销活动',
  utility: '工具应用',
  dashboard: '数据看板',
  profile: '个人中心',
  other: '其他',
};

interface CliOptions {
  count?: number;
  match?: string;
  dryRun: boolean;
  outputDir: string;
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  // CLI 从 backend/ 目录运行（用 ts-node + reflect-metadata），
  // 默认输出指向项目根的 templates_json/，让 backend onModuleInit 可以扫描导入。
  const projectRoot = join(__dirname, '..', '..');
  const opts: CliOptions = {
    dryRun: false,
    outputDir: join(projectRoot, 'templates_json'),
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--count' && args[i + 1]) {
      opts.count = Number(args[++i]);
    } else if (arg === '--id' && args[i + 1]) {
      opts.match = args[++i];
    } else if (arg === '--dry-run') {
      opts.dryRun = true;
    } else if (arg === '--out' && args[i + 1]) {
      opts.outputDir = args[++i];
    }
  }
  return opts;
}

/**
 * 把流水线结果序列化成 templates_json/ seed 导入格式。
 *
 * 文件结构（与 README + parseTemplateJsonSeed 对齐）：
 * - 顶层：templateId / name / tagline / description / accent /
 *   category / displayCategory / platformCategories / functionalCategories /
 *   traits / tags / cssVars / cssAnimations / componentTemplates
 * - 嵌套：layoutDocument 内含 pages / components / layout / visualAssets 等
 *
 * 在 traits 中注入 archetype/hero/sig 前缀，让后续 Diversity Critic
 * 能识别本批次模板的视觉签名。
 */
function buildOutputJson(result: PipelineResult): Record<string, unknown> {
  const { brief, document } = result;
  const rawDocument = document as unknown as Record<string, unknown>;
  const isRecord = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === 'object' && !Array.isArray(v);

  const traits = [
    `archetype:${brief.archetype}`,
    `hero:${brief.heroMode}`,
    `sig:${brief.diversitySignature}`,
  ];

  // componentTemplates / cssVars / cssAnimations 提到顶层（seed 格式期望位置）
  const componentTemplates = isRecord(rawDocument.componentTemplates)
    ? rawDocument.componentTemplates
    : {};
  const cssVars = isRecord(rawDocument.cssVars)
    ? rawDocument.cssVars as Record<string, string>
    : brief.cssVars;
  const cssAnimations = isRecord(rawDocument.cssAnimations)
    ? rawDocument.cssAnimations
    : undefined;

  const displayCategoryLabel = DISPLAY_CATEGORY_LABELS[brief.displayCategory]
    ?? brief.displayCategory;

  return {
    templateId: brief.templateId,
    name: brief.name,
    tagline: brief.tagline,
    description: brief.scenario,
    accent: brief.cssVars['--color-primary'] ?? '#000000',
    category: brief.category,
    categoryLabel: brief.name,
    displayCategory: brief.displayCategory,
    displayCategoryLabel,
    displayCategoryLabels: { [brief.displayCategory]: displayCategoryLabel },
    platformCategories: [brief.platform],
    functionalCategories: [brief.category],
    functionalCategoryLabels: { [brief.category]: brief.name },
    traits,
    tags: [brief.archetype, brief.heroMode, brief.displayCategory],
    cssVars,
    ...(cssAnimations ? { cssAnimations } : {}),
    componentTemplates,
    layoutDocument: rawDocument,
  };
}

async function main(): Promise<void> {
  const opts = parseArgs();

  console.log('🚀 启动 NestJS 上下文（无 HTTP 模式）...');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const service = app.get(AiTemplatesService);

  let briefs = SEED_BRIEFS;
  if (opts.match) {
    briefs = briefs.filter((b) => b.prompt.includes(opts.match!));
    if (briefs.length === 0) {
      console.error(`没有匹配 "${opts.match}" 的 brief`);
      await app.close();
      process.exit(1);
    }
  }
  if (typeof opts.count === 'number') {
    briefs = briefs.slice(0, opts.count);
  }

  if (!opts.dryRun) {
    mkdirSync(opts.outputDir, { recursive: true });
  }

  const stats = {
    total: briefs.length,
    succeeded: 0,
    failed: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCacheHit: 0,
    totalAttempts: 0,
  };

  for (let i = 0; i < briefs.length; i++) {
    const seed = briefs[i];
    const label = `[${i + 1}/${briefs.length}] "${seed.prompt}"`;
    console.log(`\n${label}`);

    try {
      const result = await service.generate(seed);

      // 累加 token 统计
      const sumStage = (records: { inputTokens: number; outputTokens: number; cacheHitTokens: number }[]): void => {
        for (const r of records) {
          stats.totalInputTokens += r.inputTokens;
          stats.totalOutputTokens += r.outputTokens;
          stats.totalCacheHit += r.cacheHitTokens;
        }
      };
      sumStage(result.stages.designer);
      sumStage(result.stages.critic);
      sumStage(result.stages.schema);
      sumStage(result.stages.verifier);
      stats.totalAttempts += result.totalAttempts;

      console.log(
        `  ✅ 完成 — id=${result.templateId} attempts=${result.totalAttempts}`
        + ` time=${(result.totalDurationMs / 1000).toFixed(1)}s`,
      );

      if (!opts.dryRun) {
        const outPath = join(opts.outputDir, `${result.templateId}.json`);
        const payload = buildOutputJson(result);
        writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
        console.log(`  💾 写入 ${outPath}`);
      } else {
        console.log(`  🌵 dry-run: archetype=${result.brief.archetype}`
          + ` hero=${result.brief.heroMode}`);
      }
      stats.succeeded += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ❌ 失败 — ${msg}`);
      // 失败时也尝试把最后一次的 schema 写到 .failed.json 便于调试
      if (!opts.dryRun && err instanceof Error
          && (err as Error & { lastSchema?: PipelineResult }).lastSchema) {
        const partial = (err as Error & { lastSchema: PipelineResult }).lastSchema;
        const debugPath = join(opts.outputDir, `${partial.templateId}.failed.json`);
        const payload = buildOutputJson(partial);
        writeFileSync(debugPath, JSON.stringify(payload, null, 2), 'utf8');
        console.error(`  💾 已写入失败 schema: ${debugPath}`);
      }
      stats.failed += 1;
    }
  }

  console.log('\n========== 汇总 ==========');
  console.log(`  总计: ${stats.total}  成功: ${stats.succeeded}  失败: ${stats.failed}`);
  console.log(`  总重试次数: ${stats.totalAttempts} (理想 = 总计)`);
  console.log(`  输入 tokens: ${stats.totalInputTokens.toLocaleString()}`);
  console.log(`  输出 tokens: ${stats.totalOutputTokens.toLocaleString()}`);
  console.log(`  缓存命中 tokens: ${stats.totalCacheHit.toLocaleString()}`
    + ` (${stats.totalInputTokens > 0
      ? ((stats.totalCacheHit / stats.totalInputTokens) * 100).toFixed(1)
      : '0'}%)`);

  await app.close();
  process.exit(stats.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('CLI 致命错误:', err);
  process.exit(1);
});
