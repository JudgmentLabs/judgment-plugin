---
name: judgment-tracing-cli-wrappers
description: Use when adding or auditing Judgment tracing for a service that invokes Claude Code, Codex, or another agent CLI/subprocess and persists the underlying CLI session ID for `--resume` or equivalent. Covers wrapper-turn roots, late session assignment, restart continuity, subprocess evidence, inner-agent visibility limits, root-last export, and subagent links.
---

# Judgment Tracing for Persistent Agent CLI Wrappers

Read
`../judgment-tracing/references/tracing-agent-cli-wrappers.md`
completely before editing.

## Required model

- One completed wrapper task is one root from accepted prompt through CLI
  completion, persisted mapping, and final reply.
- Put a bounded safe task prompt and final returned reply on the root.
- Set `judgment.session_id` to the underlying CLI session ID. On the first
  turn, keep the root active until the CLI returns its ID; on later turns,
  prove the persisted ID equals the value passed to resume.
- Keep the wrapper’s own request/session ID as a separate attribute.
- Record the real CLI invocation as a child with mode, resume state, duration,
  exit code, and sanitized error category.

## Declare the observability level

- **Wrapper baseline:** faithful wrapper root, exact underlying CLI session,
  CLI child, restart continuity, and export lifecycle. This is useful but does
  not show the inner agent’s LLM calls, tools, or subagents.
- **Full wrapped-agent tracing:** real supported hook, JSONL, OTel, or native
  instrumentation supplies inner LLM/tool/subagent evidence. Normalize clocks,
  keep all children inside the wrapper root, and link true subagents as
  separate agent traces when supported.

Never synthesize inner spans or describe an aggregate subprocess span as full
agent tracing.

## Non-negotiable implementation gates

1. Require an explicit project. Missing project configuration must fail before
   serving traffic; do not guess a project or silently install a no-op tracer.
2. Forward key, organization, project, and endpoint overrides into the real
   wrapper runtime and, when inner tracing is claimed, into the subprocess.
3. Use application-owned sanitized semantic prompt/reply fields. Truncation is
   not redaction; omit-only metadata makes the wrapper behavior-blind and must
   be reported as incomplete.
4. End the observed wrapper root, then run an awaited, bounded flush in the
   outer route before returning or crossing the tested restart checkpoint.
5. If inner records stream before task completion, emit/update the finalized
   root last so online evaluation sees complete children and final IO.

## Completion gate

Run real CLI turns across at least two sessions and a wrapper restart. Include
a resumed turn and a nonzero/timeout/error path when safe. Stored Judgment
evidence must prove:

- one finalized wrapper root per expected task and no readback/health roots;
- root prompt/reply matches the actual API response semantically;
- exact underlying CLI session IDs group resumed turns across restart;
- CLI children have honest timing/outcomes and fit inside root windows;
- explicit routing reaches the intended existing project;
- raw payloads exclude secrets, auth, unapproved files/history/schemas; and
- claimed inner-agent coverage is backed by actual inner LLM/tool/subagent
  evidence, otherwise the result is labeled wrapper baseline.

Label evidence as static, synthetic, real application, or stored Judgment
evidence. A fake CLI smoke does not prove real inner-agent tracing.
