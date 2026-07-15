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

Forward key, organization, explicit project, and endpoint overrides to the
actual standalone/serverless runtime. Test the built launcher with project set
explicitly empty under a 30-second supervisor and guaranteed cleanup. It must
exit with the expected error before readiness even when dotenv exists.

## Start a manually controlled active root

Use this section when callback outcomes, persistence policy, active tool spans,
or error serialization remain unclear.

Create one business root after auth/request/session validation and before
`streamText` construction. Set exact session and available customer identity on
that active root. Disable uncontrolled AI SDK provider IO capture so history,
prompts, schemas, files, and raw payloads do not appear in secondary fields.

Use one fail-open outcome owner. Guard setters, sanitizer/classifier calls,
reporters, and root end. Keep original model/tool/DB errors in memory and store
stable semantic categories only. A synchronous stream-construction failure,
model/tool error, persistence failure, and cancellation all reach the same
idempotent finalizer.

Preserve the application's pre-instrumentation persistence semantics. Tracing
cannot choose whether persistence failure rethrows, retries, reports, recovers,
or intentionally continues. Record recovered success only after a real
recovery; otherwise retain the normalized failure.

Cancellation must atomically win persistence races. Connect the real request
signal to upstream work before telemetry. Make the cancellation check part of
the persistence commit or pass the abort signal into persistence; a separate
check immediately before an unguarded write is insufficient. Every abort path,
including the AI SDK abort callback, marks the shared cancellation state. No
success/assistant/tool-call persistence or completed root may appear afterward
unless the existing app intentionally owns detached completion, which becomes a
separate durable trace.

Use the existing framework tool span only after proving it is active inside the
tool executor. Attach bounded semantic IO/error and a business name when the
installed API safely targets that span. Otherwise retain the framework's
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

Use one idempotent terminal finalizer for success, model/tool error, persistence
error, synchronous construction error, and cancellation. Its binding order is:

1. stop/settle application work according to the real terminal outcome;
2. await a real installed-runtime public signal that the AI SDK telemetry child
   ended across every consumer assigned to this trace;
3. record final semantic output or normalized error/cancel outcome;
4. best-effort end the application root; and
5. await bounded export before response EOF, or through a deployment primitive
   proven to survive the tested freeze/restart.

`onFinish`, `onAbort`, response cancel, a timer, private hook, UI waterfall, or
second consumer is not a child-settlement signal. If no public/reliable signal
exists, the child-window gate is `blocked`; never end the root early and claim
completion.

On client cancel, abort upstream first, atomically prevent late persistence,
cancel the response reader assigned to this trace, then invoke fail-open
finalization. Consumers owned by a separate durable unit remain untouched and
settle in their own trace. A telemetry failure cannot change controller
close/error/cancel or the original response.
Do not assume Next.js `after`/`waitUntil` survives hard kill; require deployment
proof. Detached `forceFlush` is never a barrier.

## Verify the real production-style route

Run the built production-style server and uniquely identifiable normal, tool,
model-error, persistence-error, real client-abort, and cold-start/restart turns.
Record exact session/customer IDs and application outcomes. Immediately restart
after a completed bounded export where applicable, wait for settled ingestion,
then inspect raw spans rather than UI previews.

Require exactly one nonzero-duration business root per completed turn, final
semantic IO, no health/read roots, exact context, shared trace IDs, complete
child windows, business tool identity, matching stored terminal outcomes,
stopped post-cancel work, and both pre/post-restart roots. Record raw trace,
span, and parent IDs; require an empty root parent only without intentional
distributed context.

Run the complete payload matrix through long input, output/error, and
beyond-bound positions. Serialized root IO must remain parseable after storage
clipping. A benign marker survives while every non-real credential/auth canary,
history, system prompt, schema, file body, and unapproved payload is absent.

## Mandatory completion gate

Use `not-applicable` only when the architecture genuinely lacks a gate. Missing
credentials, traffic, hooks, or stored evidence is `blocked`; stubs are
synthetic.

| Gate | Result | Evidence class | Exact evidence |
| --- | --- | --- | --- |
| Framework/runtime match | <result> | static | Installed AI SDK major plus Node `streamText` text-response path |
| Shared runtime | <result> | static | Preserved config and production bundle showing one Judgeval runtime |
| Initialization | <result> | real application | Real launcher order proving initialization before readiness/requests |
| Complete configuration | <result> | static | Resolved key, org, explicit project, and endpoint variable names |
| Explicit routing negative | <result> | real application | Explicit-empty launcher command, nonzero exit, and expected error |
| Correct boundary | <result> | stored Judgment | Root ID, duration, final IO, and terminal-event reconciliation |
| Root parentage | <result> | stored Judgment | Root/model/tool raw IDs plus expected upstream chain or empty-parent proof |
| Context | <result> | stored Judgment | Exact session/customer IDs before and after restart |
| Payload safety and usefulness | <result> | stored Judgment | Named mode, raw canary search, bounds, parseability, and inspected fields |
| Tool usefulness | <result> | stored Judgment | Business tool names and bounded semantic IO/error |
| Finalization | <result> | real application | Persistence, framework close, root end, flush, and response EOF order |
| Export lifecycle | <result> | stored Judgment | Trace surviving tested EOF/freeze/restart after bounded flush |
| Error and cancellation | <result> | real application | Error/abort outcomes preserving persistence policy and stopped upstream work |
| Stored terminal outcomes | <result> | stored Judgment | Raw root IDs/outcomes for success, model error, persistence error, and abort |
| Restart proof | <result> | stored Judgment | Completed pre-restart and first post-restart root IDs |
