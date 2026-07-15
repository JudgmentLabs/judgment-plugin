# Next.js AI SDK 5/6 Streaming Binding Recipe

Read this file completely only when the real path is a Next.js Node-runtime
route returning a Vercel AI SDK 5/6 `streamText` text response. Confirm the
major version in `package.json` and the lockfile. Do not apply it to AI SDK 7,
Edge runtime, `toUIMessageStreamResponse`, WebSockets, or indefinite streams.
After dependencies are installed, run the bundled
`node <skill-directory>/scripts/inspect-ai-sdk-contract.mjs <app-root>`, where
`<skill-directory>` is the directory containing the selected streaming
`SKILL.md`, not the target repository or this `references/` directory. Keep its
JSON as static evidence. A nonzero result or unrecognized installed source
blocks this binding; do not continue from version assumptions.

## Contents

- [Preserve one application turn](#1-preserve-one-application-turn)
- [Bind one real runtime](#2-bind-one-real-runtime-and-explicit-routing)
- [Use one fail-open turn outcome](#3-use-one-fail-open-turn-outcome)
- [Preserve stream topology](#4-preserve-exactly-the-existing-stream-topology)
- [Finalize in binding order](#5-finalize-in-binding-order)
- [Keep evidence safe and useful](#6-keep-roottool-evidence-safe-and-useful)
- [Prove the production path](#7-prove-the-production-path)

Do not load `nextjs-vercel-ai-streaming.md` by default. Read only its exact
named section when the condition appears:

- **Use one Judgeval runtime in the production server bundle** — production
  exports zero spans or bundle duplication is unresolved.
- **Start a manually controlled active root** — callback/outcome ownership,
  persistence policy, or active tool-span naming is unresolved.
- **Finalize after the framework telemetry span, then flush** — child windows,
  cancellation, consumer topology, EOF, or freeze/restart proof fails.
- **Verify the real production-style route** and **Mandatory completion gate**
  — implementation is finished and final evidence is being assembled.

This binding recipe is the only implementation path. Optional sections are
self-contained diagnostics/proof criteria and contain no competing adapter.

## 1. Preserve one application turn

- One completed user turn is one application root with a stable business name.
- Begin after auth/request/session validation but before `streamText` is
  constructed. Set the exact session and available customer ID on the active
  root so AI SDK children inherit it.
- Keep the root open through generation, tool calls, streaming, persistence,
  final semantic output, error/cancellation handling, and framework telemetry
  settlement. Returning `StreamTextResult` or a response is not completion.
- Preserve the application's existing consumer, tee, buffering, backpressure,
  persistence, retry, error, and disconnect semantics.

The root requires bounded semantic current-message input and final-answer or
normalized terminal output. Counts or omission markers alone are
behavior-blind and cannot pass semantic evaluation.

## 2. Bind one real runtime and explicit routing

- Initialize Judgeval once in the Node branch of `instrumentation.ts`, before
  readiness and requests. Use a delayed import so Edge instrumentation does not
  load the Node SDK.
- Externalize/deduplicate `judgeval` in the existing Next config without
  replacing unrelated settings. Inspect the production server bundle and prove
  instrumentation plus route use one shared Judgeval/OpenTelemetry runtime.
- Require the project explicitly. Forward key, organization, project, and
  endpoint overrides into the production standalone/serverless launcher; a
  host `.env` is not container propagation.
- Run the built real launcher with project explicitly set to empty under a
  30-second supervisor and guaranteed cleanup. It must exit nonzero with the
  expected configuration error before readiness even when dotenv exists.
  `unset`, timeout, or unrelated startup failure does not pass.

Use the installed AI SDK 5/6 telemetry integration with Judgment's tracer and
disable uncontrolled provider `recordInputs`/`recordOutputs`. Production route
evidence, not a successful build, proves singleton activation.

## 3. Use one fail-open turn outcome

Use one manually controlled active root and one terminal-state owner:

1. Guard trace setters, sanitizer/classifier calls, root end, telemetry
   reporters, and flush reporting. After valid startup, tracing must not change
   the response or application retry/persistence behavior.
2. Keep original application errors only in memory. Store stable semantic
   categories such as `stream_construction_failed`, `stream_failed`, and
   `persistence_failed`; never pass raw provider/tool/DB errors to tracing.
3. Preserve the repository's existing persistence-failure rethrow, recovery,
   reporting, or intentional-swallow behavior exactly. Tracing does not choose
   a new policy. Record recovered success only when the application really
   recovered.
4. Handle synchronous `streamText` construction failure through the same
   terminal owner: record a bounded code, best-effort end/flush, then preserve
   the original rethrow/recovery outside tracing.
5. Make success, model/tool error, persistence failure, and cancellation
   converge on one idempotent finalizer. Do not create a second traced path.

A setter, sanitizer, reporter, root-end, barrier, or exporter failure remains
observable but cannot replace the generated reply, original exception, client
cancellation, or persistence result. It blocks tracing verification.

## 4. Preserve exactly the existing stream topology

- Map every pre-existing consumer, tee, and detached drain before editing. If
  the response body is the only consumer, keep it the only consumer. Never add
  `result.consumeStream()` or another full/text-stream consumer for tracing.
- If the application already has multiple consumers, do not delete, move, or
  repurpose one to make tracing easier. Identify the existing application owner
  for each and require a public completion barrier covering every consumer that
  belongs to this trace. The first consumer to finish is not such a barrier.
- Retain the promise returned by every pre-existing programmatic consumer at
  its existing call site. Observing that promise does not add, move, or
  repurpose a consumer; discarding it with `void` loses candidate settlement
  evidence. Use it only after installed-source proof shows it resolves after
  the outer framework span. If several consumers belong to one trace, the
  barrier must cover all of them.
- Inspect AI SDK result getters too: do not use a promise such as
  `finishReason` as a barrier if that installed version starts
  `consumeStream()` internally.
- Do not buffer the response for tracing. Forward chunks, status, status text,
  and headers unchanged.
- Use the application's request/disconnect signal to abort upstream model/tool
  work before best-effort telemetry. Cancellation must not wait for tracing.
- Cancellation wins races with `onFinish`: make its check part of the
  persistence commit or pass the abort signal into persistence. After cancel,
  do not persist success/assistant/tool-call output or emit completed outcome.
- Preserve detached completion only when the application already documents it;
  trace that work as a separate durable unit. If a pre-existing extra consumer
  appears to continue generation or persistence after client cancellation but
  that ownership is undocumented, preserve behavior and report cancellation
  ownership `blocked` rather than changing application semantics.

Adding an extra-consumer pattern is forbidden: a tee can remove backpressure
and let generation, tools, and success persistence continue after the client
cancels. A pre-existing extra consumer is an application-ownership question,
not permission to race root finalization against whichever consumer finishes
first.

## 5. Finalize in binding order

Before writing the finalizer, inspect the installed AI SDK source or source map
and record the exact order of `onFinish`, `onError`, `onAbort`, consumer
completion, and outer `ai.streamText` span end. In supported AI SDK 5/6 source,
`onFinish` and `onError` run before `rootSpan.end()`, so an application-root end
or final `forceFlush()` reachable from either callback is structurally early.
The installed source also does not await `onAbort`, so that callback cannot own
awaited finalization; do not infer its exact position from that fact alone.
These callbacks may record an in-memory outcome only. Final root end and flush
must be owned outside them after a proven settlement barrier; without one,
report the gate `blocked`.

Use one idempotent finalizer on success, error, persistence failure, and cancel:

1. stop/settle application work according to the real terminal outcome;
2. await the installed runtime's real public signal that the AI SDK framework
   telemetry span has ended across every consumer assigned to this trace;
3. write final bounded semantic output or normalized error/cancel outcome;
4. best-effort end the application root; and
5. await a bounded `Tracer.forceFlush()` attempt before response EOF or through
   another deployment primitive proven to survive the tested freeze/restart.

`onFinish`, `onAbort`, response cancellation, a sleep, a UI waterfall, a private
hook, or a second consumer is not a framework-child settlement signal. If no
reliable signal exists, report the child-window gate `blocked`; do not end the
root early and call it complete.

Never final-flush while a framework child may still be open. That can export a
root and inner children before their parent arrives. A trace with a non-root
span whose parent is absent fails tree completeness and cannot pass timing even
when the root covers every span that happened to arrive.

When the response consumer belongs to this trace, its wrapper may delay only
final EOF while finalization settles. Its cancel branch aborts upstream first,
cancels that response reader, then invokes fail-open finalization. Consumers
owned by a separate durable unit remain untouched and must settle in their own
trace. Preserve controller close/error/cancel behavior.

Do not assume Next.js `after(...)`/`waitUntil(...)` survives hard kill. Use it
only when the tested deployment guarantees the promise through freeze and
shutdown. Never use detached `void Tracer.forceFlush()`.

## 6. Keep root/tool evidence safe and useful

Choose and name one mode:

- approved application sanitizer, then bound;
- conservative credential/auth baseline, then bound, with privacy review still
  required; or
- strict omission, which blocks semantic behavior evaluation.

When no approved sanitizer exists and the conservative baseline is selected,
use one shared helper at least as strong as this TypeScript starting point,
then extend it for providers and domain secrets actually present in the app:

```ts
const TRACE_TEXT_LIMIT = 1_500; // margin below serialized attribute clipping
const CREDENTIAL_RULES: Array<[RegExp, string]> = [
  [/\b(?:sk-[A-Za-z0-9_-]{10,}|ghp_[A-Za-z0-9]{10,}|github_pat_[A-Za-z0-9_]{10,}|xox[baprs]-[A-Za-z0-9-]{8,})\b/g, '[redacted]'],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}\b/gi, '[redacted]'],
  [/\b(?:authorization|cookie)\s*:\s*[^\r\n]+/gi, '[redacted]'],
  [/(["']?(?:authorization|password|token|secret|api[_-]?key|session|cookie)["']?\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;}\]]+)/gi, '$1"[redacted]"'],
  [/\b(?:https?|postgres(?:ql)?|redis|mongodb(?:\+srv)?):\/\/[^/\s:@]+:[^/\s@]+@/gi, '[redacted]'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[redacted]'],
];

function sanitizeTraceText(value: string): string {
  const redacted = CREDENTIAL_RULES.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    value,
  );
  return redacted.length > TRACE_TEXT_LIMIT
    ? `${redacted.slice(0, TRACE_TEXT_LIMIT)}…`
    : redacted;
}
```

This is not a PII or domain-secret policy. Unit-test every listed shape,
including quoted JSON keys and plain assignments, then run the raw canary
matrix below; helper tests alone are not stored-path proof.

Sanitize the final composed value before bounding. Leave margin below platform
attribute clipping so serialized `judgment.input`/`judgment.output` remains
parseable. Truncation is not redaction. Treat short queries, shell commands,
URLs, headers, and error messages as sensitive too; remove unnecessary PII
before bounding. A conservative credential/auth baseline does not claim to
cover general PII or application-specific domain secrets.

Use a benign semantic marker plus non-real OpenAI-style `sk-`, GitHub-style
`ghp_` and `github_pat_`, other installed-provider/API-key, authorization,
cookie/session, secret-assignment, URL-credential, and private-key canaries in
input, output/error, and beyond-bound positions. Search every settled raw root,
provider/tool child, event, and resource attribute. The marker survives; all
canaries, accumulated history, system prompts, tool schemas, files, and
unapproved payloads are absent.

First prove from the installed source that tool `execute` runs inside the
framework `ai.toolCall` active span. With bulk framework input/output capture
disabled, enrich that span inside each existing executor; do not add a duplicate:

```ts
const toolSpan = Tracer.getCurrentSpan();
if (toolSpan) {
  toolSpan.updateName(`application.tool.${businessToolName}`);
  Tracer.setInput(safeBoundedInput, toolSpan);
}

const result = await existingToolWork();

if (toolSpan) Tracer.setOutput(safeBoundedOutput, toolSpan);
return result;
```

Apply the same safe normalized error policy on failure. A generic
`ai.toolCall` with missing, `null`, or empty-object Judgment IO fails tool
usefulness. If the installed API does not expose the correct active span,
retain its business-name attribute, report scanability/IO `blocked`, and do not
duplicate the tool merely to improve display.

## 7. Prove the production path

Build and start the production-style route. Run uniquely identifiable normal,
tool, model-error, persistence-error, real client-abort, and cold-start/restart
turns. Record exact session/customer IDs and returned application outcomes.
Immediately restart after a completed bounded export where applicable, wait for
ingestion, then reconcile settled raw Judgment data.

Evidence is path-specific. An error-path trace cannot pass normal success,
tool, persistence, cancellation, or general finalization. Inspect at least one
real successful tool-bearing stored turn before those gates pass. Verify every
parent resolves before timing arithmetic; a partial tree is never a timing
pass. A finite client-owned HTTP stream has a cancellation gate: missing signal
propagation, unexercised abort, or undocumented detached completion is
`blocked` or failed, never `not-applicable`. Do not claim the integration
complete while a required path remains blocked.

Trigger the abort while a response-body read is pending. This is the binding
test for the extra-consumer/backpressure race; an abort before stream reading or
after ordinary EOF does not prove cancellation stops active upstream work.

Require:

- exactly one nonzero-duration business root per completed turn, with final
  semantic IO and no health/readback noise;
- raw trace/span/parent IDs prove model/tool children share the root trace and
  end inside its window; compute `root_end >= max(child_end)` with no grace
  period, so any positive child overrun fails; an empty root parent is required
  only without deliberate upstream distributed context;
- exact session/customer identity and completed pre/post-restart roots;
- cancellation records cancelled outcome, stops upstream work, and has no
  late success/tool-call persistence unless separately owned;
- success, model error, persistence error, and abort each have matching stored
  terminal outcomes;
- explicit routing reaches the intended project and the empty-project negative
  test passes; and
- semantic/storage parsing and the full raw canary search pass.

Builds, types, unit tests, scratch spans, and successful HTTP responses are not
stored-path proof. Missing traffic, credentials, terminal hooks, raw spans, or
export is `blocked`; use `not-applicable` only when the architecture genuinely
lacks a gate.
