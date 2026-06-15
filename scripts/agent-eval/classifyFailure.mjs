// Failure classifier — maps raw agent-eval failure shapes into stable,
// rule-routable categories (PR-B.2).
//
// Pure ESM module. No deps. Imported by runAgentEval.js to attach a
// `category` to each entry of `summary.failures` and the per-scenario
// failure files in outputDir/failures/<scenarioId>.json.
//
// Tested by classifyFailure.spec.mjs using the built-in `node:test`
// runner — no jest, no build step.

/**
 * @typedef {'duplicate_ids'
 *   | 'missing_component_descriptor'
 *   | 'unknown_prop'
 *   | 'dangerous_url'
 *   | 'invalid_layout'
 *   | 'render_smoke'
 *   | 'semantic_assertion'
 *   | 'unrelated_change'
 *   | 'network_or_provider'
 *   | 'unknown'} FailureCategory
 */

/**
 * @typedef {'dedupeNodeIds'
 *   | 'autoBizComponents'
 *   | 'removeUnknownProps'
 *   | 'fixDangerousUrls'
 *   | null} PreValidateFixRule
 */

/**
 * @typedef {Object} ClassifiedFailure
 * @property {FailureCategory} category
 * @property {PreValidateFixRule} ruleHint
 * @property {string | null} matchedOn
 */

/**
 * @typedef {Object} RawEvalFailure
 * @property {string} [scenarioId]
 * @property {string} [prompt]
 * @property {string} [reason]
 * @property {string[]} [validatorErrors]
 * @property {string[]} [semanticFailures]
 * @property {string[]} [unrelatedChanges]
 * @property {string} [error]
 */

/**
 * Classify a single raw failure record.
 * @param {RawEvalFailure} failure
 * @returns {ClassifiedFailure}
 */
export function classifyFailure(failure) {
  // 1. Provider / network error takes priority.
  const reason = (failure.reason ?? '').toLowerCase();
  const topError = (failure.error ?? '').toLowerCase();
  if (
    reason.includes('live_eval_request_failed') ||
    topError.includes('econnrefused') ||
    topError.includes('etimedout') ||
    topError.includes('rate_limit') ||
    topError.includes('api key')
  ) {
    return {
      category: 'network_or_provider',
      ruleHint: null,
      matchedOn: failure.reason ?? failure.error ?? null,
    };
  }

  // 2. Walk validator errors first; first hit wins.
  for (const message of failure.validatorErrors ?? []) {
    const hit = classifyValidatorMessage(message);
    if (hit) return hit;
  }
  // 3. Then semantic failures.
  for (const message of failure.semanticFailures ?? []) {
    if (message && message.trim().length > 0) {
      return {
        category: 'semantic_assertion',
        ruleHint: null,
        matchedOn: message.length > 80 ? `${message.slice(0, 77)}...` : message,
      };
    }
  }
  // 4. Then unrelated changes (presence-only signal).
  if ((failure.unrelatedChanges ?? []).length > 0) {
    return {
      category: 'unrelated_change',
      ruleHint: null,
      matchedOn: failure.unrelatedChanges[0] ?? null,
    };
  }
  return { category: 'unknown', ruleHint: null, matchedOn: null };
}

/**
 * @param {string} message
 * @returns {ClassifiedFailure | null}
 */
function classifyValidatorMessage(message) {
  const lower = message.toLowerCase();
  if (lower.includes('duplicate') || lower.includes('already exists') || message.includes('重复')) {
    return { category: 'duplicate_ids', ruleHint: 'dedupeNodeIds', matchedOn: message };
  }
  if (
    lower.includes('missing_component_descriptor') ||
    lower.includes('unknown component') ||
    lower.includes('unknown alias') ||
    message.includes('未注册的组件')
  ) {
    return {
      category: 'missing_component_descriptor',
      ruleHint: 'autoBizComponents',
      matchedOn: message,
    };
  }
  if (
    lower.includes('unknown prop') ||
    lower.includes('unknown property') ||
    lower.includes('invalid prop') ||
    message.includes('未知 prop') ||
    message.includes('未知属性')
  ) {
    return {
      category: 'unknown_prop',
      ruleHint: 'removeUnknownProps',
      matchedOn: message,
    };
  }
  if (
    lower.includes('javascript:') ||
    lower.includes('vbscript:') ||
    // Match `data:` as a protocol prefix (e.g. `data:image/png`, `data: URI`),
    // not as a substring inside words like `metadata:` or `mydata:`. The
    // earlier `data:url` literal only matched the constructed test phrase
    // and missed real validator output.
    /(?<![a-z])data:/i.test(lower) ||
    lower.includes('data:url') ||
    lower.includes('dangerous') ||
    lower.includes('unsafe url') ||
    message.includes('非法 url') ||
    message.includes('不允许的 url')
  ) {
    return {
      category: 'dangerous_url',
      ruleHint: 'fixDangerousUrls',
      matchedOn: message,
    };
  }
  if (lower.includes('render_smoke') || lower.includes('render smoke')) {
    return { category: 'render_smoke', ruleHint: null, matchedOn: message };
  }
  if (
    lower.includes('invalid layout') ||
    lower.includes('invalid frame') ||
    lower.includes('invalid grid') ||
    lower.includes('invalid_position') ||
    message.includes('layout 非法')
  ) {
    return { category: 'invalid_layout', ruleHint: null, matchedOn: message };
  }
  return null;
}

/**
 * Convenience: classify a batch and return category counts.
 * @param {RawEvalFailure[]} failures
 * @returns {Record<FailureCategory, number>}
 */
export function summarizeClassifications(failures) {
  const counts = {
    duplicate_ids: 0,
    missing_component_descriptor: 0,
    unknown_prop: 0,
    dangerous_url: 0,
    invalid_layout: 0,
    render_smoke: 0,
    semantic_assertion: 0,
    unrelated_change: 0,
    network_or_provider: 0,
    unknown: 0,
  };
  for (const f of failures) {
    counts[classifyFailure(f).category] += 1;
  }
  return counts;
}
