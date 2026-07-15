# Judgment Tracing for Persistent Agent CLI Wrappers

Use this guide when a web service launches an external coding/agent CLI, stores
the CLI's returned session ID, and resumes later turns with that ID. Examples
include FastAPI or Node wrappers around `claude -p`, Codex CLI, or another
long-running agent process.

The wrapper has two identities:

- its own HTTP/database session ID; and
- the underlying agent CLI session ID used by `--resume` or its equivalent.

Choose deliberately. For agent observability, the underlying CLI session ID is
normally the Judgment `session_id`, because it is the durable identity of the
agent conversation. Keep the wrapper ID as an additional attribute for database
debugging.

## Required model

- One completed wrapper task/request is one trace.
- The root starts when the parsed request enters business handling and remains
  active through business/session validation, the CLI subprocess, returned-ID
  parsing, session mapping, turn persistence, and final HTTP reply.
- Root input is the bounded, sanitized task prompt.
- Root output is the final reply plus small status metadata.
- `judgment.session_id` is the CLI session ID returned by the first invocation
  and passed to `--resume` on later turns.
- A child represents the CLI invocation with mode, resume/not-resume, exit
  code, duration, and output-or-error.
- Captured CLI-internal LLM/tool/subagent activity may be nested or linked when
  the source timestamps and context are trustworthy. Do not claim inner-agent
  coverage from only an aggregate subprocess span.
- Health and session-read endpoints are excluded or sampled separately.

Example:

```text
session_id = underlying_cli_session_id

trace sidecar.task
  input: bounded prompt + wrapper_session_id
  child agent_cli.invoke
    input: cli mode + resumed true/false
    output: exit_code + duration + returned_cli_session_id
  output: bounded final reply + turn_index
```

## The first-turn identity problem

On the first request, the underlying CLI session ID is not known until the
subprocess returns. Do not permanently assign the wrapper ID as Judgment's
session merely because it is available earlier.

Keep the application root active, run and parse the CLI, then set the returned
CLI session ID on that same root before it ends. On later turns, verify that
the persisted ID passed to `--resume` equals the ID stored on the root.

Conceptually:

