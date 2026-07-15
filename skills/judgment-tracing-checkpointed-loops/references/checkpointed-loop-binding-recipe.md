# Checkpointed Loop Binding Recipe

Read this file completely before editing a long-running agent that durably
saves decision iterations and resumes after process death.

## Contents

- [Locate the durable unit](#1-locate-the-durable-unit)
- [Bind the root and session](#2-bind-the-root-and-session)
- [Detach background work correctly](#3-detach-background-work-correctly)
- [Preserve application outcomes](#4-preserve-application-outcomes)
- [Configure and limit capture](#5-configure-and-limit-capture)
- [Prove the stored result](#6-prove-the-stored-result)

## 1. Locate the durable unit

Identify before editing:

1. the exact persisted run ID;
2. the function that performs one model decision and optional action;
3. the save/checkpoint that makes that decision independently complete;
4. every member of the real decision union, including plan, tool, compaction,
   retry, error, and finish only where they actually exist;
5. start/resume request ownership and background-loop launch; and
6. the real model path, tools, restart path, and process-instance signal; and
7. the checked-in launcher/deployment ledger: path/hash, exact command or
   Compose service, resolved env/project/endpoint wiring, readiness check, and
   guaranteed cleanup.

One durably saved iteration outcome is one fresh trace. This includes a failed
attempt only when that failure is itself persisted as the iteration outcome.
An attempt that fails before any checkpoint is not a completed-iteration trace;
if the application exposes those attempts as useful durable records, label and
reconcile them separately as attempt traces. The run is the Judgment session.
Do not add a process-lifetime root or require clean process exit to make
already-saved iterations valid.

## 2. Bind the root and session

- Use a stable application name such as `<agent>.iteration`; keep iteration
  number and decision type in attributes/IO, not the span name.
- Start before the model decision. End only after the selected action/error and
  updated state are durably saved.
- Put the exact run ID on every root as `judgment.session_id` before and after
  restart.
- Root input contains a bounded safe goal plus the minimum state summary needed
  to understand this decision.
- Root output exhaustively describes the persisted branch outcome: safe plan
  items, tool result/error, compaction summary, retry outcome, or final result.
  Decision type, status, count, path, hash, or size alone is incomplete when a
  richer semantic result exists.
- Model and tool spans are children of that iteration. Use real business tool
  names and do not duplicate framework and manual spans.
- Choose kind from the work represented, not the containing agent
  architecture. Use `agent` for a root that actually performs an agent
  decision/phase. Use Judgment's documented `function` kind (or the pinned
  SDK's named documented general equivalent) for orchestration,
  checkpoint/control, start/resume, or bookkeeping roots that do not. Use
  `llm` only for a real model call and `tool` only for an executed business
  tool. Verify raw kinds; names and generic OpenTelemetry kinds do not prove
  them. Use only documented public APIs from the pinned installed SDK. A
  private or underscored API is forbidden without its own pinned,
  production-shaped executable conformance proof.

Compaction and finish are normal iteration roots when those branches exist;
their kind still follows the work the root actually performs. Start/resume
writes may be separate short `function`/general traces. Exclude or sample
health and status polling.

## 3. Detach background work correctly

The observed start/resume request must persist and return its accepted result,
then fully leave its dynamic trace scope. Only afterward may the outer handler
launch the background loop. An inherited promise can otherwise put iterations
under an already-ended HTTP trace.

Use the installed SDK's documented fresh/fork mechanism as defense, not proof.
Settled raw data must show every iteration as a parentless fresh root with a
trace ID distinct from start/resume. Preserve deliberate upstream continuity as
a trace link, not a parent that changes the durable iteration boundary.

Generate a random boot UUID once per process. Prefer
`service.instance.id`; otherwise attach the UUID to every iteration root and
report the resource limitation. Hostname plus PID is not restart proof and the
boot UUID must never replace the durable run/session ID.

## 4. Preserve application outcomes

Use one observed iteration adapter with automatic IO disabled:

1. Guard every tracing operation the implementation actually uses: scope
   lifecycle, trace setters, sanitizer/classifier, reporter, finalizer, and
   flush reporting, plus active-span lookup, rename, or a manual span-type/kind
   setter when present. Telemetry remains fail-open after valid startup. Do not
   resolve a current span outside the guard and protect only the subsequent
   mutation, and do not add a rename or manual setter merely to create a
   fault-injection case.
2. Let the model decide, execute the real action, apply the repository's state
   transition, and persist it exactly once.
3. Record the branch-specific bounded semantic output only after the existing
   save semantics succeed.
4. On failure, retain the original exception only in memory. Record a stable
   safe code/status on this iteration root only when the existing application
   durably saves that failure as the iteration outcome. Otherwise do not export
   it as an iteration root. If the SDK cannot discard the open span, rename and
   label it as an unsaved attempt trace; reconcile it to a durable application
   attempt record when one exists, or mark trace-count verification `blocked`
   when none exists. Then preserve the repository's existing
   retry/recovery/rethrow behavior.
5. Never invent `run.status = failed`, suppress a retry, skip a checkpoint,
   swallow a tool result, repeat a side effect, or replace the original error.

Use only closed application-owned error codes. Every durably recorded
unrecovered iteration/model/tool failure must have bounded safe output and raw
OpenTelemetry `ERROR` status with the same code. A recovered tool child may be
`ERROR` while its truthful completed iteration succeeds. An unsaved attempt
must not be mislabeled as a completed iteration merely to obtain status parity.

After the iteration root ends, await a bounded flush from the outer loop's
`finally` on success and failure. A failed flush may leave durable application
state intact, but it blocks that checkpoint's tracing claim. The telemetry
reporter must also be fail-open.

Safely inject independent failures into iteration-root and model/tool-child
scope start/enter/exit and every trace setter/status write,
sanitizer/classifier, reporter/finalizer, flush throw/rejection, and flush
timeout supported by the runtime. Also inject active-span lookup, rename, and
manual span-type/kind setter failures separately when the implementation
actually calls them. An absent operation is genuinely `not-applicable`; do not
add it just to exercise the matrix. Each applicable subcase must leave the
model/action/save path single-run and preserve checkpoints, retry/recovery,
resume, final result, and original exceptions. Do not aggregate subcases; an
applicable but unexercised case is `blocked`.

## 5. Configure and limit capture

- Before editing dependencies, record manifest/lockfile hashes and exact
  loop/runtime/provider versions. Add only the required tracing dependency with
  the existing package manager, run its frozen-lock install, and record the
  diff, hashes, and versions again. Unexplained unrelated upgrades block
  completion.
- Require the intended existing project; forward key, organization, project,
  deployment-provided project ID when present, and endpoint overrides into every
  loop launcher. Require a resolved runtime ID and compare it with that expected
  ID when available. Otherwise, keep exact routing blocked until a unique live
  probe settles in that exact project.
- Run the production launcher with the project explicitly empty and with a
  unique unknown name or ID of the same type it accepts under a 30-second bound
  and guaranteed cleanup. Both must exit with the expected routing error before
  accepting work, the unknown target must not be created, and a valid-target
  positive control must start. `unset`, unrelated failure, or nonempty ID alone
  is not proof.
- Use the same checked-in launcher/service and otherwise-identical
  configuration for the valid, explicitly-empty, and unique-unknown controls.
  If the selected production-style topology uses Compose, record the checked-in
  Compose path and agent service, retain a sanitized
  `docker compose -f <file> config`, and exercise that real service. For that
  selected Compose topology, a host-only script or development launcher is
  diagnostic, not deployment proof.
- Inspect resolution semantics first. If name initialization can create a
  project, use a read-only lookup and reject the unknown name before that path.
- Disable provider bulk capture that retains accumulated history, static/system
  prompts, schemas, files, reports, or credentials in any attribute.
- Preserve real provider/model/token/cost when safe. A metadata-only manual LLM
  span is an incomplete privacy fallback, not full behavior evidence.
- Project/redact structured fields first. In composed text, remove complete
  multiline private-key blocks and standalone `Bearer TOKEN` / `Basic TOKEN`
  values before any greedy line/header/key-value rule. Then sanitize the final
  composed value and keep no unsanitized duplicate. Serialize only afterward;
  each stored `judgment.input`/`judgment.output` is at most **1,500 UTF-8
  bytes**, or a lower documented destination limit, and remains parseable. Use
  a valid structured truncation marker rather than slicing serialized JSON.

Choose an approved sanitizer, a conservative credential/auth baseline that
still requires privacy review, or strict omission that blocks semantic
evaluation. Test a surviving benign marker plus non-real OpenAI-style `sk-`,
GitHub-style `ghp_` and `github_pat_`, `Authorization: ApiKey`,
`Authorization: Digest`, custom `Proxy-Authorization`, `HTTP_AUTHORIZATION`,
`X-Api-Key`, `JUDGMENT_API_KEY`, `AWS_SECRET_ACCESS_KEY`, camelCase/prefixed
secret/token/password keys, cookie/session tokens, URL credentials, and
private-key canaries before/beyond the bound and in model/tool error,
compaction, and final output where those branches exist. After restart, search
all settled raw attributes for accumulated history, static prompts, schemas,
reports, files, and canaries.
The exact matrix includes `Bearer STANDALONE_BEARER_CANARY_0123456789`, `Basic
QkFTSUNfQ0FOQVJZXzEyMzQ1Njc4OTA=`, and a multiline private-key block containing
an authorization line. The whole block and both standalone auth values must be
absent while adjacent benign markers survive, proving the required ordering.

## 6. Prove the stored result

Use the real runtime and model. Start one run, let multiple iterations and a
tool finish, kill immediately after a durable checkpoint, resume the same run,
and reach its actual terminal branch. Exercise compaction and retry only when
the repository exposes them. Record the exact run ID and persisted completed
iterations, then wait for ingestion and reconcile raw Judgment data. Run this
through the checked-in launcher/deployment ledger; when Compose is the real
topology, use the real named service and resolved config, not a host-only
substitute.

Require:

- exactly one finalized iteration root per persisted iteration outcome, plus
  any separately labeled durable attempt traces reconciled to the
  application's own attempt records;
- branch-specific semantic IO and model/tool children inside each root window;
- exact run session on every root and contiguous iterations across restart;
- changed boot UUID with stable run/session ID;
- visible compaction/retry/finish only according to the real decision union;
- one useful span per executed tool and honest real LLM metadata;
- raw stored kinds are `agent` for roots that actually perform an agent
  decision/phase, `function` (or the pinned SDK's named documented general
  equivalent) for orchestration/checkpoint/control/bookkeeping roots, `llm` for
  real model calls, and `tool` for executed business tools;
- no unapproved payloads or canaries in any raw attribute, with stored
  structured root IO still parseable and no serialized IO attribute larger
  than 1,500 UTF-8 bytes or its lower documented destination limit; and
- the last completed pre-kill root present after its bounded post-root flush.

Normalize units, derive timestamp precision from raw stored values or documented
platform resolution, and compute both `start_margin = min(child_start) -
root_start` and `end_margin = root_end - max(child_end)` for every iteration.
Each margin `>= 0` passes; `-precision < margin < 0` is inconclusive and must be
repeated; `margin <= -precision` fails.

After each awaited bounded flush, poll raw data until the expected iteration
parent trees, span-ID set, terminal IO/status, iteration numbers, and timestamps
remain unchanged across a named stability interval. Record raw-read timestamps
and a span-set hash. Missing or changing data remains `blocked`; a partial run
must not be scored before late iterations or children settle.

Run every non-live unit/stub/fake/build/typecheck/import/smoke/dev/static-
generation command in a fresh process with all export-capable
Judgment/Judgeval/OTel credentials and exporter headers explicitly overridden
empty before any app/SDK import, and `OTEL_SDK_DISABLED=true` where supported;
or inject a proven no-export/in-memory tracer. If config requires a project
string, use an obviously synthetic value only after proving the exporter is
disabled. Merely unsetting can let dotenv refill values, clearing after import
is too late, and `setdefault` is not isolation. Reconcile named live probes with
Monitoring and require zero unexplained test-generated roots.

Use `not-applicable` only for a branch the architecture genuinely lacks.
Missing real traffic, credentials, raw evidence, or export is `blocked`.

Behaviors, Judges, and Tests may supplement, but never replace, persisted
iteration reconciliation. Count one only when the exact recorded result comes
from this controlled run, exposes the matching iteration trace ID, and is
inspectable at result level. A definition, enabled configuration, or aggregate
score without trace-linked current-run results is `blocked` as evidence.
