/**
 * Boundary tests for the semantic editor-instruction compiler (PR-D).
 *
 * The compiler has 5 entry points:
 *  - submit_page_spec          (create_page / update_page)
 *  - update_slot
 *  - fill_pattern
 *  - create_page_from_page_kind
 *  - replace_section
 *
 * Each entry has both a happy path and a recoverable failure path surfaced
 * via `AgentEditResult<T>`. This spec exercises:
 *
 *  1. Happy paths for all 5 entry types, with assertions on the emitted
 *     `operations` shape (the consumer contract).
 *  2. Boundary failures: unknown pageKind, unknown slotKey, unknown
 *     patternKey, unknown regionKey, non-replaceable region, invalid
 *     props (not in editableProps), items below minItems, pattern fields
 *     referencing missing slots, create_page without pageKind.
 *  3. Round-trip: submit_page_spec with both `fill_pattern` and
 *     `replace_section` sections in a single spec.
 *
 * Run: npx tsx --test shared/agent/compiler/semanticInstructionCompiler.spec.ts
 */

import { buildTemplateProfile } from '../template/buildTemplateProfile';
import type {
  TemplateProfile,
  TemplateProfilePattern,
  TemplateProfileRegion,
  TemplateProfileSlot,
} from '../template/templateProfile';
import { resolvePattern, resolveRegion, resolveSlot } from '../template/templateProfileResolver';
import type { ThemeLayoutDocument, ThemeLayoutNode } from '../types';
import {
  compileSemanticEditorInstruction,
  isSemanticEditorInstruction,
  type SemanticEditorInstruction,
} from './semanticInstructionCompiler';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

function expect(actual: unknown) {
  return {
    toBe(expected: unknown) {
      assert.strictEqual(actual, expected);
    },
    toEqual(expected: unknown) {
      assert.deepStrictEqual(actual, expected);
    },
    toMatchObject(expected: object) {
      assert.ok(actual && typeof actual === 'object');
      for (const [k, v] of Object.entries(expected)) {
        assert.deepStrictEqual((actual as Record<string, unknown>)[k], v, `key ${k}`);
      }
    },
    toMatch(re: RegExp) {
      assert.ok(typeof actual === 'string', `expected string, got ${typeof actual}`);
      assert.ok(re.test(actual), `expected ${JSON.stringify(actual)} to match ${re}`);
    },
    toContain(needle: string) {
      assert.ok(typeof actual === 'string' || Array.isArray(actual), 'expected string or array');
      if (typeof actual === 'string') {
        assert.ok(actual.includes(needle), `expected ${JSON.stringify(actual)} to contain ${needle}`);
      } else {
        assert.ok(actual.includes(needle), `expected array to contain ${needle}`);
      }
    },
    toHaveLength(n: number) {
      assert.ok(Array.isArray(actual) || typeof actual === 'string', 'expected array or string');
      assert.strictEqual((actual as { length: number }).length, n);
    },
    toBeGreaterThan(n: number) {
      assert.ok(typeof actual === 'number', 'expected number');
      assert.ok(actual > n, `expected ${actual} > ${n}`);
    },
    toBeUndefined() {
      assert.strictEqual(actual, undefined);
    },
  };
}

function makeNode(
  id: string,
  alias: string,
  props?: Record<string, unknown>,
  children?: ThemeLayoutNode[],
  meta?: Record<string, unknown>,
): ThemeLayoutNode {
  const hasMeta = Boolean(meta?.pageKind ?? meta?.regionKey ?? meta?.slotKey);
  return {
    id,
    alias,
    layout: { mode: 'flow' as const },
    ...(props ? { props } : {}),
    ...(children ? { children } : []),
    ...(hasMeta
      ? {
          meta: {
            ...(meta?.pageKind ? { pageKind: meta.pageKind as string } : {}),
            ...(meta?.regionKey ? { regionKey: meta.regionKey as string } : {}),
            ...(meta?.slotKey ? { slotKey: meta.slotKey as string } : {}),
          },
        }
      : {}),
  };
}