```python
from dataclasses import dataclass
from typing import cast
from opentelemetry.trace import Status, StatusCode

def report_telemetry_failure(label: str, error: Exception) -> None:
    try:
        logger.error("Judgment %s failed (%s)", label, type(error).__name__)
    except Exception:
        pass

def best_effort_trace_write(label: str, write) -> None:
    try:
        # Keep trace-only sanitization/classification inside write too.
        write()
    except Exception as error:
        report_telemetry_failure(label, error)

@dataclass
class Outcome:
    value: object | None = None
    error: Exception | None = None
    error_code: str | None = None
    exit_code: int | None = None

def mark_error(code: str, exit_code: int | None = None) -> None:
    output = {"status": "failed", "error_code": code}
    if exit_code is not None:
        output["exit_code"] = exit_code
    Tracer.set_output(output)
    Tracer.get_current_span().set_status(Status(StatusCode.ERROR, code))

def cli_failure(error, code, exit_code=None) -> Outcome:
    best_effort_trace_write(
        f"CLI {code}", lambda: mark_error(code, exit_code)
    )
    return Outcome(error=error, error_code=code, exit_code=exit_code)

@Tracer.observe(
    span_type="agent",
    span_name="agent_cli.invoke",
    record_input=False,
    record_output=False,
)
def traced_cli_invoke(request, wrapper_session) -> Outcome:
    best_effort_trace_write(
        "CLI input",
        lambda: Tracer.set_input({
            "mode": "noninteractive",
            "resumed": wrapper_session.cli_session_id is not None,
        }),
    )
    try:
        result = runner.run_task(
            request.prompt,
            workspace_path=wrapper_session.workspace_path,
            cli_session_id=wrapper_session.cli_session_id,
        )
    except TimeoutError as error:
        return cli_failure(error, "cli_timeout")
    except OSError as error:
        return cli_failure(error, "cli_launch_failed")
    except Exception as error:
        return cli_failure(error, "cli_invoke_failed")

    if result.exit_code != 0:
        # Reuse the application's existing nonzero-exit error object and keep
        # it in memory; never construct trace data from raw stderr.
        error = existing_nonzero_exit_error(result)
        return cli_failure(
            error=error,
            code="cli_nonzero_exit",
            exit_code=result.exit_code,
        )

    best_effort_trace_write(
        "CLI result",
        lambda: Tracer.set_output({
            "status": "completed",
            "exit_code": result.exit_code,
            "returned_cli_session_id": result.cli_session_id,
            "reply": bounded_text(result.reply),
        }),
    )
    return Outcome(value=result, exit_code=result.exit_code)

def set_root_prompt(wrapper_session, request) -> None:
    Tracer.set_attribute("wrapper.session_id", wrapper_session.id)
    if wrapper_session.cli_session_id:
        Tracer.set_session_id(wrapper_session.cli_session_id)
    Tracer.set_input({
        "request_kind": "agent_task",
        "wrapper_session_id": wrapper_session.id,
        "prompt": bounded_text(request.prompt),
    })

def set_root_success(result: CliResult, turn, reply: str) -> None:
    Tracer.set_session_id(result.cli_session_id)
    Tracer.set_output({
        "reply": bounded_text(reply),
        "turn_index": turn.index,
        "exit_code": result.exit_code,
    })

@Tracer.observe(
    span_type="agent",
    span_name="sidecar.task",
    record_input=False,
    record_output=False,
)
def traced_wrapper_turn(request) -> Outcome:
    best_effort_trace_write(
        "root request metadata",
        lambda: Tracer.set_input({
            # Metadata-only until business/session validation accepts it.
            "request_kind": "agent_task",
            "wrapper_session_id": safe_wrapper_id(request.session_id),
        }),
    )
    try:
        wrapper_session = store.get_or_create_session(request.session_id)
    except Exception as error:
        best_effort_trace_write(
            "session validation error",
            lambda: mark_error(classify_session_error(error)),
        )
        return Outcome(error=error)

    best_effort_trace_write(
        "root prompt", lambda: set_root_prompt(wrapper_session, request)
    )
    cli = traced_cli_invoke(request, wrapper_session)
    if cli.error is not None:
        best_effort_trace_write(
            "root CLI error",
            lambda: mark_error(cli.error_code or "cli_failed", cli.exit_code),
        )
        return Outcome(error=cli.error)

    result = cast(CliResult, cli.value)
    try:
        turn = store.persist_turn_and_cli_mapping(wrapper_session, result)
        reply = build_http_reply(result, turn)
    except Exception as error:
        best_effort_trace_write(
            "root persistence/response error",
            lambda: mark_error(classify_wrapper_error(error)),
        )
        return Outcome(error=error)

    best_effort_trace_write(
        "root result", lambda: set_root_success(result, turn, reply)
    )
    return Outcome(value=reply)

def run_wrapper_turn(request) -> str:
    outcome = traced_wrapper_turn(request)  # root ends before any re-raise
    if outcome.error is not None:
        raise outcome.error
    return cast(str, outcome.value or "")
```

Match the actual SDK API and framework lifecycle. If a generic HTTP
instrumentor owns the root, prove that the setters update that root and not a
child. A manual business root is often clearer and avoids ASGI send/receive
noise. On a first-turn failure there may be no CLI session ID yet; retain the
wrapper ID attribute and the bounded error without inventing a canonical
session. On a resumed failure, the already-persisted CLI session must remain on
the root.

The outcome boundary must include business validation, subprocess execution,
returned-session parsing, session mapping, turn persistence, and construction
of the actual response. Transport-level JSON parsing may happen before it, but
an invalid wrapper session, nonzero exit, timeout, launch failure, persistence
failure, or response failure must still produce useful normalized root IO and
error status. Do not end the root immediately after the subprocess returns.
Validate transport shape and authentication in the outer HTTP owner before
calling this adapter or capturing the free-form prompt. If rejected-request
telemetry is required, emit metadata only—request kind, normalized rejection
code, and safe IDs—with no prompt/body content.

## CLI invocation child

