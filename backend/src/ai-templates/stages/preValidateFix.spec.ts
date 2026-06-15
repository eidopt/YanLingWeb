/**
 * preValidateFix tests.
 *
 * Run: pnpm --dir backend test -- --runTestsByPath src/ai-templates/stages/preValidateFix.spec.ts
 */

import {
  autoBizComponents,
  dedupeNodeIds,
  fixDangerousUrls,
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

  // Security: defense in depth — autoBizComponents must not be tricked into
  // registering arbitrary LLM-supplied aliases as new top-level components.
  it('rejects aliases that do not match the biz-* namespace pattern', () => {
    const doc = {
      components: [{ alias: 'core.text', props: [] }],
      componentTemplates: {
        'evil-injection': { displayName: 'Evil' },
        'core.spoofed': { displayName: 'Spoof' },
        '../../etc/passwd': { displayName: 'Path' },
        'biz.promo-card': { displayName: 'Promo' },
      },
    };
    const count = autoBizComponents(doc);
    expect(count).toBe(1);
    const components = doc.components as { alias: string }[];
    expect(components.map((c) => c.alias)).toEqual(['core.text', 'biz.promo-card']);
  });

  it('accepts biz-* namespace variants (dot, dash, underscore, mixed case)', () => {
    const doc = {
      components: [],
      componentTemplates: {
        'biz-promo-card': { displayName: 'A' },
        'biz.promo_card': { displayName: 'B' },
        'biz.PromoCard': { displayName: 'C' },
        'biz.promo123': { displayName: 'D' },
      },
    };
    const count = autoBizComponents(doc);
    expect(count).toBe(4);
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

  it('strips unknown props on biz-* nodes via fallback whitelist', () => {
    const doc = {
      components: [{ alias: 'biz-promo-card', props: [] }],
      componentTemplates: {
        'biz-promo-card': { displayName: '促销卡片' },
      },
      pages: [
        {
          id: 'p1',
          layout: {
            id: 'root',
            alias: 'biz-promo-card',
            // Common editable props + obvious LLM garbage
            props: {
              title: '限时',
              label: '立即查看',
              foobarGarbage: 'should go',
              randomCamelCaseField: 42,
            },
          },
        },
      ],
    };
    const count = removeUnknownProps(doc, doc.componentTemplates);
    expect(count).toBe(2);
    const layout = (doc.pages[0] as { layout: { props: Record<string, unknown> } }).layout;
    expect(layout.props.title).toBe('限时');
    expect(layout.props.label).toBe('立即查看');
    expect(layout.props.foobarGarbage).toBeUndefined();
    expect(layout.props.randomCamelCaseField).toBeUndefined();
  });

  it('uses declared propNames on biz-* nodes when available', () => {
    const doc = {
      components: [{ alias: 'biz-custom', props: [] }],
      componentTemplates: {
        'biz-custom': { displayName: '自定义', propNames: ['headline', 'cta'] },
      },
      pages: [
        {
          id: 'p1',
          layout: {
            id: 'root',
            alias: 'biz-custom',
            props: {
              headline: 'Hi',
              cta: 'Go',
              title: 'Not in propNames',
              label: 'Not in propNames',
            },
          },
        },
      ],
    };
    const count = removeUnknownProps(doc, doc.componentTemplates);
    expect(count).toBe(2);
    const layout = (doc.pages[0] as { layout: { props: Record<string, unknown> } }).layout;
    expect(layout.props.headline).toBe('Hi');
    expect(layout.props.cta).toBe('Go');
    expect(layout.props.title).toBeUndefined();
    expect(layout.props.label).toBeUndefined();
  });

  it('leaves props alone for unknown alias not in catalog', () => {
    const doc = {
      components: [{ alias: 'core.text', props: [{ name: 'text' }] }],
      pages: [
        {
          id: 'p1',
          layout: {
            id: 'root',
            alias: 'totally-unknown-alias',
            props: { anything: 'goes' },
          },
        },
      ],
    };
    const count = removeUnknownProps(doc);
    expect(count).toBe(0);
    const layout = (doc.pages[0] as { layout: { props: Record<string, unknown> } }).layout;
    expect(layout.props.anything).toBe('goes');
  });
});

describe('fixDangerousUrls', () => {
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
    const count = fixDangerousUrls(doc);
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
    const count = fixDangerousUrls(doc);
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
    const count = fixDangerousUrls(doc);
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
    const count = fixDangerousUrls(doc);
    expect(count).toBe(0);
  });

  // Security: scheme casing differential — LLM might emit `JavaScript:` or
  // `DATA:` to bypass naive case-sensitive startsWith checks.
  it('rejects mixed-case scheme variants (case-insensitive)', () => {
    const doc = {
      pages: [
        {
          id: 'p1',
          layout: { id: 'a', alias: 'core.image', props: { src: 'JavaScript:alert(1)' } },
        },
        {
          id: 'p2',
          layout: { id: 'b', alias: 'core.image', props: { src: 'DATA:image/png;base64,abc' } },
        },
        {
          id: 'p3',
          layout: { id: 'c', alias: 'core.image', props: { src: 'VbScript:msgbox(1)' } },
        },
        {
          id: 'p4',
          layout: { id: 'd', alias: 'core.image', props: { src: '\tjavascript:alert(1)' } },
        },
      ],
    };
    const count = fixDangerousUrls(doc);
    expect(count).toBe(4);
  });

  // Security: protocol-relative `//` could be smuggled to bypass same-origin
  // checks when the page is served from http and `//evil.com/x.png` resolves
  // to evil.com without an explicit scheme.
  it('rejects protocol-relative URLs starting with //', () => {
    const doc = {
      pages: [
        { id: 'p1', layout: { id: 'a', alias: 'core.image', props: { src: '//evil.com/x.png' } } },
      ],
    };
    const count = fixDangerousUrls(doc);
    expect(count).toBe(1);
  });

  // Security: sanitizer scope — any alias with a URL-shaped prop must be
  // scanned, not just `core.image.src`.
  it('scans URL-shaped props on any alias (defense in depth)', () => {
    const doc = {
      pages: [
        {
          id: 'p1',
          layout: {
            id: 'root',
            children: [
              {
                id: 'link',
                alias: 'core.html',
                props: { href: 'javascript:alert(1)' },
              },
              {
                id: 'video',
                alias: 'core.video',
                props: { poster: 'data:image/png;base64,abc' },
              },
              {
                id: 'biz-link',
                alias: 'biz-cta',
                props: { to: 'JavaScript:fetch("/leak")' },
              },
            ],
          },
        },
      ],
    };
    const count = fixDangerousUrls(doc);
    expect(count).toBe(3);
  });

  // Sanity: mailto: and tel: are common safe schemes and should pass.
  it('preserves mailto: and tel: schemes', () => {
    const doc = {
      pages: [
        {
          id: 'p1',
          layout: { id: 'a', alias: 'core.html', props: { href: 'mailto:hi@example.com' } },
        },
        {
          id: 'p2',
          layout: { id: 'b', alias: 'core.html', props: { href: 'tel:+15551234567' } },
        },
      ],
    };
    const count = fixDangerousUrls(doc);
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

  // PR-B.3: regression fixtures — these mirror the failure categories the
  // agent-eval classifier (PR-B.2) buckets into each preValidateAndFix
  // rule. Each fixture demonstrates that a known LLM-output failure shape
  // is mechanically repaired, so the loop is closed: classify → route → fix.
  describe('regression fixtures for classifier → preValidateAndFix routing', () => {
    it('duplicate_ids: cross-page duplicate hero IDs are renamed to -2/-3', () => {
      const doc = {
        components: [{ alias: 'core.text', props: [{ name: 'text' }] }],
        pages: [
          { id: 'page-home', layout: { id: 'hero', alias: 'core.text' } },
          { id: 'page-detail', layout: { id: 'hero', alias: 'core.text' } },
          { id: 'page-list', layout: { id: 'hero', alias: 'core.text' } },
        ],
      };
      const result = preValidateAndFix(doc);
      expect(result.fixes).toContain('Auto-deduplicated 2 node IDs');
      const p2 = (doc.pages[1] as { layout: { id: string } }).layout;
      const p3 = (doc.pages[2] as { layout: { id: string } }).layout;
      expect(p2.id).toBe('hero-2');
      expect(p3.id).toBe('hero-3');
    });

    it('missing_component_descriptor: biz-* alias referenced in layout auto-registered', () => {
      const doc = {
        components: [{ alias: 'core.text', props: [{ name: 'text' }] }],
        componentTemplates: {
          'biz-promo-card': { displayName: '促销卡片' },
        },
        pages: [
          {
            id: 'page-home',
            layout: {
              id: 'root',
              alias: 'core.text',
              children: [
                {
                  id: 'promo',
                  alias: 'biz-promo-card',
                  props: { title: '限时' },
                },
              ],
            },
          },
        ],
      };
      const result = preValidateAndFix(doc);
      expect(result.fixes).toContain('Auto-added 1 biz-* component descriptors');
      const components = doc.components as { alias: string }[];
      expect(components.map((c) => c.alias)).toContain('biz-promo-card');
    });

    it('dangerous_url: biz-* alias with javascript: bg is replaced (defense in depth)', () => {
      const doc = {
        components: [
          { alias: 'core.image', props: [{ name: 'src' }] },
          { alias: 'biz-card', props: [{ name: 'background' }] },
        ],
        componentTemplates: {
          'biz-card': { displayName: '卡片' },
        },
        pages: [
          {
            id: 'page-home',
            layout: {
              id: 'root',
              alias: 'core.text',
              children: [
                {
                  id: 'banner',
                  alias: 'biz-card',
                  props: {
                    title: '促销',
                    background: 'javascript:fetch("/leak")',
                  },
                },
              ],
            },
          },
        ],
      };
      const result = preValidateAndFix(doc);
      expect(result.fixes).toContain('Auto-fixed 1 dangerous/non-allowlisted URL props');
      const banner = (doc.pages[0] as { layout: { children: { props: { background: string } }[] } })
        .layout.children[0];
      expect(banner.props.background).toContain('placehold.co');
    });
  });
});
