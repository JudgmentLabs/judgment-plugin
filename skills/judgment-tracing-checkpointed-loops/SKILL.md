---
name: judgment-tracing-checkpointed-loops
description: Use when adding or auditing Judgment tracing for a long-running autonomous agent loop that durably saves iterations or checkpoints and resumes after process death. Covers one root per durable decision step, run sessions, compaction, model/tool children, background async-context detachment, per-step flush, and restart-instance evidence.
---

# Judgment Tracing for Checkpointed Agent Loops

Inspect the loop, checkpoint store, decision union, model/tool adapters,
start/resume entrypoints, restart mechanism, and launcher. Then read
`references/checkpointed-loop-binding-recipe.md` completely before the first
edit. It is the authoritative implementation contract.

Do not load the long reference by default. Read only the named section of
`references/checkpointed-agent-loops.md` when its condition is present:

- **TypeScript pattern** — the installed Judgeval function-wrapper API or
  exhaustive branch-summary boundary needs diagnosis.
- **Model and tool children** — provider metadata, active tool spans, or
  manual privacy-safe LLM evidence remains ambiguous after repository review.
- **Export lifecycle** — the SDK flush signature or post-root restart barrier
  is unclear or a completed pre-kill iteration is missing.
- **Mandatory real-path verification** and **Completion gate** — implementation
  is finished and the final evidence report is being assembled.

Never add a process-lifetime/run-segment root beside iteration roots merely for
hierarchy. The binding recipe's one-root-per-durable-iteration model wins.

Choose span kind from the work represented, not from the containing agent
architecture. A root that actually performs an agent decision/phase is
`agent`; orchestration, checkpoint/control, start/resume, and bookkeeping roots
are `function` (or the pinned SDK's named documented general equivalent). Real
model children are `llm`, and executed business tools are `tool`. Names do not
establish kinds. Put every tracing operation the implementation actually calls
in a fail-open guard and inject those faults independently.
Active-span lookup, rename, and a manual kind/type setter are required subcases
only when that call exists; do not add one merely to satisfy the matrix.
Private/underscored SDK APIs are forbidden unless the exact dependency is
pinned and a production-shaped executable conformance test proves the call.

Record the exact checked-in launcher/deployment ledger, including command or
Compose service, resolved env/project/endpoint wiring, readiness, and cleanup.
Use that same real topology for valid, explicitly-empty, and same-type
unique-unknown routing controls; a host-only launch cannot substitute when the
agent actually runs under Compose or another checked-in service. Sanitize before
serialization, remove multiline private keys and standalone `Bearer`/`Basic`
before greedy composed-text rules, and cap every stored IO attribute at 1,500
UTF-8 bytes or a lower documented destination limit.

## Completion rule

Do not claim completion from fake mode, a build, scratch spans, or graceful
shutdown. Reconcile persisted completed-iteration records with settled raw
Judgment roots after a real restart. Report every recipe gate as `pass`,
`fail`, `blocked`, or genuinely `not-applicable`, with evidence class `static`,
`synthetic`, `real application`, or `stored Judgment`. Missing evidence is
`blocked`.

A Judgment Behavior, Judge, or Test counts as supplemental evidence only when
its exact current-run result is inspectable and tied to this run's trace IDs.
Definitions, enabled configuration, and aggregate scores without trace-linked
recorded results do not count.