Record enough to debug execution without copying the entire command line,
environment, raw JSONL, or auth material:

- CLI/provider name and version when available;
- print/noninteractive mode;
- whether resume was requested;
- workspace identity or safe relative path;
- timeout;
- exit code and duration;
- returned CLI session ID;
- bounded final reply or reply length; and
- normalized error category on failure; add a bounded approved summary only
  when policy explicitly permits it, never raw stderr by default.

Never record OAuth tokens, API keys, authorization headers, complete process
environment, full raw CLI transcripts, complete workspace files, or an
unbounded command string containing the prompt.

If the CLI returns non-zero, mark the child and root as errors and preserve the
bounded useful error. Do not turn a failed invocation into a successful trace
with only `exit_code: 1` hidden in output.

Apply the same normalized outcome at both levels for a nonzero exit, timeout,
or launch failure: the `agent_cli.invoke` child records the safe error code,
mode/resume flag, duration, and exit code when available; the wrapper root
records the same error category and final API outcome. Preserve the original
exception in memory for the application's existing handler, but never store raw
stderr, command text, environment values, or exception messages by default.

Choose an approved sanitizer, a conservative credential/auth baseline requiring
privacy review, or strict omission (which blocks prompt/reply usefulness).
Exercise non-real API/provider-key, authorization, cookie/session,
secret-assignment, URL-credential, and private-key canaries before/beyond the
bound and in controlled reply/error paths. Search every raw root, CLI child,
inner span, event, and resource attribute before and after restart. Raw stderr,
commands, environment values, and every canary must be absent while a benign
semantic marker survives.

## Inner agent spans

An aggregate `agent_cli.invoke` child proves that the wrapper called the CLI.
It does not prove which model calls, tools, or subagents ran inside the CLI.

In particular, stock `claude -p --output-format json` returns a final result,
session ID, and aggregate metadata. It does not expose reliable inner LLM/tool
span timing. That mode can satisfy the wrapper baseline only. Use a documented
hook, stream-JSON event source, native OTel, or equivalent real source before
claiming full wrapped-agent tracing.

Only claim inner-agent coverage when real hook/JSONL/OpenTelemetry evidence is
captured and reconciled. When importing inner spans:

- use the same wrapper turn or an explicit linked-trace relationship;
- normalize source clocks so no child starts before the wrapper root;
- keep the root unfinished until all intended child records have arrived, or
  issue a final root update after children;
- preserve real LLM model/token/cost and business tool identity;
- do not duplicate the same CLI tool event from both hooks and JSONL; and
- model subagent work as a linked agent trace when it is independently useful.

A wrapper-only baseline can still be useful when its root, session, CLI child,
restart continuity, and payload safety are correct. Report inner LLM/tool
coverage as absent or unexercised rather than synthesizing it.

Choose the observability target before editing and repeat it in the final gate
table: `wrapper baseline`, `linked inner-agent traces`, or `full nested inner
coverage`. For the latter two, name the real hook/JSONL/OTel source and provide
stored LLM/tool/subagent trace IDs. If that source is unavailable, pass only the
wrapper baseline and mark linked/full inner coverage `blocked`, never `pass` or
`not-applicable`. An aggregate CLI child cannot silently satisfy stronger
coverage.

## Complete project and endpoint routing

The host `.env` does not automatically become the container or service
environment. Forward every required connection value into the actual wrapper
process:

```yaml
environment:
  JUDGMENT_API_KEY: ${JUDGMENT_API_KEY:-}
  JUDGMENT_ORG_ID: ${JUDGMENT_ORG_ID:-}
  JUDGMENT_PROJECT_NAME: ${JUDGMENT_PROJECT_NAME:?JUDGMENT_PROJECT_NAME is required}
  JUDGMENT_API_URL: ${JUDGMENT_API_URL:-}
```

Do not rely on a guessed project fallback while claiming verified routing. An
API key and org can be valid while traces still go to a nonexistent project or
the wrong endpoint. Compare the `JUDGMENT_*` variable names in the resolved
launcher configuration with the names visible inside the running process,
without printing secret values.

