# Generic Streaming Lifecycle Contract

This is the authoritative binding recipe for a finite streamed/deferred path
that does not match the Next.js Node + AI SDK 5/6 text-response recipe. Read it
completely before editing, but only after the real runtime exposes a finite unit
of work and a component that owns completion. Do not copy callback or
stream-wrapper code from another framework.

## Contents

- [Boundary and application behavior](#boundary-and-application-behavior)
- [Framework-specific implementation gate](#framework-specific-implementation-gate)
- [Binding proof](#binding-proof)

## Boundary and application behavior

- One completed user turn or finite streamed operation is one application
  trace. Start it before stream/deferred-operation construction can begin
  generation. End it only after generation, tools, application persistence,
  terminal output/error/cancellation, and framework telemetry have settled.
- Put the exact stable session ID and available customer ID on the active
  business root. Keep LLM/tool children inside it and preserve business tool
  names; exclude health/readback operations from the agent-tracing signal.
- Set the raw business root kind to `agent`, executed business-tool children to
  `tool`, and real model children to `llm` only through a documented public API
  supported by the installed version. A descriptive name is not a span kind.
  If a real model binding is unavailable, report model-kind coverage `blocked`;
  never manufacture a fake model span. This contract must be implemented before
  running the verification table, not discovered from that table afterward.
- Preserve the application's existing consumer, tee, buffering, backpressure,
  persistence, retry, error, and disconnect behavior. Tracing must not add a
  stream consumer or tee. When multiple consumers already exist, identify each
  existing application owner and require a completion barrier covering every
  consumer assigned to this trace; never race finalization against the first
  consumer to finish. If ownership is undocumented, preserve behavior and mark
  the relevant completion/cancellation gate `blocked`.
- First characterize the uninstrumented disconnect policy. If the application
  already propagates a client disconnect to upstream work, preserve that path
  and run it before best-effort telemetry. If a pre-existing application-owned
  consumer intentionally continues generation or persistence, do not add an
  upstream abort for tracing. Record the transport disconnect separately from
  the final application outcome: the transport may be disconnected while the
  application-owned work later succeeds or fails. Use a separate durable trace
  only when the application already gives that work a separate durable owner.
- Application cancellation wins terminal-state races only when the application
  actually cancels. In that model, bind cancellation to persistence or pass its
  signal into persistence; a pre-write check followed by an unguarded write is
  still racy. In an intentional detached-completion model, preserve the existing
  persistence policy, keep the root open until that owner settles, and retain a
  transport-disconnected event/attribute alongside the eventual application
  result. Never relabel successful detached application work as cancelled merely
  because the client stopped reading.
- Keep runtime telemetry fail-open after startup: trace setters, sanitizers,
  root end, and bounded flush reporting must not prevent, repeat, or replace
  application work. A telemetry failure blocks verification and stays
  observable through a safe application log/metric.
- Put every telemetry-only active-span lookup, rename, setter, status write,
  sanitizer/classifier, and reporter behind that fail-open guard. In particular,
  `getCurrentSpan()` or `updateName()` outside the guard is forbidden: an
  injected lookup/rename failure must leave generation, tools, persistence,
  response status/body, and the original exception unchanged.
- Require the intended existing Judgment project at startup. Require a resolved
  runtime ID and compare it with a deployment-provided expected project ID when
  available; otherwise keep exact routing blocked until a uniquely marked live probe
  settles in the exact intended project. This configuration gate remains
  fail-closed.
- Run the real launcher with the project explicitly empty and with a unique
  unknown name or ID of the same type it accepts under a 30-second bound and
  guaranteed cleanup. Both must exit with the expected routing error before
  readiness, the unknown target must not be created, and a valid-target positive
  control must start. `unset`, unrelated failure, or nonempty ID alone is not
  proof.
- Before those runs, create a launcher/deployment ledger naming the exact
  checked-in command, script, build artifact, env source, and runtime process,
  plus Compose files/services when used by the selected production-style
  topology. If that selected topology uses Docker Compose, render
  `docker compose config` with the same files/profiles/env-file
  and prove every required `JUDGMENT_*` variable is forwarded into the service.
  Retain only variable names and redacted presence/equality checks, not rendered
  credential values, and run the valid, explicitly empty, and same-type
  unknown-project controls through that exact Compose service. For a selected
  Compose topology, starting `.next/standalone/server.js` or another host-only
  server can be a diagnostic, but cannot pass the deployment, routing, or export
  gates. For a non-Compose topology, run the same controls through the exact
  selected checked-in launcher and runtime process from the ledger.
- Inspect resolution semantics first. If name initialization can create a
  project, use a read-only lookup and reject the unknown name before that path.
- Retain bounded semantic request/result evidence. Use an approved sanitizer,
  a conservative credential/auth baseline that still requires privacy review,
  or strict omission that blocks semantic evaluation. Sanitize before bounding.
  Redact multiline private-key blocks before any greedy inline/header rule, and
  redact standalone `Bearer <token>` and `Basic <token>` values even when no
  header label is present. Test the complete sanitizer pipeline with several
  canaries composed in one value; isolated regex tests are insufficient. Keep
  each final serialized stored attribute at or below 1,500 UTF-8 bytes,
  including truncation metadata, and verify its settled raw value remains
  parseable. Include multibyte Unicode/emoji and escape-heavy fixtures; string
  character/code-unit counts are not byte bounds.
- Disable uncontrolled provider/framework bulk capture. Inspect every settled
  raw provider field for accumulated history, prompts, schemas, files, and
  secrets rather than trusting a UI preview or generic capture flag.
- Before editing dependencies, record manifest/lockfile hashes and exact
  framework/runtime/provider versions. Add only the required tracing dependency
  with the existing package manager, run its frozen-lock install, and record the
  diff, hashes, and versions again. Unexplained unrelated upgrades block
  completion.
- Do not use an underscored or otherwise documented-private instrumentation SDK
  API unless the exact dependency version is lockfile-pinned and an executable
  production-bundle test proves that API on every required path. Without both,
  use a public API or mark the binding `blocked`; a successful typecheck or mock
  is not proof.

## Framework-specific implementation gate

Identify from the installed version:

1. the operation that creates the stream;
2. the existing consumer/tee and backpressure topology;
3. success, persistence-failure, model/tool-error, and client-cancel events;
4. the callback/barrier after framework child telemetry ends; and
5. the runtime primitive that awaits bounded export before EOF, freeze, or
   shutdown in the deployment being tested.

Keep real settlement and trace finalization separate. The application's existing
owner must settle generation/persistence and await the real framework-child
completion barrier under its existing application timeout/retry policy. Never
put that promise inside a telemetry `Promise.race`, trace-only timeout, or
detached observer. Only after it settles may the owner call one idempotent
trace-only finalizer shared by success, model/tool error, persistence failure,
synchronous construction failure, and real cancellation. That finalizer records
the terminal outcome, ends the root, and attempts bounded export exactly once.
Idempotent means one memoized trace-finalization promise assigned before its
first await and returned to every settled terminal caller; a boolean
early-return that lets a second caller continue while trace finalization is
pending fails. The real application terminal-state rule decides the outcome
before this call. If no existing owner can await real settlement, the binding is
`blocked`; a telemetry deadline cannot be used to manufacture one.

Give trace-only finalization/export an explicit latency budget. Unless an
application-owned response/EOF SLO proves and records a different value, the
default bound is at most 500 ms. Measure matched uninstrumented and instrumented
time-to-EOF (and disconnect return behavior) for every terminal path; tracing
must not add more than the approved budget. A timeout is fail-open for the
application and blocks export verification. Do not use a five-second telemetry
timeout merely because it eventually exports; that delay is user-visible. This
budget begins only after real application/framework settlement completes and
must never truncate or detach it.

A caller timeout cannot cancel an already-running exporter. Keep exporter calls
process-wide single-flight: while one call remains in flight, later operations
must return a reported busy failure and mark their export evidence `blocked`,
not start or queue another exporter call. Prove with a hung-flush injection that
repeated completed operations start only one exporter call, retain their exact
application outcomes, and expose the blocked/busy condition.

For every unrecovered application failure, record a fixed application-owned
error category in bounded output and OpenTelemetry `ERROR` status. Cancellation
gets an explicit cancelled outcome and must never appear as success. Never pass
the raw exception/message/stack to a trace setter or `setError`; preserve it in
memory for the application's existing behavior.

The application root must await the framework-child settlement barrier on
success, error, and cancellation before it ends. `onFinish`/`onAbort` firing,
response cancellation, a sleep, or a UI waterfall is not proof that the
framework span has ended; verify raw child end time is within the root. If any
event has no reliable owner, report that path `blocked`; do not invent an
`onFinish`, `waitUntil`, buffering layer, or response wrapper. WebSockets,
subscriptions, and indefinite streams remain unsupported unless the
application proves a finite per-message/per-operation completion owner. In
that case, trace the finite operation, not the connection lifetime.

## Binding proof

Run real success, tool, error, cancellation, and freeze/restart paths. Reconcile
requests and returned outcomes with settled raw Judgment spans. Prove semantic
root IO, exactly one finalized business root per completed operation with no
readback/health roots, exact session/customer identity, business tool names,
child windows after deriving timestamp precision from raw stored values or
documented platform resolution. Compute `start_margin = min(child_start) -
root_start` and `end_margin = root_end - max(child_end)`. Each margin `>= 0`
passes; `-precision < margin < 0` is inconclusive and must be repeated; `margin
<= -precision` fails. Never round a negative margin to a pass.
Also prove terminal outcome and raw payload safety. The conservative canary
matrix covers non-real OpenAI-style `sk-`, GitHub-style `ghp_` and
`github_pat_`, `Authorization: ApiKey`, `Authorization: Digest`, custom
`Proxy-Authorization`, `HTTP_AUTHORIZATION`, `X-Api-Key`, `JUDGMENT_API_KEY`,
`AWS_SECRET_ACCESS_KEY`, camelCase/prefixed secret/token/password keys,
cookie/session tokens, URL credentials, and private-key blocks;
place a benign marker and canary before the bound, another canary beyond it,
and different canaries in output/error. For parentage, an empty parent is
required only when no intentional upstream W3C/distributed context exists;
otherwise record the expected upstream trace/span IDs and prove the local
business root owns the complete local lifetime and IO. Static configuration is
not raw parentage proof.

Keep serialized semantic fields below any platform storage clip with margin.
A text value at the platform limit can become invalid JSON after object
serialization and clipping; prefer smaller structured fields and verify that
the settled raw `judgment.input`/`judgment.output` still parses.

After each awaited bounded flush, poll raw data until the expected complete
parent tree, span-ID set, terminal IO/status, and timestamps remain unchanged
across a named stability interval. Record raw-read timestamps and a span-set
hash. Missing or changing data remains `blocked`; do not score a stream while
late framework/tool children may still arrive.

Use `not-applicable` only when the architecture truly lacks a gate. Missing
hooks, credentials, traffic, or stored evidence are `blocked`.

Safely inject independent failures into root and important child scope
start/enter/exit, active-span lookup, span rename, every setter/status write,
sanitizer/classifier, reporter, root end, sync-guard async misuse, flush
throw/rejection, and flush timeout. Each
subcase must leave generation, persistence, cancellation, retry, response, and
original exceptions single-run and unchanged. Observe after cancellation for a
named horizon long enough that the original work would have completed; prove no
late tool/persistence side effects or identify their separate durable owner.
Also inject a real application/framework settlement that takes longer than 500
ms. Its existing owner must still await and preserve the exact result; only the
subsequent trace-write/end/export attempt is subject to the telemetry deadline.

When platform Behaviors or Code Judges are used, retain the exact settled trace
ID, Behavior/Judge version, result ID, and inspected result payload. A query that
returns zero results, a missing result, or an aggregate without trace-level
provenance is missing evidence, not a green result.

Run every non-live unit/stub/fake/build/typecheck/import/smoke/dev/static-
generation command in a fresh process with all
export-capable Judgment/Judgeval/OTel credentials and exporter headers
explicitly overridden empty before any app/SDK import, and
`OTEL_SDK_DISABLED=true` where supported; or inject a proven no-export/in-memory
tracer. If config requires a project string, use an obviously synthetic value
only after proving the exporter is disabled. Merely unsetting can let dotenv
refill values, clearing after import is too late, and `setdefault` is not
isolation. Reconcile named live probes with Monitoring and require zero
unexplained test-generated roots.

When implementation is finished, read
`generic-streaming-verification.md` completely to produce the evidence table.
