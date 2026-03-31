import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatHomelabStatus, readHomelabStatus } from "./homelab.js";
import {
  formatDockerContainers,
  formatDockerStatus,
  formatPlexStatus,
  formatWindowsHostStatus,
  readWindowsHostStatus
} from "./host.js";
import { loadAllNotes, readNoteBySlug, searchNotes } from "./notes.js";
import {
  browsePlexByGenre,
  browsePlexShowEpisodes,
  browsePlexChildren,
  findPlexEpisodes,
  formatPlexGenreBrowse,
  formatPlexEpisodes,
  formatPlexChildren,
  formatPlexDuplicates,
  formatPlexItemDetails,
  formatPlexLibraryStats,
  formatPlexShowEpisodes,
  formatPlexShowSummary,
  formatPlexSearchResults,
  formatPlexTitleSearchResults,
  formatPlexSections,
  formatRecentPlexAdditions,
  getPlexShowSummary,
  getPlexItemDetails,
  getPlexLibraryStats,
  getRecentPlexAdditions,
  listPlexDuplicates,
  readPlexLibraryIndex,
  searchPlexLibrary,
  searchPlexTitles
} from "./plex.js";
import {
  formatPlexContinueWatching,
  formatPlexNowPlaying,
  formatPlexRecentlyWatched,
  formatPlexServerActivity,
  readPlexActivitySnapshot
} from "./plex-activity.js";
import { auditToolCall, log, summarizeArgs } from "./logger.js";

const DEFAULT_NOTES_DIR = path.resolve(fileURLToPath(new URL("../../notes", import.meta.url)));

function formatListEntry(slug: string, title: string, tags: string[]) {
  const suffix = tags.length > 0 ? ` | tags: ${tags.join(", ")}` : "";
  return `- ${slug} | ${title}${suffix}`;
}

