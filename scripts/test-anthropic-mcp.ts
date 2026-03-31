import "dotenv/config";

type AnthropicResponse = {
  content?: Array<Record<string, unknown>>;
  error?: {
    message?: string;
  };
};

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function assertPublicMcpUrl(rawUrl: string) {
  const url = new URL(rawUrl);
  const host = url.hostname.toLowerCase();

  if (url.protocol !== "https:") {
    throw new Error("MCP_SERVER_URL must use https for Anthropic remote MCP access.");
  }

  if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
    throw new Error("MCP_SERVER_URL cannot point to localhost for Anthropic. Use a public tunnel or domain.");
  }

  return url.toString();
}

async function main() {
  const apiKey = requireEnv("ANTHROPIC_API_KEY");
  const serverUrl = assertPublicMcpUrl(requireEnv("MCP_SERVER_URL"));
  const model = process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-6";
  const authToken = process.env.MCP_AUTH_TOKEN?.trim();

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "mcp-client-2025-11-20"
    },
    body: JSON.stringify({
      model,
      max_tokens: 800,
      messages: [
        {
          role: "user",
          content: "Call get_homelab_status, then read the homelab note and summarize any mismatch."
        }
      ],
      mcp_servers: [
        {
          type: "url",
          url: serverUrl,
          name: "home",
          ...(authToken ? { authorization_token: authToken } : {})
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
            get_homelab_status: {
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

  const body = (await response.json()) as AnthropicResponse;

  if (!response.ok) {
    throw new Error(body.error?.message || `Anthropic request failed with status ${response.status}`);
  }

  const contentTypes = Array.isArray(body.content)
    ? body.content.map((item) => String(item.type ?? "unknown"))
    : [];

  const text = Array.isArray(body.content)
    ? body.content
        .filter((item) => item.type === "text" && typeof item.text === "string")
        .map((item) => String(item.text))
        .join("\n\n")
    : "";

  console.log(
    JSON.stringify(
      {
        model,
        serverUrl,
        contentTypes,
        text: text || null
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

