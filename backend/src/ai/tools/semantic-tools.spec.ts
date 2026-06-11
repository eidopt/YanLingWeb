import type { ThemeLayoutDocument } from '@shared/agent/contracts/agent';
import { buildTemplateProfile, getSeedDocument } from '@shared/agent/runtime';
import { executeSemanticTool } from '@shared/agent/tools/semanticToolExecutor';

function makeDoc(): ThemeLayoutDocument {
  return structuredClone(getSeedDocument('commerceMarket'));
}

describe('E2E: AI uses semantic tools', () => {
  it('executing editor_update_slot mutates document and returns success', async () => {
    const doc = makeDoc();
    const profile = buildTemplateProfile(doc);
    const slot = profile.slots.find((s) => s.nodeId === 'home-title');
    if (!slot) {
      throw new Error('Seed document should expose a home-title slot');
    }

    // Simulate AI sending a tool call
    const result = await executeSemanticTool(
      'editor_update_slot',
      { slotKey: slot.slotKey, props: { text: 'AI was here' } },
      doc,
      { sessionId: 'e2e-1' },
    );

    expect(result.success).toBe(true);
    const node = doc.pages[0].layout.children?.find((c) => c.id === 'home-title');
    expect(node?.props?.text).toBe('AI was here');
  });

  it('AI can self-correct when given a slot_not_found error', async () => {
    const doc = makeDoc();
    const profile = buildTemplateProfile(doc);

    // First call: bad slotKey
    const first = await executeSemanticTool(
      'editor_update_slot',
      { slotKey: 'home.nonexistent', props: { text: 'X' } },
      doc,
      { sessionId: 'e2e-2a' },
    );

    expect(first.success).toBe(false);
    if (first.error?.code !== 'slot_not_found') {
      throw new Error('Expected slot_not_found error with availableSlots');
    }
    const firstError = first.error;

    // AI reads availableSlots and picks a real one with 'text' editable
    const realSlot = profile.slots.find(
      (s) => firstError.availableSlots.includes(s.slotKey) && s.editableProps.includes('text'),
    );
    if (!realSlot) {
      throw new Error('Profile should expose at least one text-editable slot');
    }

    const second = await executeSemanticTool(
      'editor_update_slot',
      { slotKey: realSlot.slotKey, props: { text: 'Self-corrected' } },
      doc,
      { sessionId: 'e2e-2b' },
    );

    expect(second.success).toBe(true);
  });

  it('create_page_from_page_kind end-to-end adds a new page to document', async () => {
    const doc = makeDoc();
    const profile = buildTemplateProfile(doc);
    const pageKind = profile.pages[0].pageKind;
    const pagesBefore = doc.pages.length;

    const result = await executeSemanticTool(
      'editor_create_page_from_page_kind',
      { pageKind, name: 'Created by E2E' },
      doc,
      { sessionId: 'e2e-3' },
    );

    expect(result.success).toBe(true);
    expect(doc.pages.length).toBe(pagesBefore + 1);
    const newPage = doc.pages[doc.pages.length - 1];
    expect(newPage.name).toBe('Created by E2E');
  });
});
