# Temporal and Durable-Workflow Tracing

Use this guide when an application starts work that can outlive the request
that submitted it, especially when it uses Temporal workflows, activities,
retries, timers, human approval, signals, worker restarts, or replay.

The official Judgment Temporal integration explains how to route Temporal's
OpenTelemetry spans through Judgment. That is transport setup, not a complete
trace design. Before installing an interceptor, decide which application work
should be a trace, where durable boundaries occur, and which stable ID should
group the resulting traces into a session.

## Required model

A durable job normally becomes several traces in one Judgment session:

- A short submission or approval request is its own request trace with
  faithful input and output.
- Durable work between two checkpoints is a work-segment trace.
- A human-approval wait, long timer, queue handoff with no active owner, or
  other durable suspend ends the current segment.
- Work after resume starts a fresh trace.
- Every trace belonging to the same job uses the stable workflow or job ID as
  `judgment.session_id`.
- Activity, LLM, and tool spans sit under the segment or activity root that was
  actually active while they ran.

For a workflow that plans, executes steps, waits for approval, then writes a
report, a useful target is:

```text
session_id = workflow_id

trace: job.submit
  input: bounded goal + requester
  output: workflow_id + accepted status

trace: workflow.pre_approval
  input: workflow_id + bounded goal
  children: plan, execute-step, LLM, and tool work
  output: plan/step counts + awaiting_approval

trace: job.approve
  input: workflow_id + approver/decision
  output: acknowledged status

trace: workflow.post_approval
  input: workflow_id + approval outcome
  children: synthesis, report-write, LLM, and tool work
  output: completed status + bounded result metadata
```

Do not create this shape by leaving a span object open across an indefinite
wait or by pretending an HTTP request lasted for the entire workflow. Each
root must have a real owner, a non-zero duration, faithful final input/output,
and a time window that contains its children.

## Why automatic distributed tracing is not enough

Temporal's `TracingInterceptor` is useful for propagating context and exposing
workflow/activity mechanics. Used as the only design decision, however, it can
produce one of two unhelpful shapes:

1. A millisecond submission-request root that is finalized before worker spans
   arrive. Later workflow and activity work is attached outside the root's
   time window, so Judgment evaluates an incomplete trace.
2. A waterfall dominated by `StartWorkflow`, `RunWorkflow`, `RunActivity`,
   polling, and transport shells instead of the agent's planning, tools, model
   calls, approval, and final result.

Never infer correctness merely because spans share a trace ID. Inspect the raw
root duration and verify that every child begins and ends inside the root. Also
inspect the root itself: setting `session_id` inside an activity child does not
retroactively place it on the already-created request root.

Use the interceptor only when its generated spans support the chosen
application model. It may be appropriate as supplemental infrastructure detail
or inside one bounded segment. Do not propagate the submit request's ambient
trace context into hours or days of durable work.

## Choose boundaries from the workflow before editing code

Read the producer routes, workflow definition, activity definitions, worker
startup, retry policy, and signal/approval paths. Write down:

1. The stable workflow/job ID.
2. Every short write request that deserves its own trace.
3. Every durable suspend or checkpoint.
4. The business work performed before and after each checkpoint.
5. Which process owns each segment and can reliably finalize and flush it.
6. What retries, worker kills, or replays can occur.
7. Which read-only polling routes should be excluded or sampled.

If a root cannot have one reliable owner across multiple activities, do not
fake a cross-process parent. Use the safe fallback below and report it as a
deliberate alternative.

## Safe fallback: one activity or execution phase per trace

When a single segment root cannot be continued and finalized reliably across
Temporal tasks, use one root per meaningful activity or restart-safe execution
phase. Name roots by business purpose, not framework mechanics, and group all
of them with `session_id = workflow_id`.

These must be fresh application traces, not ordinary children of propagated
`StartWorkflow` / `RunActivity` context. Prefer not to propagate the short
submission request's trace context into durable workers at all. If the
installed Judgeval version supports the documented `Tracer.observe(...,
fork=True)` behavior, use it defensively at the application activity boundary:
when an interceptor-created parent is active, the business activity runs under
a fresh linked-trace root instead of extending the submit trace. Inspect the
installed SDK signature and stored trace IDs rather than assuming this option
exists or behaves identically in every version.

