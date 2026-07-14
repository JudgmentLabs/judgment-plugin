# Judgment Tracing

Instrument LLM and agent applications with Judgment tracing, following best
practices and tailored to the user's codebase.

## When to Use

- Setting up Judgment tracing in a new project
- Auditing existing Judgment tracing
- Adding observability to LLM calls, tools, agents, or workflows
- Debugging missing traces, flat traces, or malformed span hierarchies

## Workflow

### 1. Assess Current State

Check the project:

- Is `judgeval` installed?
- What language and runtime are used? Python, TypeScript, serverless, worker,
  CLI, web server, or multi-service app?
- What LLM frameworks or providers are used? OpenAI SDK, Anthropic, OpenRouter,
  LangGraph, OpenAI Agents SDK, Claude Agent SDK, Google ADK, Vercel AI SDK,
  LiveKit, OpenTelemetry, OpenLit, OpenInference, etc.
- Is there existing tracing or OpenTelemetry instrumentation?
- Where is the real execution path? Find the route, job, CLI command, queue
  consumer, or agent entrypoint that users actually run.

Useful search:

```bash
rg -n "judgeval|Judgment|Tracer|wrap\\(|OpenAI|Anthropic|LangChain|LangGraph|Vercel|ai\\(|responses\\.create|chat\\.completions" .
```

**No integration yet:** Set up Judgment using a framework or provider
integration if available. Integrations capture more context automatically and
require less code than manual instrumentation.

**Integration exists:** Audit against the best practices below.

**No matching integration:** Initialize tracing once, then manually observe the
root request or agent function plus high-signal tool, retrieval, and LLM calls.

### 2. Apply Tracing Best Practices

Use these best practices to decide what to implement and which docs to fetch.

#### Baseline Best Practices

| Best practice               | When it applies                                                  | Docs                                                                                         | Why                                                                   |
| --------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Tracer init                 | Always                                                           | https://docs.judgmentlabs.ai/documentation/performance/tracing                               | Prevents missing spans, duplicate setup, and auth bugs                |
| LLMs tracked properly       | App calls LLMs                                                   | https://docs.judgmentlabs.ai/documentation/integrations/introduction#model-providers         | Makes model behavior, cost, latency, and failures debuggable          |
| Tool calls tracked properly | App has tools, retrieval, data access, or side-effectful helpers | https://docs.judgmentlabs.ai/documentation/performance/tracing                               | Shows what the agent actually did before responding                   |
| Simple span types           | Always                                                           | https://docs.judgmentlabs.ai/sdk-reference/python/trace/tracer                               | Keeps traces easy to scan and filter                                  |
| Session context             | App has conversations or multi-turn workflows                    | https://docs.judgmentlabs.ai/documentation/performance/tracing#grouping-traces-into-sessions | Groups related traces into sessions for conversation-level debugging  |
| Customer context            | App has customers, tenants, workspaces, or customer users        | https://docs.judgmentlabs.ai/sdk-reference/python/trace/tracer#set_customer_id               | Attributes traces to affected customers for customer-level debugging  |
| Setting your own attributes | Always                                                           | https://docs.judgmentlabs.ai/documentation/performance/tracing#manual-attribute-setting      | Makes traces readable in the UI                                       |
| Export lifecycle            | Scripts, CLIs, jobs, tests, and servers                          | https://docs.judgmentlabs.ai/sdk-reference/typescript/tracer                                 | Prevents missing traces in short-lived runs and broken server tracing |

Framework and provider integrations handle model name, token usage, and span
types automatically when supported. Prefer integrations over manual
instrumentation.

Customer context syntax:

- Python: `Tracer.set_customer_id(customer_id)` and
  `Tracer.set_customer_user_id(customer_user_id)`
- TypeScript: `Tracer.setCustomerId(customerId)` and
  `Tracer.setCustomerUserId(customerUserId)`

#### Advanced Best Practices

Only apply these when the project architecture calls for them:

