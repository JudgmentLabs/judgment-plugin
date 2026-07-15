# Next.js AI SDK 5/6 Streaming Deep Reference

This file is optional. `nextjs-ai-sdk-v5-v6-binding-recipe.md` is the only
implementation recipe. Read only the section named by `../SKILL.md` after its
condition is detected. These sections provide diagnostics and proof criteria,
not a second copyable streaming adapter.

## Contents

- [Use one runtime](#use-one-judgeval-runtime-in-the-production-server-bundle)
- [Start a manually controlled root](#start-a-manually-controlled-active-root)
- [Finalize and flush](#finalize-after-the-framework-telemetry-span-then-flush)
- [Verify the real route](#verify-the-real-production-style-route)
- [Mandatory completion gate](#mandatory-completion-gate)

This reference applies only to Next.js Node runtime with Vercel AI SDK 5/6
`streamText` text responses. AI SDK 7 uses its version-specific integration.
Edge runtime, UI-message streams, WebSockets, and indefinite streams require a
different proven lifecycle and must not copy this design.

## Use one Judgeval runtime in the production server bundle

Use this section when the production route exports zero spans or runtime
duplication is suspected.

Next.js can compile the instrumentation hook and route into separate bundles.
One bundled Judgeval copy can initialize while another route-local copy remains
a no-op. A passing build and successful response do not detect this.

Diagnose the real production bundle:

- initialize once in the Node branch of the instrumentation hook before
  readiness/requests, using a delayed import that does not load Judgeval in an
  Edge pass;
- preserve all existing Next config while externalizing/deduplicating Judgeval;
- when application code already uses OpenTelemetry directly, prove one shared
  API/provider resolution without adding a duplicate dependency merely for a
  root span; and
- inspect generated server output, then run one real route whose application
  root and AI SDK children share a trace ID.

Forward key, organization, explicit project, deployment-provided project ID
when present, and endpoint overrides to the actual standalone/serverless
runtime. Compare the resolved runtime ID with that expected ID when available,
or keep the exact-routing gate blocked until a unique live
probe settles in the exact project. Test the built launcher with the project
explicitly empty and with a unique unknown name or ID of the type it accepts
under a 30-second supervisor and guaranteed cleanup. Both must exit with the
expected routing error before readiness, the unknown target must not be
created, and a valid-target positive control must start.

Record a deployment ledger naming the exact checked-in build/start command,
artifact, and runtime process, plus Compose files/services/profiles/env-file
when the selected production-style topology uses them. When that topology uses
Docker Compose, render the configuration with those exact inputs and prove every
required `JUDGMENT_*` variable is forwarded into the service. Run
the valid, explicitly empty, and same-type unknown-project controls through that
exact service. Directly starting `.next/standalone/server.js` on the host may
diagnose the built artifact, but cannot substitute for Compose deployment proof.
Retain only variable names and redacted presence/equality checks; do not store
rendered credentials as evidence.

Use public instrumentation APIs. An underscored/documented-private API is
blocked unless the exact dependency is lockfile-pinned and an executable test
exercises that API in the real production bundle and launcher.

## Start a manually controlled active root

Use this section when callback outcomes, persistence policy, active tool spans,
or error serialization remain unclear.

Create one business root after auth/request/session validation and before
`streamText` construction. Set exact session and available customer identity on
that active root. Disable uncontrolled AI SDK provider IO capture so history,
prompts, schemas, files, and raw payloads do not appear in secondary fields.

Use one fail-open outcome owner. Guard setters, sanitizer/classifier calls,
reporters, root end, and every telemetry-only active-span lookup or rename. A
`getCurrentSpan()` or `updateName()` before the guard can turn an observability
fault into an application failure. Keep original model/tool/DB errors in memory
and store stable semantic categories only. A synchronous stream-construction failure,
model/tool error, persistence failure, and cancellation all reach the same
idempotent finalizer.

Preserve the application's pre-instrumentation persistence and disconnect
semantics. Tracing cannot choose whether persistence failure rethrows, retries,
reports, recovers, or intentionally continues, and it cannot introduce upstream
abort just because a client disconnects. Record a transport disconnect
separately from the final application outcome. If the pre-existing application
owns detached completion, keep the root open until that owner settles and
record its actual success/failure; if the application really cancels upstream,
record cancellation and retain its existing persistence exclusion. Record
recovered success only after a real recovery; otherwise retain the normalized
failure.

When the application really cancels, cancellation must atomically win
persistence races. Preserve its request-signal/upstream binding and make the
cancellation check part of the persistence commit; a separate pre-write check
is insufficient. An intentional existing detached owner may finish in the same
application trace when it owns the turn, or a separate durable trace when the
application already defines it as a separate unit. Do not invent that split.

Use the existing framework tool span only after proving it is active inside the
tool executor. Put lookup, business rename, sanitizer, and all setters inside a
fail-open trace-only callback. Attach bounded semantic IO/error only when the
installed public API safely targets that span. Otherwise retain the framework's
business-name attribute and report scanability limits. Do not add a duplicate
manual span only to improve display.

## Finalize after the framework telemetry span, then flush

Use this section when root/child windows, cancellation, consumer topology,
response EOF, or freeze/restart proof fails. This section is self-contained; do
not load the active-root section merely for helper definitions.

Map the pre-existing stream graph first. If the response body is the only
consumer, keep it the only consumer. Do not add `consumeStream`, another
text/full-stream reader, or a result getter that starts an internal consumer in
the installed version. If multiple consumers already exist, preserve them and
identify their existing application owners; do not delete, move, or repurpose
one for tracing, and do not treat the first consumer to finish as a settlement
barrier. Preserve chunks, headers, status, backpressure, existing tees, and
cancellation behavior. Do not buffer for tracing.

Keep application settlement and trace finalization as two ordered stages:

1. The existing application owner stops/settles real work according to the
   terminal outcome.
2. That owner awaits the installed runtime's public signal that the AI SDK
   telemetry child ended across every consumer assigned to this trace. Never
   race this real promise against a telemetry timeout or detach it.
3. Only after settlement, one idempotent single-flight trace finalizer records
   final semantic output or normalized error/cancel outcome.
4. The trace finalizer best-effort ends the application root.
5. It attempts bounded export before response EOF, or through a deployment
   primitive proven to survive the tested freeze/restart.

`onFinish`, `onAbort`, response cancel, a timer, private hook, UI waterfall, or
second consumer is not a child-settlement signal. If no public/reliable signal
exists, the child-window gate is `blocked`; never end the root early and claim
completion.

On client disconnect, preserve the uninstrumented ownership policy. Record the
transport event first through a fail-open callback, then perform exactly the
application's existing response-reader cancel/upstream behavior. If that
actually cancels application work, preserve its persistence race protection and
final cancelled result. If a pre-existing application-owned consumer continues,
do not force upstream abort; let it settle and record its final application
outcome alongside the transport disconnect. A telemetry failure cannot change
controller close/error/cancel or the original response.
Do not assume Next.js `after`/`waitUntil` survives hard kill; require deployment
proof. Detached `forceFlush` is never a barrier.
Give trace-only end/export a measured response-EOF budget. Default to at most
500 ms unless a recorded application SLO proves another value, and compare
matched uninstrumented/instrumented EOF and disconnect timings. A five-second
telemetry wait is a user-visible regression even when the trace eventually
arrives. The budget begins after real application/framework settlement; it must
never truncate, detach, or relabel that work. If no existing owner can await
settlement and then invoke the trace finalizer, the binding is `blocked`.

## Verify the real production-style route

Run the built production-style server and uniquely identifiable normal, tool,
model-error, persistence-error, real client-abort, and cold-start/restart turns.
Record exact session/customer IDs and application outcomes. Immediately restart
after a completed bounded export where applicable, wait for settled ingestion,
then inspect raw spans rather than UI previews.

Require exactly one nonzero-duration business root per completed turn, final
semantic IO, no health/read roots, exact context, shared trace IDs, complete
child windows, business tool identity, matching stored terminal outcomes,
baseline-preserving disconnect behavior, and both pre/post-restart roots. Record raw trace,
span, and parent IDs; require an empty root parent only without intentional
distributed context.

Run the complete payload matrix through long input, output/error, and
beyond-bound positions. Serialized root IO must remain parseable after storage
clipping. A benign marker survives while every non-real credential/auth canary,
history, system prompt, schema, file body, and unapproved payload is absent.
Include standalone `Bearer`/`Basic` tokens and a multiline private-key block in
one composed value, with private-key removal running before greedy inline/header
rules. Verify each final serialized stored attribute is at most 1,500
UTF-8 bytes, including its truncation envelope. Include multibyte Unicode/emoji
and escape-heavy fixtures; character/code-unit counts do not prove the bound.

If platform Behaviors or Code Judges are part of the evidence, cite the exact
settled trace ID, Behavior/Judge version, result ID, and inspected result. Zero
results or a missing result is blocked evidence, not a green outcome.

## Mandatory completion gate

Use `not-applicable` only when the architecture genuinely lacks a gate. Missing
credentials, traffic, hooks, or stored evidence is `blocked`; stubs are
synthetic.

| Gate | Result | Evidence class | Exact evidence |
| --- | --- | --- | --- |
| Framework/runtime match | <result> | static | Installed AI SDK major plus Node `streamText` text-response path |
| Dependency integrity | <result> | static | Pre/post manifest and lockfile hashes/diff, frozen-lock install, and unchanged unrelated Next.js/AI SDK/provider versions |
| Shared runtime | <result> | static | Preserved config and production bundle showing one Judgeval runtime |
| Initialization | <result> | real application | Real launcher order proving initialization before readiness/requests |
| Exact deployment/launcher | <result> | static + real application | Checked-in command/artifact ledger, plus Compose service/profile/env-file and rendered forwarding proof when the selected production-style topology uses Compose; that exact selected path runs the real scenario |
| Routing startup and negatives | <result> | real application | Valid-target positive plus explicitly empty and same-type unknown controls through the exact checked-in deployment path; host-only standalone tests do not substitute |
| Exact stored destination | <result> | stored Judgment | Named settled trace/probe ID in the exact intended project, with resolved-ID equality or read-only resolution recorded as the routing mechanism |
| Public/version-proven SDK surface | <result> | static + real application | Public APIs, or exact lockfile pin plus executable production-bundle test for each private/underscored API; otherwise blocked |
| Correct boundary | <result> | stored Judgment | Root ID, duration, final IO, and terminal-event reconciliation |
| Root parentage | <result> | stored Judgment | Root/model/tool raw IDs plus expected upstream chain or empty-parent proof |
| Strict child windows | <result> | stored Judgment | Complete parent tree, evidence-derived precision, start/end margins, and repeats for within-precision negatives |
| Root count and noise | <result> | stored Judgment | Traffic ledger reconciled to business roots; health/readback/build/smoke roots absent or separately sampled |
| Context | <result> | stored Judgment | Exact session/customer IDs before and after restart |
| Payload safety and usefulness | <result> | stored Judgment | Named mode, composed standalone-auth/private-key plus Unicode/escape-heavy canaries, every serialized attribute <=1,500 UTF-8 bytes, parseability, and inspected raw fields |
| Tool usefulness | <result> | stored Judgment | Business tool names and bounded semantic IO/error |
| LLM usefulness | <result> | stored Judgment | Real child with provider/model plus available latency/token/cost and bounded per-call semantic evidence; no history/schema/prompt bulk |
| Judgment span kinds | <result> | stored Judgment | Raw turn root `span_kind=agent`, executed business tools `span_kind=tool`, and supported real model spans `span_kind=llm`; names alone are not evidence and unavailable public model binding remains blocked rather than faked |
| Application/framework settlement | <result> | real application | Existing owner awaits the real settlement promise to its actual outcome outside every telemetry deadline; slow-settlement fault proves the <=500 ms trace budget cannot race or detach it |
| Finalization | <result> | real application | Persistence, framework close, root end, flush, and response EOF order |
| Export lifecycle | <result> | stored Judgment | Trace surviving tested EOF/freeze/restart after bounded flush |
| Disconnect and application outcome | <result> | real application + stored Judgment | Baseline comparison and distinct transport-disconnect versus final application outcome, preserving existing upstream-cancel or detached-completion ownership |
| Error and cancellation | <result> | real application | Error/abort outcomes preserve the application's actual persistence/cancellation policy; no tracing-invented abort |
| Stored terminal outcomes/status parity | <result> | stored Judgment | Raw root IDs, static ERROR status + matching output for failures, explicit non-success application cancellation, and post-abort horizon proving no late side effects when the app actually cancels |
| Restart proof | <result> | stored Judgment | Completed pre-restart and first post-restart root IDs |
| EOF/flush latency parity | <result> | real application | Matched uninstrumented/instrumented EOF and disconnect timings within the application SLO or default <=500 ms telemetry budget |
| Runtime telemetry fail-open (one result per subcase) | <result> | real application | Root/model/tool scope start/enter/exit, active-span lookup, rename, terminal-state mark/freeze/read, each setter/status/sanitizer/reporter/root-end, sync-guard async misuse, flush throw/rejection/timeout; repeated completed turns during a hung flush start at most one process-wide exporter call, report busy/blocked, retain no per-request exporter storm, and preserve responses; business path once and unchanged |
| Ingestion settlement | <result> | stored Judgment | Post-flush raw read timestamps and stable span-set hashes across a named interval; complete unchanged parent tree and terminal IO |
| Behavior/Code Judge evidence | <result> | stored Judgment | Exact trace ID, Behavior/Judge version, result ID, and inspected payload; zero/missing results are blocked, never inferred green |
| Test-export isolation | <result> | stored Judgment | Exact non-live commands/run/time window and stable ingestion check; zero unit/stub/fake/build/typecheck/import/smoke/dev/static-generation roots in Monitoring |
