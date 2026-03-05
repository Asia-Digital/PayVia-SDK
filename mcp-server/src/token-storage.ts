import { readFileSync, writeFileSync, mkdirSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix timestamp (ms)
  scopes: string;
  apiUrl: string;
}

function getTokenDir(): string {
  return join(homedir(), ".payvia");
}

function getTokenFilePath(): string {
  return join(getTokenDir(), "tokens.json");
}

export function saveTokens(tokens: StoredTokens): void {
  const dir = getTokenDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  writeFileSync(getTokenFilePath(), JSON.stringify(tokens, null, 2), {
    mode: 0o600,
  });
}

export function loadTokens(): StoredTokens | null {
  const filePath = getTokenFilePath();
  if (!existsSync(filePath)) {
    return null;
  }
  try {
    const data = readFileSync(filePath, "utf-8");
    return JSON.parse(data) as StoredTokens;
  } catch {
    return null;
  }
}

export function clearTokens(): void {
  const filePath = getTokenFilePath();
  if (existsSync(filePath)) {
    unlinkSync(filePath);
  }
}

export function isTokenExpired(tokens: StoredTokens): boolean {
  // Consider expired 60 seconds before actual expiry
  return Date.now() >= tokens.expiresAt - 60_000;
}
