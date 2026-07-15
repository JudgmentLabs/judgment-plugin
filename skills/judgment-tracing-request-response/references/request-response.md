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
expected_project_id = os.getenv("JUDGMENT_PROJECT_ID", "").strip()
tracer = Tracer.init(project_name=project_name)
if not tracer.project_id:
    raise RuntimeError("Judgment project did not resolve")
if expected_project_id and tracer.project_id != expected_project_id:
    raise RuntimeError("Judgment project did not resolve to the intended target")
```

Forward `JUDGMENT_API_KEY`, `JUDGMENT_ORG_ID`, `JUDGMENT_PROJECT_NAME`, the
deployment-provided `JUDGMENT_PROJECT_ID` when present, and every configured
Judgment endpoint override into the real server process. Without an expected ID,
startup resolution may pass but exact-destination verification remains blocked
until the unique probe settles in the intended project.

Before running controls, write an exact launcher/deployment ledger from
checked-in files: launcher path and git blob/hash, production command, env-file
or secret injection path, endpoint/project wiring, port/readiness assertion,
and guaranteed cleanup command. If the repository deploys this server through
Compose, record the Compose file and service name, capture a sanitized
`docker compose -f <checked-in-file> config`, and run that real service for all
three controls. A host-only `python`, `uvicorn`, `node`, or framework dev command
does not substitute for a container/Compose deployment path.

Run the real server command with the project explicitly empty and with a unique
unknown name or ID of the same type the launcher accepts, using a 30-second
bound and required process cleanup. Each must fail with the expected routing
error before readiness and must not create a project; `unset` is invalid when
dotenv can refill it. Run a valid-target positive control, then verify its
unique probe settled in the exact intended project. Nonzero exit or successful
startup alone is not routing proof.
Use the same checked-in launcher/service and non-routing configuration for the
valid, explicitly-empty, and unique-unknown controls; change only the intended
routing value. Record exact commands, exit/readiness results, cleanup, and the
positive-control probe's settled trace ID.
Inspect resolution semantics before the unknown-target check. If name-based SDK
initialization can create projects, use a read-only lookup and reject the
unknown name before calling that creation-capable path.

Before editing dependencies, record the manifest/lockfile hashes and exact
server/provider versions. Add only the required tracing dependency with the
existing package manager, run its frozen-lock install, and record the diff,
hashes, and versions again. Unexplained unrelated upgrades block completion.

## 2. Choose a payload policy before writing spans

Choose an approved sanitizer, a conservative credential/auth baseline that
requires privacy review, or strict omission (which blocks semantic evidence).
Apply it before bounding request text, final replies, provider/tool errors,
shell commands, and tool output. Prefer an operation category and safe business
summary over raw commands or file bodies. Project and redact structured keys
first. For composed text, remove complete multiline private-key blocks and
standalone `Bearer TOKEN` / `Basic TOKEN` values before any greedy header,
line, or key/value expression can consume only part of them. Then apply the
remaining authorization, cookie, URL, query, and assignment rules.

Serialize only after projection and sanitization. Every stored
`judgment.input` or `judgment.output` must be at most **1,500 UTF-8 bytes**, or a
lower documented destination limit, **after the exact installed SDK
serializer** has encoded the complete value. Bounding `message` and then
wrapping it in `{"request": ...}` does not satisfy this rule. Use the shared
[structure-first payload helper](../../judgment-tracing/references/instrumentation-safety-and-evidence.md#safe-useful-payloads)
for every root, LLM, and tool input/output. If reduction is needed, it stores a
valid parseable object with `_judgment_truncation`; never slice serialized JSON.
Prove the settled value parses and remains within the same byte cap.

## 3. Trace the completed turn, including safe failures

The observed function must finish before the outer request flushes. When raw
exception text is not approved, normalize it inside the observed scope and
re-raise outside that scope so the span does not automatically copy the raw
exception.

```python
from dataclasses import dataclass
from opentelemetry.trace import Status, StatusCode
from judgeval import Tracer

ROOT_INPUT_FIELDS = ("request",)
REJECTED_INPUT_FIELDS = ("request_present", "request_chars", "session_present")
ROOT_OUTPUT_FIELDS = ("ok", "reply", "error_code")
# Example only: replace with the deadline allowed by the application's SLO.
REQUEST_TELEMETRY_DEADLINE_MS = 500

