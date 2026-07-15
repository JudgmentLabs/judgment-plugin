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
8. **Use offline agent tests before production changes**: For model, prompt, tool, or agent config changes, pull a stable dataset, collect fresh `OfflineTracer` traces for each input, then evaluate the generated offline examples in one batch. If the production agent is already traced with Judgment, leave that tracing intact and swap only the test harness initialization to `client.offline_tracer(...)`.
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
11. **Fail closed only for startup routing; fail open during work**: after the
    service starts, trace-only sanitizers, classifiers, setters, root finalizers,
    reporters, and exporters must not prevent, repeat, or replace application
    work. Their failure blocks verification and remains safely observable.

## Mandatory Architecture Routing

For a generic integration request, inspect before editing:

1. dependency manifests and exact installed versions;
2. the production launcher and environment forwarding;
3. the request, worker, loop, stream, subprocess, and persistence paths; and
4. the event that proves the meaningful business work has actually finished.

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

## Six completion gates for every tracing integration

Do not report completion until all six are backed by evidence:

1. **Boundary and identity:** name the business root, its completion event,
   and the exact stable session ID. Inspect raw parentage. Require an empty
   parent when no intentional upstream context exists; with deliberate W3C or
   distributed propagation, prove the expected upstream trace/span chain and
   that the local business root still owns the complete local lifetime,
   session, and semantic IO. A short accidental framework parent is a failed
   boundary. From settled raw timestamps, compute `root_end >= max(child_end)`
   with no grace period; any positive child overrun fails the window gate.
2. **Routing:** require an explicit intended project and propagate key,
   organization, project, and every configured endpoint override to each real
   exporter process. Prove the real startup fails with the project set to an
   empty value even when dotenv files exist; an `unset` test that dotenv can
   repopulate is not evidence. No guessed fallback or silent no-op tracer.
3. **Root evidence:** the root contains safe, bounded, faithful semantic input
   and final result/error, not only metadata or omission markers. Structured
   root IO must remain parseable after platform storage clipping.
4. **Capture policy:** inspect the installed integration's actual capture
   controls. Do not use a provider wrapper that stores unapproved histories,
   files, schemas, system prompts, or secrets merely to obtain LLM metadata.
5. **Export lifecycle:** end the business root, then perform an awaited,
   bounded flush in its outer owner before the tested return/checkpoint/freeze
   boundary.
6. **Stored verification:** run a real production-style application path and
   inspect the matching stored Judgment roots for counts, root IO, windows,
   sessions, children, noise, routing, and raw payload safety. Label evidence
   as static, synthetic, real application, or stored Judgment evidence. A
   scratch span, stubbed provider, build, typecheck, or existence-only query is
   not live end-to-end verification.

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
