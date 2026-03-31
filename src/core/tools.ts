import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatHomelabStatus, readHomelabStatus } from "./homelab.js";
import { loadAllNotes, readNoteBySlug, searchNotes } from "./notes.js";
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
    version: "0.1.0"
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
