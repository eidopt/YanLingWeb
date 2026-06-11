/**
 * Tests for cache_diagnostic helpers (PR-A 可观测性).
 * Run: pnpm --dir backend test -- --runTestsByPath src/ai/agentRunner.helpers.spec.ts
 */
import { buildCacheDiagnostics, hashJson } from './agentRunner.helpers';
import type { ProviderMessage } from './core/providers/types';

describe('agentRunner.helpers (cache diagnostics)', () => {
  describe('hashJson', () => {
    it('returns a 16-hex string for any value', () => {
      const hash = hashJson({ a: 1 });
      expect(hash).toMatch(/^[0-9a-f]{16}$/);
    });

    it('is deterministic — same input yields same hash', () => {
      const a = hashJson({ messages: [{ role: 'system', content: 'you are helpful' }] });
      const b = hashJson({ messages: [{ role: 'system', content: 'you are helpful' }] });
      expect(a).toBe(b);
    });

    it('changes when input changes (key order agnostic in practice)', () => {
      const a = hashJson({ role: 'system', content: 'A' });
      const b = hashJson({ role: 'system', content: 'B' });
      expect(a).not.toBe(b);
    });
  });

  describe('buildCacheDiagnostics', () => {
    const prefix: ProviderMessage[] = [
      { role: 'system', content: 'you are helpful' },
      { role: 'user', content: 'edit the hero section' },
    ];
    const tools = [
      { name: 'editor_update_props', description: 'desc' },
      { name: 'editor_insert_node', description: 'desc' },
    ];
    const log: ProviderMessage[] = [{ role: 'assistant', content: 'ok' }];

    it('produces stable hash fields for the same prefix + tools', () => {
      const a = buildCacheDiagnostics(prefix, tools, log);
      const b = buildCacheDiagnostics(prefix, tools, log);
      expect(a.prefixHash).toBe(b.prefixHash);
      expect(a.toolHash).toBe(b.toolHash);
    });

    it('counts prefix and tool contributions', () => {
      const d = buildCacheDiagnostics(prefix, tools, log);
      expect(d.prefixMessageCount).toBe(prefix.length);
      expect(d.toolCount).toBe(tools.length);
      expect(d.providerLogMessageCount).toBe(log.length);
      expect(d.firstDynamicMessageIndex).toBe(prefix.length);
    });

    it('changes prefix hash when prefix messages change', () => {
      const baseline = buildCacheDiagnostics(prefix, tools, []);
      const mutated = buildCacheDiagnostics(
        [...prefix, { role: 'user', content: 'follow-up' }],
        tools,
        [],
      );
      expect(mutated.prefixHash).not.toBe(baseline.prefixHash);
      expect(mutated.prefixMessageCount).toBe(prefix.length + 1);
    });
  });
});