| Best practice                       | When it applies                                                                | Docs                                                                               | Why                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Tracer across project semantics     | Tracing spans multiple files or modules                                        | https://docs.judgmentlabs.ai/sdk-reference/python/trace/tracer                     | Preserves one coherent trace across the codebase                          |
| Active tracers with project names   | Multiple Judgment projects are needed                                          | https://docs.judgmentlabs.ai/documentation/performance/tracing#project-routing     | Keeps staging, prod, or customer traces in the right place                |
| Distributed tracing                 | Requests cross stateless service, worker, queue, serverless, or RPC boundaries | https://docs.judgmentlabs.ai/documentation/performance/tracing#distributed-tracing | Keeps downstream spans connected when in-memory context cannot carry over |
| Streaming and deferred completion   | A function returns before generation, tools, callbacks, persistence, or export finish | Relevant framework integration and tracer lifecycle docs                      | Keeps the root open for the actual unit of work and prevents silent span loss |
| Agent subtracing with linked traces | Agents delegate to subagent                                     | https://docs.judgmentlabs.ai/documentation/performance/tracing#subagent-tracing    | Splits subagents into their own traces for independent evaluation        |

#### Choose the work boundary before adding spans

First identify the meaningful unit of work and the event that proves it is
finished. Start the root when that work is triggered and end it only after its
final output and important side effects are complete. The return of a function
is not always the end of the work it started.

Look specifically for APIs that return a stream, iterator, task, workflow
handle, callback-driven result, or background job. Follow the real execution
path until you find completion callbacks such as `onFinish`, stream-consumption
promises, persistence calls, queue acknowledgements, or framework lifecycle
hooks.

For a streamed user turn:

- Use one root for the completed turn, not merely for constructing or returning
  the stream.
- Do not use an automatic function wrapper as the root when the wrapped
  function synchronously returns a stream handle. The wrapper will end when the
  handle is returned, before the streamed work finishes.
- Keep the root active through model generation, tool calls, stream completion,
  final output collection, and application persistence.
- Preserve streaming behavior. Do not buffer the response solely to make the
  trace easier to implement.
- Set the root output to the final user-visible result, not the stream object or
  an empty placeholder.
- Set session and customer context only after the root span is active. The
  Judgment setters target the current active span; calling them before a root
  exists does not create context for a future span.
- Arrange export/flush work through the runtime's supported lifecycle mechanism
  so a serverless freeze, process exit, or restart does not discard the turn.

For callback-driven streaming APIs, use a manually controlled active root when
the framework integration does not create the application-level root:

1. Start the active root immediately before constructing the stream.
2. Inside that active root, set the sanitized input, span type, session ID,
   customer context, and stable application attributes.
3. Construct the stream with the supported framework telemetry enabled so its
   model and tool spans inherit the active root.
4. In the framework's completion callback, finish persistence first, set the
   final user-visible output, then end the root.
5. Also end the root on stream error, abort, or cancellation. Record the error
   before ending it.

In TypeScript, when the root must outlive the synchronous function that creates
the stream, create it through Judgeval's exposed OpenTelemetry tracer and end
it yourself from the completion callbacks. Do not combine
`Tracer.startSpan(...)` with a separately imported OpenTelemetry
`context.with(...)`: that can update a different context manager from the one
Judgeval's session/customer setters and framework tracer use.

```typescript
return Tracer.getOTELTracer().startActiveSpan(
  "agent-turn",
  (rootSpan) => {
    Tracer.setSpanKind("agent", rootSpan);
    Tracer.setSessionId(sessionId);
    Tracer.setCustomerId(customerId);
    Tracer.setInput({ message: boundedMessage }, rootSpan);

    let rootEnded = false;
    const endRoot = () => {
      if (!rootEnded) {
        rootEnded = true;
        rootSpan.end();
      }
    };

    return streamText({
      // Existing model, messages, and tools stay unchanged.
      experimental_telemetry: {
        isEnabled: true,
        tracer: Tracer.getOTELTracer(),
      },
      async onFinish({ text }) {
        try {
          await persistCompletedTurn();
          Tracer.setOutput({ text: boundedText(text) }, rootSpan);
        } catch (error) {
          Tracer.setError(error, rootSpan);
          throw error;
        } finally {
          endRoot();
        }
      },
      onError({ error }) {
        Tracer.setError(error, rootSpan);
        endRoot();
      },
      onAbort() {
        Tracer.setAttribute("agent.aborted", true, rootSpan);
        endRoot();
      },
    });
  },
);
```

