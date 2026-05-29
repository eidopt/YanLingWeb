import { Logger } from '@nestjs/common';
import type { ThemeLayoutDocument } from '@shared/agent/contracts/agent';
import type { AIProvider } from '@shared/agent/contracts/provider';

import type { AiTemplatePipelineProvider } from '../../ai/pipeline-provider.port';
import { DesignerAgent } from '../stages/designer.agent';
import { DiversityCriticAgent } from '../stages/diversity-critic.agent';
import { SchemaGeneratorAgent } from '../stages/schema-generator.agent';
import { VerifierAgent } from '../stages/verifier.agent';
import { TemplatePipelineService } from './pipeline.service';
import type {
  CriticVerdict,
  DesignerOutput,
  ExistingTemplateSummary,
  PipelineStageRecord,
  SchemaOutput,
  TemplateSeed,
  VerifierVerdict,
} from './pipeline.types';

const unusedProvider = {} as AIProvider;
const fakePipelineProvider: AiTemplatePipelineProvider = {
  getProviderForTemplatePipeline: () => ({
    provider: unusedProvider,
    model: 'test-model',
    apiKeyConfigured: false,
  }),
};

class FakeDesignerAgent extends DesignerAgent {
  readonly runMock = jest.fn<
    Promise<PipelineStageRecord<DesignerOutput>>,
    [TemplateSeed, string | undefined, number]
  >();

  constructor() {
    super(fakePipelineProvider);
  }

  override run(
    seed: TemplateSeed,
    reviseSuggestion: string | undefined,
    attempt: number,
  ): Promise<PipelineStageRecord<DesignerOutput>> {
    return this.runMock(seed, reviseSuggestion, attempt);
  }
}

class FakeDiversityCriticAgent extends DiversityCriticAgent {
  readonly runMock = jest.fn<
    Promise<PipelineStageRecord<CriticVerdict>>,
    [DesignerOutput, ExistingTemplateSummary[], number]
  >();

  constructor() {
    super(fakePipelineProvider);
  }

  override run(
    candidate: DesignerOutput,
    existing: ExistingTemplateSummary[],
    attempt: number,
  ): Promise<PipelineStageRecord<CriticVerdict>> {
    return this.runMock(candidate, existing, attempt);
  }
}

class FakeSchemaGeneratorAgent extends SchemaGeneratorAgent {
  readonly runMock = jest.fn<
    Promise<PipelineStageRecord<SchemaOutput>>,
    [DesignerOutput, number]
  >();

  constructor() {
    super(fakePipelineProvider);
  }

  override run(brief: DesignerOutput, attempt: number): Promise<PipelineStageRecord<SchemaOutput>> {
    return this.runMock(brief, attempt);
  }
}

class FakeVerifierAgent extends VerifierAgent {
  readonly runMock = jest.fn<
    Promise<PipelineStageRecord<VerifierVerdict[]>>,
    [DesignerOutput, SchemaOutput, ExistingTemplateSummary[], number]
  >();

  constructor() {
    super(fakePipelineProvider);
  }

  override run(
    brief: DesignerOutput,
    schema: SchemaOutput,
    existing: ExistingTemplateSummary[],
    attempt: number,
  ): Promise<PipelineStageRecord<VerifierVerdict[]>> {
    return this.runMock(brief, schema, existing, attempt);
  }
}

interface PipelineHarness {
  service: TemplatePipelineService;
  designer: FakeDesignerAgent;
  critic: FakeDiversityCriticAgent;
  schemaGenerator: FakeSchemaGeneratorAgent;
  verifier: FakeVerifierAgent;
}

function createHarness(): PipelineHarness {
  const designer = new FakeDesignerAgent();
  const critic = new FakeDiversityCriticAgent();
  const schemaGenerator = new FakeSchemaGeneratorAgent();
  const verifier = new FakeVerifierAgent();
  const service = new TemplatePipelineService(designer, critic, schemaGenerator, verifier);
  return { service, designer, critic, schemaGenerator, verifier };
}

function createBrief(overrides: Partial<DesignerOutput> = {}): DesignerOutput {
  return {
    templateId: 'template-1',
    name: 'Fresh Clinic',
    tagline: 'Book faster',
    archetype: 'fresh',
    heroMode: 'search-filter',
    platform: 'web',
    chrome: 'none',
    scenario: 'clinic appointments',
    audience: 'patients',
    pages: [
      {
        id: 'home',
        name: 'Home',
        kind: 'landing',
        userTask: 'Find a doctor',
        primaryAction: 'Search',
      },
    ],
    cssVars: { '--color-primary': '#2563eb' },
    componentTemplatesDraft: [
      {
        alias: 'appointment-card',
        role: 'booking',
        description: 'Doctor slot card',
      },
    ],
    bottomTabs: [{ targetPageId: 'home', label: 'Home' }],
    category: 'healthcare',
    displayCategory: 'Healthcare',
    whyArchetype: 'clean clinical trust',
    whyHeroMode: 'search is the primary task',
    diversitySignature: 'clinic search with blue trust palette',
    ...overrides,
  };
}

