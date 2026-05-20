---
name: indie-web-frontend-builder
description: Frontend implementation for websites and web apps. Use when Codex needs to build or modify React, Vue, Svelte, Angular, Next.js, static HTML/CSS/JS, Tailwind, component libraries, landing pages, dashboards, forms, responsive layouts, frontend API integration, accessibility, performance, or visual polish.
---

# Indie Web Frontend Builder

## Overview

Use this skill to implement frontend work with responsive, accessible, performant code that fits the existing project. Optimize for a working user journey first, then polish the states users will actually see.

This skill adapts and merges the Agency roles Frontend Developer, Rapid Prototyper, Senior Developer, UX Architect, Accessibility Auditor, and Performance Benchmarker.

## Workflow

1. **Inspect the local stack**
   - Read package manifests, route files, component folders, styling config, test setup, and existing design primitives.
   - Use existing components and helpers before adding new abstractions or dependencies.

2. **Plan the change surface**
   - Identify pages, components, hooks/stores, API clients, styles, assets, and tests likely affected.
   - For visible UI, consider mobile, desktop, loading, empty, error, disabled, and success states before editing.

3. **Implement the core journey**
   - Build semantic structure and data flow first.
   - Integrate API contracts with explicit error handling.
   - Preserve local patterns for state, routing, styling, form handling, and notifications.

4. **Make it usable**
   - Add labels, focus states, keyboard behavior, accessible names, landmarks, alt text, and reduced-motion handling where relevant.
   - Ensure text does not overflow containers on mobile or desktop.
   - Use stable layout dimensions for grids, boards, cards, media, and toolbars.

5. **Optimize**
   - Avoid large client bundles, unnecessary re-renders, blocking scripts, unoptimized images, and layout shifts.
   - Use lazy loading/code splitting when it is supported by the local framework.

6. **Verify**
   - Run targeted tests, lint/typecheck/build where available.
   - For substantial UI, run a dev server and inspect screenshots or the rendered page when feasible.
   - Check console errors, responsive breakpoints, and keyboard navigation.

## Frontend Rules

- Follow the existing design system before inventing a new one.
- Prefer semantic HTML and native controls before custom ARIA widgets.
- Shared UI components must be backed by a common CSS token layer before broad use. That layer should define a 12-column grid, a single `baseUnit` scale (usually `8px`), approved color, padding, margin, gap, shadow, viewport breakpoint, font-size, font-weight, and border-radius values.
- Component CSS should choose from the approved token set instead of using free-form visual values. Colors, spacing, shadows, typography, radii, grid behavior, and breakpoints should be constrained to documented options.
- For `px` dimensions inside shared components, derive values from `baseUnit` through tokens or calculations such as `calc(var(--base-unit) * n)`. Avoid arbitrary `px` values except for `0`, `1px` hairlines/borders, and intrinsic external asset dimensions when unavoidable.
- Avoid `rem` for component sizing and spacing unless the existing project scale explicitly requires it. Prefer project tokens and `baseUnit`-derived values so components stay visually consistent.
- For shared/system UI primitives such as `Text`, `Heading`, `Button`, `Box`, `Container`, `Stack`, `Inline`, and `Grid`, define narrow, explicit prop APIs instead of freely extending all native HTML attributes.
- Shared text and action primitives must not expose `className` or `style` for visual customization. Use finite props such as `variant`, `size`, `weight`, `align`, `truncate`, `fullWidth`, or `disabled` so typography, color, spacing, and button treatments remain system-controlled.
- Layout primitives may accept `className` only when their purpose is structural composition, and should still restrict `as`, spacing, alignment, wrapping, and sizing to documented options. Do not use layout primitives as unlimited `div` pass-throughs.
- Allow native pass-through only for clearly necessary behavior and accessibility: `id`, `role`, `aria-*`, `data-*`, `ref`, event handlers needed by the component's purpose, and form attributes on form controls.
- When a one-off visual style is needed, add or extend a named system variant after checking reuse, rather than attaching ad hoc CSS to a shared primitive at the call site.
- Use only the project's standardized viewport breakpoint scale. Do not introduce free-form `@media` viewport values such as one-off `520px`, `860px`, or `1180px`.
- When the project provides viewport aliases or custom media in its theme library, every component media query must reference those names, for example `@media (--app-viewport-tablet)`, instead of writing raw viewport widths.
- Keep raw viewport breakpoint values defined in the theme library only. If the build pipeline needs browser-compatible output, add a transformer that resolves those aliases from the theme library instead of duplicating values in component CSS.
- When the project defines breakpoint tokens, document and reuse that exact scale. If CSS media queries cannot consume the token names directly, use the exact token values only inside the theme/build layer and keep them aligned with the documented scale.
- When migrating existing responsive styles, map every free-form viewport breakpoint to the nearest approved breakpoint instead of preserving the old value.
- Do not hide critical information behind hover-only interactions.
- Do not add a landing page when the user asked for an app or tool experience.
- For SaaS/admin/work tools, keep the UI dense, calm, and scannable.
- For marketing pages, make the offer obvious above the fold and include real content, not placeholder filler.
- Add dependencies only when they materially reduce implementation risk or match project conventions.

## Implementation Checklist

```markdown
## Frontend Checklist
- [ ] Uses existing framework/component conventions
- [ ] Shared UI components use the project token layer: 12-column grid, `baseUnit`, colors, spacing, shadows, breakpoints, typography, weights, and radii
- [ ] Component CSS avoids arbitrary `px`/`rem` values and uses tokens or `baseUnit` calculations where dimensions are needed
- [ ] Shared UI primitives use finite, documented props instead of unrestricted HTML prop inheritance
- [ ] Text, heading, and button styling is controlled by variants/sizes, not call-site `className` or `style`
- [ ] Responsive at mobile, tablet, desktop widths using only the approved project breakpoint scale
- [ ] Loading, empty, error, and success states handled
- [ ] Keyboard navigation works for interactive elements
- [ ] Forms have labels, validation, and useful errors
- [ ] No visible text overflow or incoherent overlap
- [ ] Images/assets have dimensions and alt text intent
- [ ] Console is free of new errors
- [ ] Tests/build/typecheck run or limitation documented
```

## Common Patterns

- **Landing page**: hero, value proof, problem, solution, social proof, pricing or offer, FAQ, final CTA, SEO metadata, structured data when appropriate.
- **Dashboard**: navigation, filters, summary metrics, primary table/list, detail panel, empty states, export/action affordances, permission-aware controls.
- **Form flow**: explicit labels, progressive disclosure, inline validation, submit progress, success state, recoverable errors, no data loss on failure.
- **Realtime UI**: connection status, optimistic updates with rollback, conflict messaging, stale-state handling, and reconnection behavior.

## Handoff Summary

When finishing, state:

- Files changed and why
- User-visible behavior
- Verification run and results
- Known limitations or follow-up tasks

## Source Basis

Adapted from MIT-licensed ideas in `msitarzewski/agency-agents` by AgentLand Contributors, filtered for frontend web implementation.
