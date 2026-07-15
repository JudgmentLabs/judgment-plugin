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
6. the real model path, tools, restart path, and process-instance signal.

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

Compaction and finish are normal iteration roots when those branches exist.
Start/resume writes may be separate short traces. Exclude or sample health and
status polling.

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

1. Guard trace setters, sanitizers/classifiers, reporters, finalization, and
   flush reporting. Telemetry remains fail-open after valid startup.
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

After the iteration root ends, await a bounded flush from the outer loop's
`finally` on success and failure. A failed flush may leave durable application
state intact, but it blocks that checkpoint's tracing claim. The telemetry
reporter must also be fail-open.

## 5. Configure and limit capture

- Require an explicit project and forward key, organization, project, and
  endpoint overrides into every loop launcher.
- Run the production launcher with the project explicitly set to empty under a
  30-second bound and guaranteed cleanup. It must exit nonzero with the expected
  configuration error before accepting work. `unset` is invalid when dotenv
  can refill it.
- Disable provider bulk capture that retains accumulated history, static/system
  prompts, schemas, files, reports, or credentials in any attribute.
- Preserve real provider/model/token/cost when safe. A metadata-only manual LLM
  span is an incomplete privacy fallback, not full behavior evidence.
- Sanitize the final composed value, not only its ingredients, then bound it.
  Do not keep an unsanitized duplicate field. Leave margin below the platform's
  attribute limit for object serialization and prove settled
  `judgment.input`/`judgment.output` still parse as the intended structure.

Choose an approved sanitizer, a conservative credential/auth baseline that
still requires privacy review, or strict omission that blocks semantic
evaluation. Test a surviving benign marker plus non-real OpenAI-style `sk-`,
GitHub-style `ghp_` and `github_pat_`, other installed-provider/API-key,
authorization, cookie/session, secret-assignment, URL-credential, and
private-key canaries before/beyond the bound and in model/tool error,
compaction, and final output where those branches exist. After restart, search
all settled raw attributes for accumulated history, static prompts, schemas,
reports, files, and canaries.

## 6. Prove the stored result

Use the real runtime and model. Start one run, let multiple iterations and a
tool finish, kill immediately after a durable checkpoint, resume the same run,
and reach its actual terminal branch. Exercise compaction and retry only when
the repository exposes them. Record the exact run ID and persisted completed
iterations, then wait for ingestion and reconcile raw Judgment data.

Require:

- exactly one finalized iteration root per persisted iteration outcome, plus
  any separately labeled durable attempt traces reconciled to the
  application's own attempt records;
- branch-specific semantic IO and model/tool children inside each root window;
- exact run session on every root and contiguous iterations across restart;
- changed boot UUID with stable run/session ID;
- visible compaction/retry/finish only according to the real decision union;
- one useful span per executed tool and honest real LLM metadata;
- no unapproved payloads or canaries in any raw attribute, with stored
  structured root IO still parseable; and
- the last completed pre-kill root present after its bounded post-root flush.

Use `not-applicable` only for a branch the architecture genuinely lacks.
Missing real traffic, credentials, raw evidence, or export is `blocked`.
