/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable @typescript-eslint/no-unnecessary-condition -- test assertions use defensive optional chains */
import type { ThemeLayoutDocument } from '../types';
import { executeSemanticTool } from './semanticToolExecutor';
import { buildTemplateProfile, getSeedDocument } from '@shared/agent/runtime';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

function seedDoc(): ThemeLayoutDocument {
  return getSeedDocument('commerceMarket');
}

function findSlotKey(doc: ThemeLayoutDocument, nodeId: string): string {
  const profile = buildTemplateProfile(doc);
  const slot = profile.slots.find((s) => s.nodeId === nodeId);
  if (!slot) {
    throw new Error(`No slot for ${nodeId}`);
  }
  return slot.slotKey;
}

describe('executeSemanticTool - editor_update_slot', () => {
  it('updates text via slotKey', async () => {
    const doc = seedDoc();
    const slotKey = findSlotKey(doc, 'home-title');
    const result = await executeSemanticTool('editor_update_slot', { slotKey, props: { text: 'New title' } }, doc, {
      sessionId: 't1',
    });

    assert.equal(result.success, true);
    assert.equal(result.data?.applied, true);
    assert.ok(result.data?.snapshot);
    const node = doc.pages[0].layout.children?.find((c) => c.id === 'home-title');
    assert.equal(node?.props?.text, 'New title');
  });

  it('returns invalid_props error with allowedProps when prop not in editableProps', async () => {
    const doc = seedDoc();
    const slotKey = findSlotKey(doc, 'home-title');
    const result = await executeSemanticTool(
      'editor_update_slot',
      { slotKey, props: { href: 'https://invalid.test' } },
      doc,
      { sessionId: 't2' },
    );

    assert.equal(result.success, false);
    assert.equal(result.error?.code, 'invalid_props');
    if (result.error?.code === 'invalid_props') {
      assert.ok(result.error.invalidProps.includes('href'));
      assert.ok(result.error.allowedProps.length > 0);
    }
  });

  it('returns slot_not_found error with availableSlots when slotKey missing', async () => {
    const doc = seedDoc();
    const result = await executeSemanticTool(
      'editor_update_slot',
      { slotKey: 'home.does.not.exist', props: { text: 'x' } },
      doc,
      { sessionId: 't3' },
    );

    assert.equal(result.success, false);
    assert.equal(result.error?.code, 'slot_not_found');
    if (result.error?.code === 'slot_not_found') {
      assert.ok(result.error.availableSlots.length > 0);
    }
  });
});

describe('executeSemanticTool - editor_fill_pattern', () => {
  it('fills 3 product cards via patternKey', async () => {
    const doc = seedDoc();
    const profile = buildTemplateProfile(doc);
    const pattern = profile.patterns[0];
    if (!pattern) {
      return; // skip if no pattern
    }

    const items = [
      { title: 'Apple', price: '¥10' },
      { title: 'Banana', price: '¥5' },
      { title: 'Cherry', price: '¥20' },
    ];
    const result = await executeSemanticTool(
      'editor_fill_pattern',
      { patternKey: pattern.patternKey, items, replaceExisting: true },
      doc,
      { sessionId: 't4' },
    );

    assert.equal(result.success, true);
    assert.equal(result.data?.appliedOperations[0].type, 'clone_pattern_items');
  });

  it('truncates to maxItems (or 50) and emits warning when items exceed limit', async () => {
    const doc = seedDoc();
    const profile = buildTemplateProfile(doc);
    const pattern = profile.patterns[0];
    if (!pattern) {
      return; // skip if no pattern
    }
    const expectedMax = pattern.maxItems ?? 50;

    const items = Array.from({ length: 100 }, (_, i) => ({ title: `Item ${i}` }));
    const result = await executeSemanticTool('editor_fill_pattern', { patternKey: pattern.patternKey, items }, doc, {
      sessionId: 't5',
    });

    assert.equal(result.success, true);
    const firstOp = result.data?.appliedOperations[0];
    if (firstOp?.type === 'clone_pattern_items') {
      assert.equal(firstOp.items.length, expectedMax);
    }
  });
});

