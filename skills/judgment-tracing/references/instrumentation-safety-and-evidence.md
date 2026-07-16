# Shared instrumentation safety and evidence contract

Use this optional deep reference with the architecture-specific guide when one
of these risks is present.

## Contents

- [Fail closed and fail open](#fail-closed-at-startup-fail-open-during-application-work)
- [Safe, useful payloads](#safe-useful-payloads)
- [Binding parentage proof](#binding-parentage-proof)
- [Real routing startup checks](#real-routing-startup-checks)
- [Evidence vocabulary](#evidence-vocabulary)

## Fail closed at startup, fail open during application work

Fail startup before readiness when required Judgment routing is missing or the
configured project does not resolve. A nonempty typo can still make the SDK
install a silent no-export tracer. Inspect the installed SDK and require its
resolved project identity/monitoring state after initialization. A nonempty
resolved ID proves resolution, not that the target is correct. Compare it with
a pinned expected project ID. If the runtime cannot compare identities, require
a uniquely named live probe to settle in the exact intended project before the
routing gate passes. For Judgeval Python 1.2, for example, `Tracer.init(...)`
returns a tracer whose public `project_id` must be nonempty and must equal the
pinned intended ID. Reject both an explicitly empty project and a unique
unknown project name or ID of the same type the launcher accepts, even when
dotenv files exist. Do not allow the negative check to create a project.
Inspect the installed resolution path first; if name initialization can create,
perform a read-only lookup and reject the unknown value before that path.
Propagate the key, organization, project, and configured endpoint overrides to
every exporter.

After startup, telemetry is observational. An active/current-span lookup,
sanitizer, classifier, trace setter, reporter, root finalizer, flush, or any
explicit span rename/type/kind setter the integration actually calls must not
prevent, repeat, delay beyond the application's declared telemetry budget, or
replace application work. Put each operation actually used—including the
lookup itself—inside the trace-only guard. Do not invent a rename or kind-setter
call merely to create a fault case. Keep the real result or exception in memory
and preserve the application's existing return, recovery, retry, cancellation,
latency, and rethrow behavior. A telemetry failure makes the affected evidence
`blocked`.

Use one small best-effort adapter consistently. Put trace-only sanitization and
classification inside the guarded callback so they cannot become a new
application failure path:

```python
def report_telemetry_failure(label: str, error: Exception) -> None:
    try:
        # Do not copy a potentially sensitive exception message or stack into
        # logs merely because tracing failed.
        logger.warning(
            "Judgment telemetry failed: %s (%s)", label, type(error).__name__
        )
    except Exception:
        pass

def best_effort_trace_write(label: str, write) -> None:
    try:
        write()
    except Exception as error:
        report_telemetry_failure(label, error)
```

```ts
function reportTelemetryFailure(label: string, error: unknown): void {
  try {
    // Do not copy a potentially sensitive exception message or stack to logs.
    const kind = error instanceof Error ? error.name : typeof error;
    console.warn(`Judgment telemetry failed: ${label} (${kind})`);
  } catch {}
}

function bestEffortTraceWrite(label: string, write: () => unknown): void {
  try {
    const result = write();
    if (result && typeof (result as PromiseLike<unknown>).then === "function") {
      void Promise.resolve(result).catch((error) => {
        reportTelemetryFailure(`${label}:async-rejection`, error);
      });
      reportTelemetryFailure(
        label,
        new TypeError("async_write_requires_bestEffortTraceWriteAsync"),
      );
    }
  } catch (error) {
    reportTelemetryFailure(label, error);
  }
}

async function bestEffortTraceWriteAsync(
  label: string,
  write: () => Promise<void>,
  timeoutMs: number,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.resolve().then(write),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("telemetry_timeout")),
          timeoutMs,
        );
      }),
    ]);
    return true;
  } catch (error) {
    reportTelemetryFailure(label, error);
    return false;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

let judgmentFlushInFlight: Promise<void> | undefined;

async function bestEffortForceFlush(deadlineMs: number): Promise<boolean> {
  if (judgmentFlushInFlight !== undefined) {
    // The existing call may have started before this turn ended, so do not
    // claim that it exported this turn. Fail closed without starting another.
    reportTelemetryFailure("Judgment flush busy", new Error("flush_busy"));
    return false;
  }

  const tracked = Promise.resolve()
    .then(() => Tracer.forceFlush())
    .finally(() => {
      if (judgmentFlushInFlight === tracked) judgmentFlushInFlight = undefined;
    });
  judgmentFlushInFlight = tracked;
  return bestEffortTraceWriteAsync(
    "Judgment flush",
    () => tracked,
    deadlineMs,
  );
}
```

The synchronous helper detects and safely observes an accidentally returned
promise, but that call site remains blocked because it was not awaited. Use and `await` the
async helper for promise-returning finalization. For Judgeval JS
`Tracer.forceFlush()`, use the process-wide single-flight adapter: a timeout bounds
the caller but cannot cancel the exporter promise, so starting a fresh flush per
request would create a resource storm. Root end and bounded flush need the same
ordering. End the business root first, then await `bestEffortForceFlush` from its
outer owner. A busy gate or `false` result blocks export evidence without changing the
already-determined application outcome.

Judgeval Python's `Tracer.force_flush(timeout_millis)` is synchronous, and the
SDK timeout may be applied separately to more than one registered tracer. It is
therefore not a wall-clock bound for a request. For an async request owner, put
the synchronous call and its failure reporting in a worker and enforce a real
outer deadline:

```python
import asyncio
import threading

from judgeval import Tracer

_FLUSH_SINGLE_FLIGHT = threading.Lock()

async def best_effort_force_flush_with_deadline(
    deadline_ms: int,
) -> bool:
    def flush_and_report() -> bool:
        # A timed-out to_thread worker cannot be killed. Single-flight ensures
        # at most one still-running exporter call exists process-wide.
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
        # The SDK argument is only an exporter hint. wait_for is the outer
        # user-visible deadline; the worker may finish later without delaying
        # the already-determined application result or exception.
        return await asyncio.wait_for(
            asyncio.to_thread(flush_and_report),
            timeout=deadline_ms / 1_000,
        )
    except TimeoutError as error:
        report_telemetry_failure("flush deadline", error)
        return False
    except Exception as error:
        # Thread scheduling/executor failure is telemetry failure too.
        report_telemetry_failure("flush scheduling", error)
        return False
```

Call this only after the root has ended. A timed-out worker can continue in the
background, but the process-wide gate prevents another exporter call from
joining it. A call that finds the gate busy returns `False`; mark export evidence
`blocked` while preserving the application outcome. A process-exit path still
needs a runtime-specific shutdown strategy; do not claim restart-safe export for
that case. Choose `deadline_ms` from the application's declared latency budget;
500 ms is an upper-bound example for a user-visible path, not a universal SLO.
For a synchronous server, use an equivalent daemon-worker/event deadline or
move the flush to an awaitable outer lifecycle hook. Never use a context-managed
thread pool whose shutdown waits past the deadline.

## Safe, useful payloads

Choose and name one mode: an **approved sanitizer**; a **conservative baseline**
that removes known credential/auth material and requires privacy review; or
**strict omission**, which retains safe metadata and marks semantic usefulness
`blocked`.

Truncation is not sanitization. Project approved fields, recursively redact the
structure, and only then serialize and bound the complete value passed to
`Tracer.set_input` or `Tracer.set_output`. Remove multiline/private-key blocks
before broad single-line authorization patterns; an earlier greedy match can
consume the begin delimiter and strand the key body. Test the complete ordered
sanitizer on one composed payload, not only each pattern in isolation.

The limit is **1,500 UTF-8 bytes after the exact installed SDK serializer**, or
a lower documented destination limit—not 1,500 characters and not 1,500 bytes
for an inner field later wrapped in another object. The root's semantic
prompt/reply payload may use up to **1,800 bytes** (`ROOT_TRACE_PAYLOAD_MAX_BYTES`):
observed platform clipping starts near 2,000 serialized bytes, so 1,800 keeps
margin while preserving more exact turn fidelity. For Judgeval Python 1.2.x,
dict/list attributes are serialized with compact `orjson`; the following
structure-first schema mirrors that serializer for the JSON-safe domain it
creates. Reinspect and adapt the serializer adapter when the pinned SDK version
changes:

```python
import math
import re
from collections.abc import Callable, Mapping

import orjson
from judgeval import Tracer

TRACE_PAYLOAD_MAX_BYTES = 1_500
# The root's semantic prompt/reply may use a larger budget: observed platform
# clipping starts near 2,000 serialized bytes, so 1,800 keeps margin while
# preserving more exact turn fidelity. Children/tools stay at 1,500.
ROOT_TRACE_PAYLOAD_MAX_BYTES = 1_800
TRACE_SUMMARY_FIELDS = ("ok", "status", "error_code", "operation", "model")
SECRET_KEYS = {
    "authorization", "proxy_authorization", "http_authorization",
    "cookie", "set_cookie", "session", "session_token", "session_cookie",
    "api_key", "secret", "secret_key", "secret_access_key",
    "client_secret", "access_token", "refresh_token", "token",
    "password", "passwd",
}

def _normalized_key(key: str) -> str:
    value = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", key)
    return re.sub(r"[^A-Za-z0-9]+", "_", value).strip("_").casefold()

def _secret_key(key: str) -> bool:
    normalized = _normalized_key(key)
    return any(
        normalized == secret or normalized.endswith(f"_{secret}")
        for secret in SECRET_KEYS
    )

def _canonical_json_value(value: object) -> object:
    if value is None or isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.encode("utf-8", "replace").decode("utf-8")
    if isinstance(value, int):
        return value if -(2**63) <= value <= 2**63 - 1 else str(value)
    if isinstance(value, float):
        return value if math.isfinite(value) else "[non_finite_number]"
    if isinstance(value, Mapping):
        return {
            key: _canonical_json_value(item)
            for key, item in value.items()
            if isinstance(key, str)
        }
    if isinstance(value, (list, tuple)):
        return [_canonical_json_value(item) for item in value]
    return "[unsupported_type]"

def _redact_structure(
    value: object,
    redact_text: Callable[[str], str],
) -> object:
    if isinstance(value, dict):
        return {
            key: "[REDACTED]" if _secret_key(key)
            else _redact_structure(item, redact_text)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [_redact_structure(item, redact_text) for item in value]
    if isinstance(value, str):
        redacted = redact_text(value)
        if not isinstance(redacted, str):
            raise TypeError("text sanitizer must return str")
        return redacted.encode("utf-8", "replace").decode("utf-8")
    return value

def _serialize_like_judgeval_1_2(value: object) -> bytes:
    # Canonicalization above leaves only the domain that Judgeval 1.2.x passes
    # unchanged to this exact compact orjson encoding.
    return orjson.dumps(value, option=orjson.OPT_NON_STR_KEYS)

def _bounded_payload(
    payload: dict[str, object],
    max_bytes: int = TRACE_PAYLOAD_MAX_BYTES,
) -> dict[str, object]:
    # Root judgment.input/output callers pass ROOT_TRACE_PAYLOAD_MAX_BYTES.
    serialized = _serialize_like_judgeval_1_2(payload)
    if len(serialized) <= max_bytes:
        return payload

    summary = {
        key: payload[key]
        for key in TRACE_SUMMARY_FIELDS
        if key in payload and (
            payload[key] is None
            or isinstance(payload[key], bool)
            or (
                isinstance(payload[key], int)
                and not isinstance(payload[key], bool)
                and -1_000_000_000 <= payload[key] <= 1_000_000_000
            )
            or (isinstance(payload[key], str) and len(payload[key]) <= 32)
        )
    }
    marker = {
        "truncated": True,
        "original_bytes": len(serialized),
        "max_bytes": max_bytes,
    }
    preview = serialized.decode("utf-8")
    bounded = {**summary, "_judgment_truncation": marker, "preview": ""}
    low, high = 0, len(preview)
    while low <= high:
        middle = (low + high) // 2
        candidate = {
            **summary,
            "_judgment_truncation": marker,
            "preview": preview[:middle],
        }
        if len(_serialize_like_judgeval_1_2(candidate)) <= max_bytes:
            bounded = candidate
            low = middle + 1
        else:
            high = middle - 1
    return bounded

def prepare_trace_payload(
    build_fields: Callable[[], Mapping[str, object]],
    allowed_fields: tuple[str, ...],
    redact_text: Callable[[str], str],
) -> dict[str, object]:
    raw = build_fields()
    projected = {key: raw[key] for key in allowed_fields if key in raw}
    canonical = _canonical_json_value(projected)
    sanitized = _redact_structure(canonical, redact_text)
    if not isinstance(sanitized, dict):
        raise TypeError("trace payload must remain an object")
    return _bounded_payload(sanitized)

def set_safe_trace_input(label, build_fields, allowed_fields, redact_text) -> None:
    best_effort_trace_write(
        label,
        lambda: Tracer.set_input(
            prepare_trace_payload(build_fields, allowed_fields, redact_text)
        ),
    )

def set_safe_trace_output(label, build_fields, allowed_fields, redact_text) -> None:
    best_effort_trace_write(
        label,
        lambda: Tracer.set_output(
            prepare_trace_payload(build_fields, allowed_fields, redact_text)
        ),
    )
```

`redact_text` is the chosen approved sanitizer or conservative baseline; never
wire a no-op into this schema. It must remove complete private-key blocks and
standalone auth values before greedy header/assignment rules. Because field
construction, projection, sanitization, exact serialization, bounding, and the
SDK setter all happen inside `best_effort_trace_write`, a telemetry-only fault
cannot replace application work. Contract-test the adapter against the pinned
installed serializer and inspect the settled raw attribute. Do not import an
internal Judgeval serializer into production just to perform this check.

For conservative-mode proof, use non-real canaries for OpenAI-style `sk-`,
GitHub-style `ghp_` and `github_pat_`, installed-provider/API-key prefixes,
prefixed assignments such as `JUDGMENT_API_KEY=` and
`AWS_SECRET_ACCESS_KEY=`, scheme-agnostic `Authorization:` and
`Proxy-Authorization:` headers (including `ApiKey`/custom schemes), standalone
`Bearer <token>` and `Basic <token>` fragments, cookies/sessions,
secret/token/password assignments (including camelCase HTTP authorization),
URL credentials, and private-key blocks.

Put a benign semantic marker and at least one canary before the size bound,
another canary beyond it, and distinct canaries in output and error paths. In
settled raw stored attributes, require the benign marker to survive and every
canary to be absent. Preview text and sanitizer unit tests are not raw stored
proof.

## Binding parentage proof

Record raw `trace_id`, `span_id`, and `parent_span_id` for each business root
and expected child. Require an empty root parent only when there is no
intentional upstream context. With deliberate W3C or distributed propagation,
prove the expected upstream chain and that the local business root still owns
the complete local lifetime, session, and semantic input/output. A UI
waterfall, decorator option, or short accidental framework parent is not proof.

## Real routing startup checks

First write a launcher ledger containing the exact checked-in production
command, readiness owner, each exporter process/container, every required
configuration value, and the file that forwards it. Run that exact launcher
once with the intended project, once with the project explicitly empty, and
once with a unique unknown name or ID of the same type the launcher accepts.
Both negative modes must fail before readiness, and the unknown value must not
create a project. When the selected topology is Compose, render
`docker compose config` with the exact recorded files, env-file, profiles,
project name, and other production flags. Require every exporter service to
receive every required `JUDGMENT_*` value. Then use those same arguments for a
bounded run that always removes its resources. This example requires
repository-specific values instead of silently using bare Compose defaults:

```python
import os
import subprocess

COMPOSE_PREFIX = [
    "docker", "compose",
    "-f", "<checked-in-compose-file>",
    "--env-file", "<production-env-file>",
    "--project-name", "<bounded-test-project-name>",
    # Add every recorded --profile/-f/global flag from the launcher ledger.
]
READINESS_SERVICE = "<real-readiness-owning-service>"
env = {**os.environ, "JUDGMENT_PROJECT_NAME": ""}
config = subprocess.run(
    [*COMPOSE_PREFIX, "config"], env=env, capture_output=True, text=True,
    timeout=30, check=False,
)
assert config.returncode == 0
assert_resolved_exporter_wiring(config.stdout)  # repository-specific assertions

cmd = [*COMPOSE_PREFIX, "up", "--build", "--abort-on-container-exit",
       "--exit-code-from", READINESS_SERVICE, READINESS_SERVICE]
try:
    result = subprocess.run(
        cmd, env=env, capture_output=True, text=True, timeout=30, check=False
    )
finally:
    subprocess.run(
        [*COMPOSE_PREFIX, "down", "--remove-orphans", "--volumes"],
        env=env, capture_output=True, text=True, timeout=30, check=False,
    )
assert result.returncode != 0
assert_expected_routing_error(result.stdout, result.stderr)
assert_readiness_marker_absent(result.stdout, result.stderr)
```

Nonzero exit alone is not proof: assert the repository-specific missing or
unknown-project error appeared and the readiness marker did not. Run the same
launcher with the valid intended target as a positive control so an unrelated
startup crash cannot make both negative cases look correct.

Repeat with `JUDGMENT_PROJECT_NAME="ATA_NONEXISTENT_PROJECT_<unique>"` when the
launcher accepts names. When it accepts IDs, use a syntactically valid unknown
ID in the matching project-ID setting instead. A warning followed by readiness,
falling back to another project, or creating the unknown target is a failure,
not graceful degradation. For a direct launcher, use the same explicit
environment, 30-second bound, nonzero-exit assertion, and required process
cleanup. An `unset` test is not equivalent because dotenv may repopulate the
value. A unit import, scratch span, direct host-run standalone server,
evaluator-only overlay, or alternate launcher does not prove production
startup routing. A positive startup also does not prove the exact
destination by itself: compare the resolved ID to the pinned intended ID or
verify a uniquely named settled live probe in that exact project.

Ordinary unit/fake tests must start in a fresh process with all export-capable
Judgment/Judgeval/OTel credentials and exporter headers explicitly overridden
empty before any app/SDK import, and `OTEL_SDK_DISABLED=true` where supported;
or inject a proven no-export/in-memory tracer. If app validation requires a
project string, use an obviously synthetic value such as `unit-tests-no-export`
only after proving the initialized exporter is disabled. Merely unsetting can
let dotenv refill variables, clearing after SDK import is too late, and
`setdefault` can preserve a developer's live project. Reconcile named probes
with the run ledger and require zero unexplained test-generated roots.

## Evidence vocabulary

Give each required row one result—`pass`, `fail`, `blocked`, or
`not-applicable`—and one class: `static`, `synthetic`, `real application`, or
`stored Judgment`. N/A means the architecture genuinely lacks the behavior;
missing or unexercised evidence is blocked. Stubs, fake CLIs, unit tests, and
scratch spans are synthetic. A zero-exit negative launcher or stored canary is
a fail.

The focused guide's final table names the architecture-specific rows. Do not
call an integration live or end-to-end verified when any required real
application or stored-Judgment row failed or is blocked.

A Behavior, Code Judge, or Test contributes only when its current-run recorded
result can be tied to exact trace IDs and inspected. Configured-but-not-run,
zero-result, missing-score, and stale-result states are `blocked`, never an
implicit green result. Prefer raw stored payload checks for exact privacy and
count invariants even when a behavioral evaluation is also configured.
