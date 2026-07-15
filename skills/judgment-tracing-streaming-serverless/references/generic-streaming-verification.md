# Generic Streaming Verification Table

Read this optional file only after implementing the generic finite-stream
binding contract and running real traffic. Missing evidence is `blocked`; use
`not-applicable` only when the architecture genuinely lacks a gate.

| Gate | Result | Evidence class | Exact evidence |
| --- | --- | --- | --- |
| Finite completion owner | <result> | static | Framework/version plus named terminal application event and owner |
| Dependency integrity | <result> | static | Pre/post manifest and lockfile hashes/diff, frozen-lock install, and unchanged unrelated framework/runtime/provider versions |
| Existing stream topology | <result> | static | Existing consumers/tees/backpressure and proof tracing added none |
| Routing startup and negatives | <result> | real application | Valid-target positive startup; empty and same-type unknown name/ID commands with expected errors/no readiness/no creation |
| Exact stored destination | <result> | stored Judgment | Named settled trace/probe ID in the exact intended project, with resolved-ID equality or read-only resolution recorded as the routing mechanism |
| Real terminal behavior | <result> | real application | Recorded success, error, persistence-failure, cancellation, and freeze/restart outcomes |
| Root parentage | <result> | stored Judgment | Raw trace-span-parent IDs plus expected upstream chain or empty-parent proof |
| Stored boundary/session/children | <result> | stored Judgment | Project, session/customer, root/child IDs, terminal IO, and window arithmetic |
| Strict child windows | <result> | stored Judgment | Complete parent tree, evidence-derived precision, start/end margins, and repeats for within-precision negatives |
| Root count and noise | <result> | stored Judgment | Traffic ledger reconciled to business roots; health/readback/build/smoke roots absent or separately sampled |
| LLM usefulness | <result> | stored Judgment | Real child with provider/model plus available latency/token/cost and bounded per-call semantic evidence; no history/schema/prompt bulk |
| Error/status parity | <result> | stored Judgment | Safe static ERROR status and matching terminal output for each unrecovered failure; cancellation is explicit and never fabricated success |
| Error and cancellation | <result> | stored Judgment | Raw terminal outcomes matching application results; post-abort horizon long enough for original work to finish proves no late persistence/tool side effects or names a separate detached owner |
| Payload safety and usefulness | <result> | stored Judgment | Named mode, mandatory canaries, bounds, parseable structured IO, and inspected raw attributes |
| Export lifecycle | <result> | stored Judgment | Completed root surviving the tested EOF/freeze/restart barrier |
| Runtime telemetry fail-open (one result per subcase) | <result> | real application | Root/child scope start/enter/exit, terminal-state mark/freeze/read, each setter/status/sanitizer/reporter/root-end, sync-guard async misuse, flush throw/rejection/timeout; business path once and unchanged |
| Ingestion settlement | <result> | stored Judgment | Post-flush raw read timestamps and stable span-set hashes across a named interval; complete unchanged parent tree and terminal IO |
| Test-export isolation | <result> | stored Judgment | Exact non-live commands/run/time window and stable ingestion check; zero unit/stub/fake/build/typecheck/import/smoke/dev/static-generation roots in Monitoring |
