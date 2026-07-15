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

Before changing dependencies, record the hashes of `package.json` and the
repository lockfile plus the exact installed `next` and `ai` versions. Add only
the required tracing dependency with the repository's existing package manager,
then run its frozen-lock install (`npm ci`, `pnpm install --frozen-lockfile`, or
the equivalent). Re-record the hashes and versions. An unexplained framework,
AI SDK, or unrelated dependency change blocks this binding; do not fix tracing
by upgrading the application stack.

Use public instrumentation APIs. A call whose name is underscored or whose SDK
documentation/source marks it private/internal is forbidden unless the exact
dependency version is pinned in the lockfile and an executable test exercises
that call in the built production bundle and exact launcher. Without both, use a
public API or mark the affected binding `blocked`; a typecheck or mock does not
prove a private runtime hook.

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

### Activate the root without rerunning application work

Use the OpenTelemetry tracer exposed by the initialized Judgment runtime. The
function that constructs `streamText` must run exactly once inside the active
root callback so framework model/tool spans inherit the root. `TurnBundle` is a
repository-specific object containing the original `StreamTextResult`, the
existing completion/consumer promise when one exists, and the lifecycle owner.
`createTurnOnce(rootSpan)` must skip root setters/provider integration when
`rootSpan` is absent while preserving the original untraced application path:

```ts
import {
  ROOT_CONTEXT,
  SpanStatusCode,
  type Context,
  type Span,
} from '@opentelemetry/api';

async function finalizeConstructionFailure(rootSpan: Span): Promise<void> {
  // The original exception remains only in application memory. Store one safe,
  // fixed category, end the explicitly created root, and attempt bounded export.
  traceOnly('construction failure output', () => rootSpan.setAttribute(
    'judgment.output',
    JSON.stringify({ ok: false, errorCode: 'stream_construction_failed' }),
  ));
  traceOnly('construction failure status', () => rootSpan.setStatus({
    code: SpanStatusCode.ERROR,
    message: 'stream_construction_failed',
  }));
  traceOnly('construction failure root end', () => rootSpan.end());
  await requestJudgmentFlushWithDeadline(
    500, // default trace-only EOF/export budget; override only from a proven app SLO
  );
}

async function activateTurn(
  // Pass a context extracted by the route only when preserving a deliberate
  // upstream W3C parent is part of the application contract. Otherwise use
  // ROOT_CONTEXT so an ambient Next.js/HTTP span cannot become the business
  // root's parent by accident. Import Context and ROOT_CONTEXT from the exact
  // @opentelemetry/api instance used by the initialized Judgment runtime.
  turnParentContext: Context = ROOT_CONTEXT,
): Promise<TurnBundle> {
  let callbackEntered = false;
  let applicationWork: Promise<TurnBundle> | undefined;

  try {
    return await Tracer.getOTELTracer().startActiveSpan(
      'application.chat_turn',
      {},
      turnParentContext,
      (rootSpan) => {
        callbackEntered = true;
        traceOnly('root span kind', () => {
          Tracer.setSpanKind('agent', rootSpan);
        });
        // Retain this exact promise before returning it to the context manager.
        // A faulty context-exit path can throw synchronously after invoking this
        // callback but before the application promise settles.
        applicationWork = (async () => {
          try {
            return await createTurnOnce(rootSpan);
          } catch (error) {
            // Direct OpenTelemetry startActiveSpan does not auto-end rootSpan.
            // Close this construction-failure root without rerunning application
            // work, then preserve the exact original exception for the caller.
            await finalizeConstructionFailure(rootSpan); // bounded and total
            throw error;
          }
        })();
        return applicationWork;
      },
    );
  } catch (error) {
    if (!callbackEntered) {
      reportTelemetryFailure('root:start-or-enter', error);
      return await createTurnOnce(undefined);
    }
    if (applicationWork !== undefined) {
      try {
        // Observe the retained promise even when the context manager threw
        // first. Return its exact result or rethrow its exact application error.
        const exactResult = await applicationWork;
        reportTelemetryFailure('root:exit', error);
        return exactResult;
      } catch (applicationError) {
        if (error !== applicationError) {
          reportTelemetryFailure('root:exit-after-application-failure', error);
        }
        throw applicationError;
      }
    }
    throw error; // unexpected active-context failure after callback entry
  }
}
```

The containing route must await `activateTurn`; do not detach it. Direct
OpenTelemetry `startActiveSpan` activates context but does not end the created
span, so every settled success terminal path ends the root through
`finalizeTraceOnce`, and
the construction-failure path above ends that same root before rethrowing. Do
not catch and call `createTurnOnce` again after its application work began.
`onFinish`, `onError`, and `onAbort` update only the shared in-memory terminal
state and existing application persistence. They do not end the application
root or flush.

## 2. Bind one real runtime and explicit routing

- Initialize Judgeval once in the Node branch of `instrumentation.ts`, before
  readiness and requests. Use a delayed import so Edge instrumentation does not
  load the Node SDK.
- Externalize/deduplicate `judgeval` in the existing Next config without
  replacing unrelated settings. Inspect the production server bundle and prove
  instrumentation plus route use one shared Judgeval/OpenTelemetry runtime.
- Require the intended existing project. Require a resolved runtime ID and
  compare it with a deployment-provided expected project ID when available;
  otherwise keep exact routing blocked until a unique live probe settles in that
  exact project. Forward key, organization, project, provided ID, and endpoint overrides into the production
  standalone/serverless launcher; a host `.env` is not container propagation.
