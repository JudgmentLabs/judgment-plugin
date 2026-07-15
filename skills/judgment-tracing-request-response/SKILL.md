---
name: judgment-tracing-request-response
description: Use when adding or auditing Judgment tracing in a conventional request/response or chat agent whose meaningful work finishes before the response returns, including FastAPI, Flask, Express, or a hand-rolled OpenAI/Anthropic tool loop. Do not use for streamed or deferred responses, Temporal or other durable workflows, restartable checkpointed loops, or services wrapping an external agent CLI.
---

# Judgment Tracing for Request/Response Agents

Apply this skill only after repository inspection confirms that one request or
chat turn owns the complete unit of work. Read
`../judgment-tracing/references/tracing.md` completely before editing.

## Required model

- Use one business root per completed request or chat turn.
- Start the root after validation and keep it active through model calls,
  tools, persistence, and the final application result.
- Put a bounded, faithful representation of the user trigger and final result
  on that root. Status, counts, hashes, or character lengths alone are not a
  substitute when the work produced a meaningful result.
- Set the application conversation or interaction ID as
  `judgment.session_id` after the root is active.
- Nest business-named LLM and tool spans. Do not trace health, status, or
  read-only session endpoints by default.

## Non-negotiable implementation gates

1. Require an explicit intended project. Do not invent an example-project
   fallback and do not silently disable export when it is missing.
2. Propagate the key, organization, project, and every configured endpoint
   override into the process that actually serves the request.
3. Inspect the installed provider wrapper before using it. If automatic model
   payload capture cannot be disabled and calls may contain history, files,
   schemas, system prompts, or secrets, use a version-supported manual LLM
   span with automatic IO disabled or report privacy-safe LLM coverage as
   blocked.
4. Use application-owned sanitized semantic summaries. Truncation is only a
   size bound; it is not redaction. Omit-only metadata is safe but incomplete
   when it prevents a maintainer or behavior from understanding the request
   and result.
5. End the observed business root before running an awaited, bounded exporter
   flush in an outer request layer. A detached or in-root flush does not prove
   final-root export.

## Completion gate

Do not report the integration complete until a real application path—not a
stub, unit test, scratch span, or synthetic provider—has been run and the
stored Judgment evidence proves:

- exactly one finalized root per expected business request;
- root input/output matches the real trigger/result semantically;
- every child starts and ends inside the root window;
- exact session IDs group turns across an exercised restart;
- expected LLM/tools and error paths are visible without readback noise;
- explicit routing reaches the intended existing project;
- raw attributes exclude secrets, histories, schemas, files, and other
  unapproved bulk payloads; and
- the final completed root survives the tested restart/termination boundary.

Label each verification claim as static, synthetic, real application, or
stored Judgment evidence. Never call a synthetic or existence-only check
“verified live.”
