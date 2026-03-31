# mcp-home

A small TypeScript MCP server for home use that exposes the same read-only tools over:

- `stdio` for local clients
- Streamable HTTP for remote clients and API integrations

The initial toolset is intentionally conservative:

- `ping`
- `get_time`
- `get_homelab_status`
- `get_host_status`
- `get_plex_status`
- `search_plex_library`
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
  data/
    local/
  notes/
  scripts/
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

## Windows host refresh

The Docker container cannot see Windows services, iCUE, or Plex directly, so the repo now uses a host-side refresh step that writes read-only JSON snapshots into `data/local/`.

Run this on the Windows host whenever you want fresh system and Plex data:

```powershell
npm run refresh:host
```

That script:

- reads Windows uptime plus Docker Desktop, Corsair iCUE, and Plex process or service state
- probes the local Plex server at `http://127.0.0.1:32400/identity`
- exports a searchable Plex library index from the local Plex SQLite database
- writes:
  - `data/local/windows-host-status.json`
  - `data/local/plex-library-index.json`

The current implementation expects Python 3 on the Windows host for the Plex database export. The MCP server stays read-only and only reads the generated JSON files.

Once you have refreshed the host data, these tools become useful:

- `get_host_status`
- `get_plex_status`
- `search_plex_library`

## Model API checks

OpenAI and Anthropic cannot reach `http://localhost:8787/mcp` directly. Before using either API, expose your MCP server on a public HTTPS URL with Caddy plus a tunnel or your own domain, then set `MCP_SERVER_URL` in `.env`.

Once that is in place:

```powershell
npm run test:openai:mcp
npm run test:anthropic:mcp
```

## ChatGPT with OAuth

If you want to connect this server to ChatGPT without leaving the endpoint unauthenticated, use the built-in OAuth mode.

Set these values in `.env`:

```text
MCP_AUTH_MODE=oauth
MCP_SERVER_URL=https://your-public-hostname/mcp
MCP_OAUTH_PASSWORD=your-shared-password
```

If `MCP_OAUTH_PASSWORD` is left blank, the server falls back to `MCP_AUTH_TOKEN` as the login password.

Then restart the stack and verify local auth metadata:

```powershell
docker compose -f docker-compose.tailscale.yml up -d --build
npm run smoke:http
```

When OAuth mode is working, the smoke test should show:

- a successful `/health` response
- the protected resource metadata URL
- a `401` on `/mcp` with a `WWW-Authenticate` header pointing clients at OAuth metadata

After that, re-enable `tailscale funnel` and connect the app from ChatGPT in Developer mode using your public MCP URL. ChatGPT will open a browser login step where you enter the shared password.

Your reverse proxy must expose these OAuth routes publicly, not just `/mcp`:

- `/.well-known/oauth-protected-resource/mcp`
- `/.well-known/oauth-authorization-server`
- `/authorize`
- `/register`
- `/token`
- `/revoke`
- `/oauth/login`

## Recommended remote path: Caddy + Tailscale Funnel

This is the cleanest home setup if you do not want to open router ports.

1. Install and sign in to Tailscale on the Windows host.
2. Make sure Funnel is enabled for your tailnet in the Tailscale admin console.
3. Start the local reverse-proxy stack:

   ```powershell
   docker compose -f docker-compose.tailscale.yml up --build -d
   ```

4. Verify the local proxy before publishing it:

   ```powershell
   Invoke-RestMethod http://127.0.0.1:8788/health
   ```

5. Optional private dry run inside your tailnet:

   ```powershell
   tailscale serve --bg http://127.0.0.1:8788
   tailscale serve status
   ```

   `serve` is tailnet-only. It is useful for a private check from another Tailscale device, but OpenAI and Anthropic still will not be able to reach it.

6. Publish that local Caddy endpoint through Tailscale Funnel:

   ```powershell
   tailscale funnel --bg http://127.0.0.1:8788
   ```

7. Find the public `.ts.net` URL:

   ```powershell
   tailscale funnel status
   ```

8. Set `MCP_SERVER_URL` in `.env` to the published MCP endpoint, for example:

   ```text
   MCP_SERVER_URL=https://your-machine.your-tailnet.ts.net/mcp
   ```

9. Run the model-facing checks:

   ```powershell
   npm run test:openai:mcp
   npm run test:anthropic:mcp
   ```

This stack keeps Caddy private on `127.0.0.1:8788`, and Tailscale provides the public HTTPS entrypoint. That means no router port-forwarding and no direct exposure of Docker ports to your LAN.

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

For local development, `.env` uses repo-relative paths like `./notes` and `./data/homelab-status.json`. Docker Compose overrides those with container paths automatically.

Use `docker-compose.yml` when you want Caddy to terminate TLS directly for your own domain.

Use `docker-compose.tailscale.yml` plus `Caddyfile.tailscale` when you want Tailscale Funnel to provide the public HTTPS URL.

## Security notes

Keep this server read-only until you trust the deployment path and logging.

- Use long random bearer tokens.
- Keep `allowed_tools` narrow on every remote API call.
- Do not expose shell, SSH, Docker control, or file writes on the same server as broad read-only tools.
- Prefer Tailscale or Cloudflare Tunnel over raw router port forwarding.
- Keep host-generated snapshots in `data/local/` out of version control. They can reveal local library names and machine details.

## Next steps

Good next additions:

- per-tool auth policy
- a separate admin-only MCP server for higher-risk tools

## Audit logging

Tool calls are now audit-logged as JSON lines with:

- timestamp
- tool name
- success or failure
- duration in milliseconds
- a short sanitized argument summary

By default, audit records are written to stderr and, if `MCP_AUDIT_LOG_PATH` is set, appended to that file as JSONL.

Example:

```json
{"timestamp":"2026-03-31T16:00:00.000Z","event":"tool_call","tool":"read_note","ok":true,"durationMs":12,"argSummary":"slug=\"homelab\""}
```

Sensitive argument names like `token`, `secret`, `password`, `authorization`, `cookie`, and `key` are automatically redacted.

## References

- OpenAI remote MCP guide: https://platform.openai.com/docs/guides/tools-remote-mcp
- OpenAI MCP server guide: https://platform.openai.com/docs/mcp
- Anthropic MCP connector: https://docs.anthropic.com/en/docs/agents-and-tools/mcp-connector
- Anthropic Claude Code MCP guide: https://docs.anthropic.com/en/docs/claude-code/mcp
- MCP transports spec: https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