describe('executeSemanticTool - editor_create_page_from_page_kind', () => {
  it('creates a new page from a known pageKind', async () => {
    const doc = seedDoc();
    const profile = buildTemplateProfile(doc);
    const availableKinds = profile.pages.map((p) => p.pageKind);
    const kindToCreate = availableKinds[0];
    if (!kindToCreate) {
      return; // skip if no pages
    }
    const pagesBefore = doc.pages.length;

    const result = await executeSemanticTool(
      'editor_create_page_from_page_kind',
      { pageKind: kindToCreate, name: 'My new page' },
      doc,
      { sessionId: 't6' },
    );

    assert.equal(result.success, true);
    assert.equal(doc.pages.length, pagesBefore + 1);
    const newPage = doc.pages[doc.pages.length - 1];
    assert.equal(newPage.name, 'My new page');
  });

  it('returns page_kind_not_found with availablePageKinds when kind unknown', async () => {
    const doc = seedDoc();
    const result = await executeSemanticTool(
      'editor_create_page_from_page_kind',
      { pageKind: 'nonexistent_kind', name: 'X' },
      doc,
      { sessionId: 't7' },
    );

    assert.equal(result.success, false);
    assert.equal(result.error?.code, 'page_kind_not_found');
    if (result.error?.code === 'page_kind_not_found') {
      assert.ok(result.error.availablePageKinds.length > 0);
    }
  });
});

describe('executeSemanticTool - dryRun', () => {
  it('returns preview without modifying document when dryRun=true', async () => {
    const doc = seedDoc();
    const before = JSON.parse(JSON.stringify(doc)) as ThemeLayoutDocument;
    const slotKey = findSlotKey(doc, 'home-title');

    const result = await executeSemanticTool('editor_update_slot', { slotKey, props: { text: 'Preview only' } }, doc, {
      sessionId: 't8',
      dryRun: true,
    });

    assert.equal(result.success, true);
    assert.equal(result.data?.applied, false);
    assert.ok(result.data?.preview);
    assert.equal(result.data?.preview?.[0].type, 'update_props');
    assert.deepEqual(doc, before);
  });
});

describe('executeSemanticTool - editor_replace_section', () => {
  it('replaces a replaceable section successfully', async () => {
    const doc = seedDoc();
    const profile = buildTemplateProfile(doc);
    const replaceable = profile.regions.find((r) => r.replaceable);
    if (!replaceable) {
      return; // skip if no replaceable region
    }

    const result = await executeSemanticTool(
      'editor_replace_section',
      {
        regionKey: replaceable.regionKey,
        sectionKind: 'banner',
        content: { title: 'New banner title' },
      },
      doc,
      { sessionId: 'rs-1' },
    );

    assert.equal(result.success, true);
  });

  it('returns failure when regionKey not found or not replaceable', async () => {
    const doc = seedDoc();
    const result = await executeSemanticTool(
      'editor_replace_section',
      {
        regionKey: 'home.nonexistent.region',
        sectionKind: 'banner',
        content: { title: 'X' },
      },
      doc,
      { sessionId: 'rs-2' },
    );

    assert.equal(result.success, false);
    if (result.success) {
      throw new Error('Expected failure');
    }
    const codes = ['region_not_found', 'compile_failed'];
    assert.ok(codes.includes(result.error?.code ?? ''));
  });
});

describe('executeSemanticTool - editor_submit_page_spec', () => {
  it('creates a new page from a complete spec', async () => {
    const doc = seedDoc();
    const profile = buildTemplateProfile(doc);
    const pageKind = profile.pages[0]?.pageKind;
    if (!pageKind) {
      return; // skip if no pages
    }
    const pagesBefore = doc.pages.length;

    const result = await executeSemanticTool(
      'editor_submit_page_spec',
      {
        spec: {
          intent: 'create_page',
          pageKind,
          title: 'Page from spec',
          contentIntent: 'a complete page',
        },
      },
      doc,
      { sessionId: 'spec-1' },
    );

    assert.equal(result.success, true);
    assert.equal(doc.pages.length, pagesBefore + 1);
  });
});
