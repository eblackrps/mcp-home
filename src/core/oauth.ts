import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { Response } from "express";
import { checkResourceAllowed, resourceUrlFromServerUrl } from "@modelcontextprotocol/sdk/shared/auth-utils.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import { InvalidGrantError, InvalidRequestError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { AuthorizationParams, OAuthServerProvider } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { OAuthClientInformationFull, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";

type AuthorizationCodeRecord = {
  clientId: string;
  codeChallenge: string;
  redirectUri: string;
  scopes: string[];
  resource?: URL;
};

type AccessTokenRecord = {
  token: string;
  clientId: string;
  scopes: string[];
  expiresAt: number;
  resource?: URL;
};

type RefreshTokenRecord = {
  token: string;
  clientId: string;
  scopes: string[];
  resource?: URL;
};

type LoginFormState = {
  clientId: string;
  redirectUri: string;
  state?: string;
  codeChallenge: string;
  scope?: string;
  resource?: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formField(name: keyof LoginFormState, value?: string) {
  const safeValue = value ?? "";
  return `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(safeValue)}" />`;
}

function secureEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

class InMemoryClientsStore implements OAuthRegisteredClientsStore {
  private readonly clients = new Map<string, OAuthClientInformationFull>();

  async getClient(clientId: string) {
    return this.clients.get(clientId);
  }

  async registerClient(client: Omit<OAuthClientInformationFull, "client_id" | "client_id_issued_at">) {
    const clientId = randomUUID();
    const now = Math.floor(Date.now() / 1000);
    const authMethod = client.token_endpoint_auth_method ?? "none";
    const registered: OAuthClientInformationFull = {
      ...client,
      client_id: clientId,
      client_id_issued_at: now,
      token_endpoint_auth_method: authMethod
    };

    if (authMethod !== "none" && !registered.client_secret) {
      registered.client_secret = randomBytes(24).toString("base64url");
      registered.client_secret_expires_at = 0;
    }

    this.clients.set(clientId, registered);
    return registered;
  }
}

export class PasswordAuthProvider implements OAuthServerProvider {
  readonly clientsStore = new InMemoryClientsStore();

  private readonly authorizationCodes = new Map<string, AuthorizationCodeRecord>();
  private readonly accessTokens = new Map<string, AccessTokenRecord>();
  private readonly refreshTokens = new Map<string, RefreshTokenRecord>();

  constructor(private readonly resourceServerUrl: URL, private readonly sharedPassword: string) {}

  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response) {
    if (!client.redirect_uris.includes(params.redirectUri)) {
      throw new InvalidRequestError("Unregistered redirect_uri");
    }

    const html = this.renderAuthorizationPage({
      clientName: client.client_name || client.client_id,
      state: {
        clientId: client.client_id,
        redirectUri: params.redirectUri,
        state: params.state,
        codeChallenge: params.codeChallenge,
        scope: params.scopes?.join(" "),
        resource: params.resource?.toString()
      }
    });

    res.status(200).type("html").send(html);
  }

  async handlePasswordLogin(form: LoginFormState & { password?: string }, res: Response) {
    const client = await this.clientsStore.getClient(form.clientId);
    if (!client) {
      res.status(400).type("html").send(this.renderMessagePage("Unknown OAuth client."));
      return;
    }

    if (!client.redirect_uris.includes(form.redirectUri)) {
      res.status(400).type("html").send(this.renderMessagePage("Unregistered redirect URI."));
      return;
    }

    if (!form.password || !secureEqual(form.password, this.sharedPassword)) {
      res
        .status(401)
        .type("html")
        .send(
          this.renderAuthorizationPage({
            clientName: client.client_name || client.client_id,
            state: form,
            errorMessage: "Incorrect password. Try again."
          })
        );
      return;
    }

    const resource = form.resource ? new URL(form.resource) : undefined;
    if (resource && !checkResourceAllowed({ requestedResource: resource, configuredResource: this.resourceServerUrl })) {
      res.status(400).type("html").send(this.renderMessagePage("Invalid resource indicator."));
      return;
    }

    const code = randomUUID();
    this.authorizationCodes.set(code, {
      clientId: client.client_id,
      codeChallenge: form.codeChallenge,
      redirectUri: form.redirectUri,
      scopes: form.scope?.split(/\s+/).filter(Boolean) ?? [],
      resource
    });

    const redirectUrl = new URL(form.redirectUri);
    redirectUrl.searchParams.set("code", code);
    if (form.state) {
      redirectUrl.searchParams.set("state", form.state);
    }

    res.redirect(redirectUrl.toString());
  }

  async challengeForAuthorizationCode(client: OAuthClientInformationFull, authorizationCode: string) {
    const record = this.authorizationCodes.get(authorizationCode);
    if (!record || record.clientId !== client.client_id) {
      throw new InvalidGrantError("Invalid authorization code");
    }

    return record.codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    redirectUri?: string,
    resource?: URL
  ): Promise<OAuthTokens> {
    const record = this.authorizationCodes.get(authorizationCode);
    if (!record) {
      throw new InvalidGrantError("Invalid authorization code");
    }

    if (record.clientId !== client.client_id) {
      throw new InvalidGrantError("Authorization code was not issued to this client");
    }

    if (redirectUri && redirectUri !== record.redirectUri) {
      throw new InvalidGrantError("Redirect URI mismatch");
    }

    if (resource && record.resource && resource.toString() !== record.resource.toString()) {
      throw new InvalidGrantError("Resource mismatch");
    }

    this.authorizationCodes.delete(authorizationCode);

    const accessToken = randomBytes(32).toString("base64url");
    const refreshToken = randomBytes(32).toString("base64url");
    const expiresAt = Date.now() + 60 * 60 * 1000;

    this.accessTokens.set(accessToken, {
      token: accessToken,
      clientId: client.client_id,
      scopes: record.scopes,
      expiresAt,
      resource: record.resource
    });

    this.refreshTokens.set(refreshToken, {
      token: refreshToken,
      clientId: client.client_id,
      scopes: record.scopes,
      resource: record.resource
    });

    return {
      access_token: accessToken,
      token_type: "bearer",
      expires_in: 3600,
      refresh_token: refreshToken,
      scope: record.scopes.join(" ")
    };
  }

  async exchangeRefreshToken(client: OAuthClientInformationFull, refreshToken: string, scopes?: string[], resource?: URL) {
    const record = this.refreshTokens.get(refreshToken);
    if (!record || record.clientId !== client.client_id) {
      throw new InvalidGrantError("Invalid refresh token");
    }

    if (resource && record.resource && resource.toString() !== record.resource.toString()) {
      throw new InvalidGrantError("Resource mismatch");
    }

    const grantedScopes = scopes && scopes.length > 0 ? scopes : record.scopes;
    const accessToken = randomBytes(32).toString("base64url");
    const expiresAt = Date.now() + 60 * 60 * 1000;

    this.accessTokens.set(accessToken, {
      token: accessToken,
      clientId: client.client_id,
      scopes: grantedScopes,
      expiresAt,
      resource: record.resource
    });

    return {
      access_token: accessToken,
      token_type: "bearer",
      expires_in: 3600,
      refresh_token: refreshToken,
      scope: grantedScopes.join(" ")
    };
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const record = this.accessTokens.get(token);
    if (!record || record.expiresAt < Date.now()) {
      throw new InvalidGrantError("Invalid or expired token");
    }

    return {
      token,
      clientId: record.clientId,
      scopes: record.scopes,
      expiresAt: Math.floor(record.expiresAt / 1000),
      resource: record.resource
    };
  }

  private renderAuthorizationPage({
    clientName,
    state,
    errorMessage
  }: {
    clientName: string;
    state: LoginFormState;
    errorMessage?: string;
  }) {
    const fields = [
      formField("clientId", state.clientId),
      formField("redirectUri", state.redirectUri),
      formField("state", state.state),
      formField("codeChallenge", state.codeChallenge),
      formField("scope", state.scope),
      formField("resource", state.resource)
    ].join("\n");

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Authorize mcp-home</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, sans-serif; background: #f6f7fb; color: #1b1f2a; margin: 0; padding: 32px; }
      .card { max-width: 560px; margin: 0 auto; background: white; border-radius: 16px; padding: 28px; box-shadow: 0 18px 48px rgba(18, 28, 45, 0.12); }
      h1 { margin-top: 0; font-size: 28px; }
      p { line-height: 1.5; }
      .meta { padding: 12px 14px; background: #f2f5ff; border-radius: 12px; margin: 18px 0; }
      label { display: block; font-weight: 600; margin-bottom: 8px; }
      input[type="password"] { width: 100%; padding: 12px 14px; border: 1px solid #c9d1e1; border-radius: 10px; font-size: 16px; box-sizing: border-box; }
      button { margin-top: 18px; background: #0f62fe; color: white; border: 0; border-radius: 10px; padding: 12px 18px; font-size: 16px; cursor: pointer; }
      .error { color: #9f1239; background: #ffe4e6; padding: 10px 12px; border-radius: 10px; }
      .small { color: #52607a; font-size: 14px; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Authorize mcp-home</h1>
      <p><strong>${escapeHtml(clientName)}</strong> wants access to your home MCP server.</p>
      <div class="meta">
        <div><strong>Server:</strong> ${escapeHtml(this.resourceServerUrl.toString())}</div>
        <div><strong>Access:</strong> Read-only home tools</div>
      </div>
      ${errorMessage ? `<p class="error">${escapeHtml(errorMessage)}</p>` : ""}
      <form method="post" action="/oauth/login">
        ${fields}
        <label for="password">Server password</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required />
        <button type="submit">Authorize</button>
      </form>
      <p class="small">Use the shared password configured on the MCP server. If you are the only user, this can be the same secret already stored in your local .env.</p>
    </div>
  </body>
</html>`;
  }

  private renderMessagePage(message: string) {
    return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>mcp-home auth</title></head>
  <body style="font-family: ui-sans-serif, system-ui, sans-serif; background: #f6f7fb; color: #1b1f2a; padding: 32px;">
    <div style="max-width: 560px; margin: 0 auto; background: white; border-radius: 16px; padding: 28px; box-shadow: 0 18px 48px rgba(18, 28, 45, 0.12);">
      <p>${escapeHtml(message)}</p>
    </div>
  </body>
</html>`;
  }
}

export function resolveOAuthPassword() {
  return process.env.MCP_OAUTH_PASSWORD?.trim() || process.env.MCP_AUTH_TOKEN?.trim() || "";
}

export function resolveMcpServerUrl(port: number) {
  const configured = process.env.MCP_SERVER_URL?.trim();
  return configured ? new URL(configured) : new URL(`http://127.0.0.1:${port}/mcp`);
}

export function resolveIssuerUrl(mcpServerUrl: URL) {
  return new URL("/", mcpServerUrl);
}

export function resolveProtectedResourceUrl(mcpServerUrl: URL) {
  return resourceUrlFromServerUrl(mcpServerUrl);
}
