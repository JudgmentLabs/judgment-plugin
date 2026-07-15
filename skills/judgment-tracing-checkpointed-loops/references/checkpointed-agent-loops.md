# Checkpointed Agent Loop Deep Reference

This file is optional. `checkpointed-loop-binding-recipe.md` is the only
implementation recipe. Read only the section named by `../SKILL.md` after its
condition is detected. These sections explain diagnostics and evidence; they
do not provide a competing traced-loop implementation.

## Contents

- [TypeScript pattern](#typescript-pattern)
- [Model and tool children](#model-and-tool-children)
- [Export lifecycle](#export-lifecycle)
- [Mandatory real-path verification](#mandatory-real-path-verification)
- [Completion gate](#completion-gate)

## TypeScript pattern

Use this section only when the installed Judgeval function-wrapper API or the
iteration outcome boundary remains unclear.

The single adapter has four responsibilities:

1. Start a fresh application-specific iteration root with automatic IO disabled.
2. Guard trace-only input/session writes, run the existing model/action/save
   path once, then guard the branch-specific semantic output write.
3. On application failure, guard a normalized error write only for a durably
   saved failure outcome. If the SDK cannot discard an unsaved attempt, rename
   and label it as an attempt trace and return the original exception only as
   an in-memory outcome.
4. Leave the observed scope before the caller preserves the repository's
   existing retry, recovery, failure transition, or rethrow behavior. A failed
   attempt is an iteration root only when its failure outcome was durably
   saved. Reconcile an exported unsaved-attempt trace to a durable attempt
   record; without one, mark trace-count verification `blocked`.

The adapter must not set new durable failure state. If the application already
owns a failure transition, that existing owner remains responsible. Never add
`run.status = failed` merely to make a trace look complete.

Implement branch summarization exhaustively against the repository's real
decision union. A plan retains safe plan meaning; a tool branch retains the
business tool and safe result/error; compaction retains the safe summary plus
before/after support; finish retains a safe final result plus artifact metadata.
Decision type, status, counts, hashes, paths, or sizes alone are incomplete.

Check the installed SDK before using `fork` or a fresh-trace option. The raw
stored iteration must be parentless and have a trace ID distinct from the
start/resume request. Preserve deliberate upstream continuity as a link rather
than a parent. API syntax is not parentage proof.

Use documented public span APIs only and choose kind from the represented work.
A root that actually performs an agent decision/phase is
`span_kind=agent`; orchestration, checkpoint/control, start/resume, and
bookkeeping roots are `span_kind=function` (or the pinned SDK's named
documented general equivalent). Real model children are `span_kind=llm`, and
executed business tools are `span_kind=tool`. Keep every active-span lookup,
rename, type/kind setter, sanitizer, and trace mutation that the implementation
actually uses inside its fail-open callback. Fault-inject active-span lookup,
rename, and a manual type/kind setter only when that call exists; do not add one
to satisfy the matrix, and mark an absent operation `not-applicable`.
Private/underscored APIs are forbidden unless the exact SDK version is pinned
and a production-shaped executable conformance test proves that call.

## Model and tool children

Use this section when provider metadata, active tool spans, or manual privacy
fallbacks remain ambiguous.

- Instrument the real model path and preserve provider, model, latency, tokens,
  cost, and bounded semantic current-call input/output where policy allows.
- A fake model is synthetic. A metadata-only manual LLM span can be a safe
  fallback but is incomplete for behavior evaluation and must be labeled so.
- Inspect every raw provider field. Disabling generic IO is insufficient when
  invocation parameters or another field retains static prompts, accumulated
  history, schemas, files, notes, or reports.
- Use one child per executed business tool with stable name and bounded semantic
  input/output-or-error. Do not add a generic wrapper plus a duplicate business
  span.
- Inspect the raw stored kind for each root/model/tool span; a descriptive name
  or generic OpenTelemetry kind is not Judgment type evidence.
- Sanitize the final composed query, URL, plan, input summary, and result—not
  only their ingredients—and do not retain an unbounded duplicate.

Exercise a benign marker plus non-real OpenAI-style `sk-`, GitHub-style `ghp_`
and `github_pat_`, other installed-provider/API-key, authorization,
cookie/session, secret-assignment, URL-credential, and private-key canaries in
model/tool error, compaction, final output, and beyond-bound positions where
those branches exist. Search all settled raw attributes after restart and
prove serialized structured root IO remains parseable.
Include standalone `Bearer STANDALONE_BEARER_CANARY_0123456789`, standalone
`Basic QkFTSUNfQ0FOQVJZXzEyMzQ1Njc4OTA=`, and a multiline private-key block
containing an authorization line. Structure-first redaction must remove the
whole key block and standalone auth values before greedy composed-text rules.
Adjacent benign markers survive. Each serialized IO attribute is at most 1,500
UTF-8 bytes, or a lower documented destination limit, and remains valid JSON
with an explicit truncation marker when reduced.

## Export lifecycle

Use this section when the installed flush signature is unclear or a completed
pre-kill iteration is absent.

The observed iteration root must end before flush. The outer loop caller awaits
a bounded flush from `finally` on successful and failed attempts. That owner
needs no second traced iteration path: it calls the one adapter, preserves the
returned state or original exception, and then performs fail-open export.

For current TypeScript Judgeval versions, inspect whether `forceFlush` returns a
promise without a timeout and add the bound at the caller if needed. Do not
assume another SDK's signature. A flush while the root is open, detached
fire-and-forget flush, or graceful-shutdown-only flush cannot prove the last
checkpoint survives immediate kill.

Flush failure and its reporter are telemetry failures. Neither may corrupt a
saved checkpoint or replace the loop's real exception. Record the checkpoint as
trace-unverified until the completed root appears after normal exporter delay or
a successful bounded barrier.

## Mandatory real-path verification

Use the real runtime and model:

1. Start one run and record its exact persisted run ID.
2. Complete multiple iterations and at least one real tool.
3. Kill immediately after a durable checkpoint.
4. Restart and resume the same run.
5. Reach its actual terminal branch; require compaction/retry only if present.
6. Wait for ingestion and reconcile persisted completed iterations to raw roots.

Run this scenario and all valid/empty/unknown routing controls through an exact
ledger of the checked-in production launcher. Record its path/hash, command or
Compose file/service, sanitized resolved env/project/endpoint wiring,
readiness, and cleanup. If Compose is the deployed topology, host-only loop
execution is diagnostic and cannot pass.

Require one finalized root per persisted completed iteration, final semantic IO,
complete model/tool windows, exact session continuity, contiguous iteration
numbers, changed boot UUID with stable run ID, visible real branch outcomes,
useful nonduplicated tools, honest LLM metadata, raw payload safety, and the last
pre-kill root after bounded export.

Behaviors, Judges, and Tests are supplemental only. Count one when its exact
inspectable recorded result comes from this run and carries the matching
iteration trace ID; definitions, enabled configuration, or aggregate scores
without trace-linked current-run results do not count.

## Completion gate

Missing evidence is `blocked`. Compaction, finish, and retry are
`not-applicable` only if absent from the real decision union.

| Gate | Result | Evidence class | Exact evidence |
| --- | --- | --- | --- |
| Durable unit | <result> | static | Function and save event used as the iteration root boundary |
| Dependency integrity | <result> | static | Pre/post manifest and lockfile hashes/diff, frozen-lock install, and unchanged unrelated loop/runtime/provider versions |
| Checked-in launcher/deployment ledger | <result> | static + real application | Checked-in path/hash, exact command or Compose file/service, sanitized resolved config/env wiring, readiness, cleanup, and same-topology positive/empty/unknown controls; no host-only substitute |
| Routing startup and negatives | <result> | real application | Valid-target positive startup; empty and same-type unknown name/ID commands with expected errors/no readiness/no creation |
| Exact stored destination | <result> | stored Judgment | Named settled trace/probe ID in the exact intended project, with resolved-ID equality or read-only resolution recorded as the routing mechanism |
| Fresh roots | <result> | stored Judgment | Raw trace/span/empty-parent IDs distinct from start/resume |
| Trace count | <result> | stored Judgment | Persisted iteration outcomes reconciled with finalized iteration roots; separately labeled attempt roots reconciled to durable attempt records |
| Root evidence | <result> | stored Judgment | Bounded semantic IO and complete raw parent trees |
| Judgment span kinds | <result> | stored Judgment | Raw roots that perform an agent decision/phase `span_kind=agent`; orchestration/checkpoint/control/start-resume/bookkeeping roots `span_kind=function` (or named documented general equivalent); real model children `span_kind=llm`; executed tool children `span_kind=tool`; documented public APIs only |
| Strict child windows | <result> | stored Judgment | Evidence-derived timestamp precision, start/end margins for every complete iteration tree, and repeats for within-precision negatives |
| Session continuity | <result> | stored Judgment | Exact run ID on every pre/post-restart root |
| Restart survival | <result> | stored Judgment | Last pre-kill and first post-resume trace IDs |
| Process evidence | <result> | stored Judgment | Changed boot UUID with stable run/session ID |
| Decision coverage | <result> | stored Judgment | Trace IDs and semantic outcomes for every real decision-union branch |
| LLM coverage | <result> | stored Judgment | Real provider/model/token/cost attributes and trace IDs |
| Tool coverage | <result> | stored Judgment | One bounded semantic child per executed business tool |
| Error/output status parity | <result> | stored Judgment | Every durably recorded unrecovered iteration/model/tool failure has matching fixed safe output and raw `ERROR` status; recovered parent outcomes remain truthful |
| Entrypoints | <result> | stored Judgment | Separate start/resume trace IDs or genuine not-applicable reason |
| Payload safety and usefulness | <result> | stored Judgment | Named mode/order, standalone Bearer/Basic and multiline-private-key fixtures, benign/canary raw search, each serialized IO attribute <=1,500 UTF-8 bytes or lower destination cap, parseable structured IO, and inspected fields |
| Application behavior | <result> | real application | Persisted iterations and unchanged restart/retry/final-result behavior |
| Export lifecycle | <result> | stored Judgment | Pre-kill root found after bounded post-root flush and restart |
| Stored scenario proof | <result> | stored Judgment | Project, exact run session, trace IDs, and ledger reconciliation |
| Ingestion settlement | <result> | stored Judgment | Post-flush raw-read timestamps and stable span-set hashes across the named interval; complete unchanged trees and terminal IO/status |
| Test-export isolation | <result> | stored Judgment | Exact non-live commands/time window and named live-probe ledger; zero unit/stub/fake/build/typecheck/import/smoke/dev/static-generation roots in Monitoring |
| Runtime telemetry fail-open (one result per applicable subcase) | <result> | real application | Separate iteration and model/tool scope start/enter/exit, IO/attribute/status setter, sanitizer/classifier, finalizer, reporter, and flush throw/rejection/timeout injections; active-span lookup, rename, and manual span-type/kind setter only when those calls exist; model/action/save path once and unchanged; absent operations are `not-applicable` |
| Public SDK surface | <result> | static + real application | Pinned installed public API references and executable proof for span operations; no private/underscored call without its own pinned production-shaped conformance test |
| Behavior/Judge/Test results (when cited) | <result> | stored Judgment | Exact inspectable current-run result IDs linked to iteration trace IDs; definitions/configuration/aggregate scores alone do not count |
