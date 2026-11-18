import { ForbiddenException, HttpException } from '@nestjs/common';
import type { ThemeLayoutDocument } from '@shared/agent/contracts/agent';
import type { Response } from 'express';

import type { AuthenticatedRequest } from '../auth/authenticatedRequest.interface';
import type { TemplateReadRepository } from '../templates/repositories/templateRead.repository';
import type { TemplateAssetService } from '../templates/templateAsset.service';
import type { UserQuotaService } from '../users/services/userQuota.service';
import { AiTemplatesController } from './aiTemplates.controller';
import type { GeneratedSavedTemplateResult, GenerateOptions } from './aiTemplates.service';
import { AiTemplatesService } from './aiTemplates.service';
import type { TemplatePipelineService } from './orchestrator/pipeline.service';
import type {
  DesignerOutput,
  PipelineExternalResult,
  TemplateSeed,
} from './orchestrator/pipeline.types';

const unusedRepository: TemplateReadRepository = {
  searchPublicTemplates: () => Promise.reject(new Error('unused repository')),
  findDiversitySummaries: () => Promise.reject(new Error('unused repository')),
  findOwnedPublishSnapshot: () => Promise.reject(new Error('unused repository')),
  findAccessibleIdentity: () => Promise.reject(new Error('unused repository')),
};

const unusedPipeline = {
  generate: () => Promise.reject(new Error('unused pipeline')),
} as unknown as TemplatePipelineService;

const unusedAssetService = {
  resolveVisualAssetsForTemplate: () => Promise.reject(new Error('unused asset service')),
} as unknown as TemplateAssetService;

type GenerateRequestBody = Parameters<AiTemplatesController['generate']>[0];

class MockAiTemplatesService extends AiTemplatesService {
  readonly generateMock = jest.fn<
    Promise<PipelineExternalResult>,
    [TemplateSeed, GenerateOptions]
  >();
  readonly generateAndSaveMock = jest.fn<
    Promise<GeneratedSavedTemplateResult>,
    [string, TemplateSeed, GenerateOptions]
  >();

  constructor() {
    super(unusedRepository, unusedPipeline, unusedAssetService);
  }

  override generate(
    seed: TemplateSeed,
    options: GenerateOptions = {},
  ): Promise<PipelineExternalResult> {
    return this.generateMock(seed, options);
  }

  override generateAndSave(
    ownerUserId: string,
    seed: TemplateSeed,
    options: GenerateOptions = {},
  ): Promise<GeneratedSavedTemplateResult> {
    return this.generateAndSaveMock(ownerUserId, seed, options);
  }
}

interface AiTemplatesHarness {
  controller: AiTemplatesController;
  service: MockAiTemplatesService;
}

function createHarness(): AiTemplatesHarness {
  const service = new MockAiTemplatesService();
  return { controller: new AiTemplatesController(service), service };
}

function createBrief(): DesignerOutput {
  return {
    templateId: 'tpl-1',
    name: '生鲜配送',
    tagline: '新鲜直达',
    archetype: 'fresh',
    variant: 'standard',
    heroMode: 'function-grid',
    platform: 'mini-program',
    chrome: 'wechat',
    scenario: 'grocery',
    audience: 'shoppers',
    pages: [],
    cssVars: {},
    componentTemplatesDraft: [],
    bottomTabs: [],
    category: 'commerce',
    displayCategory: '电商',
    whyArchetype: 'fits fresh produce',
    whyHeroMode: 'fits function grid',
    diversitySignature: 'fresh-grid',
  };
}

function createResult(): PipelineExternalResult {
  return {
    templateId: 'tpl-1',
    document: { themeId: 'tpl-1' } as unknown as ThemeLayoutDocument,
    brief: createBrief(),
    totalDurationMs: 1234,
  };
}

function createRequest(sub = 'user-1'): AuthenticatedRequest {
  return { user: { sub, username: 'alice' } } as AuthenticatedRequest;
}

