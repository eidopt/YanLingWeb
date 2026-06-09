/**
 * Minimal jest type declarations for spec files in the src tree.
 *
 * Project has no frontend jest config; runtime globals are provided by
 * the runFrontendSpec.ts polyfill script. This file supplies compile-time
 * types for describe / it / expect so typecheck passes.
 */

declare global {
  function describe(name: string, fn: () => void): void;
  function it(name: string, fn: () => void | Promise<void>): void;
  function expect<T>(value: T): {
    toBe(expected: T): void;
    toEqual(expected: unknown): void;
    toHaveLength(expected: number): void;
    toHaveBeenCalled(): void;
    toHaveBeenCalledWith(...args: unknown[]): void;
    toHaveBeenCalledTimes(n: number): void;
    toContain(substr: string): void;
    not: {
      toBe(expected: unknown): void;
      toEqual(expected: unknown): void;
      toHaveBeenCalled(): void;
      toContain(substr: string): void;
    };
  };
}

export {};
