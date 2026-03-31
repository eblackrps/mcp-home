import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type PlexActivityItem = {
  title: string;
  type: string;
  grandparentTitle?: string | null;
  parentTitle?: string | null;
  seasonIndex?: number | null;
  episodeIndex?: number | null;
  user?: string | null;
  player?: string | null;
  state?: string | null;
  viewedAt?: string | null;
  originallyAvailableAt?: string | null;
  durationMs?: number | null;
  viewOffsetMs?: number | null;
};

export type PlexActivitySnapshot = {
  fetchedAt: string;
  tokenAvailable: boolean;
  sessionsAvailable: boolean;
  historyAvailable: boolean;
  activeSessions: PlexActivityItem[];
  recentlyWatched: PlexActivityItem[];
};

const DEFAULT_PLEX_ACTIVITY_PATH = path.resolve(
  fileURLToPath(new URL("../../data/local/plex-activity.json", import.meta.url))
);

let cachedSnapshot:
  | {
      path: string;
      mtimeMs: number;
      value: PlexActivitySnapshot;
    }
  | undefined;

function stripBom(value: string) {
  return value.replace(/^\uFEFF/, "");
}

function assertActivityItem(value: unknown): asserts value is PlexActivityItem {
  if (!value || typeof value !== "object") {
    throw new Error("Plex activity items must be objects");
  }

  const candidate = value as Partial<PlexActivityItem>;
  if (typeof candidate.title !== "string" || typeof candidate.type !== "string") {
    throw new Error("Plex activity items are missing required fields");
  }
}

function assertSnapshot(value: unknown): asserts value is PlexActivitySnapshot {
  if (!value || typeof value !== "object") {
    throw new Error("Plex activity snapshot must be an object");
  }

  const candidate = value as Partial<PlexActivitySnapshot>;
  if (
    typeof candidate.fetchedAt !== "string" ||
    typeof candidate.tokenAvailable !== "boolean" ||
    typeof candidate.sessionsAvailable !== "boolean" ||
    typeof candidate.historyAvailable !== "boolean" ||
    !Array.isArray(candidate.activeSessions) ||
    !Array.isArray(candidate.recentlyWatched)
  ) {
    throw new Error("Plex activity snapshot is missing required fields");
  }

  for (const item of candidate.activeSessions) {
    assertActivityItem(item);
  }

  for (const item of candidate.recentlyWatched) {
    assertActivityItem(item);
  }
}

function formatEpisodeCode(item: PlexActivityItem) {
  if (item.seasonIndex === null || item.seasonIndex === undefined) {
    return item.episodeIndex !== null && item.episodeIndex !== undefined ? `E${String(item.episodeIndex).padStart(2, "0")}` : "";
  }

  if (item.episodeIndex === null || item.episodeIndex === undefined) {
    return `S${String(item.seasonIndex).padStart(2, "0")}`;
  }

  return `S${String(item.seasonIndex).padStart(2, "0")}E${String(item.episodeIndex).padStart(2, "0")}`;
}

export function getPlexActivityPath() {
  return process.env.PLEX_ACTIVITY_PATH ?? DEFAULT_PLEX_ACTIVITY_PATH;
}

export async function readPlexActivitySnapshot(activityPath = getPlexActivityPath()): Promise<PlexActivitySnapshot> {
  const fullPath = path.resolve(activityPath);
  const stat = await fs.stat(fullPath);

  if (cachedSnapshot && cachedSnapshot.path === fullPath && cachedSnapshot.mtimeMs === stat.mtimeMs) {
    return cachedSnapshot.value;
  }

  const raw = await fs.readFile(fullPath, "utf8");
  const parsed = JSON.parse(stripBom(raw)) as unknown;
  assertSnapshot(parsed);

  cachedSnapshot = {
    path: fullPath,
    mtimeMs: stat.mtimeMs,
    value: parsed
  };

  return parsed;
}

