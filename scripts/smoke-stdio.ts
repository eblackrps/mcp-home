import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  getCriticalToolNames,
  resolveToolProfile,
  SERVER_NAME,
  SERVER_VERSION
} from "../src/core/server-meta.js";

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

async function main() {
  const toolProfile = resolveToolProfile(process.env.MCP_STDIO_TOOL_PROFILE ?? process.env.MCP_TOOL_PROFILE, "full");
  const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/index-stdio.js"],
    env: {
      ...process.env,
      MCP_STDIO_TOOL_PROFILE: toolProfile
    } as Record<string, string>
  });

  const client = new Client({ name: "mcp-home-stdio-smoke", version: SERVER_VERSION });
  await client.connect(transport);

  try {
    const tools = await client.listTools();
    const toolNames = tools.tools.map((tool) => tool.name);
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
    const snapshotHistory = await client.callTool({
      name: "get_snapshot_history",
      arguments: { limit: 3 }
    });
    const snapshotRecommendations = await client.callTool({
      name: "get_snapshot_recommendations",
      arguments: {}
    });
    const dashboard = await client.callTool({
      name: "get_operations_dashboard",
      arguments: {}
    });
    const home = await client.callTool({
      name: "find_home",
      arguments: { query: "Sopranos", limit: 3 }
    });

    const plexText = getFirstText(plex.content);
    const dockerText = getFirstText(docker.content);
    const snapshotText = getFirstText(snapshot.content);
    const snapshotHistoryText = getFirstText(snapshotHistory.content);
    const snapshotRecommendationsText = getFirstText(snapshotRecommendations.content);
    const dashboardText = getFirstText(dashboard.content);
    const homeText = getFirstText(home.content);
    let portText = "";
    let hostResourcesText = "";
    let dockerTriageText = "";
    let hostFindText = "";
    if (toolNames.includes("get_docker_port_map")) {
      const dockerPorts = await client.callTool({
        name: "get_docker_port_map",
        arguments: { project: "mcphome", limit: 5 }
      });
      portText = getFirstText(dockerPorts.content);
    }
    if (toolNames.includes("get_host_resources")) {
      const hostResources = await client.callTool({
        name: "get_host_resources",
        arguments: {}
      });
      hostResourcesText = getFirstText(hostResources.content);
    }
    if (toolNames.includes("get_docker_triage_report")) {
      const dockerTriage = await client.callTool({
        name: "get_docker_triage_report",
        arguments: { sinceHours: 168 }
      });
      dockerTriageText = getFirstText(dockerTriage.content);
    }
    if (toolNames.includes("find_host")) {
      const hostFind = await client.callTool({
        name: "find_host",
        arguments: { query: "memory", limit: 3 }
      });
      hostFindText = getFirstText(hostFind.content);
    }

    if (!plexText.toLowerCase().includes("sopranos")) {
      throw new Error("find_plex did not return the expected Plex match");
    }

    if (!dockerText.includes("Docker")) {
      throw new Error("get_docker_status did not return the expected Docker summary");
    }

    if (!snapshotText.includes("Overall freshness")) {
      throw new Error("get_snapshot_status did not return the expected snapshot summary");
    }

    if (!snapshotHistoryText.includes("Snapshot history")) {
      throw new Error("get_snapshot_history did not return the expected history summary");
    }

    if (!snapshotRecommendationsText.includes("Snapshot recommendations")) {
      throw new Error("get_snapshot_recommendations did not return the expected recommendation summary");
    }

    if (!dashboardText.includes("Snapshot freshness")) {
      throw new Error("get_operations_dashboard did not return the expected dashboard summary");
    }

    if (!homeText.toLowerCase().includes("sopranos")) {
      throw new Error("find_home did not return the expected natural-language match");
    }

    if (toolNames.includes("get_docker_port_map") && !portText.toLowerCase().includes("ports")) {
      throw new Error("get_docker_port_map did not return the expected port mapping summary");
    }

    if (toolNames.includes("get_host_resources") && !hostResourcesText.includes("Windows host resources")) {
      throw new Error("get_host_resources did not return the expected host resource summary");
    }

    if (toolNames.includes("get_docker_triage_report") && !dockerTriageText.includes("Docker triage report")) {
      throw new Error("get_docker_triage_report did not return the expected triage summary");
    }

    if (toolNames.includes("find_host") && !hostFindText.toLowerCase().includes("memory")) {
      throw new Error("find_host did not return the expected host match");
    }

    console.log(
      JSON.stringify(
        {
          serverName: SERVER_NAME,
          toolProfile,
          toolCount: toolNames.length,
          plexPreview: plexText.slice(0, 120),
          dockerPreview: dockerText.slice(0, 120),
          snapshotPreview: snapshotText.slice(0, 120),
          snapshotHistoryPreview: snapshotHistoryText.slice(0, 120),
          snapshotRecommendationsPreview: snapshotRecommendationsText.slice(0, 120),
          dashboardPreview: dashboardText.slice(0, 120),
          homePreview: homeText.slice(0, 120),
          hostResourcesPreview: hostResourcesText.slice(0, 120),
          hostFindPreview: hostFindText.slice(0, 120),
          dockerTriagePreview: dockerTriageText.slice(0, 120),
          portPreview: portText.slice(0, 120)
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