# Adapt these shared helpers into the app's tracing module:
# - best_effort_trace_write
# - set_safe_trace_input / set_safe_trace_output
# - best_effort_force_flush_with_deadline
# `approved_redact_text` is the selected app-approved sanitizer or documented
# conservative baseline. It must not be a no-op.

@dataclass
class TurnOutcome:
    reply: str | None = None
    error: Exception | None = None

def mark_safe_error(code: str) -> None:
    set_safe_trace_output(
        "turn error output",
        lambda: {"ok": False, "error_code": code},
        ROOT_OUTPUT_FIELDS,
        approved_redact_text,
    )
    best_effort_trace_write(
        "turn error status",
        lambda: Tracer.get_current_span().set_status(
            Status(StatusCode.ERROR, code)
        ),
    )

APPLICATION_ERROR_CODES = {
    "invalid_request",
    "permission_denied",
    "session_not_found",
    "model_call_failed",
    "persistence_failed",
    "unexpected_application_error",
}

def guarded_error_code(
    label: str,
    error: Exception,
    classifier,
    allowed_codes: set[str],
    default: str,
) -> str:
    selected = default

    def classify() -> None:
        nonlocal selected
        code = classifier(error)
        if code in allowed_codes:
            selected = code

    # Classification affects trace evidence only. The shared guard reports a
    # classifier fault and leaves the fixed fallback selected.
    best_effort_trace_write(label, classify)
    return selected

def application_error_code(error: Exception) -> str:
    return guarded_error_code(
        "turn error classifier", error, classify_error,
        APPLICATION_ERROR_CODES, "unexpected_application_error",
    )

def set_turn_context(session_id: str, message: str) -> None:
    best_effort_trace_write(
        "turn session", lambda: Tracer.set_session_id(session_id)
    )
    set_safe_trace_input(
        "turn input",
        lambda: {"request": message},
        ROOT_INPUT_FIELDS,
        approved_redact_text,
    )

def set_rejected_turn_context(session_id: str, message: str) -> None:
    # Rejected/untrusted content is metadata-only and does not establish a
    # Judgment session identity before application validation succeeds.
    set_safe_trace_input(
        "rejected turn input",
        lambda: {
            "request_present": bool(message),
            "request_chars": len(message),
            "session_present": bool(session_id),
        },
        REJECTED_INPUT_FIELDS,
        approved_redact_text,
    )

@Tracer.observe(
    # span_type must be None here. In Judgeval 1.2, when fork=True runs under
    # an ambient span that is visible in Judgment's context (for example ASGI
    # instrumentation wired through the Judgment provider), the SDK creates
    # BOTH a parent-side invocation span and the fresh linked root, and applies
    # span_type to both — producing a second agent-kind span with no semantic
    # IO. Leave span_type=None and set the kind on the business root only,
    # via the guarded set_span_kind call below.
    span_type=None,
    span_name="app.chat_turn",
    record_input=False,
    record_output=False,
    # Judgeval 1.2 public API: in deployments without deliberate upstream W3C
    # propagation, fork keeps an ambient ASGI/HTTP span from accidentally
    # becoming this business root's parent. Pin and verify the installed SDK.
    # Set False only when the route intentionally entered Tracer.continue_trace
    # with an expected upstream context that this turn must preserve.
    fork=True,
)
def traced_turn(session_id: str, message: str) -> TurnOutcome:
    try:
        # First trace-only operation: mark the linked business root as the
        # agent root. Guarded so a telemetry fault cannot break the request.
        Tracer.set_span_kind("agent")
    except Exception:
        pass
    try:
        validate_request_and_session(session_id, message)
    except Exception as exc:
        set_rejected_turn_context(session_id, message)
        code = application_error_code(exc)
        mark_safe_error(code)
        return TurnOutcome(error=exc)

    set_turn_context(session_id, message)
    try:
        reply = run_real_agent_turn(session_id, message)
    except Exception as exc:
        code = application_error_code(exc)
        mark_safe_error(code)
        return TurnOutcome(error=exc)
    set_safe_trace_output(
        "turn output",
        lambda: {"ok": True, "reply": reply},
        ROOT_OUTPUT_FIELDS,
        approved_redact_text,
    )
    return TurnOutcome(reply=reply)

