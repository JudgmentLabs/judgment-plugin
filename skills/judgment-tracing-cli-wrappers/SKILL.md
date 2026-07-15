---
name: judgment-tracing-cli-wrappers
description: Use when adding or auditing Judgment tracing for a service that invokes Claude Code, Codex, or another agent CLI/subprocess and persists the underlying CLI session ID for `--resume` or equivalent. Covers wrapper-turn roots, late session assignment, restart continuity, subprocess evidence, inner-agent visibility limits, root-last export, and subagent links.
---

# Judgment Tracing for Persistent Agent CLI Wrappers

Inspect the HTTP/business boundary, CLI runner, returned session format,
persistent wrapper-to-CLI mapping, resume path, failure behavior, and launcher.
Then read `references/cli-wrapper-binding-recipe.md` completely before the
first edit. It is the authoritative implementation contract.

Do not load the long reference by default. Read only the named section of
`references/agent-cli-wrappers.md` when its condition is present:

- **The first-turn identity problem** — the framework/decorator cannot assign
  the returned CLI session to the still-active first-turn root or failures are
  being serialized before rethrow.
- **Inner agent spans** — a real hook, JSONL, OTel, or native source exists and
  linked/nested inner coverage is actually in scope.
- **Export lifecycle** — the installed SDK flush signature or outer post-root
  completion barrier is unclear or a pre-restart turn is missing.
- **Mandatory real-path verification** and **Completion gate** — implementation
  is finished and the final evidence report is being assembled.

Never create a second traced wrapper path to handle errors. Adapt the binding
recipe's single outcome adapter to the existing application semantics.

## Completion rule

Do not claim inner coverage from an aggregate subprocess span or fake CLI.
Reconcile real wrapper turns and exact underlying CLI session IDs with settled
raw Judgment evidence across restart. Report every recipe gate as `pass`,
`fail`, `blocked`, or genuinely `not-applicable`, with evidence class `static`,
`synthetic`, `real application`, or `stored Judgment`. Missing evidence is
`blocked`. Do not collapse the edge matrix into one "error paths" verdict;
each named subcase needs the evidence class required by its completion row or
remains blocked.
