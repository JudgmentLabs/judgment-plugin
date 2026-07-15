# Temporal and Durable Workflow Deep Reference

This file is optional. `durable-workflow-binding-recipe.md` is the only
implementation recipe. Read only the section named by `../SKILL.md` after its
condition is detected. These sections provide diagnostics and proof criteria,
not a second copyable adapter.

## Contents

- [Safe fallback](#safe-fallback-one-activity-or-execution-phase-per-trace)
- [Producer routes and polling](#producer-routes-and-polling)
- [Replay and retry safety](#replay-and-retry-safety)
- [Mandatory real-path verification](#mandatory-real-path-verification)
- [Completion gate](#completion-gate)

## Safe fallback: one activity or execution phase per trace

Use this section only when a pre/post-suspend segment has no single process that
can reliably own, finalize, and export it, an interceptor parent leaks into
worker activity, or a Python activity needs an outcome/flush design.

The safe fallback is one fresh trace per meaningful activity or restart-safe
execution phase, with every root grouped by the exact workflow ID. It is less
compact than segment traces but more truthful than an HTTP submission root with
late children or a span kept open across an indefinite wait.

Diagnose the boundary from raw data:

- The business activity must be the root of a fresh trace, not a child of
  `POST /jobs`, `StartWorkflow`, or `RunActivity`.
- Confirm the installed Judgeval version's fresh/fork semantics. A decorator or
  `fork` setting is not proof; record raw trace, span, and parent IDs.
- Set `judgment.session_id` only after the intended business root is active.
- Keep model/tool work inside that root and retain bounded semantic activity IO.
- A plan count, tool count, report path, or `completed` status cannot replace a
  safe plan, step-result, or synthesis summary.

Use one outcome boundary. Disable automatic root IO, guard trace-only writes,
record a normalized semantic error inside the root, and keep the original
exception only in memory. The observed business root ends before the outer
activity preserves the application's existing return/retry/rethrow behavior.
That same outer activity awaits bounded export in `finally` on success and
failure. Do not decorate the activity directly when that would make post-root
flush impossible, and do not add a second direct-decorator path.

Telemetry setters, sanitizers, classifiers, reporters, root end, and flush
reporting must remain fail-open. They cannot invent durable failure state,
suppress retries, repeat side effects, or replace the real exception. Flush
failure blocks tracing verification without changing the durable outcome.

## Producer routes and polling

Use this section when real submit/approval routes export zero roots, request
tasks do not see the initialized tracer, or HTTP/polling noise dominates.

Trace short producer writes separately:

- submission: bounded goal/requester input and workflow ID/accepted output;
- approval/signal: workflow ID plus bounded decision and acknowledgement; and
- cancellation/retry control: a separate trace only when operationally useful.

Every related producer root uses the workflow ID as its session. Status, health,
and high-frequency read routes are excluded or sampled outside the agent signal.

For FastAPI/Starlette with Judgeval versions that store the active tracer in a
context variable, lifespan initialization may not activate request-task
contexts. Initialize after environment loading but before the server creates
request tasks, or retain the tracer and activate it at each request/consumer
entrypoint using the installed API. Prove activation with one real submission
and approval in Judgment; worker roots do not prove producer activation.

Forward key, organization, explicit project, and endpoint overrides into the
producer and every exporting worker. Test each real launcher with the project
explicitly empty under a 30-second bound and guaranteed cleanup. It must fail
before readiness with the expected error even when dotenv exists. `unset`, a
timeout, continued serving, or unrelated failure does not pass.

## Replay and retry safety

Use this section when attempts are missing, duplicated, or malformed.

Temporal workflow code is deterministic and replayed. Keep network export,
random identifiers, wall-clock reads, tracer initialization, and direct span
lifecycle work out of workflow code unless the installed integration explicitly
guarantees replay safety. Prefer producer handlers, activity entrypoints,
activity LLM/tool calls, worker lifecycle hooks, and a proven persisted carrier.

Record the activity attempt and normalized outcome. A failed attempt and later
success can both be useful, but workflow replay and double instrumentation must
not create indistinguishable duplicates. A killed attempt must not look like a
successful zero-duration trace. Reconcile stored roots to the workflow's own
attempt/event record rather than inferring retries from span names.

## Mandatory real-path verification

Use a production-style workflow, not a tool-only smoke:

1. Start a job and record the exact workflow ID.
2. Complete pre-suspend work.
3. Restart/kill an activity worker during an attempt when retry exists.
4. Send the real approval/signal or trigger the real timer.
5. Restart the workflow worker while suspended when supported.
6. Complete post-suspend work.
7. Wait for ingestion, query the exact workflow session, and inspect raw spans.

Reconcile recorded application events with every meaningful root. Require final
semantic IO, exact session identity, complete child windows, fresh parentage,
visible nonduplicated attempts, useful LLM/tools, producer writes, acceptable
business-to-noise density, and raw payload safety. Missing runtime support is
`blocked`; it is not replaced by a scratch span or interceptor claim.

## Completion gate

Use `not-applicable` only when the architecture genuinely lacks a gate. Missing
evidence is `blocked`; stubs and scratch spans are synthetic.

| Gate | Result | Evidence class | Exact evidence |
| --- | --- | --- | --- |
| Workflow model | <result> | static | Files naming the stable workflow ID, durable checkpoints, and chosen trace units |
| Explicit routing negative | <result> | real application | Exact explicit-empty launcher command for each exporter, nonzero exit, and expected error |
| Request separation | <result> | stored Judgment | Submit/approve trace IDs distinct from durable-work trace IDs |
| Producer activation | <result> | stored Judgment | Real submit and approval trace IDs in the intended project; worker roots alone do not pass |
| Fresh activity roots | <result> | stored Judgment | Raw trace/span/parent IDs proving roots are distinct from submit and not interceptor children |
| Root lifetime | <result> | stored Judgment | Raw start/end arithmetic for every root and child |
| Session placement | <result> | stored Judgment | Exact workflow ID on every meaningful root |
| Suspend boundary | <result> | stored Judgment | Pre/post-suspend trace IDs and approval/timer/signal event |
| Worker coverage | <result> | stored Judgment | Producer and every exporting worker's expected trace IDs |
| Retry/replay | <result> | stored Judgment | Recorded attempts reconciled to labeled roots without duplicates |
| Signal density | <result> | stored Judgment | Business-root count versus Temporal/HTTP/poll-root count |
| Payload safety and usefulness | <result> | stored Judgment | Named mode, benign/canary raw search, bounds, parseable structured IO, and inspected attribute set |
| Export lifecycle | <result> | stored Judgment | Last completed pre-kill and first post-restart trace IDs after bounded flush |
| Real workflow behavior | <result> | real application | Events/results covering submit, suspend/approval, retry, restart, and completion |
| Stored scenario proof | <result> | stored Judgment | Project, workflow session, trace IDs, and reconciliation to recorded events/results |
