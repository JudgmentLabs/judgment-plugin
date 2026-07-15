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

## Completion rule

Do not claim completion from fake mode, a build, scratch spans, or graceful
shutdown. Reconcile persisted completed-iteration records with settled raw
Judgment roots after a real restart. Report every recipe gate as `pass`,
`fail`, `blocked`, or genuinely `not-applicable`, with evidence class `static`,
`synthetic`, `real application`, or `stored Judgment`. Missing evidence is
`blocked`.
