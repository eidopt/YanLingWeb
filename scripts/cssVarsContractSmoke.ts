/* eslint-disable no-console -- CLI smoke test needs stdout output */
/**
 * Smoke test — cssVars 主题色契约校验器
 * 运行：pnpm test:css-contract
 */
import {
  RECOMMENDED_THEME_CONTRACT_KEYS,
  REQUIRED_THEME_CONTRACT_KEYS,
} from '../shared/agent/prompts/templates/designPrinciples';
import { isCssVarsContractSatisfied, validateCssVarsContract } from '../shared/agent/validation/cssVarsContract';
import assert from 'node:assert/strict';

function makeComplete(): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const k of REQUIRED_THEME_CONTRACT_KEYS) {
    vars[k] = '#123456';
  }
  for (const k of RECOMMENDED_THEME_CONTRACT_KEYS) {
    vars[k] = 'rgb(10, 20, 30)';
  }
  return vars;
}

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log('cssVars contract smoke:');

check('完整契约 → 无 error 无 warning', () => {
  const issues = validateCssVarsContract({ cssVars: makeComplete() });
  assert.equal(issues.length, 0, JSON.stringify(issues));
  assert.equal(isCssVarsContractSatisfied({ cssVars: makeComplete() }), true);
});

check('缺必填键 → error (missing-required)', () => {
  const vars = makeComplete();
  delete vars['--accent'];
  const issues = validateCssVarsContract({ cssVars: vars });
  const err = issues.find((i) => i.path === 'cssVars.--accent');
  assert.ok(err, 'should report missing --accent');
  assert.equal(err.severity, 'error');
  assert.equal(err.code, 'theme-contract/missing-required');
  assert.equal(isCssVarsContractSatisfied({ cssVars: vars }), false);
});

check('必填键值非法颜色 → error (invalid-color)', () => {
  const vars = makeComplete();
  vars['--surface'] = 'not-a-color!!';
  const issues = validateCssVarsContract({ cssVars: vars });
  const err = issues.find((i) => i.path === 'cssVars.--surface');
  assert.ok(err);
  assert.equal(err.code, 'theme-contract/invalid-color');
});

check('缺推荐键 → warning (missing-recommended)', () => {
  const vars = makeComplete();
  delete vars['--btn-pill-bg'];
  const issues = validateCssVarsContract({ cssVars: vars });
  const warn = issues.find((i) => i.path === 'cssVars.--btn-pill-bg');
  assert.ok(warn);
  assert.equal(warn.severity, 'warning');
  // 缺推荐键不影响「满足」判定
  assert.equal(isCssVarsContractSatisfied({ cssVars: vars }), true);
});

check('契约键在 style.cssVars 也算数', () => {
  const issues = validateCssVarsContract({ style: { cssVars: makeComplete() } });
  assert.equal(issues.length, 0, JSON.stringify(issues));
});

check('var()/transparent 视为合法颜色', () => {
  const vars = makeComplete();
  vars['--accent'] = 'var(--brand, #ff6b35)';
  vars['--panel-bg'] = 'transparent';
  const issues = validateCssVarsContract({ cssVars: vars }).filter((i) => i.severity === 'error');
  assert.equal(issues.length, 0, JSON.stringify(issues));
});

console.log(`\n✅ cssVars contract smoke passed (${passed} checks)`);
