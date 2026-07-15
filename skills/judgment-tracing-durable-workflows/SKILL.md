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

Use Judgment's documented public span types/kinds. Producer/control-write roots
and durable activities that do not run an agent phase are `function` (or the
pinned SDK's named documented general equivalent). Only a durable root that
actually owns an agent phase is `agent`; merely containing one model call does
not make a control/activity root an agent. Real model children are `llm`, and
executed business-tool children are `tool`. Names do not establish kinds. Every
tracing operation the implementation actually calls must be fail-open and
independently fault-injected. Current-span lookup, rename, and a manual
kind/type setter are required subcases only when that call exists; do not add
one merely to satisfy the matrix. Private or underscored SDK APIs are forbidden
unless the exact dependency is pinned and a production-shaped executable
conformance test proves the call.

Record a checked-in launcher/deployment ledger for the producer and every
exporting worker. Positive, explicitly-empty, and same-type unique-unknown
routing controls must use those exact commands/services and env wiring. If the
real topology uses Compose, run the real checked-in Compose services and retain
the sanitized resolved config; a host-only producer or worker is not deployment
proof. Payload evidence is sanitized before serialization, with multiline
private-key and standalone `Bearer`/`Basic` removal ordered before greedy
composed rules, and capped at 1,500 UTF-8 bytes per stored IO attribute or a
lower documented destination limit.

## Completion rule

Do not claim completion from a build, interceptor setup, scratch span, or UI
waterfall. Run the production-style durable scenario, reconcile its recorded
events with settled raw Judgment roots, and report every recipe gate as
`pass`, `fail`, `blocked`, or genuinely `not-applicable`, with evidence class
`static`, `synthetic`, `real application`, or `stored Judgment`. Missing
evidence is `blocked`.

A Judgment Behavior, Judge, or Test counts as supplemental evidence only when
the exact inspectable result comes from this controlled run and is tied to its
trace IDs. Definitions, enabled configuration, and aggregate scores without
current-run trace-linked results do not count.
