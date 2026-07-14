# Next.js + Vercel AI SDK 5/6 Text-Stream Tracing

Use the copyable code in this recipe only when a Next.js **Node-runtime** route
uses Vercel AI SDK 5 or 6 and returns a `streamText` /
`toTextStreamResponse` response. Inspect `package.json` and the lockfile before
editing; do not guess the installed major version.

AI SDK 7 uses the separate `@ai-sdk/otel` / `registerTelemetry` integration in
the current Judgment Vercel AI SDK documentation. Keep the trace-boundary,
payload, and verification requirements below, but do not copy this file's
`experimental_telemetry` code into AI SDK 7. This recipe also does not cover
Edge-runtime routes or `toUIMessageStreamResponse`, whose telemetry,
persistence, and abort mechanics need their own version-specific proof.

Read the general tracing guide too, but complete every applicable gate in this
file before saying the integration works.

## The required trace

For a conversational agent, one completed user turn should normally be one
trace:

- The application root starts after the request and session are validated.
- The root name identifies the application and unit of work (for example,
  `deskflow.turn`), rather than a generic name such as `agent-turn`.
- The root remains open through model generation, tool calls, streaming,
  application persistence, and final output collection.
- The Vercel AI SDK model and tool spans are children of that root.
- The session ID groups separate turn traces from the same conversation.
- The root ends only after the AI SDK's own telemetry spans finish.
- A bounded export attempt is awaited through a lifecycle primitive that the
  Next.js runtime waits for, and any export failure remains observable.

Do not wrap a function that merely returns `StreamTextResult`. An automatic
wrapper ends when the stream handle is returned, before the turn is complete.

## 1. Use one Judgeval runtime in the production server bundle

Next.js can compile the instrumentation hook and route into separate bundles.
If each bundle contains its own copy of `judgeval`, `Tracer.init()` can install
a provider in one copy while the request route uses a no-op tracer from the
other. The application still builds and serves successful responses, but it
exports zero traces.

Initialize once in the Node branch of `instrumentation.ts`. Use a delayed
import so an Edge instrumentation pass does not load a Node-only SDK:

```typescript
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { Tracer } = await import("judgeval");
  const projectName = process.env.JUDGMENT_PROJECT_NAME;
  if (!projectName) {
    throw new Error("JUDGMENT_PROJECT_NAME is required for tracing");
  }
  await Tracer.init({
    projectName,
  });
}
```

Merge `judgeval` into the existing Next config rather than replacing other
settings:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep the application's existing settings.
  serverExternalPackages: ["judgeval"],
};

export default nextConfig;
```

If the existing config already has `serverExternalPackages`, append and
deduplicate. If application code already imports `@opentelemetry/api`
directly, verify that the production build resolves one shared copy and
externalize or deduplicate it when needed. Do not add a direct OpenTelemetry
dependency merely to create a Judgment span; use
`Tracer.getOTELTracer().startActiveSpan(...)`.

After a production build, inspect the generated server output. The
instrumentation hook and request route should load the shared external
`judgeval` package instead of embedding separate SDK copies. A passing build is
not proof by itself; the real route must export a trace whose root and AI SDK
children share one trace ID.

## 2. Forward the complete Judgment connection configuration

Every container or worker that exports spans needs all connection variables
present in its launcher. Forward the variable names without printing their
secret values:

```yaml
environment:
  JUDGMENT_API_KEY: ${JUDGMENT_API_KEY:-}
  JUDGMENT_ORG_ID: ${JUDGMENT_ORG_ID:-}
  JUDGMENT_PROJECT_NAME: ${JUDGMENT_PROJECT_NAME:?JUDGMENT_PROJECT_NAME is required}
  JUDGMENT_API_URL: ${JUDGMENT_API_URL:-}
