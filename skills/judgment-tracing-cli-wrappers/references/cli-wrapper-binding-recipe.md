# Persistent CLI Wrapper Binding Recipe

Read this file completely before editing a service that invokes an agent CLI
and persists the CLI's returned session ID for later resume.

## Contents

- [Declare the target before editing](#1-declare-the-target-before-editing)
- [Bind one wrapper root](#2-bind-one-wrapper-root)
- [Use one fail-open outcome adapter](#3-use-one-fail-open-outcome-adapter)
- [Configure routing and payload policy](#4-configure-routing-and-payload-policy)
- [Bind inner evidence only when real](#5-bind-inner-evidence-only-when-real)
- [Prove the stored result](#6-prove-the-stored-result)

## 1. Declare the target before editing

Inspect the accepted-request boundary, CLI runner, response parser, mapping
store, resume path, restart launcher, and failure behavior. Declare exactly one
observability target:

- `wrapper baseline`: faithful wrapper root, aggregate CLI child, exact CLI
  session continuity, and restart-safe export; or
- `linked inner-agent traces` / `full nested inner coverage`: only when a real
  documented hook, stream JSON, OTel, or native source supplies trustworthy
  LLM/tool/subagent records.

Stock `claude -p --output-format json` supplies a result and session metadata,
not trustworthy inner timing. Never synthesize inner spans or call the
aggregate CLI child full agent tracing. If stronger coverage is targeted but
the real source is unavailable, pass the wrapper baseline and mark stronger
coverage `blocked`.

Before editing dependencies, record manifest/lockfile hashes and exact
wrapper/runtime/CLI versions. Add only the required tracing dependency with the
existing package manager, run its frozen-lock install, and record the diff,
hashes, and versions again. Unexplained unrelated upgrades block completion;
never upgrade the wrapped agent CLI to make tracing easier.

## 2. Bind one wrapper root

- One accepted wrapper task is one root. Begin when the parsed request enters
  business/session validation; keep transport auth/shape validation outside so
  rejected payloads are not copied. If rejected-request telemetry is required,
  keep it metadata-only.
- Keep the root active through session validation, CLI execution, returned-ID
  parsing, mapping and turn persistence, response construction, and the final
  reply/error. Do not end when the subprocess merely starts or returns.
- Decide expected upstream parentage before editing. Without deliberate W3C or
  distributed context, the business root must be parentless; otherwise record
  the expected upstream trace/span chain and keep complete local lifetime/IO.
- Root input is the bounded safe accepted prompt. Root output is the bounded
  final reply plus small truthful status metadata.
- Validate the wrapper session exactly once before any sanitizer or trace write
  can read the free-form prompt. At root start, optional rejected-request
  telemetry may set bounded identifier metadata only. On validation failure,
  keep that metadata-only input and record the normalized error. Only after
  validation succeeds may a guarded callback sanitize, bound, and set the
  semantic prompt input. The first root `set_input` must not reference the
  request prompt.
- Preserve two identities: wrapper ID as an attribute, underlying CLI session
  ID as `judgment.session_id`.
- On the first turn, set the returned CLI ID on the same still-active root after
  parsing. On resume, attach the persisted ID before invocation and prove it is
  exactly the ID passed to the CLI. Do not invent a CLI session on first-turn
  failure.
- Add one `agent_cli.invoke` child with provider/version when available, mode,
  resume flag, safe workspace identity, timeout, duration, exit code, returned
  CLI session ID, and bounded result or normalized error.
- Validate the documented success envelope. Exit zero with empty/malformed
  structured output, no usable result, or no returned CLI session on a first
  turn is a parse/identity failure, not traced success. A resumed turn may use
  the already-persisted CLI ID only when the CLI contract explicitly permits
  omitting it on return.
- Exclude or separately sample health, session-read, and ASGI transport noise.

## 3. Use one fail-open outcome adapter

Disable automatic root/CLI IO capture and use one business path for success and
failure. Use this copyable adapter for every trace-only write; sanitization and
classification belong inside the guarded callback, and the reporter must not
raise:

```python
import asyncio
import threading
from collections.abc import Callable, Iterator, Mapping
from contextlib import AbstractContextManager, contextmanager
from opentelemetry.context import Context
from opentelemetry.trace import Span, Status, StatusCode

def report_telemetry_failure(label: str, error: Exception) -> None:
    try:
        logger.warning("Judgment telemetry failed: %s (%s)", label, type(error).__name__)
    except Exception:
        pass

def trace_only(label: str, write: Callable[[], None]) -> None:
    try:
        write()
    except Exception as error:
        report_telemetry_failure(label, error)

def safe_trace_error_code(
    label: str,
    error: Exception,
    classifier: Callable[[Exception], str],
    allowed_codes: frozenset[str],
    default: str = "unexpected_application_error",
) -> str:
    selected = default

    def classify() -> None:
        nonlocal selected
        candidate = classifier(error)
        if candidate in allowed_codes:
            selected = candidate

    # Classification changes trace evidence only. A classifier fault uses the
    # fixed safe fallback and never changes the real exception/response.
    trace_only(label, classify)
    return selected

def mark_span_error(
    span: Span | None,
    code: str,
    raw_fields: Mapping[str, object],
) -> None:
    # `code` is allowlisted. `set_safe_trace_error_output`, defined in the
    # payload section, performs field access, fixed error overlay, projection,
    # sanitization, bounding, and set_output in one guarded thunk.
    if span is None:
        return
    set_safe_trace_error_output(f"{code}:output", raw_fields, code)
    trace_only(
        f"{code}:status",
        lambda: span.set_status(Status(StatusCode.ERROR, code)),
    )

_FLUSH_SINGLE_FLIGHT = threading.Lock()

async def flush_tracing_with_deadline(deadline_ms: int) -> bool:
    def flush_and_report() -> bool:
        # A timed-out worker cannot be killed. Keep at most one actual exporter
        # call alive so repeated wrapper requests cannot exhaust worker threads.
        if not _FLUSH_SINGLE_FLIGHT.acquire(blocking=False):
            report_telemetry_failure("flush busy", RuntimeError())
            return False
        try:
            exported = bool(Tracer.force_flush(deadline_ms))
            if not exported:
                report_telemetry_failure("flush", TimeoutError())
            return exported
        except Exception as error:
            report_telemetry_failure("flush", error)
            return False
        finally:
            _FLUSH_SINGLE_FLIGHT.release()

    try:
        return await asyncio.wait_for(
            asyncio.to_thread(flush_and_report),
            timeout=deadline_ms / 1_000,
        )
    except TimeoutError as error:
        report_telemetry_failure("flush deadline", error)
        return False
    except Exception as error:
        report_telemetry_failure("flush scheduling", error)
        return False

@contextmanager
def optional_trace_scope(
    label: str,
    start: Callable[[], AbstractContextManager[Span]],
) -> Iterator[Span | None]:
    try:
        scope = start()
    except Exception as error:
        report_telemetry_failure(f"{label}:start", error)
        yield None
        return
    try:
        span = scope.__enter__()
    except Exception as error:
        report_telemetry_failure(f"{label}:enter", error)
        yield None
        return
    try:
        yield span
    finally:
        # The application exception remains in memory and is rethrown outside;
        # never hand raw exception text/stack to automatic span capture.
        try:
            scope.__exit__(None, None, None)
        except Exception as error:
            report_telemetry_failure(f"{label}:exit", error)
```

Choose the root scope explicitly at the call site. In the ordinary mode with no
deliberate upstream W3C parent, pass a starter that uses the exact Judgment
runtime's public OTel tracer with an empty `Context()`:

```python
lambda: Tracer.getOTELTracer().start_as_current_span(
    "application.wrapper_turn",
    context=Context(),
)
```

If the application intentionally continues an upstream distributed trace, enter
the installed public `Tracer.continue_trace(carrier)` scope instead. Never let
an ambient ASGI/HTTP span choose parentage implicitly; if the installed public
API cannot express the intended policy, root parentage is `blocked`.

Every telemetry write goes through `trace_only(...)` — a bare `Tracer.set_*` in
business code is a static completion failure. Never put validation, CLI
execution, persistence, or response construction inside the guard. Trace-scope
start/enter/exit is telemetry too: with `optional_trace_scope`, a start/enter
failure runs the business path once without a span, an exit failure preserves
the saved result, and the business path is never retried for tracing. When a
child scope yields `None`, skip every child-only write — a global/current-span
setter must never fall through to the still-active parent.

Span names do not imply span kinds. While each span is current, guardedly set
the canonical kind (`agent` root, `tool` CLI child) and the honest coverage
label:

```python
if root_span is not None:
    trace_only("wrapper-root:span-kind", lambda: Tracer.set_span_kind("agent"))
    trace_only(
        "wrapper-root:coverage",
        lambda: Tracer.set_attributes(
            {"instrumentation.coverage": "wrapper_only"}
        ),
    )

# Run only while the aggregate CLI child is current.
if cli_span is not None:
    trace_only("cli-child:span-kind", lambda: Tracer.set_span_kind("tool"))
```

`instrumentation.coverage=wrapper_only` is an app-defined disclosure for when
the only inner evidence is the aggregate subprocess call; replace it with the
documented level if real linked/nested records are added later.

Use this ordering for the single root path:

1. start the root, guardedly set `span_kind=agent` and
   `instrumentation.coverage=wrapper_only`, and, if needed, guardedly set
   metadata-only safe IDs;
2. validate the wrapper session exactly once;
3. after success, guardedly sanitize/bound/set the prompt;
4. start the aggregate CLI child, guardedly set `span_kind=tool`, invoke and
   validate the CLI once, then persist its returned mapping/turn;
5. construct the real response, then guardedly record success;
6. on any business exception, classify it while the owning span is current,
   mark the root as the table below requires, retain the original exception in
   memory, and rethrow only after the root ends; and
7. await `flush_tracing_with_deadline(...)` outside the root without changing
   the saved result/error. Choose the deadline from the wrapper's declared
   latency budget; 500 ms is only an upper-bound example for a user-visible
   route.

| Failure site | Wrapper root | `agent_cli.invoke` child |
| --- | --- | --- |
| Invalid wrapper session | `ERROR: invalid_session`, metadata-only input | absent |
| Wrapper/session lookup, creation, or pre-CLI state write | matching allowlisted root-only `ERROR` such as `session_state_failed` | absent |
| Nonzero/timeout/launch/malformed or incomplete CLI result | matching allowlisted `ERROR` | same allowlisted `ERROR` |
| Returned-ID mapping persistence after successful CLI | `ERROR: mapping_persistence_failed` | preserve truthful success |
| Turn persistence after successful CLI | `ERROR: turn_persistence_failed` | preserve truthful success |
| Response construction/serialization after successful CLI | `ERROR: response_failed` | preserve truthful success |
| Other pre/post-CLI application exception | `ERROR: unexpected_application_error`; never leave an empty success root | absent before CLI; preserve truthful child outcome after CLI |
| Trace scope start/enter/exit or setter/sanitizer/status/finalizer/flush failure | business behavior unchanged and business path runs once; affected evidence `blocked` | business behavior unchanged |

Rules for the table:

1. Record success only after mapping/persistence and the actual reply succeed;
   a business path that runs once stays run-once under every telemetry fault.
2. Each row gets its stable semantic category plus OpenTelemetry
   `StatusCode.ERROR` on exactly the owning spans, set while each span is
   current — a custom `error` attribute alone still looks successful. Call
   `mark_span_error` on `agent_cli.invoke` for CLI-owned failures, then on the
   root; for non-CLI failures mark only the root.
3. Original exceptions stay in memory; never trace raw stderr, command,
   environment, exception text, or JSONL. End the root, then rethrow/preserve
   the existing handler behavior outside it, and await the bounded flush in the
   outer route's `finally`.
4. Tracing outcome and transport outcome are separate: if the app persists a
   nonzero result and returns HTTP 200, preserve that while marking both spans
   as errors. Never throw, retry, or skip persistence to make tracing easier.

This tempting ordering is forbidden because the sanitizer/classifier can raise
before the guard and replace a real CLI result or application exception:

```python
# FORBIDDEN: trace-only work is precomputed on the business path.
safe_output = bound_trace_payload(redact_auth(project_trace_output(raw_fields)))
code = classify_error(application_error)
mark_span_error(root_span, code, safe_output)
```

Pass raw business fields to `set_safe_trace_output(...)` or
`mark_span_error(...)`; projection, sanitization, bounding, and `set_output`
must all execute inside that helper's `trace_only` thunk. Select the allowlisted
root or child code through `safe_trace_error_code(...)`, with distinct labels
such as `wrapper-root:classifier` and `cli-child:classifier`, rather than
calling a telemetry classifier on the business path.

## 4. Configure routing and payload policy

- Require an explicit project before serving. For Judgeval Python 1.2, inspect
  the tracer returned by `Tracer.init(...)` and require a nonempty
  `tracer.project_id`; compare it with deployment-provided `JUDGMENT_PROJECT_ID`
  when present. Without an expected ID, require a unique live probe to settle in
  the exact intended project before exact routing passes. A nonempty typo or
  wrong resolved ID is a failure. Do not commit a plausible project-name
  fallback in `.env.example`.
- Forward key, organization, project, deployment-provided project ID when
  present, and endpoint overrides into the actual wrapper process and, only when
  inner coverage is claimed, into that subprocess.
- Inject real CLI seat/OAuth credentials only through the supported runtime
  mechanism. Never write them to `.env`, docs/examples, trace fields, logs, or
  committed files; verify only presence/length and login state, never the value.
- Run the real launcher under a 30-second bound and guaranteed cleanup with the
  project (a) explicitly empty and (b) set to a unique unknown name or ID of
  the same type it accepts. Both must exit nonzero with the expected routing
  error before readiness, create nothing, and still fail when dotenv exists.
  Run a valid-target positive control. `unset`, unrelated failure, or successful
  startup alone is not proof.
- Inspect resolution semantics first. If name initialization can create a
  project, use a read-only lookup and reject the unknown name before that path.

Choose an approved sanitizer, a conservative credential/auth baseline that
requires privacy review, or strict omission that blocks prompt/reply usefulness.
Project allowlisted business fields first, recursively redact that structure,
then serialize and bound each trace input/output to **at most 1,500 UTF-8
bytes** (root prompt/reply: up to **1,800 bytes**). This leaves margin below the roughly 2,000-byte clipping boundary
observed in stored platform payloads; the previous 4,000-character application
bound was therefore not protective. If a payload is clipped, store a parseable
object containing
`_judgment_truncation.truncated=true`; never slice serialized JSON into an
invalid fragment. Prove settled `judgment.input`/`judgment.output` remain
parseable and within the same 1,500-byte bound.

Canary categories: provider tokens (`sk-`, `ghp_`, `github_pat_`, `xox*-`),
prefixed assignments (`JUDGMENT_API_KEY=`, `AWS_SECRET_ACCESS_KEY=`),
scheme-agnostic authorization headers (ApiKey/Digest/custom, not just
Bearer/Basic), standalone `Bearer`/`Basic` values, camelCase assignments
(`httpAuthorization=Basic ...`), cookies/sessions, URL credentials, and
private-key blocks — in input, reply/error, and beyond-bound positions, with a
benign marker that must survive. Ordering matters: redact structured keys
before serialization; remove multiline private-key blocks and standalone tokens
before any greedy line/header rule; a key/value matcher must consume a
`Bearer`/`Basic` scheme and its token atomically. A conservative Python
baseline:

```python
import json
import math
import re
from collections.abc import Mapping
from urllib.parse import unquote_plus

TRACE_PAYLOAD_MAX_BYTES = 1_500
# Root prompt/reply budget; observed platform clipping starts near 2,000
# serialized bytes, so 1,800 keeps margin with better turn fidelity.
ROOT_TRACE_PAYLOAD_MAX_BYTES = 1_800
TRACE_INPUT_FIELDS = ("prompt", "wrapper_id", "mode", "resume")
TRACE_OUTPUT_FIELDS = (
    "ok", "result", "reply", "error_code", "mode", "resume", "exit_code",
    "duration_ms",
)

EXACT_SECRET_KEYS = {
    "authorization", "proxy_authorization", "http_authorization",
    "cookie", "set_cookie", "session", "session_token", "session_cookie",
}
SECRET_KEY_SUFFIXES = {
    "api_key", "secret", "secret_key", "secret_access_key", "client_secret",
    "access_token", "refresh_token", "token", "password", "passwd",
    "cookie", "session_token", "session_cookie",
}

def normalize_key(key: object) -> str:
    text = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", str(key))
    return re.sub(r"[^A-Za-z0-9]+", "_", text).strip("_").casefold()

def is_secret_key(key: object) -> bool:
    normalized = normalize_key(key)
    return normalized in EXACT_SECRET_KEYS or any(
        normalized == suffix or normalized.endswith(f"_{suffix}")
        for suffix in SECRET_KEY_SUFFIXES
    )

PRIVATE_KEY_RE = re.compile(
    r'''-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----'''
)
STANDALONE_TOKEN_RULES = (
    re.compile(r'''\bsk-[A-Za-z0-9_-]{10,}\b'''),
    re.compile(r'''\bghp_[A-Za-z0-9]{10,}\b'''),
    re.compile(r'''\bgithub_pat_[A-Za-z0-9_]{10,}\b'''),
    re.compile(r'''\bxox[baprs]-[A-Za-z0-9-]{8,}\b'''),
)
STANDALONE_AUTH_VALUE_RE = re.compile(
    r'''(?i)\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+'''
)
AUTH_LINE_RE = re.compile(
    r"(?im)^(?P<label>[ \t]*(?:proxy-)?authorization[ \t]*:[ \t]*).*?$"
)
AUTH_ENV_LINE_RE = re.compile(
    r"(?im)^(?P<label>[ \t]*(?:(?:http|proxy)[_-])?authorization[ \t]*=[ \t]*).*?$"
)
COOKIE_LINE_RE = re.compile(
    r"(?im)^(?P<label>[ \t]*(?:set-)?cookie[ \t]*:[ \t]*).*?$"
)
QUOTED_SENSITIVE_HEADER_RE = re.compile(
    r'''(?ix)
    (?:
      (?P<single_prefix>'(?:(?:proxy-)?authorization|(?:set-)?cookie)\s*:\s*)[^'\r\n]*'
      |
      (?P<double_prefix>"(?:(?:proxy-)?authorization|(?:set-)?cookie)\s*:\s*)[^"\r\n]*"
    )
    '''
)
INLINE_SENSITIVE_HEADER_RE = re.compile(
    r'''(?i)(?P<label>(?:(?:proxy-)?authorization|(?:set-)?cookie)\s*:\s*)(?!\s*\[REDACTED\])[^\r\n]*'''
)
KEY_LABEL_RE = re.compile(
    r'''(?imx)
    (?P<label>
      (?P<quote>["']?)(?P<key>[A-Za-z][A-Za-z0-9_-]*)(?P=quote)
      \s*[:=](?!\s*\[REDACTED\])\s*
    )
    '''
)
QUERY_PARAM_RE = re.compile(
    r"(?P<prefix>[?&#])(?P<key>[^?&=#\s]+)=(?P<value>[^&#\s]*)"
)
URL_USERINFO_RE = re.compile(
    r'''(?P<scheme>\b[A-Za-z][A-Za-z0-9+.-]*:\/\/)[^/\s:@]*:[^/\s@]+@'''
)

def redact_assignments(value: str) -> str:
    """Redact secret assignments without trusting comma/semicolon boundaries."""
    output: list[str] = []
    copied_through = 0
    search_from = 0

    while match := KEY_LABEL_RE.search(value, search_from):
        search_from = match.end()
        if not is_secret_key(match.group("key")):
            continue

        value_start = match.end()
        value_end = value_start
        if value_start < len(value) and value[value_start] in {'"', "'"}:
            quote = value[value_start]
            value_end += 1
            escaped = False
            while value_end < len(value):
                character = value[value_end]
                value_end += 1
                if not escaped and character == quote:
                    break
                if character == "\\" and not escaped:
                    escaped = True
                else:
                    escaped = False
        else:
            auth_value = re.match(
                r"(?i)(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+",
                value[value_start:],
            )
            if auth_value:
                value_end = value_start + auth_value.end()
            else:
                # Privacy wins over ambiguous no-space comma/semicolon/& tails.
                # A later field needs whitespace to be independently preserved.
                while (
                    value_end < len(value)
                    and not value[value_end].isspace()
                    and value[value_end] not in "}]"
                ):
                    value_end += 1

        output.append(value[copied_through:match.start()])
        output.append(f'{match.group("label")}"[REDACTED]"')
        copied_through = value_end
        search_from = max(value_end, match.end())

    output.append(value[copied_through:])
    return "".join(output)

def redact_query_param(match: re.Match) -> str:
    try:
        key = unquote_plus(match.group("key"))
    except (TypeError, ValueError):
        key = match.group("key")
    if not is_secret_key(key):
        return match.group(0)
    return f'{match.group("prefix")}{match.group("key")}=[REDACTED]'

def redact_quoted_header(match: re.Match) -> str:
    single_prefix = match.group("single_prefix")
    if single_prefix is not None:
        return f"{single_prefix}[REDACTED]'"
    return f'{match.group("double_prefix")}[REDACTED]"'

def protect_quoted_sensitive_headers(value: str) -> tuple[str, dict[str, str]]:
    """Protect sanitized quoted headers from overlapping generic regexes."""
    sentinel_prefix = "\ue000judgment_header_"
    while sentinel_prefix in value:
        sentinel_prefix += "_"
    replacements: dict[str, str] = {}

    def protect(match: re.Match) -> str:
        placeholder = f"{sentinel_prefix}{len(replacements)}\ue001"
        replacements[placeholder] = redact_quoted_header(match)
        return placeholder

    return QUOTED_SENSITIVE_HEADER_RE.sub(protect, value), replacements

def restore_quoted_sensitive_headers(
    value: str,
    replacements: Mapping[str, str],
) -> str:
    for placeholder, sanitized_header in replacements.items():
        value = value.replace(placeholder, sanitized_header)
    return value

def redact_auth(value):
    if isinstance(value, dict):
        return {
            key: "[REDACTED]"
            if is_secret_key(key)
            else redact_auth(item)
            for key, item in value.items()
        }
    if isinstance(value, (list, tuple)):
        return [redact_auth(item) for item in value]
    if isinstance(value, str):
        stripped = value.lstrip()
        if stripped.startswith(("{", "[")):
            try:
                return json.dumps(redact_auth(json.loads(value)), separators=(",", ":"))
            except (TypeError, ValueError):
                pass
        # Multiline and standalone secrets must be removed before the greedy
        # line/header rules below can consume their delimiters or leave tails.
        redacted = PRIVATE_KEY_RE.sub("[REDACTED]", value)
        redacted, quoted_headers = protect_quoted_sensitive_headers(redacted)
        for pattern in STANDALONE_TOKEN_RULES:
            redacted = pattern.sub("[REDACTED]", redacted)
        # Redact full-URL query values before the generic key/value pattern can
        # treat `https:` as one harmless assignment and consume the query.
        redacted = QUERY_PARAM_RE.sub(redact_query_param, redacted)
        # Secret assignment values consume their full ambiguous unquoted token
        # so comma/semicolon tails cannot leak after a partial match.
        redacted = redact_assignments(redacted)
        redacted = STANDALONE_AUTH_VALUE_RE.sub("[REDACTED]", redacted)
        # Unquoted inline shell-header boundaries are ambiguous, so remove the
        # remainder of that line conservatively.
        redacted = INLINE_SENSITIVE_HEADER_RE.sub(r"\g<label>[REDACTED]", redacted)
        redacted = AUTH_LINE_RE.sub(r"\g<label>[REDACTED]", redacted)
        redacted = AUTH_ENV_LINE_RE.sub(r"\g<label>[REDACTED]", redacted)
        redacted = COOKIE_LINE_RE.sub(r"\g<label>[REDACTED]", redacted)
        redacted = URL_USERINFO_RE.sub(r"\g<scheme>[REDACTED]@", redacted)
        return restore_quoted_sensitive_headers(redacted, quoted_headers)
    return value

def canonicalize_trace_value(value: object) -> object:
    """Project arbitrary values into the exact JSON-safe domain we store."""
    if value is None or isinstance(value, bool):
        return value
    if isinstance(value, str):
        # Replace lone surrogates so the installed UTF-8/orjson serializer
        # cannot fall back to Python repr.
        return value.encode("utf-8", "replace").decode("utf-8")
    if isinstance(value, int):
        # Judgeval 1.2's serializer uses orjson. Keep a conservative signed
        # 64-bit interoperable domain and stringify larger values before the
        # installed serializer can reject them or another consumer loses them.
        return value if -(2**63) <= value <= 2**63 - 1 else str(value)
    if isinstance(value, float):
        return value if math.isfinite(value) else "[non_finite_number]"
    if isinstance(value, Mapping):
        # Projectors define string field names. Drop unexpected key types rather
        # than invoking arbitrary __str__ code in telemetry.
        return {
            key: canonicalize_trace_value(item)
            for key, item in value.items()
            if isinstance(key, str)
        }
    if isinstance(value, (list, tuple)):
        return [canonicalize_trace_value(item) for item in value]
    return "[unsupported_type]"

def project_trace_input(raw_fields: Mapping[str, object]) -> dict:
    return {
        key: raw_fields[key]
        for key in TRACE_INPUT_FIELDS
        if key in raw_fields
    }

def project_trace_output(raw_fields: Mapping[str, object]) -> dict:
    # stderr, command, environment, raw exception, transcript, and session_id
    # are deliberately absent. Set the approved CLI session separately.
    return {
        key: raw_fields[key]
        for key in TRACE_OUTPUT_FIELDS
        if key in raw_fields
    }

def serialized_size(value: object) -> int:
    return len(
        json.dumps(
            value,
            ensure_ascii=True,
            allow_nan=False,
            separators=(",", ":"),
        ).encode("utf-8")
    )

def bound_trace_payload(
    payload: dict,
    max_bytes: int = TRACE_PAYLOAD_MAX_BYTES,
) -> dict:
    # Root judgment.input/output callers pass ROOT_TRACE_PAYLOAD_MAX_BYTES.
    serialized = json.dumps(
        payload,
        ensure_ascii=True,
        allow_nan=False,
        separators=(",", ":"),
    )
    original_bytes = len(serialized.encode("utf-8"))
    if original_bytes <= max_bytes:
        return payload

    summary = {
        key: payload[key]
        for key in ("ok", "error_code", "mode", "resume", "exit_code")
        if key in payload and (
            payload[key] is None
            or isinstance(payload[key], bool)
            or (
                isinstance(payload[key], int)
                and not isinstance(payload[key], bool)
                and -1_000_000_000 <= payload[key] <= 1_000_000_000
            )
            or (isinstance(payload[key], str) and len(payload[key]) <= 64)
        )
    }
    marker = {
        "truncated": True,
        "original_bytes": original_bytes,
        "max_bytes": max_bytes,
    }

    # Binary-search a sanitized serialized preview while preserving valid JSON.
    low, high = 0, len(serialized)
    bounded = {**summary, "_judgment_truncation": marker, "preview": ""}
    while low <= high:
        midpoint = (low + high) // 2
        candidate = {
            **summary,
            "_judgment_truncation": marker,
            "preview": serialized[:midpoint],
        }
        if serialized_size(candidate) <= max_bytes:
            bounded = candidate
            low = midpoint + 1
        else:
            high = midpoint - 1
    return bounded

def set_safe_trace_input(label: str, raw_fields: Mapping[str, object]) -> None:
    def write() -> None:
        projected = project_trace_input(raw_fields)
        canonical = canonicalize_trace_value(projected)
        sanitized = redact_auth(canonical)
        bounded = bound_trace_payload(sanitized, ROOT_TRACE_PAYLOAD_MAX_BYTES)
        Tracer.set_input(bounded)

    trace_only(label, write)

def set_safe_trace_output(label: str, raw_fields: Mapping[str, object]) -> None:
    def write() -> None:
        # Every trace-only operation, including set_output itself, stays inside
        # this guarded thunk. None of these values drive business behavior.
        projected = project_trace_output(raw_fields)
        canonical = canonicalize_trace_value(projected)
        sanitized = redact_auth(canonical)
        bounded = bound_trace_payload(sanitized, ROOT_TRACE_PAYLOAD_MAX_BYTES)
        Tracer.set_output(bounded)

    trace_only(label, write)

def set_safe_trace_error_output(
    label: str,
    raw_fields: Mapping[str, object],
    code: str,
) -> None:
    def write() -> None:
        # Even Mapping iteration/access stays inside the guard: a lazy or
        # hostile mapping is telemetry input and cannot break the business path.
        projected = project_trace_output(raw_fields)
        projected.update({"ok": False, "error_code": code})
        canonical = canonicalize_trace_value(projected)
        sanitized = redact_auth(canonical)
        bounded = bound_trace_payload(sanitized)
        Tracer.set_output(bounded)

    trace_only(label, write)
```

Search settled raw roots, CLI/inner children, events, and resource attributes
before and after restart: the benign marker survives; all canaries, raw
commands/stderr/environments, files, histories, schemas, and transcripts are
absent; every stored input/output is valid JSON <=1,500 serialized bytes, with
a parseable `_judgment_truncation` object when clipped. This baseline is not
general PII/DLP. Unit-test the ordered sanitizer on the categories above plus
comma-bearing values (`Authorization: Digest username=x, realm=y`,
`PASSWORD="abc,def"`), query/fragment credentials
(`https://example.test/?api_key=CANARY&benign=SURVIVES`), URL userinfo under
any scheme (`amqps://user:CANARY@host`, `redis://:CANARY@host:6379/0`), quoted
shell headers with opposite nested quote kinds, and adjacent benign fields that
must survive. The business `session_id` goes through `Tracer.set_session_id`,
never this sanitizer.

Run these exact composed regressions; assert the named canaries are absent from
the returned value and its serialized form, every `SURVIVES_*` marker remains,
and repeated sanitization is idempotent:

| Fixture | Required result |
| --- | --- |
| `Bearer STANDALONE_BEARER_CANARY_0123456789 SURVIVES_LOOSE_BEARER` | the full scheme/token becomes `[REDACTED]`; `SURVIVES_LOOSE_BEARER` remains |
| `Basic QkFTSUNfQ0FOQVJZXzEyMzQ1Njc4OTA= SURVIVES_LOOSE_BASIC` | the full scheme/token becomes `[REDACTED]`; `SURVIVES_LOOSE_BASIC` remains |
| `httpAuthorization=Basic Q0FNRUxDQVNFX0JBU0lDX0NBTkFSWV8xMjM0NTY= benign=SURVIVES_CAMEL` | the camelCase key normalizes to `http_authorization`, the scheme and token are consumed atomically, and `benign=SURVIVES_CAMEL` remains |
| `PASSWORD=PASSWORD_CANARY,SECOND SURVIVES_PASSWORD_TAIL` | the complete ambiguous unquoted token, including `,SECOND`, disappears and `SURVIVES_PASSWORD_TAIL` remains |
| `PASSWORD=PASSWORD_CANARY,SECOND=NO SURVIVES_ASSIGNMENT_SHAPED_TAIL` | the assignment-shaped secret tail disappears and `SURVIVES_ASSIGNMENT_SHAPED_TAIL` remains |
| `BENIGN=SURVIVES,PASSWORD=LATER_PASSWORD_CANARY` | `BENIGN=SURVIVES,` remains and the later secret assignment is redacted |
| `FOO=x;JUDGMENT_API_KEY=LATER_API_KEY_CANARY` | `FOO=x;` remains and the later API-key assignment is redacted |
| `SURVIVES_BEFORE\n-----BEGIN PRIVATE KEY-----\nPRIVATE_KEY_CANARY\nAuthorization: Bearer NESTED_AUTH_CANARY_1234567890\n-----END PRIVATE KEY-----\nSURVIVES_AFTER` | the complete multiline block and nested auth canary disappear before line/header processing; both survival markers remain |
| `curl -H 'Authorization: Digest username=CANARY, realm=CANARY2' https://benign.example/SURVIVES_URL ; github_pat_COMPOSED_CANARY_1234567890 ; https://example.test/?api_key=QUERY_CANARY&benign=SURVIVES_QUERY` | all three credential categories disappear; the benign URL and query marker remain |
| `{"ok": True, "result": "SURVIVES_BOUND" + ("x" * 2_100) + " sk-BOUNDARYCANARY1234567890 " + ("y" * 2_900)}` | the canary is removed before bounding, serialized output is `<= 1_500` bytes, JSON parsing succeeds, `_judgment_truncation.truncated` is `true`, and `SURVIVES_BOUND` remains in the sanitized preview |

Also inject the root sanitizer, root classifier, CLI-child sanitizer, and
CLI-child classifier separately. Each injection must leave the real
CLI/business path single-run with the same transport/result behavior. A child
fault must not invoke a global current-span write after its scope is absent or
overwrite root input/output/status.

Include a `Mapping` whose iterator or item access raises and pass it to both the
success and error output helpers. The telemetry failure is reported, no trace
output is written for that injection, and the already-determined application
result/exception and transport behavior remain identical. This catches a field
merge such as `{**raw_fields, ...}` accidentally moving back outside the guard.

## 5. Bind inner evidence only when real

For linked or nested inner coverage:

- name the actual hook/JSONL/OTel/native source;
- reconcile its records to the same wrapper turn or explicit links;
- normalize clocks so no child precedes the root;
- keep the root open or update it last so all intended records and final IO are
  present before online evaluation;
- preserve real model/token/cost and business tool identity;
- deduplicate identical hook/JSONL events; and
- represent independently useful subagents as linked traces when supported.

Absent real inner records are `blocked` for stronger coverage, never
`not-applicable`, while the honest wrapper baseline may still pass.

## 6. Prove the stored result

Run two independent real wrapper sessions: record wrapper IDs and returned CLI
IDs, boundedly flush, restart the wrapper, then resume both using persisted CLI
IDs, with a tool-producing task when practical. Then exercise every supported
subcase independently — one injection and one recorded result per subcase; an
untriggered subcase is `blocked`, and a group never passes because one member
passed:

- request/CLI failures: invalid session; pre-CLI session state failure;
  nonzero; timeout; launch; empty/malformed output; missing result; missing
  first-turn CLI session; mapping/turn persistence; response serialization;
  unexpected pre/post-CLI application failure;
- telemetry faults: root and CLI-child scope start/enter/exit; every setter
  actually used; root and child sanitizers and classifiers separately;
  reporter; finalizer; sync flush throw; async flush rejection; flush timeout;
- payload: every canary category including the composed fixtures above; and
- the supported fake/degraded mode across a real process restart (valid roots
  labeled fake, stable fake CLI sessions, no inner-coverage claim).

Keep all non-live commands export-free per the router's isolation principle;
zero unexplained test roots is a completion condition.

Reconcile recorded requests/results with settled raw Judgment data (poll after
each flush until trees, span-ID sets, terminal IO, and timestamps are stable
across a named interval; record a span-set hash) and require:

- exactly one finalized nonzero-duration business root per real task, with
  truthful prompt/reply or normalized error and no read/health roots;
- raw `span_kind=agent` root, `span_kind=tool` CLI child, and
  `instrumentation.coverage=wrapper_only` for the wrapper baseline — a span
  name containing "agent"/"tool" is not evidence;
- exact returned/resumed CLI session IDs group the right turns across restart;
- CLI/inner children pass the router's margin arithmetic inside the root, with
  honest mode/timing/resume/exit; empty business-root parent unless deliberate
  upstream context exists;
- routing positive/empty/unknown controls pass without project creation;
- every canary absent, benign markers survive, each stored input/output parses
  within 1,500 bytes;
- last pre-restart and first post-restart roots survive the bounded flush; and
- every claimed inner LLM/tool/subagent has actual raw trace/span/link
  evidence.

Fake mode, successful HTTP, builds, or scratch spans are synthetic only. The
final report keeps separate rows for static structure, each synthetic edge,
real application behavior, and settled raw Judgment evidence; do not infer
fail-open from ordinary success, payload safety from unit regexes, or error
ownership from only CLI-owned failures.