- Before testing, write a deployment ledger naming the exact checked-in build
  and start commands, script, output artifact, runtime process, and—when used by
  the selected production-style topology—Docker Compose file(s), service,
  profiles, and env-file. When that selected topology uses Compose, render
  `docker compose config` with those exact inputs and prove every required
  `JUDGMENT_*` value is forwarded into the service. Missing forwarding is a
  deployment failure; an environment value visible only on the host does not
  pass. Retain only variable names plus redacted equality/presence checks in
  evidence—never copy rendered secret values into logs or traces.
- Run the built real launcher with project explicitly empty and with a unique
  unknown name or ID of the same type it accepts under a 30-second supervisor
  and guaranteed cleanup. Both must exit with the expected routing error before
  readiness, the unknown target must not be created, and a valid-target positive
  control must start. `unset`, timeout, unrelated failure, or nonempty resolved
  ID alone does not pass.
- Run the valid-target positive and both routing negatives through the exact
  checked-in Compose service when the selected topology uses Compose. Starting
  `.next/standalone/server.js` directly on the host is useful diagnosis but
  cannot substitute for the deployment, routing, or export proof.
- Inspect resolution semantics first. If name initialization can create a
  project, use a read-only lookup and reject the unknown name before that path.

Use the installed AI SDK 5/6 telemetry integration with Judgment's tracer and
disable uncontrolled provider `recordInputs`/`recordOutputs`. Production route
evidence, not a successful build, proves singleton activation.

## 3. Use one fail-open turn outcome

Use one manually controlled active root and one terminal-state owner:

1. Guard every telemetry-only active-span lookup, rename, trace setter,
   sanitizer/classifier call, status write, root end, telemetry reporter, and
   flush report. After valid startup, tracing must not change the response or
   application retry/persistence behavior. In particular, this is forbidden:
   `const span = Tracer.getCurrentSpan(); span?.updateName(name);` outside a
   `traceOnly` callback.
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

Represent the terminal result and raw span status consistently. Use only a
closed application-owned set of codes for unrecovered model, tool, persistence,
stream, or application errors. Store a bounded output such as
`{ ok: false, errorCode: 'persistence_failed' }` and set the root's raw
OpenTelemetry status to `ERROR` with that same fixed code. Never call
`Tracer.setError(rawError)` or store its message/stack. Success uses matching
semantic output and non-error status. Cancellation uses an explicit bounded
`cancelled` outcome and must never appear as success; whether it is `ERROR` or
non-error is an application policy, but output and raw status must not
contradict each other.

A setter, sanitizer, reporter, root-end, tracing-only child-settlement observer,
or exporter failure remains observable but cannot replace the generated reply,
original exception, client cancellation, or persistence result. It blocks
tracing verification. A retained pre-existing application consumer/completion
promise is different: its rejection is a real stream/model/application outcome
and must keep the repository's existing error, retry, and persistence semantics;
do not swallow it as telemetry.

Use separate synchronous and awaited guards. A synchronous `try/catch` cannot
catch a rejected `Tracer.forceFlush()` promise:

```ts
function reportTelemetryFailure(label: string, error: unknown): void {
  try {
    const kind = error instanceof Error ? error.name : typeof error;
    console.warn(`Judgment telemetry failed: ${label} (${kind})`);
  } catch {}
}

function traceOnly(label: string, write: () => unknown): void {
  try {
    const result = write();
    if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
      // Prevent an unhandled rejection, but treat passing async work here as a
      // blocked/misconfigured integration. Await it through traceOnlyAsync.
      void Promise.resolve(result).catch((error) => {
        reportTelemetryFailure(`${label}:async-rejection`, error);
      });
      reportTelemetryFailure(label, new TypeError('async_write_requires_traceOnlyAsync'));
    }
  } catch (error) {
    reportTelemetryFailure(label, error);
  }
}

async function traceOnlyAsync(
  label: string,
  write: () => Promise<void>,
  timeoutMs: number,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.resolve().then(write),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('telemetry_timeout')), timeoutMs);
      }),
    ]);
    return true;
  } catch (error) {
    reportTelemetryFailure(label, error);
    return false;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

// Exporter-level single-flight is separate from each turn's finalization.
// Promise.race bounds only the caller; it cannot cancel forceFlush(). A busy
// result is observable and blocks export verification for that turn; it never
// starts a second exporter call behind a timed-out/hung first call.
let judgmentFlushInFlight: Promise<void> | undefined;

function requestJudgmentFlushWithDeadline(timeoutMs: number): Promise<boolean> {
  if (judgmentFlushInFlight !== undefined) {
    reportTelemetryFailure('Judgment flush busy', new Error('flush_busy'));
    return Promise.resolve(false);
  }

  const tracked = Promise.resolve()
    .then(() => Tracer.forceFlush())
    .finally(() => {
      if (judgmentFlushInFlight === tracked) judgmentFlushInFlight = undefined;
    });
  judgmentFlushInFlight = tracked;
  return traceOnlyAsync('Judgment flush', () => tracked, timeoutMs);
}
```

Put trace-only sanitization/classification inside these callbacks. Await the
async guard for promise-returning finalization/export; never detach it or let a
rejection alter response, persistence, cancellation, retry, or the original
exception. Inject a rejecting async callback into the sync guard during tests;
it must be reported without an unhandled rejection, and the integration remains
blocked until the call site uses the awaited guard.

The timeout applies only to trace-only terminal writes/end/export, never to real
generation, persistence, or an existing application-owned settlement promise.
Default it to at most 500 ms. A different bound requires a recorded application
response/EOF SLO and matched latency evidence. On timeout, preserve the exact
application response and mark export verification blocked; waiting five seconds
for telemetry is a user-visible regression, not a successful fail-open design.
Use `requestJudgmentFlushWithDeadline` for every exporter call. A timed-out
exporter promise remains the one process-wide in-flight call; later requests
return a reported busy failure and leave their export evidence blocked rather
than queueing an unbounded pass or creating one live `forceFlush()` per turn.