```

Do not assume a host `.env` file becomes container environment. Before live
verification, compare the names of the `JUDGMENT_*` variables in the launcher
with the names inside the running process. An omitted endpoint override can
send valid credentials to the wrong backend.

## 3. Start a manually controlled active root

Create the stream while the application root is active so the Vercel AI SDK
tracer inherits it. Set session and customer context only after the root is
active.

```typescript
const result = Tracer.getOTELTracer().startActiveSpan(
  // Use this application's stable business name, not a generic copied name.
  "deskflow.turn",
  (rootSpan) => {
    Tracer.setSpanKind("agent", rootSpan);
    Tracer.setSessionId(session.id);
    Tracer.setCustomerId(session.customerId);
    Tracer.setInput({ message: boundedText(userMessage) }, rootSpan);

    return streamText({
      // Keep the existing model, messages, tools, and generation settings.
      experimental_telemetry: {
        isEnabled: true,
        tracer: Tracer.getOTELTracer(),
        recordInputs: false,
        recordOutputs: false,
      },
      async onFinish({ response, text }) {
        await persistCompletedTurn(response);
        Tracer.setOutput({ text: boundedText(text) }, rootSpan);
      },
      onError({ error }) {
        Tracer.setError(error, rootSpan);
      },
      onAbort() {
        Tracer.setAttribute("agent.aborted", true, rootSpan);
      },
    });
  },
);
```

`boundedText` and `persistCompletedTurn` are placeholders: use the
application's real sanitization and persistence behavior. Do not change the
agent's behavior just to make tracing easier. **Bounded is not the same as
sanitized**: truncating a secret still stores a secret. Redact or omit secrets
and unnecessary PII first, then apply a size bound. Treat free-form search
queries, shell commands, URLs, headers, and error messages as potentially
sensitive even when they are short.

The Vercel AI SDK can otherwise record accumulated conversation history,
system prompts, tool schemas, and full tool payloads on every step. Keep
`recordInputs` and `recordOutputs` disabled when those values can be large or
sensitive. Preserve useful tool visibility by adding bounded semantic
input/output to the framework's active tool span, such as safe IDs, counts,
status, and byte lengths. Do not duplicate each framework tool span with a
second manual tool span.

Make both sides explicit when they are safe; disabling framework capture must
not leave a tool span with no useful input:

```typescript
async execute({ orderId }) {
  Tracer.setInput({ orderId });
  const order = await getOrder(orderId);
  Tracer.setOutput({ orderId, found: order != null });
  return order;
}
```

Use the active framework tool span only after verifying that the integration
keeps it active during `execute`. If it does not, add one manual child with
automatic capture disabled instead of silently writing attributes to the wrong
span.

## 4. Finalize after the framework telemetry span, then flush

In Vercel AI SDK versions where `streamText.onFinish` runs before the outer
`ai.streamText` span closes, do not end the application root or flush inside
that callback. Doing so can produce a root that ends before its child or flush
before the final child is exportable.

For a hard-restart-safe local or self-hosted server, make response EOF the
barrier: pass each response chunk through unchanged, but do not close the
returned body until the AI stream is finished, the application root has ended,
and the bounded `Tracer.forceFlush()` attempt has settled. A successful flush
makes an immediately following process kill wait for export; a failed attempt
must be logged and must make the later stored-trace verification fail.

Start the internal stream consumption while the application root is active and
return its completion promise with an idempotent finalizer. Wire a real abort
signal into the model call; cancelling only the returned response reader does
not stop the separate consuming branch or upstream generation.

```typescript
// In the agent module, inside startActiveSpan(...):
let finalization: Promise<void> | undefined;
const abortController = new AbortController();
const result = streamText({
  // onFinish persists and sets root output but does not end the root.
  // onError/onAbort record the outcome but do not detach export work.
  abortSignal: abortController.signal,
});

// Start this while the root is active so generation, tools, persistence, and
// the AI SDK's final telemetry work retain the intended context.
const streamDone = result.consumeStream({
  onError(error) {
    Tracer.setError(error, rootSpan);
  },
});

