---
name: judgment-tracing-durable-workflows
description: Use when adding or auditing Judgment tracing for Temporal or another durable workflow engine, especially when work continues after an HTTP submit response or includes human approval, signals, timers, retries, separate workers, or long suspends. Covers restart-safe trace segmentation, workflow sessions, activities, retry visibility, and polling-noise exclusion.
---

# Judgment Tracing for Durable Workflows

Read
`references/durable-workflows-temporal.md`
completely before editing. Treat its completion gate as binding.

## Required model

- A short submit or approval request is its own trace; it cannot own worker
  activity that continues after the response.
- Split durable work at suspend/checkpoint boundaries. Group every trace for
  the interaction with the exact workflow ID as `judgment.session_id`.
- Prefer meaningful pre-suspend and post-suspend segment roots only when one
  component can reliably own, finalize, and export each whole segment.
- Otherwise use the documented fresh activity/execution-root fallback. It is a
  valid safe fallback—not the canonical segment model—when each root has
  faithful semantic input/output, correct session identity, useful children,
  and no malformed cross-process tree. Report the modeling limitation.
- Exclude or sample repeated status polling. Do not let Temporal transport or
  interceptor shells dominate the business story.

## Semantic root floor

Every workflow root must explain both what work it received and what that work
produced. Preserve a bounded application-owned semantic result such as the safe
plan items, executed step outcome, approval decision, synthesis summary, or
final artifact identity. `completed`, a step count, a word count, a hash, or a
path by itself is not faithful output when a richer business result exists.
Children add detail but do not repair a behavior-blind root.

If no approved policy can retain any useful semantic result, use safe metadata
and explicitly report the root as privacy-safe but incomplete. Do not call it
verified or complete.

## Non-negotiable implementation gates

1. Require an explicit project and propagate key, organization, project, and
   endpoint overrides into the producer and every exporting worker. Prove the
   real launcher rejects an explicitly empty project even when dotenv exists.
2. Keep workflow code replay-safe; do not call networked tracing APIs from
   deterministic workflow code.
3. Use a provider integration only after its installed-version capture
   controls pass. Do not store unapproved history, schemas, files, or secrets
   merely to obtain LLM metadata.
4. End and boundedly flush each worker-owned root from an outer `finally` path
   before the activity returns or rethrows. This applies to successful and
   failed attempts. Production may remain fail-open on telemetry; failed
   export blocks the tracing-verification claim, not the durable result.
5. If raw activity exceptions are not approved trace data, set a normalized
   semantic failure output/status inside the root and rethrow the original only
   after the observed scope ends.
6. Make retry attempts visible without double-instrumenting or duplicating the
   successful logical activity.

## Completion gate

Run a real workflow through submit, pre-approval work, approval, post-approval
work, retry, and worker restart. Inspect stored Judgment roots and prove:

- expected producer and durable-work roots arrived in the intended project;
- every root has faithful semantic input/output and a positive complete
  window;
- every trace uses the exact workflow ID as its session ID;
- the approval suspend creates a safe trace boundary;
- retry evidence is neither lost nor duplicated;
- business LLM/tool activity is legible and transport/poll noise does not
  dominate;
- raw payloads pass both benign-marker survival and secret/history/schema/file
  exclusion checks; and
- no root was acknowledged before its bounded export attempt completed.

Report the focused reference's table with `pass`, `fail`, `blocked`, or
`not-applicable` and one evidence class: static, synthetic, real application,
or stored Judgment. Missing evidence is `blocked`.