Use the application's real persistence and sanitization helpers in place of
the illustrative functions above. Make root finalization idempotent because a
framework can expose overlapping error, abort, and completion paths.

Do not assume framework telemetry creates the application-level root. For
example, Vercel AI SDK telemetry can describe generation and tool steps while
the application still needs a root for the completed chat turn.

If one root cannot safely continue across a durable suspend or process boundary,
end it at a real durable checkpoint and start a new trace for the next work
segment. Group related segments with the application's stable workflow or run
identifier as `session_id`. Do not keep a short HTTP request root open on paper
while unrelated worker activity continues after its time window.

#### Confirm initialization in the real runtime

Tracer initialization and observed code must use the same active tracer
provider. Framework startup hooks, server bundles, worker processes, and request
modules can load separate copies of a tracing library or evaluate modules before
asynchronous initialization finishes.

- Initialize once in the framework's supported server or worker startup path.
- Do not create decorators or wrappers at module load time if they can bind to a
  no-op provider before tracer initialization completes. Initialize first or
  defer binding until the real request executes.
- Check framework bundling and external-package requirements when startup and
  request code otherwise see different library instances.
- In Next.js server builds, startup instrumentation and route modules may be
  bundled separately. Keep one shared runtime instance of both `judgeval` and
  `@opentelemetry/api`; for supported Next.js versions this normally means
  adding both packages to `serverExternalPackages` in the existing Next config.
  Externalizing only `judgeval` is not enough when application code imports
  `@opentelemetry/api` directly: two OpenTelemetry API copies can create
  disconnected context managers, leaving the application root and framework
  model/tool spans as separate top-level traces. Confirm the standalone output
  contains an external import/require from the instrumentation hook and request
  route instead of bundled SDK or OpenTelemetry API copies.
- Verify shared runtime behavior from the stored production-path trace, not
  merely from a successful build or synthetic span. The application root,
  framework model/tool spans, and any manually added children must share one
  trace ID; session and customer context set inside the root must appear on that
  root; and the root time window must contain the meaningful child work. Two
  independently exported top-level traces are a failed integration even if
  both contain plausible data.
- Treat every process that performs important work as a separate runtime that
  needs deliberate initialization and export lifecycle handling.
- If the app runs in Docker, a worker platform, or another deployment wrapper,
  treat the complete Judgment connection configuration as one deployment unit.
  Forward `JUDGMENT_API_KEY`, `JUDGMENT_ORG_ID`, the intended project name, and
  every endpoint override present in the launching environment—especially
  `JUDGMENT_API_URL` and `JUDGMENT_API_BASE`—into every process that exports
  spans. Do not forward only the key/org/project trio. A scoped gateway, proxy,
  self-hosted endpoint, test environment, or regional endpoint may use a valid
  key only at its configured URL; silently dropping that URL sends the key to
  the wrong backend and produces authentication failures or no traces.

  For Docker Compose, preserve optional endpoint overrides explicitly alongside
  the required identity variables, for example:

  ```yaml
  environment:
    JUDGMENT_API_KEY: ${JUDGMENT_API_KEY:-}
    JUDGMENT_ORG_ID: ${JUDGMENT_ORG_ID:-}
    JUDGMENT_PROJECT_NAME: ${JUDGMENT_PROJECT_NAME:-my-agent}
    JUDGMENT_API_URL: ${JUDGMENT_API_URL:-}
    JUDGMENT_API_BASE: ${JUDGMENT_API_BASE:-}
  ```

  Before declaring the integration verified, compare the names of all
  `JUDGMENT_*` variables present in the launcher with the names present inside
  the real container/worker process, without printing their values. If a
  launcher variable that affects routing is absent in the target runtime, the
  production path is not configured or verified. A host dotenv file does not
  automatically become container environment.

#### Keep payload capture deliberate