async def request_handler(session_id: str, message: str) -> str:
    try:
        outcome = traced_turn(session_id, message)
        if outcome.error is not None:
            raise outcome.error
        return outcome.reply or ""
    finally:
        # The helper puts synchronous force_flush in a worker and enforces a
        # separate app-declared wall-clock deadline around that worker. Its
        # single-flight gate prevents timed-out workers from accumulating.
        await best_effort_force_flush_with_deadline(
            REQUEST_TELEMETRY_DEADLINE_MS
        )
```

The shared helpers keep field construction, projection, sanitization, exact
serialization, bounding, each setter, and the outer flush fail-open. The
observed root ends before the outer handler flushes. In a synchronous framework,
use an equivalent daemon-worker/event deadline or an awaitable lifecycle hook;
do not restore a direct multi-second `force_flush` call. These helpers do not
prove decorator/root/child scope start, enter, or exit is fail-open; those
lifecycle steps require the independent fault evidence in Section 6 or a
guarded manual scope.

Every telemetry-only active-span lookup, sanitizer/classifier,
IO/attribute/status setter, finalizer, reporter, and flush must occur inside the
fail-open callback. Do not perform a current-span lookup first and guard only the
later write. The copyable recipe sets the root's kind with a guarded
`Tracer.set_span_kind("agent")` as the first trace-only operation, so a
span-kind-setter fault injection is mandatory: prove a raising setter leaves the
application path running exactly once with an unchanged response. Prove each
used operation leaves the real request/model/tool path single-run. Use only documented public APIs from the
pinned installed SDK; an underscored/private module, method, context store, or
span mutator is forbidden unless the exact version is locked and a
production-shaped executable conformance test proves its behavior.

## 4. Use safe manual LLM spans when integrations over-capture

Inspect the installed wrapper signature and a raw stored span. If the wrapper
cannot disable provider input/output capture and the call contains history,
files, schemas, prompts, or secrets, do not use it. A manual LLM child is valid
when it records the real call's safe metadata:

```python
LLM_INPUT_FIELDS = ("model", "message_count", "tool_schema_count")
LLM_OUTPUT_FIELDS = (
    "status", "error_code", "finish_reason", "tool_call_count",
    "tool_call_names", "content_chars",
)

def record_llm_input(messages) -> None:
    set_safe_trace_input(
        "LLM input",
        lambda: {
            "model": MODEL,
            "message_count": len(messages),
            "tool_schema_count": len(TOOLS),
        },
        LLM_INPUT_FIELDS,
        approved_redact_text,
    )

def llm_output_fields(response) -> dict[str, object]:
    tool_calls = response.choices[0].message.tool_calls or []
    return {
        "finish_reason": response.choices[0].finish_reason,
        "tool_call_count": len(tool_calls),
        # Bound cardinality before serialization; the payload helper then
        # enforces the exact byte cap on the complete object.
        "tool_call_names": [call.function.name for call in tool_calls[:32]],
        "content_chars": len(response.choices[0].message.content or ""),
    }

def record_llm_result(response) -> None:
    best_effort_trace_write(
        "LLM metadata",
        lambda: Tracer.recordLLMMetadata({
            "provider": "openai",
            "model": response.model or MODEL,
            "non_cached_input_tokens": response.usage.prompt_tokens,
            "output_tokens": response.usage.completion_tokens,
        }),
    )
    set_safe_trace_output(
        "LLM output",
        lambda: llm_output_fields(response),
        LLM_OUTPUT_FIELDS,
        approved_redact_text,
    )

@dataclass
class ModelOutcome:
    response: object | None = None
    error: Exception | None = None

MODEL_ERROR_CODES = {
    "model_auth_failed",
    "model_rate_limited",
    "model_timeout",
    "model_unavailable",
    "model_call_failed",
}

def model_error_code(error: Exception) -> str:
    return guarded_error_code(
        "LLM error classifier", error, classify_model_error,
        MODEL_ERROR_CODES, "model_call_failed",
    )

def mark_safe_llm_error(error: Exception) -> None:
    code = model_error_code(error)
    set_safe_trace_output(
        "LLM error output",
        lambda: {"status": "failed", "error_code": code},
        LLM_OUTPUT_FIELDS,
        approved_redact_text,
    )
    best_effort_trace_write(
        "LLM error status",
        lambda: Tracer.get_current_span().set_status(
            Status(StatusCode.ERROR, code)
        ),
    )

