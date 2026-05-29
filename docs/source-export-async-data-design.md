# Source Export Async Data Design

Document status: Accepted design; first implementation batch is in place.

Last updated: 2026-05-29

This document defines the first supported async-data contract for React source
export. It is intentionally conservative: exported projects must remain
standalone, buildable Vite apps with no hidden YanLingWeb backend dependency and
no browser-exposed secrets.

## Scope

The first implementation batch supports public read-only JSON data that can be
fetched safely by the generated browser app. It does not try to reconstruct
the hosted runtime data layer, authenticated product APIs, mutations, realtime
streams, or cache invalidation.

## ThemeLayout Contract

Add an optional `dataSources` array to `ThemeLayoutDocument`:

```ts
interface ThemeLayoutDataSource {
  id: string;
  kind: 'staticJson' | 'publicJsonEndpoint';
  description?: string;
  url?: string;
  data?: unknown;
  select?: string;
  fallback?: unknown;
}
```

Nodes can opt in through a narrow `props.dataBinding` object:

```ts
interface ThemeLayoutDataBinding {
  sourceId: string;
  select?: string;
  loadingText?: string;
  errorText?: string;
  emptyText?: string;
}
```

`select` is a dotted path selector such as `items` or `stats.revenue`. It must
not execute expressions. If both source and node define `select`, the node-level
selector wins.

## Supported Data Sources

| Kind                 | Meaning                                      | Export behavior                                                                                    |
| -------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `staticJson`         | Inline JSON snapshot stored in the document. | Emit the data into `src/data/dataSources.ts` and resolve synchronously through the generated hook. |
| `publicJsonEndpoint` | Public, unauthenticated JSON endpoint.       | Emit a generated fetcher using browser `fetch`, loading/error state, and optional fallback data.   |

Allowed endpoint URLs:

- Relative paths starting with `/`.
- `https://` URLs.

Rejected endpoint URLs:

- `http://`, `javascript:`, `data:`, credentials in URLs, and non-HTTP schemes.
- Any endpoint requiring API keys, cookies, OAuth, or user-specific auth.

## Generated Source Shape

When at least one data source exists, source export generates:

- `src/data/dataSources.ts`: static source definitions and safe selector helper.
- `src/data/useExportedData.ts`: a small React hook for load/error/data state.
- `src/components/AsyncDataBoundary.tsx`: shared loading/error/empty wrapper.

Bound nodes continue to render normal generated components, but receive resolved
data through explicit props. Shared validation rejects `dataBinding` on aliases
outside the supported target table; the exporter can still degrade unsupported
bindings when compiling unvalidated input.

## Initial Bound Node Targets

First batch targets:

| Node alias    | Binding behavior                                                                 |
| ------------- | -------------------------------------------------------------------------------- |
| `core.list`   | Bind selected array to repeated list item text fields when item shape is simple. |
| `core.table`  | Bind selected array of records to existing `columns` definitions.                |
| `core.widget` | Bind selected data to the existing static widget preview data prop.              |

Other aliases keep their static props until a specific binding contract is
documented.

## Loading, Empty, And Error UI

Generated async UI is visible and accessible:

- Loading: `role="status"` with `loadingText` or `Loading data...`.
- Error: `role="alert"` with `errorText` or `Unable to load data.`.
- Empty: normal text with `emptyText` or `No data available.`.

The generated app should not throw during render if a public endpoint fails,
returns non-JSON, or returns a shape that does not match the selected node.

## Validation Rules

Shared validation rejects:

- Duplicate `dataSources[].id`.
- `publicJsonEndpoint` without a valid safe URL.
- `staticJson` without JSON-serializable `data` or `fallback`.
- `dataBinding.sourceId` values that do not exist in `document.dataSources`.
- `dataBinding` on aliases not included in the supported target table, unless
  the exporter explicitly degrades it with a warning.

Use explicit guards/converters for unknown JSON; do not double-cast through
`unknown`.

## Verification Plan

`scripts/source-export-fixture.cjs` includes:

- One `staticJson` source bound to a `core.table`.
- One `publicJsonEndpoint` source bound to `core.widget` with fallback data.
- A generated public endpoint fallback path that builds without relying on
  network access during the smoke test.

`scripts/source-export-smoke.cjs` asserts:

- `src/data/dataSources.ts`, `src/data/useExportedData.ts`, and
  `src/components/AsyncDataBoundary.tsx` are emitted.
- Generated code contains no unsafe URL schemes.
- The generated project builds.
- Static JSON fallback text/data is present in built output.

## Non-Goals

- Authenticated product APIs.
- POST/PUT/DELETE mutations.
- Secret injection.
- Server-side rendering.
- Cache invalidation, polling, realtime, or optimistic updates.
- Reconstructing workspace navigation, checkout, publish, AI generation, or
  other app-specific launch triggers.
