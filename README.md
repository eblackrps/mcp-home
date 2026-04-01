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
- Windows service, scheduled task, event-log, SMB share, and listening-port visibility from host snapshots
- storage, backup, backup-target, endpoint-health, internet-health, Tailscale, Home Assistant, and public-exposure summaries from the same host snapshot
- snapshot freshness reporting, run history, and stale-data recommendations
- natural-language entrypoints for home, host, Docker, notes, Plex, files, repos, and guided next-check recommendations
- a searchable exported Plex library index plus live Plex activity snapshots
- richer Windows host telemetry for CPU, memory, disks, and network adapters
- deeper Docker inspection for port mappings, exposure classification, mounts, restart patterns, and triage review
- allowlisted file indexing with search, recent-file views, stored text previews, and folder summaries
- local git repo indexing with dirty-state, branch, remote, and recent-activity reporting
- attention and dashboard reports that roll stale snapshots, Docker issues, stopped services, failed tasks, and dirty repos into one view
- split tool profiles so remote HTTP can stay narrower while local stdio stays broader
- OAuth support for ChatGPT and bearer-token support for generic remote clients
- Docker, Caddy, and Tailscale deployment options
- audit logging plus smoke, failure-path, Pester, and production verification scripts

## Tool groups

- Discovery:
  - `list_home_commands`
  - `list_docker_commands`
  - `list_plex_commands`
  - `list_windows_commands`
  - `list_file_commands`
  - `list_repo_commands`
  - `find_home`
  - `find_docker`
  - `find_host`
  - `find_notes`
  - `find_plex`
- Snapshots and dashboards:
  - `get_snapshot_status`
  - `get_snapshot_history`
  - `get_snapshot_recommendations`
  - `get_operations_dashboard`
  - `get_attention_report`
  - `get_daily_digest`
  - `recommend_next_checks`
  - `explain_issue`
  - `summarize_system_state`
- Host and notes:
  - `ping`
  - `get_time`
  - `get_homelab_status`
  - `get_host_status`
  - `get_host_resources`
  - `list_host_disks`
  - `get_host_network_summary`
  - `get_storage_health`
  - `find_low_space_locations`
  - `list_large_folders`
  - `get_backup_status`
  - `get_backup_target_health`
  - `find_failed_backups`
  - `check_endpoint_health`
  - `get_dns_summary`
  - `get_internet_health`
  - `get_tailscale_status`
  - `get_public_exposure_summary`
  - `list_windows_services`
  - `get_windows_service_details`
  - `get_windows_service_issues`
  - `get_windows_event_summary`
  - `search_windows_events`
  - `find_recent_service_failures`
  - `list_scheduled_tasks`
  - `get_scheduled_task_details`
  - `find_failed_tasks`
  - `list_listening_ports`
  - `get_share_status`
  - `get_home_assistant_status`
  - `search_files`
  - `list_recent_files`
  - `read_text_file`
  - `summarize_folder`
  - `list_local_repos`
  - `get_repo_status`
  - `get_recent_repo_activity`
  - `list_notes`
  - `search_notes`
  - `read_note`
- Docker:
  - container status, projects, images, networks, volumes, cleanup candidates, recent activity, resource usage, port maps, exposure reports, mount reports, restart reports, and triage summaries
- Plex:
  - library discovery, title search, natural lookup, show and season summaries, recent additions, on-deck and continue-watching data, unwatched reports, and duplicate detection

For natural requests:

- start with `find_home` when you are not sure whether the answer lives in Plex, Docker, host, files, repos, notes, or homelab data
- start with `find_host` for Windows-machine questions like `memory`, `C:`, `ethernet`, `tailscale`, `backup`, or `32400`
- start with `find_plex` for Plex-first lookups like `Sopranos`, `Sopranos season 2`, or `Pine Barrens`
- use `summarize_system_state` when you want one top-level host, Docker, Plex, storage, backup, and exposure rollup
- use `get_daily_digest` when you want the shortest "what changed and what needs attention" version
- use `recommend_next_checks` when you know the problem area but want the fastest next command shortlist
- use `explain_issue` when you want the current snapshot signals translated into a quick operational explanation
- use `get_snapshot_status` when results feel old or inconsistent
- use `get_snapshot_recommendations` when you want the likely cause of stale or incomplete data

## Tool profiles

The server now supports two tool profiles:

- `full`
  Intended for local and private use. This includes notes, homelab status, host details, deeper Docker inspection, and the full read-only tool surface.
- `public-safe`
  Intended for the remote HTTP path. This keeps high-value read-only Plex and Docker status tooling, but leaves out more private or infrastructure-detailed tools like notes, homelab, host details, Docker mount inspection, and low-level container inventory.

Defaults:

- HTTP uses `public-safe`
- stdio uses `full`

Environment variables:

```text
MCP_HTTP_TOOL_PROFILE=public-safe
MCP_STDIO_TOOL_PROFILE=full
```

