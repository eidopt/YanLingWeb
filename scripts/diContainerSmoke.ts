import { APP_SERVICE_TOKENS, createAppServiceContainer } from '../src/services/AppServicesContext';
import type { HttpClient, HttpJsonResult, HttpStreamResult } from '../src/services/http/HttpClient';
import { createServiceToken, ServiceContainer } from '../src/services/ServiceContainer';
import { UserService } from '../src/services/UserService';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Part 1 — ServiceContainer lifetime + value-override contract
// ---------------------------------------------------------------------------

const numberToken = createServiceToken<{ value: number }>('CounterValue');

// registerValue: resolve always returns the exact instance supplied.
const fixedValue = { value: 42 };
const valueContainer = new ServiceContainer();
valueContainer.registerValue(numberToken, fixedValue);
assert.equal(valueContainer.resolve(numberToken), fixedValue, 'registerValue must return the exact value');
assert.equal(valueContainer.resolve(numberToken), fixedValue, 'registerValue must stay stable across resolves');

// registerSingleton: factory runs once, the same instance is cached.
let singletonFactoryCalls = 0;
const singletonContainer = new ServiceContainer();
singletonContainer.registerSingleton(numberToken, () => {
  singletonFactoryCalls += 1;
  return { value: singletonFactoryCalls };
});
const singletonA = singletonContainer.resolve(numberToken);
const singletonB = singletonContainer.resolve(numberToken);
assert.equal(singletonA, singletonB, 'singleton must cache the same instance');
assert.equal(singletonFactoryCalls, 1, 'singleton factory must run exactly once');

// registerTransient: factory runs on every resolve, producing fresh instances.
let transientFactoryCalls = 0;
const transientContainer = new ServiceContainer();
transientContainer.registerTransient(numberToken, () => {
  transientFactoryCalls += 1;
  return { value: transientFactoryCalls };
});
const transientA = transientContainer.resolve(numberToken);
const transientB = transientContainer.resolve(numberToken);
assert.notEqual(transientA, transientB, 'transient must return a fresh instance per resolve');
assert.equal(transientFactoryCalls, 2, 'transient factory must run on every resolve');

// Re-registering a token clears any cached singleton (override semantics).
const overrideContainer = new ServiceContainer();
overrideContainer.registerValue(numberToken, { value: 1 });
assert.equal(overrideContainer.resolve(numberToken).value, 1);
overrideContainer.registerValue(numberToken, { value: 2 });
assert.equal(overrideContainer.resolve(numberToken).value, 2, 're-register must override the previous value');

// Unregistered tokens throw a descriptive error.
const emptyContainer = new ServiceContainer();
assert.throws(
  () => emptyContainer.resolve(numberToken),
  /Service provider not registered: CounterValue/,
  'resolving an unregistered token must throw',
);

// ---------------------------------------------------------------------------
// Part 2 — createAppServiceContainer(configure) provider-override contract
// ---------------------------------------------------------------------------

class FakeHttpClient implements HttpClient {
  public readonly jsonCalls: string[] = [];

  json<T>(path: string): Promise<HttpJsonResult<T>> {
    this.jsonCalls.push(path);
    return Promise.resolve({
      data: {} as T,
      response: new Response('{}', { status: 200 }),
    });
  }

  stream(): Promise<HttpStreamResult> {
    return Promise.reject(new Error('not implemented in fake'));
  }
}

const fakeClient = new FakeHttpClient();

// The configure callback runs AFTER the default registrations, so overriding
// httpClient here must win — both for a direct resolve and for any dependent
// service that resolves httpClient through the container.
const container = createAppServiceContainer((c, tokens) => {
  c.registerValue(tokens.httpClient, fakeClient);
});

// Direct resolve returns our fake.
assert.equal(
  container.resolve(APP_SERVICE_TOKENS.httpClient),
  fakeClient,
  'configure override must win for httpClient',
);

// A dependent service (userService) must receive the overridden fake client.
const userService = container.resolve(APP_SERVICE_TOKENS.userService);
assert.ok(userService instanceof UserService, 'userService token must resolve to a UserService');

// Drive the dependent service and confirm it routes through the fake client
// rather than performing a real network fetch.
await userService.requestChallenge();
assert.deepEqual(
  fakeClient.jsonCalls,
  ['/api/proxy/users/auth/challenge'],
  'dependent service must call through the overridden http client',
);

// Without a configure override, the default httpClient is a real FetchHttpClient
// (a different instance), proving the override above was genuinely applied.
const defaultContainer = createAppServiceContainer();
assert.notEqual(
  defaultContainer.resolve(APP_SERVICE_TOKENS.httpClient),
  fakeClient,
  'default container must not use the fake client',
);

console.warn('DI container smoke test passed.');