Automatic wrappers record function arguments and return values unless
configured otherwise. Do not blanket-wrap persistence, cache, or framework
helpers: they often duplicate the trace, create unrelated roots, and capture
full histories, documents, or records.

- Prefer the model and tool spans supplied by the framework integration.
- Add manual spans only for high-value retrieval, durable state changes,
  external calls, retries, and errors that are otherwise invisible.
- Disable automatic input/output recording when arguments or results contain
  conversation history, files, schemas, HTML, database records, or secrets.
  Record small sanitized attributes and outcomes instead.
- Do not label ordinary database reads and writes as agent tools merely because
  they are functions. Preserve the semantic difference between an agent tool
  choice and an internal persistence operation.

Make automatic capture an explicit decision for every observed root and tool.
Bound methods include `self` or `this`; file tools can receive entire files;
shell tools can contain credentials in commands; and framework integrations can
record the complete system prompt, conversation history, and serialized tool
schemas. A small smoke test does not prove those payloads remain safe in a real
multi-turn run.

For Python tools whose arguments or results can grow or contain sensitive data,
disable decorator capture and record a small semantic summary from inside the
active tool span:

```python
@Tracer.observe(
    span_type="tool",
    span_name="write_file",
    record_input=False,
    record_output=False,
)
def write_file(self, path: str, content: str) -> dict[str, object]:
    # Do not record self or the file body. Apply the application's path policy
    # before recording even the path.
    Tracer.set_input({"path": safe_relative_path(path), "content_bytes": len(content.encode())})
    result = persist_file(path, content)
    Tracer.set_output({"path": safe_relative_path(path), "bytes_written": result["bytes_written"]})
    return result
```

Use the same pattern for reads, shell commands, HTTP bodies, retrieval results,
database records, and tool errors: record the operation, safe identifiers,
sizes/counts, status, and a bounded redacted preview only when that preview is
actually needed. Do not treat an SDK's maximum accepted payload as an
observability safety limit.

Framework telemetry may also capture inputs and outputs by default. For
example, Vercel AI SDK telemetry defaults both `recordInputs` and
`recordOutputs` to true. When the call receives conversation history, system
prompts, tool schemas, files, HTML, or other potentially large/sensitive data,
turn those defaults off and keep the bounded application root:

```typescript
experimental_telemetry: {
  isEnabled: true,
  recordInputs: false,
  recordOutputs: false,
  tracer: Tracer.getOTELTracer(),
}
```

Then preserve useful tool observability deliberately. If the integration keeps
its tool span active while the tool executes, set a sanitized input/output on
that current span from the tool implementation. Otherwise add one manual child
span with automatic capture disabled. Do not create a second tool span merely
to duplicate the framework span; first verify whether the existing active span
can be enriched.

Verification must inspect raw stored `judgment.input` and `judgment.output` on
the application root, model spans, and tool spans. Exercise at least one
multi-turn/history-heavy request and one large or sensitive-shaped tool input.
Check that the trace still explains the operation while excluding object
representations, full histories, full tool schemas, file bodies, secrets, and
unbounded outputs.

### 3. Explore Traces First

Once baseline instrumentation is working, encourage the user to explore their
traces in the Judgment UI before adding more context:

"Your traces are now appearing in Judgment. Take a look at a few of them. See
what data is being captured, what's useful, and what's missing. This will help
us decide what additional context to add."

This helps the user:

- Understand what they're already getting
- See whether the trace tree matches the real workflow
- Form opinions about what's missing
- Ask better questions about what they need

Code inspection can find likely setup, but real verification requires fresh
traffic through the exact application route and runtime that users will run,
followed by evidence from Judgment. A standalone script, scratch span, unit
test, host-side probe, or SDK-connectivity trace proves only that credentials
and export can work from that probe. It does not prove the instrumented server,
container, worker, stream, or production build exports useful traces.

Use a unique input marker or the application's exact session/workflow ID, then:

1. Start the production-style server, worker, container, or CLI path.
2. Exercise at least one real request that reaches the model and a tool when the
   agent has tools.
