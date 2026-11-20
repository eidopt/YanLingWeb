import type { Repository } from 'typeorm';

import type { ConfigService } from '../config/config.service';
import { AssetLibraryService } from './assetLibrary.service';
import type { AssetLibraryImage } from './entities/assetLibraryImage.entity';
import { generateImageBytes } from './imageGeneration';
import { TemplateAssetService } from './templateAsset.service';
import type { TemplateAssetStore } from './templateAssetStore';
import { embedText } from './textEmbedding';

jest.mock('./imageGeneration', () => {
  const actual = jest.requireActual<typeof import('./imageGeneration')>('./imageGeneration');
  return {
    ...actual,
    generateImageBytes: jest.fn(),
  };
});

jest.mock('./textEmbedding', () => {
  const actual = jest.requireActual<typeof import('./textEmbedding')>('./textEmbedding');
  return {
    ...actual,
    embedText: jest.fn(),
  };
});

function createFakeConfig(): ConfigService {
  return {
    ai: {
      imageGenerationEnabled: true,
      materializeImages: true,
      image: {
        apiKey: 'test-key',
        model: 'test-image-model',
        outputFormat: 'png',
      },
      models: {
        image: 'test-image-model',
      },
      embedding: {
        apiKey: 'embed-key',
        model: 'text-embedding-3-small',
        baseUrl: 'https://api.example.com/v1',
      },
    },
  } as ConfigService;
}

describe('TemplateAssetService concurrency & fault isolation', () => {
  const mockedGenerateImageBytes = jest.mocked(generateImageBytes);

  beforeEach(() => {
    mockedGenerateImageBytes.mockReset();
  });

  it('caps in-flight assets at 4, keeps order, and isolates failures', async () => {
    let activeWorkers = 0;
    let maxConcurrent = 0;

    mockedGenerateImageBytes.mockImplementation(async (_config, prompt) => {
      activeWorkers += 1;
      maxConcurrent = Math.max(maxConcurrent, activeWorkers);
      try {
        // Reverse delays so later assets finish earlier than earlier assets.
        const match = /asset-(\d+)/.exec(prompt);
        const index = match ? Number(match[1]) : 0;
        await new Promise((resolve) => setTimeout(resolve, (8 - index) * 8));
        if (index === 2) {
          throw new Error('upstream 503');
        }
        return Buffer.from(`png-${index}`);
      } finally {
        activeWorkers -= 1;
      }
    });

    const store: TemplateAssetStore = {
      findExisting: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockImplementation((templateId: string, assetId: string) =>
        Promise.resolve({
          url: `/template-assets/${templateId}/${assetId}.png`,
          storageKey: `${templateId}/${assetId}.png`,
        }),
      ),
    };

    const service = new TemplateAssetService(createFakeConfig(), store);
    const visualAssets = Array.from({ length: 7 }, (_, i) => ({
      id: `img-${i}`,
      nodeId: `node-${i}`,
      pageId: 'home',
      role: 'card',
      prompt: `asset-${i} crisp product shot`,
      alt: `图片 ${i}`,
      provider: 'ai-image',
    }));

    const resolved = await service.resolveVisualAssetsForTemplate(
      'tmpl-concurrent',
      { pages: [] },
      visualAssets,
      { strategy: 'generate' },
    );

    expect(maxConcurrent).toBeGreaterThan(1);
    expect(maxConcurrent).toBeLessThanOrEqual(4);
    expect(resolved.visualAssets.map((a) => a.id)).toEqual(visualAssets.map((a) => a.id));

    expect(resolved.visualAssets[2]?.status).toBe('fallback');
    for (const i of [0, 1, 3, 4, 5, 6]) {
      expect(resolved.visualAssets[i]?.status).toBe('generated');
      expect(resolved.visualAssets[i]?.url).toBe(`/template-assets/tmpl-concurrent/img-${i}.png`);
    }
  });
});

describe('AssetLibraryService index cache', () => {
  const mockedEmbedText = jest.mocked(embedText);

  beforeEach(() => {
    mockedEmbedText.mockReset();
    mockedEmbedText.mockResolvedValue([1, 0]);
  });

  it('caches findBestMatch within 30s and invalidates on write', async () => {
    const entries: AssetLibraryImage[] = [
      {
        id: '1',
        slug: 'fresh-apple',
        category: 'fruit',
        keywords: ['apple'],
        role: 'product',
        prompt: 'red apple',
        alt: '苹果',
        url: '/template-assets/pool/fruit/fresh-apple.png',
        storageKey: 'pool/fruit/fresh-apple.png',
        embedding: [1, 0],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const findMock = jest.fn().mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return entries;
    });
    const repo = {
      find: findMock,
      countBy: jest.fn().mockResolvedValue(0),
      create: jest.fn((data: Partial<AssetLibraryImage>) => data),
      save: jest.fn((row: AssetLibraryImage) => {
        entries.push(row);
        return Promise.resolve(row);
      }),
    } as unknown as Repository<AssetLibraryImage>;

    const service = new AssetLibraryService(repo, createFakeConfig());

    // Two concurrent lookups share 1 in-flight repo.find().
    const [m1, m2] = await Promise.all([
      service.findBestMatch({ alt: '红富士苹果', role: 'product' }),
      service.findBestMatch({ alt: '青苹果', role: 'product' }),
    ]);
    expect(m1?.storageKey).toBe('pool/fruit/fresh-apple.png');
    expect(m2?.storageKey).toBe('pool/fruit/fresh-apple.png');
    expect(findMock).toHaveBeenCalledTimes(1);

    // Repeated lookup within 30s hits memory cache.
    const m3 = await service.findBestMatch({ alt: '香蕉', role: 'product' });
    expect(m3?.storageKey).toBe('pool/fruit/fresh-apple.png');
    expect(findMock).toHaveBeenCalledTimes(1);

    // Write path invalidates cache so next lookup re-queries repo.find().
    await service.registerExisting({
      slug: 'fresh-orange',
      keywords: ['orange'],
      role: 'product',
      alt: '甜橙',
      url: '/template-assets/pool/fruit/fresh-orange.png',
      storageKey: 'pool/fruit/fresh-orange.png',
      category: 'fruit',
    });

    await service.findBestMatch({ alt: '橙子', role: 'product' });
    expect(findMock).toHaveBeenCalledTimes(2);
  });
});