function makePage(
  id: string,
  name: string,
  children: ThemeLayoutNode[],
  meta?: Record<string, unknown>,
): { id: string; name: string; layout: ThemeLayoutNode } {
  const layout: ThemeLayoutNode = {
    id: `${id}-screen`,
    alias: 'core.screen',
    layout: { mode: 'flow' as const },
    props: { title: name },
    children,
    ...(meta ? { meta } : {}),
  };
  return { id, name, layout };
}

function makeDoc(pages: ReturnType<typeof makePage>[], themeName = 'Test Template'): ThemeLayoutDocument {
  const root = pages[0]?.layout ?? { id: 'root', alias: 'core.screen', layout: { mode: 'flow' as const } };
  return {
    version: 1,
    themeId: 'test-1',
    themeName,
    description: '',
    components: [],
    defaultPageId: pages[0]?.id ?? 'page-1',
    pages,
    layout: root,
  };
}

/**
 * Hand-build a TemplateProfile that contains the slots/regions/patterns
 * the compiler resolves against. We use the natural resolver so the spec
 * stays self-consistent with the real builder output.
 */
function profileWithFixture(): {
  doc: ThemeLayoutDocument;
  profile: TemplateProfile;
  pageKey: string;
  slotKey: string;
  regionKey: string;
  patternKey: string;
} {
  const homeId = 'home';
  // Use 'core.text' so the resolver derives editableProps including 'text',
  // and override the slot key via meta so it stays stable across the spec.
  const slot = makeNode('hero-cta', 'core.text', { text: '立即购买' }, undefined, {
    regionKey: 'hero',
    slotKey: 'hero-cta',
  });
  // The top-level container must be a CONTAINER_ALIASES alias (core.stack)
  // and have meta.regionKey = 'hero' so the builder assigns regionKey='hero'
  // exactly. The slot's own meta.regionKey is used for the parent lookup.
  const stackNode: ThemeLayoutNode = {
    id: 'hero',
    alias: 'core.stack',
    layout: { mode: 'flow' as const },
    children: [slot],
    meta: { regionKey: 'hero' },
  };
  const home = makePage(homeId, '首页', [stackNode], {
    pageKey: homeId,
    pageKind: 'home',
  });
  const doc = makeDoc([home]);
  const profile = buildTemplateProfile(doc);

  // Inject a synthetic pattern + a non-replaceable region so we can cover
  // both happy and failure paths without depending on inference quirks.
  const syntheticSlot: TemplateProfileSlot = {
    slotKey: 'feed-item-1',
    nodeId: 'feed-1',
    pageKey: homeId,
    regionKey: 'feed',
    editableProps: ['title', 'subtitle'],
  };
  const syntheticPattern: TemplateProfilePattern = {
    patternKey: 'feed-items',
    pageKey: homeId,
    sourceRootNodeId: 'feed-1',
    parentNodeId: 'feed',
    minItems: 2,
    maxItems: 10,
    fields: [
      { fieldKey: 'title', slotKey: 'feed-item-1', prop: 'title', required: true },
      { fieldKey: 'subtitle', slotKey: 'feed-item-1', prop: 'subtitle', required: false },
    ],
  };
  const replaceableRegion: TemplateProfileRegion = {
    regionKey: 'hero',
    pageKey: homeId,
    replaceable: true,
  };
  const nonReplaceableRegion: TemplateProfileRegion = {
    regionKey: 'footer',
    pageKey: homeId,
    replaceable: false,
  };

  const finalProfile: TemplateProfile = {
    ...profile,
    pages: profile.pages,
    slots: [...profile.slots, syntheticSlot],
    patterns: [syntheticPattern],
    regions: [replaceableRegion, nonReplaceableRegion],
  };

  return {
    doc,
    profile: finalProfile,
    pageKey: homeId,
    slotKey: 'hero-cta',
    regionKey: 'hero',
    patternKey: 'feed-items',
  };
}

