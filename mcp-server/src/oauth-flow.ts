import { createServer, type Server } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import { URL } from "node:url";
import {
  saveTokens,
  type StoredTokens,
} from "./token-storage.js";

const CLIENT_ID = "payvia-mcp";
const AUTH_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

function generateCodeVerifier(): string {
  return randomBytes(32)
    .toString("base64url");
}

function generateCodeChallenge(verifier: string): string {
  return createHash("sha256")
    .update(verifier, "ascii")
    .digest("base64url");
}

function generateState(): string {
  return randomBytes(16).toString("hex");
}

async function openBrowser(url: string): Promise<void> {
  try {
    // Dynamic import of 'open' (ESM package)
    const { default: open } = await import("open");
    await open(url);
  } catch {
    // Fallback: print URL for manual opening
    console.error(`\nPlease open this URL in your browser to authenticate:\n${url}\n`);
  }
}

const SUCCESS_HTML = `<!DOCTYPE html>
<html><head><title>PayVia - Authenticated</title>
<style>
body{font-family:system-ui,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f0f2f5}
.card{background:white;padding:3rem;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.08);text-align:center;max-width:400px}
.check{font-size:4rem;margin-bottom:1rem}
h1{color:#1a1a1a;font-size:1.5rem;margin-bottom:.5rem}
p{color:#666;font-size:1rem}
</style></head>
<body><div class="card">
<div class="check">&#10003;</div>
<h1>Authenticated!</h1>
<p>You can close this tab and return to your AI agent.</p>
</div></body></html>`;

export async function startOAuthFlow(apiUrl: string): Promise<StoredTokens> {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = generateState();

  return new Promise<StoredTokens>((resolve, reject) => {
    let server: Server;
    let timeoutId: ReturnType<typeof setTimeout>;

    server = createServer(async (req, res) => {
      const reqUrl = new URL(req.url || "/", `http://localhost`);

      if (reqUrl.pathname !== "/callback") {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const code = reqUrl.searchParams.get("code");
      const returnedState = reqUrl.searchParams.get("state");
      const error = reqUrl.searchParams.get("error");

      // Show success page immediately
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(SUCCESS_HTML);

      // Close server after response
      clearTimeout(timeoutId);
      server.close();

      if (error) {
        reject(new Error(`Authorization denied: ${error}`));
        return;
      }

      if (!code || returnedState !== state) {
        reject(new Error("Invalid callback: missing code or state mismatch."));
        return;
      }

      try {
        // Exchange code for tokens
        const tokenUrl = `${apiUrl}/api/v1/oauth/token`;
        const body = new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: `http://localhost:${(server.address() as { port: number }).port}/callback`,
          client_id: CLIENT_ID,
          code_verifier: codeVerifier,
        });

        const tokenResponse = await fetch(tokenUrl, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: body.toString(),
        });

        if (!tokenResponse.ok) {
          const errorText = await tokenResponse.text();
          reject(new Error(`Token exchange failed: ${errorText}`));
          return;
        }

        const tokenData = (await tokenResponse.json()) as {
          access_token: string;
          refresh_token: string;
          expires_in: number;
          scope: string;
        };

        const tokens: StoredTokens = {
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
          expiresAt: Date.now() + tokenData.expires_in * 1000,
          scopes: tokenData.scope,
          apiUrl,
        };

        saveTokens(tokens);
        resolve(tokens);
      } catch (err) {
        reject(err);
      }
    });

    // Listen on random port
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as { port: number };
      const port = address.port;
      const redirectUri = `http://localhost:${port}/callback`;

      const authUrl =
        `${apiUrl}/api/v1/oauth/authorize` +
        `?client_id=${encodeURIComponent(CLIENT_ID)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&response_type=code` +
        `&scope=${encodeURIComponent("read:projects write:projects read:plans write:plans manage:subscribers validate:license")}` +
        `&state=${encodeURIComponent(state)}` +
        `&code_challenge=${encodeURIComponent(codeChallenge)}` +
        `&code_challenge_method=S256`;

      console.error(`Opening browser for PayVia authentication...`);
      openBrowser(authUrl);
    });

    // Timeout
    timeoutId = setTimeout(() => {
      server.close();
      reject(new Error("Authentication timed out after 5 minutes. Please try again."));
    }, AUTH_TIMEOUT_MS);
  });
}

export async function refreshAccessToken(
  apiUrl: string,
  refreshToken: string
): Promise<StoredTokens> {
  const tokenUrl = `${apiUrl}/api/v1/oauth/token`;
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: CLIENT_ID,
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error("Token refresh failed. Please re-authenticate with payvia_auth.");
  }

  const tokenData = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope: string;
  };

  const tokens: StoredTokens = {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresAt: Date.now() + tokenData.expires_in * 1000,
    scopes: tokenData.scope,
    apiUrl,
  };

  saveTokens(tokens);
  return tokens;
}