3. Wait for deferred work and export to settle.
4. Find the resulting trace by that marker or exact ID, not merely by recency.
5. Inspect the root input/output and time window, child model/tool spans, session
   grouping, errors, and sensitive payloads.

If the real request produces no matching trace, or only the scratch probe
appears, tracing is not verified. Diagnose the runtime, initialization,
bundling, configuration, and flush path before declaring success. Encourage the
user to configure MCP or the CLI so the agent can check traces directly, then
use the UI for human review.

**Preferred: MCP verification**

- Use `list_projects` if the project ID or name is unclear.
- Use `search_traces` to find the newest trace, or search by the test input,
  session ID, customer ID, tag, route, or feature.
- Use `get_trace_detail` to check project, session, duration, cost, and basic
  trace metadata.
- Use `get_trace_spans` to inspect the root span, `llm` spans, `tool` spans,
  inputs, outputs, model metadata, token usage, errors, attributes, and nesting.
- Use `search_sessions`, `get_session_detail`, or `get_session_trace_ids` to
  verify `session_id` grouping.

**Fallback: CLI verification**

```bash
judgment traces search <PROJECT_ID> --pagination '{"limit":25,"cursorSortValue":null,"cursorItemId":null}'
judgment traces get <PROJECT_ID> <TRACE_ID>
judgment traces spans <PROJECT_ID> <TRACE_ID>
judgment sessions trace-ids <PROJECT_ID> <SESSION_ID>
```

**Also guide UI review**

Ask the user to open Monitoring > Traces or Monitoring > Sessions and inspect
the same evidence. UI review is useful even when MCP/CLI verification succeeds
because it helps the user decide what context is useful or missing.

Inspect:

- Does the root span correspond to the user-facing request or agent run?
- Do tool, retrieval, and LLM spans appear as children instead of unrelated flat
  traces?
- Are model name, token usage, latency, cost, and errors visible where expected?
- Does the trace input/output explain behavior without exposing secrets?
- If this is a conversation, does the session page group the expected turns?

### 4. Discover Additional Context Needs

Determine what additional instrumentation would be valuable. Infer from code
when possible, only ask when unclear.

**Infer from code:**

| If you see in code...                                                        | Infer                      | Suggest                                      |
| ---------------------------------------------------------------------------- | -------------------------- | -------------------------------------------- |
| Conversation history, chat endpoints, message arrays                         | Multi-turn app             | `session_id`                                 |
| User authentication, `user_id` variables                                     | User-aware app             | `user_id` or stable internal user identifier |
| Customer, org, workspace, or tenant identifiers                              | Multi-tenant app           | `customer_id`, `tenant_id`, or plan tier     |
| Multiple routes, tools, agents, or product features                          | Multi-feature app          | `feature`, `route`, or agent name attribute  |
| A/B tests, model routing, prompt variants                                    | Experimented app           | experiment, prompt, or model-family tag      |
| Feedback collection, ratings, thumbs up/down                                 | Has user feedback          | capture as scores or behavior signals        |
| Stateless HTTP handlers, workers, queues, serverless functions, or RPC calls | Distributed app            | distributed tracing with `service.name`      |
| Environment-specific projects                                                | Needs project routing      | active tracers with project names            |
| Traced functions spread across modules                                       | Cross-file instrumentation | one tracer init, observed functions          |
| Agent delegation, subagents, or subsystems                                   | Multi-agent app            | agent spans or linked subtraces              |

**Only ask when not obvious from code:**

- "What would you want to filter by in the Judgment UI?" -> Surfaces non-obvious
  tags
- "Are there different user or customer segments you'd want to compare?" ->
  Customer tiers, plans, regions, or tenants
- "Should staging and production traces live in separate Judgment projects?" ->
  Determines whether project routing is needed
- "Does one request cross a stateless HTTP, worker, queue, serverless, or RPC
  boundary?" -> Determines whether distributed tracing is needed
- "How do you know when a response is good vs bad?" -> Determines scoring or
  behavior-monitoring follow-up

**Additions and their value:**