function createDocument(templateId = 'template-1'): ThemeLayoutDocument {
  const root = {
    id: 'root',
    alias: 'core.screen',
    layout: { mode: 'flow' as const },
    children: [],
  };
  return {
    version: 1,
    themeId: templateId,
    themeName: 'Fresh Clinic',
    description: 'Book faster',
    components: [],
    defaultPageId: 'home',
    pages: [{ id: 'home', name: 'Home', layout: root }],
    layout: root,
  };
}

function createSchema(templateId = 'template-1'): SchemaOutput {
  return {
    templateId,
    document: createDocument(templateId),
    rawToolInput: { templateId },
  };
}

function createExisting(): ExistingTemplateSummary[] {
  return [
    {
      templateId: 'existing-1',
      name: 'Existing Clinic',
      archetype: 'editorial',
      heroMode: 'cover-story',
      displayCategory: 'Healthcare',
      diversitySignature: 'editorial medical story',
      componentTemplateAliases: ['hero-story'],
      primaryHue: '#16a34a',
    },
  ];
}

function stage<T>(attempt: number, output: T): PipelineStageRecord<T> {
  return {
    attempt,
    durationMs: 10 * attempt,
    inputTokens: attempt,
    outputTokens: attempt + 1,
    cacheHitTokens: attempt + 2,
    output,
  };
}

function passVerdicts(): VerifierVerdict[] {
  return [
    { lens: 'spec-compliance', pass: true, failures: [], summary: 'spec ok' },
    { lens: 'diversity', pass: true, failures: [], summary: 'diverse' },
    { lens: 'business-fidelity', pass: true, failures: [], summary: 'business ok' },
  ];
}

