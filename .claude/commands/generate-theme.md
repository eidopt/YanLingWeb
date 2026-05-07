---
description: Generate a complete UI theme pack for the layout editor. Usage: /generate-theme <theme concept>
---

You are generating a brand-new UI theme pack for the **ai-app layout editor**. A theme pack is a self-contained folder under `src/theme-packs/<theme-id>/` that plugs into the editor's `ThemeRuntime` system.

## Step 1 — Load UI/UX Pro Max Design Intelligence

Read all of the following files before writing any code:

**Rules & Guidelines:**
```
Read .claude/skills/ui-ux-pro-max.md
```

**Design Databases (read all four):**
```
Read .claude/skills/ui-ux-pro-max-data/products.csv
Read .claude/skills/ui-ux-pro-max-data/styles.csv
Read .claude/skills/ui-ux-pro-max-data/colors.csv
Read .claude/skills/ui-ux-pro-max-data/typography.csv
```

Apply the 10-tier priority rules throughout all design decisions:
1. **CRITICAL** — Accessibility (contrast 4.5:1, focus rings, aria-labels)
2. **CRITICAL** — Touch targets (min 44×44px, 8px gaps, tap feedback)
3. **HIGH** — Performance (transform animations only, no layout thrash)
4. **HIGH** — Style Selection (cohesive style, SVG icons not emoji)
5. **HIGH** — Layout & Responsive (mobile-first, no horizontal scroll)
6. **MEDIUM** — Typography & Color (16px base, 1.5 line-height, semantic tokens)
7. **MEDIUM** — Animation (150–300ms, ease-out enter / ease-in exit)
8. **MEDIUM** — Forms & Feedback (visible labels, error recovery)
9. **HIGH** — Navigation (bottom nav ≤5 items, predictable back, deep links)
10. **LOW** — Charts (accessible colors, always show legend)

## Step 2 — Research & Decide Design System

The user's request: **$ARGUMENTS**

Using the CSV databases, perform the following lookups:

### 2a. Product Type → Style Recommendation
Search `products.csv` for the row whose `Keywords` column best matches the theme concept.
Extract: `Primary Style Recommendation`, `Secondary Styles`, `Color Palette Focus`, `Key Considerations`.

### 2b. Style → Visual Language
Find the recommended style(s) in `styles.csv`.
Extract: `Primary Colors`, `Secondary Colors`, `Effects & Animation`, `Best For`, `Do Not Use For`, `Implementation Checklist`, `Design System Variables`.

### 2c. Color Palette → Exact Hex Values
Find the closest matching `Product Type` row in `colors.csv`.
Extract all semantic color tokens: `Primary`, `Secondary`, `Accent`, `Background`, `Foreground`, `Card`, `Muted`, `Border`, `Ring`, plus the `Notes` field for rationale.

### 2d. Typography → Font Pairing
Find a pairing in `typography.csv` whose `Mood/Style Keywords` and `Best For` match the theme concept.
Extract: `Heading Font`, `Body Font`, `CSS Import`, `Notes`.

### 2e. Summarise your Design System choices
Before writing any code, output a short design system summary:
```
Product type match: <row from products.csv>
Style: <style name> — <why it fits>
Accent: <hex> (from colors.csv row "<Product Type>")
Color tokens: Primary <hex>, Background <hex>, Card <hex>, Muted <hex>, Border <hex>
Font pairing: <Heading Font> / <Body Font> — <why it fits>
Surface gradient: <derived from Background + tinted Primary>
Pages: <page1>, <page2>, <page3>
Components: <list of 6-8 component names>
```

Only proceed to Step 3 after completing this summary.

## Step 3 — Determine Theme Structure

From the design system summary, finalise:
- **Theme ID**: kebab-case identifier (e.g. `health-care`, `travel-guide`, `finance-dash`)
- **Theme name**: Chinese or English display name (e.g. `健康中心`)
- **Alias prefix**: 2-3 letter prefix for component aliases (e.g. `hlth-`, `trvl-`, `fin-`)
- **Accent color**: from colors.csv lookup above
- **CSS surface gradient**: derived from Background + tinted Primary in colors.csv
- **Pages**: 2–3 pages fitting the domain
- **Component set**: 6–8 components covering the UI needs