| Addition                         | Why                                                                 | Docs                                                                                         |
| -------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `session_id`                     | Groups multi-turn conversations together                            | https://docs.judgmentlabs.ai/documentation/performance/tracing#grouping-traces-into-sessions |
| `user_id` or customer identifier | Enables user, customer, and tenant filtering                        | https://docs.judgmentlabs.ai/documentation/performance/tracing#manual-attribute-setting      |
| `feature` or route attribute     | Enables per-feature debugging and dashboards                        | https://docs.judgmentlabs.ai/documentation/performance/tracing#manual-attribute-setting      |
| Explicit input/output            | Makes traces readable and avoids dumping sensitive args             | https://docs.judgmentlabs.ai/documentation/performance/tracing#manual-attribute-setting      |
| Project routing                  | Routes staging, prod, or other environments intentionally           | https://docs.judgmentlabs.ai/documentation/performance/tracing#project-routing               |
| `service.name`                   | Separates services in OpenTelemetry and distributed flows           | https://docs.judgmentlabs.ai/documentation/performance/tracing#opentelemetry-integration     |
| Distributed trace propagation    | Connects stateless downstream service spans to the original request | https://docs.judgmentlabs.ai/documentation/performance/tracing#distributed-tracing           |
| Agent linked traces              | Links delegated agent/subsystem work back to the parent trace       | https://docs.judgmentlabs.ai/documentation/performance/tracing#subagent-tracing              |
| Behavior or score signals        | Enables quality filtering and production monitoring                 | https://docs.judgmentlabs.ai/documentation/performance/agent-behavior-monitoring             |

These are NOT baseline best practices. Only add what's relevant based on
inference or user input.

Implementation guidance:

- For `session_id`, set it on the root span of each trace in a conversation.
- For cross-file tracing, initialize `Tracer` once in startup/bootstrap code and
  observe functions where the real work lives.
- For project routing, switch the active project before a root span starts. Do
  not switch projects mid-trace.
- For distributed tracing, first confirm the trace crosses a process or service
  boundary where normal in-memory context will not propagate. Common cases are
  stateless HTTP services, serverless handlers, background workers, queue
  consumers, RPC calls, and separate containers. Use normal nested spans for
  functions/modules that run in the same process.
- When distributed tracing is needed, use SDK propagation helpers. Do not
  hand-roll trace headers unless the docs require it.
- For agent subtracing, check current SDK support for `span_type="agent"`,
  `fork=True`, or linked trace helpers before implementation.
- Use stable internal IDs instead of raw emails or names.

### 5. Guide to UI

After adding context, point users to relevant UI features:

- Traces view: See individual requests, span hierarchy, latency, cost, inputs,
  outputs, and errors
- Sessions view: See grouped conversations if `session_id` is added
- Behaviors: Filter traces or sessions by monitored behavior
- Automations and alerts: Route failures, behaviors, or thresholds into
  follow-up workflows
- Judgment Agent search: Ask the in-product agent to search traces, cite spans,
  and investigate failures

Suggested Judgment Agent questions:

- "Why did this trace fail?"
- "Find recent failed traces for this feature and summarize the shared root
  cause."
- "Which tool call is slow?"
- "Find similar traces."
- "What changed across this session?"

## Framework Integrations

Prefer these over manual instrumentation:

