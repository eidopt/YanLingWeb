import { existsSync, promises as fs } from 'node:fs';
import * as path from 'node:path';

import { Injectable } from '@nestjs/common';

/**
 * 一张已存储模板图片的引用：可直接用作 core.image 的 src 的公共 URL，
 * 以及存储层内部用于定位/复用的 storageKey。
 */
export interface StoredImage {
  /** 渲染/导出可直接使用的 URL（本地实现为 `/template-assets/...`，远端实现为 `https://...`）。 */
  url: string;
  /** 存储层内部 key（本地为相对路径，远端可为对象存储 key）。 */
  storageKey: string;
}

/**
 * 一张图片的语义描述，用于「归类 + 索引 + 按索引复用」。
 *
 * 动机：生成的图片很多是同一大类的近似图（如 水果 ⊇ 橘子/苹果）。把生成的图按
 * category/keywords/role 建索引后，未来可直接按语义命中一张现成图复用，而不是
 * 每个 asset 都重新生图。当前本地实现不建索引（findByIndex 返回 null），
 * 留作远端图床 / 数据库索引模式的扩展点。见 memory: template-asset-reuse-plan。
 */
export interface AssetLookupContext {
  /** UI 角色，如 hero / product / category-icon / avatar。 */
  role?: string;
  /** 替代文本（常含中文主体名，如「草莓」「橘子」）。 */
  alt?: string;
  /** 生图 prompt。 */
  prompt?: string;
  /** 大类，如 fruit / vegetable / meat（未来由分类器/规则填充）。 */
  category?: string;
  /** 检索关键词（未来从 alt/prompt 分词或分类得到）。 */
  keywords?: string[];
}

/**
 * 模板图片存储端口（Port）。
 *
 * 把「图片存在哪、怎么查、URL 怎么给」从 TemplateAssetService 里抽出来，
 * 让生成流程（调 AI 拿 bytes）与持久化解耦：
 *  - 现在：{@link LocalDiskTemplateAssetStore} 落盘到 `public/template-assets/generated/`。
 *  - 未来：换成远端图床实现（上传到远端服务器 / 对象存储，返回远端 URL），
 *    只需提供一个新的 TemplateAssetStore 实现并在 TemplatesModule 切换 provider，
 *    TemplateAssetService 及所有调用方都无需改动。
 *
 * 见 memory: template-asset-reuse-plan（远端图床扩展计划）。
 */
export interface TemplateAssetStore {
  /**
   * 查找该 (templateId, assetId) 是否已有存储好的图片，有则返回其引用（用于复用、跳过重新生成）。
   * 本地实现 = 查磁盘；远端实现 = 查远端清单/HEAD 请求；数据库模式 = 查表。
   */
  findExisting(templateId: string, assetId: string): Promise<StoredImage | null>;

  /**
   * 持久化图片字节，返回可引用的 URL + storageKey。
   * 本地实现 = 写 public/；远端实现 = 上传到远端服务器并返回远端 URL。
   * 传入 context 时，实现可顺便把这张图按 category/keywords/role 建索引，供日后复用。
   */
  save(
    templateId: string,
    assetId: string,
    bytes: Buffer,
    context?: AssetLookupContext,
  ): Promise<StoredImage>;

  /**
   * 可选：按语义索引查找一张可复用的现成图（如给「橘子」复用已生成的「水果」图），
   * 命中则直接复用、无需再生图。当前本地实现不提供（调用方据此回退到生图）；
   * 未来远端/数据库索引模式实现此方法即可让全链路自动复用。
   */
  findByIndex?(context: AssetLookupContext): Promise<StoredImage | null>;
}

/** DI token，便于在 TemplatesModule 里切换本地/远端实现。 */
export const TEMPLATE_ASSET_STORE = 'TEMPLATE_ASSET_STORE';

/**
 * 默认实现：把图片落盘到项目 `public/template-assets/generated/<templateId>/<assetId>.png`，
 * 返回 `/template-assets/...` 的相对 URL（Next 静态映射 public/，导出时被打包进项目 public/）。
 */
@Injectable()
export class LocalDiskTemplateAssetStore implements TemplateAssetStore {
  findExisting(templateId: string, assetId: string): Promise<StoredImage | null> {
    const target = this.buildTarget(templateId, assetId);
    if (!existsSync(target.outputPath)) {
      return Promise.resolve(null);
    }
    return Promise.resolve({ url: target.url, storageKey: target.storageKey });
  }

  // 本地实现暂不按 context 建索引（findByIndex 也未实现）—— 留给远端/数据库模式。
  async save(
    templateId: string,
    assetId: string,
    bytes: Buffer,
    _context?: AssetLookupContext,
  ): Promise<StoredImage> {
    const target = this.buildTarget(templateId, assetId);
    await fs.mkdir(path.dirname(target.outputPath), { recursive: true });
    await fs.writeFile(target.outputPath, bytes);
    return { url: target.url, storageKey: target.storageKey };
  }

  /** 计算落盘路径 / 公共 URL / storageKey —— findExisting 与 save 共用，保证两边规则一致。 */
  private buildTarget(
    templateId: string,
    assetId: string,
  ): { outputPath: string; url: string; storageKey: string } {
    const assetsRoot = this.resolveTemplateAssetsRoot();
    const templateSegment = safePathSegment(templateId);
    const assetSegment = safePathSegment(assetId);
    const relativeStorageKey = path.posix.join('generated', templateSegment, `${assetSegment}.png`);
    const outputPath = path.join(assetsRoot, 'generated', templateSegment, `${assetSegment}.png`);
    return {
      outputPath,
      url: `/template-assets/${relativeStorageKey}`,
      storageKey: relativeStorageKey,
    };
  }

  private resolveTemplateAssetsRoot(): string {
    return resolveTemplateAssetsRoot();
  }
}

/**
 * 解析 `public/template-assets` 绝对路径（兼容从仓库根或 backend/ 启动两种 cwd）。
 * 本地磁盘 store 与素材库预生成共用。
 */
export function resolveTemplateAssetsRoot(): string {
  const publicCandidates = [
    path.resolve(process.cwd(), 'public'),
    path.resolve(process.cwd(), '..', 'public'),
  ];
  const publicRoot =
    publicCandidates.find((candidate) => existsSync(candidate)) ?? publicCandidates[0];
  return path.join(publicRoot, 'template-assets');
}

/** 把任意 id 规整成安全的路径片段。导出到 store 外部供需要时复用。 */
export function safePathSegment(value: string): string {
  const segment = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return segment || 'asset';
}