Use a closed type for root error recording. This helper records only trace
state; the application catch/rethrow/recovery remains outside it:

```ts
import type { Span } from '@opentelemetry/api';
import { SpanStatusCode } from '@opentelemetry/api';

type RootErrorCode =
  | 'stream_construction_failed'
  | 'model_call_failed'
  | 'tool_execution_failed'
  | 'persistence_failed'
  | 'stream_failed'
  | 'unexpected_application_error';

function recordRootError(rootSpan: Span | undefined, code: RootErrorCode): void {
  if (!rootSpan) return;
  traceOnly('root error output', () => {
    Tracer.setOutput({ ok: false, errorCode: code }, rootSpan);
  });
  traceOnly('root error status', () => {
    rootSpan.setStatus({ code: SpanStatusCode.ERROR, message: code });
  });
}
```

Do not derive `RootErrorCode` from an exception name/message or accept an
arbitrary slug. If the application cannot classify an unrecovered failure into
one of its fixed categories, use `unexpected_application_error`.

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
- Characterize the uninstrumented disconnect policy before editing. If the
  application already uses the request/disconnect signal to abort upstream
  model/tool work, preserve that propagation before best-effort telemetry. Do
  not add upstream abort solely for tracing.
- Record `transport.client_disconnected` separately from the application
  terminal outcome. A disconnect is not automatically an application
  cancellation. When the application actually cancels, cancellation wins races
  with `onFinish` and its check belongs in the persistence commit. When a
  pre-existing application-owned consumer intentionally continues generation
  or persistence, keep the application root open and record its eventual
  success/failure alongside the disconnect.
- Use a separate durable trace only when the application already defines the
  continued work as a separate durable unit. If ownership is undocumented,
  preserve behavior and report it `blocked` rather than forcing abort, moving
  persistence, or inventing a tracing boundary.

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

Because AI SDK 5/6 does not await `onAbort`, any real application cancellation
must win the application's existing outcome race synchronously before that
callback returns and before any `await` or tracing work. But `onAbort` alone may
describe one stream consumer rather than the whole application when a
pre-existing detached owner continues. Always record the framework abort facet;
map it to `markApplicationCancelled()` only when installed-source evidence and
the application's terminal owner say the entire operation cancelled. The
response wrapper separately records that the client disconnected:

```ts
onAbort: () => {
  traceOnly('record framework/application abort facets', () => {
    lifecycle.recordFrameworkAbort();
    if (applicationTerminalOwner.outcome === 'cancelled') {
      lifecycle.markApplicationCancelled();
    }
  });
  // `applicationTerminalOwner` is the repository's pre-existing outcome
  // authority, not trace state. Application abort propagation is separate and
  // must not wait for tracing.
}
```

Keep application settlement and trace finalization as two ordered stages on
success, error, persistence failure, and real application cancellation:

1. The application's existing owner stops/settles application work according
   to the real terminal outcome.
2. That owner awaits the installed runtime's real public signal that the AI SDK
   framework telemetry span ended across every consumer assigned to this trace.
   This is real application/framework settlement: do not put it inside
   `traceOnlyAsync`, a telemetry timeout, or a telemetry `Promise.race`.
3. Only after stages 1–2 settle, invoke one bounded trace-only finalizer to write
   final semantic output or normalized error/cancel outcome.
4. That trace-only finalizer best-effort ends the application root.
5. It then attempts bounded `Tracer.forceFlush()` before response EOF or through
   a deployment primitive proven to survive tested freeze/restart.

The stages 1–2 owner retains and awaits its real promise under the application's
existing timeout/retry policy. The 500 ms telemetry budget starts only at stage
3 and therefore cannot detach, truncate, or relabel real work. The trace-only
finalizer is idempotent and single-flight, not a boolean early-return: memoize
one promise before its first await and return it to every settled terminal owner
so a second caller cannot continue while trace finalization/export is pending:

```ts
let traceFinalization: Promise<void> | undefined;

function finalizeTraceOnce(): Promise<void> {
  traceFinalization ??= (async () => {
    // TraceTerminalState is an instrumentation-local mirror of the real
    // application outcome. Application/framework settlement already completed
    // outside this function. Only trace work is subject to this deadline.
    await traceOnlyAsync(
      'trace finalization',
      async () => {
        const outcome = terminalState.freezeAndRead();
        // This helper writes/ends this turn independently, then routes its only
        // exporter call through requestJudgmentFlushWithDeadline.
        await writeEndAndFlushTrace(outcome); // trace-only; never awaits app work
      },
      500, // default; a different value requires a recorded application EOF SLO
    );
  })();
  return traceFinalization;
}

// Only after the existing owner has awaited real application/framework work:
await finalizeTraceOnce();
```

`terminalState` is an instrumentation-local, pure synchronous mirror of the
repository's real application outcome; it never controls response, persistence,
retry, or cancellation. `markApplicationCancelled()` and
`markStreamFailure()` translate
already-observed application events into fixed trace categories;
`freezeAndRead()` atomically returns the winner and prevents a later callback
from overwriting it. Guard every transition so an injected throw blocks tracing
evidence without changing application behavior. The application's existing
terminal-outcome rule decides which event is mirrored as the winner. Test two
concurrent callers and prove both receive the same pending trace-finalization
promise until its one end/flush attempt finishes. Separately prove that a slow
real `frameworkSettled` promise is awaited to its actual outcome and is never
raced by the 500 ms trace-only deadline.

### Bind finalization to the existing settlement owner

