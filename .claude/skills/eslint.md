---
name: eslint
description: >
  Enforces the ai-app ESLint rules while writing code, and runs `pnpm lint --fix`
  after every round of edits. Invoke whenever writing or editing TypeScript/TSX files
  in the ai-app project.
---

# ai-app ESLint Compliance

When writing or editing any `.ts` / `.tsx` file in this project, follow the rules
below **as you write**, then run `pnpm lint --fix` when done.

---

## Rules to follow while writing code

### TypeScript

| Rule | What to do |
|------|-----------|
| `consistent-type-imports` | Always use `import type { … }` for type-only imports, on a **separate** `import type` line — never inline with value imports |
| `no-explicit-any` | Avoid `any`; use `unknown` + type guards, or a precise type |
| `no-non-null-assertion` | Avoid `!`; use optional chaining or an explicit null check |
| `prefer-nullish-coalescing` | Use `??` instead of `\|\|` when the left side can be `null`/`undefined` |
| `prefer-optional-chain` | Use `a?.b?.c` instead of `a && a.b && a.b.c` |
| `no-unnecessary-condition` | Don't guard values TypeScript already knows are always truthy/falsy |
| `no-floating-promises` | Always `await` or `.catch()` Promises; never let them float |
| `no-misused-promises` | Don't pass an `async` function where a void callback is expected (JSX event handlers are exempt) |
| `no-unused-vars` | Prefix intentionally unused variables/args with `_` |

### General JS quality

| Rule | What to do |
|------|-----------|
| `no-console` | Use `console.warn` / `console.error` only — no `console.log` |
| `prefer-const` | Use `const` unless the binding is reassigned |
| `no-var` | Never use `var` |
| `eqeqeq` | Use `===` / `!==`; `== null` is allowed for null/undefined checks |
| `object-shorthand` | `{ foo }` not `{ foo: foo }` |

### Style

| Rule | What to do |
|------|-----------|
| `semi` | Always end statements with `;` |
| `curly` | Always use `{}` for `if`/`else`/`for`/`while` bodies, even one-liners |
| `max-len` | Keep lines ≤ 100 characters; URLs and `eslint-disable` comments are exempt |

### React (`.tsx` files)

| Rule | What to do |
|------|-----------|
| `jsx-curly-brace-presence` | No unnecessary `{"…"}` around string props or children — use bare strings |
| `self-closing-comp` | Use `<Foo />` not `<Foo></Foo>` when there are no children |
| `jsx-boolean-value` | Write `<Foo disabled />` not `<Foo disabled={true} />` |
| `no-array-index-key` | Don't use array index as `key`; use a stable id |
| `no-danger` | Never use `dangerouslySetInnerHTML` |
| `react-hooks/rules-of-hooks` | Hooks only at the top level of a component or custom hook |
| `react-hooks/exhaustive-deps` | Include every value read inside `useEffect`/`useCallback`/`useMemo` in the dep array; add an `eslint-disable` comment with a reason if intentionally omitting a dep |

### Import sorting (`simple-import-sort`)

Imports must be in this order, with a blank line between each group:
1. Node built-ins (`path`, `fs`, …)
2. External packages (`react`, `next/…`, …)
3. Internal path aliases (`@/…`)
4. Relative imports (`../`, `./`)

Within each group, `import type` lines go above value imports, then sorted alphabetically.

---

## After every round of edits

Run:

```bash
pnpm lint --fix
```

If the output still shows unfixable errors after `--fix`, fix them manually before finishing.
