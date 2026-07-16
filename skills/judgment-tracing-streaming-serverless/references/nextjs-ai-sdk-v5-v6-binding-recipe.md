# Next.js AI SDK 5/6 Streaming Binding Recipe

Apply this only to a Next.js Node-runtime route returning a Vercel AI SDK 5/6
`streamText` text response (confirm versions in the lockfile). Not for AI SDK 7,
Edge runtime, `toUIMessageStreamResponse`, WebSockets, or indefinite streams.
After dependencies are installed, run
`node <skill-directory>/scripts/inspect-ai-sdk-contract.mjs <app-root>`
(`<skill-directory>` = the directory containing the streaming `SKILL.md`) and
keep its JSON as static evidence. A nonzero result blocks this binding.

**Naming rule:** derive every root and tool span name from the application's
own domain: `<app>.<unit>` (a Deskflow support turn is `deskflow.turn`, its
tools `deskflow.tool.lookup_order` etc.). The literal example names in this
file (`application.chat_turn`, `application.tool.*`) are placeholders;
shipping a placeholder name verbatim is a completion failure.

Record `package.json`/lockfile hashes and exact `next`/`ai` versions before and
after adding the tracing dependency via the repository's existing package
manager with a frozen-lock install. Any unrelated dependency change blocks the
binding. Use only public SDK APIs; a private/underscored call requires a pinned
version plus an executable test in the built production bundle, otherwise mark
that capability `blocked`.

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

