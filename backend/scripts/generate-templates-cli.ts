/**
 * 批量模板生成 CLI
 *
 * 使用：
 *   pnpm templates:generate                  # 跑全部 seed briefs
 *   pnpm templates:generate -- --count 5     # 跑前 5 个
 *   pnpm templates:generate -- --id commerce-fresh-delivery  # 跑单个（按 prompt 关键词匹配）
 *   # 自定义生成（不走预设 seed，生成你描述的那一个）：
 *   pnpm templates:generate -- --prompt "宠物殡葬一站式预约服务"
 *   pnpm templates:generate -- --prompt "高端珠宝商城" --platform mobile-app --category commerce \
 *        --archetype dark-pro --hero cover-story --library-images
 *     # --platform: mini-program|mobile-app|web；--category: displayCategory slug
 *     # --archetype / --hero: 可选，强制风格；不传则 Designer 自选（非法值会警告并忽略）
 *   pnpm templates:generate -- --dry-run     # 仅打印 brief，不写文件
 *   pnpm templates:generate -- --with-images        # 真实生成图片（库命中优先，命不中调 OpenAI Images 按张计费）
 *   pnpm templates:generate -- --library-images     # 从素材库语义检索最接近的现成图填入，命不中占位、绝不生图（零成本）
 *                                                    # 别名 --reuse-images
 *   pnpm templates:generate -- --placeholder-images # 图片一律占位符，不查库不生图（最快）
 *                                                    # 别名 --no-images
 *   # 三者互斥，优先级 placeholder > library > with-images
 *
 * 另：后端启动导入(onModuleInit)的现生图可用环境变量 AI_IMAGE_GENERATION=off 全局关闭
 * （已存在的图 / 磁盘缓存命中仍会复用）。
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
import type {
  HeroMode,
  PipelineResult,
  TemplateArchetype,
  TemplateSeed,
} from '../src/ai-templates/orchestrator/pipeline.types';
import { AppModule } from '../src/app.module';
import { SEED_BRIEFS } from './briefs/seed-briefs';

const VALID_PLATFORMS = new Set<TemplateSeed['platform']>(['mini-program', 'mobile-app', 'web']);
const VALID_ARCHETYPES = new Set<TemplateArchetype>([
  'fresh',
  'immersive',
  'editorial',
  'vibrant',
  'dark-pro',
]);
const VALID_HERO_MODES = new Set<HeroMode>([
  'date-strip',
  'function-grid',
  'cover-story',
  'metric-dashboard',
  'story-ring',
  'dual-column',
  'timer-banner',
  'search-filter',
]);

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
  /** 自定义需求：传了 --prompt 就只生成这一个自定义模板，不跑 SEED_BRIEFS 预设。 */
  prompt?: string;
  platform?: TemplateSeed['platform'];
  displayCategory?: string;
  forceArchetype?: TemplateArchetype;
  forceHeroMode?: HeroMode;
  dryRun: boolean;
  withImages: boolean;
  libraryImages: boolean;
  placeholderImages: boolean;
  outputDir: string;
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  // CLI 从 backend/ 目录运行（用 ts-node + reflect-metadata），
  // 默认输出指向项目根的 templates_json/，让 backend onModuleInit 可以扫描导入。
  const projectRoot = join(__dirname, '..', '..');
  const opts: CliOptions = {
    dryRun: false,
    withImages: false,
    libraryImages: false,
    placeholderImages: false,
    outputDir: join(projectRoot, 'templates_json'),
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--count' && args[i + 1]) {
      opts.count = Number(args[++i]);
    } else if (arg === '--id' && args[i + 1]) {
      opts.match = args[++i];
    } else if (arg === '--prompt' && args[i + 1]) {
      opts.prompt = args[++i];
    } else if (arg === '--platform' && args[i + 1]) {
      const v = args[++i];
      if (VALID_PLATFORMS.has(v as TemplateSeed['platform'])) {
        opts.platform = v as TemplateSeed['platform'];
      } else {
        console.warn(`忽略非法 --platform "${v}"（合法：mini-program|mobile-app|web）`);
      }
    } else if ((arg === '--category' || arg === '--display-category') && args[i + 1]) {
      opts.displayCategory = args[++i];
    } else if (arg === '--archetype' && args[i + 1]) {
      const v = args[++i];
      if (VALID_ARCHETYPES.has(v as TemplateArchetype)) {
        opts.forceArchetype = v as TemplateArchetype;
      } else {
        console.warn(`忽略非法 --archetype "${v}"（合法：${[...VALID_ARCHETYPES].join('|')}）`);
      }
    } else if ((arg === '--hero' || arg === '--hero-mode') && args[i + 1]) {
      const v = args[++i];
      if (VALID_HERO_MODES.has(v as HeroMode)) {
        opts.forceHeroMode = v as HeroMode;
      } else {
        console.warn(`忽略非法 --hero "${v}"（合法：${[...VALID_HERO_MODES].join('|')}）`);
      }
    } else if (arg === '--dry-run') {
      opts.dryRun = true;
    } else if (arg === '--with-images') {
      opts.withImages = true;
    } else if (arg === '--library-images' || arg === '--reuse-images') {
      opts.libraryImages = true;
    } else if (arg === '--placeholder-images' || arg === '--no-images') {
      opts.placeholderImages = true;
    } else if (arg === '--out' && args[i + 1]) {
      opts.outputDir = args[++i];
    }
  }
  // 互斥优先级：placeholder > library > with-images。
  if (opts.placeholderImages || opts.libraryImages) {
    opts.withImages = false;
  }
  if (opts.placeholderImages) {
    opts.libraryImages = false;
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

  const traits = [`archetype:${brief.archetype}`, `hero:${brief.heroMode}`, `sig:${brief.diversitySignature}`];

  // componentTemplates / cssVars / cssAnimations 提到顶层（seed 格式期望位置）
  const componentTemplates = document.componentTemplates ?? {};
  const cssVars = document.cssVars ?? brief.cssVars;
  const cssAnimations = document.cssAnimations ?? undefined;
  // visualAssets 同时放顶层：导入端 (importTemplateJsonFile) 主读 parsed.visualAssets，
  // 不提到顶层会导致导入拿不到资产 → core.image 不补 src/iconColor → 全是灰占位。
  const visualAssets = (document as unknown as { visualAssets?: unknown[] }).visualAssets ?? [];

  const displayCategoryLabel = DISPLAY_CATEGORY_LABELS[brief.displayCategory] ?? brief.displayCategory;

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
    visualAssets,
    layoutDocument: document,
  };
}

