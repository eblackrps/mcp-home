import express from "express";
import {
  getOAuthProtectedResourceMetadataUrl,
  mcpAuthRouter
} from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { bearerAuth } from "../core/auth.js";
import { log } from "../core/logger.js";
import {
  PasswordAuthProvider,
  resolveIssuerUrl,
  resolveMcpServerUrl,
  resolveOAuthPassword,
  resolveProtectedResourceUrl
} from "../core/oauth.js";
import { formatRegisteredToolList, resolveToolProfile, SERVER_NAME } from "../core/server-meta.js";
import { createServer } from "../core/tools.js";

export async function startHttp() {
  const app = express();
  const port = Number(process.env.PORT ?? "8787");
  const token = process.env.MCP_AUTH_TOKEN;
  const authMode = (process.env.MCP_AUTH_MODE?.trim().toLowerCase() || "bearer") as "bearer" | "oauth" | "none";
  const toolProfile = resolveToolProfile(process.env.MCP_HTTP_TOOL_PROFILE ?? process.env.MCP_TOOL_PROFILE, "public-safe");
  const passThroughAuth: express.RequestHandler = (_req, _res, next) => next();

  app.set("trust proxy", 1);
  app.use(express.json({ limit: "1mb", type: ["application/json", "application/*+json"] }));
  app.use(express.urlencoded({ extended: false }));

  let mcpAuthMiddleware: express.RequestHandler | undefined;

  if (authMode === "oauth") {
    const mcpServerUrl = resolveMcpServerUrl(port);
    const issuerUrl = resolveIssuerUrl(mcpServerUrl);
    const oauthPassword = resolveOAuthPassword();

    if (!oauthPassword) {
      throw new Error("MCP_AUTH_MODE=oauth requires MCP_OAUTH_PASSWORD or MCP_AUTH_TOKEN to be set.");
    }

    const provider = new PasswordAuthProvider(resolveProtectedResourceUrl(mcpServerUrl), oauthPassword);

    app.post("/oauth/login", async (req, res) => {
      await provider.handlePasswordLogin(
        {
          clientId: String(req.body.clientId ?? ""),
          redirectUri: String(req.body.redirectUri ?? ""),
          state: typeof req.body.state === "string" ? req.body.state : undefined,
          codeChallenge: String(req.body.codeChallenge ?? ""),
          scope: typeof req.body.scope === "string" ? req.body.scope : undefined,
          resource: typeof req.body.resource === "string" ? req.body.resource : undefined,
          password: typeof req.body.password === "string" ? req.body.password : undefined
        },
        res
      );
    });

    app.use(
      mcpAuthRouter({
        provider,
        issuerUrl,
        resourceServerUrl: mcpServerUrl,
        scopesSupported: ["mcp:tools"],
        resourceName: "mcp-home"
      })
    );

    mcpAuthMiddleware = requireBearerAuth({
      verifier: provider,
      requiredScopes: [],
      resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpServerUrl)
    });
  }

  app.get("/health", (_req, res) => {
    res.json({ ok: true, name: SERVER_NAME, toolProfile });
  });

  let effectiveAuth: express.RequestHandler;
  if (authMode === "oauth") {
    if (!mcpAuthMiddleware) {
      throw new Error("OAuth auth mode was selected, but the OAuth middleware was not initialized.");
    }
    effectiveAuth = mcpAuthMiddleware;
  } else if (authMode === "bearer") {
    effectiveAuth = bearerAuth(token);
  } else {
    effectiveAuth = passThroughAuth;
  }

  app.all("/mcp", effectiveAuth, async (req, res) => {
    try {
      const server = createServer({ profile: toolProfile });
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
    log(`http MCP server listening on :${port} with auth mode ${authMode}, profile ${toolProfile}, and tools ${formatRegisteredToolList(toolProfile)}`);
  });
}
