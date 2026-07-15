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
  await traceOnlyAsync(
    'construction failure flush',
    async () => { await Tracer.forceFlush(); },
    5_000,
  );
}

async function activateTurn(): Promise<TurnBundle> {
  let callbackEntered = false;
  let applicationWork: Promise<TurnBundle> | undefined;

  try {
    return await Tracer.getOTELTracer().startActiveSpan(
      'application.chat_turn',
      (rootSpan) => {
        callbackEntered = true;
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
span, so every success terminal path ends the root through `finalizeOnce`, and
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
- Run the built real launcher with project explicitly empty and with a unique
  unknown name or ID of the same type it accepts under a 30-second supervisor
  and guaranteed cleanup. Both must exit with the expected routing error before
  readiness, the unknown target must not be created, and a valid-target positive
  control must start. `unset`, timeout, unrelated failure, or nonempty resolved
  ID alone does not pass.
- Inspect resolution semantics first. If name initialization can create a
  project, use a read-only lookup and reject the unknown name before that path.

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
```

Put trace-only sanitization/classification inside these callbacks. Await the
async guard for promise-returning finalization/export; never detach it or let a
rejection alter response, persistence, cancellation, retry, or the original
exception. Inject a rejecting async callback into the sync guard during tests;
it must be reported without an unhandled rejection, and the integration remains
blocked until the call site uses the awaited guard.

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

Because AI SDK 5/6 does not await `onAbort`, cancellation must win the shared
terminal-state race synchronously before that callback returns and before any
`await` or tracing work. Upstream abort propagation remains application work;
best-effort trace writes happen afterward:

```ts
onAbort: () => {
  traceOnly('mark cancellation outcome', () => lifecycle.markCancelled());
  // The guarded transition above is synchronous; application abort propagation
  // is separate and must not wait for tracing.
}
```

Use one idempotent finalizer on success, error, persistence failure, and cancel:

1. stop/settle application work according to the real terminal outcome;
2. await the installed runtime's real public signal that the AI SDK framework
   telemetry span has ended across every consumer assigned to this trace;
3. write final bounded semantic output or normalized error/cancel outcome;
4. best-effort end the application root; and
5. await a bounded `Tracer.forceFlush()` attempt before response EOF or through
   another deployment primitive proven to survive the tested freeze/restart.

“Idempotent” means single-flight, not a boolean early-return. Memoize one promise
before its first await and return that same promise to every EOF/error/cancel
caller so a second caller cannot continue while finalization/export is pending:

```ts
let terminalFinalization: Promise<void> | undefined;

function finalizeOnce(): Promise<void> {
  terminalFinalization ??= (async () => {
    // TraceTerminalState is an instrumentation-local mirror of the real
    // application outcome. Freeze/read and all final trace work stay inside the
    // bounded guard so this memoized promise is total.
    await traceOnlyAsync(
      'terminal finalization',
      async () => {
        const outcome = terminalState.freezeAndRead();
        await finalizeTurn(outcome);
      },
      5_000,
    );
  })();
  return terminalFinalization;
}

// Every terminal owner awaits this exact shared promise.
await finalizeOnce();
```

`terminalState` is an instrumentation-local, pure synchronous mirror of the
repository's real application outcome; it never controls response, persistence,
retry, or cancellation. `markCancelled()` and `markStreamFailure()` translate
already-observed application events into fixed trace categories;
`freezeAndRead()` atomically returns the winner and prevents a later callback
from overwriting it. Guard every transition so an injected throw blocks tracing
evidence without changing application behavior. The application's existing
terminal-outcome rule decides which event is mirrored as the winner. Test two
concurrent callers and prove both remain pending until the one
finalization/flush finishes.

### Bind finalization to the existing response owner

Do not add `consumeStream`, a tee, or a background drain for tracing. Use this
shape only when the application already had a programmatic consumer/completion
promise and installed-source inspection proves it settles after the outer AI
SDK telemetry span. If the response reader is the only consumer, this shape is
allowed only when the same inspection proves that reader completion has the
required ordering; otherwise the binding remains `blocked`.

The wrapper replaces the returned response body; it is not a second consumer.
It forwards the same chunks, status, status text, and headers. Give its outer
queue a zero high-water mark so it does not add a second eager chunk beyond the
source stream's own queue. `frameworkSettled` is the retained existing promise
from the pre-instrumentation call site, including any existing application-owned
timeout/rejection policy. Do not create a new unbounded wait here. If that
existing owner has no proven terminal settlement or bound, this response binding
is `blocked`; a tracing timeout must never truncate real application work.
`finalizeOnce()` is the bounded, total, single-flight function above: it records
throw/rejection/timeout and always resolves. Never memoize the raw
`finalizeTurn()` promise.

```ts
interface StreamLifecycle {
  markCancelled(): void;
  markStreamFailure(): void;
  finalizeOnce(): Promise<void>;
}
```

```ts
function bindResponseLifecycle(
  response: Response,
  frameworkSettled: Promise<void>,
  lifecycle: StreamLifecycle,
): Response {
  if (!response.body) throw new Error('stream_response_body_missing');
  const reader = response.body.getReader();
  let cancelled = false;

  async function failApplicationStream(
    controller: ReadableStreamDefaultController<Uint8Array>,
    error: unknown,
  ): Promise<void> {
    if (cancelled) return;
    traceOnly('mark stream failure outcome', () => lifecycle.markStreamFailure());
    await lifecycle.finalizeOnce(); // bounded and total; never rejects
    if (cancelled) return;
    controller.error(error); // the original source/framework failure only
  }

  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      let next: ReadableStreamReadResult<Uint8Array>;
      try {
        next = await reader.read();
      } catch (error) {
        await failApplicationStream(controller, error);
        return;
      }
      if (cancelled) return;
      if (!next.done) {
        controller.enqueue(next.value);
        return;
      }

      try {
        await frameworkSettled; // preserves the existing application policy
      } catch (error) {
        await failApplicationStream(controller, error);
        return;
      }
      if (cancelled) return;
      await lifecycle.finalizeOnce();
      if (cancelled) return;
      controller.close();
    },
    async cancel(reason) {
      if (cancelled) return;
      cancelled = true;
      traceOnly('mark cancellation outcome', () => lifecycle.markCancelled());
      // The guarded trace-outcome transition above completes synchronously
      // before the first await; `cancelled` still protects application flow if
      // the transition itself is fault-injected.
      // Invoke the repository's existing upstream abort primitive here before
      // reader.cancel, unless reader.cancel is proven to be that primitive.
      // This is application cancellation work, not a best-effort trace write.
      try {
        await reader.cancel(reason);
      } finally {
        await Promise.allSettled([frameworkSettled]);
        await lifecycle.finalizeOnce();
      }
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
inside `finalizeOnce()` is guarded and cannot reject or hang into the response.
The wrapper-local `cancelled` bit prevents an EOF/error continuation from
closing, erroring, or reclassifying the stream after cancellation wins. Do not
catch controller-state errors as model/stream failures.

Before accepting this adapter, compare it with the uninstrumented response
under a slow reader and a mid-read abort. With no downstream read, it must not
pull the source more often than the original response. Chunk bytes/order,
status, headers, terminal outcome, upstream cancellation, persistence, and
tool-call behavior must match. If the installed runtime needs BYOB or another
non-default queuing strategy, this generic adapter is not proof; implement and
test the repository's existing strategy or leave the binding `blocked`.

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
const QUOTED_SENSITIVE_HEADER_RE = /('(?:(?:proxy-)?authorization|(?:set-)?cookie)\s*:\s*)[^'\r\n]*'|("(?:(?:proxy-)?authorization|(?:set-)?cookie)\s*:\s*)[^"\r\n]*"/gi;
const INLINE_SENSITIVE_HEADER_RE = /((?:(?:proxy-)?authorization|(?:set-)?cookie)\s*:\s*)(?!\s*\[redacted\])[^\r\n]*/gi;
const KEY_VALUE_RE = /((["']?)([A-Za-z][A-Za-z0-9_-]*)\2\s*[:=](?!\s*\[redacted\])\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,&;}\]]+)/gi;
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

function sanitizeTraceText(value: string): string {
  const stripped = value.trimStart();
  if (stripped.startsWith('{') || stripped.startsWith('[')) {
    try {
      const structured = sanitizeTraceValue(JSON.parse(value));
      const serialized = JSON.stringify(structured);
      return serialized.length > TRACE_TEXT_LIMIT
        ? `${serialized.slice(0, TRACE_TEXT_LIMIT)}…`
        : serialized;
    } catch {
      // Continue with conservative free-text rules.
    }
  }

  // Redact full-URL query values before the generic key/value pattern can
  // treat `https:` as one harmless assignment and consume the query.
  const redacted = sanitizeTraceQueryParams(value)
    .replace(QUOTED_SENSITIVE_HEADER_RE, (_match, singlePrefix, doublePrefix) =>
      singlePrefix
        ? `${singlePrefix}[redacted]'`
        : `${doublePrefix}[redacted]"`,
    )
    // Unquoted inline shell-header boundaries are ambiguous, so remove the
    // remainder of that line conservatively.
    .replace(INLINE_SENSITIVE_HEADER_RE, '$1[redacted]')
    .replace(KEY_VALUE_RE, (match, label, _quote, key) =>
      isSecretTraceKey(key) ? `${label}"[redacted]"` : match,
    )
    .replace(AUTH_LINE_RE, '$1[redacted]')
    .replace(AUTH_ENV_LINE_RE, '$1[redacted]')
    .replace(COOKIE_LINE_RE, '$1[redacted]')
    .replace(/\b(?:sk-[A-Za-z0-9_-]{10,}|ghp_[A-Za-z0-9]{10,}|github_pat_[A-Za-z0-9_]{10,}|xox[baprs]-[A-Za-z0-9-]{8,})\b/g, '[redacted]')
    .replace(/(\b[A-Za-z][A-Za-z0-9+.-]*:\/\/)[^/\s:@]*:[^/\s@]+@/g, '$1[redacted]@')
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[redacted]');
  return redacted.length > TRACE_TEXT_LIMIT
    ? `${redacted.slice(0, TRACE_TEXT_LIMIT)}…`
    : redacted;
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

function boundSanitizedTraceValue(value: unknown): unknown {
  const serialized = JSON.stringify(value);
  if (typeof serialized !== 'string') return { omitted: 'unserializable' };
  if (serialized.length <= TRACE_TEXT_LIMIT) return value;
  return {
    truncated: true,
    sanitizedPreview: serialized.slice(0, TRACE_TEXT_LIMIT),
  };
}
```

This is not a PII or domain-secret policy. Unit-test every listed shape,
including `Authorization: ApiKey`, `Authorization: Digest`,
`Proxy-Authorization: Custom`, quoted JSON keys, a nearby benign field that must
survive, structured and serialized `JUDGMENT_API_KEY` /
`AWS_SECRET_ACCESS_KEY` / `CLIENT_SECRET` / camelCase access-token/password /
cookie/session-token values, `Set-Cookie`, `HTTP_AUTHORIZATION`, comma-bearing
`PASSWORD`, query-string/plain assignments, and a full URL such as
`https://example.test/?api_key=CANARY&benign=SURVIVES` plus a fragment such as
`https://example.test/#access_token=CANARY&benign=SURVIVES`, and URL userinfo
under a non-HTTP scheme such as `amqps://user:CANARY@host` plus password-only
`redis://:CANARY@host:6379/0`, and quoted shell headers such as
`curl -H 'Authorization: Bearer CANARY' https://benign.example` and
`curl -H 'Cookie: sid=CANARY; refresh=CANARY2' https://benign.example`, plus
single-quoted Digest values containing double-quoted fields and double-quoted
Cookie values containing single-quoted fields while the adjacent URL survives;
then
run the raw canary matrix below. Helper tests alone are not stored-path proof.
Prefer `sanitizeTraceValue` before serialization; do not rely on a greedy
whole-line JSON regex. A policy-approved business `sessionId` is deliberately
separate and is set through `Tracer.setSessionId`, not copied through this
payload sanitizer.

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
import { SpanStatusCode } from '@opentelemetry/api';

let toolSpan: ReturnType<typeof Tracer.getCurrentSpan> | undefined;
traceOnly('tool input', () => {
  toolSpan = Tracer.getCurrentSpan();
  if (!toolSpan) return;
  toolSpan.updateName(`application.tool.${businessToolName}`);
  Tracer.setInput(
    boundSanitizedTraceValue(
      sanitizeTraceValue(projectApprovedToolInput(realToolInput)),
    ),
    toolSpan,
  );
});

try {
  const result = await existingToolWork();
  traceOnly('tool output', () => {
    if (toolSpan) {
      Tracer.setOutput(
        boundSanitizedTraceValue(
          sanitizeTraceValue(projectApprovedToolOutput(result)),
        ),
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

After each awaited bounded flush, poll until the expected complete parent tree,
span-ID set, terminal IO/status, and timestamps remain unchanged across a named
stability interval. Record raw-read timestamps and a span-set hash. Missing or
changing data remains `blocked`; a single read cannot prove late framework/tool
children have settled.

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
  stay inside its window. Normalize units and derive timestamp precision from
  raw stored values or documented platform resolution. Compute `start_margin =
  min(child_start) - root_start` and `end_margin = root_end - max(child_end)`;
  each margin `>= 0` passes, `-precision < margin < 0` is inconclusive and must
  be repeated, and `margin <= -precision` fails. An empty root parent is required
  only without deliberate upstream distributed context;
- exact session/customer identity and completed pre/post-restart roots;
- cancellation records cancelled outcome, stops upstream work, and has no
  late success/tool-call persistence unless separately owned;
- success, model error, persistence error, and abort each have matching stored
  terminal outcomes;
- exact routing reaches the intended project; the empty and same-type unknown
  name/ID negatives fail as expected without readiness/creation; and the valid
  positive control starts; and
- semantic/storage parsing and the full raw canary search pass.

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
