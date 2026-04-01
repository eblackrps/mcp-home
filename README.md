# mcp-home

A small TypeScript MCP server for home use that exposes the same read-only tools over:

- `stdio` for local clients
- Streamable HTTP for remote clients and API integrations

The project is aimed at a home Windows machine with Docker Desktop and Plex, but the MCP server itself stays read-only and works cleanly with:

- local Claude-compatible clients over `stdio`
- ChatGPT over remote OAuth-protected MCP
- your own apps over Streamable HTTP

## What you get

- one shared tool registry with both `stdio` and HTTP transports
- Windows host refresh scripts for Docker Desktop, Plex, and Corsair iCUE status
- snapshot freshness reporting plus an operations dashboard for stale-data debugging
- natural-language entrypoints for home, Docker, notes, and Plex lookups
- a searchable exported Plex library index plus live Plex activity snapshots
- deeper Docker inspection for port mappings, mounts, restart patterns, and failure review
- OAuth support for ChatGPT and bearer-token support for generic remote clients
- Docker, Caddy, and Tailscale deployment options
- audit logging plus smoke and production verification scripts

## Tool groups

- Discovery:
  - `list_home_commands`
  - `list_docker_commands`
  - `list_plex_commands`
  - `find_home`
  - `find_docker`
  - `find_notes`
  - `find_plex`
- Snapshots and dashboards:
  - `get_snapshot_status`
  - `get_operations_dashboard`
- Host and notes:
  - `ping`
  - `get_time`
  - `get_homelab_status`
  - `get_host_status`
  - `list_notes`
  - `search_notes`
  - `read_note`
- Docker:
  - container status, projects, images, networks, volumes, cleanup candidates, recent activity, resource usage, port maps, mount reports, and restart reports
- Plex:
  - library discovery, title search, natural lookup, show and season summaries, recent additions, on-deck and continue-watching data, unwatched reports, and duplicate detection

For natural requests:

- start with `find_home` when you are not sure whether the answer lives in Plex, Docker, notes, or homelab data
- start with `find_plex` for Plex-first lookups like `Sopranos`, `Sopranos season 2`, or `Pine Barrens`
- use `get_snapshot_status` when results feel old or inconsistent

## Quick start

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the environment file:

   ```powershell
   Copy-Item .env.example .env
   ```

3. If you want Docker, Plex, or Windows host tools, refresh the local snapshots:

   ```powershell
   npm run refresh:host
   ```

4. Optional but recommended: install the Windows scheduled refresh so the snapshots stay current:

   ```powershell
   npm run schedule:host-refresh
   ```

5. Pick the path you care about first:

   - Local client only:
     Run `npm run build`, then use `node dist/index-stdio.js` or the Claude setup in this README.
   - Local HTTP verification:
     Run `npm run dev:http`, then `npm run smoke:http`.
   - ChatGPT over OAuth:
     Use the Tailscale+Caddy path, then connect the published MCP URL in ChatGPT Developer mode.

## Prerequisites

- Node.js 22+
- Windows 11 if you want the host refresh scripts exactly as provided
- Python 3 if you want Plex library export from the local SQLite database
- Docker Desktop if you want container-aware tooling
- Tailscale if you want the recommended public deployment path

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
  state/
  src/
    core/
    transports/
    index-http.ts
    index-stdio.ts
  Caddyfile
  docker-compose.yml
  Dockerfile