export function formatPlexNowPlaying(snapshot: PlexActivitySnapshot) {
  const lines = [
    `Fetched: ${snapshot.fetchedAt}`,
    `Token available: ${snapshot.tokenAvailable ? "yes" : "no"}`,
    `Sessions endpoint available: ${snapshot.sessionsAvailable ? "yes" : "no"}`,
    ""
  ];

  if (snapshot.activeSessions.length === 0) {
    lines.push("No active Plex sessions.");
    return lines.join("\n");
  }

  lines.push("Now playing:");
  for (const item of snapshot.activeSessions) {
    const code = item.type === "episode" ? ` ${formatEpisodeCode(item)}` : "";
    const context = item.grandparentTitle ? ` | ${item.grandparentTitle}` : item.parentTitle ? ` | ${item.parentTitle}` : "";
    const state = item.state ? ` | ${item.state}` : "";
    const user = item.user ? ` | user ${item.user}` : "";
    const player = item.player ? ` | player ${item.player}` : "";
    lines.push(`- ${item.title}${code} | ${item.type}${context}${state}${user}${player}`);
  }

  return lines.join("\n");
}

export function formatPlexRecentlyWatched(snapshot: PlexActivitySnapshot, limit?: number) {
  const max = Math.min(Math.max(limit ?? 10, 1), 25);
  const lines = [
    `Fetched: ${snapshot.fetchedAt}`,
    `Token available: ${snapshot.tokenAvailable ? "yes" : "no"}`,
    `History endpoint available: ${snapshot.historyAvailable ? "yes" : "no"}`,
    ""
  ];

  if (snapshot.recentlyWatched.length === 0) {
    lines.push("No recent Plex watch history is available.");
    return lines.join("\n");
  }

  lines.push("Recently watched:");
  for (const item of snapshot.recentlyWatched.slice(0, max)) {
    const code = item.type === "episode" ? ` ${formatEpisodeCode(item)}` : "";
    const context = item.grandparentTitle ? ` | ${item.grandparentTitle}` : item.parentTitle ? ` | ${item.parentTitle}` : "";
    const viewedAt = item.viewedAt ? ` | watched ${item.viewedAt}` : "";
    lines.push(`- ${item.title}${code} | ${item.type}${context}${viewedAt}`);
  }

  return lines.join("\n");
}

export function formatPlexServerActivity(snapshot: PlexActivitySnapshot) {
  const lines = [
    `Fetched: ${snapshot.fetchedAt}`,
    `Token available: ${snapshot.tokenAvailable ? "yes" : "no"}`,
    `Active sessions: ${snapshot.activeSessions.length}`,
    `Recent history items captured: ${snapshot.recentlyWatched.length}`,
    ""
  ];

  const latest = snapshot.recentlyWatched[0];
  if (latest) {
    const code = latest.type === "episode" ? ` ${formatEpisodeCode(latest)}` : "";
    const context = latest.grandparentTitle ? ` | ${latest.grandparentTitle}` : latest.parentTitle ? ` | ${latest.parentTitle}` : "";
    const viewedAt = latest.viewedAt ? ` | watched ${latest.viewedAt}` : "";
    lines.push(`Last watched: ${latest.title}${code} | ${latest.type}${context}${viewedAt}`);
  } else {
    lines.push("Last watched: no history captured yet.");
  }

  if (snapshot.activeSessions.length > 0) {
    lines.push("");
    lines.push("Active session preview:");
    for (const item of snapshot.activeSessions.slice(0, 3)) {
      const code = item.type === "episode" ? ` ${formatEpisodeCode(item)}` : "";
      const context = item.grandparentTitle ? ` | ${item.grandparentTitle}` : item.parentTitle ? ` | ${item.parentTitle}` : "";
      lines.push(`- ${item.title}${code} | ${item.type}${context}`);
    }
  }

  return lines.join("\n");
}
