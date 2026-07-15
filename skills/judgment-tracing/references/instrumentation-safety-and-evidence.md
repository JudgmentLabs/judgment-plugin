# Shared instrumentation safety and evidence contract

Use this optional deep reference with the architecture-specific guide when one
of these risks is present.

## Fail closed at startup, fail open during application work

Fail startup before readiness when required Judgment routing is missing. In
particular, reject an explicitly empty project even when dotenv files exist.
Propagate the key, organization, project, and configured endpoint overrides to
every process that exports.

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

function bestEffortTraceWrite(label: string, write: () => void): void {
  try {
    write();
  } catch (error) {
    reportTelemetryFailure(label, error);
  }
}
```

Root end and bounded flush need the same treatment. End the business root
first, then flush from its outer owner. Report export failure without changing
the already-determined application outcome.

## Safe, useful payloads

Choose and name one mode: an **approved sanitizer**; a **conservative baseline**
that removes known credential/auth material and requires privacy review; or
**strict omission**, which retains safe metadata and marks semantic usefulness
`blocked`.

Truncation is not sanitization. Sanitize the final composed field before
bounding it, including error summaries and values built from several sources.
Do not claim a short credential redactor handles general PII or domain secrets.

For conservative-mode proof, use non-real canaries for provider/API-key
prefixes, bearer/basic authorization, cookies/sessions, secret/token/password
assignments, URL credentials, and private-key blocks.

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

## Real explicit-empty launcher check

Run the production launcher with the project explicitly empty. For a Compose
app, use a bounded run that always removes its resources; replace `service`
with the real readiness-owning producer or worker:

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

For a direct launcher, use the same explicit environment, 30-second bound,
nonzero-exit assertion, and required process cleanup. An `unset` test is not
equivalent because dotenv may repopulate the value. A unit import, scratch
span, or alternate launcher does not prove production startup routing.

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
