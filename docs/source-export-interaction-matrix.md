# Source Export Interaction Matrix

Document status: Live capability matrix.

Last updated: 2026-05-29

Use this file to decide what React source export preserves today, what is
intentionally degraded, and what still needs implementation, including the
current boundary for cross-component workflows, async data, and app-specific
launch triggers. The async-data implementation contract is in
`docs/source-export-async-data-design.md`. The executable baseline remains
`pnpm test:source-export`; this document records the product capability boundary
behind that smoke test.

## Evidence

- `src/exporters/react-source/compileNode.ts` maps supported ThemeLayout nodes
  to generated JSX and generated local interactive components.
- `src/exporters/react-source/templates/components.ts` emits
  `InteractiveTabs`, `InteractiveCarousel`, `InteractivePagination`,
  `InteractiveForm`, `InteractiveDialog`, `InteractiveDrawer`,
  `InteractiveAlert`, `InteractiveSwitch`, `InteractiveRate`, and
  `AsyncDataBoundary`.
- `src/exporters/react-source/templates/data.ts` emits generated static data
  definitions, selector helpers, record-array readers, and the async data hook.
- `scripts/source-export-fixture.cjs` exercises the interaction fixture.
- `scripts/source-export-smoke.cjs` asserts generated component files,
  navigation handlers, async data helpers, and unsafe style filtering.

## Supported

| Capability                                 | Export behavior                                                                                                                            | Smoke evidence                                                                                        |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `core.widget`                              | Emits `StaticWidget`; supported widget metadata and data are preserved as static preview content. Third-party widget code is not executed. | `StaticWidget.tsx` and page usage are asserted.                                                       |
| `core.tabs`                                | Emits `InteractiveTabs`; non-navigation tabs switch local active state and navigation tabs call `onNavigate`.                              | `InteractiveTabs.tsx`, page imports, state setter, and navigation target handling are asserted.       |
| `core.carousel`                            | Emits `InteractiveCarousel`; previous/next controls update local active slide state.                                                       | `InteractiveCarousel.tsx` and page usage are asserted.                                                |
| `core.pagination`                          | Emits `InteractivePagination`; page buttons update local current page state and mark the active page.                                      | `InteractivePagination.tsx`, page usage, and `aria-current` behavior are asserted.                    |
| `core.form`                                | Emits `InteractiveForm`; submit calls `preventDefault()` and shows a local submitted state.                                                | `InteractiveForm.tsx`, page usage, and submit handling are asserted.                                  |
| `core.dialog`                              | Emits `InteractiveDialog`; initial visibility and local cancel/confirm close state are preserved.                                          | `InteractiveDialog.tsx` and page usage are asserted.                                                  |
| `core.drawer`                              | Emits `InteractiveDrawer`; initial visibility and local close state are preserved.                                                         | `InteractiveDrawer.tsx` and page usage are asserted.                                                  |
| Simple cross-component visibility triggers | `interactions.onClick` can use `setVisibility` or `toggleVisibility` to control a target `core.dialog` or `core.drawer` from another node. | Fixture buttons open a separate dialog and toggle a separate drawer; smoke asserts page state wiring. |
| Closable `core.alert`                      | Emits `InteractiveAlert`; close action hides the alert locally.                                                                            | `InteractiveAlert.tsx` and page usage are asserted.                                                   |
| `core.checkbox` and `core.radio`           | Emits uncontrolled inputs with `defaultChecked` so exported controls remain mutable.                                                       | Fixture output is covered by `pnpm test:source-export`.                                               |
| `core.switch`                              | Emits `InteractiveSwitch`; click toggles local checked state with switch ARIA.                                                             | `InteractiveSwitch.tsx` and page usage are asserted.                                                  |
| `core.rate`                                | Emits `InteractiveRate`; click updates local rating with radio-group semantics.                                                            | `InteractiveRate.tsx` and page usage are asserted.                                                    |
| `core.screen` status/header actions        | Emits buttons that preserve `onStatusClick` and `onActionClick` navigation handlers.                                                       | Fixture includes both handlers and smoke verifies navigation output.                                  |
| `core.empty` action                        | Emits a button that preserves `onActionClick` navigation.                                                                                  | Fixture includes the handler and smoke verifies navigation output.                                    |
| Async data                                 | Emits `src/data/dataSources.ts`, `src/data/useExportedData.ts`, and `AsyncDataBoundary` for `staticJson` and public JSON endpoint sources. | Fixture binds static JSON to `core.table` and endpoint fallback data to `core.widget`.                |
| `core.table` data binding                  | Binds selected record arrays to configured table columns through generated safe display readers.                                           | Smoke asserts `fixture-table-source`, `asRecordArray(data).map`, and `readDisplayValue`.              |
| `core.widget` data binding                 | Binds selected or fetched data to the static widget preview `data` prop, with loading/error/empty UI around the preview.                   | Smoke asserts `fixture-widget-source`, generated `data={data}`, and fallback data in the build.       |
| Generic `interactions.onClick` navigation  | Supported nodes emit `onClick` navigation attributes when a navigate action is configured.                                                 | Covered through fixture navigation assertions.                                                        |
| Unsafe style values                        | `javascript:`, `data:text/html`, CSS expressions, and nested `url()` style values are dropped.                                             | Smoke asserts the generated page does not include `javascript:alert`.                                 |
| Unknown/unsupported nodes                  | Emits `UnsupportedNode` instead of silently pretending support.                                                                            | `UnsupportedNode.tsx` is asserted.                                                                    |

