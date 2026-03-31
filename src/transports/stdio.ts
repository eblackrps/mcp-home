import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { formatRegisteredToolList } from "../core/server-meta.js";
import { createServer } from "../core/tools.js";
import { log } from "../core/logger.js";

export async function startStdio() {
  const server = createServer();
  const transport = new StdioServerTransport();

  log(`starting stdio transport with tools ${formatRegisteredToolList()}`);
  await server.connect(transport);
}
