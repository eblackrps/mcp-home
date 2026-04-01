import "dotenv/config";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { getCriticalToolNames, SERVER_NAME, SERVER_VERSION, type ToolProfile } from "../src/core/server-meta.js";

const authToken = process.env.MCP_AUTH_TOKEN;
const authMode = process.env.MCP_AUTH_MODE?.trim().toLowerCase() || "bearer";

type TextContent = {
  type: "text";
  text: string;
};

function getFirstText(content: unknown): string {
  if (!Array.isArray(content) || content.length === 0) {
    return "";
  }

  const first = content[0];
  if (
    first &&
    typeof first === "object" &&
    "type" in first &&
    "text" in first &&
    (first as TextContent).type === "text" &&
    typeof (first as TextContent).text === "string"
  ) {
    return (first as TextContent).text;
  }

  return "";
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function healthCandidates() {
  const candidates: string[] = [];
  const explicitHealthUrl = process.env.MCP_HEALTH_URL?.trim();
  if (explicitHealthUrl) {
    candidates.push(explicitHealthUrl);
  }

  const port = process.env.PORT?.trim() || "8787";
  candidates.push(`http://127.0.0.1:${port}/health`);
  candidates.push("http://127.0.0.1:8788/health");

  const serverUrl = process.env.MCP_SERVER_URL?.trim();
  if (serverUrl) {
    try {
      const parsed = new URL(serverUrl);
      parsed.pathname = "/health";
      parsed.search = "";
      parsed.hash = "";
      candidates.push(parsed.toString());
    } catch {
      // Ignore invalid MCP_SERVER_URL values during fallback construction.
    }
  }

  return unique(candidates);
}

async function resolveHealthTarget() {
  const attempts: string[] = [];

  for (const candidate of healthCandidates()) {
    try {
      const response = await fetch(candidate);
      if (!response.ok) {
        attempts.push(`${candidate} -> HTTP ${response.status}`);
        continue;
      }

      const health = (await response.json()) as { ok?: boolean; name?: string; toolProfile?: ToolProfile };
      return { healthUrl: candidate, health };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      attempts.push(`${candidate} -> ${message}`);
    }
  }

  throw new Error(`Unable to reach any health endpoint.\n${attempts.map((attempt) => `- ${attempt}`).join("\n")}`);
}

async function main() {
  const { healthUrl, health } = await resolveHealthTarget();
  const baseUrl = new URL(healthUrl).origin;
  const serverUrl = `${baseUrl}/mcp`;

  if (authMode === "oauth") {
    const protectedResourceMetadataUrl = `${baseUrl}/.well-known/oauth-protected-resource/mcp`;
    const metadataResponse = await fetch(protectedResourceMetadataUrl);
    if (!metadataResponse.ok) {
      throw new Error(`Protected resource metadata failed with status ${metadataResponse.status}`);
    }

    const authProbe = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "probe",
        method: "initialize",
        params: {
          protocolVersion: "2025-11-05",
          capabilities: {},
          clientInfo: { name: "oauth-smoke-test", version: SERVER_VERSION }
        }
      })
    });

    if (authProbe.status !== 401) {
      throw new Error(`Expected /mcp to require OAuth with 401, got ${authProbe.status}`);
    }

    console.log(
      JSON.stringify(
        {
          healthUrl,
          health,
          authMode,
          protectedResourceMetadataUrl,
          wwwAuthenticate: authProbe.headers.get("www-authenticate")
        },
        null,
        2
      )
    );
    return;
  }

  const transport = new StreamableHTTPClientTransport(new URL(serverUrl), {
    requestInit: authToken
      ? {
          headers: {
            Authorization: `Bearer ${authToken}`
          }
        }
      : undefined
  });

  const client = new Client({ name: "mcp-home-smoke-test", version: SERVER_VERSION });
  await client.connect(transport);

  try {
    const tools = await client.listTools();
    const toolNames = tools.tools.map((tool) => tool.name);
    const toolProfile = health.toolProfile ?? "full";
    const missingTools = getCriticalToolNames(toolProfile).filter((toolName) => !toolNames.includes(toolName));
    if (missingTools.length > 0) {
      throw new Error(`Missing critical tools from the advertised list: ${missingTools.join(", ")}`);
    }

    const plex = await client.callTool({
      name: "find_plex",
      arguments: { query: "Sopranos" }
    });
    const docker = await client.callTool({
      name: "get_docker_status",
      arguments: {}
    });
    const snapshot = await client.callTool({
      name: "get_snapshot_status",
      arguments: {}
    });
    const dashboard = await client.callTool({
      name: "get_operations_dashboard",
      arguments: {}
    });
    const digest = await client.callTool({
      name: "get_daily_digest",
      arguments: {}
    });
    const systemState = await client.callTool({
      name: "summarize_system_state",
      arguments: {}
    });
    const home = await client.callTool({
      name: "find_home",
      arguments: { query: "Sopranos", limit: 3 }
    });

    const plexText = getFirstText(plex.content);
    const dockerText = getFirstText(docker.content);
    const snapshotText = getFirstText(snapshot.content);
    const dashboardText = getFirstText(dashboard.content);
    const digestText = getFirstText(digest.content);
    const systemStateText = getFirstText(systemState.content);
    const homeText = getFirstText(home.content);

    if (!plexText.toLowerCase().includes("sopranos")) {
      throw new Error("find_plex did not return the expected Plex match");
    }

    if (!dockerText.includes("Docker")) {
      throw new Error("get_docker_status did not return the expected Docker summary");
    }

    if (!snapshotText.includes("Overall freshness")) {
      throw new Error("get_snapshot_status did not return the expected snapshot summary");
    }

    if (!dashboardText.includes("Snapshot freshness")) {
      throw new Error("get_operations_dashboard did not return the expected dashboard summary");
    }

    if (!digestText.includes("Daily digest")) {
      throw new Error("get_daily_digest did not return the expected daily digest summary");
    }

    if (!systemStateText.includes("System state summary")) {
      throw new Error("summarize_system_state did not return the expected system state summary");
    }

    if (!homeText.toLowerCase().includes("sopranos")) {
      throw new Error("find_home did not return the expected natural-language match");
    }

    console.log(
      JSON.stringify(
        {
          healthUrl,
          health,
          serverName: SERVER_NAME,
          toolProfile,
          toolNames,
          plexPreview: plexText.slice(0, 120),
          dockerPreview: dockerText.slice(0, 120),
          snapshotPreview: snapshotText.slice(0, 120),
          dashboardPreview: dashboardText.slice(0, 120),
          digestPreview: digestText.slice(0, 120),
          systemStatePreview: systemStateText.slice(0, 120),
          homePreview: homeText.slice(0, 120)
        },
        null,
        2
      )
    );
  } finally {
    await transport.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
