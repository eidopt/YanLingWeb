import { promises as fs } from 'node:fs';
import * as path from 'node:path';

import { Controller, Get, Inject, NotFoundException, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { ConfigService } from '../config/config.service';
import { assetSignatureMatches } from './assetSignature';
import {
  TEMPLATE_PERSISTENCE_REPOSITORY,
  type TemplatePersistenceRepository,
} from './repositories';
import { resolveTemplateAssetsRoot } from './templateAssetStore';

const CONTENT_TYPES_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.gif': 'image/gif',
};

/**
 * 公开静态访问端点：把后端落盘到 `public/template-assets/` 的模板配图通过 HTTP 暴露出来。
 *
 * 适用场景：
 *  - Next.js `output: 'standalone'` 或前后端分开部署时，Next fallback rewrite 把
 *    `/template-assets/*` 转到这里；
 *  - 当配置了 `AI_IMAGE_PUBLIC_BASE_URL=https://api.example.com/api/template-assets` 时，
 *    前端页面与导出项目可直接通过该地址加载图片，无需共享磁盘。
 */
@ApiTags('templates')
@Controller('template-assets')
export class TemplateAssetsController {
  constructor(
    private readonly config: ConfigService,
    @Inject(TEMPLATE_PERSISTENCE_REPOSITORY)
    private readonly templates: TemplatePersistenceRepository,
  ) {}

  @Get('*')
  @ApiOperation({ summary: 'Serve generated or pooled template asset image files' })
  async getAsset(@Req() req: Request, @Res() res: Response): Promise<void> {
    const match = /^\/api(?:\/v1)?\/template-assets\/(.+)$/.exec(req.path);
    if (!match?.[1]) {
      throw new NotFoundException('Asset not found');
    }

    let decodedRelativePath: string;
    try {
      decodedRelativePath = decodeURIComponent(match[1]);
    } catch {
      throw new NotFoundException('Asset not found');
    }

    if (
      !decodedRelativePath ||
      decodedRelativePath.includes('..') ||
      decodedRelativePath.includes('\\') ||
      decodedRelativePath.includes('\0')
    ) {
      throw new NotFoundException('Asset not found');
    }

    const assetsRoot = path.resolve(resolveTemplateAssetsRoot());
    const targetPath = path.resolve(assetsRoot, decodedRelativePath);
    if (!targetPath.startsWith(`${assetsRoot}${path.sep}`)) {
      throw new NotFoundException('Asset not found');
    }
    if (!(await this.canReadGeneratedAsset(decodedRelativePath, req))) {
      throw new NotFoundException('Asset not found');
    }

    let bytes: Buffer;
    try {
      const stat = await fs.stat(targetPath);
      if (!stat.isFile()) {
        throw new NotFoundException('Asset not found');
      }
      bytes = await fs.readFile(targetPath);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new NotFoundException('Asset not found');
    }

    const ext = path.extname(targetPath).toLowerCase();
    const contentType = CONTENT_TYPES_BY_EXT[ext] ?? 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(bytes);
  }

  private async canReadGeneratedAsset(relativePath: string, req: Request): Promise<boolean> {
    const match = /^generated\/([^/]+)\//.exec(relativePath);
    if (!match?.[1]) {
      return true;
    }
    const template = await this.templates.findByTemplateId(match[1]);
    if (template?.isPublic === true) {
      return true;
    }
    return assetSignatureMatches(
      this.config.jwt.secret,
      relativePath,
      req.query.exp,
      req.query.sig,
    );
  }
}
