/**
 * Minimal node:test type declarations for spec files in the src tree.
 *
 * Project has no frontend jest config; spec files use node:test
 * + node:assert/strict so they can run via `node --import tsx --test`.
 * This file augments the global scope with describe/it/assert aliases
 * so the import style stays consistent.
 */

declare global {
  function describe(name: string, fn: () => void | Promise<void>): void;
  function it(name: string, fn: () => void | Promise<void>): void;
}

export {};
