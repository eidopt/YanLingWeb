# SearchService Status

## Current Contract

`SearchService` is the frontend entry point for natural-language template search and creation intent routing. It calls the backend `POST /api/search` endpoint through the shared `HttpClient` and the unified `/api/proxy/search` BFF path.

The API contract is defined in `shared/types/search.types.ts` and is consumed by both `src/services/SearchService.ts` and `backend/src/search/search.service.ts`.

```ts
type SearchIntentResponse = SearchTemplatesResult | CreateWithAiResult;
```

## Modes

### `search_templates`

Returned when the backend classifies the query as browse/search intent.

```json
{
  "status": "ok",
  "mode": "search_templates",
  "query": "电商模板",
  "results": [],
  "total": 0
}
```

`HomeWorkspace` stores the submitted query and refreshes the marketplace list through `TemplateService`, so search results are shown in the normal template grid instead of a separate result page.

### `create_with_ai`

Returned when the backend classifies the query as creation intent.

```json
{
  "status": "ok",
  "mode": "create_with_ai",
  "query": "帮我做一个预约系统"
}
```

`HomeWorkspace` redirects this mode to `/editor?prompt=...&autoGenerate=true`. The backend no longer returns a blank `ThemeLayoutDocument` from `/api/search`; template generation belongs to the editor AI/template generation flow.

## Implementation Status

- [x] Backend `SearchModule`, controller, service, and authenticated `POST /api/search`.
- [x] Shared API types in `shared/types/search.types.ts`.
- [x] Frontend `SearchService.submit()` uses `HttpClient` and `/api/proxy/search`.
- [x] `HomeWorkspace` search box is wired to `SearchService`.
- [x] Creation intent redirects to the editor AI generation route.
- [x] Backend e2e coverage exists in `backend/src/search/search.e2e-spec.ts`.
- [ ] `TemplatesPage` still uses local template-list filtering. Wire it to `SearchService` only if product wants natural-language create/search intent there too.
