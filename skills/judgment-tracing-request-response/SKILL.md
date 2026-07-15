---
name: judgment-tracing-request-response
description: Use when adding or auditing Judgment tracing in a conventional request/response or chat agent whose meaningful work finishes before the response returns, including FastAPI, Flask, Express, or a hand-rolled OpenAI/Anthropic tool loop. Do not use for streamed or deferred responses, Temporal or other durable workflows, restartable checkpointed loops, or services wrapping an external agent CLI.
---

# Judgment Tracing for Request/Response Agents

Apply this skill only after repository inspection confirms that one request or
chat turn owns the complete unit of work. Read
[references/request-response.md](references/request-response.md) completely
before editing. Use the shared
[payload and flush helpers](../judgment-tracing/references/instrumentation-safety-and-evidence.md#safe-useful-payloads)
linked by that recipe; do not load the long general tracing guide by default.

## Required model

- Keep transport authentication and basic HTTP/body-shape rejection outside the
  business trace. Once a request is admitted to application/session validation,
  use one root for that attempted request or chat turn and keep it active through
  validation, model calls, tools, persistence, and the final result or safe
  failure. Before application/session validation succeeds, record metadata-only
  input and no session ID; after success, set the canonical session and semantic
  input.
- Put a bounded, faithful representation of the user trigger and final result
  on that root. Status, counts, hashes, or character lengths alone are not a
  substitute when the work produced a meaningful result.
- Set the application conversation or interaction ID as
  `judgment.session_id` after the root is active.
- Store the root with Judgment's documented `agent` span type/kind, model calls
  as `llm`, and executed tools as `tool`, using only the installed public SDK.
  Names do not establish types. Do not trace health, status, or read-only
  session endpoints by default.

## Non-negotiable implementation gates

1. Require an explicit intended project and exact target identity. Compare the
   resolved ID with a deployment-supplied expected ID when available; otherwise
   prove a unique live probe settled in that exact project. Do not invent an example-project
   fallback and do not silently disable export when routing is missing or
   unresolved.
2. Check in and record the real launcher/deployment path before testing:
   repository path and hash, exact command or Compose service, resolved env
   wiring, port/readiness check, and cleanup. Propagate the key, organization,
   project, and every configured endpoint override through that same path.
   When deployment uses Compose or a container service, run the positive,
   explicitly-empty, and same-type unique-unknown controls against the real
   checked-in service; a host-only server command is diagnostic, not proof.
3. Inspect the installed provider wrapper before using it. If automatic model
   payload capture cannot be disabled and calls may contain history, files,
   schemas, system prompts, or secrets, use a version-supported manual LLM
   span with automatic IO disabled or report privacy-safe LLM coverage as
   blocked. Use documented public span APIs only. Private/underscored SDK
   modules or methods are forbidden unless the exact dependency is pinned and
   an executable production-shaped conformance test proves that API.
4. Choose an approved sanitizer, a conservative credential/auth baseline that
   requires privacy review, or strict omission (which blocks useful root
   evidence). Sanitize before bounding. Raw canaries must cover non-real
   OpenAI-style `sk-`, GitHub-style `ghp_` and `github_pat_`, other installed
   API/provider keys, authorization, cookies/sessions, secret assignments, URL
   credentials, standalone `Bearer`/`Basic` values, and multiline private keys
   across input, output, error, and beyond-bound positions. Redact structured
   keys, multiline private-key blocks, and standalone auth values before any
   greedy composed-text rule. Serialize only after sanitizing and cap every
   complete input/output value at 1,500 UTF-8 bytes after the exact installed
   SDK serializer, or a lower documented destination limit, preserving valid
   structured data.
5. End the observed business root before running an awaited, bounded exporter
   flush in the outer request layer's `finally` path. Success and request/model
   error paths must both attempt export after the root has ended.
6. Every tool child needs a safe semantic outcome, not only a count or length.
   A caught tool failure must mark the tool child as an error with a normalized
   code while allowing the overall turn root to succeed if the agent recovered.
7. Put every telemetry-only active-span lookup, sanitizer/classifier,
   attribute/status write, finalizer, reporter, and flush behind a fail-open
   guard. Guard and fault a rename or explicit span-type/kind setter only when
   the implementation actually calls it; do not add one for the test. None may
   rerun or change the request, model, tool, persistence, or original exception.

## Completion gate

Do not report the integration complete until a real application path—not a
stub, unit test, scratch span, or synthetic provider—has been run and the
stored Judgment evidence proves:

- exactly one finalized root per request admitted to business/session
  validation, including normalized metadata-only roots for exercised validation
  rejection; transport-auth/basic-shape rejects outside this boundary have none;
- successful root input/output matches the real trigger/result semantically,
  while rejected roots contain no untrusted request content or session identity;
- every child starts and ends inside the root window;
- exact session IDs group turns across an exercised restart;
- expected LLM/tools and error paths are visible without readback noise;
- independent root/child scope, each lookup/setter actually used,
  sanitizer/classifier, finalizer, and flush fault injections leave the request
  path single-run and unchanged;
- explicit routing reaches the intended existing project, while empty and
  unique-unknown name/ID launchers fail before readiness and create nothing;
- the exact checked-in launcher/deployment ledger and its positive/empty/unknown
  controls use the same selected real service topology, including Compose only
  when that topology uses it;
- raw stored span kinds are `agent` for the turn root, `llm` for model calls,
  and `tool` for executed tools;
- raw attributes exclude secrets, histories, schemas, files, and other
  unapproved bulk payloads while a benign semantic marker survives, every
  serialized input/output is at most 1,500 UTF-8 bytes, and truncated values
  retain a parseable `_judgment_truncation` object; and
- the final completed root survives the tested restart/termination boundary;
  and
- every non-live unit/stub/fake/build/typecheck/import/smoke/dev/static-
  generation command exports zero unexplained live roots.

If a Judgment Behavior, Judge, or Test is cited, it counts only when the exact
current-run recorded result is inspectable and tied to the trace IDs in this
traffic ledger. A saved definition, configured monitor, or aggregate score
without per-result trace identity is not evidence.

Report the focused reference's table with `pass`, `fail`, `blocked`, or
`not-applicable` and one evidence class: static, synthetic, real application,
or stored Judgment. Missing evidence is `blocked`.
