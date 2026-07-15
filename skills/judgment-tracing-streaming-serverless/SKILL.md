---
name: judgment-tracing-streaming-serverless
description: Use when adding or auditing Judgment tracing for a finite streamed or deferred agent response whose work continues after response construction. Provides a generic lifecycle contract, plus a copyable recipe only for Next.js Node runtime with Vercel AI SDK 5/6 streamText text responses. WebSockets, subscriptions, and indefinite streams require a proven finite per-message completion owner.
---

# Judgment Tracing for Streaming and Serverless Agents

Inspect the actual streaming framework, runtime, and installed versions. When
the real path is Next.js Node runtime with Vercel AI SDK 5/6 `streamText` text
responses, read `references/nextjs-vercel-ai-streaming.md` completely. For any
other finite stream, read `references/streaming-lifecycle.md` completely
instead and derive the installed framework's lifecycle without loading or
copying the Next.js implementation. Do not load both references by default.

## Required model

- One completed user turn is one application trace.
- The root begins before stream construction and ends only after generation,
  tools, persistence, final output, error/cancellation handling, and the
  framework telemetry completion barrier.
- Returning a response object is not the end of streamed work.
- Put the exact stable session ID and available customer ID on the active root.
- Keep business LLM/tool children inside the application root and preserve
  business tool names.

## Safe and useful root evidence

The root must retain a bounded application-owned semantic representation of
the user request and final streamed answer. Character counts plus
`omitted: no-approved-sanitizer` protect payloads but leave the trace unusable
for debugging and behaviors; that state is incomplete, not a successful
integration.

Prefer an approved sanitizer. Otherwise use a conservative credential/auth
baseline that requires privacy review, or strict omission and report semantic
usefulness blocked. Sanitize before bounding. Raw canaries must cover
API/provider keys, authorization, cookies/sessions, secret assignments, URL
credentials, and private keys across input, output, error, and beyond-bound
positions.

## Non-negotiable implementation gates

1. Require explicit project configuration and forward all routing values into
   the production standalone/serverless runtime. Prove the real launcher
   rejects an explicitly empty project even when dotenv exists.
2. Use the installed AI SDK integration that matches the version and verify
   it is a singleton in the real bundled runtime.
3. Disable uncontrolled framework/provider bulk capture. Inspect raw stored
   attributes, including provider-specific fields, rather than previews.
4. Run one idempotent completion barrier for success, model error, persistence
   error, and client abort. Await framework-child settlement before root end on
   every path. Preserve the application's existing consumer/tee
   and backpressure topology. In the supported AI SDK 5/6 recipe, the response
   is the existing consumer, so do not add `consumeStream()` as another branch.
   Do not buffer the response to simplify tracing.
5. End the root and complete an awaited, bounded flush before response EOF or
   attach export to a deployment lifecycle primitive proven by the tested
   freeze/restart behavior.

## Completion gate

Run the real production-style route with normal, tool, error, abort, and
cold-start/restart turns. Stored Judgment evidence must prove:

- one finalized root per completed turn and no extra health/readback roots;
- root input/output remains semantically useful and matches the final turn;
- all generation/tool children fit inside the root window;
- exact session/customer identity survives restart;
- pre-restart and first post-restart roots both arrive completely;
- cancellation stops upstream work, prevents late success/tool-call
  persistence unless the app explicitly owns detached completion, and records
  the correct root outcome;
- explicit routing reaches the intended existing project; and
- in approved/conservative mode, a benign canary survives while exercised
  credential/auth canaries, file bodies, tool schemas, and long history do
  not; in strict-omission mode, all free text is absent and usefulness remains
  explicitly blocked.

Report the focused reference's table with `pass`, `fail`, `blocked`, or
`not-applicable` and one evidence class: static, synthetic, real application,
or stored Judgment. Missing evidence is `blocked`.
