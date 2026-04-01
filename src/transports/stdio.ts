import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { formatRegisteredToolList, resolveToolProfile } from "../core/server-meta.js";
import { createServer } from "../core/tools.js";
import { log } from "../core/logger.js";

export async function startStdio() {
  const toolProfile = resolveToolProfile(process.env.MCP_STDIO_TOOL_PROFILE ?? process.env.MCP_TOOL_PROFILE, "full");
  const server = createServer({ profile: toolProfile });
  const transport = new StdioServerTransport();

  log(`starting stdio transport with profile ${toolProfile} and tools ${formatRegisteredToolList(toolProfile)}`);
  await server.connect(transport);
}