Do not add `consumeStream`, a tee, or a background drain for tracing. First
classify who owned settlement before instrumentation. Use `response_eof` only
when the pre-instrumentation EOF path already awaited the same application or
framework promise and propagated its rejection to the client. Use
`detached_application` when an existing programmatic consumer settled
independently; in that mode EOF and reader errors retain their original timing
and semantics, while the consumer's original owner finalizes the trace later.
If neither owner has a proven completion signal after the outer AI SDK telemetry
span, the binding remains `blocked`.

The wrapper replaces the returned response body; it is not a second consumer.
It forwards the same chunks, status, status text, and headers. Give its outer
queue a zero high-water mark so it does not add a second eager chunk beyond the
source stream's own queue. `frameworkSettled` is the retained existing promise
from the pre-instrumentation call site, including its existing timeout/rejection
policy. Only the owner that already awaited it may keep doing so: the response
wrapper in `response_eof` mode, or the original detached owner in
`detached_application` mode. Never rebind a detached rejection to
`controller.error`, delay clean EOF for it, wrap it in the 500 ms telemetry
deadline, or introduce a tracing timeout. If the existing owner has no proven
terminal settlement, this response binding is `blocked`.
`finalizeTraceOnce()` is the bounded, total, single-flight function above: it records
throw/rejection/timeout and always resolves. Never memoize the raw
trace-write/end/flush promise or include `frameworkSettled` inside it.

```ts
interface StreamLifecycle {
  markTransportDisconnected(): void;
  markTransportFailure(): void;
  recordFrameworkAbort(): void;
  markApplicationCancelled(): void;
  markStreamFailure(): void;
  finalizeTraceOnce(): Promise<void>;
}

type SettlementOwner = 'response_eof' | 'detached_application';
```

```ts
function bindResponseLifecycle(
  response: Response,
  frameworkSettled: Promise<void>,
  settlementOwner: SettlementOwner,
  lifecycle: StreamLifecycle,
): Response {
  if (!response.body) throw new Error('stream_response_body_missing');
  const reader = response.body.getReader();
  let clientDisconnected = false;

  async function failResponseReader(
    controller: ReadableStreamDefaultController<Uint8Array>,
    error: unknown,
  ): Promise<void> {
    if (clientDisconnected) return;
    // A reader failure is transport evidence, not an application verdict.
    traceOnly('mark transport failure', () => lifecycle.markTransportFailure());
    controller.error(error); // preserve the original reader error immediately

    if (settlementOwner === 'response_eof') {
      // In this mode the response was already the application-settlement owner.
      // Keep owning real settlement after signaling the original transport error,
      // then finalize without trying to error the controller a second time.
      try {
        await frameworkSettled;
      } catch {
        traceOnly('mark application failure', () => lifecycle.markStreamFailure());
      }
      await lifecycle.finalizeTraceOnce();
    }
    // detached_application: its unchanged original owner settles and finalizes.
  }

  async function failApplicationAtEof(
    controller: ReadableStreamDefaultController<Uint8Array>,
    error: unknown,
  ): Promise<void> {
    if (clientDisconnected) return;
    traceOnly('mark stream failure outcome', () => lifecycle.markStreamFailure());
    await lifecycle.finalizeTraceOnce(); // trace-only, bounded, and total
    if (!clientDisconnected) controller.error(error);
  }

  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      let next: ReadableStreamReadResult<Uint8Array>;
      try {
        next = await reader.read();
      } catch (error) {
        await failResponseReader(controller, error);
        return;
      }
      if (clientDisconnected) return;
      if (!next.done) {
        controller.enqueue(next.value);
        return;
      }

      if (settlementOwner === 'detached_application') {
        // Preserve pre-instrumentation EOF. The existing detached owner—not
        // this response—awaits frameworkSettled and then finalizes the trace.
        controller.close();
        return;
      }

      try {
        // Real application/framework work: deliberately outside the 500 ms
        // trace-only deadline and awaited under the existing owner policy.
        await frameworkSettled;
      } catch (error) {
        await failApplicationAtEof(controller, error);
        return;
      }
      if (clientDisconnected) return;
      await lifecycle.finalizeTraceOnce();
      if (clientDisconnected) return;
      controller.close();
    },
    async cancel(reason) {
      if (clientDisconnected) return;
      clientDisconnected = true;
      traceOnly('record transport disconnect', () =>
        lifecycle.markTransportDisconnected());
      // Preserve exactly the response reader's pre-instrumentation cancel
      // behavior. Invoke an additional upstream abort primitive only if the
      // application already invoked it here before tracing was added.
      await reader.cancel(reason);
      // Do not wait for `frameworkSettled` or telemetry here when the existing
      // application owns continued work: that would change cancel-return
      // latency. Its pre-existing completion owner must invoke finalizeTraceOnce
      // after framework settlement. If no pre-existing owner covers the cancel
      // branch, cancel finalization remains blocked; do not manufacture one.
    },
  }, { highWaterMark: 0 });

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
```

If `frameworkSettled` can reject for real application work, retain exactly the
pre-instrumentation response/error/persistence behavior. Do not convert that
rejection into a telemetry-only warning. In contrast, all trace-only work
inside `finalizeTraceOnce()` is guarded and cannot reject or hang into the response.
The wrapper-local `clientDisconnected` bit prevents an EOF/error continuation from
closing, erroring, or reclassifying the stream after the disconnect. Do not
catch controller-state errors as model/stream failures.

