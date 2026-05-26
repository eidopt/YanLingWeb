import { createCommerceMarketDocument } from '../../fixtures/seedDocuments';
import type { PageSpec } from '../../specs/pageSpec';
import { buildTemplateProfile } from '../../template/buildTemplateProfile';
import type { TemplateProfile } from '../../template/templateProfile';
import { validateTemplateProfile } from '../../template/validateTemplateProfile';
import type { ThemeLayoutDocument } from '../../types';

export function generateTestDocument(): ThemeLayoutDocument {
  return createCommerceMarketDocument();
}

export function generateTestProfile(document = generateTestDocument()): TemplateProfile {
  return buildTemplateProfile(document, { profileVersion: '1.0.0-test' });
}

export function generateCreateOrderPageSpec(): PageSpec {
  return {
    intent: 'create_page',
    pageKind: 'order',
    title: '待收货',
    contentIntent: '展示用户待收货订单列表',
    sections: [
      {
        sectionKind: 'list',
        patternKey: 'orders.订单状态.pattern',
        items: [{ title: '智能手表', status: '待收货', price: '¥399' }],
      },
    ],
    navigation: { sync: true, label: '待收货' },
  };
}

export function expectProfileValid(document: ThemeLayoutDocument, profile: TemplateProfile): void {
  const result = validateTemplateProfile(document, profile);
  if (!result.valid) {
    throw new Error(`Expected profile to be valid, got: ${result.errors.map((error) => error.message).join('; ')}`);
  }
}
