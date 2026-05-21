# Agent cache-hit regression log

This document records cache-hit optimization attempts that were rejected because
the verified live cache-hit rate dropped versus the previous baseline.

## 2026-05-21 - Early finish after successful editor tool

- Change: made successful editor tool execution return `action: "done"` so
  `QueryLoop` would stop immediately after applying the edit.
- Goal: reduce extra post-tool model calls and lower per-scenario latency/cost.
- Previous baseline: live 10/10 passed, cache hit rate 94.4%
  (`hit=1138176`, `miss=67538`).
- Result: live 10/10 passed, cache hit rate 83.3%
  (`hit=141568`, `miss=28324`).
- Reason rejected: fewer total prompt tokens reduced the cacheable prefix enough
  that the reported cache-hit rate fell sharply under the 95% target.
- Action: reverted editor tool `action: "done"` usage and removed the
  `QueryLoop` early-finish branch.

## 2026-05-21 - Drop DeepSeek reasoning content from provider log

- Change: stopped persisting `reasoning_content` in provider logs and removed it
  from replayed provider messages.
- Goal: remove volatile model-generated text from the cached conversation prefix.
- Previous baseline: live 10/10 passed, cache hit rate 94.4%
  (`hit=1138176`, `miss=67538`).
- Result A, combined with early finish: live 10/10 passed, cache hit rate 81.2%
  (`hit=134784`, `miss=31176`).
- Result B, without early finish: live 0/10 passed, cache hit rate 82.6%
  (`hit=137856`, `miss=28995`).
- Reason rejected: removing reasoning content broke the provider replay shape for
  tool-call conversations and still reduced measured cache-hit rate.
- Action: restored `reasoningContent` capture, normalization, and provider-log
  replay.