describe('TemplatePipelineService', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('runs all four stages once and returns the generated document', async () => {
    const { service, designer, critic, schemaGenerator, verifier } = createHarness();
    const seed: TemplateSeed = { prompt: 'clinic booking', platform: 'web' };
    const existing = createExisting();
    const brief = createBrief();
    const schema = createSchema();
    designer.runMock.mockResolvedValue(stage(1, brief));
    critic.runMock.mockResolvedValue(stage(1, { verdict: 'pass', conflicts: [] }));
    schemaGenerator.runMock.mockResolvedValue(stage(1, schema));
    verifier.runMock.mockResolvedValue(stage(1, passVerdicts()));

    await expect(service.generate(seed, existing)).resolves.toMatchObject({
      templateId: 'template-1',
      document: schema.document,
      brief,
      totalAttempts: 1,
      stages: {
        designer: [expect.objectContaining({ attempt: 1, output: brief })],
        critic: [expect.objectContaining({ attempt: 1 })],
        schema: [expect.objectContaining({ attempt: 1, output: schema })],
        verifier: [expect.objectContaining({ attempt: 1 })],
      },
    });

    expect(designer.runMock.mock.calls).toEqual([[seed, undefined, 1]]);
    expect(critic.runMock.mock.calls).toEqual([[brief, existing, 1]]);
    expect(schemaGenerator.runMock.mock.calls).toEqual([[brief, 1]]);
    expect(verifier.runMock.mock.calls).toEqual([[brief, schema, existing, 1]]);
  });

  it('returns external results without leaking stage internals', async () => {
    const { service, designer, critic, schemaGenerator, verifier } = createHarness();
    const brief = createBrief();
    const schema = createSchema();
    designer.runMock.mockResolvedValue(stage(1, brief));
    critic.runMock.mockResolvedValue(stage(1, { verdict: 'pass', conflicts: [] }));
    schemaGenerator.runMock.mockResolvedValue(stage(1, schema));
    verifier.runMock.mockResolvedValue(stage(1, passVerdicts()));

    const result = await service.generateExternal({ prompt: 'clinic booking' }, []);

    expect(result).toEqual({
      templateId: 'template-1',
      document: schema.document,
      brief,
      totalDurationMs: expect.any(Number) as number,
    });
    expect('stages' in result).toBe(false);
    expect('totalAttempts' in result).toBe(false);
  });

  it('retries from designer when the critic asks for revision', async () => {
    const { service, designer, critic, schemaGenerator, verifier } = createHarness();
    const seed: TemplateSeed = { prompt: 'clinic booking' };
    const firstBrief = createBrief({ templateId: 'template-1', heroMode: 'cover-story' });
    const revisedBrief = createBrief({ templateId: 'template-2', heroMode: 'search-filter' });
    const schema = createSchema('template-2');
    designer.runMock
      .mockResolvedValueOnce(stage(1, firstBrief))
      .mockResolvedValueOnce(stage(2, revisedBrief));
    critic.runMock
      .mockResolvedValueOnce(
        stage(1, {
          verdict: 'revise',
          conflicts: [
            {
              templateId: 'existing-1',
              dimension: 'heroMode',
              description: 'hero is too close',
            },
          ],
          suggestion: 'use search-filter instead',
        }),
      )
      .mockResolvedValueOnce(stage(2, { verdict: 'pass', conflicts: [] }));
    schemaGenerator.runMock.mockResolvedValueOnce(stage(2, schema));
    verifier.runMock.mockResolvedValueOnce(stage(2, passVerdicts()));

    await expect(service.generate(seed, [])).resolves.toMatchObject({
      templateId: 'template-2',
      totalAttempts: 2,
    });
    expect(designer.runMock.mock.calls).toEqual([
      [seed, undefined, 1],
      [seed, 'use search-filter instead', 2],
    ]);
    expect(schemaGenerator.runMock.mock.calls).toEqual([[revisedBrief, 2]]);
  });

  it('retries from designer when schema generation throws', async () => {
    const { service, designer, critic, schemaGenerator, verifier } = createHarness();
    const seed: TemplateSeed = { prompt: 'clinic booking' };
    const firstBrief = createBrief({ templateId: 'template-1' });
    const revisedBrief = createBrief({ templateId: 'template-2' });
    const schema = createSchema('template-2');
    designer.runMock
      .mockResolvedValueOnce(stage(1, firstBrief))
      .mockResolvedValueOnce(stage(2, revisedBrief));
    critic.runMock.mockResolvedValue(stage(1, { verdict: 'pass', conflicts: [] }));
    schemaGenerator.runMock
      .mockRejectedValueOnce(new Error('invalid generated document'))
      .mockResolvedValueOnce(stage(2, schema));
    verifier.runMock.mockResolvedValueOnce(stage(2, passVerdicts()));

    await expect(service.generate(seed, [])).resolves.toMatchObject({
      templateId: 'template-2',
      totalAttempts: 2,
    });
    expect(designer.runMock.mock.calls[1]).toEqual([
      seed,
      'Stage 3 schema generation failed: invalid generated document',
      2,
    ]);
  });

  it('throws with last schema after verifier retry exhaustion', async () => {
    const { service, designer, critic, schemaGenerator, verifier } = createHarness();
    const seed: TemplateSeed = { prompt: 'clinic booking' };
    const briefs = [
      createBrief({ templateId: 'template-1' }),
      createBrief({ templateId: 'template-2' }),
      createBrief({ templateId: 'template-3' }),
    ];
    const schemas = [
      createSchema('template-1'),
      createSchema('template-2'),
      createSchema('template-3'),
    ];
    const failedVerdicts: VerifierVerdict[] = [
      {
        lens: 'business-fidelity',
        pass: false,
        failures: [
          {
            rule: 'business_task_missing',
            severity: 'error',
            description: 'booking task missing',
          },
        ],
        summary: 'booking task missing',
      },
    ];
    for (let i = 0; i < 3; i += 1) {
      designer.runMock.mockResolvedValueOnce(stage(i + 1, briefs[i]));
      critic.runMock.mockResolvedValueOnce(stage(i + 1, { verdict: 'pass', conflicts: [] }));
      schemaGenerator.runMock.mockResolvedValueOnce(stage(i + 1, schemas[i]));
      verifier.runMock.mockResolvedValueOnce(stage(i + 1, failedVerdicts));
    }

    await expect(service.generate(seed, [])).rejects.toMatchObject({
      message: expect.stringContaining('Template pipeline exhausted 3 attempts') as string,
      lastSchema: {
        templateId: 'template-3',
        document: schemas[2].document,
        brief: briefs[2],
        totalAttempts: 3,
      },
    });
    expect(designer.runMock.mock.calls[1]).toEqual([
      seed,
      '[business-fidelity] booking task missing',
      2,
    ]);
    expect(designer.runMock.mock.calls[2]).toEqual([
      seed,
      '[business-fidelity] booking task missing',
      3,
    ]);
  });
});
