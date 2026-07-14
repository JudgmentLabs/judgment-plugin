---
name: judgment-tracing
description: Use Judgment for agent tracing, evaluations, code judges, datasets, and monitoring. Use when integrating Judgment or judgeval, adding tracing to agents/workflows, creating evaluations or scorers, debugging traces, or looking up Judgment SDK usage and docs.
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
3. **Tracing first for integrations**: When the user asks to add Judgment to an app, start with [references/tracing.md](references/tracing.md) unless they explicitly ask for evaluations or code judges.
4. **Stay on the tracer surface**: In most cases, use Judgment's tracer, wrappers, and documented integrations directly. Do not reach into underlying provider objects or create additional wrapper layers unless the current docs require it or a real instrumentation gap remains after using the supported integration.
5. **Start small**: For evaluations, begin with a focused example set and one scorer before expanding.
6. **Use the right scorer**: Use prompt/hosted scorers for rubric-based judgment and Python code judges for deterministic logic, custom dependencies, or trace inspection.
7. **Keep credentials out of chat**: Ask the user to set `JUDGMENT_API_KEY` and `JUDGMENT_ORG_ID` locally rather than pasting secrets.
8. **Use offline agent tests before production changes**: For model, prompt, tool, or agent config changes, pull a stable dataset, collect fresh `OfflineTracer` traces for each input, then evaluate the generated offline examples in one batch. If the production agent is already traced with Judgment, leave that tracing intact and swap only the test harness initialization to `client.offline_tracer(...)`.

## Mandatory Architecture Routing

Before changing tracing code, identify the runtime and the API that marks the
real end of the work. Some architectures need requirements that are easy to
miss in the general tracing guide.

- If the application is a **Next.js Node server using the Vercel AI SDK to
  stream an agent response**, inspect the installed `ai` major version first,
  then read
  [references/tracing-nextjs-vercel-ai-streaming.md](references/tracing-nextjs-vercel-ai-streaming.md)
  completely before implementing. Its architecture-specific requirements take
  precedence over generic examples, and its completion gate is required. Do
  not claim the integration works from a build, typecheck, unit test, or
  synthetic span; verify a real production-style route and its stored trace.
  The copyable code in that reference is for AI SDK 5/6 text streams. AI SDK 7
  uses the separate `@ai-sdk/otel` / `registerTelemetry` integration described
  in the current Judgment Vercel AI SDK documentation; do not copy the 5/6
  `experimental_telemetry` setup into an AI SDK 7 application.
- If the application uses **Temporal or another durable workflow engine**, or
  can pause for human approval, timers, retries, or external signals, read
  [references/tracing-durable-workflows-temporal.md](references/tracing-durable-workflows-temporal.md)
  completely before implementing. The official Temporal interceptor connects
  OpenTelemetry spans, but it does not choose the application's meaningful
  trace boundaries for you. Do not let a short submit request become the root
  of work that continues after the request, and do not stretch one root across
  a durable suspend.

## Use Case References

- Adding or auditing tracing: [references/tracing.md](references/tracing.md)
- Next.js + Vercel AI SDK streaming:
  [references/tracing-nextjs-vercel-ai-streaming.md](references/tracing-nextjs-vercel-ai-streaming.md)
- Temporal and other durable workflows:
  [references/tracing-durable-workflows-temporal.md](references/tracing-durable-workflows-temporal.md)
- Creating evaluations and choosing scorers: [references/evaluations.md](references/evaluations.md)
- Testing agent changes with OfflineTracer: [references/agent-testing.md](references/agent-testing.md)
- Creating Python code judges: [references/code-judges.md](references/code-judges.md)
- Using Judgment docs and SDK references: [references/docs.md](references/docs.md)