async function flushWithoutBreakingTheCompletedResponse(): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Tracer.forceFlush(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Judgment export flush timed out")),
          5_000,
        );
      }),
    ]);
  } catch (error) {
    // Keep this observable. The real-path trace check must fail when export
    // fails, but telemetry failure must not corrupt an otherwise valid reply.
    console.error("Judgment export flush failed", error);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const finalize = (error?: unknown): Promise<void> => {
  if (error) Tracer.setError(error, rootSpan);
  return (finalization ??= (async () => {
    try {
      await streamDone;
    } finally {
      rootSpan.end();
      await flushWithoutBreakingTheCompletedResponse();
    }
  })());
};

const abortUpstream = (reason?: unknown) => {
  Tracer.setAttribute("agent.response_cancelled", true, rootSpan);
  if (!abortController.signal.aborted) abortController.abort(reason);
};

return { result, finalize, abortUpstream };
```

```typescript
// In the App Router route handler, after validation and session lookup:
const { result, finalize, abortUpstream } = runAgentTurn({
  session,
  userMessage,
});
const response = result.toTextStreamResponse();
const reader = response.body!.getReader();

const body = new ReadableStream<Uint8Array>({
  async pull(controller) {
    try {
      const { done, value } = await reader.read();
      if (!done) {
        controller.enqueue(value);
        return;
      }

      // Export completes before the client observes response EOF.
      await finalize();
      controller.close();
    } catch (error) {
      try {
        await finalize(error);
      } finally {
        controller.error(error);
      }
    }
  },
  async cancel(reason) {
    abortUpstream(reason);
    try {
      await reader.cancel(reason);
    } finally {
      // The abort/error callbacks record the outcome. Cancellation should not
      // leave upstream generation or the root running in the background.
      await finalize().catch(() => undefined);
    }
  },
});

return new Response(body, {
  status: response.status,
  statusText: response.statusText,
  headers: response.headers,
});
```

Connect the request signal to the same `abortUpstream` function when the
application already exposes one. Keep response headers and status intact. The
wrapper forwards chunks as they arrive and delays the final EOF until the
bounded export attempt completes. However, Vercel AI SDK result branches use a
tee internally; if one consumer lags, the runtime can buffer data. Exercise a
long response and inspect memory/backpressure before using this double-consumer
pattern for large streams. Do not claim that it is buffer-free.

The fail-open exporter handling above is the production default: application
correctness should not depend on telemetry availability. A strict experiment
harness may fail the test when a trace is missing, but it should detect that
from stored evidence rather than turning a successfully generated reply into a
client error.

Next.js `after(...)` or `waitUntil(...)` can still be appropriate when the
actual deployment runtime guarantees that it waits for those promises during
freeze and shutdown. Do not assume that guarantee. In the standalone Next.js
server, an `after` callback begins after the response closes, and a hard
process/container kill can interrupt it. For an immediate-kill verification
scenario, `after(finalize)` alone is not a sufficient barrier.

If the application cannot wrap the response body, use another runtime finalizer
whose promise is demonstrably awaited through the tested freeze/restart path.
The ordering must remain:

1. model and tool work completes;
2. the application persists the completed turn and records final output;
3. the AI SDK telemetry stream and its spans finish;
4. the application root ends;
5. a bounded `await Tracer.forceFlush()` attempt succeeds or reports failure
   before freeze, exit, or restart.

Do not use detached work such as `void Tracer.forceFlush()`. Do not report an
export guarantee unless the selected lifecycle primitive actually waits for
the promise and the real trace is then found in Judgment.

## 5. Verify the real production-style route

Use the application's real server/container and its real chat endpoint. A
scratch span or SDK connectivity probe is not evidence that the route is
instrumented.

1. Build and start the production-style Next.js server.
2. Send a uniquely identifiable real turn that reaches both the model and a
   tool when the agent has tools.
3. Record the exact application session ID.
4. Wait for the response and lifecycle finalizer to finish.
5. Immediately stop or restart the server.
6. Start it again and send another turn in the same session when the app
   supports restart continuity.
7. Inspect stored traces for the exact session ID or unique marker.
8. Repeat with a long or secret-shaped input and confirm that raw stored
   attributes are both bounded and sanitized.

Both turns must arrive. Each trace must have a non-zero-duration application
root with final bounded input/output and the expected session/customer data.
The root must contain the AI SDK model/tool spans, and its time window must
contain their work. A zero-duration root, a missing last child, separate root
and framework trace IDs, or no trace at all is a failed integration.

## Mandatory completion gate

Before saying the task is complete, report evidence for every row. If live
credentials or trace access are unavailable, say that live verification is
blocked; do not replace it with “you should see traces.”

| Gate | Required evidence |
| --- | --- |
| SDK/runtime match | Installed `ai` major and Next runtime are identified; the 5/6 Node text-stream sample is not copied into AI SDK 7, Edge, or UI-stream code |
| Shared runtime | Existing Next config preserves its settings and includes `judgeval` in `serverExternalPackages`; production output does not bundle independent Judgeval runtimes for startup and route code |
| Initialization | `Tracer.init()` runs from the supported server startup hook before real requests |
| Complete configuration | Key, org, explicit intended project, and every endpoint override supported by the installed SDK (including `JUDGMENT_API_URL` when present) are forwarded into the real runtime |
| Correct boundary | One application root represents the completed streamed turn, not stream construction |
| Name quality | The application root and any manual spans use stable business-specific names rather than copied generic placeholders |
| Parentage | AI SDK model/tool spans and meaningful manual spans share the application's trace ID |
| Context | Exact stable session/customer identifiers are set inside the active root |
| Payload safety | Automatic framework input/output capture is deliberately configured; long and secret-shaped tests show that raw attributes are sanitized as well as bounded and exclude full histories, schemas, documents, files, and secrets |
| Tool usefulness | Every executed business tool retains its identity plus bounded semantic input and output-or-error after automatic capture is disabled |
| Finalization | Persistence and final output complete before framework telemetry closes; the application root ends afterward |
| Export lifecycle | A bounded awaited `Tracer.forceFlush()` attempt completes before response EOF, or is attached to a deployment lifecycle primitive proven to survive the tested freeze/restart behavior; exporter failure is visible without corrupting a valid application reply |
| Error and cancellation | Stream errors and client cancellation are recorded on the root; a real abort signal stops upstream work before finalization |
| Real-path proof | A production-style model/tool request is found in Judgment by its exact session ID or unique marker |
| Restart proof | When the application supports restart continuity, the completed pre-restart turn and first post-restart turn both arrive intact; otherwise report this gate as not applicable |

Builds, typechecks, unit tests, synthetic spans, and successful HTTP responses
are useful checks, but none independently satisfy the real-path or restart
gates.
