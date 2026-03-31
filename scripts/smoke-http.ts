import "dotenv/config";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CRITICAL_TOOL_NAMES, SERVER_NAME } from "../src/core/server-meta.js";

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

      const health = (await response.json()) as { ok?: boolean; name?: string };
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
          clientInfo: { name: "oauth-smoke-test", version: "0.2.13" }
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

  const client = new Client({ name: "mcp-home-smoke-test", version: "0.2.13" });
  await client.connect(transport);

  try {
    const tools = await client.listTools();
    const toolNames = tools.tools.map((tool) => tool.name);
    const missingTools = CRITICAL_TOOL_NAMES.filter((toolName) => !toolNames.includes(toolName));
    if (missingTools.length > 0) {
      throw new Error(`Missing critical tools from the advertised list: ${missingTools.join(", ")}`);
    }

    const note = await client.callTool({
      name: "read_note",
      arguments: { slug: "homelab" }
    });
    const plex = await client.callTool({
      name: "find_plex",
      arguments: { query: "Sopranos" }
    });
    const docker = await client.callTool({
      name: "get_docker_status",
      arguments: {}
    });

    const noteText = getFirstText(note.content);
    const plexText = getFirstText(plex.content);
    const dockerText = getFirstText(docker.content);

    if (!noteText.includes("NAS: online")) {
      throw new Error("read_note did not return the expected homelab note");
    }

    if (!plexText.toLowerCase().includes("sopranos")) {
      throw new Error("find_plex did not return the expected Plex match");
    }

    if (!dockerText.includes("Docker")) {
      throw new Error("get_docker_status did not return the expected Docker summary");
    }

    console.log(
      JSON.stringify(
        {
          healthUrl,
          health,
          serverName: SERVER_NAME,
          toolNames,
          notePreview: noteText.slice(0, 120),
          plexPreview: plexText.slice(0, 120),
          dockerPreview: dockerText.slice(0, 120)
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
