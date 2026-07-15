# Request/Response Tracing Recipe

Use this recipe for a bounded request or chat turn whose business work really
finishes before the response returns. Adapt names to the application; do not
copy placeholders as production names.

## Contents

- [Pin routing](#1-pin-routing-and-prove-the-negative-case)
- [Choose a payload policy](#2-choose-a-payload-policy-before-writing-spans)
- [Trace the completed turn](#3-trace-the-completed-turn-including-safe-failures)
- [Use safe manual LLM spans](#4-use-safe-manual-llm-spans-when-integrations-over-capture)
- [Trace tool outcomes](#5-give-each-tool-child-a-safe-semantic-result)
- [Verify settled evidence](#6-verify-raw-settled-evidence)
- [Report the evidence table](#7-use-an-honest-final-evidence-table)

## 1. Pin routing and prove the negative case

Require the intended project. Do not default it to the agent name:

```python
def require_env(name: str) -> str:
    value = os.getenv(name)
    if value is None or not value.strip():
        raise RuntimeError(f"{name} is required")
    return value

project_name = require_env("JUDGMENT_PROJECT_NAME")
Tracer.init(project_name=project_name)
```

Forward `JUDGMENT_API_KEY`, `JUDGMENT_ORG_ID`, `JUDGMENT_PROJECT_NAME`, and
every configured Judgment endpoint override into the real server process.

Run the real server command with the project explicitly empty, a 30-second
bound, and required process cleanup. It must fail with the expected
missing-project error before readiness; `unset` is invalid when dotenv can
refill it.

## 2. Choose a payload policy before writing spans

Choose an approved sanitizer, a conservative credential/auth baseline that
requires privacy review, or strict omission (which blocks semantic evidence).
Apply it before bounding request text, final replies, provider/tool errors,
shell commands, and tool output. Prefer an operation category and safe business
summary over raw commands or file bodies. Leave serialization margin below the
platform attribute limit and prove settled structured
`judgment.input`/`judgment.output` still parses.

## 3. Trace the completed turn, including safe failures

The observed function must finish before the outer request flushes. When raw
exception text is not approved, normalize it inside the observed scope and
re-raise outside that scope so the span does not automatically copy the raw
exception.

```python
from dataclasses import dataclass
import re
from opentelemetry.trace import Status, StatusCode
from judgeval import Tracer

def report_telemetry_failure(label: str, error: Exception) -> None:
    try:
        logger.warning(
            "Judgment telemetry failed: %s (%s)", label, type(error).__name__
        )
    except Exception:
        pass

def best_effort_trace_write(label: str, write) -> None:
    try:
        write()  # Include trace-only sanitization/classification here.
    except Exception as error:
        report_telemetry_failure(label, error)

@dataclass
class TurnOutcome:
    reply: str | None = None
    error: Exception | None = None

def mark_safe_error(code: str) -> None:
    Tracer.set_output({"ok": False, "error_code": code})
    Tracer.get_current_span().set_status(Status(StatusCode.ERROR, code))

def safe_error_code(error: Exception) -> str:
    try:
        code = classify_error(error)
        if isinstance(code, str) and re.fullmatch(r"[a-z][a-z0-9_.-]{0,63}", code):
            return code
    except Exception:
        pass
    return "unexpected_application_error"

def set_turn_context(session_id: str, message: str) -> None:
    Tracer.set_session_id(session_id)
    Tracer.set_input({"request": sanitize_and_bound(message)})

@Tracer.observe(
    span_type="agent",
    span_name="app.chat_turn",
    record_input=False,
    record_output=False,
)
def traced_turn(session_id: str, message: str) -> TurnOutcome:
    best_effort_trace_write(
        "turn input", lambda: set_turn_context(session_id, message)
    )
    try:
        reply = run_real_agent_turn(session_id, message)
    except Exception as exc:
        code = safe_error_code(exc)
        best_effort_trace_write(
            "turn error", lambda: mark_safe_error(code)
        )
        return TurnOutcome(error=exc)
    best_effort_trace_write(
        "turn output",
        lambda: Tracer.set_output({
            "ok": True,
            "reply": sanitize_and_bound(reply),
        }),
    )
    return TurnOutcome(reply=reply)

def request_handler(session_id: str, message: str) -> str:
    validate_request_and_session(session_id, message)
    try:
        outcome = traced_turn(session_id, message)
        if outcome.error is not None:
            raise outcome.error
        return outcome.reply or ""
    finally:
        try:
            if not Tracer.force_flush(5_000):
                best_effort_trace_write(
                    "flush timeout report",
                    lambda: logger.warning(
                        "Judgment export did not finish within 5s"
                    ),
                )
        except Exception as error:
            # Telemetry failure blocks the verification claim. It must not
            # replace a valid reply or the application's original exception.
            report_telemetry_failure("export flush", error)
```

The helpers make these trace writes and the outer flush fail-open.

## 4. Use safe manual LLM spans when integrations over-capture

Inspect the installed wrapper signature and a raw stored span. If the wrapper
cannot disable provider input/output capture and the call contains history,
files, schemas, prompts, or secrets, do not use it. A manual LLM child is valid
when it records the real call's safe metadata:

```python
def record_llm_input(messages) -> None:
    Tracer.set_input({
        "model": MODEL,
        "message_count": len(messages),
        "tool_schema_count": len(TOOLS),
    })

def record_llm_result(response) -> None:
    Tracer.recordLLMMetadata({
        "provider": "openai",
        "model": response.model or MODEL,
        "non_cached_input_tokens": response.usage.prompt_tokens,
        "output_tokens": response.usage.completion_tokens,
    })
    Tracer.set_output({
        "finish_reason": response.choices[0].finish_reason,
        "tool_call_names": [
            call.function.name
            for call in (response.choices[0].message.tool_calls or [])
        ],
        "content_chars": len(response.choices[0].message.content or ""),
    })

@dataclass
class ModelOutcome:
    response: object | None = None
    error: Exception | None = None

def mark_safe_llm_error(error: Exception) -> None:
    code = classify_model_error(error)
    Tracer.set_output({"status": "failed", "error_code": code})
    Tracer.get_current_span().set_status(Status(StatusCode.ERROR, code))

@Tracer.observe(
    span_type="llm",
    span_name="app.model_call",
    record_input=False,
    record_output=False,
)
def traced_model_call(messages) -> ModelOutcome:
    best_effort_trace_write(
        "LLM input", lambda: record_llm_input(messages)
    )
    try:
        response = real_client.chat.completions.create(
            model=MODEL,
            messages=messages,
            tools=TOOLS,
        )
    except Exception as error:
        best_effort_trace_write(
            "LLM error", lambda: mark_safe_llm_error(error)
        )
        return ModelOutcome(error=error)
    best_effort_trace_write(
        "LLM result", lambda: record_llm_result(response)
    )
    return ModelOutcome(response=response)

def call_model(messages):
    outcome = traced_model_call(messages)  # child ends before any re-raise
    if outcome.error is not None:
        raise outcome.error
    return outcome.response
```

This intentionally omits full history, tool schemas, file bodies, and model
text. It is a privacy-safe **metadata-only fallback**, not complete LLM-content
observability. Record that limitation in the final gate table. Prefer a bounded
application-approved summary of only the current model call's semantic input
and output when policy permits it; never restore full histories or schemas just
to make the span look richer. Do not claim a provider integration is required
merely to obtain model and token metadata.

## 5. Give each tool child a safe semantic result

Use application-specific fields. Counts and lengths support the result but do
not always explain it.

| Tool kind | Useful safe input/output examples | Avoid by default |
|---|---|---|
| file read/write | operation, policy-approved relative path or file type, success/error code, bytes | file contents |
| directory listing | policy-approved scope, empty flag, entry count, bounded approved names | full recursive paths |
| shell | operation category, executable class, exit code, timeout, bounded sanitized summary | raw command and environment |
| tests | target category, exit code, passed/failed/skipped counts, bounded sanitized failure summary | full logs |
| API/database | operation, entity type, safe identifier, outcome/error code | auth, raw records, query secrets |

For a caught tool error, use a small observed adapter that sets safe input,
`{"ok": false, "error_code": ...}` output, and OpenTelemetry error status,
then return an outcome object. Re-raise the original exception outside the
observed adapter if the real tool API requires it. This keeps the tool failure
visible while the parent turn can still finish successfully after recovery.
Run those trace writes through the best-effort guard above.

## 6. Verify raw settled evidence

Run the real server and a real provider-backed turn. Also exercise a tool and a
caught tool failure, a service restart, and the missing-project startup case.
Use non-real canaries for OpenAI-style `sk-`, GitHub-style `ghp_` and
`github_pat_`, other installed API/provider keys, authorization,
cookies/sessions, secret/token/password assignments, URL credentials, and
private-key blocks.
Place them before and beyond the bound and in output/error fields; retain a
benign semantic marker.

After ingestion settles, inspect raw attributes for every span in the matching
session. Prove root count, root input/output, child windows, exact session ID,
tool error status, no readback roots, and post-restart export. Search all raw
attribute values—not only UI previews—for all credential canaries, histories,
schemas, file bodies, static prompts, and environment values.
Parse the settled structured root input/output; a bounded preview is not proof
that platform clipping preserved valid JSON.

Record raw `trace_id`, `span_id`, and `parent_span_id` for the turn root and
every local LLM/tool child. Require an empty root parent only without deliberate
upstream context; otherwise prove the expected W3C/distributed chain and the
root's complete local lifetime and IO. A UI waterfall is not proof.

## 7. Use an honest final evidence table

The final response must include:

| Gate | Result | Evidence class | Exact evidence |
|---|---|---|---|
| architecture and boundary | <result> | static | files and completion event |
| explicit routing negative | <result> | real application | exact command, exit code, expected error |
| real application behavior | <result> | real application | scenario and returned result |
| root parentage | <result> | stored Judgment | root/child trace-span-parent IDs plus expected upstream chain or empty-parent proof |
| stored root/session/children | <result> | stored Judgment | project, marker/session, trace IDs |
| LLM evidence | <result> | stored Judgment | provider/model/token metadata plus bounded per-call semantic IO, or explicit metadata-only limitation |
| Tool identity and outcome | <result> | stored Judgment | each executed business tool's name and bounded semantic input/output-or-error |
| Recovered tool error | <result> | stored Judgment | normalized error child status plus successful recovered root outcome |
| raw payload safety | <result> | stored Judgment | sanitizer mode, canaries, bounds, parseable structured IO, inspected attributes |
| restart/export | <result> | stored Judgment | pre/post-restart trace IDs |

Use `not-applicable` only when the architecture genuinely lacks a gate. Missing
evidence is `blocked`; stubbed providers and scratch spans are synthetic.
