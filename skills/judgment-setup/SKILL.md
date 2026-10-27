---
name: judgment-setup
description: Use when integrating Judgment or judgeval, adding tracing, checking first traces and trace health, or wiring MCP.
---

# Set up tracing

- Read the current docs with `search_docs` and `read_doc_page` before you instrument. Do not invent SDK calls.
- Instrument one real agent path. Start with the integration that already runs that path, so the root, model calls, tool calls, input, output, and session reach the project.
- Exercise that path. Confirm the traces arrived, then check trace health, before you call setup done.
- Sign in to Judgment MCP with OAuth. Use an ingest API key for the SDK. Keep credentials out of chat.
- Keep the instrumentation change small. Leave judges and test suites out of setup.

## Start here

- [Connect coding agent](https://docs.judgmentlabs.ai/documentation/connect/connect-your-coding-agent)
- [Set up tracing](https://docs.judgmentlabs.ai/documentation/connect/set-up-tracing)
- [Add context](https://docs.judgmentlabs.ai/documentation/connect/add-context)
- [Trace health](https://docs.judgmentlabs.ai/documentation/connect/trace-health)
- [Choose an integration](https://docs.judgmentlabs.ai/documentation/connect/integrations)
- [Auth & projects](https://docs.judgmentlabs.ai/documentation/reference/authentication-and-projects)

For live data, use Judgment MCP tools. For procedures the server already ships, call `get_skill`.
