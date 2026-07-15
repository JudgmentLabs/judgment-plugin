# Generic Streaming Lifecycle Contract

Use this contract for a streamed or deferred response only after the real
runtime exposes a finite unit of work and a component that owns its completion.
Do not copy callback or stream-wrapper code from another framework.

## Boundary and application behavior

- One completed user turn or finite streamed operation is one application
  trace. Start it before generation and end it after generation, tools,
  application persistence, terminal output/error/cancellation, and framework
  telemetry have settled.
- Preserve the application's existing consumer, tee, buffering, backpressure,
  persistence, retry, error, and disconnect behavior. Tracing must not add a
  stream consumer or tee. Multiple consumers are valid when the application
  already owns them intentionally.
- Propagate a real client cancellation to the application's upstream work
  **before** best-effort telemetry. Do not let a setter, sanitizer, finalizer,
  or exporter failure delay cancellation or change the response outcome.
- Cancellation wins terminal-state races. After cancellation is requested, do
  not persist a success/assistant/tool-call transcript or emit a completed root
  unless the pre-existing application intentionally owns detached completion;
  model that detached work as a separate durable unit.
- Keep runtime telemetry fail-open after startup: trace setters, sanitizers,
  root end, and bounded flush reporting must not prevent, repeat, or replace
  application work. A telemetry failure blocks verification and stays
  observable through a safe application log/metric.
- Require the intended Judgment project and complete routing at startup. This
  configuration gate remains fail-closed.

## Framework-specific implementation gate

Identify from the installed version:

1. the operation that creates the stream;
2. the existing consumer/tee and backpressure topology;
3. success, persistence-failure, model/tool-error, and client-cancel events;
4. the callback/barrier after framework child telemetry ends; and
5. the runtime primitive that awaits bounded export before EOF, freeze, or
   shutdown in the deployment being tested.

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
root IO, exact session identity, child windows, terminal outcome, and raw
payload safety. The conservative canary matrix covers provider/API-key prefixes,
bearer/authorization values, cookie/session values, secret/token/password
assignments, URL credentials, and private-key blocks; place a benign marker and
canary before the bound, another canary beyond it, and different canaries in
output/error. For parentage, an empty parent is required only when no
intentional upstream W3C/distributed context exists; otherwise record the
expected upstream trace/span IDs and prove the local business root owns the
complete local lifetime and IO. Static configuration is not raw parentage
proof.

Keep serialized semantic fields below any platform storage clip with margin.
A text value at the platform limit can become invalid JSON after object
serialization and clipping; prefer smaller structured fields and verify that
the settled raw `judgment.input`/`judgment.output` still parses.

Use `not-applicable` only when the architecture truly lacks a gate. Missing
hooks, credentials, traffic, or stored evidence are `blocked`.

## Completion table

| Gate | Result | Evidence class | Exact evidence |
| --- | --- | --- | --- |
| Finite completion owner | <result> | static | Framework/version plus named terminal application event and owner |
| Existing stream topology | <result> | static | Existing consumers/tees/backpressure and proof tracing added none |
| Explicit routing negative | <result> | real application | Exact empty-project launcher command, nonzero exit, and expected error |
| Real terminal behavior | <result> | real application | Recorded success, error, persistence-failure, cancellation, and freeze/restart outcomes |
| Root parentage | <result> | stored Judgment | Raw trace-span-parent IDs plus expected upstream chain or empty-parent proof |
| Stored boundary/session/children | <result> | stored Judgment | Project, session, root/child IDs, terminal IO, and window arithmetic |
| Error and cancellation | <result> | stored Judgment | Raw terminal outcomes matching application results without post-cancel work |
| Payload safety and usefulness | <result> | stored Judgment | Named mode, mandatory canaries, bounds, and inspected raw attributes |
| Export lifecycle | <result> | stored Judgment | Completed root surviving the tested EOF/freeze/restart barrier |