@Tracer.observe(
    span_type="llm",
    span_name="app.model_call",
    record_input=False,
    record_output=False,
)
def traced_model_call(messages) -> ModelOutcome:
    record_llm_input(messages)
    try:
        response = real_client.chat.completions.create(
            model=MODEL,
            messages=messages,
            tools=TOOLS,
        )
    except Exception as error:
        mark_safe_llm_error(error)
        return ModelOutcome(error=error)
    record_llm_result(response)
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

`span_type="agent"` for the turn root, `span_type="llm"` for the real model
call, and `span_type="tool"` for executed tools are the canonical Judgment
types in this recipe. Confirm those names against the pinned installed public
SDK and inspect raw `span_kind`; a descriptive span name or generic OpenTelemetry
kind is not a substitute. If a wrapper cannot set the correct documented type
without a private API, leave type verification `blocked`.

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
Create that adapter with the installed public equivalent of
`@Tracer.observe(span_type="tool", ...)`, with automatic IO disabled. Any
tool input, success output, or safe error output must use the same shared
`set_safe_trace_input` / `set_safe_trace_output` helpers with a tool-specific
field allowlist. Keep any current-span lookup inside the guard. Guard and fault
a business rename or explicit type/kind setter only if the adapter actually
uses it; the decorator's public `span_type` option needs no redundant setter.

## 6. Verify raw settled evidence

Run the real server and a real provider-backed turn, plus a tool call, a caught
tool failure, a service restart, both routing negatives, and the valid-target
positive control.
Use non-real canaries covering provider tokens (`sk-`, `ghp_`, `github_pat_`),
scheme-agnostic authorization headers (ApiKey/Digest/custom Proxy-
Authorization, `HTTP_AUTHORIZATION`, `X-Api-Key`), prefixed and camelCase
secret assignments (`JUDGMENT_API_KEY`, `AWS_SECRET_ACCESS_KEY`),
cookies/sessions, URL credentials, and private-key blocks — in input,
output/error, and beyond-bound positions with a surviving benign marker.
Include the exact standalone fixtures
`Bearer STANDALONE_BEARER_CANARY_0123456789` and
`Basic QkFTSUNfQ0FOQVJZXzEyMzQ1Njc4OTA=` plus a multiline private-key block
containing an authorization line: the complete block and both standalone
credentials must disappear while adjacent markers survive, proving
private-key/standalone removal ran before greedy composed-text redaction.

Record the exact request/result ledger. After the awaited bounded flush, poll
raw data until the parent tree, span-ID set, terminal IO/status, and timestamps
are unchanged across a named stability interval; record read timestamps and a
span-set hash. Missing or changing data stays `blocked`.

Inspect raw attributes for every span in the matching session. Reconcile the
request ledger to exactly one business root per request admitted to
application/session validation, and require zero business roots for
transport-auth or basic-shape rejections. When `fork=True` runs under an
ambient span visible in Judgment's context, the SDK also emits one generic
kind-less link/invocation span per turn: it is not a business root, carries no
application session or semantic IO, and is reconciled separately using its
Judgment link source/target IDs. Prove root
input/output, child windows, exact session ID,
tool error status, no readback roots, and post-restart export. Search all raw
attribute values—not only UI previews—for all credential canaries, histories,
schemas, file bodies, static prompts, and environment values.
Parse the settled structured root input/output; a bounded preview is not proof
that platform clipping preserved valid JSON.

Keep every non-live command export-free per the router's isolation principle,
reconcile named live probes with stored roots, and require zero unexplained
test-generated traces.

Fault-inject independently: root and LLM/tool scope start/enter/exit, every
active-span lookup and setter actually used (including the mandatory span-kind
setter in the copyable root), sanitizer/classifier, reporter/finalizer, and
flush throw/rejection/timeout. Each subcase leaves the real
request/model/tool path single-run with response, persistence, retry, and
original exceptions preserved. An automatic decorator is not presumed
fail-open: if a scope injection changes behavior, use a guarded optional manual
scope or leave that subcase `blocked`.