void describe('isSemanticEditorInstruction', () => {
  void it('accepts all 5 known types', () => {
    for (const t of [
      'submit_page_spec',
      'update_slot',
      'fill_pattern',
      'create_page_from_page_kind',
      'replace_section',
    ]) {
      expect(isSemanticEditorInstruction({ type: t })).toBe(true);
    }
  });

  void it('rejects unknown types', () => {
    expect(isSemanticEditorInstruction({ type: 'delete_everything' })).toBe(false);
  });
});

void describe('compileSemanticEditorInstruction — update_slot', () => {
  void it('compiles a valid slot update with editable prop', () => {
    const { doc, profile, pageKey, slotKey } = profileWithFixture();
    const instr: SemanticEditorInstruction = {
      type: 'update_slot',
      pageKey,
      slotKey,
      props: { text: '查看详情' },
    };
    const result = compileSemanticEditorInstruction(doc, instr, profile);
    assert.strictEqual(result.success, true);
    if (result.success) {
      expect(result.data.operations).toHaveLength(1);
      expect(result.data.operations[0]).toMatchObject({
        type: 'update_props',
        props: { text: '查看详情' },
        select: true,
      });
    }
  });

  void it('rejects an unknown slotKey with slot_not_found', () => {
    const { doc, profile, pageKey } = profileWithFixture();
    const instr: SemanticEditorInstruction = {
      type: 'update_slot',
      pageKey,
      slotKey: 'no-such-slot',
      props: { label: 'x' },
    };
    const result = compileSemanticEditorInstruction(doc, instr, profile);
    assert.strictEqual(result.success, false);
    if (!result.success) {
      assert.strictEqual(result.error.code, 'slot_not_found');
      if (result.error.code === 'slot_not_found') {
        assert.strictEqual(result.error.slotKey, 'no-such-slot');
      }
    }
  });

  void it('rejects props not in editableProps with invalid_props', () => {
    const { doc, profile, pageKey, slotKey } = profileWithFixture();
    // core.text editableProps is ['text', 'variant', 'as']; both 'color' and
    // 'label' are not editable on the resolver-derived slot.
    const instr: SemanticEditorInstruction = {
      type: 'update_slot',
      pageKey,
      slotKey,
      props: { text: 'ok', color: 'red', label: 'hi' },
    };
    const result = compileSemanticEditorInstruction(doc, instr, profile);
    assert.strictEqual(result.success, false);
    if (!result.success) {
      assert.strictEqual(result.error.code, 'invalid_props');
      if (result.error.code === 'invalid_props') {
        expect(result.error.invalidProps).toEqual(['color', 'label']);
        expect(result.error.allowedProps).toContain('text');
      }
    }
  });
});

void describe('compileSemanticEditorInstruction — create_page_from_page_kind', () => {
  void it('compiles a create-page-from-kind with a unique pageId', () => {
    const { doc, profile } = profileWithFixture();
    const instr: SemanticEditorInstruction = {
      type: 'create_page_from_page_kind',
      pageKind: 'home',
      name: '我的首页',
    };
    const result = compileSemanticEditorInstruction(doc, instr, profile);
    assert.strictEqual(result.success, true);
    if (result.success) {
      expect(result.data.operations[0]).toMatchObject({
        type: 'create_page_from_reference',
        name: '我的首页',
        activate: true,
        select: true,
        syncNavigation: true,
      });
      const op = result.data.operations[0] as Extract<
        (typeof result.data.operations)[0],
        { type: 'create_page_from_reference' }
      >;
      expect(op.pageId).toMatch(/^我的首页|home-page/);
      // Must not collide with existing ids
      expect(doc.pages.map((p) => p.id).includes(op.pageId)).toBe(false);
    }
  });

  void it('fuzzily matches a partial pageKind and resolves to the existing page', () => {
    const { doc, profile } = profileWithFixture();
    // Profile has pageKind 'home'; ask for 'hom' — fuzzy should match.
    const instr: SemanticEditorInstruction = {
      type: 'create_page_from_page_kind',
      pageKind: 'hom',
      name: '子首页',
    };
    const result = compileSemanticEditorInstruction(doc, instr, profile);
    assert.strictEqual(result.success, true);
  });

  void it('returns page_kind_not_found when the kind is unknown and no fuzzy match', () => {
    const { doc, profile } = profileWithFixture();
    const instr: SemanticEditorInstruction = {
      type: 'create_page_from_page_kind',
      pageKind: 'totally-unknown',
      name: 'X',
    };
    const result = compileSemanticEditorInstruction(doc, instr, profile);
    assert.strictEqual(result.success, false);
    if (!result.success) {
      assert.strictEqual(result.error.code, 'page_kind_not_found');
    }
  });

  void it('handles slug collisions by suffixing -2, -3', () => {
    const { doc, profile } = profileWithFixture();
    // Pre-seed the doc with a page that owns the slugged name.
    doc.pages.push({
      id: 'home-page',
      name: 'home page',
      layout: { id: 'home-page-screen', alias: 'core.screen', layout: { mode: 'flow' } },
    });
    const instr: SemanticEditorInstruction = {
      type: 'create_page_from_page_kind',
      pageKind: 'home',
      name: 'home page',
    };
    const result = compileSemanticEditorInstruction(doc, instr, profile);
    assert.strictEqual(result.success, true);
    if (result.success) {
      const op = result.data.operations[0] as Extract<
        (typeof result.data.operations)[0],
        { type: 'create_page_from_reference' }
      >;
      assert.strictEqual(op.pageId, 'home-page-2');
    }
  });
});

