---
name: judgment-tracing-durable-workflows
description: Use when adding or auditing Judgment tracing for Temporal or another durable workflow engine, especially when work continues after an HTTP submit response or includes human approval, signals, timers, retries, separate workers, or long suspends. Covers restart-safe trace segmentation, workflow sessions, activities, retry visibility, and polling-noise exclusion.
---

# Judgment Tracing for Durable Workflows

First inspect the producer, workflow, activities, workers, retry policy,
signals/timers, and launcher. Then read
`references/durable-workflow-binding-recipe.md` completely before the first
edit. It is the authoritative implementation contract.

Do not load the long reference by default. Read only the named section of
`references/durable-workflows-temporal.md` when its condition is present:

- **Safe fallback: one activity or execution phase per trace** — a segment has
  no single owner, interceptor parentage leaks across processes, or the Python
  activity/outcome boundary needs diagnosis.
- **Producer routes and polling** — FastAPI/Starlette request tasks export zero
  producer roots or tracer activation differs across task contexts.
- **Replay and retry safety** — retry/replay creates missing, malformed, or
  duplicate attempts.
- **Mandatory real-path verification** and **Completion gate** — implementation
  is finished and the final evidence report is being assembled.

The binding recipe remains the only implementation path. Optional sections add
diagnostics and proof criteria, not another adapter.

## Completion rule

Do not claim completion from a build, interceptor setup, scratch span, or UI
waterfall. Run the production-style durable scenario, reconcile its recorded
events with settled raw Judgment roots, and report every recipe gate as
`pass`, `fail`, `blocked`, or genuinely `not-applicable`, with evidence class
`static`, `synthetic`, `real application`, or `stored Judgment`. Missing
evidence is `blocked`.
