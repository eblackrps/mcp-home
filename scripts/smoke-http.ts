import "dotenv/config";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const serverUrl = process.env.MCP_SERVER_URL ?? "http://127.0.0.1:8787/mcp";
const healthUrl = process.env.MCP_HEALTH_URL ?? "http://127.0.0.1:8787/health";
const authToken = process.env.MCP_AUTH_TOKEN;

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
  const healthResponse = await fetch(healthUrl);
  if (!healthResponse.ok) {
    throw new Error(`Health check failed with status ${healthResponse.status}`);
  }

  const health = await healthResponse.json();

  const transport = new StreamableHTTPClientTransport(new URL(serverUrl), {
    requestInit: authToken
      ? {
          headers: {
            Authorization: `Bearer ${authToken}`
          }
        }
      : undefined
  });

  const client = new Client({ name: "mcp-home-smoke-test", version: "0.1.0" });
  await client.connect(transport);

  try {
    const tools = await client.listTools();
    const homelab = await client.callTool({
      name: "get_homelab_status",
      arguments: {}
    });
    const note = await client.callTool({
      name: "read_note",
      arguments: { slug: "homelab" }
    });

    const homelabText = getFirstText(homelab.content);
    const noteText = getFirstText(note.content);

    if (!tools.tools.some((tool) => tool.name === "get_homelab_status")) {
      throw new Error("get_homelab_status is missing from the advertised tool list");
    }

    if (!homelabText.includes("Services:")) {
      throw new Error("get_homelab_status did not return the expected summary");
    }

    if (!noteText.includes("NAS: online")) {
      throw new Error("read_note did not return the expected homelab note");
    }

    console.log(
      JSON.stringify(
        {
          health,
          toolNames: tools.tools.map((tool) => tool.name),
          homelabPreview: homelabText.slice(0, 120),
          notePreview: noteText.slice(0, 120)
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
