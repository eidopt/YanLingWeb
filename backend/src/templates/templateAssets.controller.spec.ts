import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { NotFoundException } from '@nestjs/common';
import type { Request, Response } from 'express';

import { TemplateAssetsController } from './templateAssets.controller';
import * as assetStore from './templateAssetStore';
import { buildTemplateAssetPublicUrl } from './templateAssetStore';

describe('TemplateAssetsController & URL builder', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('builds relative or configured public URLs cleanly', () => {
    expect(buildTemplateAssetPublicUrl('generated/market/hero.png')).toBe(
      '/template-assets/generated/market/hero.png',
    );
    expect(
      buildTemplateAssetPublicUrl(
        '/generated/market/hero.png',
        'https://cdn.example.com/template-assets/',
      ),
    ).toBe('https://cdn.example.com/template-assets/generated/market/hero.png');
  });

  it('serves valid image files inside template-assets root and blocks traversal', async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'yanling-assets-'));
    try {
      const sampleFile = path.join(tmpRoot, 'generated', 'market', 'hero.png');
      await fs.mkdir(path.dirname(sampleFile), { recursive: true });
      await fs.writeFile(sampleFile, Buffer.from('png-payload'));
      jest.spyOn(assetStore, 'resolveTemplateAssetsRoot').mockReturnValue(tmpRoot);

      const controller = new TemplateAssetsController();
      const headers = new Map<string, string>();
      let sentBody: unknown;
      const res = {
        setHeader: jest.fn((key: string, value: string) => {
          headers.set(key, value);
        }),
        send: jest.fn((body: unknown) => {
          sentBody = body;
        }),
      } as unknown as Response;

      await controller.getAsset(
        { path: '/api/template-assets/generated/market/hero.png' } as Request,
        res,
      );

      expect(headers.get('Content-Type')).toBe('image/png');
      expect(headers.get('Cache-Control')).toBe('public, max-age=3600');
      expect(Buffer.isBuffer(sentBody)).toBe(true);
      expect((sentBody as Buffer).toString()).toBe('png-payload');

      await expect(
        controller.getAsset({ path: '/api/template-assets/../../etc/passwd' } as Request, res),
      ).rejects.toThrow(NotFoundException);

      await expect(
        controller.getAsset(
          { path: '/api/template-assets/generated/market/missing.png' } as Request,
          res,
        ),
      ).rejects.toThrow(NotFoundException);
    } finally {
      await fs.rm(tmpRoot, { recursive: true, force: true });
    }
  });
});
