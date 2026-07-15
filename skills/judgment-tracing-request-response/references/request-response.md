# Request/Response Tracing Recipe

Use this recipe for a bounded request or chat turn whose business work really
finishes before the response returns. Adapt names to the application; do not
copy placeholders as production names.

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

Test the actual startup/import path with an explicitly empty value:

```bash
env JUDGMENT_PROJECT_NAME= python -c 'from app.main import app'
```

Adapt the import to the real production entrypoint. The check passes only when
startup exits nonzero with the expected missing-project error before serving.
`unset JUDGMENT_PROJECT_NAME` is not a valid test when dotenv can repopulate
it. A timeout, unrelated import failure, or exit zero is a failed gate.

## 2. Choose a payload policy before writing spans

Use exactly one mode and report it:

1. **Approved sanitizer:** reuse an application-owned sanitizer whose policy
   already covers the fields being traced. This is preferred.
2. **Conservative credential/auth baseline:** when autonomous instrumentation
   needs useful evidence and no sanitizer exists, redact common credentials
   before bounding. State plainly that this does not cover arbitrary PII or
   domain secrets and requires application privacy review.
3. **Strict omission:** retain only approved structured metadata. If this
   removes the request/result meaning, mark root-evidence verification blocked;
   do not call the integration complete.

A size bound is required in modes 1 and 2, but truncation is not redaction.
Never label a slice-only helper “sanitized.” Apply the policy to request text,
final replies, provider errors, tool errors, shell commands, and tool output.

For the conservative mode, cover at least bearer/basic authorization values,
API-key assignments, common provider-key prefixes, private-key blocks, cookies,
and URL credentials. Prefer retaining an operation category and safe business
summary instead of a raw shell command or file body.

## 3. Trace the completed turn, including safe failures

The observed function must finish before the outer request flushes. When raw
exception text is not approved, normalize it inside the observed scope and
re-raise outside that scope so the span does not automatically copy the raw
exception.

```python
from dataclasses import dataclass
from opentelemetry.trace import Status, StatusCode
from judgeval import Tracer

@dataclass
class TurnOutcome:
    reply: str | None = None
    error: Exception | None = None

def mark_safe_error(code: str) -> None:
    Tracer.set_output({"ok": False, "error_code": code})
    Tracer.get_current_span().set_status(Status(StatusCode.ERROR, code))

@Tracer.observe(
    span_type="agent",
    span_name="app.chat_turn",
    record_input=False,
    record_output=False,
)
def traced_turn(session_id: str, message: str) -> TurnOutcome:
    Tracer.set_session_id(session_id)
    Tracer.set_input({"request": sanitize_and_bound(message)})
    try:
        reply = run_real_agent_turn(session_id, message)
    except ExpectedApplicationError as exc:
        mark_safe_error(classify_error(exc))
        return TurnOutcome(error=exc)
    Tracer.set_output({"ok": True, "reply": sanitize_and_bound(reply)})
    return TurnOutcome(reply=reply)

def request_handler(session_id: str, message: str) -> str:
    validate_request_and_session(session_id, message)
    try:
        outcome = traced_turn(session_id, message)
        if outcome.error is not None:
            raise outcome.error
        return outcome.reply or ""
    finally:
        if not Tracer.force_flush(5_000):
            logger.warning("Judgment export did not finish within 5s")
```

Do not let telemetry availability silently change application semantics. The
bounded flush is required evidence for this instrumentation task; production
may remain fail-open unless the user explicitly requires strict telemetry.

## 4. Use safe manual LLM spans when integrations over-capture

Inspect the installed wrapper signature and a raw stored span. If the wrapper
cannot disable provider input/output capture and the call contains history,
files, schemas, prompts, or secrets, do not use it. A manual LLM child is valid
when it records the real call's safe metadata:

```python
@Tracer.observe(
    span_type="llm",
    span_name="app.model_call",
    record_input=False,
    record_output=False,
)
def call_model(messages):
    Tracer.set_input({
        "model": MODEL,
        "message_count": len(messages),
        "tool_schema_count": len(TOOLS),
    })
    response = real_client.chat.completions.create(
        model=MODEL,
        messages=messages,
        tools=TOOLS,
    )
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
    return response
```

This intentionally omits full history, tool schemas, file bodies, and model
text. Do not claim a provider integration is required merely to obtain model
and token metadata.

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

## 6. Verify raw settled evidence

Run the real server and a real provider-backed turn. Also exercise a tool and a
caught tool failure, a service restart, and the missing-project startup case.
Use unique markers:

- benign semantic marker that must survive the selected sanitizer;
- credential-shaped marker in request input;
- different credential-shaped marker in provider/tool output.

After ingestion settles, inspect raw attributes for every span in the matching
session. Prove root count, root input/output, child windows, exact session ID,
tool error status, no readback roots, and post-restart export. Search all raw
attribute values—not only UI previews—for both credential markers, histories,
schemas, file bodies, static prompts, and environment values.

## 7. Use an honest final evidence table

The final response must include:

| Gate | Result | Evidence class | Exact evidence |
|---|---|---|---|
| architecture and boundary | pass/fail/blocked | static | files and completion event |
| explicit routing negative | pass/fail/blocked | real application | exact command, exit code, expected error |
| real application behavior | pass/fail/blocked | real application | scenario and returned result |
| stored root/session/children | pass/fail/blocked | stored Judgment | project, marker/session, trace IDs |
| raw payload safety | pass/fail/blocked | stored Judgment | sanitizer mode, canaries, inspected attributes |
| restart/export | pass/fail/blocked | stored Judgment | pre/post-restart trace IDs |

A stubbed provider is synthetic even if its traces reached Judgment. A build,
unit test, or scratch span is static/synthetic. A command that exited zero did
not prove fail-closed startup. If any required real/stored row is failed or
blocked, do not say “live,” “end-to-end verified,” or “complete.”
