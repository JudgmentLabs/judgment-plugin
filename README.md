# Judgment plugin

The official [Judgment](https://judgmentlabs.ai) plugin for Cursor, Claude Code,
and Codex. One repo installs:

1. **The Judgment MCP server** at <https://mcp.judgmentlabs.ai>: read Issues,
   traces, judges, labels, datasets, and test runs from your editor. Trace
   queries go through `discover_schema` and `sql_query`. The same server can
   read current docs with `search_docs` and `read_doc_page`, and server
   procedures with `get_skill`.
2. **Skills** under `skills/`. Each skill is a `SKILL.md` that points at the
   docs:

   | Skill | When to use it |
   | --- | --- |
   | `judgment-setup` | Integrate Judgment, add tracing, and check first traces and trace health. |
   | `judgment-mcp` | Query traces and other live project data from the editor. |
   | `judgment-issues` | Work an open Issue, a Fix with handoff, or a failure cited in traces. |
   | `judgment-judges-and-tests` | Create judges, use labels as indexes, build datasets, and run test suites. |

Full tool list: [MCP tools](https://docs.judgmentlabs.ai/documentation/reference/mcp-tools).
Connect and auth: [Connect your coding agent](https://docs.judgmentlabs.ai/documentation/connect/connect-your-coding-agent).

## Install

### Cursor

Install this Git repository so Cursor loads the skills and the MCP server
together.

**Team marketplace** (Teams and Enterprise). An admin does this:

1. Open the Cursor dashboard, then **Plugins & MCPs**.
2. Under **Team Marketplaces**, choose **Add Marketplace**.
3. Choose **Import from Repo** and paste
   <https://github.com/JudgmentLabs/judgment-plugin>.
4. Add the `judgment` plugin. Set installation to **Default Off**,
   **Default On**, or **Required**.
5. Save. Turn on **Auto Refresh** if you want pushes to update the marketplace.

Developers then open **Customize** and install `judgment` when it is Default
Off. Default On and Required install for them. Open the `judgment` MCP server
and complete **Sign in** in the browser.

**Your own Cursor.** In agent chat:

```text
/add-plugin https://github.com/JudgmentLabs/judgment-plugin
```

Install `judgment` from **Customize**, then **Sign in** on the `judgment` MCP
server.

**Local checkout.** Copy this repo to `~/.cursor/plugins/local/judgment`, then
run **Developer: Reload Window**. On Enterprise, an admin turns on **Allow
Local Plugin Imports** under Dashboard, Settings, Security & Identity,
Marketplace and Plugins. Use a real copy. A symlink loads only when its
target stays inside `~/.cursor/plugins/local`.

During OAuth, choose the organization and leave **Project** set to **All
Projects in This Organization**. A project-specific grant hides cross-project
discovery tools.

### Claude Code

```bash
claude plugin marketplace add JudgmentLabs/judgment-plugin
claude plugin install judgment@judgment-plugin
```

If you previously added the Judgment MCP by hand, remove it so you do not end
up with two servers:

```bash
claude mcp remove judgment
claude mcp remove judgment-mcp
```

### Codex

```bash
codex plugin marketplace add JudgmentLabs/judgment-plugin
```

Open `/plugins` in Codex, select the `judgment` marketplace, and choose
**Install plugin**. Start a new thread, then sign in:

```bash
codex mcp login judgment
```

## Authentication

The shipped `mcp.json` and `.mcp.json` contain only the production server URL.
OAuth is the way to sign in. On first use the client opens a browser, you
authorize Judgment, and the client stores the access token. No API key is
committed in this repo.

### API key when OAuth is unavailable

Use a personal API key from **Settings > Personal API Keys**. MCP does not
accept ingest API keys. Copy the organization ID, then export both values:

```bash
export JUDGMENT_API_KEY="<your-personal-api-key>"
export JUDGMENT_ORG_ID="<your-organization-id>"
```

The key has the same permissions as your role. A Viewer key can read. Writes
need Developer. The client sends `Authorization: Bearer <key>` and pins the
connection to one organization with `X-Organization-Id`.

**Cursor.** Add this to `~/.cursor/mcp.json` (every workspace) or
`.cursor/mcp.json` (one project):

```json
{
  "mcpServers": {
    "judgment": {
      "url": "https://mcp.judgmentlabs.ai",
      "headers": {
        "Authorization": "Bearer ${env:JUDGMENT_API_KEY}",
        "X-Organization-Id": "${env:JUDGMENT_ORG_ID}"
      }
    }
  }
}
```

**Claude Code:**

```bash
claude mcp add --transport http judgment https://mcp.judgmentlabs.ai \
  --header "Authorization: Bearer $JUDGMENT_API_KEY" \
  --header "X-Organization-Id: $JUDGMENT_ORG_ID"
```

**Codex.** Add this to `~/.codex/config.toml`:

```toml
[mcp_servers.judgment]
url = "https://mcp.judgmentlabs.ai"
bearer_token_env_var = "JUDGMENT_API_KEY"
env_http_headers = { "X-Organization-Id" = "JUDGMENT_ORG_ID" }
```

To pin one project as well, add an `X-Project-Id` header with the project ID.
It requires `X-Organization-Id`. A project-bound connection hides
organization-level tools such as `list_projects`.

Reload the client after changing MCP config. A `401` with an API key usually
means `JUDGMENT_API_KEY` is missing from the environment the client runs in.

Confirm the connection by asking the agent to call `list_organizations`, then
`list_projects`, and to return the ids without making changes.

SDK tracing still needs its own organization ingest key (`JUDGMENT_API_KEY`
starting with `jli_`) and `JUDGMENT_ORG_ID`. OAuth for MCP does not replace
those SDK credentials. See
[Set up tracing](https://docs.judgmentlabs.ai/documentation/connect/set-up-tracing).

## What's inside

```
judgment-plugin/
├── .cursor-plugin/plugin.json   # Cursor manifest (skills + mcp.json)
├── .claude-plugin/              # Claude Code plugin + marketplace
├── .codex-plugin/               # Codex plugin manifest
├── .agents/plugins/             # Codex marketplace manifest
├── mcp.json                     # Judgment MCP for Cursor (prod URL)
├── .mcp.json                    # same file, for Claude Code and Codex
├── assets/                      # logo and composer icon
└── skills/                      # judgment-setup, judgment-mcp,
                                 # judgment-issues, judgment-judges-and-tests
```

`mcp.json` and `.mcp.json` are the same document. Both point at
<https://mcp.judgmentlabs.ai>.

Claude Code namespaces MCP tools as
`mcp__plugin_judgment_judgment__<tool>` (for example
`mcp__plugin_judgment_judgment__list_issues`). Use the full name in permission
rules or subagent tool lists. In Codex, invoke a skill with `$judgment-setup`,
`$judgment-mcp`, `$judgment-issues`, or `$judgment-judges-and-tests`. In
Cursor, invoke a skill with `/judgment-setup` (and the other three names).

## Local development

```bash
claude --plugin-dir .        # load this checkout for one session
claude plugin validate .     # schema-check the Claude Code plugin
```

## License

[Apache-2.0](LICENSE). [Privacy policy](https://app.judgmentlabs.ai/privacy).