For an existing detached application consumer, use
`settlementOwner='detached_application'` and bind `finalizeTraceOnce()` to that
consumer's original application owner, not to EOF, reader error, or the response
`cancel()` method. That owner records the actual final application success/error
after `frameworkSettled`; the root can therefore contain both
`transport.client_disconnected=true` and a successful application result. If no
existing lifecycle owner can keep the runtime alive through that finalizer,
export-after-disconnect remains `blocked` rather than being forced into the
transport callback.

Before accepting this adapter, compare it with the uninstrumented response
under a slow reader and a mid-read abort. With no downstream read, it must not
pull the source more often than the original response. Chunk bytes/order,
status, headers, terminal outcome, upstream cancellation, persistence, and
tool-call behavior must match. If the installed runtime needs BYOB or another
non-default queuing strategy, this generic adapter is not proof; implement and
test the repository's existing strategy or leave the binding `blocked`.

Measure matched uninstrumented and instrumented time-to-first-byte, chunk
cadence, EOF, and cancel-promise settlement for success, failure, and disconnect.
Trace-only finalization may add at most 500 ms to EOF by default; a different
limit requires a recorded application SLO. A telemetry timeout preserves the
application result but blocks the export gate. Do not accept a five-second EOF
delay merely because it eventually produces a trace.

`onFinish`, `onAbort`, response cancellation, a sleep, a UI waterfall, a private
hook, or a second consumer is not a framework-child settlement signal. If no
reliable signal exists, report the child-window gate `blocked`; do not end the
root early and call it complete.

Never final-flush while a framework child may still be open. That can export a
root and inner children before their parent arrives. A trace with a non-root
span whose parent is absent fails tree completeness and cannot pass timing even
when the root covers every span that happened to arrive.

