// Tests for the failure classifier (PR-B.2).
//
// Run with: node --test scripts/agent-eval/classifyFailure.spec.mjs
// (or `node --test scripts/agent-eval/` to discover the spec.)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { classifyFailure, summarizeClassifications } from './classifyFailure.mjs';

function makeFailure(overrides = {}) {
  return {
    scenarioId: 'demo',
    prompt: '...',
    reason: 'failed',
    validatorErrors: [],
    semanticFailures: [],
    unrelatedChanges: [],
    ...overrides,
  };
}

describe('classifyFailure (PR-B.2)', () => {
  describe('network_or_provider', () => {
    it('classifies live_eval_request_failed as network_or_provider', () => {
      const result = classifyFailure(makeFailure({ reason: 'live_eval_request_failed: ECONNREFUSED' }));
      assert.equal(result.category, 'network_or_provider');
      assert.equal(result.ruleHint, null);
    });

    it('classifies top-level error containing ECONNREFUSED', () => {
      const result = classifyFailure(makeFailure({ reason: 'failed', error: 'fetch failed: ECONNREFUSED' }));
      assert.equal(result.category, 'network_or_provider');
    });

    it('classifies rate_limit mentions as network_or_provider', () => {
      const result = classifyFailure(makeFailure({ reason: 'failed', error: 'rate_limit exceeded' }));
      assert.equal(result.category, 'network_or_provider');
    });
  });

  describe('validator-driven categories', () => {
    it('routes duplicate-id messages to dedupeNodeIds', () => {
      const result = classifyFailure(makeFailure({ validatorErrors: ['Node id "hero" already exists on page 2'] }));
      assert.equal(result.category, 'duplicate_ids');
      assert.equal(result.ruleHint, 'dedupeNodeIds');
    });

    it('routes Chinese duplicate phrasing to dedupeNodeIds', () => {
      const result = classifyFailure(makeFailure({ validatorErrors: ['节点 id 重复: hero 已被 page 1 使用'] }));
      assert.equal(result.category, 'duplicate_ids');
    });

    it('routes missing_component_descriptor to autoBizComponents', () => {
      const result = classifyFailure(
        makeFailure({ validatorErrors: ['missing_component_descriptor: biz-promo-card'] }),
      );
      assert.equal(result.category, 'missing_component_descriptor');
      assert.equal(result.ruleHint, 'autoBizComponents');
    });

    it('routes unknown-prop messages to removeUnknownProps', () => {
      const result = classifyFailure(makeFailure({ validatorErrors: ['Unknown prop "fooBar" on alias core.text'] }));
      assert.equal(result.category, 'unknown_prop');
      assert.equal(result.ruleHint, 'removeUnknownProps');
    });

    it('routes dangerous URL messages to fixDangerousUrls', () => {
      const result = classifyFailure(
        makeFailure({ validatorErrors: ['[dangerous_url] src: javascript:alert(1) 不被允许'] }),
      );
      assert.equal(result.category, 'dangerous_url');
      assert.equal(result.ruleHint, 'fixDangerousUrls');
    });

    it('routes data: URIs to fixDangerousUrls', () => {
      const result = classifyFailure(makeFailure({ validatorErrors: ['data:url is not allowed for src prop'] }));
      assert.equal(result.category, 'dangerous_url');
    });

    it('routes render_smoke_failed to render_smoke (no auto-fix)', () => {
      const result = classifyFailure(makeFailure({ validatorErrors: ['render_smoke_failed: missing core.screen'] }));
      assert.equal(result.category, 'render_smoke');
      assert.equal(result.ruleHint, null);
    });

    it('routes invalid layout messages to invalid_layout (no auto-fix)', () => {
      const result = classifyFailure(makeFailure({ validatorErrors: ['invalid_position: x must be non-negative'] }));
      assert.equal(result.category, 'invalid_layout');
    });
  });

  describe('semantic and unrelated buckets', () => {
    it('falls through to semantic_assertion when no validator hit', () => {
      const result = classifyFailure(
        makeFailure({ semanticFailures: ['Expected a "立即购买" button on hero region'] }),
      );
      assert.equal(result.category, 'semantic_assertion');
      assert.equal(result.ruleHint, null);
    });

    it('falls through to unrelated_change when only unrelated changes are reported', () => {
      const result = classifyFailure(makeFailure({ unrelatedChanges: ['pages[0].layout.children[3]'] }));
      assert.equal(result.category, 'unrelated_change');
    });

    it('returns unknown when nothing matched at all', () => {
      const result = classifyFailure(makeFailure());
      assert.equal(result.category, 'unknown');
    });
  });

  describe('priority', () => {
    it('network error wins over validator hits', () => {
      const result = classifyFailure(
        makeFailure({
          reason: 'failed',
          error: 'ECONNREFUSED',
          validatorErrors: ['Node id "hero" already exists'],
        }),
      );
      assert.equal(result.category, 'network_or_provider');
    });

    it('validator hits win over semantic_failures', () => {
      const result = classifyFailure(
        makeFailure({
          validatorErrors: ['Unknown prop "x"'],
          semanticFailures: ['hero missing CTA'],
        }),
      );
      assert.equal(result.category, 'unknown_prop');
    });

    it('matchedOn is truncated to 80 chars for long messages', () => {
      const longMessage = 'a'.repeat(200);
      const result = classifyFailure(makeFailure({ semanticFailures: [longMessage] }));
      assert.equal(result.category, 'semantic_assertion');
      assert.equal(result.matchedOn?.length, 80);
    });
  });
});

describe('summarizeClassifications (PR-B.2)', () => {
  it('counts each category correctly', () => {
    const summary = summarizeClassifications([
      makeFailure({ validatorErrors: ['Node id "a" already exists'] }),
      makeFailure({ validatorErrors: ['Node id "b" already exists'] }),
      makeFailure({ validatorErrors: ['Unknown prop "x"'] }),
      makeFailure({ semanticFailures: ['hero missing CTA'] }),
      makeFailure({ reason: 'failed', error: 'ECONNREFUSED' }),
      makeFailure(),
    ]);
    assert.deepEqual(summary, {
      duplicate_ids: 2,
      missing_component_descriptor: 0,
      unknown_prop: 1,
      dangerous_url: 0,
      invalid_layout: 0,
      render_smoke: 0,
      semantic_assertion: 1,
      unrelated_change: 0,
      network_or_provider: 1,
      unknown: 1,
    });
  });
});
