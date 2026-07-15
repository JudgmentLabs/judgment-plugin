---
name: judgment-tracing-request-response
description: Use when adding or auditing Judgment tracing in a conventional request/response or chat agent whose meaningful work finishes before the response returns, including FastAPI, Flask, Express, or a hand-rolled OpenAI/Anthropic tool loop. Do not use for streamed or deferred responses, Temporal or other durable workflows, restartable checkpointed loops, or services wrapping an external agent CLI.
---

# Judgment Tracing for Request/Response Agents

Apply this skill only after repository inspection confirms that one request or
chat turn owns the complete unit of work. Read
[references/request-response.md](references/request-response.md) completely
before editing. Fetch the general SDK reference only for an unresolved API
question; do not load the long general tracing guide by default.

## Required model

- Use one business root per completed request or chat turn.
- Start the root after request/session validation and keep it active through
  model calls, tools, persistence, and the final application result or safe
  failure outcome.
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
4. Choose an approved sanitizer, a conservative credential/auth baseline that
   requires privacy review, or strict omission (which blocks useful root
   evidence). Sanitize before bounding. Raw canaries must cover non-real
   OpenAI-style `sk-`, GitHub-style `ghp_` and `github_pat_`, other installed
   API/provider keys, authorization, cookies/sessions, secret assignments, URL
   credentials, and private keys across input, output, error, and beyond-bound
   positions.
5. End the observed business root before running an awaited, bounded exporter
   flush in the outer request layer's `finally` path. Success and request/model
   error paths must both attempt export after the root has ended.
6. Every tool child needs a safe semantic outcome, not only a count or length.
   A caught tool failure must mark the tool child as an error with a normalized
   code while allowing the overall turn root to succeed if the agent recovered.

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
  unapproved bulk payloads while a benign semantic marker survives; and
- the final completed root survives the tested restart/termination boundary.

Report the focused reference's table with `pass`, `fail`, `blocked`, or
`not-applicable` and one evidence class: static, synthetic, real application,
or stored Judgment. Missing evidence is `blocked`.