When the response consumer belongs to this trace, its wrapper may delay only
final EOF while finalization settles. Its cancel branch records transport
disconnect and preserves the response reader's original cancellation behavior;
it invokes an additional upstream abort only when the uninstrumented
application already did so. Existing application-owned continued work settles
through its original owner, which records the final application outcome and
invokes fail-open finalization. Preserve controller close/error/cancel behavior.

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
const TRACE_ATTRIBUTE_UTF8_BYTE_LIMIT = 1_500;
const TRACE_UTF8_ENCODER = new TextEncoder();
const EXACT_SECRET_KEYS = new Set([
  'authorization', 'proxy_authorization', 'http_authorization',
  'cookie', 'set_cookie', 'session', 'session_token', 'session_cookie',
]);
const SECRET_KEY_SUFFIXES = [
  'api_key', 'secret', 'secret_key', 'secret_access_key', 'client_secret',
  'access_token', 'refresh_token', 'token', 'password', 'passwd',
  'cookie', 'session_token', 'session_cookie',
];
const AUTH_LINE_RE = /^([ \t]*(?:proxy-)?authorization[ \t]*:[ \t]*).*$/gim;
const AUTH_ENV_LINE_RE = /^([ \t]*(?:(?:http|proxy)[_-])?authorization[ \t]*=[ \t]*).*$/gim;
const COOKIE_LINE_RE = /^([ \t]*(?:set-)?cookie[ \t]*:[ \t]*).*$/gim;
const PRIVATE_KEY_BLOCK_RE = /-----BEGIN(?: [A-Z0-9]+)* PRIVATE KEY-----[\s\S]*?-----END(?: [A-Z0-9]+)* PRIVATE KEY-----/gi;
const STANDALONE_AUTH_SCHEME_RE = /\b(?:Bearer|Basic)[ \t]+[A-Za-z0-9._~+/=-]+/gi;
const QUOTED_SENSITIVE_HEADER_RE = /('(?:(?:proxy-)?authorization|(?:set-)?cookie)\s*:\s*)[^'\r\n]*'|("(?:(?:proxy-)?authorization|(?:set-)?cookie)\s*:\s*)[^"\r\n]*"/gi;
const INLINE_SENSITIVE_HEADER_RE = /((?:(?:proxy-)?authorization|(?:set-)?cookie)\s*:\s*)(?!\s*\[redacted\])[^\r\n]*/gi;
const KEY_LABEL_RE = /((["']?)([A-Za-z][A-Za-z0-9_-]*)\2\s*[:=](?!\s*\[redacted\])\s*)/gi;
const QUERY_PARAM_RE = /([?&#])([^?&=#\s]+)=([^&#\s]*)/g;

function normalizeTraceKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function isSecretTraceKey(key: string): boolean {
  const normalized = normalizeTraceKey(key);
  return EXACT_SECRET_KEYS.has(normalized) || SECRET_KEY_SUFFIXES.some(
    (suffix) => normalized === suffix || normalized.endsWith(`_${suffix}`),
  );
}

function traceUtf8ByteLength(value: string): number {
  return TRACE_UTF8_ENCODER.encode(value).byteLength;
}

function sanitizeTraceQueryParams(value: string): string {
  return value.replace(QUERY_PARAM_RE, (match, separator, rawKey) => {
    let key = rawKey;
    try {
      key = decodeURIComponent(rawKey.replace(/\+/g, ' '));
    } catch {}
    return isSecretTraceKey(key)
      ? `${separator}${rawKey}=[redacted]`
      : match;
  });
}

function sanitizeTraceAssignments(value: string): string {
  let output = '';
  let copiedThrough = 0;
  KEY_LABEL_RE.lastIndex = 0;

  for (let match = KEY_LABEL_RE.exec(value); match !== null;
       match = KEY_LABEL_RE.exec(value)) {
    const [label, , , key] = match;
    if (!isSecretTraceKey(key)) continue;

    const valueStart = match.index + label.length;
    let valueEnd = valueStart;
    const quote = value[valueStart];
    if (quote === '"' || quote === "'") {
      valueEnd += 1;
      let escaped = false;
      while (valueEnd < value.length) {
        const character = value[valueEnd++];
        if (!escaped && character === quote) break;
        escaped = !escaped && character === '\\';
        if (character !== '\\') escaped = false;
      }
    } else {
      const auth = value.slice(valueStart).match(
        /^(?:Bearer|Basic)[ \t]+[A-Za-z0-9._~+/=-]+/i,
      );
      valueEnd = valueStart + (auth?.[0].length ?? 0);
      if (!auth) valueEnd = valueStart;
      // For a secret key, privacy wins over a no-space comma/semicolon/&
      // boundary: consume the complete unquoted token even if its tail looks
      // like another assignment. A later benign field needs whitespace.
      while (valueEnd < value.length && !/[\s}\]]/.test(value[valueEnd])) {
        valueEnd += 1;
      }
    }

    output += value.slice(copiedThrough, match.index);
    output += `${label}"[redacted]"`;
    copiedThrough = valueEnd;
    KEY_LABEL_RE.lastIndex = valueEnd;
  }
  return output + value.slice(copiedThrough);
}

function protectQuotedSensitiveHeaders(value: string): {
  protectedValue: string;
  restore: (sanitized: string) => string;
} {
  // Keep a complete quoted shell header out of overlapping assignment/header
  // regexes. The sentinel is chosen outside the input, then restored only to a
  // fully sanitized header; no original secret value is retained.
  let sentinelPrefix = '\uE000judgment_header_';
  while (value.includes(sentinelPrefix)) sentinelPrefix += '_';
  const replacements: Array<[string, string]> = [];
  const protectedValue = value.replace(
    QUOTED_SENSITIVE_HEADER_RE,
    (_match, singlePrefix, doublePrefix) => {
      const placeholder = `${sentinelPrefix}${replacements.length}\uE001`;
      const sanitized = singlePrefix
        ? `${singlePrefix}[redacted]'`
        : `${doublePrefix}[redacted]"`;
      replacements.push([placeholder, sanitized]);
      return placeholder;
    },
  );
  return {
    protectedValue,
    restore: (sanitized) => replacements.reduce(
      (current, [placeholder, replacement]) =>
        current.split(placeholder).join(replacement),
      sanitized,
    ),
  };
}

function sanitizeTraceText(value: string): string {
  const stripped = value.trimStart();
  if (stripped.startsWith('{') || stripped.startsWith('[')) {
    try {
      const structured = sanitizeTraceValue(JSON.parse(value));
      return JSON.stringify(structured);
    } catch {
      // Continue with conservative free-text rules.
    }
  }

  // Multiline blocks must be removed first. A greedy inline/header rule can
  // otherwise consume a BEGIN delimiter and leave the key body behind.
  const withoutPrivateKeys = value.replace(PRIVATE_KEY_BLOCK_RE, '[redacted]');
  const quotedHeaders = protectQuotedSensitiveHeaders(withoutPrivateKeys);

  // Redact full-URL query values before the generic key/value pattern can
  // treat `https:` as one harmless assignment and consume the query.
  const redacted = sanitizeTraceAssignments(
    sanitizeTraceQueryParams(quotedHeaders.protectedValue),
  )
    // Unquoted inline shell-header boundaries are ambiguous, so remove the
    // remainder of that line conservatively.
    .replace(INLINE_SENSITIVE_HEADER_RE, '$1[redacted]')
    .replace(AUTH_LINE_RE, '$1[redacted]')
    .replace(AUTH_ENV_LINE_RE, '$1[redacted]')
    .replace(COOKIE_LINE_RE, '$1[redacted]')
    // Scheme tokens can appear without an Authorization header label in tool
    // output, logs, copied commands, or a camelCase key/value fragment.
    .replace(STANDALONE_AUTH_SCHEME_RE, '[redacted]')
    .replace(/\b(?:sk-[A-Za-z0-9_-]{10,}|ghp_[A-Za-z0-9]{10,}|github_pat_[A-Za-z0-9_]{10,}|xox[baprs]-[A-Za-z0-9-]{8,})\b/g, '[redacted]')
    .replace(/(\b[A-Za-z][A-Za-z0-9+.-]*:\/\/)[^/\s:@]*:[^/\s@]+@/g, '$1[redacted]@');
  return quotedHeaders.restore(redacted);
}

function sanitizeTraceValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeTraceValue);
  if (value !== null && typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return sanitizeTraceText(String(value));
    }
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      isSecretTraceKey(key)
        ? '[redacted]'
        : sanitizeTraceValue(item),
    ]));
  }
  return typeof value === 'string' ? sanitizeTraceText(value) : value;
}

