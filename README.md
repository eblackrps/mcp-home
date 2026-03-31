# mcp-home

A small TypeScript MCP server for home use that exposes the same read-only tools over:

- `stdio` for local clients
- Streamable HTTP for remote clients and API integrations

The initial toolset is intentionally conservative:

- `ping`
- `get_time`
- `get_homelab_status`
- `list_notes`
- `search_notes`
- `read_note`

## Why this shape

The server keeps tool logic in one shared registry and adds two thin transports on top. That lets you:

- use a local `stdio` entrypoint for Claude-compatible local clients
- use a remote HTTP endpoint for OpenAI and Anthropic API integrations
- avoid duplicating tool definitions or drifting behavior between clients

## Project layout

```text
mcp-home/
  notes/
  src/
    core/
    transports/
    index-http.ts
    index-stdio.ts
  Caddyfile
  docker-compose.yml
  Dockerfile
```

## Local development

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the environment file:

   ```powershell
   Copy-Item .env.example .env
   ```

3. Start the local stdio server:

   ```bash
   npm run dev:stdio
   ```

4. Or start the HTTP server:

   ```bash
   npm run dev:http
   ```

5. Check the health endpoint:

   ```powershell
   Invoke-RestMethod http://localhost:8787/health
   ```

6. Run the built-in HTTP smoke test while the HTTP server is running:

   ```powershell
   npm run smoke:http
   ```

## Model API checks

OpenAI and Anthropic cannot reach `http://localhost:8787/mcp` directly. Before using either API, expose your MCP server on a public HTTPS URL with Caddy plus a tunnel or your own domain, then set `MCP_SERVER_URL` in `.env`.

Once that is in place:

```powershell
npm run test:openai:mcp
npm run test:anthropic:mcp
```

## Claude setup

For local clients that can spawn stdio servers, point them at the built entrypoint:

```bash
npm run build
node dist/index-stdio.js
```

For Claude Code specifically, the current Anthropic CLI flow is:

```bash
claude mcp add --transport stdio mcp-home -- node /absolute/path/to/dist/index-stdio.js
```

On native Windows, Anthropic currently recommends wrapping `npx` commands with `cmd /c`, but a direct `node` command works fine for this project because the entrypoint is already a local script.

## OpenAI Responses API example

```ts
const response = await fetch("https://api.openai.com/v1/responses", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    authorization: `Bearer ${process.env.OPENAI_API_KEY}`
  },
  body: JSON.stringify({
    model: "gpt-5",
    input: "Search my notes for homelab and summarize what you find.",
    tools: [
      {
        type: "mcp",
        server_label: "home",
        server_url: "https://your-domain.example.com/mcp",
        authorization: process.env.MCP_AUTH_TOKEN,
        allowed_tools: ["search_notes", "read_note"],
        require_approval: "never"
      }
    ]
  })
});

console.log(await response.json());
```

## Anthropic Messages API example

As of March 31, 2026, Anthropic's MCP connector docs require the `anthropic-beta: mcp-client-2025-11-20` header. The current request shape keeps connection details in `mcp_servers` and enables tool exposure through an `mcp_toolset` entry in `tools`.

```ts
const resp = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-api-key": process.env.ANTHROPIC_API_KEY!,
    "anthropic-version": "2023-06-01",
    "anthropic-beta": "mcp-client-2025-11-20"
  },
  body: JSON.stringify({
    model: "claude-sonnet-4-6",
    max_tokens: 800,
    messages: [
      { role: "user", content: "List my notes and read the homelab one." }
    ],
    mcp_servers: [
      {
        type: "url",
        url: "https://your-domain.example.com/mcp",
        name: "home",
        authorization_token: process.env.MCP_AUTH_TOKEN
      }
    ],
    tools: [
      {
        type: "mcp_toolset",
        mcp_server_name: "home",
        default_config: {
          enabled: false
        },
        configs: {
          list_notes: {
            enabled: true
          },
          read_note: {
            enabled: true
          }
        }
      }
    ]
  })
});

console.log(await resp.json());
```

## Docker and Caddy

The container stack includes:

- `mcp-home` for the HTTP server
- `caddy` for HTTPS termination and reverse proxying

Bring it up with:

```bash
docker compose up --build -d
```

For local development, `.env` uses repo-relative paths like `./notes` and `./data/homelab-status.json`. Docker Compose overrides those with container paths automatically. Set `MCP_DOMAIN` in `.env`, point DNS at your home endpoint or tunnel, and Caddy will terminate TLS for that hostname.

## Security notes

Keep this server read-only until you trust the deployment path and logging.

- Use long random bearer tokens.
- Keep `allowed_tools` narrow on every remote API call.
- Do not expose shell, SSH, Docker control, or file writes on the same server as broad read-only tools.
- Prefer Tailscale or Cloudflare Tunnel over raw router port forwarding.

## Next steps

Good next additions:

- structured audit logging
- per-tool auth policy
- a separate admin-only MCP server for higher-risk tools

## References

- OpenAI remote MCP guide: https://platform.openai.com/docs/guides/tools-remote-mcp
- OpenAI MCP server guide: https://platform.openai.com/docs/mcp
- Anthropic MCP connector: https://docs.anthropic.com/en/docs/agents-and-tools/mcp-connector
- Anthropic Claude Code MCP guide: https://docs.anthropic.com/en/docs/claude-code/mcp
- MCP transports spec: https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