## Step 4 — File Structure to Create

You must create ALL of the following files:

```
src/theme-packs/<theme-id>/
  runtime.tsx
  layout.json
  <ThemeId>Theme.module.css
  <ThemeId>Showcase.tsx
  <ThemeId>Showcase.module.css
  <ThemeId>Showcase.content.ts
  components/
    index.ts
    <ThemePrefix>Text.tsx
    <ThemePrefix>Button.tsx
    <ThemePrefix><CardType>Card.tsx       (1-2 card variants suited to the domain)
    <ThemePrefix>BottomBar.tsx
    <ThemePrefix><OtherComponent>.tsx     (2-3 more domain-specific components)
    <ThemePrefix>Primitives.module.css
    <ThemePrefix>Text.content.ts          (if needed)
    <ThemePrefix>Button.content.ts        (if needed)
```

Then update:
```
src/theme-packs/index.ts                  (add new theme to themeCatalog)
```

## Step 5 — Implementation Contracts

### `runtime.tsx`

```typescript
import type { ElementType } from 'react';
import { /* all components */ } from './components';
import type { ThemeRuntime } from '../../core/renderer';

// Helper functions (copy from commerce or service theme):
function asString(value: unknown, fallback = '') { ... }
function asBoolean(value: unknown, fallback = false) { ... }
function asStringArray(value: unknown) { ... }
function asHandler(value: unknown) { ... }
function asTabHandler(value: unknown) { ... }

export const <camelCaseThemeId>Runtime: ThemeRuntime = {
  id: '<theme-id>',
  cssVars: {
    '--accent': '<accent-hex>',
    '--surface': 'linear-gradient(...)',
    '--surface-muted': 'rgba(...)',
    '--panel-bg': 'rgba(...)',
    '--panel-border': 'rgba(...)',
    '--panel-accent': 'rgba(...)',
    '--panel-accent-border': 'rgba(...)',
    '--search-bg': 'rgba(...)',
    '--note-bg': 'rgba(...)',
  },
  renderAlias(alias, props) {
    switch (alias) {
      case '<prefix>-text': return <ThemeText variant={...} as={...}>{...}</ThemeText>;
      case '<prefix>-button': return <ThemeButton ...>{...}</ThemeButton>;
      // ... all other aliases
      default: return null;
    }
  },
};
```

### `layout.json`

Follow this exact shape (TypeScript type: `ThemeLayoutDocumentSource`):

```json
{
  "version": 2,
  "themeId": "<theme-id>",
  "themeName": "<display name>",
  "description": "<one sentence describing the multi-page layout>",
  "defaultPageId": "<first-page-id>",
  "components": [
    // First: all core layout components (copy from commerce/layout.json):
    { "alias": "core.screen", "name": "PhoneScreen", "kind": "layout", "description": "...", "props": [...] },
    { "alias": "core.search", "name": "SearchBar", "kind": "layout", "description": "...", "props": [...] },
    { "alias": "core.notice", "name": "Notice", "kind": "layout", "description": "...", "props": [...] },
    { "alias": "core.panel", "name": "Panel", "kind": "layout", "description": "...", "props": [...] },
    { "alias": "core.stack", "name": "Stack", "kind": "layout", "description": "...", "props": [...] },
    { "alias": "core.row", "name": "Row", "kind": "layout", "description": "...", "props": [...] },
    { "alias": "core.grid", "name": "Grid", "kind": "layout", "description": "...", "props": [...] },
    // Then: all theme-specific components with full prop descriptors
    { "alias": "<prefix>-text", "name": "...", "kind": "component", "description": "...", "props": [...] },
    // ...
  ],
  "pages": [
    {
      "id": "<page-id>",
      "name": "<page display name>",
      "layout": {
        "id": "<page-id>-screen",
        "alias": "core.screen",
        "layout": { "mode": "flow", "width": "100%", "minHeight": "100%" },
        "props": { "title": "...", "statusTime": "9:41" },
        "children": [
          // Arrange real content using core.* layout + theme components
          // Every page must have a footer child with slot: "footer"
          // At least 2 pages must have navigation interactions (onClick → navigate)
        ]
      }
    }
    // 2-3 pages total
  ]
}
```

