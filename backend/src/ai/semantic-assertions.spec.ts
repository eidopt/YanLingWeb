import type { ThemeLayoutDocument } from '@shared/agent/contracts/agent';
import { evaluateSemanticAssertions } from '@shared/agent/contracts/validation';

function createDocument(text = 'Original hero', extraPage = false): ThemeLayoutDocument {
  const home = {
    id: 'home-screen',
    alias: 'core.screen',
    layout: { mode: 'flow' as const, width: '100%' },
    props: { title: 'Home' },
    children: [
      {
        id: 'hero-title',
        alias: 'core.text',
        layout: { mode: 'flow' as const },
        props: { text, variant: 'heading' },
      },
      {
        id: 'home-tabs',
        alias: 'core.tabs',
        layout: { mode: 'flow' as const },
        props: { tabs: ['Home', 'Orders'], activeTab: 'Home' },
        interactions: {
          onTabClick: {
            Home: { type: 'navigate' as const, targetPageId: 'home' },
            Orders: { type: 'navigate' as const, targetPageId: 'orders' },
          },
        },
      },
    ],
  };

  const pages: ThemeLayoutDocument['pages'] = [{ id: 'home', name: 'Home', layout: home }];
  if (extraPage) {
    pages.push({
      id: 'orders',
      name: 'Orders',
      layout: {
        id: 'orders-screen',
        alias: 'core.screen',
        layout: { mode: 'flow' as const, width: '100%' },
        props: { title: 'Orders' },
        children: [
          {
            id: 'orders-title',
            alias: 'core.text',
            layout: { mode: 'flow' as const },
            props: { text: 'Orders section', variant: 'heading' },
          },
        ],
      },
    });
  }

  return {
    version: 1,
    themeId: 'semantic-assertion-fixture',
    themeName: 'Semantic Assertion Fixture',
    pageName: 'Home',
    description: 'Fixture for semantic assertion tests',
    components: [],
    defaultPageId: 'home',
    pages,
    layout: home,
  };
}

describe('semantic assertion evaluation', () => {
  it('scores generated app page and required-section assertions', () => {
    const result = evaluateSemanticAssertions(createDocument('Hero section', true), undefined, {
      mustHave: [
        { type: 'generated_app_has_min_pages', minPages: 2 },
        {
          type: 'generated_app_has_required_sections',
          sections: ['Hero section', 'Orders section'],
        },
        { type: 'all_pages_have_screen_root' },
      ],
    });

    expect(result.passed).toBe(true);
    expect(result.taskScore).toBe(1);
    expect(result.failures).toEqual([]);
  });

  it('fails mustNotChange when an editor edit changes a preserved node prop', () => {
    const initialDocument = createDocument('Original hero');
    const finalDocument = createDocument('Changed hero');

    const result = evaluateSemanticAssertions(finalDocument, initialDocument, {
      mustHave: [{ type: 'document_contains_text', value: 'Changed hero' }],
      mustNotChange: [
        {
          type: 'node_prop_equals',
          nodeId: 'hero-title',
          prop: 'text',
          value: 'Original hero',
        },
      ],
    });

    expect(result.passed).toBe(false);
    expect(result.taskScore).toBe(0.5);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.message).toContain('changed:');
  });

  it('fails mustNotChange when no initial document is available', () => {
    const result = evaluateSemanticAssertions(createDocument(), undefined, {
      mustNotChange: [{ type: 'node_exists', nodeId: 'hero-title' }],
    });

    expect(result.passed).toBe(false);
    expect(result.failures[0]?.message).toBe('mustNotChange requires an initial document');
  });
});
