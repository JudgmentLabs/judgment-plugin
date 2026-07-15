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
    project; a nonempty configured value or nonempty resolved ID alone does not
    prove that it is the intended target, and a no-op tracer is still a routing
    failure. Compare the resolved identity with a pinned expected project ID or
    prove a uniquely named live probe settled in that exact project. After
    startup, trace-only sanitizers, classifiers, setters, root
    finalizers, reporters, and exporters must not prevent, repeat, or replace
    application work. Their failure blocks verification and remains safely
    observable.
12. **Keep non-live tooling offline**: start unit/stub/fake tests, builds,
    typechecks, static-import checks, smoke/dev launchers, and scratch probes in a fresh
    process with all export-capable Judgment/Judgeval/OTel credentials and
    exporter headers explicitly overridden empty before any app/SDK import, and
    set `OTEL_SDK_DISABLED=true` where supported; or inject a proven
    in-memory/no-export tracer. If app validation requires a project string, use
    an obviously synthetic value such as `unit-tests-no-export` only after
    proving the initialized exporter is disabled. Merely unsetting variables can
    let dotenv refill them, clearing after SDK import is too late, and
    `setdefault` preserves a developer's live environment. Only named
    end-to-end probes may write to a shared Judgment project.

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
   pass.
2. **Routing:** require an explicit intended project and propagate key,
   organization, project, and every configured endpoint override to each real
   exporter process. Inspect the installed SDK and fail readiness when its
   returned tracer/client has no resolved project identity, monitoring/export
   is disabled, or the resolved identity differs from the pinned intended
   project ID. If startup cannot compare identities, a uniquely named live
   probe must settle in the exact intended project before routing passes. Prove
   the real startup fails both with the project explicitly empty and with a
   unique unknown project name or ID of the same type the launcher accepts,
   even when dotenv files exist; an `unset` test that dotenv can repopulate is
   not evidence. No guessed fallback, implicit project creation, or silent
   no-op tracer. Inspect resolution semantics first: if name-based SDK
   initialization can create projects, resolve through a read-only lookup and
   reject the unknown value before calling that creation-capable path.
   If instrumentation changes dependencies, require pre/post manifest and
   lockfile hashes, a frozen-lock install, and proof that unrelated application,
   framework, workflow, provider, and CLI versions did not change.
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
   controls. Do not use a provider wrapper that stores unapproved histories,
   files, schemas, system prompts, or secrets merely to obtain LLM metadata.
   Controlled canaries must include `JUDGMENT_API_KEY=`,
   `AWS_SECRET_ACCESS_KEY=`, `X-Api-Key`, `Authorization: ApiKey`,
   `Authorization: Digest`, `Proxy-Authorization: Custom`,
   `HTTP_AUTHORIZATION=`, camelCase/prefixed secret-token-password keys, and
   cookie/session-token forms in structured, serialized, assignment, error, and
   beyond-bound positions. The canonical business/session ID belongs in the
   dedicated Judgment identity setter, outside payload sanitization.
5. **Export lifecycle:** end the business root, then perform an awaited,
   bounded flush in its outer owner before the tested return/checkpoint/freeze
   boundary.
6. **Runtime telemetry isolation:** safely inject independent failures into
   business-root and important-child scope start/enter/exit, every trace setter,
   sanitizer/classifier, reporter, finalizer, synchronous flush throw, async
   flush rejection, and flush timeout that the runtime supports. For each named
   subcase, prove the original application path runs exactly once and preserves
   response, persistence, cancellation, retry, and original-exception behavior.
   Never pass a group because one member passed; unexercised cases are blocked.
7. **Stored verification:** run a real production-style application path and
   inspect the matching stored Judgment roots for counts, root IO, windows,
   sessions, children, noise, routing, and raw payload safety. Label evidence
   as static, synthetic, real application, or stored Judgment evidence. A
   scratch span, stubbed provider, build, typecheck, or existence-only query is
   not live end-to-end verification. After the awaited flush, poll raw data
   until the expected root/parent tree is complete and the trace/span ID set,
   parentage, and terminal root IO are unchanged across a named stability
   interval appropriate to the exporter. Record read timestamps and a span-set
   hash; a missing parent or changing set remains blocked.

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
