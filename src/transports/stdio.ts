import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "../core/tools.js";
import { log } from "../core/logger.js";

export async function startStdio() {
  const server = createServer();
  const transport = new StdioServerTransport();

  log("starting stdio transport with tools ping, get_time, list_notes, search_notes, read_note");
  await server.connect(transport);
}
