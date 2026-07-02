---
name: mcp-server-best-practices
description: Best practices for using the Judgment MCP server effectively. Covers when to use MCP vs other tools, how to use search_traces with batching, and general usage patterns.
license: Apache-2.0
metadata:
  author: judgment
  version: "3.0.0"
---

# Judgment MCP Server Best Practices

## Default to MCP

**Always use MCP tools first** when the user asks about anything related to Judgment data — traces, behaviors, sessions, projects, automations, judges, prompts, datasets, tests, documentation, agent memory, agent threads, or organizations. Do not fall back to reading code or asking for IDs if an MCP tool can fetch the data directly.

## Using search_traces Effectively

### Prefer full-text search first

When looking for traces by content, **always try `full_text_search` first** before resorting to `span_attributes_roots`. Full-text search covers input/output of ALL spans in the trace plus span names — it's the broadest and fastest way to find relevant traces. Only fall back to `span_attributes_roots` if you need to match a specific structured attribute key that full-text search wouldn't cover (e.g., filtering on a metadata field like `model_name` or `environment`).

### Batch queries: use `queries` array

`search_traces` accepts a `queries` array (1–10 queries per call). Each query has its own `filters`, `time_range`, and `pagination`. All queries run concurrently server-side. **Always batch multiple searches into one `search_traces` call** instead of making separate tool calls — this is faster and uses fewer round trips.

### Filter reference

Each filter is an object with a `field` discriminator:

```json
// Duration (milliseconds)
{ "field": "duration", "op": ">=", "value": 5000 }

// Error message
{ "field": "error", "op": "contains", "value": "timeout" }

// Span name
{ "field": "span_name", "op": "=", "value": "my-span" }

// Customer ID
{ "field": "customer_id", "op": "=", "value": "user-123" }

// Session ID
{ "field": "session_id", "op": "=", "value": "sess-abc" }

// Tags (any of the listed values)
{ "field": "tags", "op": "any", "value": ["tag1", "tag2"] }

// LLM cost (USD)
{ "field": "llm_cost", "op": ">", "value": 0.10 }

// Behaviors (any of the listed judge/value pairs)
{ "field": "behaviors", "op": "any", "value": [{ "judge_name": "toxicity", "value": "toxic" }] }

// Numeric score by name
{ "field": "score", "name": "my-score", "kind": "value", "op": ">=", "value": 0.8 }

// Root span attribute (use only when you need a specific structured key — try full_text_search first)
{ "field": "span_attributes_roots", "key": "my.attribute", "op": "contains", "value": "foo" }

// Full-text search (searches input and output of ALL spans in the trace, plus span names — USE THIS FIRST)
{ "field": "full_text_search", "op": "contains", "value": "user query text" }
```

String ops: `=`, `!=`, `contains`, `does_not_contain`, `exists`, `is_absent`
Numeric ops: `=`, `!=`, `<`, `<=`, `>`, `>=`

### Time range constraints

- `full_text_search` filters **require** a `time_range` with `start_time` and a window of at most 30 days.
- Any sort other than `created_at` desc requires `time_range.start_time` and a window of at most 7 days.
- `created_at` desc (the default) works across all history with no time_range.

## Batch Queries for Semantic/Fuzzy Searches

When answering a question that can't be answered with a single precise filter — e.g., "find traces where the user seemed confused", "show me failing traces from this week", "what are the most expensive traces?" — **pack multiple queries into a single `search_traces` call** using the `queries` array. This runs them all concurrently server-side in one round trip.

### Why batch queries

`search_traces` is a structured filter tool. For semantic or multi-faceted questions, a single filter misses data. Batching multiple queries with different filters gives broader, more complete coverage without extra tool calls.

### Example: "Find traces where something went wrong"

One `search_traces` call with 5 queries:

```json
search_traces({ queries: [
  { filters: [{ field: "error", op: "exists", value: "" }], pagination: { limit: 200, cursorCreatedAt: null, cursorItemId: null } },
  { filters: [{ field: "duration", op: ">=", value: 10000 }], pagination: { limit: 200, cursorCreatedAt: null, cursorItemId: null } },
  { filters: [{ field: "llm_cost", op: ">", value: 0.5 }], pagination: { limit: 200, cursorCreatedAt: null, cursorItemId: null } },
  { filters: [{ field: "full_text_search", op: "contains", value: "error" }], pagination: { limit: 200, cursorCreatedAt: null, cursorItemId: null } },
  { filters: [{ field: "full_text_search", op: "contains", value: "failed" }], pagination: { limit: 200, cursorCreatedAt: null, cursorItemId: null } }
] })
```

Then merge and deduplicate results by trace_id before presenting.

### Example: "Find traces about billing questions"

One `search_traces` call with keyword variants:

```json
search_traces({ queries: [
  { filters: [{ field: "full_text_search", op: "contains", value: "billing" }], pagination: { limit: 200, cursorCreatedAt: null, cursorItemId: null } },
  { filters: [{ field: "full_text_search", op: "contains", value: "invoice" }], pagination: { limit: 200, cursorCreatedAt: null, cursorItemId: null } },
  { filters: [{ field: "full_text_search", op: "contains", value: "payment" }], pagination: { limit: 200, cursorCreatedAt: null, cursorItemId: null } },
  { filters: [{ field: "full_text_search", op: "contains", value: "subscription" }], pagination: { limit: 200, cursorCreatedAt: null, cursorItemId: null } },
  { filters: [{ field: "full_text_search", op: "contains", value: "charge" }], pagination: { limit: 200, cursorCreatedAt: null, cursorItemId: null } }
] })
```

## General Rules

- **Full-text search first**: always prefer `full_text_search` over `span_attributes_roots` for content matching
- **Batch aggressively**: for semantic queries, generate 3–8 keyword variants and pack them all into one `search_traces` call (max 10 queries)
- For multi-signal queries (slow AND expensive AND erroring): batch each filter as a separate query, then intersect/union results
- Always deduplicate on `trace_id` before summarizing
- **Result count**: try to find and present 5–10 traces unless the user asks for more. Use `limit: 200` in queries to maximize your chances of finding enough results. When presenting more than a handful of traces, use a **tabular format** (markdown table) for readability
- **Batch span lookups**: `get_trace_span` accepts up to 20 trace/span pairs in one call — always batch multiple span lookups instead of calling one at a time
- **Memory search before fetch**: use `search_agent_memory_files` to find relevant memory entries before calling `fetch_agent_memory_files` with specific IDs/paths
- **Poll test progress**: use `get_test_live_results` to stream progress for queued test runs before the final results table is written
