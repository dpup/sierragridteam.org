---
title: A silently-ignored query parameter served a quarter of the data under a label promising all of it
category: integration-bugs
module: mesh
date: 2026-09-02
last_updated: 2026-09-02
problem_type: integration_bug
component: data_feed
severity: high
related_components:
  - mesh_map
  - content_honesty
  - api_client
symptoms:
  - 'The /mesh map drew 114 corridor links and 40 nodes while the feed held 145 and 53 for the span the page said it was showing'
  - 'Every label on the page read "in the last 30 days" and "Heard in the last 30 days" while the data behind them covered 72 hours'
  - 'The request returned HTTP 200 with a well-formed body, so no client-side error, retry, or log line ever fired'
  - 'The response echoed `"window": "72h"` for a request that asked for `30d` — the only visible trace, and only on one of the three surfaces'
root_cause: silent_parameter_fallback
resolution_type: bug_fix
applies_when:
  - 'Sending an enum-ish or duration-ish value to an API whose parser has a default and no error path'
  - 'A UI label names a span, count, or scope that a query parameter is supposed to have selected'
  - 'Reusing one string as both the human label and the wire value for a request parameter'
tags:
  - api-contract
  - silent-failure
  - go-duration
  - data-honesty
  - the-grid
---

# A silently-ignored query parameter served a quarter of the data under a label promising all of it

## Context

`/mesh` reads one fixed window, `MESH_WINDOW`, and names it in copy: the legend says links
were "heard in the last 30 days", the tiles say "Relay pairs heard in the last 30 days", the
link popover reads `4 /30` days seen. The same constant was used for two jobs — the label
key **and** the `?window=` value sent to The Grid.

The Grid parses that parameter with Go's `time.ParseDuration`, which has **no day unit**, and
its parser has no error path:

```go
func parseMeshWindow(s string) time.Duration {
	if s == "" {
		return defaultMeshWindow // 72h
	}
	d, err := time.ParseDuration(s)
	if err != nil || d <= 0 {
		return defaultMeshWindow // ← `7d`, `30d`, `all`, and any typo land here
	}
	...
}
```

So `?window=30d` was not a rejected request. It was a 200, with a correct-looking body, for
a different question than the one asked — and the site had been shipping it since /mesh
launched. The map showed roughly a fifth fewer edges and a quarter fewer neighbouring nodes
than the corridor had actually been observed doing, under labels that promised a month.

## Why it survived so long

Every mechanism that would normally catch this was aimed elsewhere:

- **The response was valid.** Types checked, the graph built, the map rendered. There is no
  shape difference between 72 hours of links and 30 days of links.
- **The screenshot harness mocks the feed by path**, ignoring the query string, so the
  deterministic captures were identical either way and stayed identical after the fix. A
  visual regression suite cannot see a request it does not make.
- **The unit tests fed fixtures straight into the derivations**, which is the right shape for
  pure functions but never exercises the URL that fetched them.
- **The one honest signal was on a surface nobody read.** `/mesh/links` echoes
  `"window": "72h"`; the two `.geojson` layers echo nothing at all.
- **The docs asserted the wrong contract** (`window` accepts `24h` / `72h` / `7d` / `30d` /
  `all`), so the value looked correct to anyone checking.

It surfaced only because a member reported a different problem — repeaters missing from the
roster — and the investigation went to the live feed and the service source.

## Resolution

Split the label from the wire value. `MESH_WINDOW` stays the human key; `MESH_WINDOW_QUERY`
maps it to the duration the feed can actually parse, in hours, the widest unit Go accepts:

```ts
export const MESH_WINDOW_QUERY: Record<MeshWindow, string> = {
  '24h': '24h',
  '72h': '72h',
  '7d': '168h',
  '30d': '720h',
};
```

`all` was removed from `MeshWindow` outright — the feed has no such window, so the option
could only ever mean "quietly get 72 hours". The test pins every wire value to `^\d+h$` and
asserts it equals `MESH_WINDOW_DAYS × 24`, so a `7d` written into the table fails in CI
rather than on the page.

## Lessons

1. **A parameter with a default and no error path fails by lying, not by erroring.** Treat
   "does the server actually honour this value?" as a thing to verify once against the live
   endpoint, not to infer from a 200.
2. **Never reuse a display label as a wire value.** They answer to different authorities —
   one to the reader, one to a parser — and when they drift, the label keeps making a
   promise the data stopped keeping.
3. **Verify a request parameter against the response, not the render.** Ask the endpoint for
   two different windows and diff the payloads; had anyone done that once, the fallback was
   a five-second discovery.
4. **A mocked visual suite verifies the renderer, not the contract.** Path-matched mocks are
   blind to query strings by construction, so keep a live capture path (`LIVE=1`) covering
   every data-driven page.