You can also override both with `MCP_TOOL_PROFILE`, but the per-transport variables are the better choice when you want ChatGPT to see a narrower surface than local tools.

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
     Run `npm run dev:http`, then `npm run smoke:http`. By default this uses the `public-safe` HTTP profile.
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
   - `npm run verify:error-paths`
   - `npm run smoke:stdio`
   - `npm run smoke:stdio:public-safe`
   - `npm run smoke:http`

9. Run the PowerShell helper regression suite when you change the Windows refresh script:

   ```powershell
   npm run test:pester
   ```

   The repo currently ships with 50 Pester tests covering refresh-script path parsing, event helpers, backup target detection, Tailscale parsing, Docker helper logic, and Plex/git helper transforms.

9. Run just the failure-path regression checks when you want to validate corrupted-snapshot handling and invalid HTTP configuration without running the whole smoke bundle:

   ```powershell
   npm run verify:error-paths
   ```

   This currently verifies:

   - malformed JSON handling for homelab, file-catalog, Plex library, Plex activity, repo-status, snapshot-status, and Windows host snapshot readers
   - startup rejection for invalid `PORT` values in the HTTP transport

If you only want local Claude or another local `stdio` client, you can stop here. You do not need Caddy, Tailscale, ChatGPT OAuth, or separate API keys for that local-only path.

If you want a private full-surface HTTP server for your own LAN or tailnet use, set:

```text
MCP_HTTP_TOOL_PROFILE=full
```

## Windows host refresh

The Docker container cannot see Windows services, scheduled tasks, open listening ports, local repos, iCUE, or Plex directly, so the repo now uses a host-side refresh step that writes read-only JSON snapshots into `data/local/`.

Run this on the Windows host whenever you want fresh system and Plex data:

```powershell
npm run refresh:host
```

That script:

- takes a lightweight lock so overlapping refresh runs do not clobber each other
- writes snapshot files atomically to reduce half-written or partially updated data
- reads Windows uptime plus Docker Desktop, Corsair iCUE, and Plex process or service state
- captures Windows CPU load, memory use, disk capacity, and network adapter telemetry
- captures Windows service state, scheduled task status, and listening TCP or UDP ports
- captures a read-only Docker snapshot from `docker ps -a`, `docker inspect`, `docker stats --no-stream`, `docker image ls`, `docker network ls`, `docker volume ls`, and `docker system df`
- builds an allowlisted file catalog with stored previews for safe text search
- builds a local git repo status snapshot with branch, remote, dirty counts, and last commit activity
- probes the local Plex server at `http://127.0.0.1:32400/identity`
- exports a searchable Plex library index from the local Plex SQLite database
- captures a Plex activity snapshot from local sessions, watch history, continue-watching hubs, on-deck hubs, and unwatched library sections when a local token is available
- writes a freshness and scheduler summary that the MCP server can read back later
- keeps a rolling snapshot refresh history so you can see whether failures are one-off or repeating
- writes:
  - `data/local/snapshot-status.json`
  - `data/local/snapshot-history.json`
  - `data/local/windows-host-status.json`
  - `data/local/file-catalog.json`
  - `data/local/repo-status.json`
  - `data/local/plex-library-index.json`
  - `data/local/plex-activity.json`

The current implementation expects Python 3 on the Windows host for the Plex database export. The MCP server stays read-only and only reads the generated JSON files.

Important: the PowerShell refresh script now also reads `.env` before it resolves snapshot settings. That means storage scan roots, backup keywords, endpoint checks, Tailscale path overrides, file roots, and repo roots can all live in `.env` instead of needing to be exported manually in the shell first.

Once you have refreshed the host data, these tools become useful:

- `list_home_commands`
- `get_snapshot_status`
- `get_snapshot_history`
- `get_snapshot_recommendations`
- `get_operations_dashboard`
- `get_attention_report`
- `get_daily_digest`
- `summarize_system_state`
- `find_home`
- `find_host`
- `find_docker`
- `find_notes`
- `list_windows_commands`
- `list_file_commands`
- `list_repo_commands`
- `list_docker_commands`
- `get_host_status`
- `get_host_resources`
- `list_host_disks`
- `get_host_network_summary`
- `get_storage_health`
- `find_low_space_locations`
- `list_large_folders`
- `get_backup_status`
- `find_failed_backups`
- `check_endpoint_health`
- `get_dns_summary`
- `get_tailscale_status`
- `get_public_exposure_summary`
- `list_windows_services`
- `get_windows_service_details`
- `get_windows_service_issues`
- `list_scheduled_tasks`
- `get_scheduled_task_details`
- `find_failed_tasks`
- `list_listening_ports`
- `search_files`
- `list_recent_files`
- `read_text_file`
- `summarize_folder`
- `list_local_repos`
- `get_repo_status`
- `get_recent_repo_activity`
- `get_docker_exposure_report`
- `get_docker_triage_report`
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

The scheduled task uses a hidden PowerShell window, and `get_snapshot_status` plus `get_snapshot_history` will tell you whether the task is installed, when it last ran, and whether refresh failures are repeating.

## Freshness and natural-language entrypoints

If the server feels stale during testing, start with:

```text
get_snapshot_status
```

Then follow with:

```text
get_snapshot_recommendations
```

That reports:

- whether the last host refresh completed successfully
- whether the scheduled task is installed
- how old each snapshot is
- whether each snapshot is `fresh`, `late`, `stale`, or missing

`get_snapshot_history` adds the recent run timeline, which is especially useful when you are trying to separate a one-time refresh miss from a recurring host-side failure.

For day-to-day use, these are the easiest broad entrypoints:

- `find_home` for cross-domain lookup
- `find_host` for Windows CPU, memory, disk, adapter, service, task, and port questions
- `find_docker` for containers, projects, images, networks, and volumes
- `find_notes` for local markdown notes
- `find_plex` for Plex-first searches
- `summarize_system_state` for the shortest single system rollup
- `get_daily_digest` for the shortest "what changed and what needs follow-up" view
- `get_operations_dashboard` for one quick operational overview
- `get_attention_report` when you want the shortest list of things that need follow-up

On the remote HTTP path, `find_home` will stay inside the tools exposed by the active profile. In the default `public-safe` profile, that means Plex and Docker rather than notes or homelab content.

## File and repo indexing

The new file and repo tools are still read-only, but they depend on explicit snapshot inputs so the server never crawls arbitrary paths live at request time.

Useful `.env` settings:

```text
FILE_INDEX_ROOTS=./notes
FILE_INDEX_TEXT_EXTENSIONS=.md,.txt,.json,.yaml,.yml,.log,.ps1,.ts,.js,.tsx,.jsx
FILE_INDEX_MAX_FILES=500
FILE_INDEX_PREVIEW_CHARS=2000
REPO_SCAN_ROOTS=.
REPO_SCAN_MAX_DEPTH=4
STORAGE_SCAN_ROOTS=.
STORAGE_SCAN_CHILD_LIMIT=15
STORAGE_LOW_SPACE_PERCENT=15
BACKUP_TASK_KEYWORDS=backup,file history,filehistory,regidlebackup,veeam,archive,robocopy,clone
BACKUP_STALE_HOURS=48
NETWORK_ENDPOINT_CHECKS=
NETWORK_CHECK_TIMEOUT_SECONDS=5
TAILSCALE_EXE=
MCP_HEALTH_URL=
```

The defaults are conservative:

- file indexing starts with `./notes`
- repo scanning starts with the current repo root
- both outputs are refreshed only during `npm run refresh:host`

If you widen these roots, keep them intentional. The point is a useful allowlist, not broad filesystem exposure.

Notes:

- `STORAGE_SCAN_ROOTS` controls which folders are scanned for the large-folder and low-space reports.
- `BACKUP_TASK_KEYWORDS` controls which scheduled tasks count as backup-related.
- `NETWORK_ENDPOINT_CHECKS` adds extra endpoint probes in the refresh step. Leave it blank to keep only the built-in defaults.
- `TAILSCALE_EXE` is only needed if Tailscale is installed somewhere non-standard on Windows.
- `MCP_HEALTH_URL` is optional and pins the preferred local MCP health target for both the host refresh and the smoke-test target selection.

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

The HTTP transport now also reports its active tool profile in `/health`, which makes it easier to debug "why does ChatGPT not see this tool?" problems after a deployment.

The verification bundle now includes explicit malformed-snapshot and invalid-`PORT` regression checks, so common broken-config and corrupted-JSON failure modes are exercised before release.

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
- ChatGPT cannot see a note or host-specific tool you can use locally
  Check the active HTTP profile. The default remote profile is `public-safe`, which intentionally hides more private tools. Use `list_home_commands` or `/health` to confirm what is exposed.
- Plex or Docker tools return stale data
  Run `npm run refresh:host` on the Windows host, then use `get_snapshot_status` and `get_snapshot_recommendations` to confirm freshness and see the likely cause. If the snapshots keep going stale, install the scheduled refresh task.
- File search or repo tools show old results
  Run `npm run refresh:host`, then check `get_snapshot_status` for the `fileCatalog` and `repoStatus` entries. If those stay stale, confirm `FILE_INDEX_ROOTS` and `REPO_SCAN_ROOTS` are set to real readable paths.
- `tailscale` is not recognized in PowerShell
  Use the full executable path, for example `C:\Program Files\Tailscale\tailscale.exe`, or add Tailscale to `PATH`.
- OpenAI or Anthropic tests fail even though ChatGPT works
  ChatGPT subscriptions and API billing are separate. `npm run test:openai:mcp` and `npm run test:anthropic:mcp` need real API keys and a publicly reachable MCP URL.
- Docker or Caddy starts but the stack is not ready yet
  Check `docker ps` and wait for `mcp-home` to become `healthy` before testing the public endpoint.
- The host refresh looks healthy, but results still seem old
  `snapshot-status.json`, `snapshot-history.json`, `get_snapshot_status`, and `get_snapshot_recommendations` will show whether only one of the three snapshot files is lagging or whether the refresh has been failing repeatedly, which is common when Plex export prerequisites are missing.

## Security notes

Keep this server read-only until you trust the deployment path and logging.

- Use long random bearer tokens.
- Keep `allowed_tools` narrow on every remote API call.
- Prefer a narrower remote tool profile than your local one.
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