| Framework or provider | Integration style                              | Docs                                                                                      |
| --------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------- |
| LangGraph             | Framework integration                          | https://docs.judgmentlabs.ai/documentation/integrations/agent-frameworks/langgraph        |
| OpenAI Agents SDK     | OpenInference-based framework integration      | https://docs.judgmentlabs.ai/documentation/integrations/agent-frameworks/openai-agents    |
| Claude Agent SDK      | Agent SDK integration                          | https://docs.judgmentlabs.ai/documentation/integrations/agent-frameworks/claude-agent-sdk |
| Google ADK            | OpenTelemetry framework integration            | https://docs.judgmentlabs.ai/documentation/integrations/agent-frameworks/google-adk       |
| Vercel AI SDK         | OpenTelemetry exporter/telemetry               | https://docs.judgmentlabs.ai/documentation/integrations/agent-frameworks/vercel-ai-sdk    |
| LiveKit               | Agent framework integration                    | https://docs.judgmentlabs.ai/documentation/integrations/agent-frameworks/livekit          |
| OpenAI                | Provider wrap or OpenTelemetry instrumentation | https://docs.judgmentlabs.ai/documentation/integrations/model-providers/openai            |
| Anthropic             | Provider wrap or OpenTelemetry instrumentation | https://docs.judgmentlabs.ai/documentation/integrations/model-providers/anthropic         |
| OpenRouter            | OpenAI-compatible provider tracing             | https://docs.judgmentlabs.ai/documentation/integrations/model-providers/openrouter        |
| OpenLit               | Existing tracing provider integration          | https://docs.judgmentlabs.ai/documentation/integrations/tracing-providers/openlit         |
| OpenInference         | Existing tracing provider integration          | https://docs.judgmentlabs.ai/documentation/integrations/tracing-providers/openinference   |
| OpenLLMetry           | Existing tracing provider integration          | https://docs.judgmentlabs.ai/documentation/integrations/tracing-providers/openllmetry     |

Full list: https://docs.judgmentlabs.ai/documentation/integrations/introduction

## Always Explain Why

When suggesting additions, explain the user benefit:

```text
"I recommend adding session_id to your traces.

Why: This groups messages from the same conversation together.
You'll be able to see full conversation flows in the Sessions view,
making it much easier to debug multi-turn behavior.

Learn more:
https://docs.judgmentlabs.ai/documentation/performance/tracing#grouping-traces-into-sessions"
```

```text
"I recommend using distributed tracing for this request path.

Why: The request crosses the API service and worker, so without propagation
Judgment will show two unrelated traces. Propagating trace context keeps the
full request flow in one trace tree.

Learn more:
https://docs.judgmentlabs.ai/documentation/performance/tracing#distributed-tracing"
```

## Common Mistakes

| Mistake                                        | Problem                                          | Fix                                                                   |
| ---------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------- |
| No flush/shutdown in short-lived scripts       | Traces may never be sent                         | Call the documented flush/shutdown method before exit                 |
| Shutting down inside a server handler          | Later requests may stop tracing                  | Shutdown only on process teardown                                     |
| Flat traces                                    | Can't see which step failed                      | Use one root span with nested spans for tools, retrieval, and LLMs    |
| Generic trace names                            | Hard to filter                                   | Use descriptive names: `support-chat-turn`, `retrieve-documents`      |
| Logging sensitive data                         | Data leakage risk                                | Mask or omit PII, secrets, auth headers, and unnecessary raw payloads |
| Not explicitly setting input/output            | Trace input may be noisy or sensitive            | Set only relevant input/output for the root span                      |
| Manual instrumentation when integration exists | More code, less context                          | Use the matching framework or provider integration                    |
| Double-instrumenting the same model call       | Duplicate spans and confusing costs              | Use one instrumentation path per model call                           |
| Initializing tracing in every module/request   | Duplicate setup and export issues                | Initialize once in startup/bootstrap code                             |
| Bundling separate tracing SDK copies           | Startup initializes one copy while routes use a no-op copy | Externalize/share the tracing package in the server runtime |
| Setting session context before a root exists   | Setters have no active span to attach to         | Start the root, then set session/customer context inside it            |
| Wrapping a function that only returns a stream | Root ends before generation and persistence      | End a manually controlled root from finish/error/abort callbacks       |
| Blanket-wrapping persistence helpers           | Noisy roots and excessive payload capture        | Trace only high-value operations with bounded attributes               |
| Env vars present only on the host               | Container or worker exports nothing              | Forward Judgment variables into every runtime that performs work       |
| Missing `session_id` for chat apps             | Conversations do not group in Sessions           | Set `session_id` on each root trace in the conversation               |
| Switching projects mid-trace                   | Spans may route incorrectly or fail to switch    | Route before the root span starts                                     |
| Missing distributed propagation                | Downstream service appears as an unrelated trace | Inject and continue trace context across service boundaries           |
| Guessing SDK APIs from memory                  | Outdated code or mixed SDK generations           | Fetch docs and match the installed SDK version                        |
