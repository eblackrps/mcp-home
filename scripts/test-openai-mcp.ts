import "dotenv/config";

type OpenAIResponse = {
  output_text?: string;
  output?: Array<Record<string, unknown>>;
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
    throw new Error("MCP_SERVER_URL must use https for OpenAI remote MCP access.");
  }

  if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
    throw new Error("MCP_SERVER_URL cannot point to localhost for OpenAI. Use a public tunnel or domain.");
  }

  return url.toString();
}

async function main() {
  const apiKey = requireEnv("OPENAI_API_KEY");
  const serverUrl = assertPublicMcpUrl(requireEnv("MCP_SERVER_URL"));
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-5";
  const authToken = process.env.MCP_AUTH_TOKEN?.trim();

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      input: "Call get_homelab_status, then read the homelab note and summarize any mismatch.",
      tools: [
        {
          type: "mcp",
          server_label: "home",
          server_url: serverUrl,
          require_approval: "never",
          allowed_tools: ["get_homelab_status", "read_note"],
          ...(authToken ? { authorization: authToken } : {})
        }
      ]
    })
  });

  const body = (await response.json()) as OpenAIResponse;

  if (!response.ok) {
    throw new Error(body.error?.message || `OpenAI request failed with status ${response.status}`);
  }

  console.log(
    JSON.stringify(
      {
        model,
        serverUrl,
        outputText: body.output_text ?? null,
        outputItemTypes: Array.isArray(body.output)
          ? body.output.map((item) => String(item.type ?? "unknown"))
          : []
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

