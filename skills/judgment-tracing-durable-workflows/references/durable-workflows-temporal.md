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
This includes active-span lookup, rename, and documented span-type/kind writes
when the implementation actually calls them: keep each present operation
inside its own fail-open guard and fault-inject it independently. Do not add a
rename or manual kind setter merely to satisfy a test matrix; an absent call is
genuinely `not-applicable`.
Use only public APIs from the pinned installed SDK; private/underscored calls
require their own production-shaped executable conformance proof or remain
forbidden.

## Producer routes and polling

Use this section when real submit/approval routes export zero roots, request
tasks do not see the initialized tracer, or HTTP/polling noise dominates.

Trace short producer writes separately:

- submission: bounded goal/requester input and workflow ID/accepted output;
- approval/signal: workflow ID plus bounded decision and acknowledgement; and
- cancellation/retry control: a separate trace only when operationally useful.

These producer/control traces are Judgment `function` roots (or the pinned
SDK's named documented general equivalent), not `agent` roots. Likewise, use
`function` for a durable activity that does not actually run an agent phase.
Reserve `agent` for a durable root that actually owns an agent phase; one
contained model call alone does not make the root an agent. Use `llm` for a real
model call and `tool` for an executed business tool.

Every related producer root uses the workflow ID as its session. Status, health,
and high-frequency read routes are excluded or sampled outside the agent signal.

For FastAPI/Starlette with Judgeval versions that store the active tracer in a
context variable, lifespan initialization may not activate request-task
contexts. Initialize after environment loading but before the server creates
request tasks, or retain the tracer and activate it at each request/consumer
entrypoint using the installed API. Prove activation with one real submission
and approval in Judgment; worker roots do not prove producer activation.

Forward key, organization, explicit project, deployment-provided project ID
when present, and endpoint overrides into the producer and every exporting
worker. Before each process becomes ready, require a resolved project identity
and compare it with that expected ID when available. Otherwise, a uniquely named
positive-control probe must settle in the exact intended project. Test every real launcher with the
project explicitly empty and with a unique unknown name or ID of the type it
accepts under a 30-second bound and guaranteed cleanup. Both must fail before
readiness with the expected routing error, create nothing, and still fail when
dotenv exists. A valid-target positive control must start. `unset`, a timeout,
continued serving, a nonempty resolved ID alone, or unrelated failure does not
pass.

Record the checked-in producer/worker launcher ledger before these controls. If
Compose owns deployment, name the checked-in Compose file and every exporting
service, retain a sanitized resolved `docker compose ... config`, and run the
valid/empty/unknown cases through those exact services. A host-only FastAPI,
worker, or script launch can diagnose behavior but cannot pass this gate.

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

Require raw `span_kind=function` (or the pinned SDK's named documented general
equivalent) for producer/control and non-agent durable roots,
`span_kind=agent` only for actual agent-phase roots, `span_kind=llm` for real
model calls, and `span_kind=tool` for executed business tools. Require every
serialized Judgment IO attribute to be at most 1,500 UTF-8 bytes (or a lower
documented destination limit) and parseable after reduction.
The canary matrix must include standalone Bearer/Basic values and a multiline
private-key block; redact the full key block and standalone auth tokens before
greedy composed-text rules while preserving adjacent benign markers. A
Behavior, Judge, or Test counts only when an inspectable result from this exact
run is linked to one of these trace IDs.

## Completion gate

Use `not-applicable` only when the architecture genuinely lacks a gate. Missing
evidence is `blocked`; stubs and scratch spans are synthetic.

| Gate | Result | Evidence class | Exact evidence |
| --- | --- | --- | --- |
| Workflow model | <result> | static | Files naming the stable workflow ID, durable checkpoints, and chosen trace units |
| Dependency integrity | <result> | static | Pre/post manifest and lockfile hashes/diff, frozen-lock install, and unchanged unrelated workflow/server/provider versions |
| Checked-in launcher/deployment ledger | <result> | static + real application | Checked-in path/hash, exact producer/worker command or Compose file/services, sanitized resolved config/env wiring, readiness, cleanup, and same-topology positive/empty/unknown controls; no host-only substitute |
| Routing startup and negatives | <result> | real application | Valid-target positive startup plus empty and unknown name/ID commands for each exporter with expected errors/no readiness/no creation |
| Exact stored destination | <result> | stored Judgment | Named settled producer and worker trace/probe IDs in the exact intended project, with resolved-ID equality or read-only resolution recorded for each exporter |
| Request separation | <result> | stored Judgment | Submit/approve trace IDs distinct from durable-work trace IDs |
| Producer activation | <result> | stored Judgment | Real submit and approval trace IDs in the intended project; worker roots alone do not pass |
| Fresh activity roots | <result> | stored Judgment | Raw trace/span/parent IDs proving roots are distinct from submit and not interceptor children |
| Strict root/child lifetime | <result> | stored Judgment | Complete parent trees, evidence-derived timestamp precision, start/end margins for every root, and repeats for within-precision negatives |
| Session placement | <result> | stored Judgment | Exact workflow ID on every meaningful root |
| Suspend boundary | <result> | stored Judgment | Pre/post-suspend trace IDs and approval/timer/signal event |
| Worker coverage | <result> | stored Judgment | Producer and every exporting worker's expected trace IDs |
| Judgment span kinds | <result> | stored Judgment | Raw producer/control and non-agent durable roots `span_kind=function` (or named documented general equivalent), actual agent-phase roots `span_kind=agent`, real model children `span_kind=llm`, and executed tool children `span_kind=tool`, set through documented public APIs |
| Retry/replay | <result> | stored Judgment | Recorded attempts reconciled to labeled roots without duplicates |
| Error/output status parity | <result> | stored Judgment | Every unrecovered producer/activity/LLM/tool failure has matching fixed safe output and raw `ERROR` status; recovered/later-success outcomes remain truthful |
| Signal density | <result> | stored Judgment | Business-root count versus Temporal/HTTP/poll-root count |
| Payload safety and usefulness | <result> | stored Judgment | Named mode/order, standalone Bearer/Basic and multiline-private-key fixtures, benign/canary raw search, each serialized IO attribute <=1,500 UTF-8 bytes or lower destination cap, parseable structured IO, and inspected attribute set |
| Export lifecycle | <result> | stored Judgment | Root ended before awaited bounded flush; last completed pre-kill and first post-restart trace IDs survived |
| Ingestion settlement | <result> | stored Judgment | Post-flush raw-read timestamps and stable producer/worker span-set hashes across the named interval; complete unchanged trees and terminal IO/status |
| Test-export isolation | <result> | stored Judgment | Exact non-live commands/time window and named live-probe ledger; zero unit/stub/fake/build/typecheck/import/smoke/dev/static-generation roots |
| Runtime telemetry fail-open (one result per applicable subcase) | <result> | real application | Separate producer and activity/segment scope start/enter/exit, IO/attribute/status setter, sanitizer/classifier, finalizer, reporter, and flush throw/rejection/timeout injections; active-span lookup, rename, and manual span-type/kind setter only when those calls exist; durable path once and unchanged; absent operations are `not-applicable` |
| Public SDK surface | <result> | static + real application | Pinned installed public API references and executable proof for span operations; no private/underscored call without its own pinned production-shaped conformance test |
| Real workflow behavior | <result> | real application | Events/results covering submit, suspend/approval, retry, restart, and completion |
| Stored scenario proof | <result> | stored Judgment | Project, workflow session, trace IDs, and reconciliation to recorded events/results |
| Behavior/Judge/Test results (when cited) | <result> | stored Judgment | Exact inspectable current-run result IDs linked to producer/activity trace IDs; definitions/configuration/aggregate scores alone do not count |