Record raw `trace_id`/`span_id`/`parent_span_id` for the root and every child.
Require an empty root parent only without deliberate upstream context; the
copyable example uses Judgeval 1.2's public `fork=True` for the ordinary
no-upstream mode so an ambient HTTP/ASGI scope cannot silently choose the
boundary. With deliberate distributed propagation, enter the public
`Tracer.continue_trace(carrier)` scope and use `fork=False`. For any other
installed version, executable-test its documented fresh/fork behavior first;
unsupported parent control leaves parentage `blocked`.

Apply the router's margin arithmetic to every complete tree. Every unrecovered
root/child error carries the same fixed application-owned code in safe output
and raw `ERROR` status; a recovered tool child may be `ERROR` under a truthful
successful parent. Behaviors/Judges/Tests count only with exact inspectable
current-run result IDs linked to this run's trace IDs — definitions,
configuration, or aggregates alone are `blocked` evidence.

## 7. Use an honest final evidence table

The final response must include:

| Gate | Result | Evidence class | Exact evidence |
|---|---|---|---|
| architecture and boundary | <result> | static | files and completion event |
| dependency integrity | <result> | static | pre/post manifest and lockfile hashes/diff, frozen-lock install, and unchanged unrelated server/provider versions |
| checked-in launcher/deployment ledger | <result> | static + real application | checked-in path/hash, exact command or Compose file/service, resolved config/env wiring, readiness, cleanup, and same-topology positive/empty/unknown controls; no host-only substitute |
| routing startup and negatives | <result> | real application | valid-target positive startup; empty and unknown name/ID commands, expected errors, no readiness or creation |
| exact stored destination | <result> | stored Judgment | named settled trace/probe ID in the exact intended project, with resolved-ID equality or read-only resolution recorded as the routing mechanism |
| real application behavior | <result> | real application | scenario and returned result |
| traffic reconciliation | <result> | stored Judgment | exact request/result ledger reconciled to one business root per expected request and zero readback/health noise |
| root parentage | <result> | stored Judgment | root/child trace-span-parent IDs plus expected upstream chain or empty-parent proof |
| stored root/session/children | <result> | stored Judgment | project, marker/session, trace IDs |
| Judgment span kinds | <result> | stored Judgment | raw turn root `span_kind=agent`, model children `span_kind=llm`, and executed tool children `span_kind=tool`, set through documented public APIs |
| strict child windows | <result> | stored Judgment | complete parent tree, evidence-derived precision, start/end margins, and repeats for within-precision negatives |
| LLM evidence | <result> | stored Judgment | provider/model/token metadata plus bounded per-call semantic IO, or explicit metadata-only limitation |
| Tool identity and outcome | <result> | stored Judgment | each executed business tool's name and bounded semantic input/output-or-error |
| Recovered tool error | <result> | stored Judgment | normalized error child status plus successful recovered root outcome |
| error/output status parity | <result> | stored Judgment | each unrecovered root/child has matching fixed safe output code and raw `ERROR` status; recovered parent outcome remains truthful |
| raw payload safety | <result> | stored Judgment | sanitizer mode and ordering; standalone Bearer/Basic and multiline-private-key fixtures; canaries; every serialized IO attribute <=1,500 UTF-8 bytes or lower destination cap; parseable structured IO; inspected attributes |
| restart/export | <result> | stored Judgment | root ended before awaited bounded flush; last pre-restart and first post-restart trace IDs survived |
| ingestion settlement | <result> | stored Judgment | post-flush raw-read timestamps and stable span-set hashes across the named interval; complete unchanged tree and terminal IO/status |
| test-export isolation | <result> | stored Judgment | exact non-live commands/time window and named probe ledger; zero unit/stub/fake/build/typecheck/import/smoke/dev/static-generation roots |
| runtime telemetry fail-open (one result per subcase) | <result> | real application | separate root and LLM/tool scope start/enter/exit, active-span lookup, IO/attribute/status setter, sanitizer/classifier, finalizer, reporter, flush throw/rejection/timeout injections, plus rename or explicit type/kind setter only when used; business path once and unchanged |
| public SDK surface | <result> | static + real application | pinned installed API references and executable proof for every span operation; no private/underscored API without its own pinned production-shaped conformance test |
| Behavior/Judge/Test results (when cited) | <result> | stored Judgment | exact inspectable current-run result IDs linked to the scenario's trace IDs; definitions/configuration/aggregate scores alone do not count |

Use `not-applicable` only when the architecture genuinely lacks a gate. Missing
evidence is `blocked`; stubbed providers and scratch spans are synthetic.
