import { Injectable } from '@nestjs/common';

import { AssetLibraryService } from './asset-library.service';
import {
  type AssetLookupContext,
  LocalDiskTemplateAssetStore,
  type StoredImage,
  type TemplateAssetStore,
} from './template-asset-store';

/**
 * 组合存储：精确复用 / 落盘走本地磁盘，语义索引复用走素材库（AssetLibraryService）。
 *
 * 这是把 `findByIndex` 扩展点真正接上数据库索引的实现 —— 模板生成时若 asset 能在
 * 预生成素材库里按 category/keywords/role 命中，就直接复用现成图、跳过 AI 生图。
 * 未来换远端图床时，把这里的 LocalDiskTemplateAssetStore 换成远端实现即可。
 * 见 memory: template-asset-reuse-plan。
 */
@Injectable()
export class PooledTemplateAssetStore implements TemplateAssetStore {
  constructor(
    private readonly local: LocalDiskTemplateAssetStore,
    private readonly library: AssetLibraryService,
  ) {}

  findExisting(templateId: string, assetId: string): Promise<StoredImage | null> {
    return this.local.findExisting(templateId, assetId);
  }

  save(
    templateId: string,
    assetId: string,
    bytes: Buffer,
    context?: AssetLookupContext,
  ): Promise<StoredImage> {
    return this.local.save(templateId, assetId, bytes, context);
  }

  findByIndex(context: AssetLookupContext): Promise<StoredImage | null> {
    return this.library.findBestMatch(context);
  }
}