describe('AiTemplatesController', () => {
  it('splits materializeImages out of the body and forwards ownerUserId from auth', async () => {
    const { controller, service } = createHarness();
    const result = createResult();
    service.generateMock.mockResolvedValue(result);

    const body: GenerateRequestBody = {
      prompt: '生鲜配送',
      platform: 'mini-program',
      displayCategory: '电商',
      materializeImages: true,
    };

    await expect(controller.generate(body, createRequest('user-9'))).resolves.toBe(result);

    expect(service.generateMock).toHaveBeenCalledWith(
      {
        prompt: '生鲜配送',
        platform: 'mini-program',
        displayCategory: '电商',
      },
      { materializeImages: true, ownerUserId: 'user-9' },
    );
  });

  it('passes materializeImages as undefined when omitted from the body', async () => {
    const { controller, service } = createHarness();
    const result = createResult();
    service.generateMock.mockResolvedValue(result);

    const body: GenerateRequestBody = {
      prompt: '咖啡店',
    };

    await expect(controller.generate(body, createRequest('user-1'))).resolves.toBe(result);

    expect(service.generateMock).toHaveBeenCalledWith(
      { prompt: '咖啡店' },
      { materializeImages: undefined, ownerUserId: 'user-1' },
    );
  });

  it('streams stage events and template_saved over SSE on generate/stream', async () => {
    const { controller, service } = createHarness();
    const result = createResult();
    service.generateAndSaveMock.mockImplementation((_userId, _seed, options) => {
      options.onStageEvent?.('start', { stage: 'designer', attempt: 1 });
      options.onStageEvent?.('end', {
        stage: 'designer',
        attempt: 1,
        durationMs: 120,
        status: 'ok',
      });
      return Promise.resolve({ ...result, action: 'created' });
    });

    const closeHandlers: (() => void)[] = [];
    const req = {
      user: { sub: 'user-1', username: 'alice' },
      on: jest.fn((event: string, handler: () => void) => {
        if (event === 'close') {
          closeHandlers.push(handler);
        }
      }),
    } as unknown as AuthenticatedRequest;
    const chunks: string[] = [];
    let endResolve: (() => void) | undefined;
    const ended = new Promise<void>((resolve) => {
      endResolve = resolve;
    });
    const res = {
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn((chunk: string) => {
        chunks.push(chunk);
        return true;
      }),
      end: jest.fn(() => {
        endResolve?.();
      }),
      flush: jest.fn(),
    };

    await controller.generateStream(
      { prompt: '生鲜配送', platform: 'mini-program' },
      req,
      res as unknown as Response,
    );
    await ended;

    expect(service.generateAndSaveMock).toHaveBeenCalledWith(
      'user-1',
      { prompt: '生鲜配送', platform: 'mini-program' },
      expect.objectContaining({ materializeImages: undefined }),
    );
    const body = chunks.join('');
    expect(body).toContain('"type":"pipeline_stage_start"');
    expect(body).toContain('"type":"pipeline_stage_end"');
    expect(body).toContain('"type":"template_saved"');
    expect(body).toContain('"templateId":"tpl-1"');
    expect(body).toContain('"type":"done"');
  });

  it('rejects generate and generateStream with 403 when quota is exceeded', async () => {
    const service = new MockAiTemplatesService();
    const userQuota = {
      consumeFreeTemplateGenQuota: jest.fn().mockRejectedValue(
        new ForbiddenException({
          code: 'FREE_TEMPLATE_QUOTA_EXCEEDED',
          message: '免费余额度已用完，普通用户从零开始生成模板仅限 1 次，需要充值后继续使用。',
        }),
      ),
    } as unknown as UserQuotaService;
    const controller = new AiTemplatesController(service, userQuota);
    const req = createRequest('user-normal');
    const flushHeadersMock = jest.fn();
    const res = {
      setHeader: jest.fn(),
      flushHeaders: flushHeadersMock,
      write: jest.fn(),
      end: jest.fn(),
    } as unknown as Response;

    await expect(controller.generate({ prompt: '咖啡店' }, req)).rejects.toThrow(HttpException);
    await expect(controller.generateStream({ prompt: '咖啡店' }, req, res)).rejects.toThrow(
      ForbiddenException,
    );

    expect(service.generateMock).not.toHaveBeenCalled();
    expect(service.generateAndSaveMock).not.toHaveBeenCalled();
    expect(flushHeadersMock).not.toHaveBeenCalled();
  });
});