void describe('compileSemanticEditorInstruction — fill_pattern', () => {
  void it('compiles a valid fill and emits clone_pattern_items', () => {
    const { doc, profile, patternKey, pageKey } = profileWithFixture();
    const instr: SemanticEditorInstruction = {
      type: 'fill_pattern',
      pageKey,
      patternKey,
      items: [
        { title: 'A', subtitle: 'a' },
        { title: 'B', subtitle: 'b' },
      ],
    };
    const result = compileSemanticEditorInstruction(doc, instr, profile);
    assert.strictEqual(result.success, true);
    if (result.success) {
      expect(result.data.operations[0]).toMatchObject({
        type: 'clone_pattern_items',
        replaceExisting: true,
        select: true,
      });
      const op = result.data.operations[0] as Extract<
        (typeof result.data.operations)[0],
        { type: 'clone_pattern_items' }
      >;
      expect(op.items).toHaveLength(2);
    }
  });

  void it('caps items at pattern.maxItems', () => {
    const { doc, profile, patternKey, pageKey } = profileWithFixture();
    const instr: SemanticEditorInstruction = {
      type: 'fill_pattern',
      pageKey,
      patternKey,
      items: Array.from({ length: 50 }, (_, i) => ({ title: `t${i}` })),
    };
    const result = compileSemanticEditorInstruction(doc, instr, profile);
    assert.strictEqual(result.success, true);
    if (result.success) {
      const op = result.data.operations[0] as Extract<
        (typeof result.data.operations)[0],
        { type: 'clone_pattern_items' }
      >;
      // maxItems on the synthetic pattern is 10
      expect(op.items).toHaveLength(10);
    }
  });

  void it('warns when items count is below minItems (still compiles)', () => {
    const { doc, profile, patternKey, pageKey } = profileWithFixture();
    const instr: SemanticEditorInstruction = {
      type: 'fill_pattern',
      pageKey,
      patternKey,
      items: [{ title: 'only-one' }],
    };
    const result = compileSemanticEditorInstruction(doc, instr, profile);
    assert.strictEqual(result.success, true);
    if (result.success) {
      expect(result.data.warnings.length).toBeGreaterThan(0);
      expect(result.data.warnings[0]).toMatch(/below minItems/);
    }
  });

  void it('returns pattern_not_found for an unknown patternKey', () => {
    const { doc, profile, pageKey } = profileWithFixture();
    const instr: SemanticEditorInstruction = {
      type: 'fill_pattern',
      pageKey,
      patternKey: 'no-such-pattern',
      items: [],
    };
    const result = compileSemanticEditorInstruction(doc, instr, profile);
    assert.strictEqual(result.success, false);
    if (!result.success) {
      assert.strictEqual(result.error.code, 'pattern_not_found');
    }
  });

  void it('warns when a pattern field references a missing slot', () => {
    const { doc, profile, pageKey } = profileWithFixture();
    const ghostPattern: TemplateProfilePattern = {
      patternKey: 'ghost-pattern',
      pageKey,
      sourceRootNodeId: 'ghost-root',
      parentNodeId: 'ghost',
      fields: [{ fieldKey: 'f', slotKey: 'no-such-slot', prop: 'text', required: true }],
    };
    const profileWithGhost: TemplateProfile = { ...profile, patterns: [...profile.patterns, ghostPattern] };
    const instr: SemanticEditorInstruction = {
      type: 'fill_pattern',
      pageKey,
      patternKey: 'ghost-pattern',
      items: [{ f: 'x' }],
    };
    const result = compileSemanticEditorInstruction(doc, instr, profileWithGhost);
    assert.strictEqual(result.success, true);
    if (result.success) {
      const hasWarning = result.data.warnings.some((w) => w.includes('missing slot'));
      assert.ok(hasWarning, 'expected a "missing slot" warning');
    }
  });
});

