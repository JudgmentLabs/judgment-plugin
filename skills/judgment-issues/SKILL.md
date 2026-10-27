---
name: judgment-issues
description: Use when working an open Issue, a Fix with handoff, or a failure to root-cause from cited traces.
---

# Triage an Issue

- Read the Issue and at least two cited traces through Judgment MCP before you propose a fix. Do this for a **Fix with** handoff too.
- Use `get_issue` for the Issue. Use `sql_query` when you need a count.
- Propose the smallest code change on the failing path. Ask before you change Issue status.
- Follow the root-cause cookbook for the first pass.

## Start here

- [Issues overview](https://docs.judgmentlabs.ai/documentation/issues/overview)
- [Triage and fix](https://docs.judgmentlabs.ai/documentation/issues/triage-and-fix)
- [Cookbook: Root-cause an Issue](https://docs.judgmentlabs.ai/documentation/issues/cookbook-root-cause-an-issue)

For live data, use Judgment MCP tools. For procedures the server already ships, call `get_skill`.