Treat `${JUDGMENT_PROJECT_NAME:-sidecar}`, a hard-coded example project, or an
SDK default as a failed configuration. Add a negative configuration check that
resolves or starts the real launcher with `JUDGMENT_PROJECT_NAME` explicitly
set to an empty value and requires a clear pre-start failure. Do not merely
`unset` it: dotenv loading can repopulate an absent variable. The command must
exit nonzero with the expected configuration error. It must not boot and
silently route to a guessed project.

Run the real wrapper launcher with the project explicitly empty, a 30-second
bound, and cleanup in `finally` (`docker compose down --remove-orphans` for
Compose). It must fail with the expected configuration error before readiness;
`unset`, timeout, continued serving, or an unrelated failure does not pass.

## Fake and real modes

Fake CLI mode is valuable for deterministic application checks:

- wrapper request/root lifecycle;
- database mapping and restart;
- stable fake CLI session IDs;
- prompt/reply persistence; and
- degraded behavior when the real CLI is unavailable.

It cannot prove real agent authentication, `--resume` behavior, real reply
parsing, model/tool internals, seat-token handling, or real execution latency.
Label fake traces explicitly and do not report real-mode success from them.

Real-mode verification must inject credentials only through the supported
runtime mechanism. Never write a seat/OAuth token into `.env`, README examples,
trace attributes, or committed files. Check only presence/length and login
status, not the token value.

## Restart continuity

The wrapper's database mapping must survive process restart:

1. First turn returns CLI session ID A and persists wrapper-to-A mapping.
2. Restart the wrapper process.
3. The next turn loads A and invokes the CLI with `--resume A`.
4. The new root stores `judgment.session_id = A`.
5. Both turn traces appear in the same Judgment session.

The wrapper process instance may change; the agent session ID must not. Keep
the wrapper ID as an attribute so a maintainer can reconcile the database row
without replacing the canonical Judgment session.

## Root finalization and online evaluation

The root must remain open until every intended child has completed. A root
finalized when the subprocess starts can trigger evaluation on
an empty or partial turn. A root left open for the entire multi-turn CLI
session may never finalize.

Verify raw timing:

- root duration is non-zero;
- every child starts at or after root start;
- every child ends at or before root end;
- root input/output are final;
- root session is the returned/resumed CLI ID; and
- no intended inner span arrives after the root has already ended.

Record raw wrapper-root, CLI-child, and inner `trace_id`, `span_id`, and
`parent_span_id` values. Require an empty root parent only without deliberate
upstream context; otherwise prove the expected W3C/distributed chain and the
root's complete local lifetime and IO. Nested children resolve to the wrapper
root; linked subagents expose links. A UI waterfall is not proof.

## Mandatory real-path verification

Use two independent wrapper sessions and at least one wrapper restart:

1. Run a real first turn and record wrapper ID plus returned CLI session ID.
2. Run an independent real first turn for a second session.
3. End and boundedly flush the completed roots, then restart the wrapper.
4. Resume the first and second sessions using their persisted CLI IDs.
5. Exercise at least one CLI tool-producing task when practical.
6. Safely exercise nonzero, timeout, and launch-failure handling; if one cannot
   be triggered, mark that existing path `blocked`, not `not-applicable`.
7. Separately set `JUDGMENT_PROJECT_NAME` to an explicit empty value and prove
   that the production launcher exits nonzero before serving traffic rather
   than allowing dotenv to refill it or guessing a project.
8. Query Judgment by the exact CLI session IDs and wait for ingestion to
   settle.
9. Inspect roots, CLI children, errors, session membership, and raw payloads.

The result passes only when:

- every real task produces exactly one finalized wrapper root;
- root input/output matches the actual prompt/reply;
- exact CLI session IDs group the right turns across restart;
- different CLI sessions remain distinct;
- CLI invocation children show exit/duration/resume outcome;
- project and endpoint routing match the intended existing project;
- health/read endpoints do not dominate;
- payloads are bounded and sanitized; and
- any claimed inner model/tool spans are genuinely present and correctly
  timed.

If real agent auth is unavailable, report real-mode verification as blocked.
Do not replace it with a fake smoke claim.

