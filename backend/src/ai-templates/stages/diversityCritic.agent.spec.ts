/**
 * Tests for the Critic reviseActions parser (PR-B.1).
 *
 * Run: pnpm --dir backend test -- --runTestsByPath src/ai-templates/stages/diversityCritic.agent.spec.ts
 */

import type { AIProvider } from '@shared/agent/contracts/provider';

import type { AiTemplatePipelineProvider } from '../../ai/pipelineProvider.port';
import type {
  DesignerOutput,
  ExistingTemplateSummary,
  HeroMode,
} from '../orchestrator/pipeline.types';
import { DiversityCriticAgent, parseReviseActions } from './diversityCritic.agent';

describe('parseReviseActions (PR-B.1)', () => {
  it('returns [] for empty or non-array input', () => {
    expect(parseReviseActions(undefined)).toEqual([]);
    expect(parseReviseActions(null)).toEqual([]);
    expect(parseReviseActions([])).toEqual([]);
    expect(parseReviseActions('not-an-array')).toEqual([]);
    expect(parseReviseActions(42)).toEqual([]);
  });

  it('keeps well-formed actions of every variant in input order', () => {
    const result = parseReviseActions([
      { type: 'add_section', afterRegion: 'hero', sectionKind: 'metrics' },
      { type: 'replace_section', regionKey: 'banner', newKind: 'card-grid' },
      { type: 'adjust_layout', regionKey: 'cta', direction: 'row' },
      { type: 'improve_contrast', regionKey: 'footer', suggestion: '提高主色亮度' },
    ]);
    expect(result).toEqual([
      { type: 'add_section', afterRegion: 'hero', sectionKind: 'metrics' },
      { type: 'replace_section', regionKey: 'banner', newKind: 'card-grid' },
      { type: 'adjust_layout', regionKey: 'cta', direction: 'row' },
      { type: 'improve_contrast', regionKey: 'footer', suggestion: '提高主色亮度' },
    ]);
  });

  it('drops entries with unknown type discriminators', () => {
    const result = parseReviseActions([
      { type: 'unknown_variant', regionKey: 'x', direction: 'row' },
      { type: 'adjust_layout', regionKey: 'cta', direction: 'column' },
    ]);
    expect(result).toEqual([{ type: 'adjust_layout', regionKey: 'cta', direction: 'column' }]);
  });

  it('drops entries missing required fields for their type', () => {
    const result = parseReviseActions([
      { type: 'add_section', afterRegion: 'hero' }, // missing sectionKind
      { type: 'replace_section', regionKey: 'banner' }, // missing newKind
      { type: 'adjust_layout', direction: 'row' }, // missing regionKey
      { type: 'adjust_layout', regionKey: 'cta', direction: 'wrong' }, // bad direction
      { type: 'improve_contrast', regionKey: 'footer' }, // missing suggestion
    ]);
    expect(result).toEqual([]);
  });

  it('drops non-string or empty field values', () => {
    const result = parseReviseActions([
      { type: 'add_section', afterRegion: '', sectionKind: 'x' },
      { type: 'replace_section', regionKey: 123, newKind: 'x' },
      { type: 'adjust_layout', regionKey: 'cta', direction: 'row', extra: 'ignored' },
    ]);
    expect(result).toEqual([{ type: 'adjust_layout', regionKey: 'cta', direction: 'row' }]);
  });

  it('reports dropped count via onDropped callback (does not throw)', () => {
    const drops: string[] = [];
    parseReviseActions(
      [
        { type: 'unknown', foo: 1 },
        null,
        { type: 'add_section', afterRegion: 'hero' },
        { type: 'adjust_layout', regionKey: 'cta', direction: 'sideways' },
      ],
      (msg) => drops.push(msg),
    );
    expect(drops).toHaveLength(1);
    expect(drops[0]).toMatch(/dropped 4 malformed action\(s\) of 4/);
  });
});