## Degraded

| Capability             | Current degradation                                                                                                                         | Why                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Widgets                | Widgets export as static previews only.                                                                                                     | Source export must not execute arbitrary third-party widget runtime code.                      |
| Generated interactions | Generated components keep local state inside each exported component, except simple page-level visibility state for dialog/drawer triggers. | The source exporter does not synthesize a broad global state machine.                          |
| Async data             | Only `staticJson` and unauthenticated public JSON endpoints are generated; endpoint failures fall back to generated error/fallback UI.      | Authenticated APIs, mutations, cache invalidation, polling, and realtime are product-specific. |
| Navigation             | Navigation handlers call exported `onNavigate` targets; they do not recreate the full hosted router shell.                                  | Exported React projects are independent source packages.                                       |
| Forms                  | Submit state is local and illustrative.                                                                                                     | Backend endpoint wiring, validation schemas, and async persistence are app-specific.           |

## Unsupported

| Capability                          | Gap                                                                                                                                                                                                                                                |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rich cross-component workflows      | Simple button-to-dialog/drawer visibility triggers are supported; richer workflows such as tab selection updating charts or chained component state are not synthesized.                                                                           |
| Broader async data                  | First-batch `staticJson`/public JSON endpoint bindings are supported for `core.table`, `core.list`, and `core.widget`; authenticated APIs, mutations, polling, realtime, cache invalidation, and app data-layer reconstruction remain unsupported. |
| App-specific launch triggers        | Product-specific flows such as auth prompts, checkout, publish, AI generation, and workspace navigation are not reconstructed in exported source.                                                                                                  |
| Arbitrary custom runtime components | Unknown component types fall back to `UnsupportedNode`; only known core aliases and safe static previews are exported.                                                                                                                             |
| Persisted exported state            | Local interaction state is not persisted to localStorage, URL state, or a generated store.                                                                                                                                                         |

## Next Implementation Batch

1. Expand the cross-component action model only when a concrete generated-state
   contract is documented, for example tab/chart coupling or multi-step flows.
2. Decide whether `core.list` needs richer item-template binding beyond the
   current simple title/name/description/note record mapping.
3. Keep app-specific launch triggers explicit and conservative: either emit a
   named placeholder handler or document the unsupported product boundary.
