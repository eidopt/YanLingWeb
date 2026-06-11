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

void describe('executeSemanticTool - editor_update_slot', () => {
  void it('updates text via slotKey', async () => {
    const doc = seedDoc();
    const slotKey = findSlotKey(doc, 'home-title');
    const result = await executeSemanticTool('editor_update_slot', { slotKey, props: { text: 'New title' } }, doc, {
      sessionId: 't1',
    });

    assert.equal(result.success, true);
    const data = result.data;
    assert.ok(data, 'expected result.data on success');
    assert.equal(data.applied, true);
    assert.ok(data.snapshot);
    const node = doc.pages[0].layout.children?.find((c) => c.id === 'home-title');
    assert.equal(node?.props?.text, 'New title');
  });

  void it('returns invalid_props error with allowedProps when prop not in editableProps', async () => {
    const doc = seedDoc();
    const slotKey = findSlotKey(doc, 'home-title');
    const result = await executeSemanticTool(
      'editor_update_slot',
      { slotKey, props: { href: 'https://invalid.test' } },
      doc,
      { sessionId: 't2' },
    );

    assert.equal(result.success, false);
    const error = result.error;
    assert.ok(error, 'expected result.error on failure');
    assert.equal(error.code, 'invalid_props');
    assert.ok(error.invalidProps.includes('href'));
    assert.ok(error.allowedProps.length > 0);
  });

  void it('returns slot_not_found error with availableSlots when slotKey missing', async () => {
    const doc = seedDoc();
    const result = await executeSemanticTool(
      'editor_update_slot',
      { slotKey: 'home.does.not.exist', props: { text: 'x' } },
      doc,
      { sessionId: 't3' },
    );

    assert.equal(result.success, false);
    const error = result.error;
    assert.ok(error, 'expected result.error on failure');
    assert.equal(error.code, 'slot_not_found');
    assert.ok(error.availableSlots.length > 0);
  });
});

void describe('executeSemanticTool - editor_fill_pattern', () => {
  void it('fills 3 product cards via patternKey', async () => {
    const doc = seedDoc();
    const profile = buildTemplateProfile(doc);
    const pattern = profile.patterns[0];
    assert.ok(pattern, 'expected at least one pattern');

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
    const data = result.data;
    assert.ok(data, 'expected result.data on success');
    assert.equal(data.appliedOperations[0].type, 'clone_pattern_items');
  });

  void it('truncates to maxItems (or 50) and emits warning when items exceed limit', async () => {
    const doc = seedDoc();
    const profile = buildTemplateProfile(doc);
    const pattern = profile.patterns[0];
    assert.ok(pattern, 'expected at least one pattern');
    const expectedMax = pattern.maxItems ?? 50;

    const items = Array.from({ length: 100 }, (_, i) => ({ title: `Item ${i}` }));
    const result = await executeSemanticTool('editor_fill_pattern', { patternKey: pattern.patternKey, items }, doc, {
      sessionId: 't5',
    });

    assert.equal(result.success, true);
    const data = result.data;
    assert.ok(data, 'expected result.data on success');
    const firstOp = data.appliedOperations[0];
    if (firstOp.type === 'clone_pattern_items') {
      assert.equal(firstOp.items.length, expectedMax);
    }
  });
});

void describe('executeSemanticTool - editor_create_page_from_page_kind', () => {
  void it('creates a new page from a known pageKind', async () => {
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

  void it('returns page_kind_not_found with availablePageKinds when kind unknown', async () => {
    const doc = seedDoc();
    const result = await executeSemanticTool(
      'editor_create_page_from_page_kind',
      { pageKind: 'nonexistent_kind', name: 'X' },
      doc,
      { sessionId: 't7' },
    );

    assert.equal(result.success, false);
    const error = result.error;
    assert.ok(error, 'expected result.error on failure');
    assert.equal(error.code, 'page_kind_not_found');
    assert.ok(error.availablePageKinds.length > 0);
  });
});

void describe('executeSemanticTool - dryRun', () => {
  void it('returns preview without modifying document when dryRun=true', async () => {
    const doc = seedDoc();
    const before = JSON.parse(JSON.stringify(doc)) as ThemeLayoutDocument;
    const slotKey = findSlotKey(doc, 'home-title');

    const result = await executeSemanticTool('editor_update_slot', { slotKey, props: { text: 'Preview only' } }, doc, {
      sessionId: 't8',
      dryRun: true,
    });

    assert.equal(result.success, true);
    const data = result.data;
    assert.ok(data, 'expected result.data on success');
    assert.equal(data.applied, false);
    assert.ok(data.preview);
    assert.equal(data.preview[0].type, 'update_props');
    assert.deepEqual(doc, before);
  });
});

void describe('executeSemanticTool - editor_replace_section', () => {
  void it('replaces a replaceable section successfully', async () => {
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

  void it('returns failure when regionKey not found or not replaceable', async () => {
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
    const error = result.error;
    assert.ok(error, 'expected result.error on failure');
    const codes = ['region_not_found', 'compile_failed'];
    assert.ok(codes.includes(error.code));
  });
});

void describe('executeSemanticTool - editor_submit_page_spec', () => {
  void it('creates a new page from a complete spec', async () => {
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