async function withAudit<T>(
  tool: string,
  args: Record<string, unknown> | undefined,
  run: () => Promise<T>
): Promise<T> {
  const startedAt = Date.now();
  const argSummary = summarizeArgs(args);

  try {
    const result = await run();
    await auditToolCall({
      tool,
      ok: true,
      startedAt,
      argSummary
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await auditToolCall({
      tool,
      ok: false,
      startedAt,
      argSummary,
      error: message
    });
    throw error;
  }
}

export function createServer() {
  const server = new McpServer({
    name: "mcp-home",
    version: "0.2.5"
  });

  const notesDir = process.env.NOTES_DIR ?? DEFAULT_NOTES_DIR;

  server.tool("ping", "Use this to verify that the MCP server is reachable.", {}, async () => {
    return withAudit("ping", undefined, async () => ({
      content: [{ type: "text", text: "pong" }]
    }));
  });

  server.tool(
    "get_time",
    "Use this to get the current server time in ISO 8601 format.",
    {},
    async () => {
      return withAudit("get_time", undefined, async () => ({
        content: [{ type: "text", text: new Date().toISOString() }]
      }));
    }
  );

  server.tool(
    "get_homelab_status",
    "Use this to read the current homelab status summary from a local JSON snapshot. Optionally filter by service name.",
    {
      service: z.string().min(1).optional().describe("Optional service name filter, for example nas or backups")
    },
    async ({ service }) => {
      return withAudit("get_homelab_status", { service }, async () => {
        try {
          const status = await readHomelabStatus();
          return {
            content: [{ type: "text", text: formatHomelabStatus(status, service) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool get_homelab_status returned error", message);
          return {
            content: [{ type: "text", text: `Unable to read homelab status: ${message}` }],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "get_host_status",
    "Use this to read the current Windows host status snapshot, including Docker Desktop, Corsair iCUE, Plex, and system uptime. Optionally filter by component name.",
    {
      component: z
        .string()
        .min(1)
        .optional()
        .describe("Optional component filter, for example system, docker, corsair, or plex")
    },
    async ({ component }) => {
      return withAudit("get_host_status", { component }, async () => {
        try {
          const status = await readWindowsHostStatus();
          return {
            content: [{ type: "text", text: formatWindowsHostStatus(status, component) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool get_host_status returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to read Windows host status: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "get_docker_status",
    "Use this to read the current Docker Desktop and container summary from the local Windows host snapshot.",
    {},
    async () => {
      return withAudit("get_docker_status", undefined, async () => {
        try {
          const status = await readWindowsHostStatus();
          return {
            content: [{ type: "text", text: formatDockerStatus(status) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool get_docker_status returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to read Docker status: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "list_docker_containers",
    "Use this to list Docker containers from the local Windows host snapshot, with optional name or state filters.",
    {
      name: z.string().min(1).optional().describe("Optional container name or image substring filter"),
      state: z
        .enum(["running", "exited", "paused", "restarting", "created", "dead"])
        .optional()
        .describe("Optional Docker state filter"),
      limit: z.number().int().min(1).max(50).optional().describe("Maximum number of containers to return, from 1 to 50")
    },
    async ({ name, state, limit }) => {
      return withAudit("list_docker_containers", { name, state, limit }, async () => {
        try {
          const status = await readWindowsHostStatus();
          return {
            content: [{ type: "text", text: formatDockerContainers(status, { name, state, limit }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool list_docker_containers returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to list Docker containers: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "get_plex_status",
    "Use this to read the current Plex server status and library summary from the local Windows host snapshot.",
    {},
    async () => {
      return withAudit("get_plex_status", undefined, async () => {
        try {
          const status = await readWindowsHostStatus();
          return {
            content: [{ type: "text", text: formatPlexStatus(status) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool get_plex_status returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to read Plex status: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "get_plex_server_activity",
    "Use this to read the current Plex activity snapshot, including active sessions and the latest watched item.",
    {},
    async () => {
      return withAudit("get_plex_server_activity", undefined, async () => {
        try {
          const snapshot = await readPlexActivitySnapshot();
          return {
            content: [{ type: "text", text: formatPlexServerActivity(snapshot) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool get_plex_server_activity returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to read Plex activity: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "get_plex_now_playing",
    "Use this to list active Plex playback sessions from the latest local activity snapshot.",
    {},
    async () => {
      return withAudit("get_plex_now_playing", undefined, async () => {
        try {
          const snapshot = await readPlexActivitySnapshot();
          return {
            content: [{ type: "text", text: formatPlexNowPlaying(snapshot) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool get_plex_now_playing returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to read Plex now-playing sessions: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "get_plex_recently_watched",
    "Use this to list recently watched Plex items from the latest local activity snapshot.",
    {
      limit: z.number().int().min(1).max(25).optional().describe("Maximum number of recently watched items to return, from 1 to 25")
    },
    async ({ limit }) => {
      return withAudit("get_plex_recently_watched", { limit }, async () => {
        try {
          const snapshot = await readPlexActivitySnapshot();
          return {
            content: [{ type: "text", text: formatPlexRecentlyWatched(snapshot, limit) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool get_plex_recently_watched returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to read Plex recently watched items: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "get_plex_continue_watching",
    "Use this to list Plex continue-watching recommendations from the latest local activity snapshot.",
    {
      limit: z.number().int().min(1).max(25).optional().describe("Maximum number of continue-watching items to return, from 1 to 25")
    },
    async ({ limit }) => {
      return withAudit("get_plex_continue_watching", { limit }, async () => {
        try {
          const snapshot = await readPlexActivitySnapshot();
          return {
            content: [{ type: "text", text: formatPlexContinueWatching(snapshot, limit) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool get_plex_continue_watching returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to read Plex continue-watching items: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "get_plex_item_details",
    "Use this to get detailed Plex matches for a specific movie, show, album, artist, track, or episode title.",
    {
      title: z.string().min(1).describe("The item title to look up in Plex"),
      itemType: z
        .enum(["movie", "show", "episode", "artist", "album", "track"])
        .optional()
        .describe("Optional Plex item type filter"),
      section: z.string().min(1).optional().describe("Optional Plex section name filter"),
      limit: z.number().int().min(1).max(10).optional().describe("Maximum number of matching items to return, from 1 to 10")
    },
    async ({ title, itemType, section, limit }) => {
      return withAudit("get_plex_item_details", { title, itemType, section, limit }, async () => {
        try {
          const index = await readPlexLibraryIndex();
          const results = getPlexItemDetails(index, { title, itemType, section, limit });

          return {
            content: [{ type: "text", text: formatPlexItemDetails(results, index, { title, itemType, section, limit }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool get_plex_item_details returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to read Plex item details: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "browse_plex_by_genre",
    "Use this to browse Plex movies, shows, or albums by genre.",
    {
      genre: z.string().min(1).describe("Genre name or phrase to browse for, for example science fiction or audiobook"),
      mediaType: z
        .enum(["movie", "tv", "audio"])
        .optional()
        .describe("Optional media filter: movie for films, tv for series, or audio for albums"),
      section: z.string().min(1).optional().describe("Optional Plex section name filter"),
      limit: z.number().int().min(1).max(25).optional().describe("Maximum number of matching items to return, from 1 to 25")
    },
    async ({ genre, mediaType, section, limit }) => {
      return withAudit("browse_plex_by_genre", { genre, mediaType, section, limit }, async () => {
        try {
          const index = await readPlexLibraryIndex();
          const results = browsePlexByGenre(index, { genre, mediaType, section, limit });

          return {
            content: [{ type: "text", text: formatPlexGenreBrowse(results, index, { genre, mediaType, section, limit }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool browse_plex_by_genre returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to browse Plex by genre: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "get_plex_library_stats",
    "Use this to summarize Plex library counts, top genres, duplicate groups, and recent additions.",
    {
      mediaType: z
        .enum(["movie", "tv", "audio"])
        .optional()
        .describe("Optional media filter: movie, tv, or audio"),
      section: z.string().min(1).optional().describe("Optional Plex section name filter"),
      topGenreLimit: z.number().int().min(1).max(20).optional().describe("Maximum number of top genres to report, from 1 to 20")
    },
    async ({ mediaType, section, topGenreLimit }) => {
      return withAudit("get_plex_library_stats", { mediaType, section, topGenreLimit }, async () => {
        try {
          const index = await readPlexLibraryIndex();
          const stats = getPlexLibraryStats(index, { mediaType, section, topGenreLimit });

          return {
            content: [{ type: "text", text: formatPlexLibraryStats(stats, index, { mediaType, section, topGenreLimit }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool get_plex_library_stats returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to summarize Plex library stats: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "get_plex_show_summary",
    "Use this to summarize a Plex show with episode counts, seasons, genres, and recent additions.",
    {
      showTitle: z.string().min(1).describe("The show title to summarize")
    },
    async ({ showTitle }) => {
      return withAudit("get_plex_show_summary", { showTitle }, async () => {
        try {
          const index = await readPlexLibraryIndex();
          const summary = getPlexShowSummary(index, { showTitle });

          return {
            content: [{ type: "text", text: formatPlexShowSummary(summary, index, { showTitle }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool get_plex_show_summary returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to summarize Plex show: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "list_plex_sections",
    "Use this to list the available Plex library sections from the local exported index.",
    {},
    async () => {
      return withAudit("list_plex_sections", undefined, async () => {
        try {
          const index = await readPlexLibraryIndex();
          return {
            content: [{ type: "text", text: formatPlexSections(index) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool list_plex_sections returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to list Plex sections: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "browse_plex_show_episodes",
    "Use this to browse Plex show episodes with proper season and episode ordering.",
    {
      showTitle: z.string().min(1).describe("The show title whose episodes you want to browse"),
      seasonIndex: z.number().int().min(1).optional().describe("Optional season number filter"),
      limit: z.number().int().min(1).max(100).optional().describe("Maximum number of episodes to return, from 1 to 100")
    },
    async ({ showTitle, seasonIndex, limit }) => {
      return withAudit("browse_plex_show_episodes", { showTitle, seasonIndex, limit }, async () => {
        try {
          const index = await readPlexLibraryIndex();
          const episodes = browsePlexShowEpisodes(index, { showTitle, seasonIndex, limit });

          return {
            content: [{ type: "text", text: formatPlexShowEpisodes(episodes, index, { showTitle, seasonIndex, limit }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool browse_plex_show_episodes returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to browse Plex show episodes: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "browse_plex_children",
    "Use this to browse episodes for a show, albums for an artist, or tracks for an album from the local Plex index.",
    {
      parentTitle: z.string().min(1).describe("The show, artist, or album title whose children you want to browse"),
      parentType: z
        .enum(["show", "artist", "album"])
        .describe("Choose show for episodes, artist for albums, or album for tracks"),
      section: z.string().min(1).optional().describe("Optional Plex section name filter"),
      limit: z.number().int().min(1).max(50).optional().describe("Maximum number of child items to return, from 1 to 50")
    },
    async ({ parentTitle, parentType, section, limit }) => {
      return withAudit("browse_plex_children", { parentTitle, parentType, section, limit }, async () => {
        try {
          const index = await readPlexLibraryIndex();
          const results = browsePlexChildren(index, { parentTitle, parentType, section, limit });

          return {
            content: [
              { type: "text", text: formatPlexChildren(results, index, { parentTitle, parentType, section, limit }) }
            ]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool browse_plex_children returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to browse Plex children: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "find_plex_episode",
    "Use this to search Plex episodes by episode title, optionally restricted to a specific show.",
    {
      query: z.string().min(1).describe("Episode title or phrase to search for"),
      showTitle: z.string().min(1).optional().describe("Optional show title filter"),
      limit: z.number().int().min(1).max(25).optional().describe("Maximum number of matching episodes to return, from 1 to 25")
    },
    async ({ query, showTitle, limit }) => {
      return withAudit("find_plex_episode", { query, showTitle, limit }, async () => {
        try {
          const index = await readPlexLibraryIndex();
          const episodes = findPlexEpisodes(index, { query, showTitle, limit });

          return {
            content: [{ type: "text", text: formatPlexEpisodes(episodes, index, { query, showTitle, limit }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool find_plex_episode returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to search Plex episodes: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "search_plex_library",
    "Use this to search the local Plex library index by title, with optional section and item type filters.",
    {
      query: z.string().min(1).describe("Title or phrase to search for in Plex"),
      section: z.string().min(1).optional().describe("Optional library section name, for example Movies or TV Shows"),
      itemType: z
        .enum(["movie", "show", "season", "episode", "artist", "album", "track"])
        .optional()
        .describe("Optional Plex item type filter"),
      limit: z.number().int().min(1).max(25).optional().describe("Maximum number of results to return, from 1 to 25")
    },
    async ({ query, section, itemType, limit }) => {
      return withAudit("search_plex_library", { query, section, itemType, limit }, async () => {
        try {
          const index = await readPlexLibraryIndex();
          const results = searchPlexLibrary(index, { query, section, itemType, limit });

          return {
            content: [{ type: "text", text: formatPlexSearchResults(results, index, { query, section, itemType, limit }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool search_plex_library returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to search Plex: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "search_plex_titles",
    "Use this to search Plex titles by media type when you specifically want movies, TV shows, or audio titles.",
    {
      query: z.string().min(1).describe("Title or phrase to search for in Plex titles"),
      mediaType: z
        .enum(["movie", "tv", "audio"])
        .describe("Choose movie for films, tv for series titles, or audio for artist, album, or track titles"),
      limit: z.number().int().min(1).max(25).optional().describe("Maximum number of results to return, from 1 to 25")
    },
    async ({ query, mediaType, limit }) => {
      return withAudit("search_plex_titles", { query, mediaType, limit }, async () => {
        try {
          const index = await readPlexLibraryIndex();
          const results = searchPlexTitles(index, { query, mediaType, limit });

          return {
            content: [{ type: "text", text: formatPlexTitleSearchResults(results, index, { query, mediaType, limit }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool search_plex_titles returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to search Plex titles: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "list_plex_duplicates",
    "Use this to find duplicate Plex titles grouped by title, type, and section.",
    {
      section: z.string().min(1).optional().describe("Optional Plex section name filter"),
      itemType: z
        .enum(["movie", "show", "episode", "artist", "album", "track"])
        .optional()
        .describe("Optional Plex item type filter"),
      limit: z.number().int().min(1).max(50).optional().describe("Maximum number of duplicate groups to return, from 1 to 50")
    },
    async ({ section, itemType, limit }) => {
      return withAudit("list_plex_duplicates", { section, itemType, limit }, async () => {
        try {
          const index = await readPlexLibraryIndex();
          const groups = listPlexDuplicates(index, { section, itemType, limit });

          return {
            content: [{ type: "text", text: formatPlexDuplicates(groups, index, { section, itemType, limit }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool list_plex_duplicates returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to list Plex duplicates: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "get_recent_plex_additions",
    "Use this to list the most recent Plex additions, with optional section and item type filters.",
    {
      section: z.string().min(1).optional().describe("Optional library section name, for example Movies, TV Shows, Music, or Audio Books"),
      itemType: z
        .enum(["movie", "show", "season", "episode", "artist", "album", "track"])
        .optional()
        .describe("Optional Plex item type filter"),
      limit: z.number().int().min(1).max(25).optional().describe("Maximum number of results to return, from 1 to 25")
    },
    async ({ section, itemType, limit }) => {
      return withAudit("get_recent_plex_additions", { section, itemType, limit }, async () => {
        try {
          const index = await readPlexLibraryIndex();
          const results = getRecentPlexAdditions(index, { section, itemType, limit });

          return {
            content: [{ type: "text", text: formatRecentPlexAdditions(results, index, { section, itemType, limit }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool get_recent_plex_additions returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to read recent Plex additions: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "list_notes",
    "Use this to list available markdown notes from the local notes directory.",
    {},
    async () => {
      return withAudit("list_notes", undefined, async () => {
        const notes = await loadAllNotes(notesDir);
        const text =
          notes.length === 0
            ? "No notes found."
            : notes.map((note) => formatListEntry(note.slug, note.title, note.tags)).join("\n");

        return {
          content: [{ type: "text", text }]
        };
      });
    }
  );

  server.tool(
    "search_notes",
    "Use this to search note titles, tags, and content for a short keyword or phrase.",
    {
      query: z.string().min(1).describe("Keyword or short phrase to search for")
    },
    async ({ query }) => {
      return withAudit("search_notes", { query }, async () => {
        const results = await searchNotes(notesDir, query);

        if (results.length === 0) {
          return {
            content: [{ type: "text", text: `No notes matched "${query}".` }]
          };
        }

        const text = results
          .map((result) => `${formatListEntry(result.slug, result.title, result.tags)}\n  ${result.preview}`)
          .join("\n");

        return {
          content: [{ type: "text", text }]
        };
      });
    }
  );

  server.tool(
    "read_note",
    "Use this to read a markdown note by slug when you already know which note you need.",
    {
      slug: z.string().min(1).describe("Note slug, for example welcome or homelab")
    },
    async ({ slug }) => {
      return withAudit("read_note", { slug }, async () => {
        try {
          const note = await readNoteBySlug(notesDir, slug);
          const tagText = note.tags.length > 0 ? note.tags.join(", ") : "none";

          return {
            content: [
              {
                type: "text",
                text: `# ${note.title}\n\nSlug: ${note.slug}\nTags: ${tagText}\n\n${note.body}`
              }
            ]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool read_note returned error", message);
          return {
            content: [{ type: "text", text: `Unable to read note "${slug}": ${message}` }],
            isError: true
          };
        }
      });
    }
  );
  return server;
}
