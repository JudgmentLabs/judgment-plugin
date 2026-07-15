# Judgment Tracing for Next.js and Vercel AI SDK 5/6 Text Streams

Use the copyable code in this recipe only when a Next.js **Node-runtime** route
uses Vercel AI SDK 5 or 6 and returns a `streamText` /
`toTextStreamResponse` response. Inspect `package.json` and the lockfile before
editing; do not guess the installed major version.

AI SDK 7 uses the separate `@ai-sdk/otel` / `registerTelemetry` integration in
the current [Judgment Vercel AI SDK documentation](https://docs.judgmentlabs.ai/documentation/integrations/agent-frameworks/vercel-ai-sdk).
Keep the trace-boundary, payload, and verification requirements below, but do
not copy this file's `experimental_telemetry` code into AI SDK 7. This recipe
also does not cover Edge-runtime routes or `toUIMessageStreamResponse`, whose
telemetry, persistence, and abort mechanics need their own version-specific
proof.

Use this focused recipe first. Fetch the general guide only for an unresolved
SDK question; do not load it automatically.

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

After building the production bundle, run its real launcher with the project
explicitly empty under a 30-second supervisor that always terminates the
process/container. It must exit nonzero with the expected missing-project error
before readiness. `unset`, timeout, continued serving, or an unrelated failure
does not pass.

## 3. Start a manually controlled active root

Create the stream while the application root is active so the Vercel AI SDK
tracer inherits it. Set session and customer context only after the root is
active.

```typescript
function reportTelemetryFailure(label: string, error: unknown): void {
  try {
    const kind = error instanceof Error ? error.name : "Error";
    console.error(`Judgment ${label} failed (${kind})`);
  } catch {
    // A telemetry reporter is also telemetry and must remain fail-open.
  }
}

function bestEffortTraceWrite(label: string, write: () => void): void {
  try {
    // Keep trace-only sanitization inside this callback too.
    write();
  } catch (error) {
    reportTelemetryFailure(label, error);
  }
}

type TraceErrorCategory =
  | "stream_failed"
  | "stream_construction_failed"
  | "persistence_failed";

let asynchronousFailure:
  | { error: unknown; code: TraceErrorCategory }
  | undefined;
let cancellationRequested = false;
const result = Tracer.getOTELTracer().startActiveSpan(
  // Use this application's stable business name, not a generic copied name.
  "deskflow.turn",
  (rootSpan) => {
    bestEffortTraceWrite("root input", () => {
      Tracer.setSpanKind("agent", rootSpan);
      Tracer.setSessionId(session.id);
      Tracer.setCustomerId(session.customerId);
      Tracer.setInput({
        message: sanitizeAndBoundTraceText(userMessage),
      }, rootSpan);
    });

    return streamText({
      // Keep the existing model, messages, tools, and generation settings.
      experimental_telemetry: {
        isEnabled: true,
        tracer: Tracer.getOTELTracer(),
        recordInputs: false,
        recordOutputs: false,
      },
      async onFinish({ response, text }) {
        // Cancellation wins a late success callback. If the existing app
        // intentionally continues after disconnect, trace that detached work
        // as a separate durable unit instead of persisting it as this turn.
        if (cancellationRequested) return;

        let persistenceFailure: unknown;
        try {
          await persistCompletedTurn(response);
        } catch (error) {
          // Application behavior is decided below, outside trace-only writes.
          asynchronousFailure = { error, code: "persistence_failed" };
          persistenceFailure = error;
        }

        if (persistenceFailure === undefined) {
          bestEffortTraceWrite("root output", () => Tracer.setOutput({
            text: sanitizeAndBoundTraceText(text),
          }, rootSpan));
          return;
        }

        bestEffortTraceWrite("persistence error", () => {
          Tracer.setError(safeTraceError("persistence_failed"), rootSpan);
          Tracer.setOutput({
            status: "error",
            errorCode: "persistence_failed",
          }, rootSpan);
        });

        // Preserve the pre-instrumentation rethrow, recovery/report, or
        // intentional-swallow outcome exactly. This is application code, not
        // telemetry, and receives the original in-memory error.
        await preserveExistingPersistenceFailureBehavior(persistenceFailure);
      },
      onError({ error }) {
        bestEffortTraceWrite("stream error", () => {
          Tracer.setError(safeTraceError("stream_failed"), rootSpan);
          Tracer.setOutput({
            status: "error",
            errorCode: "stream_failed",
          }, rootSpan);
        });
      },
      onAbort() {
        bestEffortTraceWrite("abort outcome", () => {
          Tracer.setAttribute("agent.aborted", true, rootSpan);
          Tracer.setOutput({ status: "aborted" }, rootSpan);
        });
      },
    });
  },
);
```

`preserveExistingPersistenceFailureBehavior` denotes the application's
pre-instrumentation branch, not a new tracing policy hook. Replace that line
with the existing rethrow, retry/report, or intentional-swallow behavior
unchanged; only the safe trace recording is new. If the existing branch fully
recovers, clear the in-memory terminal failure and record the recovered result.
If it intentionally continues with unresolved persistence failure, retain a
safe failure outcome without adding a throw. Tracing does not choose either
policy.

Make the cancellation check part of the persistence commit, or pass the abort
signal into persistence, so a cancellation racing with `onFinish` cannot commit
a success/tool-call message after the check. Do not invent detached completion;
preserve it only when the application already documents that behavior, and then
trace the detached work separately.

Also handle a synchronous `streamText(...)` construction failure: retain the
original exception in memory, record the bounded outcome through
`bestEffortTraceWrite`, best-effort end/flush from the outer owner, then preserve
the application's original rethrow/recovery behavior. A sanitizer, setter, or
finalizer failure must not replace that exception or leave application work to
be retried by tracing.

`sanitizeAndBoundTraceText` and `persistCompletedTurn` are placeholders: replace
them with the application's real sanitization and persistence behavior. Do not
leave `sanitizeAndBoundTraceText` as a truncation-only helper. **Bounded is not
the same as sanitized**: truncating a secret still stores a secret. Redact or
omit secrets and unnecessary PII first, then apply a size bound. Treat free-form
search queries, shell commands, URLs, headers, and error messages as potentially
sensitive even when they are short.

Keep free-form capture both useful and explicit. The trace root needs a bounded
semantic representation of the current user message and final answer; character
counts plus an omission marker are privacy-safe but behavior-blind. An
omit-only root is an incomplete integration, not a successful completion gate.

Leave margin below storage clipping. A 2,000-character text value can exceed a
2,000-character stored attribute after JSON keys/quotes are added and be clipped
into invalid JSON. Prefer smaller structured fields (for example, a 1,500-char
free-text ceiling) and verify the settled raw `judgment.input` and
`judgment.output` still parse; do not treat sanitizer output as storage proof.

Choose an approved sanitizer, a conservative credential/auth baseline requiring
privacy review, or strict omission (which blocks semantic evidence). Sanitize
the final composed value before bounding. The conservative matrix must cover
API/provider-key prefixes, authorization, cookies/sessions, secret assignments,
URL credentials, and private-key blocks with non-real canaries before and
beyond the bound and in output/error fields. A benign semantic marker must
survive while every canary is absent from settled raw attributes. Do not claim
that this baseline covers general PII or domain secrets.

Normalize trace errors without storing raw exception text:

```typescript
function safeTraceError(code: TraceErrorCategory): Error {
  return new Error(code);
}
```

Use stable application-owned error categories, not the raw exception message
or only its JavaScript class name. Add narrower categories when the application
can distinguish them safely. Provider and tool errors can embed a request URL,
headers, or an echo of the input; never pass the raw error object to
`Tracer.setError`.

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
  bestEffortTraceWrite("tool input", () => Tracer.setInput({ orderId }));
  const order = await getOrder(orderId);
  bestEffortTraceWrite("tool output", () => {
    Tracer.setOutput({ orderId, found: order != null });
  });
  return order;
}
```

Use the active framework tool span only after verifying that the integration
keeps it active during `execute`. If it does not, add one manual child with
automatic capture disabled instead of silently writing attributes to the wrong
span. When the installed Judgeval/OpenTelemetry API exposes the active
framework span and a live trace proves it is the tool span, updating that span's
name to a stable business name is preferable to leaving only `ai.toolCall`:

```typescript
bestEffortTraceWrite("tool name", () => {
  const toolSpan = Tracer.getCurrentSpan();
  toolSpan?.updateName("deskflow.tool.lookup_order");
});
```

Keep the framework's business-name attribute as well. If active-span identity
or `updateName` support is uncertain, retain the framework span and its
`ai.toolCall.name` attribute and report the scanability limitation. Do not
create a duplicate manual span merely to improve the displayed name.

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

Create the stream while the application root is active, but give it exactly one
consumer: the response-body reader. Return an idempotent finalizer owned by the
terminal response branch. Wire a real abort signal into the model call.

```typescript
// In the agent module, inside startActiveSpan(...):
let finalization: Promise<void> | undefined;
const abortController = new AbortController();
// Reuse asynchronousFailure from the enclosing turn/root scope above.
const result = streamText({
  // onFinish persists and sets root output but does not end the root. If the
  // application's existing policy catches a persistence/onFinish failure,
  // assign the original error to asynchronousFailure (memory only) after
  // recording a safe code. Never silently convert it into traced success.
  // onError/onAbort record the outcome but do not detach export work.
  abortSignal: abortController.signal,
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
    reportTelemetryFailure("export flush", error);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function bestEffortEndRoot(): void {
  try {
    rootSpan.end();
  } catch (error) {
    reportTelemetryFailure("root end", error);
  }
}

type TerminalOutcome =
  | { status: "completed" }
  | { status: "cancelled" }
  | { status: "error"; error: unknown; code: TraceErrorCategory };

const finalize = (outcome: TerminalOutcome): Promise<void> => {
  return (finalization ??= (async () => {
    const terminal: TerminalOutcome =
      outcome.status === "completed" && asynchronousFailure !== undefined
        ? {
            status: "error",
            error: asynchronousFailure.error,
            code: asynchronousFailure.code,
          }
        : outcome;
    if (terminal.status === "error") {
      bestEffortTraceWrite("terminal error", () => {
        Tracer.setError(safeTraceError(terminal.code), rootSpan);
        Tracer.setOutput({
          status: "error",
          errorCode: terminal.code,
        }, rootSpan);
      });
    } else if (terminal.status === "cancelled") {
      bestEffortTraceWrite("terminal cancellation", () => {
        Tracer.setAttribute("agent.response_cancelled", true, rootSpan);
        Tracer.setOutput({ status: "cancelled" }, rootSpan);
      });
    }

    // Bind this to the installed SDK's existing-consumer completion signal.
    // It must prove the ai.streamText span ended; onFinish/onAbort, a sleep, or
    // a second consumeStream() branch is not sufficient.
    try {
      await waitForFrameworkTelemetryWithoutBreakingResponse();
    } catch (error) {
      // The trace is not verified, but finalization still cannot change the
      // application response or cancellation outcome.
      reportTelemetryFailure("framework telemetry barrier", error);
    }

    // Neither operation may reject or change controller.close/error/cancel.
    bestEffortEndRoot();
    await flushWithoutBreakingTheCompletedResponse();
  })());
};

const abortUpstream = (reason?: unknown) => {
  // Application cancellation comes first. Telemetry cannot delay it.
  cancellationRequested = true;
  if (!abortController.signal.aborted) abortController.abort(reason);
  bestEffortTraceWrite("abort requested", () => {
    Tracer.setAttribute("agent.response_cancelled", true, rootSpan);
  });
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
      await finalize({ status: "completed" });
      controller.close();
    } catch (error) {
      try {
        await finalize({ status: "error", error, code: "stream_failed" });
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
      // Defense in depth: cancellation must remain fail-open even if a future
      // edit accidentally makes finalization reject.
      await finalize({ status: "cancelled" }).catch((error) => {
        reportTelemetryFailure("cancel finalization", error);
      });
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
bounded export attempt completes. Do not also call `result.consumeStream()`
when the response already consumes `textStream` or `fullStream`. AI SDK
implements these branches with an internal tee; the extra consumer removes
backpressure and can let generation, tools, and `onFinish` persistence continue
after the client cancels. That is both an application-behavior bug and a false
tracing-lifecycle proof.

`waitForFrameworkTelemetryWithoutBreakingResponse` is a bounded, fail-open
adapter around a real settlement signal in the installed AI SDK/runtime. It
must use the response's existing consumer and resolve only after the framework
`ai.streamText` span ends on success, error, and abort. Do not implement it with
`onFinish`, `onAbort`, `setTimeout`, or `result.consumeStream()` beside the
response consumer. If the installed version exposes no binding signal, report
the child-window gate blocked rather than ending the root early and calling it
complete. This recipe does not claim that AI SDK 5/6 exposes one universal
public barrier; do not invent one from a private hook, delay, or unverified
callback. Raw timestamps must show every framework child ending at or before
the application root.

Inspect the installed getter implementation too: in some AI SDK 6 releases,
reading result promises such as `finishReason` starts `consumeStream()` and can
create the second-consumer problem. Do not use such a promise as the barrier
unless source inspection and a cancellation test prove it reuses the existing
consumer.

Verify this with a real client abort while a read is pending. The server must
stop upstream work according to the application's cancellation contract, the
root must record `cancelled` rather than ordinary success, and no success-only
persistence or side effect may appear afterward. If the application explicitly
chooses detached completion after disconnect, trace that as a separate durable
work unit instead of disguising it as the cancelled request.

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
8. Run the full canary matrix above through a long input and failing turn, then
   inspect settled raw attributes rather than UI previews. Confirm input and
   output remain parseable after platform storage clipping.

Both turns must arrive. Each trace must have a non-zero-duration application
root with final bounded input/output and the expected session/customer data.
The root must contain the AI SDK model/tool spans, and its time window must
contain their work. A zero-duration root, a missing last child, separate root
and framework trace IDs, or no trace at all is a failed integration.

Prove parentage from raw IDs, not the rendered waterfall. Record application
root and model/tool `trace_id`, `span_id`, and `parent_span_id` values. Require
an empty root parent when no intentional upstream context exists. With
deliberate W3C/distributed propagation, record the expected upstream IDs and
prove the local root still owns the complete local stream lifetime, session,
and semantic IO. A short accidental HTTP parent is not passing; a config flag
or matching span names is not binding proof.

## Mandatory completion gate

Use `not-applicable` only when the architecture genuinely lacks a gate. Missing
credentials, traffic, or stored evidence is `blocked`; stubs are synthetic.

| Gate | Result | Evidence class | Exact evidence |
| --- | --- | --- | --- |
| Framework/runtime match | <result> | static | Installed `ai` major plus Next.js Node `streamText` text-response path |
| Shared runtime | <result> | static | Preserved config plus production bundle resolution showing one Judgeval runtime |
| Initialization | <result> | real application | Real launcher log/order proving initialization before readiness and requests |
| Complete configuration | <result> | static | Resolved launcher variable names for key, org, explicit project, and configured endpoint overrides |
| Explicit routing negative | <result> | real application | Exact explicit-empty real-launcher command, nonzero exit, and expected error |
| Correct boundary | <result> | stored Judgment | Application root trace ID, duration, final IO, and terminal callback evidence |
| Root parentage | <result> | stored Judgment | Root/model/tool trace-span-parent IDs plus expected upstream chain or empty-parent proof |
| Context | <result> | stored Judgment | Exact session/customer IDs on each root before and after restart |
| Payload safety and usefulness | <result> | stored Judgment | Named mode, benign/canary raw search, bounds, and inspected attribute set |
| Tool usefulness | <result> | stored Judgment | Executed business tool names and bounded semantic input/output-or-error |
| Finalization | <result> | real application | Event order for persistence, framework telemetry close, root end, and response EOF |
| Export lifecycle | <result> | stored Judgment | Trace ID surviving the tested EOF/freeze/restart after bounded flush |
| Error and cancellation | <result> | real application | Error/abort requests proving original persistence policy and stopped upstream work |
| Stored terminal outcomes | <result> | stored Judgment | Trace IDs and raw root outcomes for success, model error, persistence error, and abort |
| Restart proof | <result> | stored Judgment | Completed pre-restart and first post-restart trace IDs, or architectural reason for not-applicable |

Builds, typechecks, unit tests, synthetic spans, and successful HTTP responses
are useful checks, but none independently satisfy the real-path or restart
gates.