async function main(): Promise<void> {
  const opts = parseArgs();

  console.log('Starting NestJS application context without HTTP...');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const service = app.get(AiTemplatesService);

  let briefs: TemplateSeed[];
  if (opts.prompt) {
    // 自定义模式：只生成用户描述的这一个模板，完全不走 SEED_BRIEFS 预设。
    briefs = [
      {
        prompt: opts.prompt,
        ...(opts.platform ? { platform: opts.platform } : {}),
        ...(opts.displayCategory ? { displayCategory: opts.displayCategory } : {}),
        ...(opts.forceArchetype ? { forceArchetype: opts.forceArchetype } : {}),
        ...(opts.forceHeroMode ? { forceHeroMode: opts.forceHeroMode } : {}),
      },
    ];
    console.log(`自定义模式：生成 1 个模板（prompt="${opts.prompt}"）`);
  } else {
    briefs = SEED_BRIEFS;
    if (opts.match) {
      briefs = briefs.filter((b) => b.prompt.includes(opts.match!));
      if (briefs.length === 0) {
        console.error(`No brief matched "${opts.match}"`);
        await app.close();
        process.exit(1);
      }
    }
    if (typeof opts.count === 'number') {
      briefs = briefs.slice(0, opts.count);
    }
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
      const result = await service.generateDetailed(seed, {
        materializeImages: opts.withImages,
        libraryImages: opts.libraryImages,
        placeholderImages: opts.placeholderImages,
      });

      // 累加 token 统计。
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
        `  Done - id=${result.templateId} attempts=${result.totalAttempts}` +
          ` time=${(result.totalDurationMs / 1000).toFixed(1)}s`,
      );

      if (!opts.dryRun) {
        const outPath = join(opts.outputDir, `${result.templateId}.json`);
        const payload = buildOutputJson(result);
        writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
        console.log(`  Wrote ${outPath}`);
      } else {
        console.log(`  🌵 dry-run: archetype=${result.brief.archetype}` + ` hero=${result.brief.heroMode}`);
      }
      stats.succeeded += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  Failed - ${msg}`);
      // 失败时也尝试把最后一次的 schema 写到 .failed.json，便于调试。
      if (!opts.dryRun && err instanceof Error && (err as Error & { lastSchema?: PipelineResult }).lastSchema) {
        const partial = (err as Error & { lastSchema: PipelineResult }).lastSchema;
        const debugPath = join(opts.outputDir, `${partial.templateId}.failed.json`);
        const payload = buildOutputJson(partial);
        writeFileSync(debugPath, JSON.stringify(payload, null, 2), 'utf8');
        console.error(`  Wrote failed schema: ${debugPath}`);
      }
      stats.failed += 1;
    }
  }

  console.log('\n========== Summary ==========');
  console.log(`  Total: ${stats.total}  Succeeded: ${stats.succeeded}  Failed: ${stats.failed}`);
  console.log(`  Total attempts: ${stats.totalAttempts} (ideal = total)`);
  console.log(`  Input tokens: ${stats.totalInputTokens.toLocaleString()}`);
  console.log(`  Output tokens: ${stats.totalOutputTokens.toLocaleString()}`);
  console.log(
    `  Cache hit tokens: ${stats.totalCacheHit.toLocaleString()}` +
      ` (${stats.totalInputTokens > 0 ? ((stats.totalCacheHit / stats.totalInputTokens) * 100).toFixed(1) : '0'}%)`,
  );

  await app.close();
  process.exit(stats.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal CLI error:', err);
  process.exit(1);
});
