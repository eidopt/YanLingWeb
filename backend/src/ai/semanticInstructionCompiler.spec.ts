import type { ThemeLayoutDocument } from '@shared/agent/contracts/agent';
import {
  buildTemplateProfile,
  compileSemanticEditorInstruction,
  type SemanticEditorInstruction,
  type TemplateProfile,
} from '@shared/agent/runtime';

function createSemanticDocument(): ThemeLayoutDocument {
  return {
    version: 1,
    themeId: 'semantic-fixture',
    themeName: 'Semantic Fixture',
    pageName: 'Home',
    description: 'Semantic compiler fixture',
    components: [],
    defaultPageId: 'home',
    pages: [
      {
        id: 'home',
        name: 'Home',
        layout: {
          id: 'home-screen',
          alias: 'core.screen',
          layout: { mode: 'flow', width: '100%' },
          props: { title: 'Home' },
          children: [
            {
              id: 'product-panel',
              alias: 'core.panel',
              layout: { mode: 'flow', width: '100%' },
              props: { tone: 'default' },
              children: [
                {
                  id: 'product-row',
                  alias: 'core.row',
                  layout: { mode: 'flow', width: '100%' },
                  props: { gap: 8 },
                  children: [
                    {
                      id: 'product-title',
                      alias: 'core.text',
                      layout: { mode: 'flow' },
                      props: { text: 'Original title', variant: 'heading' },
                    },
                    {
                      id: 'product-cta',
                      alias: 'core.button',
                      layout: { mode: 'flow' },
                      props: { label: 'Buy now', variant: 'primary' },
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    ],
    layout: {
      id: 'home-screen',
      alias: 'core.screen',
      layout: { mode: 'flow', width: '100%' },
      props: { title: 'Home' },
      children: [],
    },
  };
}

function compile(
  document: ThemeLayoutDocument,
  profile: TemplateProfile,
  instruction: SemanticEditorInstruction,
) {
  const result = compileSemanticEditorInstruction(document, instruction, profile);
  if (!result.success || !result.data) {
    throw new Error(`Expected semantic compile success, got ${JSON.stringify(result.error)}`);
  }
  return result.data;
}

describe('semantic instruction compiler', () => {
  it('compiles slot updates to concrete node prop updates', () => {
    const document = createSemanticDocument();
    const profile = buildTemplateProfile(document);
    const slot = profile.slots.find((item) => item.nodeId === 'product-title');

    expect(slot).toBeDefined();
    const compiled = compile(document, profile, {
      type: 'update_slot',
      slotKey: slot?.slotKey ?? '',
      props: { text: 'Updated title' },
    });

    expect(compiled.operations).toEqual([
      {
        type: 'update_props',
        nodeId: 'product-title',
        props: { text: 'Updated title' },
        select: true,
      },
    ]);
  });

  it('rejects slot updates that use props outside the profile allowlist', () => {
    const document = createSemanticDocument();
    const profile = buildTemplateProfile(document);
    const slot = profile.slots.find((item) => item.nodeId === 'product-title');

    const result = compileSemanticEditorInstruction(
      document,
      {
        type: 'update_slot',
        slotKey: slot?.slotKey ?? '',
        props: { href: 'https://example.test' },
      },
      profile,
    );

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error('Expected invalid_props failure');
    }
    expect(result.error?.code).toBe('invalid_props');
  });

  it('compiles pattern fills to clone operations with resolved field node ids', () => {
    const document = createSemanticDocument();
    const profile = buildTemplateProfile(document);
    const pattern = profile.patterns.find((item) => item.sourceRootNodeId === 'product-row');

    expect(pattern).toBeDefined();
    const compiled = compile(document, profile, {
      type: 'fill_pattern',
      patternKey: pattern?.patternKey ?? '',
      items: [{ text: 'First product', label: 'View' }],
    });

    const operation = compiled.operations[0];
    expect(operation).toMatchObject({
      type: 'clone_pattern_items',
      pageId: 'home',
      sourceRootNodeId: 'product-row',
      parentId: 'product-panel',
      replaceExisting: true,
      items: [{ text: 'First product', label: 'View' }],
    });
    if (operation.type !== 'clone_pattern_items') {
      throw new Error('Expected clone_pattern_items operation');
    }
    expect(operation.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ referenceNodeId: 'product-title', prop: 'text' }),
        expect.objectContaining({ referenceNodeId: 'product-cta', prop: 'label' }),
      ]),
    );
  });

  it('compiles PageSpec section replacements to concrete nested slot updates', () => {
    const document = createSemanticDocument();
    const profile = buildTemplateProfile(document);
    const region = profile.regions.find((item) => item.nodeId === 'product-panel');

    expect(region).toBeDefined();
    expect(profile.slots.find((item) => item.nodeId === 'product-title')?.regionKey).toBe(
      region?.regionKey,
    );

    const compiled = compile(document, profile, {
      type: 'submit_page_spec',
      spec: {
        intent: 'update_page',
        pageKey: 'home',
        title: 'Home refresh',
        sections: [
          {
            sectionKind: 'hero',
            regionKey: region?.regionKey ?? '',
            title: 'PageSpec section title',
          },
        ],
      },
    });

    expect(compiled.operations).toEqual([
      {
        type: 'update_props',
        pageId: 'home',
        nodeId: 'product-title',
        props: { text: 'PageSpec section title' },
        select: true,
      },
    ]);
  });

  it('compiles PageSpec pattern sections to clone operations', () => {
    const document = createSemanticDocument();
    const profile = buildTemplateProfile(document);
    const pattern = profile.patterns.find((item) => item.sourceRootNodeId === 'product-row');

    expect(pattern).toBeDefined();
    const compiled = compile(document, profile, {
      type: 'submit_page_spec',
      spec: {
        intent: 'update_page',
        pageKey: 'home',
        sections: [
          {
            sectionKind: 'product-list',
            patternKey: pattern?.patternKey ?? '',
            items: [
              { text: 'PageSpec product one', label: 'View one' },
              { text: 'PageSpec product two', label: 'View two' },
            ],
          },
        ],
      },
    });

    const operation = compiled.operations[0];
    expect(operation).toMatchObject({
      type: 'clone_pattern_items',
      pageId: 'home',
      sourceRootNodeId: 'product-row',
      parentId: 'product-panel',
      replaceExisting: true,
      items: [
        { text: 'PageSpec product one', label: 'View one' },
        { text: 'PageSpec product two', label: 'View two' },
      ],
    });
    if (operation.type !== 'clone_pattern_items') {
      throw new Error('Expected clone_pattern_items operation');
    }
    expect(operation.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ referenceNodeId: 'product-title', prop: 'text' }),
        expect.objectContaining({ referenceNodeId: 'product-cta', prop: 'label' }),
      ]),
    );
  });

  it('compiles page kind creation without requiring the agent to provide node ids', () => {
    const document = createSemanticDocument();
    const profile = buildTemplateProfile(document);
    const compiled = compile(document, profile, {
      type: 'create_page_from_page_kind',
      pageKind: 'home',
      name: 'Landing',
    });

    expect(compiled.operations).toEqual([
      expect.objectContaining({
        type: 'create_page_from_reference',
        pageId: 'landing',
        name: 'Landing',
        referencePageId: 'home',
        rootNodeId: 'landing-screen',
        activate: true,
        syncNavigation: true,
      }),
    ]);
  });
});
