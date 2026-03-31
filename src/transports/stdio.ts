import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "../core/tools.js";
import { log } from "../core/logger.js";

export async function startStdio() {
  const server = createServer();
  const transport = new StdioServerTransport();

  log(
    "starting stdio transport with tools ping, get_time, get_homelab_status, get_host_status, get_docker_status, list_docker_containers, get_plex_status, list_plex_sections, search_plex_library, search_plex_titles, get_recent_plex_additions, list_notes, search_notes, read_note"
  );
  await server.connect(transport);
}
