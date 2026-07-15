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
| Distributed tracing                 | One bounded unit of work crosses a stateless service, worker, queue, serverless, or RPC boundary | https://docs.judgmentlabs.ai/documentation/performance/tracing#distributed-tracing | Keeps downstream spans connected when one real root can own the complete unit; durable suspends still require new traces grouped by session |
| Streaming and deferred completion   | A function returns before generation, tools, callbacks, persistence, or export finish | Relevant framework integration and tracer lifecycle docs                      | Keeps the root open for the actual unit of work and prevents silent span loss |
| Agent subtracing with linked traces | Agents delegate to subagent                                     | https://docs.judgmentlabs.ai/documentation/performance/tracing#subagent-tracing    | Splits subagents into their own traces for independent evaluation        |

#### Choose the work boundary before adding spans

First identify the meaningful unit of work and the event that proves it is
finished. Start the root when that work is triggered and end it only after its
final output and important side effects are complete. The return of a function
is not always the end of the work it started.

Define faithful root IO before adding child spans. From the root's
`judgment.input` and `judgment.output` alone, a reviewer or behavior must be
able to tell what business work was requested and what final result or error it
produced. Stable IDs, status, counts, lengths, hashes, paths, and omission
markers are useful supporting metadata, but they are not a semantic trigger or
result by themselves when the application produced one. Child LLM/tool spans
cannot repair a behavior-blind root because Judgment evaluations use the root
as their primary evidence.

Do not trace every route merely because a scenario calls it. Agent-generating
writes such as a chat turn, task submission, approval, or durable work phase are
normally meaningful roots. Health checks, repeated status polls, and read-only
session/transcript endpoints normally are not: they inspect already-completed
state without running the agent. Leave routes such as `GET /health`,
`GET /status`, and `GET /sessions/{id}` untraced unless the read itself performs
meaningful user-facing business or agent work that needs independent debugging.

This distinction also applies to verification traffic. A protected or local
test may call a readback endpoint after every turn to assert persistence. Those
calls are evidence about the application, not additional expected traces.
Before claiming completion, record the meaningful requests/operations and
their outcomes, reconcile that list with stored root counts, and calculate the
ratio of meaningful roots to health/status/readback roots. Extra readback roots
are over-instrumentation, not harmless coverage.

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
4. In the framework's completion callback, finish persistence and set the final
   user-visible output, but do not assume that callback is late enough to end
   the root. Some integrations close their own outer telemetry span afterward.
5. End the root from one idempotent completion barrier that runs after every
   meaningful child has finished. Error, abort, and cancellation paths must
   reach the same barrier after recording their outcome.

Use the integration-specific reference for copyable implementation code. In
particular, Next.js + Vercel AI SDK streaming has version-specific setup and
completion ordering; the focused reference takes precedence over this general
sequence. When a TypeScript root must outlive the synchronous function that
creates a stream, use Judgeval's exposed OpenTelemetry tracer rather than
mixing `Tracer.startSpan(...)` with a separately imported OpenTelemetry
`context.with(...)` that may use a different context manager.

Ending the spans is not the same as exporting them. A batch exporter can still
hold a fully completed turn in memory when a container is killed, a serverless
instance freezes, or a short-lived process exits. For runtimes where that can
happen, create one completion barrier that does all of the following in order:

1. wait for generation, tool calls, stream consumption, and persistence;
2. let the framework's telemetry spans finish;
3. end the application root; and
4. make a bounded, observable `await Tracer.forceFlush()` attempt before the
   runtime is allowed to freeze or exit.

Connect that promise to a lifecycle mechanism the runtime actually waits for,
such as a response-stream finalizer, `waitUntil`, `after`, a job acknowledgement,
or the main CLI promise. A detached `void Tracer.forceFlush()` call is still a
race. If a framework invokes `onFinish` before its outer telemetry span closes,
flush from the later response/runtime finalizer rather than from inside that
early callback.

For an ordinary Python request server, use the same two-layer pattern that a
durable activity uses: the inner observed function owns and ends the business
root; the outer route waits for that function and only then flushes before
returning. Use the fail-open helper from
[instrumentation-safety-and-evidence.md](instrumentation-safety-and-evidence.md)
and adapt names and response types to the repository:

```python
import asyncio

def set_turn_trace_input(request: ChatRequest) -> None:
    Tracer.set_session_id(request.session_id)
    Tracer.set_input(safe_turn_input(request))

@Tracer.observe(
    span_type="agent",
    span_name="agent.chat_turn",
    record_input=False,
    record_output=False,
)
async def traced_turn(request: ChatRequest) -> ChatResult:
    best_effort_trace_write(
        "turn input", lambda: set_turn_trace_input(request)
    )
    result = await run_agent_turn(request)
    best_effort_trace_write(
        "turn output", lambda: Tracer.set_output(safe_turn_output(result))
    )
    return result

@app.post("/chat")
async def chat(request: ChatRequest):
    try:
        return await traced_turn(request)  # the business root ends on return/raise
    finally:
        try:
            flushed = await asyncio.to_thread(Tracer.force_flush, 5_000)
            if not flushed:
                report_telemetry_failure(
                    "chat flush", TimeoutError("flush timed out")
                )
                # Preserve behavior, but do not claim restart-safe export.
        except Exception as error:
            # Telemetry failure must not replace a valid result or the
            # application's original exception.
            report_telemetry_failure("chat flush", error)
```

