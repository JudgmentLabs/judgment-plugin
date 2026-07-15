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
from collections.abc import Callable, Iterator
from contextlib import AbstractContextManager, contextmanager
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

def mark_span_error(span: Span | None, code: str, output: dict) -> None:
    # `code` is allowlisted; output excludes exception text, stderr, and commands.
    if span is None:
        return
    trace_only(
        f"{code}:output",
        lambda: Tracer.set_output({**output, "ok": False, "error_code": code}),
    )
    trace_only(
        f"{code}:status",
        lambda: span.set_status(Status(StatusCode.ERROR, code)),
    )

def flush_tracing(timeout_ms: int) -> bool:
    try:
        exported = Tracer.force_flush(timeout_ms)
    except Exception as error:
        report_telemetry_failure("flush", error)
        return False
    if not exported:
        report_telemetry_failure("flush", TimeoutError())
        return False
    return True

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

Apply `trace_only(...)` to input, output, attributes, session assignment,
span-kind/status, finalization, and flush reporting. A direct `Tracer.set_*`
call in business code is a static completion failure. The adapter wraps only
telemetry thunks whose return values are unused; never put validation, CLI
execution, persistence, response construction, or other business work inside
it.

Trace-scope start/enter/exit is telemetry too. Use an equivalent of
`optional_trace_scope` around the one business execution: a start or enter
failure runs that path once without a span, and an exit failure preserves the
already-saved result/error. Never retry the business path to recover from
tracing. Keep business exceptions in memory, safely classify/mark while the
scope is current, finalize it without automatic raw exception capture, then
rethrow outside it.
When a child scope yields `None`, skip every child-only setter/status write;
never let a global/current-span setter fall through to the still-active parent.
The child start/enter fault tests must prove the CLI runs once and the parent
root's input/output/session are not overwritten by attempted child evidence.

Use this ordering for the single root path:

1. start the root and, if needed, guardedly set metadata-only safe IDs;
2. validate the wrapper session exactly once;
3. after success, guardedly sanitize/bound/set the prompt;
4. invoke and validate the CLI child, then persist its returned mapping/turn;
5. construct the real response, then guardedly record success;
6. on any business exception, classify it while the owning span is current,
   mark the root as the table below requires, retain the original exception in
   memory, and rethrow only after the root ends; and
7. call `flush_tracing(...)` outside the root without changing the saved
   result/error.

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

Then enforce these rules:

1. Guard trace setters, sanitizers/classifiers, reporters, finalization, and
   flush reporting. Telemetry failure must not alter application behavior.
2. Run existing session validation, CLI invocation, parsing, persistence, and
   response construction once.
3. Record success only after mapping/persistence and the actual reply succeed.
4. For each table row, use its stable semantic category and OpenTelemetry
   `StatusCode.ERROR` on exactly the owning spans. Set status while each span
   is current; a custom `error` attribute alone still looks successful.
5. Keep original exceptions only in memory; never trace raw stderr, command,
   environment, exception text, or JSONL. End the observed root, then rethrow or
   preserve the existing handler behavior outside it.
6. After root end, await a bounded flush in the outer route's `finally` before
   returning/rethrowing at the tested restart checkpoint. Failed export blocks
   the tracing claim but cannot replace a valid reply or original exception.

Do not create a separate copyable traced error path. Do not turn nonzero exit
into traced success because an exit-code field exists. Tracing outcome and
transport outcome are separate: if the existing application persists a
nonzero result and returns HTTP 200, preserve that behavior while marking the
CLI child and wrapper root as errors with the same safe code. Do not throw,
retry, skip persistence, or change the response merely to make tracing easier.

Call `mark_span_error` while `agent_cli.invoke` is current for CLI-owned
failures, then on the wrapper root. For validation, mapping, persistence, or
response failures outside CLI invocation, mark only the root. Catching a
trace-setter failure outside `trace_only` can trigger SDK automatic exception
capture and leak its message/stack; that is a telemetry fail-open and payload
safety failure.

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
Sanitize before bounding, leave storage-clipping margin, and prove settled
`judgment.input`/`judgment.output` still parse as the intended structure.
Exercise a benign semantic marker plus non-real OpenAI-style `sk-`, GitHub-style
`ghp_`/`github_pat_`, provider/API keys, prefixed assignments such as
`JUDGMENT_API_KEY=` and `AWS_SECRET_ACCESS_KEY=`, cookies/sessions,
URL credentials, and private keys before/beyond the bound and in reply/error
paths. Authorization redaction must anchor on the header name and remove every
scheme, including `Authorization: ApiKey ...`, `Authorization: Digest ...`,
and `Proxy-Authorization: Custom ...`; a Bearer/Basic-only matcher fails. Do not
run one greedy header regex over serialized JSON. Redact exact structured keys
before serialization and line-form headers one line at a time. A conservative
Python baseline may include:

```python
import json
import re
from urllib.parse import unquote_plus

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
KEY_VALUE_RE = re.compile(
    r'''(?im)(?P<label>(?P<quote>["']?)(?P<key>[A-Za-z][A-Za-z0-9_-]*)(?P=quote)\s*[:=](?!\s*\[REDACTED\])\s*)(?P<value>"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,&;}\]]+)'''
)
QUERY_PARAM_RE = re.compile(
    r"(?P<prefix>[?&#])(?P<key>[^?&=#\s]+)=(?P<value>[^&#\s]*)"
)
STANDALONE_SECRET_RULES = (
    re.compile(r'''\b(?:sk-[A-Za-z0-9_-]{10,}|ghp_[A-Za-z0-9]{10,}|github_pat_[A-Za-z0-9_]{10,}|xox[baprs]-[A-Za-z0-9-]{8,})\b'''),
    re.compile(r'''-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----'''),
)
URL_USERINFO_RE = re.compile(
    r'''(?P<scheme>\b[A-Za-z][A-Za-z0-9+.-]*:\/\/)[^/\s:@]*:[^/\s@]+@'''
)

def redact_match(match: re.Match) -> str:
    if not is_secret_key(match.group("key")):
        return match.group(0)
    return f'{match.group("label")}"[REDACTED]"'

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

def redact_auth(value):
    if isinstance(value, dict):
        return {
            key: "[REDACTED]"
            if is_secret_key(key)
            else redact_auth(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [redact_auth(item) for item in value]
    if isinstance(value, str):
        stripped = value.lstrip()
        if stripped.startswith(("{", "[")):
            try:
                return json.dumps(redact_auth(json.loads(value)), separators=(",", ":"))
            except (TypeError, ValueError):
                pass
        # Redact full-URL query values before the generic key/value pattern can
        # treat `https:` as one harmless assignment and consume the query.
        redacted = QUERY_PARAM_RE.sub(redact_query_param, value)
        redacted = QUOTED_SENSITIVE_HEADER_RE.sub(redact_quoted_header, redacted)
        # Unquoted inline shell-header boundaries are ambiguous, so remove the
        # remainder of that line conservatively.
        redacted = INLINE_SENSITIVE_HEADER_RE.sub(r"\g<label>[REDACTED]", redacted)
        redacted = KEY_VALUE_RE.sub(redact_match, redacted)
        redacted = AUTH_LINE_RE.sub(r"\g<label>[REDACTED]", redacted)
        redacted = AUTH_ENV_LINE_RE.sub(r"\g<label>[REDACTED]", redacted)
        redacted = COOKIE_LINE_RE.sub(r"\g<label>[REDACTED]", redacted)
        redacted = URL_USERINFO_RE.sub(r"\g<scheme>[REDACTED]@", redacted)
        for pattern in STANDALONE_SECRET_RULES:
            redacted = pattern.sub("[REDACTED]", redacted)
        return redacted
    return value
```

Search settled raw roots, CLI/inner children, events, and resource attributes
before and after restart. The marker survives; all canaries, raw
commands/stderr/environments, unapproved files, histories, schemas, and
transcripts are absent. This conservative baseline is not general PII/DLP.
The mandatory regex/helper matrix includes comma-bearing values such as
`Authorization: Digest username=x, realm=y, nonce=z`, serialized
`{"Authorization":"Digest username=x, realm=y"}`, and
`PASSWORD="abc,def"`, structured and serialized `JUDGMENT_API_KEY` /
`AWS_SECRET_ACCESS_KEY` / `CLIENT_SECRET` / camelCase access-token/password /
cookie/session-token fields, `Set-Cookie`, `HTTP_AUTHORIZATION`, query-string
assignments and a full URL such as
`https://example.test/?api_key=CANARY&benign=SURVIVES`, fragment credentials
such as `https://example.test/#access_token=CANARY&benign=SURVIVES`, standalone
`sk-`/`ghp_`/`github_pat_`/`xox` tokens, URL userinfo including
`amqps://user:CANARY@host` and password-only
`redis://:CANARY@host:6379/0`, quoted shell headers such as
`curl -H 'Authorization: Bearer CANARY' https://benign.example` and
`curl -H 'Cookie: sid=CANARY; refresh=CANARY2' https://benign.example`,
single-quoted Digest values containing double-quoted fields and double-quoted
Cookie values containing single-quoted fields while the adjacent URL survives,
private-key blocks, plus adjacent benign fields that must survive. A policy-approved
business `session_id` is deliberately separate and is set through
`Tracer.set_session_id`, not copied through this payload sanitizer.

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

