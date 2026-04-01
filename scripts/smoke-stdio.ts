import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CRITICAL_TOOL_NAMES, SERVER_NAME, SERVER_VERSION } from "../src/core/server-meta.js";

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
  const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/index-stdio.js"]
  });

  const client = new Client({ name: "mcp-home-stdio-smoke", version: SERVER_VERSION });
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
    const snapshot = await client.callTool({
      name: "get_snapshot_status",
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
    const dockerPorts = await client.callTool({
      name: "get_docker_port_map",
      arguments: { project: "mcphome", limit: 5 }
    });

    const noteText = getFirstText(note.content);
    const plexText = getFirstText(plex.content);
    const dockerText = getFirstText(docker.content);
    const snapshotText = getFirstText(snapshot.content);
    const dashboardText = getFirstText(dashboard.content);
    const homeText = getFirstText(home.content);
    const portText = getFirstText(dockerPorts.content);

    if (!noteText.includes("NAS: online")) {
      throw new Error("read_note did not return the expected homelab note");
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

    if (!dashboardText.includes("Snapshot freshness")) {
      throw new Error("get_operations_dashboard did not return the expected dashboard summary");
    }

    if (!homeText.toLowerCase().includes("sopranos")) {
      throw new Error("find_home did not return the expected natural-language match");
    }

    if (!portText.toLowerCase().includes("ports")) {
      throw new Error("get_docker_port_map did not return the expected port mapping summary");
    }

    console.log(
      JSON.stringify(
        {
          serverName: SERVER_NAME,
          toolCount: toolNames.length,
          notePreview: noteText.slice(0, 120),
          plexPreview: plexText.slice(0, 120),
          dockerPreview: dockerText.slice(0, 120),
          snapshotPreview: snapshotText.slice(0, 120),
          dashboardPreview: dashboardText.slice(0, 120),
          homePreview: homeText.slice(0, 120),
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