Do not copy `agent.chat_turn`, request types, or helper names literally. The
important ordering is root completion followed by an awaited bounded flush in
the outer lifecycle owner.

Verify the barrier adversarially: complete a real streamed turn and immediately
kill or restart the worker. The completed pre-restart turn and the first
post-restart turn must both arrive with their final root input/output, non-zero
root duration, session/customer context, and complete child tree. A partial
zero-duration root or missing final framework span is export-lifecycle failure,
even when earlier and later turns look correct.

Do not assume framework telemetry creates the application-level root. For
example, Vercel AI SDK telemetry can describe generation and tool steps while
the application still needs a root for the completed chat turn.

If one root cannot safely continue across a durable suspend or process boundary,
end it at a real durable checkpoint and start a new trace for the next work
segment. Group related segments with the application's stable workflow or run
identifier as `session_id`. Do not keep a short HTTP request root open on paper
while unrelated worker activity continues after its time window.

For Temporal and other durable workflow engines, invoke the focused
`judgment-tracing-durable-workflows` skill. A framework
interceptor can propagate spans without choosing correct application roots. In
particular, do not inherit a short submission request as the parent of an
hours-long job, and verify `session_id` on each stored root rather than assuming
that setting it inside an activity updated its ancestors.

For a long-running loop that durably saves state after each model decision,
invoke the focused `judgment-tracing-checkpointed-loops` skill. The saved
iteration is normally the trace boundary and the run ID is the session. A
process-lifetime segment root can lose many already-completed iterations when
the process is killed before that outer root ends.

For a persistent wrapper around an external agent CLI, invoke the focused
`judgment-tracing-cli-wrappers` skill. The underlying
CLI session returned by the first subprocess call is normally the durable
`session_id`; set it on the still-active wrapper root before finalization and
verify resume continuity after a wrapper restart.

#### Confirm initialization in the real runtime

Tracer initialization and observed code must use the same active tracer
provider. Framework startup hooks, server bundles, worker processes, and request
modules can load separate copies of a tracing library or evaluate modules before
asynchronous initialization finishes.

- Initialize once in the framework's supported server or worker startup path.
- In Python Judgeval 1.2.x, the active tracer is context-local. Calling
  `Tracer.init()` inside a FastAPI/Starlette lifespan task does not prove that
  sibling request tasks inherit that active tracer. Keep the returned tracer
  and activate it inside each request/consumer task before decorated business
  work begins, or initialize it in an ancestor context that is proven to be
  copied into those tasks. Match the installed SDK's `set_active` API and treat
  a failed activation as observable configuration failure.
- Do not create decorators or wrappers at module load time if they can bind to a
  no-op provider before tracer initialization completes. Initialize first or
  defer binding until the real request executes.
- Check framework bundling and external-package requirements when startup and
  request code otherwise see different library instances.
- Follow the integration-specific reference for framework bundling rules. A
  split startup/request bundle can initialize one SDK copy while application
  code silently uses another no-op copy.
- Verify shared runtime behavior from the stored production-path trace, not
  merely from a successful build or synthetic span. The application root,
  framework model/tool spans, and any manually added children must share one
  trace ID; session and customer context set inside the root must appear on that
  root; and the root time window must contain the meaningful child work. Two
  independently exported top-level traces are a failed integration even if
  both contain plausible data.
- Treat every process that performs important work as a separate runtime that
  needs deliberate initialization and export lifecycle handling.
- Treat every independent async task family as a context boundary too. One
  process can export worker spans correctly while request handlers in that same
  process silently use a no-op tracer. Exercise and inspect at least one stored
  trace from each important entrypoint rather than inferring activation from a
  different route or worker.
- If the app runs in Docker, a worker platform, or another deployment wrapper,
  treat the complete Judgment connection configuration as one deployment unit.
  Forward `JUDGMENT_API_KEY`, `JUDGMENT_ORG_ID`, the intended project name, and
  every endpoint override supported by the installed SDK and present in the
  launching environment—especially `JUDGMENT_API_URL`—into every process that
  exports spans. Do not forward only the key/org/project trio. A scoped gateway, proxy,
  self-hosted endpoint, test environment, or regional endpoint may use a valid
  key only at its configured URL; silently dropping that URL sends the key to
  the wrong backend and produces authentication failures or no traces.

  For Docker Compose, preserve optional endpoint overrides explicitly alongside
  the required identity variables, for example:

  ```yaml
  environment:
    JUDGMENT_API_KEY: ${JUDGMENT_API_KEY:-}
    JUDGMENT_ORG_ID: ${JUDGMENT_ORG_ID:-}
    JUDGMENT_PROJECT_NAME: ${JUDGMENT_PROJECT_NAME:?JUDGMENT_PROJECT_NAME is required}
    JUDGMENT_API_URL: ${JUDGMENT_API_URL:-}
  ```

  Require the project in application configuration too; Compose substitution
  alone does not protect local, process-manager, or test launchers. For Python:

  ```python
  import os

  def require_env(name: str) -> str:
      value = os.getenv(name)
      if value is None or not value.strip():
          raise RuntimeError(f"{name} is required")
      return value

  judgment_project = require_env("JUDGMENT_PROJECT_NAME")
  ```

  An explicit-empty-project negative test must exit nonzero before the server
  accepts traffic. Do not merely `unset` the variable: dotenv may repopulate it.
  Reject `${JUDGMENT_PROJECT_NAME:-example}`, hard-coded agent names, and a
  silent no-op tracer as substitutes for explicit routing.

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
    best_effort_trace_write("write-file input", lambda: Tracer.set_input({
        "path": safe_relative_path(path),
        "content_bytes": len(content.encode()),
    }))
    result = persist_file(path, content)
    best_effort_trace_write("write-file output", lambda: Tracer.set_output({
        "path": safe_relative_path(path),
        "bytes_written": result["bytes_written"],
    }))
    return result