Run two independent real wrapper sessions. Record wrapper IDs and returned CLI
IDs, boundedly flush, restart the wrapper, then resume both using persisted CLI
IDs. Exercise a tool-producing task when practical. Separately and safely
exercise every supported subcase independently: invalid session; pre-CLI
session lookup/create/state failure; nonzero; timeout; launch; empty output;
malformed output; missing result; missing first-turn CLI session; returned-ID
mapping persistence; turn persistence; response serialization when injectable;
an unexpected pre/post-CLI application failure; wrapper-root scope start, enter,
and exit; CLI-child scope start, enter, and exit; every
input/output/session/attribute/status setter; sanitizer; classifier; reporter;
finalizer; synchronous flush throw; async flush rejection where applicable;
flush timeout; and every payload-canary category.
Record one injection and result per subcase; never pass a group because one
member passed. An untriggered subcase is `blocked`. Also run the
supported fake/degraded mode across a real process restart: roots must be valid
and labeled fake, keep stable fake CLI sessions, and claim no inner coverage.

Every non-live unit/stub/fake/build/typecheck/import/smoke/dev/static-generation
command must start in a fresh process with all export-capable
Judgment/Judgeval/OTel credentials and exporter headers explicitly overridden
empty before any app/SDK import, and `OTEL_SDK_DISABLED=true` where supported;
or inject a proven in-memory/no-export tracer. If config requires a project
string, use an obviously synthetic value only after proving the exporter is
disabled. Merely unsetting can let dotenv refill values, clearing after import
is too late, and `setdefault` is not isolation. Only named live probes may
export; zero unexplained test roots is a completion condition.

Reconcile recorded requests/results with settled raw Judgment data and require:

- exactly one finalized nonzero-duration business root per real task, with
  truthful prompt/reply or normalized error and no read/health roots;
- exact returned/resumed CLI session IDs group the right turns across restart
  while independent sessions remain separate;
- normalized raw start/end arithmetic proves CLI/inner children show honest
  mode, timing, resume, exit, and outcome inside the root. Derive timestamp
  precision from raw stored values or documented platform resolution. For both
  `start_margin = min(child_start) - root_start` and `end_margin = root_end -
  max(child_end)`, a margin `>= 0` passes, `-precision < margin < 0` is
  inconclusive and must be repeated, and `margin <= -precision` fails;
- raw trace/span/parent IDs prove CLI/inner parentage; require an empty business
  root parent only when no deliberate upstream distributed context exists;
- exact project/endpoint routing, the valid-target positive control, and both
  empty and same-type unknown-name/ID negatives pass without project creation;
- payload canaries, semantic usefulness, and structured IO parseability pass
  in raw attributes;
- last pre-restart and first post-restart roots survive bounded post-root flush;
  and
- every claimed inner LLM/tool/subagent has actual raw trace/span/link evidence.

After each awaited bounded flush, poll raw data until the expected wrapper/CLI
parent trees, span-ID set, terminal IO/status, session IDs, and timestamps remain
unchanged across a named stability interval. Record raw-read timestamps and a
span-set hash. Missing or changing data remains `blocked`; a single read is not
proof that late inner records have settled.

Fake mode, successful HTTP, builds, or scratch spans are synthetic only. Use
`not-applicable` only when the architecture truly lacks a gate; missing auth,
traffic, raw evidence, or export is `blocked`.

The final report must have separate rows for static structure, each synthetic
edge, real application behavior, and settled raw Judgment evidence. In
particular, do not infer fail-open behavior from ordinary success, payload
safety from unit regexes, or error ownership from only CLI-owned failures.
