---
name: website-ui
description: Website and responsive web app UI design skill for marketing sites, SaaS, dashboards, portals, and long-form web pages rendered through ThemeLayoutDocument JSON.
---

# Website UI

Use this skill when the user asks for a website, official site, landing page, SaaS page, web app, dashboard, portal, or desktop-oriented interface.

## Default Output

Generate `ThemeLayoutDocument` JSON for the project renderer. The page should feel like a web page, not a phone app preview.

## Platform Contract

- Set `platformCategories` to `["web"]`.
- Every page root remains `core.screen`.
- Page root props should include:
  - `surface: "web"`
  - `chrome: "none"`

## Design Rules

- Use responsive page sections, desktop-friendly grids, and mobile-safe stacking.
- For marketing sites, make the first viewport immediately communicate the brand/product, offer, CTA, and proof.
- For SaaS/admin tools, prioritize dense, scannable layouts, predictable navigation, filters, tables, and status summaries.
- Avoid phone status bars, mini-program capsule chrome, fixed 360px app shells, and bottom-tab-only navigation unless explicitly requested.
- Keep long pages scrollable; do not force all web content into a fixed-height mobile viewport.

## Schema Mapping

- Root: `core.screen` with web surface props
- Web page sections: `core.stack`, `core.panel`, `core.grid`, `core.row`
- Navigation: `core.navbar`, `core.sidebar`, `core.tabs`, `core.breadcrumb`
- CTAs: `core.button`, `core.notice`, `core.tag`
- Dashboards: `core.statistic`, `core.table`, `core.progress`, `core.widget` for approved charts
- Forms: `core.form`, `core.input`, `core.select`, `core.checkbox`, `core.button`

## Motion

Use CSS keyframes through `cssAnimations` for section reveal, CTA feedback, loading states, and subtle hero motion. For complex scroll timelines, parallax, 3D, or physics, generate the editable UI shell and mark the dynamic module need instead of writing arbitrary scripts.