```

Use the same pattern for reads, shell commands, HTTP bodies, retrieval results,
database records, and tool errors: record the operation, safe identifiers,
sizes/counts, status, and a bounded redacted preview only when that preview is
actually needed. Do not treat an SDK's maximum accepted payload as an
observability safety limit.

Framework and provider integrations may capture inputs and outputs by default.
Before wrapping a provider, inspect the exact installed version and wrapper
signature and answer one binary question: can automatic model IO and
provider-specific prompt fields be disabled? Do not infer the answer from a
different language or SDK release.

- If the installed integration exposes capture controls, disable bulk capture
  for calls that can contain history, system prompts, tool schemas, files,
  HTML, or secrets, then verify the raw stored attributes.
- If it does not expose those controls, do not wrap a sensitive provider call
  merely to obtain model metadata. Use a version-supported manual LLM child
  with automatic IO disabled and explicitly record safe provider/model/token/
  cost/error fields, or report privacy-safe LLM coverage as blocked.

For example, Judgeval Python 1.2.x `Tracer.wrap(client)` has no argument for
disabling the wrapped OpenAI request/response capture. Inspect the installed
signature rather than inventing a parameter. Do not copy configuration fields
from another SDK major version.

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

In the final response, label every claim with its actual evidence level:

| Evidence level | What it can prove |
|---|---|
| Static | Code/config contains the intended instrumentation and routing |
| Synthetic | SDK wiring works in a scratch, stub, fake, or unit-test path |
| Real application | The production-style application path executed successfully |
| Stored Judgment evidence | The matching real root/session was found and its IO, window, children, routing, noise, and raw payloads were inspected |

Use “live” or “end-to-end verified” only for the final level and include the
exact marker, session ID, and trace ID. If Judgment readback is available for
the current run, use it. If it is unavailable, say stored verification is
blocked instead of generalizing from a synthetic check.

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
| Wrapping a function that only returns a stream | Root ends before generation and persistence      | Use the integration's post-child completion barrier, including error/abort paths |
| Blanket-wrapping persistence helpers           | Noisy roots and excessive payload capture        | Trace only high-value operations with bounded attributes               |
| Tracing session/status readback routes          | Verification and polling calls outnumber the agent turns they inspect | Leave read-only health/status/session/transcript endpoints untraced unless they perform independent meaningful work; reconcile expected root counts |
| Env vars present only on the host               | Container or worker exports nothing              | Forward Judgment variables into every runtime that performs work       |
| Missing `session_id` for chat apps             | Conversations do not group in Sessions           | Set `session_id` on each root trace in the conversation               |
| Switching projects mid-trace                   | Spans may route incorrectly or fail to switch    | Route before the root span starts                                     |
| Missing distributed propagation                | Downstream service appears as an unrelated trace | Inject and continue trace context across service boundaries           |
| Treating a durable job as one request trace     | A short submit root finalizes before worker children or stays open across an indefinite suspend | End traces at durable checkpoints and group restart-safe work traces with the workflow ID as `session_id` |
| Using a Temporal interceptor as the trace design | Framework shells form a malformed mega-trace or drown out business work | Choose application request/segment/activity roots first; use the interceptor only where it supports that model |
| Setting a durable session only inside a child   | The activity shows an ID but the root and Sessions view remain ungrouped | Set the exact workflow ID after each application root becomes active, then verify the raw root attribute |
| One root for a checkpointed autonomous loop     | A process kill leaves the outer root unfinalized and hides many completed decisions from Sessions/evaluation | Trace each durably saved iteration and group iterations with the stable run ID |
| Grouping an agent CLI by only the wrapper ID     | Judgment sessions do not reflect the real CLI conversation resumed across turns | Set the returned/resumed CLI session ID on each wrapper-turn root; keep wrapper ID as an attribute |
| Forwarding key/org but not project or endpoint  | The wrapper runs but exports to a guessed, nonexistent, or wrong destination | Forward and verify key, org, explicit project, and supported endpoint override in the real runtime |
| Guessing SDK APIs from memory                  | Outdated code or mixed SDK generations           | Fetch docs and match the installed SDK version                        |
