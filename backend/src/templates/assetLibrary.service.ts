import { promises as fs } from 'node:fs';
import * as path from 'node:path';

import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ConfigService } from '../config/config.service';
import { AssetLibraryImage } from './entities/assetLibraryImage.entity';
import { generateImageBytes, toImageGenerationConfig } from './imageGeneration';
import {
  type AssetLookupContext,
  buildTemplateAssetPublicUrl,
  resolveTemplateAssetsRoot,
  safePathSegment,
  type StoredImage,
} from './templateAssetStore';
import { dot, embedText } from './textEmbedding';

/** 预生成素材的声明（manifest 项）。 */
export interface AssetLibrarySpec {
  /** 稳定唯一标识，如 `fruit-apple-product`。 */
  slug: string;
  /** 大类，如 fruit / fashion。 */
  category: string;
  /** UI 角色：hero / product / avatar / category-icon / illustration / background。 */
  role: string;
  /** 检索关键词（中英混合）。 */
  keywords: string[];
  alt: string;
  prompt: string;
}

export interface PregenerateResult {
  slug: string;
  status: 'created' | 'skipped' | 'failed';
  url?: string;
  reason?: string;
}

/**
 * 余弦相似度命中阈值：低于此值视为不够像、回退生图。
 * 实测 text-embedding-3-small 的相似度带（pilot 数据）：精确同主体 ~0.5+、
 * 同大类近似（橘子↔苹果）~0.35-0.45、跨类（牛肉↔苹果）~0.22、无关 <0.2。
 * 取 0.35 让"同大类复用"生效、排除跨类乱命中；库变密后可上调（见设计文档 §7）。
 */
const MATCH_THRESHOLD = 0.35;
/** 同 role（如都为 product）的小幅加分，仅影响排序、不绕过阈值。 */
const ROLE_BOOST = 0.05;

/**
 * 预生成图片素材库 + 按 embedding 语义索引复用。
 *  - `pregenerateOne`：批量生图 → 落盘 pool/ → 算 embedding 入库。
 *  - `registerExisting`：把已有图登记入库（算 embedding，不生图）。
 *  - `findBestMatch`：embed 请求 → 与库内向量做余弦最近邻 → 过阈值才复用（由
 *    PooledTemplateAssetStore.findByIndex 调用），命不中返回 null → 回退到生图。
 *  - `reindexMissing`：给没有 embedding 的历史行补算。
 * 设计与 embedding 原理见 docs/asset-library-embedding-design.md。
 */
@Injectable()
export class AssetLibraryService implements OnModuleInit {
  private readonly logger = new Logger(AssetLibraryService.name);

  constructor(
    @InjectRepository(AssetLibraryImage)
    private readonly repo: Repository<AssetLibraryImage>,
    private readonly config: ConfigService,
  ) {}

  /**
   * 后端启动时，把 public/template-assets 里"尚未入库"的图片自动算 embedding 入库。
   * 非阻塞（不拖慢启动）；只对新文件算 embedding；已入库的按 storageKey 跳过。
   * 这样以后往该目录新增图片，下次启动即自动索引、可被语义复用。
   */
  onModuleInit(): void {
    void this.syncFromDisk()
      .then((r) => {
        if (r.indexed > 0) {
          this.logger.log(
            `素材库磁盘同步：新增入库 ${r.indexed}（扫描 ${r.scanned}，已存在 ${r.skipped}）`,
          );
        }
      })
      .catch((error) => {
        this.logger.warn(
          `素材库磁盘同步失败：${error instanceof Error ? error.message : String(error)}`,
        );
      });
  }

  count(): Promise<number> {
    return this.repo.count();
  }

  async existsBySlug(slug: string): Promise<boolean> {
    return (await this.repo.countBy({ slug })) > 0;
  }