For example:

```text
session workflow-123
  trace workflow.plan
    children: LLM calls
  trace workflow.execute_step
    children: fetch_url, extract_table, LLM calls
  trace workflow.execute_step
    children: summarize_chunk, LLM calls
  trace workflow.synthesize
    children: LLM call, write_report
```

This is less compact than a pre-approval and post-approval pair, but it is
honest and useful when every root has faithful input/output and the session
reconstructs the job. It is preferable to a single malformed mega-trace or a
short request root with children outside its window.

For a Python Temporal activity, initialize Judgment in the activity worker
before the worker starts. Then create the application root at the activity
entrypoint, and set session context only after that root is active:

```python
from judgeval import Tracer
from temporalio import activity


@activity.defn
@Tracer.observe(
    span_type="agent",
    span_name="workflow.execute_step",
    record_input=False,
    record_output=False,
    fork=True,
)
async def execute_step(request):
    info = activity.info()
    Tracer.set_session_id(info.workflow_id)
    Tracer.set_input({
        "workflow_id": info.workflow_id,
        "step_index": request.step.index,
        "step_title": bounded_text(request.step.title),
        "attempt": info.attempt,
    })

    result = await run_step(request)

    Tracer.set_output({
        "step_index": result.index,
        "status": "completed",
        "tool_count": len(result.tool_calls),
    })
    return result
```

`bounded_text` is a placeholder for the application's real redaction and size
policy. Do not record complete workflow state, prior reports, HTML, files,
conversation history, or credentials merely because an activity request is a
dataclass that automatic capture can serialize.

After live traffic, prove that the `workflow.execute_step` span is the
parentless root of its own trace. If it still shares the `POST /jobs` trace ID
or sits below `RunActivity`, the fallback was not implemented: remove the
unwanted inherited context or use the installed SDK's documented fresh/linked
trace primitive. Merely adding `@Tracer.observe` with its normal `fork=False`
default does not break an active Temporal interceptor parent chain.

If a worker can be killed immediately after activity completion, use a worker
or activity lifecycle point that runs after the root ends to make a bounded,
observable `Tracer.force_flush()` attempt. A flush executed while the root is
still open cannot export that root's final state.

## Producer routes and polling

Trace short producer writes separately from durable execution:

- `POST /jobs`: bounded request input; workflow ID and accepted status output.
- `POST /jobs/{id}/approve`: workflow ID, bounded decision metadata, and
  acknowledgement output; use the workflow ID as the session ID.
- Cancellation or retry-control writes: their own traces when operationally
  meaningful.

For Python FastAPI/Starlette producers, do not assume that initializing
Judgeval in the lifespan coroutine activates the tracer in request tasks.
Judgeval 1.2.x stores the active tracer in a context variable. A lifespan task
and a request task can therefore use different active-tracer contexts even
inside one process.

Prefer initializing and retaining the tracer in the module, app factory, or
server entrypoint after environment loading but before the server creates its
lifespan and request tasks. Use lifespan for shutdown rather than as the first
activation site. A representative shape is:

```python
settings = get_settings()  # load dotenv/config before Tracer.init reads it
JUDGMENT_TRACER = Tracer.init(
    project_name=settings.judgment_project_name,
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    Tracer.shutdown()

app = FastAPI(lifespan=lifespan)
```

When framework constraints require lifespan initialization, keep the returned
tracer and call its documented `set_active()` at the beginning of each request
or consumer task before any application root is active. Do not switch providers
in the middle of a trace. Match this to the installed SDK and middleware
ordering.

The proof is not a startup log: execute one real submission and one real
approval, then find both stored roots by the exact workflow ID. Worker activity
traces do not prove that the producer request context is active.

Do not use a framework-wide HTTP instrumentor without filtering. Health checks
and high-frequency `GET /status` polling can create dozens of roots for every
few meaningful workflow traces. Exclude them, sample them separately, or keep
them out of the agent-tracing project.

## Sessions are the durable continuity mechanism

A Judgment session groups multiple completed traces. It is not a substitute
for a trace, and it should not duplicate the same boundary without adding
continuity.

For a durable workflow:

- Use the exact workflow/job ID already persisted by the application.
- Put it on the root of every request, segment, or activity trace that belongs
  to the job.
- Verify the root attribute in stored data; seeing the ID on a child is not
  sufficient.
- Confirm pre-restart and post-restart traces appear in the same Sessions view.
- Keep distinct workflows in distinct sessions.

Do not generate a new session ID in each worker process, use a process-local
global, or use the HTTP request ID as the durable session identifier.

## Replay and retry safety

Temporal workflow code is replayed and must remain deterministic. Avoid
network export, random IDs, wall-clock reads, tracer initialization, or direct
span lifecycle work inside deterministic workflow code unless the installed
Temporal integration explicitly guarantees replay-safe behavior.

Prefer instrumentation at:

- producer request handlers;
- activity entrypoints;
- LLM and tool calls inside activities;
- worker startup/shutdown and supported interceptors; and
- explicit, persisted carriers or workflow fields when the architecture has a
  proven cross-process segment design.

Record Temporal's activity attempt number and outcome. A failed attempt and a
successful retry may both be useful when clearly labeled, but replay or
double-instrumentation must not create indistinguishable duplicates. A killed
attempt must not leave a zero-duration root that looks like a completed trace.

## Payload and tool rules

Durable workflows often move large state objects between activities. Automatic
capture can copy the same goal, prior results, HTML, reports, tool schemas, or
credentials into every trace.

- Disable automatic root/tool input and output capture when payloads are not
  known to be small and safe.
- Redact secrets before truncating; truncation alone still stores a secret.
- Prefer stable IDs, counts, statuses, safe titles, byte lengths, and bounded
  summaries.
- Keep business tool identity and useful semantic input/output-or-error.
- Do not duplicate framework-generated LLM or tool spans with a second manual
  span unless the framework span cannot carry the required evidence.

## Mandatory real-path verification

Unit tests and scratch spans do not prove a durable workflow integration.
Exercise a real production-style workflow and inspect the stored result by the
exact workflow ID.

At minimum:

1. Start one job and record its workflow ID.
2. Let pre-approval work complete.
3. Kill or restart an activity worker during one attempt when the application
   supports retries.
4. Pause for and then send the real approval/signal.
5. Restart the workflow worker while the job is suspended when supported.
6. Let post-approval work finish.
7. Search Judgment by the exact workflow ID and wait for ingestion to settle.
8. Inspect every root and representative child from raw stored span data.

The result passes only when:

- no trace has children outside its root time window;
- every meaningful root has faithful bounded input and final output;
- every root carries the exact workflow ID as `session_id`;
- the session contains pre- and post-suspend work across restarts;
- retries are visible without indistinguishable duplicates;
- LLM and business-tool spans remain useful;
- submission and approval writes are visible;
- status polling and Temporal infrastructure do not dominate; and
- no large state objects or secrets appear in raw attributes.

If the runtime cannot execute this scenario, report live verification as
blocked. Do not replace it with a tool-only smoke trace or a claim that the
interceptor should connect everything.

## Completion gate

Before saying the tracing task is complete, report evidence for each row:

| Gate | Required evidence |
| --- | --- |
| Workflow model | Stable workflow ID, durable checkpoints, and chosen trace units are named |
| Request separation | Submit/approve writes are separate from durable worker execution |
| Producer activation | A real submit and approval root prove that the producer's request-task context uses the initialized tracer; worker exports alone do not satisfy this gate |
| Fresh activity roots | Fallback activity/phase roots have trace IDs distinct from the submit request and are not children of Temporal interceptor shells |
| Root lifetime | Raw duration arithmetic shows every child inside its root |
| Session placement | Exact workflow ID is stored on every meaningful root, not only children |
| Suspend boundary | Work after approval/timer/signal starts a fresh trace |
| Worker coverage | Every process that performs important work initializes and exports correctly |
| Retry/replay | Attempts are labeled; no replay or double-instrumentation duplicates |
| Signal density | Business spans outnumber or clearly dominate Temporal/HTTP/polling shells |
| Payload safety | Raw stored attributes contain bounded, redacted semantic data only |
| Export lifecycle | Completed work survives the tested worker kill/restart |
| Real-path proof | Stored traces for the exact workflow ID match the actual scenario ledger |
