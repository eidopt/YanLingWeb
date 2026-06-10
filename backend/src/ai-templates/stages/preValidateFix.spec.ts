/**
 * preValidateFix tests.
 *
 * Run: pnpm --dir backend test -- --runTestsByPath src/ai-templates/stages/preValidateFix.spec.ts
 */

import {
  autoBizComponents,
  dedupeNodeIds,
  fixImageUrls,
  preValidateAndFix,
  removeUnknownProps,
} from './preValidateFix';

describe('dedupeNodeIds', () => {
  it('returns 0 when no duplicates', () => {
    const doc = {
      pages: [
        {
          id: 'p1',
          layout: {
            id: 'root',
            children: [{ id: 'hero', children: [{ id: 'hero-text' }] }, { id: 'footer' }],
          },
        },
      ],
    };
    const count = dedupeNodeIds(doc);
    expect(count).toBe(0);
  });

  it('deduplicates cross-page duplicate IDs', () => {
    const doc = {
      pages: [
        {
          id: 'p1',
          layout: { id: 'root', children: [{ id: 'hero' }] },
        },
        {
          id: 'p2',
          layout: { id: 'root', children: [{ id: 'hero' }] },
        },
      ],
    };
    const count = dedupeNodeIds(doc);
    expect(count).toBe(2); // 'root' and 'hero' duplicated
    const p2 = doc.pages[1] as { layout: { id: string; children: { id: string }[] } };
    expect(p2.layout.id).toBe('root-2');
    expect(p2.layout.children[0].id).toBe('hero-2');
  });

  it('handles multiple duplicates with incrementing suffix', () => {
    const doc = {
      pages: [
        { id: 'p1', layout: { id: 'a' } },
        { id: 'p2', layout: { id: 'a' } },
        { id: 'p3', layout: { id: 'a' } },
      ],
    };
    const count = dedupeNodeIds(doc);
    expect(count).toBe(2);
    const p2 = doc.pages[1] as { layout: { id: string } };
    const p3 = doc.pages[2] as { layout: { id: string } };
    expect(p2.layout.id).toBe('a-2');
    expect(p3.layout.id).toBe('a-3');
  });
});

describe('autoBizComponents', () => {
  it('adds missing biz-* descriptors from componentTemplates', () => {
    const doc = {
      components: [{ alias: 'core.text', props: [] }],
      componentTemplates: {
        'biz-promo-card': { displayName: '促销卡片' },
      },
    };
    const count = autoBizComponents(doc);
    expect(count).toBe(1);
    const components = doc.components as { alias: string }[];
    expect(components).toHaveLength(2);
    expect(components[1].alias).toBe('biz-promo-card');
  });

  it('does not duplicate existing descriptors', () => {
    const doc = {
      components: [
        { alias: 'core.text', props: [] },
        { alias: 'biz-promo-card', props: [] },
      ],
      componentTemplates: {
        'biz-promo-card': { displayName: '促销卡片' },
      },
    };
    const count = autoBizComponents(doc);
    expect(count).toBe(0);
  });

  it('handles missing componentTemplates gracefully', () => {
    const doc = { components: [{ alias: 'core.text', props: [] }] };
    const count = autoBizComponents(doc);
    expect(count).toBe(0);
  });
});

describe('removeUnknownProps', () => {
  it('removes props not in component catalog', () => {
    const doc = {
      components: [{ alias: 'core.text', props: [{ name: 'text' }, { name: 'variant' }] }],
      pages: [
        {
          id: 'p1',
          layout: {
            id: 'root',
            alias: 'core.text',
            props: { text: 'hello', variant: 'body', unknownProp: 'bad' },
          },
        },
      ],
    };
    const count = removeUnknownProps(doc);
    expect(count).toBe(1);
    const layout = (doc.pages[0] as { layout: { props: Record<string, unknown> } }).layout;
    expect(layout.props.unknownProp).toBeUndefined();
    expect(layout.props.text).toBe('hello');
  });

  it('returns 0 when all props are known', () => {
    const doc = {
      components: [{ alias: 'core.text', props: [{ name: 'text' }] }],
      pages: [
        {
          id: 'p1',
          layout: {
            id: 'root',
            alias: 'core.text',
            props: { text: 'hello' },
          },
        },
      ],
    };
    const count = removeUnknownProps(doc);
    expect(count).toBe(0);
  });
});

describe('fixImageUrls', () => {
  it('replaces data: URIs with placeholder', () => {
    const doc = {
      pages: [
        {
          id: 'p1',
          layout: {
            id: 'root',
            children: [
              {
                id: 'img',
                alias: 'core.image',
                props: { src: 'data:image/png;base64,abc123' },
              },
            ],
          },
        },
      ],
    };
    const count = fixImageUrls(doc);
    expect(count).toBe(1);
    const layout = doc.pages[0].layout as { children: { props: { src: string } }[] };
    expect(layout.children[0].props.src).toContain('placehold.co');
  });

  it('replaces javascript: URIs with placeholder', () => {
    const doc = {
      pages: [
        {
          id: 'p1',
          layout: {
            id: 'root',
            alias: 'core.image',
            props: { src: 'javascript:alert(1)' },
          },
        },
      ],
    };
    const count = fixImageUrls(doc);
    expect(count).toBe(1);
  });

  it('preserves valid http URLs', () => {
    const doc = {
      pages: [
        {
          id: 'p1',
          layout: {
            id: 'root',
            alias: 'core.image',
            props: { src: 'https://example.com/image.png' },
          },
        },
      ],
    };
    const count = fixImageUrls(doc);
    expect(count).toBe(0);
  });

  it('preserves relative URLs starting with /', () => {
    const doc = {
      pages: [
        {
          id: 'p1',
          layout: {
            id: 'root',
            alias: 'core.image',
            props: { src: '/images/photo.jpg' },
          },
        },
      ],
    };
    const count = fixImageUrls(doc);
    expect(count).toBe(0);
  });
});

describe('preValidateAndFix', () => {
  it('runs full fix chain and reports fixes', () => {
    const doc = {
      components: [{ alias: 'core.text', props: [{ name: 'text' }] }],
      componentTemplates: {
        'biz-card': { displayName: '卡片' },
      },
      pages: [
        {
          id: 'p1',
          layout: {
            id: 'root',
            children: [
              {
                id: 'card',
                alias: 'core.text',
                props: { text: 'hello', unknownProp: 'bad' },
              },
            ],
          },
        },
        {
          id: 'p2',
          layout: {
            id: 'root',
            alias: 'core.image',
            props: { src: 'data:image/png;base64,abc' },
          },
        },
      ],
    };

    const result = preValidateAndFix(doc);
    expect(result.fixes.length).toBeGreaterThan(0);
    // Should have deduped 'root' ID
    expect(result.fixes.some((f) => f.includes('node IDs'))).toBe(true);
    // Should have auto-added biz-card
    expect(result.fixes.some((f) => f.includes('biz-*'))).toBe(true);
  });
});
