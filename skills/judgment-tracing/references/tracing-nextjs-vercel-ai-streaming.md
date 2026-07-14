# Next.js + Vercel AI SDK Streaming Tracing

Use this recipe when a Next.js server route returns a streamed Vercel AI SDK
response (`streamText`, `toTextStreamResponse`, or
`toUIMessageStreamResponse`). Read the general tracing guide too, but complete
every gate in this file before saying the integration works.

## The required trace

For a conversational agent, one completed user turn should normally be one
trace:

- The application root starts after the request and session are validated.
- The root remains open through model generation, tool calls, streaming,
  application persistence, and final output collection.
- The Vercel AI SDK model and tool spans are children of that root.
- The session ID groups separate turn traces from the same conversation.
- The root ends only after the AI SDK's own telemetry spans finish.
- An awaited export flush is attached to a lifecycle primitive that the Next.js
  runtime waits for.

Do not wrap a function that merely returns `StreamTextResult`. An automatic
wrapper ends when the stream handle is returned, before the turn is complete.

## 1. Use one Judgeval runtime in the production server bundle

Next.js can compile the instrumentation hook and route into separate bundles.
If each bundle contains its own copy of `judgeval`, `Tracer.init()` can install
a provider in one copy while the request route uses a no-op tracer from the
other. The application still builds and serves successful responses, but it
exports zero traces.

Initialize once in `instrumentation.ts`:

```typescript
import { Tracer } from "judgeval";

export async function register() {
  await Tracer.init({
    projectName: process.env.JUDGMENT_PROJECT_NAME ?? "my-agent",
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
  JUDGMENT_PROJECT_NAME: ${JUDGMENT_PROJECT_NAME:-my-agent}
  JUDGMENT_API_URL: ${JUDGMENT_API_URL:-}
  JUDGMENT_API_BASE: ${JUDGMENT_API_BASE:-}
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
  "agent-turn",
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
agent's behavior just to make tracing easier.

The Vercel AI SDK can otherwise record accumulated conversation history,
system prompts, tool schemas, and full tool payloads on every step. Keep
`recordInputs` and `recordOutputs` disabled when those values can be large or
sensitive. Preserve useful tool visibility by adding bounded semantic
input/output to the framework's active tool span, such as safe IDs, counts,
status, and byte lengths. Do not duplicate each framework tool span with a
second manual tool span.

## 4. Finalize after the framework telemetry span, then flush

In Vercel AI SDK versions where `streamText.onFinish` runs before the outer
`ai.streamText` span closes, do not end the application root or flush inside
that callback. Doing so can produce a root that ends before its child or flush
before the final child is exportable.

For a Next.js App Router version that supports `after`, return an idempotent
finalizer with the stream result and register it in the request lifecycle.
`after` runs after the streamed response finishes and the runtime waits for its
returned promise:

```typescript
// In the agent module, inside startActiveSpan(...):
let finalized = false;
const finalize = async () => {
  if (finalized) return;
  finalized = true;
  rootSpan.end();
  await Tracer.forceFlush();
};

const result = streamText({
  // onFinish persists and sets root output but does not end the root.
  // onError/onAbort record the outcome but do not detach export work.
});

return { result, finalize };
```

```typescript
// In the App Router route handler:
import { after } from "next/server";

const { result, finalize } = runAgentTurn({ session, userMessage });
after(async () => {
  await finalize();
});

return result.toTextStreamResponse();
```

The route still returns the original streaming response without buffering it.
The completion callback first finishes persistence and sets output. The later
`after` callback then ends the application root and awaits
`Tracer.forceFlush()`.

If the installed Next.js version does not support `after`, use a response-body
or runtime finalizer whose promise is awaited after upstream stream completion.
The ordering must remain:

1. model and tool work completes;
2. the application persists the completed turn and records final output;
3. the AI SDK telemetry stream and its spans finish;
4. the application root ends;
5. `await Tracer.forceFlush()` completes before freeze, exit, or restart.

Do not use detached work such as `void Tracer.forceFlush()`. Do not report an
export guarantee unless the selected lifecycle primitive actually waits for
the promise.

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
| Shared runtime | Existing Next config preserves its settings and includes `judgeval` in `serverExternalPackages`; production output does not bundle independent Judgeval runtimes for startup and route code |
| Initialization | `Tracer.init()` runs from the supported server startup hook before real requests |
| Complete configuration | Key, org, project, `JUDGMENT_API_URL`, and `JUDGMENT_API_BASE` are forwarded wherever present in the launcher |
| Correct boundary | One application root represents the completed streamed turn, not stream construction |
| Parentage | AI SDK model/tool spans and meaningful manual spans share the application's trace ID |
| Context | Exact stable session/customer identifiers are set inside the active root |
| Payload safety | Automatic framework input/output capture is deliberately configured; raw stored attributes exclude full histories, schemas, documents, files, and secrets |
| Finalization | Persistence and final output complete before framework telemetry closes; the application root ends afterward |
| Export lifecycle | An awaited `Tracer.forceFlush()` is attached to `after` or another lifecycle primitive the runtime waits for |
| Real-path proof | A production-style model/tool request is found in Judgment by its exact session ID or unique marker |
| Restart proof | The completed pre-restart turn and first post-restart turn both arrive intact |

Builds, typechecks, unit tests, synthetic spans, and successful HTTP responses
are useful checks, but none independently satisfy the real-path or restart
gates.