void describe('compileSemanticEditorInstruction — replace_section', () => {
  void it('compiles a valid replace on a replaceable region', () => {
    const { doc, profile, regionKey, pageKey } = profileWithFixture();
    const instr: SemanticEditorInstruction = {
      type: 'replace_section',
      pageKey,
      regionKey,
      sectionKind: 'card-grid',
      content: { title: '限时特惠' },
    };
    const result = compileSemanticEditorInstruction(doc, instr, profile);
    assert.strictEqual(result.success, true);
    if (result.success) {
      expect(result.data.operations[0]).toMatchObject({
        type: 'update_props',
        props: { text: '限时特惠' },
        select: true,
      });
    }
  });

  void it('rejects a non-replaceable region with compile_failed', () => {
    const { doc, profile, pageKey } = profileWithFixture();
    const instr: SemanticEditorInstruction = {
      type: 'replace_section',
      pageKey,
      regionKey: 'footer',
      sectionKind: 'x',
      content: { title: 'never' },
    };
    const result = compileSemanticEditorInstruction(doc, instr, profile);
    assert.strictEqual(result.success, false);
    if (!result.success) {
      assert.strictEqual(result.error.code, 'compile_failed');
      if (result.error.code === 'compile_failed') {
        expect(result.error.reason).toMatch(/not replaceable/);
      }
    }
  });

  void it('returns region_not_found when the region key is unknown', () => {
    const { doc, profile, pageKey } = profileWithFixture();
    const instr: SemanticEditorInstruction = {
      type: 'replace_section',
      pageKey,
      regionKey: 'no-such-region',
      sectionKind: 'x',
      content: { title: 'x' },
    };
    const result = compileSemanticEditorInstruction(doc, instr, profile);
    assert.strictEqual(result.success, false);
    if (!result.success) {
      assert.strictEqual(result.error.code, 'region_not_found');
    }
  });

  void it('returns compile_failed when region has no editable text slot', () => {
    const { doc, profile, pageKey } = profileWithFixture();
    // Strip all slots for the hero region so the title has nowhere to land.
    const stripped: TemplateProfile = {
      ...profile,
      slots: profile.slots.filter((s) => s.regionKey !== 'hero'),
    };
    const instr: SemanticEditorInstruction = {
      type: 'replace_section',
      pageKey,
      regionKey: 'hero',
      sectionKind: 'x',
      content: { title: 'orphan' },
    };
    const result = compileSemanticEditorInstruction(doc, instr, stripped);
    assert.strictEqual(result.success, false);
    if (!result.success) {
      assert.strictEqual(result.error.code, 'compile_failed');
      if (result.error.code === 'compile_failed') {
        expect(result.error.reason).toMatch(/No editable slots/);
      }
    }
  });
});

