---
name: judgment-tracing-streaming-serverless
description: Use when adding or auditing Judgment tracing for a finite streamed or deferred agent response whose work continues after response construction. Provides a generic lifecycle contract plus a version-gated Next.js Node runtime/Vercel AI SDK 5/6 streamText recipe. Its response-binding skeleton is copyable only when the application already has a proven settlement owner. WebSockets, subscriptions, and indefinite streams require a proven finite per-message completion owner.
---

# Judgment Tracing for Streaming and Serverless Agents

Inspect the installed streaming framework and version, runtime target, response
type, existing consumers/tees, persistence callbacks, and cancellation path.
Then load exactly one binding recipe before the first edit:

- Next.js **Node runtime** + Vercel AI SDK 5/6 `streamText` text response:
  `references/nextjs-ai-sdk-v5-v6-binding-recipe.md`. After dependencies are
  installed, resolve the directory containing this selected `SKILL.md`, then
  run `node <skill-directory>/scripts/inspect-ai-sdk-contract.mjs <app-root>`.
  The script is bundled with the skill, not located in the target repository.
  Retain its JSON lifecycle evidence before editing finalization code.
  The recipe's response-binding skeleton applies only when the application
  already owns a programmatic consumer/completion promise, or installed-source
  evidence proves the response reader's terminal event occurs after the outer
  AI SDK telemetry span. Do not add a consumer just to obtain that promise.
- Any other finite stream/deferred response with a proven completion owner:
  `references/streaming-lifecycle.md`.

Do not load both. AI SDK 7, Edge runtime, UI-message streams, WebSockets,
subscriptions, and indefinite streams do not match the Next.js recipe. Use the
generic contract only after identifying a finite operation and its real owner;
otherwise report the architecture `blocked` rather than copying callbacks from
another framework.

Conditionally available proof resources are directly discoverable here:

- `references/nextjs-vercel-ai-streaming.md` contains only the named Next.js
  diagnostic/proof sections routed by the binding recipe; do not load it by
  default.
- `references/generic-streaming-verification.md` is loaded only after a generic
  finite-stream implementation to assemble its final evidence table.

## Completion rule

Do not claim completion from a build, successful streamed response, callback,
scratch span, delay, or UI waterfall. Reconcile real success, tool, error,
abort, and freeze/restart outcomes with settled raw Judgment data. Report every
recipe gate as `pass`, `fail`, `blocked`, or genuinely `not-applicable`, with
evidence class `static`, `synthetic`, `real application`, or `stored Judgment`.
Missing evidence is `blocked`.
