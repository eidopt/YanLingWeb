import type { ThemeLayoutDocument } from '@shared/agent/contracts/agent';

import type { TemplateReadRepository } from '../templates/repositories/templateRead.repository';
import type { TemplateAssetService } from '../templates/templateAsset.service';
import { AiTemplatesController } from './aiTemplates.controller';
import type { GenerateOptions } from './aiTemplates.service';
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

  constructor() {
    super(unusedRepository, unusedPipeline, unusedAssetService);
  }

  override generate(
    seed: TemplateSeed,
    options: GenerateOptions = {},
  ): Promise<PipelineExternalResult> {
    return this.generateMock(seed, options);
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

describe('AiTemplatesController', () => {
  it('splits materializeImages out of the body and passes it as a generate option', async () => {
    const { controller, service } = createHarness();
    const result = createResult();
    service.generateMock.mockResolvedValue(result);

    const body: GenerateRequestBody = {
      prompt: '生鲜配送',
      platform: 'mini-program',
      displayCategory: '电商',
      materializeImages: true,
    };

    await expect(controller.generate(body)).resolves.toBe(result);

    expect(service.generateMock).toHaveBeenCalledWith(
      {
        prompt: '生鲜配送',
        platform: 'mini-program',
        displayCategory: '电商',
      },
      { materializeImages: true },
    );
  });

  it('passes materializeImages as undefined when omitted from the body', async () => {
    const { controller, service } = createHarness();
    const result = createResult();
    service.generateMock.mockResolvedValue(result);

    const body: GenerateRequestBody = {
      prompt: '咖啡店',
    };

    await expect(controller.generate(body)).resolves.toBe(result);

    expect(service.generateMock).toHaveBeenCalledWith(
      { prompt: '咖啡店' },
      { materializeImages: undefined },
    );
  });
});
