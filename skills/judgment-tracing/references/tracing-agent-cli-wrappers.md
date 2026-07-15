# Persistent Agent CLI Wrapper Tracing

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
- The root starts after request validation and remains active through the CLI
  subprocess, JSON parsing, session mapping, turn persistence, and final HTTP
  reply.
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
@Tracer.observe(
    span_type="agent",
    span_name="sidecar.task",
    record_input=False,
    record_output=False,
)
def run_wrapper_turn(request):
    wrapper_session = store.get_or_create_session(request.session_id)
    Tracer.set_attribute("wrapper.session_id", wrapper_session.id)
    # A resumed turn already knows the canonical CLI session. Attach it before
    # invocation so a timeout or parse failure still belongs to that session.
    if wrapper_session.cli_session_id:
        Tracer.set_session_id(wrapper_session.cli_session_id)
    Tracer.set_input({
        "prompt": bounded_text(request.prompt),
        "wrapper_session_id": wrapper_session.id,
    })

    try:
        result = runner.run_task(
            request.prompt,
            workspace_path=wrapper_session.workspace_path,
            cli_session_id=wrapper_session.cli_session_id,
        )
    except Exception as error:
        Tracer.set_output({"status": "failed", "error": safe_error(error)})
        raise

    # The first turn learns this only after the CLI returns. The root is still
    # active, so the durable agent identity can be attached before finalization.
    Tracer.set_session_id(result.cli_session_id)

    turn = store.persist_turn_and_cli_mapping(wrapper_session, result)
    Tracer.set_output({
        "reply": bounded_text(result.reply),
        "turn_index": turn.index,
        "exit_code": result.exit_code,
    })
    return result.reply
```

Match the actual SDK API and framework lifecycle. If a generic HTTP
instrumentor owns the root, prove that the setters update that root and not a
child. A manual business root is often clearer and avoids ASGI send/receive
noise. On a first-turn failure there may be no CLI session ID yet; retain the
wrapper ID attribute and the bounded error without inventing a canonical
session. On a resumed failure, the already-persisted CLI session must remain on
the root.

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
- sanitized stderr/error category on failure.

Never record OAuth tokens, API keys, authorization headers, complete process
environment, full raw CLI transcripts, complete workspace files, or an
unbounded command string containing the prompt.

If the CLI returns non-zero, mark the child and root as errors and preserve the
bounded useful error. Do not turn a failed invocation into a successful trace
with only `exit_code: 1` hidden in output.

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
resolves or starts the real launcher with `JUDGMENT_PROJECT_NAME` intentionally
unset and requires a clear pre-start failure. It must not boot successfully and
silently route to a guessed project.

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

## Mandatory real-path verification

Use two independent wrapper sessions and at least one wrapper restart:

1. Run a real first turn and record wrapper ID plus returned CLI session ID.
2. Run an independent real first turn for a second session.
3. End and boundedly flush the completed roots, then restart the wrapper.
4. Resume the first and second sessions using their persisted CLI IDs.
5. Exercise at least one CLI tool-producing task when practical.
6. Separately unset `JUDGMENT_PROJECT_NAME` and prove that the production
   launcher fails closed before serving traffic rather than guessing a project.
7. Query Judgment by the exact CLI session IDs and wait for ingestion to
   settle.
8. Inspect roots, CLI children, errors, session membership, and raw payloads.

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

For a Python HTTP wrapper, make the two layers visible in code so the ordering
cannot be mistaken for a shutdown-only flush:

```python
import asyncio

@Tracer.observe(
    span_type="agent",
    span_name="agent_cli.task",
    record_input=False,
    record_output=False,
)
async def traced_wrapper_task(request: TaskRequest) -> TaskResult:
    Tracer.set_input(safe_task_input(request))
    result = await run_and_persist_cli_turn(request)
    Tracer.set_session_id(result.cli_session_id)
    Tracer.set_output(safe_task_output(result))
    return result

@app.post("/tasks")
async def create_task(request: TaskRequest):
    try:
        result = await traced_wrapper_task(request)  # root ends on return/raise
        return result.reply
    finally:
        flushed = await asyncio.to_thread(Tracer.force_flush, 5_000)
        if not flushed:
            logger.error("Judgment flush timed out after wrapper task attempt")
            # Do not call this turn restart-safe until stored evidence arrives.
```

Replace the generic names and types. Preserve the first-turn late session-ID
assignment and the root-then-flush ordering.

If the subprocess can throw an error whose message or stderr is not approved
trace data, use the same outcome-adapter shape as the request/response recipe:
inside `traced_wrapper_task`, store a normalized error code and bounded
sanitized outcome, mark the span with a safe error, and return the original
exception only in memory. Re-raise it from `create_task` after the observed
root has ended; the outer `finally` still flushes that failed root. Do not let
the tracing decorator automatically serialize raw stderr, environment values,
or command lines.

For a deliberate restart test, do not restart the wrapper until that completion
barrier succeeds or the export failure has been recorded as blocking the
verification. Then prove from stored data that the last completed pre-restart
turn and first post-restart turn both arrived. Production may choose not to
make application success depend on telemetry, but the test cannot call a turn
restart-safe when its flush failed.

## Completion gate

| Gate | Required evidence |
| --- | --- |
| Trace unit | One wrapper task is one finalized root through persistence and reply |
| Root IO | Bounded prompt and final reply are stored on the root |
| Canonical session | Root uses the returned/resumed CLI session ID, not only wrapper ID |
| Resume continuity | Pre- and post-restart turns share the exact CLI session |
| CLI child | Invocation mode, resume flag, exit code, duration, and bounded outcome are present |
| Project routing | Resolved runtime includes explicit project and endpoint override names; an unset-project negative test fails before startup and no fallback project is accepted |
| Noise | Health/session reads and ASGI plumbing do not dominate |
| Payload safety | No token, environment dump, raw transcript, or workspace/file body is stored |
| Real mode | A real authenticated first turn and resume turn were exercised |
| Inner coverage | LLM/tool/subagent claims match actual captured spans, or are explicitly absent/unexercised |
| Export lifecycle | A bounded awaited flush happens only after each root ends; a failed flush blocks the deliberate-restart verification claim |
