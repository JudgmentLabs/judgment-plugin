# Generic Streaming Verification Table

Read this optional file only after implementing the generic finite-stream
binding contract and running real traffic. Missing evidence is `blocked`; use
`not-applicable` only when the architecture genuinely lacks a gate.

| Gate | Result | Evidence class | Exact evidence |
| --- | --- | --- | --- |
| Finite completion owner | <result> | static | Framework/version plus named terminal application event and owner |
| Dependency integrity | <result> | static | Pre/post manifest and lockfile hashes/diff, frozen-lock install, and unchanged unrelated framework/runtime/provider versions |
| Existing stream topology | <result> | static | Existing consumers/tees/backpressure and proof tracing added none |
| Exact deployment/launcher | <result> | static + real application | Checked-in command/script and artifact, plus Compose file/service/profile/env-file when used by the selected topology; for a selected Compose topology, rendered `docker compose config` proves every required `JUDGMENT_*` value reaches the service, and that exact Compose path—not a host-only standalone server—runs the real scenario |
| Routing startup and negatives | <result> | real application | Valid-target positive startup plus explicitly empty and same-type unknown name/ID controls through the exact checked-in deployment path, with expected errors/no readiness/no creation |
| Exact stored destination | <result> | stored Judgment | Named settled trace/probe ID in the exact intended project, with resolved-ID equality or read-only resolution recorded as the routing mechanism |
| Public/version-proven SDK surface | <result> | static + real application | Public instrumentation APIs, or exact lockfile pin plus executable production-bundle coverage for each private/underscored API; otherwise blocked |
| Real terminal behavior | <result> | real application | Recorded success, error, persistence-failure, cancellation, and freeze/restart outcomes |
| Root parentage | <result> | stored Judgment | Raw trace-span-parent IDs plus expected upstream chain or empty-parent proof |
| Stored boundary/session/children | <result> | stored Judgment | Project, session/customer, root/child IDs, terminal IO, and window arithmetic |
| Strict child windows | <result> | stored Judgment | Complete parent tree, evidence-derived precision, start/end margins, and repeats for within-precision negatives |
| Root count and noise | <result> | stored Judgment | Traffic ledger reconciled to business roots; health/readback/build/smoke roots absent or separately sampled |
| LLM usefulness | <result> | stored Judgment | Real child with provider/model plus available latency/token/cost and bounded per-call semantic evidence; no history/schema/prompt bulk |
| Judgment span kinds | <result> | stored Judgment | Raw root `span_kind=agent`, executed business tools `span_kind=tool`, and supported real model spans `span_kind=llm`; a name alone is not evidence, and unavailable public model binding remains blocked rather than faked |
| Error/status parity | <result> | stored Judgment | Safe static ERROR status and matching terminal output for each unrecovered failure; cancellation is explicit and never fabricated success |
| Disconnect and application outcome | <result> | real application + stored Judgment | Uninstrumented policy comparison plus raw transport-disconnect evidence distinct from the final application result; existing upstream-cancel or detached-completion/persistence ownership is preserved |
| Error and cancellation | <result> | stored Judgment | Raw terminal outcomes matching application results; where the app cancels, a post-abort horizon proves no late persistence/tool side effects; where existing detached work continues, its final result and owner are recorded without fabricated cancellation |
| Payload safety and usefulness | <result> | stored Judgment | Named mode; standalone Bearer/Basic, multiline-private-key-first, composed-pipeline, multibyte-Unicode, and escape-heavy canaries; every final serialized attribute is <=1,500 UTF-8 bytes and parseable in raw storage |
| Application/framework settlement | <result> | real application | Existing owner awaits the real settlement promise to its actual outcome outside every telemetry deadline; a slow-settlement fixture proves the <=500 ms trace budget cannot race, truncate, or detach it |
| Export lifecycle | <result> | stored Judgment | Completed root surviving the tested EOF/freeze/restart barrier |
| EOF/flush latency parity | <result> | real application | Matched uninstrumented/instrumented EOF and disconnect timings per terminal path; tracing overhead stays within the recorded application SLO or the default <=500 ms budget |
| Runtime telemetry fail-open (one result per subcase) | <result> | real application | Root/child scope start/enter/exit, active-span lookup, rename, terminal-state mark/freeze/read, each setter/status/sanitizer/reporter/root-end, sync-guard async misuse, flush throw/rejection/timeout; a repeated-request hung-flush injection proves one process-wide exporter call plus observable busy/blocked results; business path once and unchanged |
| Ingestion settlement | <result> | stored Judgment | Post-flush raw read timestamps and stable span-set hashes across a named interval; complete unchanged parent tree and terminal IO |
| Behavior/Code Judge evidence | <result> | stored Judgment | Exact settled trace ID, Behavior/Judge version, result ID, and inspected result payload; zero/missing results are blocked, never inferred green |
| Test-export isolation | <result> | stored Judgment | Exact non-live commands/run/time window and stable ingestion check; zero unit/stub/fake/build/typecheck/import/smoke/dev/static-generation roots in Monitoring |
