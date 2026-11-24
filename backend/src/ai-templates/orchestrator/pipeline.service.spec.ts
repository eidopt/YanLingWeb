import { Logger } from '@nestjs/common';
import type { ThemeLayoutDocument } from '@shared/agent/contracts/agent';
import type { AIProvider } from '@shared/agent/contracts/provider';
import type { VerifierLens } from '@shared/agent/runtime';

import type { AiTemplatePipelineProvider } from '../../ai/pipelineProvider.port';
import { DesignerAgent } from '../stages/designer.agent';
import { DiversityCriticAgent } from '../stages/diversityCritic.agent';
import { SchemaGeneratorAgent } from '../stages/schemaGenerator.agent';
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
    liteModel: 'test-model-lite',
    apiKeyConfigured: false,
  }),
};

class FakeDesignerAgent extends DesignerAgent {
  readonly runMock = jest.fn<
    Promise<PipelineStageRecord<DesignerOutput>>,
    [TemplateSeed, string | undefined, number, string?, ExistingTemplateSummary[]?]
  >();

  constructor() {
    super(fakePipelineProvider);
  }

  override run(
    seed: TemplateSeed,
    reviseSuggestion: string | undefined,
    attempt: number,
    ownerUserId?: string,
    existing?: ExistingTemplateSummary[],
  ): Promise<PipelineStageRecord<DesignerOutput>> {
    return existing !== undefined || ownerUserId !== undefined
      ? this.runMock(seed, reviseSuggestion, attempt, ownerUserId, existing)
      : this.runMock(seed, reviseSuggestion, attempt);
  }
}

class FakeDiversityCriticAgent extends DiversityCriticAgent {
  readonly runMock = jest.fn<
    Promise<PipelineStageRecord<CriticVerdict>>,
    [DesignerOutput, ExistingTemplateSummary[], number, string?]
  >();

  constructor() {
    super(fakePipelineProvider);
  }

  override run(
    candidate: DesignerOutput,
    existing: ExistingTemplateSummary[],
    attempt: number,
    ownerUserId?: string,
  ): Promise<PipelineStageRecord<CriticVerdict>> {
    return ownerUserId !== undefined
      ? this.runMock(candidate, existing, attempt, ownerUserId)
      : this.runMock(candidate, existing, attempt);
  }
}

class FakeSchemaGeneratorAgent extends SchemaGeneratorAgent {
  readonly runMock = jest.fn<
    Promise<PipelineStageRecord<SchemaOutput>>,
    [DesignerOutput, number, string?, string?]
  >();

  constructor() {
    super(fakePipelineProvider);
  }

  override run(
    brief: DesignerOutput,
    attempt: number,
    ownerUserId?: string,
    previousError?: string,
  ): Promise<PipelineStageRecord<SchemaOutput>> {
    return previousError !== undefined
      ? this.runMock(brief, attempt, ownerUserId, previousError)
      : ownerUserId !== undefined
        ? this.runMock(brief, attempt, ownerUserId)
        : this.runMock(brief, attempt);
  }
}

class FakeVerifierAgent extends VerifierAgent {
  readonly runMock = jest.fn<
    Promise<PipelineStageRecord<VerifierVerdict[]>>,
    [
      DesignerOutput,
      SchemaOutput,
      ExistingTemplateSummary[],
      number,
      string?,
      (readonly VerifierLens[])?,
    ]
  >();

  constructor() {
    super(fakePipelineProvider);
  }