```

## Local development and verification

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

   The smoke test now auto-detects the first healthy target in this order:

   - `MCP_HEALTH_URL` if you set it
   - local app HTTP on `127.0.0.1:${PORT}`
   - local Caddy/Tailscale HTTP on `127.0.0.1:8788`
   - the origin derived from `MCP_SERVER_URL`

7. Run the stdio smoke test when you want a transport-agnostic tool check that still works in OAuth mode:

   ```powershell
   npm run smoke:stdio
   ```

8. Run the production verification bundle when you already have the server up:

   ```powershell
   npm run verify:prod
   ```

   `verify:prod` now runs:

   - `npm run build`
   - `npm run typecheck:scripts`
   - `npm run smoke:stdio`
   - `npm run smoke:http`

If you only want local Claude or another local `stdio` client, you can stop here. You do not need Caddy, Tailscale, ChatGPT OAuth, or separate API keys for that local-only path.

## Windows host refresh

The Docker container cannot see Windows services, iCUE, or Plex directly, so the repo now uses a host-side refresh step that writes read-only JSON snapshots into `data/local/`.

Run this on the Windows host whenever you want fresh system and Plex data:

```powershell
npm run refresh:host
```

That script:

- takes a lightweight lock so overlapping refresh runs do not clobber each other
- writes snapshot files atomically to reduce half-written or partially updated data
- reads Windows uptime plus Docker Desktop, Corsair iCUE, and Plex process or service state
- captures a read-only Docker snapshot from `docker ps -a`, `docker inspect`, `docker stats --no-stream`, `docker image ls`, `docker network ls`, `docker volume ls`, and `docker system df`
- probes the local Plex server at `http://127.0.0.1:32400/identity`
- exports a searchable Plex library index from the local Plex SQLite database
- captures a Plex activity snapshot from local sessions, watch history, continue-watching hubs, on-deck hubs, and unwatched library sections when a local token is available
- writes a freshness and scheduler summary that the MCP server can read back later
- writes:
  - `data/local/snapshot-status.json`
  - `data/local/windows-host-status.json`
  - `data/local/plex-library-index.json`
  - `data/local/plex-activity.json`

The current implementation expects Python 3 on the Windows host for the Plex database export. The MCP server stays read-only and only reads the generated JSON files.

Once you have refreshed the host data, these tools become useful:

- `list_home_commands`
- `get_snapshot_status`
- `get_operations_dashboard`
- `find_home`
- `find_docker`
- `find_notes`
- `list_docker_commands`
- `get_host_status`
- `get_docker_status`
- `list_docker_containers`
- `get_docker_projects`
- `get_docker_issues`
- `get_docker_container_details`
- `list_docker_images`
- `list_docker_networks`
- `get_docker_resource_usage`
- `get_docker_recent_activity`
- `get_docker_compose_health`
- `get_docker_project_details`
- `list_docker_volumes`
- `get_docker_cleanup_candidates`
- `get_docker_port_map`
- `get_docker_mount_report`
- `get_docker_restart_report`
- `list_plex_commands`
- `find_plex`
- `get_plex_status`
- `get_plex_server_activity`
- `get_plex_now_playing`
- `get_plex_recently_watched`
- `get_plex_continue_watching`
- `get_plex_on_deck`
- `find_plex_unwatched`
- `get_plex_item_details`
- `browse_plex_by_genre`
- `browse_plex_by_decade`
- `get_plex_library_stats`
- `get_plex_show_summary`
- `get_plex_season_summary`
- `get_recently_aired_episodes`
- `find_plex_series_gaps`
- `list_plex_sections`
- `browse_plex_show_episodes`
- `browse_plex_children`
- `find_plex_episode`
- `search_plex_library`
- `search_plex_titles`
- `list_plex_duplicates`
- `get_recent_plex_additions`

## Automating the Windows refresh

If you want the host and Plex snapshots to stay fresh without running the command manually, the repo now includes helper scripts for Windows Task Scheduler.

Install a repeating task with the default 30-minute interval:

```powershell
npm run schedule:host-refresh
```

Remove it later:

```powershell
npm run unschedule:host-refresh
```

