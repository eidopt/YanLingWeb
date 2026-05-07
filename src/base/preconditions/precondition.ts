/**
 * Asserts that a value is not null or undefined.
 * Throws if the assertion fails — use this for invariants that must always
 * hold (i.e. programmer errors, not user input errors).
 *
 * @example
 * assertExists(user, 'User must be logged in');
 * user.doSomething(); // TypeScript now knows user is defined
 */
export function assertExists<T>(
  value: T | null | undefined,
  message?: string,
): asserts value is T {
  if (value == null) {
    throw new Error(
      message ??
        'Expected value to be defined, but received null or undefined.',
    );
  }
}

/**
 * Checks that a value is not null or undefined and returns it.
 * Throws if the check fails — use this when you need the narrowed value.
 *
 * @example
 * const el = checkExists(document.getElementById('root'), 'Missing #root');
 * el.setAttribute('data-ready', 'true');
 */
export function checkExists<T>(
  value: T | null | undefined,
  message?: string,
): T {
  if (value == null) {
    throw new Error(
      message ??
        'Expected value to be defined, but received null or undefined.',
    );
  }
  return value;
}
