# Judgment plugin

The official [Judgment](https://judgmentlabs.ai) plugin for AI coding agents.
One repo, installable in both Claude Code and OpenAI Codex, bundling:

1. **The Judgment MCP server** (`https://mcp.judgmentlabs.ai`): query traces,
   sessions, behaviors, judges, prompts, datasets, tests, automations, and
   agent memory directly from your editor.
2. **The `judgment-tracing` skill**: best-practice guidance for instrumenting
   apps with tracing, writing evaluations, building code judges, and running
   offline agent tests.
3. **The `mcp-server-best-practices` skill**: usage patterns for the Judgment
   MCP itself (search_traces batching, filter reference, fan-out queries).

The MCP gives your agent live data and actions; the skills teach it how to use
Judgment well. Together they cover both "what's happening in my agent" and
"how do I improve it."

## Install

### Claude Code

```bash
claude plugin marketplace add JudgmentLabs/judgment-plugin
claude plugin install judgment@judgment-plugin
```

If you previously added the Judgment MCP manually (for example
`claude mcp add judgment-mcp ...`), remove it first so you do not end up with
two Judgment servers:

```bash
claude mcp remove judgment-mcp
```

### Codex

```bash
codex plugin marketplace add JudgmentLabs/judgment-plugin
```

Then open the plugin browser inside Codex with `/plugins`, select the
`judgment` marketplace, and choose `Install plugin`. Start a new thread after
installing, then authenticate:

```bash
codex mcp login judgment
```

### Other agents (npx skills)

For Cursor, Windsurf, and other agents, install the skills with the
[skills CLI](https://skills.sh):

```bash
npx skills add JudgmentLabs/judgment-plugin
```

Then add the MCP server manually (see Standalone MCP below).

## Authentication

The plugin ships with **OAuth** as the default (Judgment's recommended
method). On first use your agent opens a browser window where you sign into
Judgment and authorize access. No API keys or headers to manage. Organization
selection happens per tool call via the `organization_id` argument (start with
`list_organizations`).

### API key alternative (headless / CI)

**Claude Code** — add an Authorization header to `.mcp.json`:

```json
{
  "mcpServers": {
    "judgment": {
      "type": "http",
      "url": "https://mcp.judgmentlabs.ai",
      "headers": {
        "Authorization": "Bearer ${JUDGMENT_API_KEY}"
      }
    }
  }
}
```

**Codex** — configure the server in `~/.codex/config.toml` instead of the
plugin, using a bearer token from the environment:

```toml
[mcp_servers.judgment]
url = "https://mcp.judgmentlabs.ai"
bearer_token_env_var = "JUDGMENT_API_KEY"
```

Then export the key before starting your agent:

```bash
export JUDGMENT_API_KEY="your_key_here"
```

The Judgment MCP needs only the `Authorization: Bearer` header; there is no
org-id header. Get your API key from the
[Judgment platform](https://app.judgmentlabs.ai).

## Standalone MCP (no plugin)

If you only want the MCP server without the skills, add it directly:

```bash
# Claude Code
claude mcp add judgment --transport http https://mcp.judgmentlabs.ai

# Codex (~/.codex/config.toml)
# [mcp_servers.judgment]
# url = "https://mcp.judgmentlabs.ai"
```

See the [Judgment MCP docs](https://docs.judgmentlabs.ai/documentation/mcp-server)
for full details.

## What's inside

```
judgment-plugin/
├── .claude-plugin/          # Claude Code plugin + marketplace manifests
├── .codex-plugin/           # Codex plugin manifest
├── .agents/plugins/         # Codex marketplace manifest
├── .mcp.json                # the Judgment MCP server (shared by both agents)
├── assets/                  # Judgment logo and composer icon
└── skills/
    ├── judgment-tracing/
    └── mcp-server-best-practices/
```

Claude Code namespaces the MCP tools as
`mcp__plugin_judgment_judgment__<tool>` (for example
`mcp__plugin_judgment_judgment__search_traces`); use the full name in
permission rules or subagent tool lists. In Codex, invoke the skills
explicitly with `$judgment-tracing` or `$mcp-server-best-practices`.

## Local development

```bash
claude --plugin-dir .        # load this checkout for one session
claude plugin validate .     # schema-check
```

## License

[Apache-2.0](LICENSE)