One completed user turn is one application root with a stable business name.
Start it after auth/session validation but before `streamText` is constructed;
set the exact session/customer ID on the active root so AI SDK children inherit
it. Keep the root open through generation, tools, streaming, persistence, and
framework telemetry settlement — returning a response is not completion. The
root needs bounded semantic input and a final answer or normalized terminal
output; counts or omission markers alone are behavior-blind.

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
        // Identity uses the DEDICATED setters, not fields inside
        // judgment.input: platform session/customer grouping and the E6
        // customer gate read judgment.session_id / judgment.customer_id.
        traceOnly('root identity', () => {
          Tracer.setSessionId(validatedSessionId, rootSpan);
          if (validatedCustomerId) {
            Tracer.setCustomerId(validatedCustomerId, rootSpan);
          }
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

- Initialize Judgeval once in the Node branch of `instrumentation.ts` (delayed
  import so Edge does not load the Node SDK).
- **Required config edit — without it the production build silently exports
  nothing.** Next.js bundles `judgeval` separately into `instrumentation.ts`
  and the route unless it is externalized, so `register()` initializes one SDK
  copy while the route calls an uninitialized second copy (no error, no
  export). Add to the existing `next.config.mjs`, preserving other settings:

  ```js
  const nextConfig = {
    // ...existing settings...
    serverExternalPackages: ['judgeval'],
  };
  ```

  Then prove the singleton in the built output before any live claim:

  ```bash
  # exactly one bundled copy means externalization worked; more than one
  # (or judgeval missing from the standalone node_modules) fails this gate
  find .next/standalone -path '*node_modules/judgeval/package.json' | wc -l
  grep -rl "judgeval" .next/server/chunks 2>/dev/null | head -3  # should be references, not an inlined copy
  ```

  A dev-server test cannot detect this failure: dev module resolution shares
  one copy, so tracing "works" in dev and silently no-ops in the Compose
  production build. Live verification against anything other than the
  checked-in production launcher does not count.
- Require the intended existing project, fail-closed: compare the resolved
  runtime ID with the expected project ID, or keep routing blocked until a
  unique live probe settles in that exact project. If name-based init can
  create projects, resolve through a read-only lookup first.
- **The selected checked-in launcher is authoritative.** Write a deployment
  ledger: exact build/start commands, runtime process, and — when the topology
  uses Compose — the compose file, service, and env-file. Render
  `docker compose config` with those exact inputs and prove every required
  `JUDGMENT_*` value is forwarded into the scored service. A value visible only
  on the host is a deployment failure. A direct host run of
  `.next/standalone/server.js` is diagnostic only and cannot pass the
  deployment, routing, or export gates.
- Run the real launcher (through Compose when Compose is the topology) three
  ways: valid project (must start), project explicitly empty, and a unique
  unknown name/ID of the accepted type (both must fail before readiness without
  creating the unknown target). An `unset` that dotenv can repopulate is not a
  negative test.

Use the installed AI SDK 5/6 telemetry integration with Judgment's tracer and
disable uncontrolled provider `recordInputs`/`recordOutputs`. Production route
evidence, not a successful build, proves singleton activation.

## 3. Use one fail-open turn outcome

One manually controlled active root, one terminal-state owner:

1. Every telemetry-only operation — active-span lookup, rename, setter,
   sanitizer, status write, root end, reporter, flush — runs inside a guard.
   `const span = Tracer.getCurrentSpan(); span?.updateName(name);` outside a
   `traceOnly` callback is forbidden: an injected lookup failure must not
   become a user-visible failure.
2. Original application errors stay in memory. Tracing stores only a closed
   application-owned code set (`stream_construction_failed`, `stream_failed`,
   `persistence_failed`, ...) as bounded output like
   `{ ok: false, errorCode: 'persistence_failed' }` with matching raw
   OpenTelemetry `ERROR` status. Never `Tracer.setError(rawError)` or store
   message/stack. Cancellation is an explicit bounded `cancelled` outcome and
   never appears as success.
3. Tracing does not choose new persistence/recovery policy; preserve the
   repository's existing behavior exactly. Success, error, persistence failure,
   and cancellation converge on one idempotent finalizer.
4. A telemetry failure blocks tracing verification but never replaces the
   reply, original exception, cancellation, or persistence result. A retained
   pre-existing application consumer/completion promise is different: its
   rejection is a real application outcome and keeps its existing semantics.

Use separate synchronous and awaited guards — a synchronous `try/catch` cannot
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

The timeout applies only to trace-only terminal writes/end/export — never to
real generation, persistence, or an existing application-owned settlement
promise. Default it to at most **500 ms**; a different bound requires a recorded
application response/EOF SLO. On timeout, preserve the exact application
response and mark export verification blocked — a five-second EOF delay for
telemetry is a user-visible latency regression, not fail-open design. Route
every exporter call through `requestJudgmentFlushWithDeadline`: a timed-out
exporter stays the one process-wide in-flight call and later requests report
busy instead of queueing.

Record root errors through a closed type; application catch/rethrow/recovery
stays outside it:

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

- Map every pre-existing consumer, tee, and detached drain before editing.
  **Never add `result.consumeStream()` or any extra consumer for tracing** — a
  tee removes backpressure and lets generation, tools, and persistence continue
  after the client cancels. If the response body is the only consumer, keep it
  the only one.
- With multiple pre-existing consumers, do not delete or repurpose any.
  Require a public completion barrier covering every consumer that belongs to
  this trace; the first consumer to finish is not such a barrier. Retain each
  pre-existing consumer's promise at its existing call site (do not `void` it)
  and use it as settlement evidence only after installed-source proof that it
  resolves after the outer framework span. Beware result getters such as
  `finishReason` that internally start `consumeStream()`.
- Do not buffer the response; forward chunks, status, and headers unchanged.
- Characterize the uninstrumented disconnect policy before editing. Record
  `transport.client_disconnected` separately from the application terminal
  outcome: a disconnect is not automatically a cancellation. If the app already
  aborts upstream on disconnect, preserve that; do not add upstream abort for
  tracing. When a pre-existing detached consumer intentionally continues, keep
  the root open and record its eventual result alongside the disconnect. If
  continued-work ownership is undocumented, preserve behavior and report
  `blocked` rather than inventing a boundary.

## 5. Finalize in binding order

Inspect the installed AI SDK source/source map and record the exact order of
`onFinish`, `onError`, `onAbort`, consumer completion, and outer `ai.streamText`
span end. **In AI SDK 5/6, `onFinish` and `onError` run before the framework
ends its span — an application-root end or `forceFlush()` reachable from either
callback is structurally early** and truncates the root window. These callbacks
may record an in-memory outcome only; final root end and flush are owned
outside them after a proven settlement barrier, else the gate is `blocked`.

`onAbort` is not awaited, so it cannot own awaited finalization, and any real
application cancellation must win its outcome race synchronously before that
callback returns. `onAbort` may also describe one consumer rather than the
whole application; map it to `markApplicationCancelled()` only when the
application's terminal owner says the entire operation cancelled:

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

`terminalState` is an instrumentation-local synchronous mirror of the real
application outcome; it never controls response, persistence, retry, or
cancellation. `freezeAndRead()` atomically returns the winner. Guard every
transition. Test two concurrent callers (both must receive the same pending
finalization promise) and prove a slow real `frameworkSettled` promise is
awaited to its actual outcome, never raced by the 500 ms trace-only deadline.

### Bind finalization to the existing settlement owner

Classify who owned settlement before instrumentation. `response_eof`: the
pre-instrumentation EOF path already awaited the application/framework promise
and propagated its rejection to the client. `detached_application`: an existing
programmatic consumer settled independently — EOF and reader errors keep their
original timing, and that consumer's original owner finalizes the trace later.
If neither owner has a proven completion signal after the outer AI SDK
telemetry span, the binding is `blocked`.

The wrapper below replaces the returned response body (it is not a second
consumer): same chunks, status, and headers, with a zero high-water mark so it
adds no eager extra pull. `frameworkSettled` is the retained pre-existing
promise with its existing timeout/rejection policy; only the owner that already
awaited it keeps doing so. Never rebind a detached rejection to
`controller.error`, delay clean EOF for it, or wrap it in the telemetry
deadline.

```ts
interface StreamLifecycle {
  // MUST guardedly write the root attribute
  // `transport.client_disconnected = true` in addition to updating the
  // in-memory mirror — the stored facet is graded, prose intent is not.
  markTransportDisconnected(): void;
  markTransportFailure(): void;
  // MUST guardedly write `framework.abort_observed = true` on the root.
  recordFrameworkAbort(): void;
  // MUST make the finalizer store an explicit bounded `cancelled` terminal
  // outcome (for example `{ ok: false, outcome: 'cancelled' }`) — a
  // disconnect facet alone is not a cancellation verdict, and a cancelled
  // turn must never store ordinary success output.
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

Notes on the adapter:

- A real `frameworkSettled` rejection keeps the exact pre-instrumentation
  response/error/persistence behavior; trace-only work inside
  `finalizeTraceOnce()` is guarded and cannot reject or hang into the response.
- In `detached_application` mode, bind `finalizeTraceOnce()` to the detached
  consumer's original owner — not EOF, reader error, or `cancel()`. The root
  may then contain both `transport.client_disconnected=true` and a successful
  application result. If no existing owner can keep the runtime alive through
  that finalizer, export-after-disconnect is `blocked`.
- Compare against the uninstrumented response under a slow reader and a
  mid-read abort: identical chunk bytes/order, status, headers, terminal
  outcome, upstream cancellation, persistence, and pull cadence. If the runtime
  needs BYOB or a non-default queuing strategy, this generic adapter is not
  proof — implement the repository's strategy or leave the binding `blocked`.
- `onFinish`, `onAbort`, response cancellation, a sleep, a UI waterfall, a
  private hook, or a second consumer is not a framework-child settlement
  signal. Never final-flush while a framework child may still be open: an
  orphaned child fails tree completeness and timing. If no reliable signal
  exists, report the child-window gate `blocked` — do not end the root early.
- Do not assume Next.js `after(...)`/`waitUntil(...)` survives hard kill; use
  it only when the tested deployment guarantees it. Never use detached
  `void Tracer.forceFlush()`.

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
// The root's semantic prompt/reply may use a larger budget: observed platform
// clipping starts near 2,000 serialized bytes, so 1,800 keeps margin while
// preserving more exact turn fidelity. Children/tools stay at 1,500.
const ROOT_TRACE_ATTRIBUTE_UTF8_BYTE_LIMIT = 1_800;
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

function boundSanitizedTraceValue(
  rawValue: unknown,
  byteLimit: number = TRACE_ATTRIBUTE_UTF8_BYTE_LIMIT,
): unknown {
  // This combined API makes the required order hard to reverse: sanitize the
  // complete composed value first, then bound the aggregate serialization.
  // Root judgment.input/output setters pass ROOT_TRACE_ATTRIBUTE_UTF8_BYTE_LIMIT.
  const sanitized = sanitizeTraceValue(rawValue);
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(sanitized);
  } catch {
    return { omitted: 'unserializable' };
  }
  if (typeof serialized !== 'string') return { omitted: 'unserializable' };
  if (traceUtf8ByteLength(serialized) <= byteLimit) {
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
    if (traceUtf8ByteLength(JSON.stringify(candidate)) <= byteLimit) {
      best = candidate;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return best;
}
```

This is not a PII or domain-secret policy. Unit-test the complete ordered
sanitizer on one composed payload with benign markers before, between, and
after the canaries — isolated regex tests miss ordering bugs (a greedy inline
rule consuming a private key's BEGIN delimiter, or a quoted-header rule eating
a benign tail). The fixture matrix must cover at least: scheme-agnostic
`Authorization:`/`Proxy-Authorization:` headers (ApiKey/Digest/custom),
standalone `Bearer <token>`/`Basic <token>`, camelCase and prefixed
assignments (`JUDGMENT_API_KEY=`, `AWS_SECRET_ACCESS_KEY=`,
`httpAuthorization=`), `Set-Cookie`/session values, secret-first
comma/semicolon tails (`PASSWORD=CANARY,SECOND=NO` — later benign fields need
whitespace), query/fragment credentials
(`https://example.test/?api_key=CANARY&benign=SURVIVES`), URL userinfo under
any scheme (`amqps://user:CANARY@host`, `redis://:CANARY@host`), quoted shell
headers with opposite nested quote kinds
(`curl -H 'Authorization: Bearer CANARY' https://benign.example`), provider
token shapes (`sk-`, `ghp_`, `github_pat_`, `xox*-`), and RSA/EC/OPENSSH
multiline private-key blocks. Assert every canary is absent, every benign
marker survives, and
`traceUtf8ByteLength(JSON.stringify(boundSanitizedTraceValue(value))) <= 1_500`
for long ASCII, multibyte, and escape-heavy values.

Always call the combined `boundSanitizedTraceValue` at setters so sanitization
precedes aggregate bounding — bounding first can split a credential and leak
its remainder. Truncation is not redaction. The complete serialized
`judgment.input`/`judgment.output`, including truncation metadata, must stay
within its budget (root prompt/reply <=1,800 bytes, everything else <=1,500)
and parseable in settled raw storage. The business
`sessionId` goes through `Tracer.setSessionId`, not this sanitizer.

For stored proof, place a benign semantic marker plus non-real canaries
(provider tokens, authorization, cookie/session, secret assignments, URL
credentials, private key) in input, output/error, and beyond-bound positions;
then search every settled raw root, provider/tool child, event, and resource
attribute. The marker survives; every canary, history, system prompt, tool
schema, and file body is absent.

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

A generic `ai.toolCall` with missing/empty Judgment IO fails tool usefulness.
If the installed API does not expose the correct active span, retain the
business-name attribute, report scanability/IO `blocked`, and do not duplicate
the tool span. `projectApprovedToolInput/Output` are application-specific field
allowlists, not identity functions: approved operation/outcome fields only, no
file bodies, history, schemas, or bulk data. Order: projection, then
sanitization, then bounding. The real tool call stays outside every guard and
runs once even when telemetry throws — fault-inject each stage (lookup, rename,
projection/sanitizer, setters, status) and prove the tool result, persistence,
and streamed bytes are unchanged.

## 7. Prove the production path

Keep every non-live command (unit/stub/build/typecheck/import/smoke/dev/
static-generation) export-free per the router's isolation principle: fresh
process, all Judgment/Judgeval/OTel credentials and exporter headers explicitly
overridden empty before any app/SDK import, `OTEL_SDK_DISABLED=true` where
supported. Only the separately launched production-style route gets live export
configuration.

Run the scenario through the section-2 deployment ledger — through the exact
checked-in Compose path when Compose is the topology, with the rendered
`docker compose config` retained as forwarding evidence. Exercise uniquely
identifiable normal, tool, model-error, persistence-error, real client-abort,
and cold-start/restart turns; record exact session/customer IDs and returned
outcomes; reconcile settled raw Judgment data after each awaited bounded flush
(poll until the parent tree, span-ID set, terminal IO, and timestamps are
unchanged across a named stability interval; record a span-set hash).

Trigger the client abort while a response-body read is pending — a disconnect
before reading or after EOF does not characterize active work. Compare against
the uninstrumented app: if the baseline cancels upstream, the instrumented path
still cancels with no late side effects; if a pre-existing owner continues and
persists, tracing preserves that and stores transport disconnect separately
from the final application outcome.

Required stored evidence (apply the router's margin arithmetic and evidence
labels):

- exactly one nonzero-duration business root per completed turn, with final
  semantic IO and no health/readback noise;
- model/tool children share the root trace and pass the margin rule; empty
  root parent unless deliberate upstream context exists;
- raw stored kinds: `agent` root, `tool` business tools; model spans `llm`
  when the installed public integration supports it, else `blocked` — never
  inferred from an `ai.*` name;
- exact session/customer identity and completed pre/post-restart roots;
- success, model error, persistence error, and abort each have matching stored
  terminal outcomes; transport disconnect stays distinct from the application
  outcome;
- routing positive/empty/unknown controls behave as section 2 requires;
- the raw canary search passes, including one composed standalone Bearer/Basic
  plus multiline-private-key payload, and every stored attribute is <=1,500
  UTF-8 bytes and parseable;
- fault injection (lookup, rename, sanitizer, setters) leaves response,
  persistence, tool count, and original exception identical; and
- a hung-exporter injection across multiple turns yields at most one
  process-wide exporter call, later attempts reported busy, all responses
  unchanged.

For each terminal path, record matched uninstrumented/instrumented
time-to-first-byte, chunk cadence, EOF, and cancel settlement; trace-only
overhead stays <=500 ms unless a documented SLO proves another value. Evidence
is path-specific — an error-path trace cannot pass the success gates; inspect
at least one real successful tool-bearing stored turn. Missing traffic,
credentials, raw spans, or export is `blocked`, and an unexercised
disconnect-ownership gate is `blocked` or failed, never `not-applicable`.
