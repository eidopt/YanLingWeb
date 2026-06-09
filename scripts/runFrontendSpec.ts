/**
 * Minimal jest polyfill for running *.spec.ts files in src/ via tsx.
 *
 * 适用: 项目无前端 jest 配置, 临时跑 src/ai/core/providers/*.spec.ts.
 * 删除条件: 若后续引入前端 vitest/jest 框架, 即可删除此 polyfill.
 */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

interface SpecGlobalContext {
  suites: Suite[];
}

interface Suite {
  name: string;
  tests: TestCase[];
}

interface TestCase {
  name: string;
  fn: () => void | Promise<void>;
}

const ctx: SpecGlobalContext = { suites: [] };
let currentSuite: Suite | null = null;

const globalAny = globalThis as unknown as {
  describe: (name: string, fn: () => void) => void;
  it: (name: string, fn: () => void | Promise<void>) => void;
  expect: <T>(value: T) => AssertChain<T>;
};

interface AssertChain<T> {
  toBe: (expected: T) => void;
  toEqual: (expected: unknown) => void;
  toHaveLength: (expected: number) => void;
  toHaveBeenCalled: () => void;
  toHaveBeenCalledWith: (...args: unknown[]) => void;
  toHaveBeenCalledTimes: (n: number) => void;
  toContain: (substr: string) => void;
  not: AssertChain<T>;
}

function makeChain<T>(value: T): AssertChain<T> {
  const chain: AssertChain<T> = {
    toBe: (expected) => assert.equal(value, expected),
    toEqual: (expected) => assert.deepEqual(value, expected),
    toHaveLength: (expected) => assert.equal((value as unknown as { length: number }).length, expected),
    toHaveBeenCalled: () => assert.ok((value as unknown as { mock: { calls: unknown[] } }).mock.calls.length > 0),
    toHaveBeenCalledWith: (...args) => {
      const mock = (value as unknown as { mock: { calls: unknown[][] } }).mock;
      const found = mock.calls.some((call) => assert.deepEqual(call, args) === undefined);
      assert.ok(found, `expected to have been called with ${JSON.stringify(args)}`);
    },
    toHaveBeenCalledTimes: (n) => {
      const mock = (value as unknown as { mock: { calls: unknown[] } }).mock;
      assert.equal(mock.calls.length, n);
    },
    toContain: (substr) => assert.ok(String(value).includes(substr), `expected ${String(value)} to contain ${substr}`),
    not: undefined as unknown as AssertChain<T>,
  };
  const negated: AssertChain<T> = {
    toBe: (expected) => assert.notEqual(value, expected),
    toEqual: (expected) => assert.notDeepEqual(value, expected),
    toHaveLength: (expected) => assert.notEqual((value as unknown as { length: number }).length, expected),
    toHaveBeenCalled: () => assert.equal((value as unknown as { mock: { calls: unknown[] } }).mock.calls.length, 0),
    toHaveBeenCalledWith: () => {
      throw new Error('not.toHaveBeenCalledWith not supported in this polyfill');
    },
    toHaveBeenCalledTimes: (n) => {
      const mock = (value as unknown as { mock: { calls: unknown[] } }).mock;
      assert.notEqual(mock.calls.length, n);
    },
    toContain: (substr) => assert.ok(!String(value).includes(substr)),
    not: chain,
  };
  chain.not = negated;
  return chain;
}

globalAny.describe = (name, fn) => {
  const suite: Suite = { name, tests: [] };
  ctx.suites.push(suite);
  currentSuite = suite;
  try {
    fn();
  } finally {
    currentSuite = null;
  }
};

globalAny.it = (name, fn) => {
  if (!currentSuite) {
    throw new Error('it() called outside of describe()');
  }
  currentSuite.tests.push({ name, fn });
};

globalAny.expect = <T>(value: T) => makeChain(value);

const target = process.argv[2];
if (!target) {
  console.error('Usage: tsx scripts/runFrontendSpec.ts <path-to-spec-file>');
  process.exit(1);
}

await import(pathToFileURL(target).href);

let passed = 0;
let failed = 0;
/* eslint-disable no-console */
for (const suite of ctx.suites) {
  console.log(`\n  ${suite.name}`);
  for (const test of suite.tests) {
    try {
      await test.fn();
      console.log(`    ✓ ${test.name}`);
      passed += 1;
    } catch (err) {
      console.log(`    ✗ ${test.name}`);
      console.log(`      ${(err as Error).message}`);
      failed += 1;
    }
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
/* eslint-enable no-console */
process.exit(failed > 0 ? 1 : 0);