**Layout node rules:**
- Root node always uses `core.screen`
- All children have `"layout": { "mode": "flow", "order": <n>, "width": "100%" }` unless inside a grid (use `"mode": "grid"`)
- Bottom bar/nav always gets `"slot": "footer"` and `"layout": { "mode": "flow", "order": 1, "width": "100%" }`
- Navigation between pages uses `"interactions": { "onClick": { "type": "navigate", "targetPageId": "<id>" } }`
- Node IDs follow pattern: `<page-id>-<descriptive-name>` (all kebab-case)

### Component files (`components/<ThemePrefix>ComponentName.tsx`)

Each component must:
- Accept typed props with sensible defaults
- Use CSS Modules (import from `./ThemePrimitives.module.css` or its own `.module.css`)
- Apply accent color via CSS custom property `var(--accent)` — never hardcode the accent hex
- Have minimum 44px touch targets on interactive elements
- Use `cursor: pointer` on clickable elements
- Support `disabled` state with `opacity: 0.45` and `pointer-events: none`
- Support `loading` state on buttons (show spinner text, set `aria-busy`)
- Use `createElement` instead of JSX `<a>` to avoid `href` vs `button` type conflicts (see commerce/CommerceButton.tsx pattern)

### `<ThemePrefix>Primitives.module.css`

Define all component styles using CSS custom properties:
```css
/* Consume the runtime cssVars */
.button { background: var(--accent); ... }
.card { background: var(--panel-bg); border: 1px solid var(--panel-border); ... }
```

All interactive states:
- `:hover` — subtle transform translateY(-1px) or brightness
- `:active` — scale(0.97) feedback  
- `.disabled` — opacity: 0.45, pointer-events: none
- Focus rings: `outline: 2px solid var(--accent); outline-offset: 2px`

### `<ThemeId>Showcase.tsx`

A static demo of 4-8 representative components rendered side by side:
```typescript
import styles from './<ThemeId>Showcase.module.css';
export function <ThemeId>Showcase() {
  return (
    <div className={styles.showcase}>
      {/* Render 4-8 representative components */}
    </div>
  );
}
```

### Update `src/theme-packs/index.ts`

Add the new theme to `themeCatalog`:
```typescript
import { <ThemeId>Showcase } from './<theme-id>/<ThemeId>Showcase';
import <themeId>LayoutDocument from './<theme-id>/layout.json';
import { <camelCaseThemeId>Runtime } from './<theme-id>/runtime';

// In themeCatalog array:
{
  id: '<theme-id>',
  name: '<display name>',
  tagline: '<one-line description>',
  description: '<longer description>',
  accent: '<accent-hex>',
  traits: ['<trait1>', '<trait2>', '<trait3>'],
  ComponentShowcase: <ThemeId>Showcase,
  layoutDocument: normalizeThemeLayoutDocument(<themeId>LayoutDocument as ThemeLayoutDocumentSource),
  runtime: <camelCaseThemeId>Runtime,
},
```

## Step 6 — Quality Checklist

Before finishing, verify:
- [ ] All component aliases in `layout.json` are handled in `runtime.tsx` `renderAlias`
- [ ] All aliases referenced in `renderAlias` have a component descriptor in `layout.json`'s `components` array
- [ ] Every page in `layout.json` has a footer node with `"slot": "footer"`
- [ ] `defaultPageId` matches one of the `pages[].id` values
- [ ] `components/index.ts` exports all components
- [ ] `runtime.tsx` imports every component it uses
- [ ] `src/theme-packs/index.ts` imports and normalizes the new theme
- [ ] Accent color is defined only in `runtime.cssVars['--accent']` — components use `var(--accent)`
- [ ] All interactive elements have ≥44px touch target height
- [ ] Disabled state uses opacity ≤0.5 + pointer-events:none
- [ ] Focus rings present on all interactive elements

Now generate the complete theme pack for: **$ARGUMENTS**
