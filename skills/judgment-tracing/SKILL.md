---
name: judgment-tracing
description: Route Judgment and judgeval work, including adding, auditing, or debugging tracing in unfamiliar codebases. Use this first for generic requests such as "Add Judgment tracing to this agent" when the agent architecture is not yet known; inspect the real execution path, then load the matching architecture-specific Judgment tracing skill. Also use for Judgment evaluations, code judges, datasets, monitoring, and SDK or documentation lookup.
allowed-tools:
  - WebFetch(domain:docs.judgmentlabs.ai)
  - Bash(curl *docs.judgmentlabs.ai/*)
---

# Judgment

This skill helps you use Judgment effectively across common agent development workflows: instrumenting applications, evaluating outputs, creating code judges, and looking up current Judgment docs.

## Core Principles

Follow these principles for all Judgment work:

1. **Docs first**: Fetch current Judgment docs and refer to reference files before implementing SDK patterns from memory.
2. **Instrument the real path**: Add tracing to the functions, tools, and LLM calls the app actually executes.
3. **Route tracing integrations first**: When the user asks to add Judgment to an app, inspect the real execution path and invoke the matching focused tracing skill before editing. Do not automatically load the long general tracing reference for an architecture handled by a focused skill.
4. **Use supported integrations conditionally**: Prefer Judgment's documented
   integration only after checking the installed version's capture controls.
   If it cannot disable unapproved histories, files, schemas, prompts, or
   secrets, use safe manual spans supported by that version or report the
   coverage blocked. Metadata convenience never overrides payload safety.
5. **Start small**: For evaluations, begin with a focused example set and one scorer before expanding.
6. **Use the right scorer**: Use prompt/hosted scorers for rubric-based judgment and Python code judges for deterministic logic, custom dependencies, or trace inspection.
7. **Keep credentials out of chat**: Ask the user to set `JUDGMENT_API_KEY` and `JUDGMENT_ORG_ID` locally rather than pasting secrets.
8. **Use offline agent tests before production changes**: For model, prompt,
   tool, or agent config changes, pull a stable dataset, collect fresh named
   `OfflineTracer` traces for each input, then evaluate the generated offline
   examples in one batch. This harness may intentionally export only to offline
   trace storage and must create zero live Monitoring roots. It is distinct from
   ordinary unit/stub/fake tests, which remain in-memory/no-export. If the
   production agent is already traced with Judgment, leave that tracing intact
   and swap only the test harness initialization to `client.offline_tracer(...)`.
9. **Trace agent work, not readback noise**: By default, exclude health checks,
   status polling, and read-only session/transcript inspection endpoints. A test
   client calling `GET /sessions/{id}` to verify state does not make that read a
   meaningful agent trace.
10. **Make roots safe and useful**: From `judgment.input` and
    `judgment.output` on the root alone, a reviewer must be able to understand
    what business work was requested and what result or error was produced.
    IDs, status, counts, lengths, hashes, paths, and omission markers are
    supporting metadata; by themselves they do not make faithful root IO when
    meaningful business content exists. Child spans do not repair a
    behavior-blind root.
11. **Fail closed only for startup routing; fail open during work**: before
    readiness, prove the configured project resolves to the intended existing
    project — compare the resolved identity with a pinned expected project ID
    or prove a uniquely named live probe settled there. A nonempty value or
    no-op tracer is not proof. After startup, every trace-only operation
    (payload preparation, active-span lookups, setters, finalizers, reporters,
    exporters) must not prevent, repeat, or replace application work; its
    failure blocks verification and stays safely observable.
12. **Keep non-live tooling offline**: run every unit/stub/fake test, build,
    typecheck, import check, smoke/dev launcher, and scratch probe in a fresh
    process with all export-capable Judgment/Judgeval/OTel credentials and
    exporter headers explicitly overridden empty before any app/SDK import,
    plus `OTEL_SDK_DISABLED=true` where supported — or inject a proven
    no-export tracer. Merely unsetting lets dotenv refill values, clearing
    after import is too late, and `setdefault` preserves a developer's live
    environment. Only named end-to-end probes may write to a shared project.
13. **Validate the selected checked-in deployment, not a substitute**: write a
    launcher ledger before editing — the exact operator command, every
    process/container that can export, and where each required `JUDGMENT_*`
    value crosses that boundary. If the topology uses Compose/Kubernetes/a
    process manager, a direct host-run server is diagnostic evidence only and
    cannot pass the launcher gate. Exercise the selected launcher in valid,
    explicitly empty, and unique-unknown project modes.

## Mandatory Architecture Routing

For a generic integration request, inspect before editing:

1. dependency manifests and exact installed versions;
2. the production launcher and environment forwarding;
3. the request, worker, loop, stream, subprocess, and persistence paths; and
4. the event that proves the meaningful business work has actually finished.

Before changing dependencies, record manifest/lockfile hashes and exact relevant
runtime/framework/provider versions. Add only the required tracing dependency
with the repository's existing package manager, run its frozen-lock install,
then record the diff, hashes, and versions again. Do not upgrade the target
stack to make instrumentation easier; unexplained unrelated churn blocks the
integration.

Write down four internal answers: what triggers the work, what proves it
finished, which durable ID groups related work, and what happens on retry,
restart, suspend, or resume.

Also write a launcher ledger before the first edit: exact production command,
readiness owner, exporter processes/containers, required configuration keys,
and the checked-in file that forwards each key. For Compose, inspect
`docker compose config` using the same env-file/flags as production and require
the resolved service configuration to contain every required forwarding path.
Do not replace this with a direct host launch.

Then invoke exactly one primary focused skill before the first edit **when the
real completion owner matches a supported row below**. In Claude Code, use the
Skill tool with the namespaced name shown below. In Codex, invoke the
corresponding `$skill-name`. If nested skill invocation is unavailable, read
that sibling skill's `SKILL.md` completely.

| Evidence in the real execution path | Focused skill |
|---|---|
| One request/chat turn finishes all work before returning | `judgment:judgment-tracing-request-response` |
| Temporal or another durable workflow owns work after submission, signals, timers, approval, retries, or replay | `judgment:judgment-tracing-durable-workflows` |
| A streamed/deferred response starts before generation, callbacks, persistence, or export finish | `judgment:judgment-tracing-streaming-serverless` (use its generic lifecycle contract; copy its implementation only for the explicitly supported framework/version) |
| A long-running decision loop saves checkpoints and resumes after process death | `judgment:judgment-tracing-checkpointed-loops` |
| A service invokes an external agent CLI and persists its returned session ID for resume | `judgment:judgment-tracing-cli-wrappers` |

If none of these five completion models fits—for example a queue consumer,
multi-agent graph, or cron/batch worker—do not force it into the nearest
bucket. For a streaming framework/version without a copyable recipe, the
streaming specialist still supplies the lifecycle contract, but requires a
framework-specific implementation and proof rather than speculative code. Read
[references/tracing.md](references/tracing.md), derive the boundary from the
real completion owner, and report that architecture-specific guidance is
unsupported or blocked. A guessed specialist is not successful routing.

WebSockets, subscriptions, and indefinite streams remain unsupported unless
the application proves a finite per-message/per-operation completion owner. In
that case route the finite operation to the streaming lifecycle contract, not
the connection lifetime.

The component that owns completion wins. A FastAPI submit route in front of a
Temporal workflow is a durable-workflow architecture. A FastAPI route invoking
`claude -p --resume` is a CLI-wrapper architecture. Load a second focused skill
only when the same real path genuinely combines both lifecycles; explain which
requirements come from each. Specialists must not invoke this router again.

Do not infer architecture from a dependency name alone. Confirm that the
production path actually uses it.

## Seven completion gates for every tracing integration

Do not report completion until all seven are backed by evidence:

1. **Boundary and identity:** name the business root, its completion event,
   and the exact stable session ID. Inspect raw parentage. Require an empty
   parent when no intentional upstream context exists; with deliberate W3C or
   distributed propagation, prove the expected upstream trace/span chain and
   that the local business root still owns the complete local lifetime,
   session, and semantic IO. A short accidental framework parent is a failed
   boundary. Normalize timestamp/duration units and derive stored timestamp
   precision from raw values or documented platform resolution; do not choose a
   convenient tolerance. Compute `start_margin = min(child_start) - root_start`
   and `end_margin = root_end - max(child_end)`. Each margin `>= 0` passes;
   `-precision < margin < 0` is `blocked`/inconclusive and must be repeated;
   `margin <= -precision` fails. Never silently round a negative margin to a
   pass. Require the documented Judgment span type/kind for each business root,
   LLM call, and tool call when the installed SDK exposes it; a generic span is
   not equivalent merely because its name says `agent` or `tool`.
2. **Routing:** require an explicit intended project and propagate key,
   organization, project, and endpoint overrides to each real exporter
   process. Fail readiness when the returned tracer/client has no resolved
   project identity, export is disabled, or the identity differs from the
   pinned expected project ID; without a comparable ID, a uniquely named live
   probe must settle in the exact intended project. Prove real startup fails
   with the project explicitly empty and with a unique unknown name/ID of the
   accepted type (an `unset` that dotenv can repopulate is not evidence). If
   name-based init can create projects, resolve through a read-only lookup
   first. All three controls use the exact checked-in launcher — for Compose,
   record the resolved `docker compose config` forwarding and start the real
   services; a host-only server or alternate command does not substitute.
   Dependency changes require pre/post manifest/lockfile hashes, a frozen-lock
   install, and unchanged unrelated versions.
3. **Root evidence:** after successful validation, the root contains safe,
   bounded, faithful semantic input and final result/error, not only metadata or
   omission markers. For rejected or untrusted input, follow the focused
   contract's metadata-only rule and do not copy the rejected content. Structured
   root IO must remain parseable after platform storage clipping. For every
   exercised failure or recovery, raw OpenTelemetry status and safe terminal
   `judgment.output` must agree on each owning span. Error-shaped output on an
   OK/UNSET owner fails; after genuine recovery the child remains ERROR while
   the successfully recovered parent may remain successful.
4. **Capture policy:** inspect the installed integration's actual capture
   controls; never use a provider wrapper that stores unapproved histories,
   files, schemas, prompts, or secrets merely to obtain LLM metadata. Project
   approved fields, sanitize (multiline/private-key removal before broad
   single-line rules; test the complete ordered sanitizer, not each regex
   alone), then cap each complete input/output value at 1,500 UTF-8 bytes
   after the exact installed SDK serializer, parseable, with a
   `_judgment_truncation` object when reduced. The selected specialist's
   canary matrix is the proof standard; the business/session ID goes through
   the dedicated identity setter, outside payload sanitization.
5. **Export lifecycle:** end the business root, then perform an awaited,
   bounded flush in its outer owner before the tested return/checkpoint/freeze
   boundary.
6. **Runtime telemetry isolation:** inject independent failures into every
   telemetry-only operation actually used — scope start/enter/exit, setters,
   active-span lookups, sanitizer/classifier, reporter, finalizer, flush
   throw/rejection/timeout. Every such operation, including the lookup that
   obtains a span, executes inside the fail-open guard. Each subcase proves
   the application path runs exactly once with response, persistence,
   cancellation, retry, latency, and original exceptions preserved; a group
   never passes because one member passed. No private/underscored SDK APIs
   without a pinned version plus an executable contract test.
7. **Stored verification:** run a real production-style path and inspect the
   matching stored Judgment roots for counts, root IO, windows, sessions,
   children, noise, routing, and raw payload safety. Label evidence static,
   synthetic, real application, or stored Judgment; a scratch span, stubbed
   provider, build, or existence-only query is not live verification. After
   the awaited flush, poll raw data until the tree, span-ID set, parentage,
   and terminal IO are unchanged across a named stability interval; record
   read timestamps and a span-set hash. A Behavior, Judge, or Test counts only
   with exact inspectable current-run result rows linked to this run's trace
   IDs — zero results or a configured judge is never a pass.

Report these gates using `pass`, `fail`, `blocked`, or `not-applicable` and one
evidence class: static, synthetic, real application, or stored Judgment. The
routed guide supplies its architecture-specific rows.

## Use Case References

- Adding or auditing tracing: [references/tracing.md](references/tracing.md)
- Copyable fail-open, payload, parentage, launcher, and evidence patterns for a
  generic/unsupported architecture when those risks are present:
  [references/instrumentation-safety-and-evidence.md](references/instrumentation-safety-and-evidence.md)
- Creating evaluations and choosing scorers: [references/evaluations.md](references/evaluations.md)
- Testing agent changes with OfflineTracer: [references/agent-testing.md](references/agent-testing.md)
- Creating Python code judges: [references/code-judges.md](references/code-judges.md)
- Using Judgment docs and SDK references: [references/docs.md](references/docs.md)
