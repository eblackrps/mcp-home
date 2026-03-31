import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { bearerAuth } from "../core/auth.js";
import { log } from "../core/logger.js";
import { createServer } from "../core/tools.js";

export async function startHttp() {
  const app = express();
  const port = Number(process.env.PORT ?? "8787");
  const token = process.env.MCP_AUTH_TOKEN;

  app.use(express.json({ limit: "1mb", type: ["application/json", "application/*+json"] }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, name: "mcp-home" });
  });

  app.all("/mcp", bearerAuth(token), async (req, res) => {
    try {
      const server = createServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined
      });

      res.on("close", () => {
        transport.close().catch(() => {
          log("streamable HTTP transport close failed");
        });
      });

      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      log("http transport error", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "internal_error" });
      }
    }
  });

  app.listen(port, "0.0.0.0", () => {
    log(`http MCP server listening on :${port} with tools ping, get_time, list_notes, search_notes, read_note`);
  });
}