  /** 生成一条素材并入库（已存在则跳过，支持断点续跑）。 */
  async pregenerateOne(spec: AssetLibrarySpec): Promise<PregenerateResult> {
    if (await this.existsBySlug(spec.slug)) {
      return { slug: spec.slug, status: 'skipped', reason: 'already in library' };
    }
    const imageConfig = toImageGenerationConfig(this.config.ai.image, this.config.ai.models.image);
    if (!imageConfig) {
      return {
        slug: spec.slug,
        status: 'failed',
        reason: 'AI image model / api key not configured',
      };
    }
    try {
      const bytes = await generateImageBytes(imageConfig, spec.prompt, {
        outputFormat: imageConfig.outputFormat ?? 'png',
      });
      const stored = await this.storeToPool(spec.category, spec.slug, bytes);
      const embedding = await this.computeEmbedding(
        this.buildEmbeddingText({ alt: spec.alt, keywords: spec.keywords, prompt: spec.prompt }),
      );
      await this.repo.save(
        this.repo.create({
          slug: spec.slug,
          category: spec.category,
          keywords: spec.keywords,
          role: spec.role,
          prompt: spec.prompt,
          alt: spec.alt,
          url: stored.url,
          storageKey: stored.storageKey,
          embedding,
        }),
      );
      return { slug: spec.slug, status: 'created', url: stored.url };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`pregenerate ${spec.slug} failed: ${reason}`);
      return { slug: spec.slug, status: 'failed', reason };
    }
  }

  /**
   * 把一张「已存在」的图片登记进索引（不生图）。用于把 public/template-assets 里
   * 已有的图（如历史生成的 generated/* ）纳入复用库。category 不传则记为 misc
   * （细粒度匹配靠 embedding，不依赖 category）。
   */
  async registerExisting(params: {
    slug: string;
    keywords: string[];
    role: string;
    alt: string;
    url: string;
    storageKey: string;
    category?: string;
  }): Promise<PregenerateResult> {
    if (await this.existsBySlug(params.slug)) {
      return { slug: params.slug, status: 'skipped', reason: 'already in library' };
    }
    const category = params.category ?? 'misc';
    const embedding = await this.computeEmbedding(
      this.buildEmbeddingText({ alt: params.alt, keywords: params.keywords }),
    );
    try {
      await this.repo.save(
        this.repo.create({
          slug: params.slug,
          category,
          keywords: params.keywords,
          role: params.role,
          prompt: '',
          alt: params.alt,
          url: params.url,
          storageKey: params.storageKey,
          embedding,
        }),
      );
    } catch (error) {
      // 并发竞态：另一个同步（如另一个后端实例的 onModuleInit / 手动 CLI）已抢先插入同 slug。
      // existsBySlug 检查与 insert 非原子，撞到唯一约束就当作已存在、幂等跳过，不报错中断整批。
      if (this.isUniqueViolation(error)) {
        return { slug: params.slug, status: 'skipped', reason: 'already inserted (concurrent)' };
      }
      throw error;
    }
    return { slug: params.slug, status: 'created', url: params.url };
  }

  private isUniqueViolation(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /unique constraint|sqlite_constraint_unique|duplicate key/i.test(message);
  }

  /**
   * 用 embedding 语义最近邻命中一张可复用图：embed 请求 → 与库内向量做余弦（点积）→
   * 取最高分；同 role 小幅加分（仅排序）；最终命中的「原始相似度」≥ 阈值才复用。
   * 没配 embedding 模型 / embed 失败 / 库空 → 返回 null（回退生图）。
   */
  async findBestMatch(context: AssetLookupContext): Promise<StoredImage | null> {
    const all = await this.repo.find();
    if (!all.length) {
      return null;
    }
    const queryVec = await this.computeEmbedding(
      this.buildEmbeddingText({
        alt: context.alt,
        keywords: context.keywords,
        prompt: context.prompt,
      }),
    );
    if (!queryVec) {
      return null;
    }

    let best: AssetLibraryImage | null = null;
    let bestSim = 0;
    let bestRank = -Infinity;
    for (const img of all) {
      if (!img.embedding || img.embedding.length === 0) {
        continue;
      }
      const sim = dot(queryVec, img.embedding);
      const rank = sim + (context.role && img.role === context.role ? ROLE_BOOST : 0);
      // 稳定选择：同 rank 时按 slug 字典序取小，保证确定性
      if (rank > bestRank || (rank === bestRank && best && img.slug < best.slug)) {
        bestRank = rank;
        bestSim = sim;
        best = img;
      }
    }
    if (!best || bestSim < MATCH_THRESHOLD) {
      return null;
    }
    this.logger.log(`embedding 命中复用 ${best.slug}（相似度 ${bestSim.toFixed(3)}）`);
    return { url: best.url, storageKey: best.storageKey };
  }

  /**
   * 给库里没有 embedding 的历史行补算向量。`force=true` 时重算所有行
   * （embedding 文本口径变更后用）。返回更新条数。
   */
  async reindexMissing(force = false): Promise<number> {
    const rows = await this.repo.find();
    let updated = 0;
    for (const img of rows) {
      if (!force && img.embedding && img.embedding.length > 0) {
        continue;
      }
      const vec = await this.computeEmbedding(
        this.buildEmbeddingText({ alt: img.alt, keywords: img.keywords, prompt: img.prompt }),
      );
      if (vec) {
        img.embedding = vec;
        await this.repo.save(img);
        updated += 1;
      }
    }
    return updated;
  }

  /**
   * 扫描整个 `public/template-assets` 目录，把"尚未入库"的图片登记 + 算 embedding。
   * 按 storageKey（相对路径）去重，已入库的跳过 → 幂等，可反复跑。
   * 供启动自动同步 (onModuleInit) 与手动 CLI (`assets:import-existing`) 共用。
   */
  async syncFromDisk(): Promise<{ scanned: number; indexed: number; skipped: number }> {
    const root = resolveTemplateAssetsRoot();
    const files = await this.walkPng(root);
    const existing = await this.repo.find({ select: { storageKey: true } });
    const known = new Set(existing.map((e) => e.storageKey));

    let indexed = 0;
    let skipped = 0;
    for (const file of files) {
      const storageKey = path.relative(root, file).split(path.sep).join('/');
      if (known.has(storageKey)) {
        skipped += 1;
        continue;
      }
      const meta = this.deriveAssetMeta(storageKey);
      try {
        const result = await this.registerExisting({
          ...meta,
          url: buildTemplateAssetPublicUrl(storageKey, this.config.ai.image.publicBaseUrl),
          storageKey,
        });
        if (result.status === 'created') {
          indexed += 1;
        } else {
          skipped += 1;
        }
      } catch (error) {
        // 单个文件出错（如生 embedding 失败）不应中断整批同步。
        skipped += 1;
        this.logger.warn(
          `sync skip ${storageKey}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return { scanned: files.length, indexed, skipped };
  }

  /** 递归收集目录下所有 .png 绝对路径。 */
  private async walkPng(dir: string): Promise<string[]> {
    const out: string[] = [];
    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return out;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        out.push(...(await this.walkPng(full)));
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.png')) {
        out.push(full);
      }
    }
    return out;
  }

  /** 从相对路径/文件名推断 角色 + 主体 + slug + 关键词（启发式，够语义检索用）。 */
  private deriveAssetMeta(storageKey: string): {
    slug: string;
    keywords: string[];
    role: string;
    alt: string;
  } {
    const roleTokens = [
      'product',
      'hero',
      'avatar',
      'profile',
      'icon',
      'cart',
      'home',
      'order',
      'rider',
    ];
    const base = path.basename(storageKey, '.png');
    const tokens = base
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t && t !== 'asset');
    let role = 'illustration';
    if (tokens.includes('hero')) {
      role = 'hero';
    } else if (tokens.includes('avatar') || tokens.includes('profile')) {
      role = 'avatar';
    } else if (tokens.includes('icon')) {
      role = 'category-icon';
    } else if (tokens.includes('product')) {
      role = 'product';
    }
    const subject = tokens.filter((t) => !roleTokens.includes(t));
    const slug = `existing-${storageKey.replace(/[^a-z0-9]+/gi, '-')}`
      .toLowerCase()
      .replace(/-png$/, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    return {
      slug,
      role,
      alt: subject.join(' ') || base,
      keywords: [...new Set([...tokens, ...subject])],
    };
  }

  /**
   * 统一拼接 embedding 文本口径（入库与查询必须一致）。**只编码"主体语义"**
   * （alt + 关键词 + prompt），不放 role/category —— 否则相同 role/category 的不相干
   * 主体（如「宇宙飞船 hero」≈「生鲜篮 hero」）会因共享结构词被拉近、误命中。
   * role/category 只作为结构化维度用于加分/粗筛，不进向量。
   */
  private buildEmbeddingText(parts: {
    alt?: string;
    keywords?: string[];
    prompt?: string;
  }): string {
    return [parts.alt, (parts.keywords ?? []).join(' '), parts.prompt]
      .filter((s): s is string => Boolean(s?.trim()))
      .join(' ')
      .trim();
  }

  /**
   * 算归一化 embedding；未配 key/模型 / 文本空 / 失败时返回 null（调用方据此降级）。
   * 用独立的 ai.embedding 配置（默认 OpenAI），与库现有向量同源，不受主 chat provider 影响。
   */
  private async computeEmbedding(text: string): Promise<number[] | null> {
    const { apiKey, model, baseUrl } = this.config.ai.embedding;
    if (!apiKey || !model || !text) {
      return null;
    }
    try {
      return await embedText({ apiKey, baseUrl, model }, text);
    } catch (error) {
      this.logger.warn(`embed failed: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  private async storeToPool(category: string, slug: string, bytes: Buffer): Promise<StoredImage> {
    const root = resolveTemplateAssetsRoot();
    const categorySegment = safePathSegment(category);
    const slugSegment = safePathSegment(slug);
    const relativeStorageKey = path.posix.join('pool', categorySegment, `${slugSegment}.png`);
    const outputPath = path.join(root, 'pool', categorySegment, `${slugSegment}.png`);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, bytes);
    return {
      url: buildTemplateAssetPublicUrl(relativeStorageKey, this.config.ai.image.publicBaseUrl),
      storageKey: relativeStorageKey,
    };
  }
}