If you want a different interval, run the PowerShell script directly:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/install-host-refresh-task.ps1 -IntervalMinutes 15
```

This creates a user-level scheduled task named `MCP Home Host Refresh` that runs `scripts/refresh-windows-host.ps1`.

The scheduled task uses a hidden PowerShell window, and `get_snapshot_status` will tell you whether the task is installed plus when it last ran.

## Freshness and natural-language entrypoints

If the server feels stale during testing, start with:

```text
get_snapshot_status
```

That reports:

- whether the last host refresh completed successfully
- whether the scheduled task is installed
- how old each snapshot is
- whether each snapshot is `fresh`, `late`, `stale`, or missing

For day-to-day use, these are the easiest broad entrypoints:

- `find_home` for cross-domain lookup
- `find_docker` for containers, projects, images, networks, and volumes
- `find_notes` for local markdown notes
- `find_plex` for Plex-first searches
- `get_operations_dashboard` for one quick operational overview

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
MCP_OAUTH_STATE_PATH=./state/oauth-state.json
```

If `MCP_OAUTH_PASSWORD` is left blank, the server falls back to `MCP_AUTH_TOKEN` as the login password.

OAuth client registrations and tokens are now persisted to `state/` so ChatGPT reconnects keep working after container restarts or rebuilds.

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

## Production polish notes

The container image now includes a built-in healthcheck against `/health`, and both Compose files wait for `mcp-home` to become healthy before starting Caddy. This gives you a more reliable startup path for local restarts, rebuilds, and tunnel reconnects.

The host refresh path now also records a separate `snapshot-status.json` file, so the MCP server can tell you when the underlying Windows, Docker, and Plex data is old instead of silently answering from stale files.

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

## Troubleshooting

- `npm run smoke:http` hits the wrong target
  The smoke script tries `MCP_HEALTH_URL`, then `127.0.0.1:${PORT}`, then `127.0.0.1:8788`, then the origin derived from `MCP_SERVER_URL`.
- ChatGPT connects but does not show the newest tool list
  Disconnect and reconnect the app, or remove and re-add it, then start a fresh chat.
- Plex or Docker tools return stale data
  Run `npm run refresh:host` on the Windows host, then use `get_snapshot_status` to confirm freshness. If the snapshots keep going stale, install the scheduled refresh task.
- `tailscale` is not recognized in PowerShell
  Use the full executable path, for example `C:\Program Files\Tailscale\tailscale.exe`, or add Tailscale to `PATH`.
- OpenAI or Anthropic tests fail even though ChatGPT works
  ChatGPT subscriptions and API billing are separate. `npm run test:openai:mcp` and `npm run test:anthropic:mcp` need real API keys and a publicly reachable MCP URL.
- Docker or Caddy starts but the stack is not ready yet
  Check `docker ps` and wait for `mcp-home` to become `healthy` before testing the public endpoint.
- The host refresh looks healthy, but results still seem old
  `snapshot-status.json` and `get_snapshot_status` will show whether only one of the three snapshot files is lagging, which is common when Plex export prerequisites are missing.

## Security notes

Keep this server read-only until you trust the deployment path and logging.

- Use long random bearer tokens.
- Keep `allowed_tools` narrow on every remote API call.
- Do not expose shell, SSH, Docker control, or file writes on the same server as broad read-only tools.
- Prefer Tailscale or Cloudflare Tunnel over raw router port forwarding.
- Keep host-generated snapshots in `data/local/` out of version control. They can reveal local library names and machine details.

## Public sharing checklist

Before flipping the repository from private to public:

- confirm `.env`, `data/local/`, `logs/`, and OAuth state files are still ignored
- rotate any real tokens or passwords that were ever used locally, even if they were later removed
- sanity-check `README.md`, sample notes, and `data/homelab-status.json` for anything you would not want indexed publicly
- confirm the included `LICENSE` matches how you want others to reuse the project

## Next steps

Good next additions:

- per-tool auth policy
- a separate admin-only MCP server for higher-risk tools
- richer Plex metadata like actors, directors, narrators, and collections
- broader host telemetry if you want CPU, memory, disk, or UPS-specific dashboards

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
