---
name: judgment-tracing-streaming-serverless
description: Use when adding or auditing Judgment tracing for a streamed or deferred agent response in Next.js, Vercel, a serverless or lambda runtime, or the Vercel AI SDK (`streamText`, `toTextStreamResponse`, `onFinish`). Covers full-stream root lifetime, cold starts, provider/tool telemetry, cancellation, persistence, and export-before-freeze.
---

# Judgment Tracing for Streaming and Serverless Agents

Inspect the installed `ai` package major version, then read
`../judgment-tracing/references/tracing-nextjs-vercel-ai-streaming.md`
completely. Do not copy the AI SDK 5/6 recipe into AI SDK 7.

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

Use an existing approved application sanitizer or an explicitly configured
product policy before bounding a preview. Do not invent a starter regex and
call it approved. If no policy exists, fail closed on unapproved text, report
the usefulness blocker plainly, and do not claim completion until a policy
owner supplies the narrow semantic fields that may be retained.

## Non-negotiable implementation gates

1. Require explicit project configuration and forward all routing values into
   the production standalone/serverless runtime.
2. Use the installed AI SDK integration that matches the version and verify
   it is a singleton in the real bundled runtime.
3. Disable uncontrolled framework/provider bulk capture. Inspect raw stored
   attributes, including provider-specific fields, rather than previews.
4. Run one idempotent completion barrier for success, model error, persistence
   error, and client abort. Do not buffer the response to simplify tracing.
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
- cancellation stops upstream work and records the correct root outcome;
- explicit routing reaches the intended existing project; and
- a benign canary survives the approved sanitizer while secrets, file bodies,
  tool schemas, long history, and arbitrary unapproved markers do not.

If any check is synthetic or unavailable, label it that way instead of calling
the integration verified.
