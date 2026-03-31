import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type PlexLibrarySection = {
  id: number;
  name: string;
  sectionType: string;
  itemCount: number;
  lastScannedAt?: string | null;
};

export type PlexLibraryItem = {
  title: string;
  itemType: string;
  section: string;
  year?: number | null;
  parentTitle?: string | null;
  grandparentTitle?: string | null;
  summarySnippet?: string | null;
  addedAt?: string | null;
};

export type PlexLibraryIndex = {
  generatedAt: string;
  databasePath: string;
  sections: PlexLibrarySection[];
  items: PlexLibraryItem[];
};

type PlexSearchOptions = {
  query: string;
  section?: string;
  itemType?: string;
  limit?: number;
};

type PlexRecentOptions = {
  section?: string;
  itemType?: string;
  limit?: number;
};

type PlexTitleSearchOptions = {
  query: string;
  mediaType: "movie" | "tv" | "audio";
  limit?: number;
};

const DEFAULT_PLEX_LIBRARY_INDEX_PATH = path.resolve(
  fileURLToPath(new URL("../../data/local/plex-library-index.json", import.meta.url))
);

const TYPE_PRIORITY: Record<string, number> = {
  movie: 70,
  show: 65,
  artist: 60,
  album: 55,
  season: 45,
  episode: 40,
  track: 35
};

let cachedIndex:
  | {
      path: string;
      mtimeMs: number;
      value: PlexLibraryIndex;
    }
  | undefined;

function stripBom(value: string) {
  return value.replace(/^\uFEFF/, "");
}

function assertPlexLibraryIndex(value: unknown): asserts value is PlexLibraryIndex {
  if (!value || typeof value !== "object") {
    throw new Error("Plex library index payload must be an object");
  }

  const candidate = value as Partial<PlexLibraryIndex>;
  if (typeof candidate.generatedAt !== "string" || typeof candidate.databasePath !== "string") {
    throw new Error("Plex library index payload is missing top-level fields");
  }

  if (!Array.isArray(candidate.sections) || !Array.isArray(candidate.items)) {
    throw new Error("Plex library index sections and items must be arrays");
  }

  for (const section of candidate.sections) {
    if (!section || typeof section !== "object") {
      throw new Error("Plex library section entries must be objects");
    }

    const item = section as Partial<PlexLibrarySection>;
    if (
      typeof item.id !== "number" ||
      typeof item.name !== "string" ||
      typeof item.sectionType !== "string" ||
      typeof item.itemCount !== "number"
    ) {
      throw new Error("Plex library section entries are missing required fields");
    }
  }

  for (const item of candidate.items) {
    if (!item || typeof item !== "object") {
      throw new Error("Plex library item entries must be objects");
    }

    const record = item as Partial<PlexLibraryItem>;
    if (
      typeof record.title !== "string" ||
      typeof record.itemType !== "string" ||
      typeof record.section !== "string"
    ) {
      throw new Error("Plex library item entries are missing required fields");
    }
  }
}

function normalize(value: string | undefined) {
  return value?.trim().toLowerCase();
}

function buildSearchHaystack(item: PlexLibraryItem) {
  return [item.title, item.parentTitle, item.grandparentTitle, item.section]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();
}

function scoreItem(item: PlexLibraryItem, query: string) {
  const title = item.title.toLowerCase();
  let score = TYPE_PRIORITY[item.itemType] ?? 0;

  if (title === query) {
    score += 200;
  } else if (title.startsWith(query)) {
    score += 120;
  } else if (title.includes(query)) {
    score += 90;
  }

  if (item.parentTitle?.toLowerCase().includes(query)) {
    score += 30;
  }

  if (item.grandparentTitle?.toLowerCase().includes(query)) {
    score += 20;
  }

  if (item.section.toLowerCase().includes(query)) {
    score += 10;
  }

  return score;
}

function formatContext(item: PlexLibraryItem) {
  const context = [item.grandparentTitle, item.parentTitle].filter((value): value is string => Boolean(value));
  return context.length > 0 ? context.join(" > ") : "";
}

function matchesTitleMediaType(item: PlexLibraryItem, mediaType: PlexTitleSearchOptions["mediaType"]) {
  if (mediaType === "movie") {
    return item.itemType === "movie";
  }

  if (mediaType === "tv") {
    return item.itemType === "show";
  }

  return item.itemType === "artist" || item.itemType === "album" || item.itemType === "track";
}

function byNewestAddedAt(left: PlexLibraryItem, right: PlexLibraryItem) {
  const leftTime = left.addedAt ? Date.parse(left.addedAt) : 0;
  const rightTime = right.addedAt ? Date.parse(right.addedAt) : 0;

  if (rightTime !== leftTime) {
    return rightTime - leftTime;
  }

  return left.title.localeCompare(right.title);
}

export function getPlexLibraryIndexPath() {
  return process.env.PLEX_LIBRARY_INDEX_PATH ?? DEFAULT_PLEX_LIBRARY_INDEX_PATH;
}

export async function readPlexLibraryIndex(indexPath = getPlexLibraryIndexPath()): Promise<PlexLibraryIndex> {
  const fullPath = path.resolve(indexPath);
  const stat = await fs.stat(fullPath);

  if (cachedIndex && cachedIndex.path === fullPath && cachedIndex.mtimeMs === stat.mtimeMs) {
    return cachedIndex.value;
  }

  const raw = await fs.readFile(fullPath, "utf8");
  const parsed = JSON.parse(stripBom(raw)) as unknown;
  assertPlexLibraryIndex(parsed);

  cachedIndex = {
    path: fullPath,
    mtimeMs: stat.mtimeMs,
    value: parsed
  };

  return parsed;
}

