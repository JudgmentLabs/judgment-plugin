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

After startup, telemetry is observational. A sanitizer, classifier, trace
setter, reporter, root finalizer, or flush failure must not prevent, repeat, or
replace application work. Keep the real result or exception in memory and
preserve the application's existing return, recovery, retry, and rethrow
behavior. A telemetry failure makes the affected evidence `blocked`.

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
```

The synchronous helper detects and safely observes an accidentally returned
promise, but that call site remains blocked because it was not awaited. Use and `await` the
async helper for promise-returning finalization or export such as Judgeval JS
`Tracer.forceFlush()`. Root end and bounded flush need the same treatment. End
the business root first, then flush from its outer owner. Report export failure
without changing the already-determined application outcome.

## Safe, useful payloads

Choose and name one mode: an **approved sanitizer**; a **conservative baseline**
that removes known credential/auth material and requires privacy review; or
**strict omission**, which retains safe metadata and marks semantic usefulness
`blocked`.

Truncation is not sanitization. Sanitize the final composed field before
bounding it, including error summaries and values built from several sources.
Leave serialization margin below the platform attribute limit and prove stored
structured IO remains parseable. Do not claim a short credential redactor
handles general PII or domain secrets.

For conservative-mode proof, use non-real canaries for OpenAI-style `sk-`,
GitHub-style `ghp_` and `github_pat_`, installed-provider/API-key prefixes,
prefixed assignments such as `JUDGMENT_API_KEY=` and
`AWS_SECRET_ACCESS_KEY=`, scheme-agnostic `Authorization:` and
`Proxy-Authorization:` headers (including `ApiKey`/custom schemes),
cookies/sessions, secret/token/password assignments, URL credentials, and
private-key blocks.

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

Run the production launcher once with the project explicitly empty and once
with a unique unknown name or ID of the same type the launcher accepts. Both
must fail before readiness, and the unknown value must not create a project. For
a Compose app, use a bounded run that always removes its resources; replace
`service` with the real readiness-owning producer or worker:

```python
import os
import subprocess

env = {**os.environ, "JUDGMENT_PROJECT_NAME": ""}
cmd = [
    "docker", "compose", "up", "--build", "--abort-on-container-exit",
    "--exit-code-from", "service", "service",
]
try:
    result = subprocess.run(
        cmd, env=env, capture_output=True, text=True, timeout=30, check=False
    )
finally:
    subprocess.run(
        ["docker", "compose", "down", "--remove-orphans"],
        env=env, capture_output=True, text=True, timeout=30, check=False,
    )
assert result.returncode != 0
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
value. A unit import, scratch span, or alternate launcher does not prove
production startup routing. A positive startup also does not prove the exact
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