## Export lifecycle

Ending a wrapper-turn root does not prove that its batch exporter sent it.
After the observed business-root function returns and the root has ended, make
a bounded, awaited `Tracer.force_flush()` or `Tracer.forceFlush()` attempt at a
lifecycle point the framework actually waits for. Match the exact call to the
installed SDK; do not put the flush inside the observed function while its root
is still open, and do not detach it as fire-and-forget work.

Use the main safe outcome adapter above; do not introduce a second traced
implementation with different error semantics. The HTTP owner only validates
auth/shape, calls it, and flushes after its root ends:

```python
import asyncio

async def flush_wrapper_root_fail_open() -> None:
    try:
        flushed = await asyncio.to_thread(Tracer.force_flush, 5_000)
        if not flushed:
            report_telemetry_failure(
                "wrapper flush", TimeoutError("flush timed out")
            )
    except Exception as error:
        report_telemetry_failure("wrapper flush", error)

@app.post("/tasks")
async def create_task(request: TaskRequest, auth=Depends(require_auth)):
    # No free-form prompt capture occurs before this succeeds.
    validate_auth_and_shape(request, auth)
    try:
        # run_wrapper_turn returns/rethrows the main in-memory outcome only
        # after the root ends; timeout/nonzero/launch semantics stay unchanged.
        return await asyncio.to_thread(run_wrapper_turn, request)
    finally:
        await flush_wrapper_root_fail_open()
```

The flush helper never raises. It blocks tracing verification when export fails
without changing the valid reply or original business exception. Raw stderr,
environment values, and commands never enter a tracing setter.

For a deliberate restart test, do not restart the wrapper until that completion
barrier succeeds or the export failure has been recorded as blocking the
verification. Then prove from stored data that the last completed pre-restart
turn and first post-restart turn both arrived. Production may choose not to
make application success depend on telemetry, but the test cannot call a turn
restart-safe when its flush failed.

## Completion gate

Use `not-applicable` only when the architecture genuinely lacks a gate. Missing
evidence is `blocked`; fake CLI runs and scratch spans are synthetic.

| Gate | Result | Evidence class | Exact evidence |
| --- | --- | --- | --- |
| Trace unit | <result> | static | Business function covering session validation, CLI, mapping, persistence, and response; transport auth/shape remains outside |
| Explicit routing negative | <result> | real application | Exact explicit-empty real-launcher command, nonzero exit, and expected error |
| Root parentage | <result> | stored Judgment | Wrapper/CLI/inner trace-span-parent IDs plus expected upstream chain or empty-parent proof |
| Root IO | <result> | stored Judgment | Bounded prompt/reply for accepted tasks; metadata-only input plus normalized output for invalid-session paths |
| Canonical session | <result> | stored Judgment | Returned/resumed CLI session ID on every applicable root |
| Resume continuity | <result> | stored Judgment | Pre/post-restart trace IDs sharing the exact CLI session |
| CLI child | <result> | stored Judgment | Mode, resume flag, exit/duration, and bounded outcome/error on child trace IDs |
| Error paths | <result> | stored Judgment | Nonzero/timeout/launch trace IDs with matching normalized root/child status and no raw stderr |
| Noise | <result> | stored Judgment | Business-root count versus health/session/ASGI span count |
| Payload safety and usefulness | <result> | stored Judgment | Named mode, benign/canary raw search, bounds, and inspected attribute set |
| Real wrapper behavior | <result> | real application | Two real sessions, resume mapping, restart, returned replies, and exercised failure |
| Observability level | <result> | static | Explicit wrapper-baseline/linked/full target and named inner evidence source |
| Inner coverage | <result> | stored Judgment | Actual LLM/tool/subagent trace IDs; if stronger coverage is targeted but no real source exists, result is blocked, never pass/not-applicable |
| Export lifecycle | <result> | stored Judgment | Last pre-restart and first post-restart root IDs after bounded post-root flush |
| Stored scenario proof | <result> | stored Judgment | Project, CLI sessions, trace IDs, and reconciliation to recorded requests/results |
