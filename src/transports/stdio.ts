import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "../core/tools.js";
import { log } from "../core/logger.js";

export async function startStdio() {
  const server = createServer();
  const transport = new StdioServerTransport();

  log(
    "starting stdio transport with tools ping, get_time, list_docker_commands, list_plex_commands, find_plex, get_homelab_status, get_host_status, get_docker_status, list_docker_containers, get_docker_projects, get_docker_issues, get_docker_container_details, list_docker_images, list_docker_networks, get_docker_resource_usage, get_docker_recent_activity, get_docker_compose_health, get_docker_project_details, list_docker_volumes, get_docker_cleanup_candidates, get_plex_status, get_plex_server_activity, get_plex_now_playing, get_plex_recently_watched, get_plex_continue_watching, get_plex_on_deck, find_plex_unwatched, get_plex_item_details, browse_plex_by_genre, browse_plex_by_decade, get_plex_library_stats, get_plex_show_summary, get_plex_season_summary, get_recently_aired_episodes, find_plex_series_gaps, list_plex_sections, browse_plex_show_episodes, browse_plex_children, find_plex_episode, search_plex_library, search_plex_titles, list_plex_duplicates, get_recent_plex_additions, list_notes, search_notes, read_note"
  );
  await server.connect(transport);
}