export function searchPlexLibrary(index: PlexLibraryIndex, options: PlexSearchOptions) {
  const query = normalize(options.query);
  const section = normalize(options.section);
  const itemType = normalize(options.itemType);
  const limit = Math.min(Math.max(options.limit ?? 10, 1), 25);

  if (!query) {
    return [];
  }

  return index.items
    .filter((item) => {
      if (section && !item.section.toLowerCase().includes(section)) {
        return false;
      }

      if (itemType && item.itemType.toLowerCase() !== itemType) {
        return false;
      }

      return buildSearchHaystack(item).includes(query);
    })
    .map((item) => ({
      item,
      score: scoreItem(item, query)
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.item.title.localeCompare(right.item.title);
    })
    .slice(0, limit)
    .map((entry) => entry.item);
}

export function formatPlexSearchResults(
  results: PlexLibraryItem[],
  index: PlexLibraryIndex,
  options: PlexSearchOptions
) {
  if (results.length === 0) {
    return `No Plex items matched "${options.query}".`;
  }

  const lines = [`Generated: ${index.generatedAt}`, `Results for "${options.query}":`, ""];

  for (const item of results) {
    const year = item.year ? ` | ${item.year}` : "";
    lines.push(`- ${item.title} | ${item.itemType} | ${item.section}${year}`);

    const context = formatContext(item);
    if (context) {
      lines.push(`  Context: ${context}`);
    }

    if (item.summarySnippet) {
      lines.push(`  ${item.summarySnippet}`);
    }
  }

  return lines.join("\n");
}

export function searchPlexTitles(index: PlexLibraryIndex, options: PlexTitleSearchOptions) {
  const query = normalize(options.query);
  const limit = Math.min(Math.max(options.limit ?? 10, 1), 25);

  if (!query) {
    return [];
  }

  return index.items
    .filter((item) => matchesTitleMediaType(item, options.mediaType) && item.title.toLowerCase().includes(query))
    .map((item) => ({
      item,
      score: scoreItem(item, query)
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.item.title.localeCompare(right.item.title);
    })
    .slice(0, limit)
    .map((entry) => entry.item);
}

export function formatPlexTitleSearchResults(
  results: PlexLibraryItem[],
  index: PlexLibraryIndex,
  options: PlexTitleSearchOptions
) {
  if (results.length === 0) {
    return `No ${options.mediaType} titles matched "${options.query}".`;
  }

  const lines = [`Generated: ${index.generatedAt}`, `Title matches for "${options.query}" (${options.mediaType}):`, ""];

  for (const item of results) {
    const year = item.year ? ` | ${item.year}` : "";
    lines.push(`- ${item.title} | ${item.itemType} | ${item.section}${year}`);

    const context = formatContext(item);
    if (context) {
      lines.push(`  Context: ${context}`);
    }
  }

  return lines.join("\n");
}

export function listPlexSections(index: PlexLibraryIndex) {
  return [...index.sections].sort((left, right) => left.name.localeCompare(right.name));
}

export function formatPlexSections(index: PlexLibraryIndex) {
  const sections = listPlexSections(index);
  const lines = [`Generated: ${index.generatedAt}`, "Libraries:", ""];

  for (const section of sections) {
    const suffix = section.lastScannedAt ? ` | last scanned ${section.lastScannedAt}` : "";
    lines.push(`- ${section.name} | ${section.sectionType} | ${section.itemCount} items${suffix}`);
  }

  return lines.join("\n");
}

export function getRecentPlexAdditions(index: PlexLibraryIndex, options: PlexRecentOptions) {
  const section = normalize(options.section);
  const itemType = normalize(options.itemType);
  const limit = Math.min(Math.max(options.limit ?? 10, 1), 25);

  return index.items
    .filter((item) => {
      if (!item.addedAt) {
        return false;
      }

      if (section && !item.section.toLowerCase().includes(section)) {
        return false;
      }

      if (itemType && item.itemType.toLowerCase() !== itemType) {
        return false;
      }

      return true;
    })
    .sort(byNewestAddedAt)
    .slice(0, limit);
}

export function formatRecentPlexAdditions(
  items: PlexLibraryItem[],
  index: PlexLibraryIndex,
  options: PlexRecentOptions
) {
  const filters = [options.section ? `section=${options.section}` : "", options.itemType ? `type=${options.itemType}` : ""]
    .filter(Boolean)
    .join(", ");

  const lines = [
    `Generated: ${index.generatedAt}`,
    filters ? `Recent Plex additions (${filters}):` : "Recent Plex additions:",
    ""
  ];

  if (items.length === 0) {
    lines.push("- No recent additions matched that filter.");
    return lines.join("\n");
  }

  for (const item of items) {
    const year = item.year ? ` | ${item.year}` : "";
    const addedAt = item.addedAt ? ` | added ${item.addedAt}` : "";
    lines.push(`- ${item.title} | ${item.itemType} | ${item.section}${year}${addedAt}`);

    const context = formatContext(item);
    if (context) {
      lines.push(`  Context: ${context}`);
    }

    if (item.summarySnippet) {
      lines.push(`  ${item.summarySnippet}`);
    }
  }

  return lines.join("\n");
}