describe('DiversityCriticAgent saturation-aware hard rules', () => {
  const noopPipelineProvider: AiTemplatePipelineProvider = {
    getProviderForTemplatePipeline: () => ({
      provider: {} as AIProvider,
      model: 'test-pro',
      liteModel: 'test-lite',
      apiKeyConfigured: false,
    }),
  };

  function makeCandidate(overrides: Partial<DesignerOutput> = {}): DesignerOutput {
    return {
      templateId: 'candidate-1',
      name: '测试模板',
      tagline: '快捷高效',
      archetype: 'fresh',
      variant: 'standard',
      heroMode: 'date-strip',
      platform: 'mini-program',
      chrome: 'wechat',
      scenario: '日常打卡',
      audience: '个人用户',
      pages: [{ id: 'home', name: '首页', kind: 'home', userTask: '查看首页' }],
      cssVars: { '--color-primary': '#16A34A' },
      componentTemplatesDraft: [],
      bottomTabs: [{ targetPageId: 'home', label: '首页' }],
      category: 'lifestyle',
      displayCategory: 'Lifestyle',
      whyArchetype: 'fit',
      whyHeroMode: 'fit',
      diversitySignature: 'fresh green card',
      ...overrides,
    };
  }

  function makeExisting(
    id: string,
    archetype: ExistingTemplateSummary['archetype'],
    heroMode: HeroMode,
    displayCategory = 'Lifestyle',
  ): ExistingTemplateSummary {
    return {
      templateId: id,
      name: `模板 ${id}`,
      archetype,
      heroMode,
      displayCategory,
      diversitySignature: `${archetype}-${heroMode}`,
      componentTemplateAliases: [],
      primaryHue: '#16A34A',
      layoutSignature: 'screen(navbar,panel(text),tabs)',
    };
  }

  it('rejects duplicate heroMode while unused heroModes remain in category', async () => {
    const critic = new DiversityCriticAgent(noopPipelineProvider);
    const existing = [makeExisting('t-1', 'editorial', 'date-strip')];

    const res = await critic.run(makeCandidate({ heroMode: 'date-strip' }), existing, 1);
    expect(res.output.verdict).toBe('revise');
    expect(res.output.conflicts.some((c) => c.dimension === 'heroMode')).toBe(true);
  });

  it('permits 2nd heroMode use once all 8 heroModes are saturated in category', async () => {
    const critic = new DiversityCriticAgent(noopPipelineProvider);
    const allHeroModes: HeroMode[] = [
      'date-strip',
      'function-grid',
      'cover-story',
      'metric-dashboard',
      'story-ring',
      'dual-column',
      'timer-banner',
      'search-filter',
    ];
    const archetypes: ExistingTemplateSummary['archetype'][] = [
      'fresh',
      'immersive',
      'editorial',
      'vibrant',
      'dark-pro',
    ];
    const existing = allHeroModes.map((mode, idx) =>
      makeExisting(`t-${idx}`, archetypes[idx % archetypes.length], mode),
    );

    const res = await critic.run(
      makeCandidate({ archetype: 'dark-pro', heroMode: 'date-strip' }),
      existing,
      1,
    );
    expect(res.output.verdict).toBe('pass');
  });

  it('rejects 3rd archetype before all 5 archetypes reach 2 uses, then unlocks 3rd', async () => {
    const critic = new DiversityCriticAgent(noopPipelineProvider);
    const twoFresh = [
      makeExisting('t-1', 'fresh', 'function-grid'),
      makeExisting('t-2', 'fresh', 'cover-story'),
    ];
    const blocked = await critic.run(
      makeCandidate({ archetype: 'fresh', heroMode: 'story-ring' }),
      twoFresh,
      1,
    );
    expect(blocked.output.verdict).toBe('revise');
    expect(blocked.output.conflicts.some((c) => c.dimension === 'archetype')).toBe(true);

    const allArchetypes: ExistingTemplateSummary['archetype'][] = [
      'fresh',
      'immersive',
      'editorial',
      'vibrant',
      'dark-pro',
    ];
    const heroModes: HeroMode[] = [
      'date-strip',
      'function-grid',
      'cover-story',
      'metric-dashboard',
      'story-ring',
      'dual-column',
      'timer-banner',
      'search-filter',
    ];
    // Give each of the 5 archetypes 2 templates (10 total); reuse non-target heroModes safely? Wait:
    // keep candidate heroMode distinct or saturate heroModes too (>=1 each, candidate at min usage).
    const saturated = allArchetypes.flatMap((arch, aIdx) =>
      [0, 1].map((copyIdx) =>
        makeExisting(
          `t-${aIdx}-${copyIdx}`,
          arch,
          heroModes[(aIdx * 2 + copyIdx) % heroModes.length],
        ),
      ),
    );
    const allowed = await critic.run(
      makeCandidate({ archetype: 'fresh', heroMode: 'timer-banner' }),
      saturated,
      1,
    );
    expect(allowed.output.verdict).toBe('pass');
  });
});
