import type { ThemeLayoutDocument, ThemeLayoutNode } from '../types';
import { buildTemplateProfile } from './buildTemplateProfile';
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
): ThemeLayoutNode {
  return {
    id,
    alias,
    layout: { mode: 'flow' as const },
    ...(props ? { props } : {}),
    ...(children ? { children } : []),
  };
}

function makePage(id: string, name: string, children: ThemeLayoutNode[], meta?: Record<string, unknown>) {
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

void describe('inferPageKind', () => {
  void describe('name/id regex matching', () => {
    void it('infers home from page name', () => {
      const doc = makeDoc([makePage('p1', 'Home', [])]);
      expect(buildTemplateProfile(doc).pages[0].pageKind).toBe('home');
    });

    void it('infers order from Chinese name', () => {
      const doc = makeDoc([makePage('p1', '订单', [])]);
      expect(buildTemplateProfile(doc).pages[0].pageKind).toBe('order');
    });

    void it('infers profile from "我的"', () => {
      const doc = makeDoc([makePage('p1', '我的', [])]);
      expect(buildTemplateProfile(doc).pages[0].pageKind).toBe('profile');
    });

    void it('infers product from "商品详情"', () => {
      const doc = makeDoc([makePage('p1', '商品详情', [])]);
      expect(buildTemplateProfile(doc).pages[0].pageKind).toBe('product');
    });
  });

  void describe('meta.pageKind explicit annotation', () => {
    void it('uses meta.pageKind over regex', () => {
      const doc = makeDoc([makePage('p1', '首页', [], { pageKind: 'custom-landing' })]);
      expect(buildTemplateProfile(doc).pages[0].pageKind).toBe('custom-landing');
    });

    void it('uses meta.pageKind over structural signals', () => {
      const doc = makeDoc([
        makePage(
          'p1',
          '页面1',
          [makeNode('t1', 'core.text', { text: '¥199.00' }), makeNode('b1', 'core.button', { label: '立即购买' })],
          { pageKind: 'promo' },
        ),
      ]);
      expect(buildTemplateProfile(doc).pages[0].pageKind).toBe('promo');
    });
  });

  void describe('structural signal matching (fallback)', () => {
    void it('infers product from price text + buy button', () => {
      const doc = makeDoc([
        makePage('p1', '页面1', [
          makeNode('img1', 'core.image'),
          makeNode('img2', 'core.image'),
          makeNode('t1', 'core.text', { text: '¥99.00' }),
          makeNode('b1', 'core.button', { label: '立即购买' }),
        ]),
      ]);
      expect(buildTemplateProfile(doc).pages[0].pageKind).toBe('product');
    });

    void it('infers form from form + input + submit button', () => {
      const doc = makeDoc([
        makePage('p1', '页面1', [
          makeNode('f1', 'core.form', undefined, [
            makeNode('i1', 'core.input', { placeholder: '姓名' }),
            makeNode('i2', 'core.input', { placeholder: '电话' }),
            makeNode('b1', 'core.button', { label: '提交' }),
          ]),
        ]),
      ]);
      expect(buildTemplateProfile(doc).pages[0].pageKind).toBe('form');
    });

    void it('infers profile from avatar + member text', () => {
      const doc = makeDoc([
        makePage('p1', '页面1', [
          makeNode('av1', 'core.avatar'),
          makeNode('t1', 'core.text', { text: '会员等级：VIP' }),
        ]),
      ]);
      expect(buildTemplateProfile(doc).pages[0].pageKind).toBe('profile');
    });

    void it('returns unknown when no strong signals (score < 0.6)', () => {
      const doc = makeDoc([makePage('p1', '页面1', [makeNode('t1', 'core.text', { text: '欢迎使用' })])]);
      expect(buildTemplateProfile(doc).pages[0].pageKind).toBe('unknown');
    });
  });

  void describe('commerce market fixture', () => {
    void it('infers correct pageKinds from Chinese names', () => {
      const doc = makeDoc([
        makePage('home', '首页', []),
        makePage('orders', '订单', []),
        makePage('profile', '我的', []),
      ]);
      const profile = buildTemplateProfile(doc);
      expect(profile.pages.map((p) => p.pageKind)).toEqual(['home', 'order', 'profile']);
    });
  });
});

void describe('buildNavigation', () => {
  void it('returns undefined for single-page documents', () => {
    const doc = makeDoc([makePage('p1', 'Home', [])]);
    expect(buildTemplateProfile(doc).navigation).toBeUndefined();
  });

  void it('returns bottom_tabs for mobile multi-page', () => {
    const doc = makeDoc([makePage('home', 'Home', []), makePage('orders', 'Orders', [])], 'Mobile App');
    const profile = buildTemplateProfile(doc);
    expect(profile.navigation?.type).toBe('bottom_tabs');
  });

  void it('detects side_nav from core.sidebar', () => {
    const doc = makeDoc(
      [makePage('home', 'Home', [makeNode('sb1', 'core.sidebar')]), makePage('orders', 'Orders', [])],
      'Desktop Dashboard',
    );
    const profile = buildTemplateProfile(doc);
    expect(profile.navigation?.type).toBe('side_nav');
  });

  void it('returns top_tabs for desktop without sidebar', () => {
    const doc = makeDoc([makePage('home', 'Home', []), makePage('about', 'About', [])], 'Desktop Website');
    const profile = buildTemplateProfile(doc);
    expect(profile.navigation?.type).toBe('top_tabs');
  });
});
