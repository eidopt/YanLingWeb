/**
 * Tests for the Critic reviseActions parser (PR-B.1).
 *
 * Run: pnpm --dir backend test -- --runTestsByPath src/ai-templates/stages/diversityCritic.agent.spec.ts
 */

import { parseReviseActions } from './diversityCritic.agent';

describe('parseReviseActions (PR-B.1)', () => {
  it('returns [] for empty or non-array input', () => {
    expect(parseReviseActions(undefined)).toEqual([]);
    expect(parseReviseActions(null)).toEqual([]);
    expect(parseReviseActions([])).toEqual([]);
    expect(parseReviseActions('not-an-array')).toEqual([]);
    expect(parseReviseActions(42)).toEqual([]);
  });

  it('keeps well-formed actions of every variant in input order', () => {
    const result = parseReviseActions([
      { type: 'add_section', afterRegion: 'hero', sectionKind: 'metrics' },
      { type: 'replace_section', regionKey: 'banner', newKind: 'card-grid' },
      { type: 'adjust_layout', regionKey: 'cta', direction: 'row' },
      { type: 'improve_contrast', regionKey: 'footer', suggestion: '提高主色亮度' },
    ]);
    expect(result).toEqual([
      { type: 'add_section', afterRegion: 'hero', sectionKind: 'metrics' },
      { type: 'replace_section', regionKey: 'banner', newKind: 'card-grid' },
      { type: 'adjust_layout', regionKey: 'cta', direction: 'row' },
      { type: 'improve_contrast', regionKey: 'footer', suggestion: '提高主色亮度' },
    ]);
  });

  it('drops entries with unknown type discriminators', () => {
    const result = parseReviseActions([
      { type: 'unknown_variant', regionKey: 'x', direction: 'row' },
      { type: 'adjust_layout', regionKey: 'cta', direction: 'column' },
    ]);
    expect(result).toEqual([{ type: 'adjust_layout', regionKey: 'cta', direction: 'column' }]);
  });

  it('drops entries missing required fields for their type', () => {
    const result = parseReviseActions([
      { type: 'add_section', afterRegion: 'hero' }, // missing sectionKind
      { type: 'replace_section', regionKey: 'banner' }, // missing newKind
      { type: 'adjust_layout', direction: 'row' }, // missing regionKey
      { type: 'adjust_layout', regionKey: 'cta', direction: 'wrong' }, // bad direction
      { type: 'improve_contrast', regionKey: 'footer' }, // missing suggestion
    ]);
    expect(result).toEqual([]);
  });

  it('drops non-string or empty field values', () => {
    const result = parseReviseActions([
      { type: 'add_section', afterRegion: '', sectionKind: 'x' },
      { type: 'replace_section', regionKey: 123, newKind: 'x' },
      { type: 'adjust_layout', regionKey: 'cta', direction: 'row', extra: 'ignored' },
    ]);
    expect(result).toEqual([{ type: 'adjust_layout', regionKey: 'cta', direction: 'row' }]);
  });

  it('reports dropped count via onDropped callback (does not throw)', () => {
    const drops: string[] = [];
    parseReviseActions(
      [
        { type: 'unknown', foo: 1 },
        null,
        { type: 'add_section', afterRegion: 'hero' },
        { type: 'adjust_layout', regionKey: 'cta', direction: 'sideways' },
      ],
      (msg) => drops.push(msg),
    );
    expect(drops).toHaveLength(1);
    expect(drops[0]).toMatch(/dropped 4 malformed action\(s\) of 4/);
  });
});