function boundSanitizedTraceValue(rawValue: unknown): unknown {
  // This combined API makes the required order hard to reverse: sanitize the
  // complete composed value first, then bound the aggregate serialization.
  const sanitized = sanitizeTraceValue(rawValue);
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(sanitized);
  } catch {
    return { omitted: 'unserializable' };
  }
  if (typeof serialized !== 'string') return { omitted: 'unserializable' };
  if (traceUtf8ByteLength(serialized) <= TRACE_ATTRIBUTE_UTF8_BYTE_LIMIT) {
    return sanitized;
  }

  // Find the longest preview whose complete truncation envelope, after its own
  // JSON escaping and UTF-8 encoding, remains <=1,500 bytes. JavaScript string
  // length counts UTF-16 code units, not storage bytes, so it is not a bound.
  const characters = Array.from(serialized);
  let low = 0;
  let high = characters.length;
  let best = { truncated: true, sanitizedPreview: '' };
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const candidate = {
      truncated: true,
      sanitizedPreview: characters.slice(0, middle).join(''),
    };
    if (traceUtf8ByteLength(JSON.stringify(candidate)) <=
        TRACE_ATTRIBUTE_UTF8_BYTE_LIMIT) {
      best = candidate;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return best;
}
```

This is not a PII or domain-secret policy. Unit-test every listed shape,
including `Authorization: ApiKey`, `Authorization: Digest`,
`Proxy-Authorization: Custom`, quoted JSON keys, a nearby benign field that must
survive, structured and serialized `JUDGMENT_API_KEY` /
`AWS_SECRET_ACCESS_KEY` / `CLIENT_SECRET` / camelCase access-token/password /
cookie/session-token values, `Set-Cookie`, `HTTP_AUTHORIZATION`, the exact
unquoted regressions `PASSWORD=CANARY,SECOND SURVIVES_PASSWORD_TAIL`,
`PASSWORD=CANARY,SECOND=NO SURVIVES_ASSIGNMENT_SHAPED_TAIL`,
`BENIGN=SURVIVES,PASSWORD=CANARY`, and
`FOO=x;JUDGMENT_API_KEY=CANARY`, quoted comma/semicolon-bearing `PASSWORD`,
query-string/plain assignments, and a full URL such as
`https://example.test/?api_key=CANARY&benign=SURVIVES` plus a fragment such as
`https://example.test/#access_token=CANARY&benign=SURVIVES`, and URL userinfo
under a non-HTTP scheme such as `amqps://user:CANARY@host` plus password-only
`redis://:CANARY@host:6379/0`, and quoted shell headers such as
`curl -H 'Authorization: Bearer CANARY' https://benign.example` and
`curl -H 'Cookie: sid=CANARY; refresh=CANARY2' https://benign.example`, plus
single-quoted Digest values containing double-quoted fields and double-quoted
Cookie values containing single-quoted fields while the adjacent URL survives;
standalone `Bearer CANARY` and `Basic CANARY` text; unquoted
`httpAuthorization=Bearer CANARY`; and RSA, EC, OPENSSH, and generic multiline
private-key blocks. Put several of these in one composed payload with benign
markers before, between, and after them so ordering bugs are exercised. Assert
the full unquoted password values (including `,SECOND` and `,SECOND=NO`) are
absent while both whitespace-separated survival markers remain, both later
secret assignments are redacted, and `SURVIVES` plus `FOO=x` remain. Also assert
`traceUtf8ByteLength(JSON.stringify(boundSanitizedTraceValue(value))) <= 1_500`
for long ASCII, multibyte Unicode/emoji, escape-heavy strings, arrays, objects,
and the truncation envelope;
then run the raw canary matrix below. Isolated regex/helper tests are not
stored-path proof. Use the combined `boundSanitizedTraceValue` at setters so
full sanitization always precedes aggregate bounding; do not rely on a greedy
whole-line JSON regex. A policy-approved business `sessionId` is deliberately
separate and is set through `Tracer.setSessionId`, not copied through this
payload sanitizer.

Sanitize the final composed value before bounding. The complete serialized
`judgment.input`/`judgment.output`, including truncation metadata, must be no
larger than 1,500 UTF-8 bytes and remain parseable in settled raw storage.
Truncation is not redaction. Treat short queries, shell commands,
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
import { SpanStatusCode } from '@opentelemetry/api';

let toolSpan: ReturnType<typeof Tracer.getCurrentSpan> | undefined;
traceOnly('tool input', () => {
  toolSpan = Tracer.getCurrentSpan();
  if (!toolSpan) return;
  Tracer.setSpanKind('tool', toolSpan);
  toolSpan.updateName(`application.tool.${businessToolName}`);
  Tracer.setInput(
    boundSanitizedTraceValue(projectApprovedToolInput(realToolInput)),
    toolSpan,
  );
});