void describe('compileSemanticEditorInstruction — submit_page_spec', () => {
  void it('rejects create_page without pageKind as invalid_spec', () => {
    const { doc, profile } = profileWithFixture();
    const instr: SemanticEditorInstruction = {
      type: 'submit_page_spec',
      spec: { intent: 'create_page', title: 'no-kind' },
    };
    const result = compileSemanticEditorInstruction(doc, instr, profile);
    assert.strictEqual(result.success, false);
    if (!result.success) {
      assert.strictEqual(result.error.code, 'invalid_spec');
    }
  });

  void it('routes a create_page spec to a single create_page_from_reference op (sections ignored on create)', () => {
    const { doc, profile, patternKey, regionKey } = profileWithFixture();
    const instr: SemanticEditorInstruction = {
      type: 'submit_page_spec',
      spec: {
        intent: 'create_page',
        pageKey: undefined,
        pageKind: 'home',
        title: 'New Home',
        sections: [
          { sectionKind: 'list', patternKey, items: [{ title: 'A' }, { title: 'B' }] },
          { sectionKind: 'banner', regionKey, content: { title: '促销' } },
        ],
      },
    };
    const result = compileSemanticEditorInstruction(doc, instr, profile);
    assert.strictEqual(result.success, true);
    if (result.success) {
      // create_page branch only emits the create op; sections are processed for update_page.
      expect(result.data.operations).toHaveLength(1);
      expect(result.data.operations[0]).toMatchObject({ type: 'create_page_from_reference' });
    }
  });

  void it('routes an update_page spec with sections to fill_pattern + replace_section ops', () => {
    const { doc, profile, pageKey, patternKey, regionKey } = profileWithFixture();
    const instr: SemanticEditorInstruction = {
      type: 'submit_page_spec',
      spec: {
        intent: 'update_page',
        pageKey,
        sections: [
          { sectionKind: 'list', patternKey, items: [{ title: 'A' }, { title: 'B' }] },
          { sectionKind: 'banner', regionKey, content: { title: '促销' } },
        ],
      },
    };
    const result = compileSemanticEditorInstruction(doc, instr, profile);
    assert.strictEqual(result.success, true);
    if (result.success) {
      // update_page routes to clone_pattern_items + update_props
      expect(result.data.operations).toHaveLength(2);
      const types = result.data.operations.map((o) => o.type);
      expect(types).toContain('clone_pattern_items');
      expect(types).toContain('update_props');
    }
  });

  void it('propagates fill_pattern failure inside submit_page_spec', () => {
    const { doc, profile, pageKey } = profileWithFixture();
    // update_page routes through pageSpecToEditSpecs, which surfaces
    // pattern_not_found from the resolver. create_page intentionally
    // ignores sections (it only emits a create op), so we use update_page here.
    const instr: SemanticEditorInstruction = {
      type: 'submit_page_spec',
      spec: {
        intent: 'update_page',
        pageKey,
        sections: [{ sectionKind: 'list', patternKey: 'no-such-pattern', items: [{ x: 1 }] }],
      },
    };
    const result = compileSemanticEditorInstruction(doc, instr, profile);
    assert.strictEqual(result.success, false);
    if (!result.success) {
      assert.strictEqual(result.error.code, 'pattern_not_found');
    }
  });
});

void describe('resolver+compiler integration sanity (PR-D coverage)', () => {
  void it('resolvePattern / resolveRegion / resolveSlot all return success for fixture', () => {
    const { profile, patternKey, regionKey, slotKey } = profileWithFixture();
    expect(resolvePattern(profile, patternKey).success).toBe(true);
    expect(resolveRegion(profile, regionKey).success).toBe(true);
    expect(resolveSlot(profile, slotKey).success).toBe(true);
  });

  void it('non-replaceable fixture region surfaces replaceable=false to the compiler', () => {
    const { profile } = profileWithFixture();
    const region = resolveRegion(profile, 'footer');
    expect(region.success).toBe(true);
    if (region.success && region.data) {
      expect(region.data.replaceable).toBe(false);
    }
  });
});
