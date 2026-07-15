# Persistent Agent CLI Wrapper Deep Reference

This file is optional. `cli-wrapper-binding-recipe.md` is the only
implementation recipe. Read only the section named by `../SKILL.md` after its
condition is detected. These sections provide diagnostics and proof criteria,
not a second copyable wrapper implementation.

## Contents

- [The first-turn identity problem](#the-first-turn-identity-problem)
- [Inner agent spans](#inner-agent-spans)
- [Export lifecycle](#export-lifecycle)
- [Mandatory real-path verification](#mandatory-real-path-verification)
- [Completion gate](#completion-gate)

## The first-turn identity problem

Use this section when the CLI session is unknown until return, a decorator ends
too early, or raw exceptions are serialized before application handling.

The wrapper and underlying CLI have different identities. Keep the wrapper ID
as a safe attribute; use the CLI session returned by the first invocation as
`judgment.session_id`. The first-turn root remains active through result parsing
so that ID can be assigned before root end. On resume, attach the persisted CLI
ID before invocation and prove it exactly matches the resume argument.

One outcome boundary covers business/session validation, CLI execution,
returned-ID parsing, mapping persistence, turn persistence, and construction of
the actual response. Transport auth and shape validation stay outside so an
untrusted prompt is not captured. Invalid wrapper-session roots use metadata-
only safe IDs and normalized error output. A first-turn failure cannot invent a
CLI session; a resumed failure keeps the already-persisted CLI session.

The root's stored span kind must be `agent`; the aggregate CLI invocation
child's stored span kind must be `tool`. Set both explicitly through the
installed public SDK while the intended span is current. For the honest
wrapper baseline, also set the app-defined root attribute
`instrumentation.coverage=wrapper_only`. A descriptive span name such as
`agent_cli.invoke` does not prove any of these properties.

Disable automatic IO. Guard trace setters and safe classifiers. Success is
recorded only after mapping/persistence and final reply succeed. Nonzero exit,
timeout, launch failure, parse failure, persistence failure, and response
failure record matching normalized categories on root and CLI child where
applicable. Keep the original exception in memory, end the observed root, then
preserve the existing handler's rethrow/recovery behavior.

## Inner agent spans

Use this section only when a real documented hook, stream JSON, OTel, or native
source exists and stronger-than-wrapper coverage is in scope.

Stock `claude -p --output-format json` proves final result and session metadata,
not inner LLM/tool timing. The aggregate `agent_cli.invoke` child is an honest
wrapper baseline. Do not synthesize inner spans or silently count it as full
wrapped-agent tracing.

For linked or nested inner evidence:

- name the source and reconcile every record to the wrapper turn;
- normalize clocks so no inner child starts before the root;
- keep the root open or update it last after all intended records and final IO;
- preserve real model/token/cost and business tool identity;
- deduplicate identical events from multiple sources; and
- model independently useful subagents as linked traces when supported.

If the source is unavailable, wrapper-baseline gates may pass while linked/full
coverage is `blocked`, never `not-applicable`.

## Export lifecycle

Use this section when the installed flush signature is unclear or a completed
pre-restart task is missing.

The wrapper business root must end before export. The outer route validates
transport auth/shape, calls the single business outcome adapter, then awaits a
flush with a real outer wall-clock deadline from `finally` before
returning/rethrowing at the tested restart checkpoint. An SDK timeout argument
alone is not that deadline: the Python SDK may apply it sequentially to several
exporters. Use the binding recipe's single-flight worker so a timed-out
synchronous flush cannot accumulate threads. Do not add a second traced error
path or flush while the root is open. Match `force_flush`/`forceFlush` to the
installed SDK and choose the deadline from the application's latency budget.

The flush helper and reporter remain fail-open. Export failure blocks the
tracing claim but cannot replace a valid reply, change a nonzero/timeout result,
or replace the original exception. Raw stderr, command text, environment, and
exception messages never enter a trace setter.

For deliberate restart, do not stop the wrapper until the bounded attempt
succeeds or the failed-export evidence is recorded as blocking. Then prove the
last pre-restart and first post-restart task roots both arrived.

## Mandatory real-path verification

Use two independent real CLI sessions:

1. Record each wrapper ID and returned CLI session ID.
2. Finish and boundedly export both first-turn roots.
3. Restart the wrapper.
4. Resume both using their persisted CLI IDs.
5. Exercise a tool-producing task when practical.
6. Safely exercise every named subcase in the binding recipe's complete edge
   matrix; each gets its own injection/result and each untriggered subcase is
   independently `blocked`.
7. Run empty-project and same-type unknown-name/ID launcher checks plus a valid
   positive control; prove expected errors, no readiness, and no project creation.
8. Prove every non-live unit/stub/fake/build/typecheck/import/smoke/dev/static-
   generation command exported zero unexplained live roots.
9. Query exact CLI sessions after ingestion and inspect raw roots/children.

Require one finalized nonzero-duration business root per task, truthful
semantic prompt/reply or normalized error, exact CLI session grouping, separate
independent sessions, raw child-window arithmetic, intended project/endpoint routing, no
health/read noise, full raw payload safety, and real evidence for every claimed
inner span. Fake auth/mode or a successful HTTP response is synthetic only.

## Completion gate

Use `not-applicable` only when the architecture genuinely lacks a gate. Missing
evidence is `blocked`; fake CLI and scratch spans are synthetic.

| Gate | Result | Evidence class | Exact evidence |
| --- | --- | --- | --- |
| Trace unit | <result> | static | Business function covers validation, CLI, mapping, persistence, and response |
| Dependency integrity | <result> | static | Pre/post manifest and lockfile hashes/diff, frozen-lock install, and unchanged unrelated wrapper/runtime/CLI versions |
| Routing startup and negatives | <result> | real application | Valid-target positive startup; empty and unknown name/ID commands with expected errors/no readiness/no creation |
| Exact stored destination | <result> | stored Judgment | Named settled trace/probe ID in the exact intended project, with resolved-ID equality or read-only resolution recorded as the routing mechanism |
| Root parentage | <result> | stored Judgment | Wrapper/CLI/inner raw IDs plus expected upstream chain or empty-parent proof |
| Root IO | <result> | stored Judgment | Structure-first prompt/reply projection, serialized payloads no larger than 1,500 bytes, a parseable `_judgment_truncation` marker when clipped, or metadata-only invalid-session input plus normalized output |
| Canonical session | <result> | stored Judgment | Returned/resumed CLI session on every applicable root |
| Resume continuity | <result> | stored Judgment | Pre/post-restart trace IDs sharing the exact CLI session |
| Span kinds and wrapper-only label | <result> | stored Judgment | Raw root `span_kind=agent`, aggregate CLI child `span_kind=tool`, and app-defined root `instrumentation.coverage=wrapper_only`; names are not evidence |
| CLI child | <result> | stored Judgment | Mode, resume, exit/duration, and bounded outcome/error |
| Invalid-input privacy | <result> | stored Judgment | Unchanged transport outcome, metadata-only root input, matching fixed `invalid_session` output/raw `ERROR` status, no CLI child |
| CLI-owned status parity (one result per subcase) | <result> | stored Judgment | Separate nonzero, timeout, launch, empty, malformed, missing-result, and missing-first-session trace IDs with matching fixed safe root/child output codes and raw `ERROR` statuses; no stderr/raw exception |
| Pre-CLI state failure | <result> | stored Judgment | Session lookup/create/state and unexpected-pre-CLI injections with matching fixed safe root output/raw `ERROR` status, no CLI child, and unchanged transport behavior |
| Post-CLI failure ownership (one result per subcase) | <result> | stored Judgment | Separate returned-ID mapping, turn-persistence, response-serialization, and unexpected-post-CLI traces with matching fixed safe root output/raw `ERROR` status and truthful successful child |
| Runtime telemetry fail-open (one result per subcase) | <result> | real application | Separate wrapper-root start/enter/exit, CLI-child start/enter/exit, each setter, root sanitizer, root classifier, child sanitizer, child classifier, reporter, finalizer, synchronous flush throw, async rejection where applicable, and timeout injections leave the CLI/business path single-run and behavior unchanged; child scope failure does not overwrite parent |
| Strict child window | <result> | stored Judgment | Normalized root/child start and end margins, evidence-derived stored precision, and repeats for within-precision negatives |
| Test-export isolation | <result> | stored Judgment | Exact non-live commands/time window and named live probe ledger; zero unit/stub/fake/build/typecheck/import/smoke/dev/static-generation pollution |
| Noise | <result> | stored Judgment | Business-root count versus health/session/ASGI roots |
| Payload safety and usefulness | <result> | stored Judgment | Named mode; exact composed private-key + auth-header, standalone Bearer/Basic, camelCase `httpAuthorization=Basic ...`, URL/query/cookie/token canary fixtures; adjacent benign-marker survival; raw search; no payload over 1,500 serialized bytes; parseable structured IO and truncation marker; inspected fields |
| Real wrapper behavior | <result> | real application | Two real sessions, resume mapping, restart, replies, and exercised failure |
| Observability level | <result> | static | Wrapper/linked/full target and named inner source; wrapper baseline is explicitly labeled `instrumentation.coverage=wrapper_only` |
| Inner coverage | <result> | stored Judgment | Actual LLM/tool/subagent IDs; unavailable stronger source is blocked |
| Export lifecycle | <result> | stored Judgment | Last pre-restart and first post-restart roots after bounded flush |
| Stored scenario proof | <result> | stored Judgment | Project, CLI sessions, trace IDs, and reconciliation to requests/results |
| Ingestion settlement | <result> | stored Judgment | Post-flush raw-read timestamps and stable span-set hashes across the named interval; complete unchanged trees and terminal IO/status |