try {
  const result = await existingToolWork();
  traceOnly('tool output', () => {
    if (toolSpan) {
      Tracer.setOutput(
        boundSanitizedTraceValue(projectApprovedToolOutput(result)),
        toolSpan,
      );
    }
  });
  return result;
} catch (error) {
  const code = 'tool_execution_failed'; // fixed application-owned category
  traceOnly('tool error output', () => {
    if (toolSpan) Tracer.setOutput({ ok: false, errorCode: code }, toolSpan);
  });
  traceOnly('tool error status', () => {
    if (toolSpan) toolSpan.setStatus({ code: SpanStatusCode.ERROR, message: code });
  });
  throw error; // preserve the exact original application exception
}
```

Never call `Tracer.setError(error)` or copy the raw message/stack. A generic
`ai.toolCall` with missing, `null`, or empty-object Judgment IO fails tool
usefulness. If the installed API does not expose the correct active span,
retain its business-name attribute, report scanability/IO `blocked`, and do not
duplicate the tool merely to improve display.
The guarded callbacks own every trace-only lookup, rename, sanitizer, and
setter. The real tool call stays outside them and runs once even when any
telemetry operation throws. `projectApprovedToolInput/Output` are
application-specific field allowlists, not identity functions: they retain only
the approved operation/outcome fields and omit file bodies, history, schemas,
raw records, command output, and other bulk data even when those fields contain
no credential-shaped text. The required order is field projection without
truncation, then sanitization, then aggregate bounding; bounding before
sanitization can split a credential and leak its remainder.

Do not hoist `Tracer.getCurrentSpan()`, `span.updateName(...)`, field
projection, `sanitizeTraceValue`, `boundSanitizedTraceValue`, or a trace setter
out of `traceOnly` for convenience. Fault-inject each stage independently,
including lookup throw, rename throw, projection/sanitizer throw, input/output
setter throw, and status throw. For every subcase the real tool executes once,
returns or throws the same value/object, persistence and streamed bytes are
unchanged, and the telemetry fault is reported safely.

## 7. Prove the production path

Before running any build, typecheck, import, static-generation, smoke, or dev
command, start a fresh process with all Judgment/Judgeval/OTel credentials and
exporter headers explicitly empty before application/SDK import and use
`OTEL_SDK_DISABLED=true` where supported, or inject a proven no-export/in-memory
tracer. A frozen-lock build must leave the recorded `next`/`ai` versions
unchanged. Only the separately launched real production-style route receives
live export configuration.

Build and start the production-style route. Run uniquely identifiable normal,
tool, model-error, persistence-error, real client-abort, and cold-start/restart
turns. Record exact session/customer IDs and returned application outcomes.
Immediately restart after a completed bounded export where applicable, wait for
ingestion, then reconcile settled raw Judgment data.

Use the deployment ledger from section 2. When the selected production-style
topology uses Docker Compose, first retain the rendered `docker compose config`
showing every required
`JUDGMENT_*` variable forwarded into the named service, then run the scenario
and valid/empty/unknown routing controls through that exact checked-in Compose
path. A direct host launch of `.next/standalone/server.js` is only diagnostic and
cannot pass these gates.

After each awaited bounded flush, poll until the expected complete parent tree,
span-ID set, terminal IO/status, and timestamps remain unchanged across a named
stability interval. Record raw-read timestamps and a span-set hash. Missing or
changing data remains `blocked`; a single read cannot prove late framework/tool
children have settled.

Evidence is path-specific. An error-path trace cannot pass normal success,
tool, persistence, cancellation, or general finalization. Inspect at least one
real successful tool-bearing stored turn before those gates pass. Verify every
parent resolves before timing arithmetic; a partial tree is never a timing
pass. A finite client-owned HTTP stream has a disconnect-ownership gate:
uncharacterized baseline behavior, unexercised mid-read disconnect, changed
upstream/persistence policy, or undocumented continued completion is `blocked`
or failed, never `not-applicable`. Do not claim the integration complete while
a required path remains blocked.

Platform Behavior/Code Judge evidence is result-specific too. Cite the exact
settled trace ID, Behavior/Judge version, result ID, and inspected result
payload. Zero returned results, a missing result, or an aggregate without that
provenance is blocked evidence; never infer a green outcome from absence.

Trigger the disconnect while a response-body read is pending. This is the
binding test for the extra-consumer/backpressure race; a disconnect before
stream reading or after ordinary EOF does not characterize active work. Compare
against the uninstrumented app. If the baseline cancels upstream, prove the
instrumented path still cancels and prevents late side effects. If a pre-existing
application owner continues and persists, prove tracing preserves that behavior
and stores transport disconnect separately from the final application outcome.

Require:

- exactly one nonzero-duration business root per completed turn, with final
  semantic IO and no health/readback noise;
- raw trace/span/parent IDs prove model/tool children share the root trace and
  stay inside its window. Normalize units and derive timestamp precision from
  raw stored values or documented platform resolution. Compute `start_margin =
  min(child_start) - root_start` and `end_margin = root_end - max(child_end)`;
  each margin `>= 0` passes, `-precision < margin < 0` is inconclusive and must
  be repeated, and `margin <= -precision` fails. An empty root parent is required
  only without deliberate upstream distributed context;
- raw stored kinds are `agent` for the application turn root and `tool` for
  executed business tools. Real model spans must be `llm` when the installed
  public integration exposes a supported binding; if it does not, model-kind
  coverage is `blocked`, not inferred from an `ai.*` name or filled with a fake
  span;
- exact session/customer identity and completed pre/post-restart roots;
- transport disconnect is distinct from the final application outcome; real
  application cancellation still stops upstream work/no late side effects,
  while pre-existing detached completion keeps its actual owner and result;
- success, model error, persistence error, and abort each have matching stored
  terminal outcomes;
- exact routing reaches the intended project; the empty and same-type unknown
  name/ID negatives fail as expected without readiness/creation; and the valid
  positive control starts; and
- semantic/storage parsing and the full raw canary search pass, including one
  composed standalone Bearer/Basic plus multiline-private-key payload and a
  proof that every final serialized stored attribute is <=1,500 UTF-8 bytes; and
- active-span lookup, rename, sanitizer, and setter fault injection leaves the
  response, persistence, tool count, and original exception identical; and
- a hung-exporter injection followed by multiple completed turns starts at most
  one process-wide exporter call, reports later attempts busy/blocked, retains
  no per-request exporter-call storm, and leaves every response unchanged.

For each terminal path, record matched uninstrumented/instrumented
time-to-first-byte, chunk cadence, EOF, and cancel-promise settlement. The
default trace-only finalization/export overhead budget is <=500 ms unless a
documented application SLO proves another value. Timeout remains fail-open and
blocks export verification.

Run every non-live unit/stub/fake/build/typecheck/import/smoke/dev/static-
generation command in a fresh process with all export-capable
Judgment/Judgeval/OTel credentials and exporter headers explicitly overridden
empty before any app/SDK import, and `OTEL_SDK_DISABLED=true` where supported;
or inject a proven no-export/in-memory tracer. If config requires a project
string, use an obviously synthetic value only after proving the exporter is
disabled. Merely unsetting can let dotenv refill values, clearing after import
is too late, and `setdefault` is not isolation. Reconcile named live probes and
require zero unexplained Monitoring roots.

Builds, types, unit tests, scratch spans, and successful HTTP responses are not
stored-path proof. Missing traffic, credentials, terminal hooks, raw spans, or
export is `blocked`; use `not-applicable` only when the architecture genuinely
lacks a gate.