  override run(
    brief: DesignerOutput,
    schema: SchemaOutput,
    existing: ExistingTemplateSummary[],
    attempt: number,
    ownerUserId?: string,
    lenses?: readonly VerifierLens[],
  ): Promise<PipelineStageRecord<VerifierVerdict[]>> {
    return lenses !== undefined
      ? this.runMock(brief, schema, existing, attempt, ownerUserId, lenses)
      : ownerUserId !== undefined
        ? this.runMock(brief, schema, existing, attempt, ownerUserId)
        : this.runMock(brief, schema, existing, attempt);
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
    variant: 'standard',
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
      layoutSignature: '',
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

    expect(designer.runMock.mock.calls).toEqual([[seed, undefined, 1, undefined, existing]]);
    expect(critic.runMock.mock.calls).toEqual([[brief, existing, 1]]);
    expect(schemaGenerator.runMock.mock.calls).toEqual([[brief, 1]]);
    expect(verifier.runMock.mock.calls).toEqual([[brief, schema, existing, 1]]);
  });

  it('emits start and end events for each stage when onStageEvent is provided', async () => {
    const { service, designer, critic, schemaGenerator, verifier } = createHarness();
    const brief = createBrief();
    const schema = createSchema();
    designer.runMock.mockResolvedValue(stage(1, brief));
    critic.runMock.mockResolvedValue(stage(1, { verdict: 'pass', conflicts: [] }));
    schemaGenerator.runMock.mockResolvedValue(stage(1, schema));
    verifier.runMock.mockResolvedValue(stage(1, passVerdicts()));

    const stageEvents: { phase: 'start' | 'end'; stage: string; status?: string }[] = [];
    await service.generate({ prompt: 'clinic booking' }, [], {
      onStageEvent: (phase, payload) => {
        stageEvents.push({ phase, stage: payload.stage, status: payload.status });
      },
    });

    expect(stageEvents).toEqual([
      { phase: 'start', stage: 'designer', status: undefined },
      { phase: 'end', stage: 'designer', status: 'ok' },
      { phase: 'start', stage: 'critic', status: undefined },
      { phase: 'end', stage: 'critic', status: 'ok' },
      { phase: 'start', stage: 'schema', status: undefined },
      { phase: 'end', stage: 'schema', status: 'ok' },
      { phase: 'start', stage: 'verifier', status: undefined },
      { phase: 'end', stage: 'verifier', status: 'ok' },
    ]);
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
      [seed, undefined, 1, undefined, []],
      [seed, 'use search-filter instead', 2, undefined, []],
    ]);
    expect(schemaGenerator.runMock.mock.calls).toEqual([[revisedBrief, 2]]);
  });

  it('retries schemaGen with previousError hint without returning to Designer', async () => {
    const { service, designer, critic, schemaGenerator, verifier } = createHarness();
    const seed: TemplateSeed = { prompt: 'clinic booking' };
    const existing = createExisting();
    const brief = createBrief({ templateId: 'template-1' });
    const schema = createSchema('template-1');
    designer.runMock.mockResolvedValueOnce(stage(1, brief));
    critic.runMock.mockResolvedValue(stage(1, { verdict: 'pass', conflicts: [] }));
    // SchemaGen: attempt 1 fails, attempt 2 succeeds with previousError hint
    schemaGenerator.runMock
      .mockRejectedValueOnce(new Error('validation error'))
      .mockResolvedValueOnce(stage(1, schema));
    verifier.runMock.mockResolvedValueOnce(stage(1, passVerdicts()));

    const result = await service.generate(seed, existing);

    // Designer only called ONCE — not retried, receives existing summaries
    expect(designer.runMock).toHaveBeenCalledTimes(1);
    expect(designer.runMock.mock.calls[0]).toEqual([seed, undefined, 1, undefined, existing]);
    // SchemaGen called twice (1 fail + 1 success; attempt 2 receives previousError)
    expect(schemaGenerator.runMock).toHaveBeenCalledTimes(2);
    expect(schemaGenerator.runMock.mock.calls[0]).toEqual([brief, 1]);
    expect(schemaGenerator.runMock.mock.calls[1]).toEqual([
      brief,
      1,
      undefined,
      'validation error',
    ]);
    // Pipeline succeeded on attempt 1
    expect(result.totalAttempts).toBe(1);
    expect(result.templateId).toBe('template-1');
  });

  it('falls back to Designer after MAX_SCHEMA_ATTEMPTS_PER_BRIEF (2) failures', async () => {
    const { service, designer, critic, schemaGenerator, verifier } = createHarness();
    const seed: TemplateSeed = { prompt: 'clinic booking' };
    const brief1 = createBrief({ templateId: 'template-1' });
    const brief2 = createBrief({ templateId: 'template-2' });
    const schema = createSchema('template-2');
    designer.runMock
      .mockResolvedValueOnce(stage(1, brief1))
      .mockResolvedValueOnce(stage(2, brief2));
    critic.runMock.mockResolvedValue(stage(1, { verdict: 'pass', conflicts: [] }));
    // Attempt 1: SchemaGen fails MAX_SCHEMA_ATTEMPTS_PER_BRIEF = 2 times
    schemaGenerator.runMock
      .mockRejectedValueOnce(new Error('error 0'))
      .mockRejectedValueOnce(new Error('error 1'));
    // Attempt 2: SchemaGen succeeds on first try
    schemaGenerator.runMock.mockResolvedValueOnce(stage(2, schema));
    verifier.runMock.mockResolvedValueOnce(stage(2, passVerdicts()));

    const result = await service.generate(seed, []);

    // Designer called twice (attempt 1 + attempt 2 after fallback)
    expect(designer.runMock).toHaveBeenCalledTimes(2);
    expect(designer.runMock.mock.calls[0]).toEqual([seed, undefined, 1, undefined, []]);
    expect(designer.runMock.mock.calls[1]).toEqual([
      seed,
      expect.stringContaining('Stage 3 schema generation failed: error 1') as string,
      2,
      undefined,
      [],
    ]);
    // SchemaGen called 3 times (2 in attempt 1 + 1 in attempt 2)
    expect(schemaGenerator.runMock).toHaveBeenCalledTimes(3);
    expect(schemaGenerator.runMock.mock.calls[1]).toEqual([brief1, 1, undefined, 'error 0']);
    expect(result.totalAttempts).toBe(2);
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
      undefined,
      [],
    ]);
    expect(designer.runMock.mock.calls[2]).toEqual([
      seed,
      '[business-fidelity] booking task missing',
      3,
      undefined,
      [],
    ]);
  });

  // PR-B.1: structured revise actions must surface in the next Designer attempt
  describe('buildCriticReviseSuggestion (PR-B.1)', () => {
    it('returns just the suggestion when reviseActions is empty or absent', () => {
      expect(
        TemplatePipelineService.buildCriticReviseSuggestion({
          verdict: 'revise',
          conflicts: [],
          suggestion: '换一个 archetype',
        }),
      ).toBe('换一个 archetype');

      expect(
        TemplatePipelineService.buildCriticReviseSuggestion({
          verdict: 'revise',
          conflicts: [],
          reviseActions: [],
        }),
      ).toBe('多样性冲突 0 个，换一个 archetype 或 heroMode');
    });

    it('appends typed bullet lines for each reviseAction variant', () => {
      const result = TemplatePipelineService.buildCriticReviseSuggestion({
        verdict: 'revise',
        conflicts: [],
        suggestion: '请按以下结构化动作修订',
        reviseActions: [
          { type: 'add_section', afterRegion: 'hero', sectionKind: 'metrics' },
          { type: 'replace_section', regionKey: 'banner', newKind: 'card-grid' },
          { type: 'adjust_layout', regionKey: 'cta', direction: 'row' },
          { type: 'improve_contrast', regionKey: 'footer', suggestion: '提高主色亮度' },
        ],
      });
      expect(result).toContain('请按以下结构化动作修订');
      expect(result).toContain('[add_section] 在 hero 之后新增 section: metrics');
      expect(result).toContain('[replace_section] 将 banner 替换为 card-grid');
      expect(result).toContain('[adjust_layout] 将 cta 调整为 row');
      expect(result).toContain('[improve_contrast] footer: 提高主色亮度');
    });
  });

  it('repairs schema locally after verifier failure without restarting from Designer', async () => {
    const { service, designer, critic, schemaGenerator, verifier } = createHarness();
    const seed: TemplateSeed = { prompt: 'knowledge app' };
    const brief = createBrief({ templateId: 'knowledge-hub' });
    const initialSchema = createSchema('knowledge-hub');
    const repairedSchema = createSchema('knowledge-hub-repaired');

    designer.runMock.mockResolvedValueOnce(stage(1, brief));
    critic.runMock.mockResolvedValueOnce(stage(1, { verdict: 'pass', conflicts: [] }));
    schemaGenerator.runMock.mockResolvedValueOnce(stage(1, initialSchema));
    const repairSpy = jest
      .spyOn(schemaGenerator, 'repairFromVerifierFeedback')
      .mockResolvedValueOnce(stage(1, repairedSchema));

    verifier.runMock
      .mockResolvedValueOnce(
        stage(1, [
          {
            lens: 'business-fidelity',
            pass: false,
            failures: [
              {
                rule: 'action_missing',
                severity: 'error',
                location: 'pages[1]',
                description: '下载页缺少主按钮',
              },
            ],
            summary: '下载页缺少主按钮',
          },
        ]),
      )
      .mockResolvedValueOnce(stage(1, passVerdicts()));

    const result = await service.generate(seed, []);

    expect(designer.runMock).toHaveBeenCalledTimes(1);
    expect(schemaGenerator.runMock).toHaveBeenCalledTimes(1);
    expect(repairSpy).toHaveBeenCalledTimes(1);
    expect(verifier.runMock).toHaveBeenCalledTimes(2);
    expect(result.document).toBe(repairedSchema.document);
    expect(result.totalAttempts).toBe(1);
  });

  it('allows diversity-only verifier failure on the final attempt (best-effort)', async () => {
    const { service, designer, critic, schemaGenerator, verifier } = createHarness();
    const seed: TemplateSeed = { prompt: 'knowledge app' };
    const briefs = [
      createBrief({ templateId: 't-1' }),
      createBrief({ templateId: 't-2' }),
      createBrief({ templateId: 't-3' }),
    ];
    const schemas = [createSchema('t-1'), createSchema('t-2'), createSchema('t-3')];
    const diversityOnlyFail: VerifierVerdict[] = [
      { lens: 'spec-compliance', pass: true, failures: [], summary: 'ok' },
      {
        lens: 'diversity',
        pass: false,
        failures: [
          {
            rule: 'palette_similar',
            severity: 'error',
            description: '主色相接近',
          },
        ],
        summary: '与已有模板主色相接近',
      },
      { lens: 'business-fidelity', pass: true, failures: [], summary: 'ok' },
    ];

    for (let i = 0; i < 3; i += 1) {
      designer.runMock.mockResolvedValueOnce(stage(i + 1, briefs[i]));
      critic.runMock.mockResolvedValueOnce(stage(i + 1, { verdict: 'pass', conflicts: [] }));
      schemaGenerator.runMock.mockResolvedValueOnce(stage(i + 1, schemas[i]));
      verifier.runMock.mockResolvedValueOnce(stage(i + 1, diversityOnlyFail));
    }

    const result = await service.generate(seed, []);

    expect(result.templateId).toBe('t-3');
    expect(result.totalAttempts).toBe(3);
  });

  it('forwards ownerUserId to every stage including repair and re-verify', async () => {
    const { service, designer, critic, schemaGenerator, verifier } = createHarness();
    const seed: TemplateSeed = { prompt: 'knowledge app' };
    const existing = createExisting();
    const brief = createBrief({ templateId: 'knowledge-hub' });
    const initialSchema = createSchema('knowledge-hub');
    const repairedSchema = createSchema('knowledge-hub-repaired');

    designer.runMock.mockResolvedValueOnce(stage(1, brief));
    critic.runMock.mockResolvedValueOnce(stage(1, { verdict: 'pass', conflicts: [] }));
    schemaGenerator.runMock.mockResolvedValueOnce(stage(1, initialSchema));
    const repairSpy = jest
      .spyOn(schemaGenerator, 'repairFromVerifierFeedback')
      .mockResolvedValueOnce(stage(1, repairedSchema));

    verifier.runMock
      .mockResolvedValueOnce(
        stage(1, [
          {
            lens: 'business-fidelity',
            pass: false,
            failures: [
              {
                rule: 'action_missing',
                severity: 'error',
                description: '下载页缺少主按钮',
              },
            ],
            summary: '下载页缺少主按钮',
          },
        ]),
      )
      .mockResolvedValueOnce(stage(1, passVerdicts()));

    await service.generate(seed, existing, { ownerUserId: 'user-42' });

    expect(designer.runMock).toHaveBeenCalledWith(seed, undefined, 1, 'user-42', existing);
    expect(critic.runMock).toHaveBeenCalledWith(brief, existing, 1, 'user-42');
    expect(schemaGenerator.runMock).toHaveBeenCalledWith(brief, 1, 'user-42');
    expect(repairSpy).toHaveBeenCalledWith(
      brief,
      initialSchema,
      expect.any(Array),
      1,
      'user-42',
      undefined,
    );
    expect(verifier.runMock).toHaveBeenNthCalledWith(
      1,
      brief,
      initialSchema,
      existing,
      1,
      'user-42',
    );
    expect(verifier.runMock).toHaveBeenNthCalledWith(
      2,
      brief,
      repairedSchema,
      existing,
      1,
      'user-42',
      ['business-fidelity'],
    );
  });

  it('re-verifies only failed lenses after repair and merges prior passed verdicts', async () => {
    const { service, designer, critic, schemaGenerator, verifier } = createHarness();
    const seed: TemplateSeed = { prompt: 'knowledge app' };
    const existing = createExisting();
    const brief = createBrief({ templateId: 'knowledge-hub' });
    const initialSchema = createSchema('knowledge-hub');
    const repairedSchema = createSchema('knowledge-hub-repaired');

    designer.runMock.mockResolvedValueOnce(stage(1, brief));
    critic.runMock.mockResolvedValueOnce(stage(1, { verdict: 'pass', conflicts: [] }));
    schemaGenerator.runMock.mockResolvedValueOnce(stage(1, initialSchema));
    jest
      .spyOn(schemaGenerator, 'repairFromVerifierFeedback')
      .mockResolvedValueOnce(stage(1, repairedSchema));

    verifier.runMock
      .mockResolvedValueOnce(
        stage(1, [
          { lens: 'spec-compliance', pass: true, failures: [], summary: 'ok' },
          { lens: 'diversity', pass: true, failures: [], summary: 'ok' },
          {
            lens: 'business-fidelity',
            pass: false,
            failures: [
              {
                rule: 'action_missing',
                severity: 'error',
                description: '缺少主按钮',
              },
            ],
            summary: '缺少主按钮',
          },
        ]),
      )
      .mockResolvedValueOnce(
        stage(1, [{ lens: 'business-fidelity', pass: true, failures: [], summary: 'fixed' }]),
      );

    const result = await service.generate(seed, existing);

    expect(verifier.runMock).toHaveBeenNthCalledWith(
      2,
      brief,
      repairedSchema,
      existing,
      1,
      undefined,
      ['business-fidelity'],
    );
    expect(result.stages.verifier).toHaveLength(2);
    expect(result.stages.verifier[1]?.output).toEqual([
      { lens: 'spec-compliance', pass: true, failures: [], summary: 'ok' },
      { lens: 'diversity', pass: true, failures: [], summary: 'ok' },
      { lens: 'business-fidelity', pass: true, failures: [], summary: 'fixed' },
    ]);
  });
});
