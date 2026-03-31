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
  ratingKey?: number;
  title: string;
  itemType: string;
  section: string;
  year?: number | null;
  parentTitle?: string | null;
  grandparentTitle?: string | null;
  summarySnippet?: string | null;
  addedAt?: string | null;
  originallyAvailableAt?: string | null;
  rating?: number | null;
  contentRating?: string | null;
  studio?: string | null;
  durationMs?: number | null;
  genres?: string[];
  seasonIndex?: number | null;
  episodeIndex?: number | null;
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

type PlexItemDetailsOptions = {
  title: string;
  itemType?: string;
  section?: string;
  limit?: number;
};

type PlexBrowseChildrenOptions = {
  parentTitle: string;
  parentType: "show" | "artist" | "album";
  section?: string;
  limit?: number;
};

type PlexDuplicateOptions = {
  itemType?: string;
  section?: string;
  limit?: number;
};

type PlexShowSummaryOptions = {
  showTitle: string;
};

type PlexShowEpisodeBrowseOptions = {
  showTitle: string;
  seasonIndex?: number;
  limit?: number;
};

type PlexEpisodeSearchOptions = {
  query: string;
  showTitle?: string;
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

    if (record.genres !== undefined && !Array.isArray(record.genres)) {
      throw new Error("Plex library item genres must be an array when present");
    }
  }
}

function normalize(value: string | null | undefined) {
  return value?.trim().toLowerCase();
}

function normalizeTitleKey(value: string | undefined) {
  return value
    ?.toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
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

function formatEpisodeCode(item: PlexLibraryItem) {
  if (item.seasonIndex === null || item.seasonIndex === undefined) {
    return item.episodeIndex !== null && item.episodeIndex !== undefined ? `E${String(item.episodeIndex).padStart(2, "0")}` : "";
  }

  if (item.episodeIndex === null || item.episodeIndex === undefined) {
    return `S${String(item.seasonIndex).padStart(2, "0")}`;
  }

  return `S${String(item.seasonIndex).padStart(2, "0")}E${String(item.episodeIndex).padStart(2, "0")}`;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value && value.trim())))]
}

function sortByRelevance(left: PlexLibraryItem, right: PlexLibraryItem, query: string) {
  const leftScore = scoreItem(left, query);
  const rightScore = scoreItem(right, query);

  if (rightScore !== leftScore) {
    return rightScore - leftScore;
  }

  return left.title.localeCompare(right.title);
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

export function getPlexItemDetails(index: PlexLibraryIndex, options: PlexItemDetailsOptions) {
  const title = normalize(options.title);
  const itemType = normalize(options.itemType);
  const section = normalize(options.section);
  const limit = Math.min(Math.max(options.limit ?? 5, 1), 10);

  if (!title) {
    return [];
  }

  const filtered = index.items.filter((item) => {
    if (itemType && item.itemType.toLowerCase() !== itemType) {
      return false;
    }

    if (section && !item.section.toLowerCase().includes(section)) {
      return false;
    }

    return item.title.toLowerCase().includes(title);
  });

  const exactMatches = filtered.filter((item) => normalizeTitleKey(item.title) === normalizeTitleKey(options.title));
  const source = exactMatches.length > 0 ? exactMatches : filtered;

  return source.sort((left, right) => sortByRelevance(left, right, title)).slice(0, limit);
}

export function formatPlexItemDetails(
  results: PlexLibraryItem[],
  index: PlexLibraryIndex,
  options: PlexItemDetailsOptions
) {
  if (results.length === 0) {
    return `No Plex items matched "${options.title}".`;
  }

  const exact = results.some((item) => normalizeTitleKey(item.title) === normalizeTitleKey(options.title));
  const lines = [
    `Generated: ${index.generatedAt}`,
    exact ? `Matches for "${options.title}":` : `Closest Plex matches for "${options.title}":`,
    ""
  ];

  for (const item of results) {
    const year = item.year ? ` | ${item.year}` : "";
    const addedAt = item.addedAt ? ` | added ${item.addedAt}` : "";
    lines.push(`- ${item.title} | ${item.itemType} | ${item.section}${year}${addedAt}`);

    const meta = [
      item.contentRating ? `rated ${item.contentRating}` : "",
      item.studio ? `studio ${item.studio}` : "",
      item.rating !== null && item.rating !== undefined ? `rating ${item.rating}` : ""
    ]
      .filter(Boolean)
      .join(" | ");
    if (meta) {
      lines.push(`  ${meta}`);
    }

    const context = formatContext(item);
    if (context) {
      lines.push(`  Context: ${context}`);
    }

    if (item.genres && item.genres.length > 0) {
      lines.push(`  Genres: ${item.genres.join(", ")}`);
    }

    if (item.durationMs) {
      lines.push(`  Duration: ${Math.round(item.durationMs / 60000)} min`);
    }

    if (item.summarySnippet) {
      lines.push(`  ${item.summarySnippet}`);
    }
  }

  return lines.join("\n");
}

export function browsePlexChildren(index: PlexLibraryIndex, options: PlexBrowseChildrenOptions) {
  const parentTitle = normalize(options.parentTitle);
  const section = normalize(options.section);
  const limit = Math.min(Math.max(options.limit ?? 25, 1), 50);

  if (!parentTitle) {
    return [];
  }

  const candidates = index.items.filter((item) => {
    if (section && !item.section.toLowerCase().includes(section)) {
      return false;
    }

    if (options.parentType === "show") {
      return item.itemType === "episode" && normalize(item.grandparentTitle)?.includes(parentTitle);
    }

    if (options.parentType === "artist") {
      return item.itemType === "album" && normalize(item.parentTitle)?.includes(parentTitle);
    }

    return item.itemType === "track" && normalize(item.parentTitle)?.includes(parentTitle);
  });

  return candidates
    .sort((left, right) => {
      const leftKey = options.parentType === "show" ? `${left.year ?? 0}:${left.title}` : left.title;
      const rightKey = options.parentType === "show" ? `${right.year ?? 0}:${right.title}` : right.title;
      return leftKey.localeCompare(rightKey);
    })
    .slice(0, limit);
}

export function formatPlexChildren(
  results: PlexLibraryItem[],
  index: PlexLibraryIndex,
  options: PlexBrowseChildrenOptions
) {
  if (results.length === 0) {
    return `No Plex children matched ${options.parentType} "${options.parentTitle}".`;
  }

  const childLabel =
    options.parentType === "show" ? "episodes" : options.parentType === "artist" ? "albums" : "tracks";
  const lines = [
    `Generated: ${index.generatedAt}`,
    `Browsing ${childLabel} for ${options.parentType} "${options.parentTitle}":`,
    ""
  ];

  for (const item of results) {
    const year = item.year ? ` | ${item.year}` : "";
    const addedAt = item.addedAt ? ` | added ${item.addedAt}` : "";
    lines.push(`- ${item.title} | ${item.itemType} | ${item.section}${year}${addedAt}`);

    const context = formatContext(item);
    if (context) {
      lines.push(`  Context: ${context}`);
    }
  }

  return lines.join("\n");
}

export function getPlexShowSummary(index: PlexLibraryIndex, options: PlexShowSummaryOptions) {
  const showTitle = normalize(options.showTitle);
  if (!showTitle) {
    return {
      show: undefined,
      episodes: []
    };
  }

  const show = index.items
    .filter((item) => item.itemType === "show" && item.title.toLowerCase().includes(showTitle))
    .sort((left, right) => sortByRelevance(left, right, showTitle))[0];

  if (!show) {
    return {
      show: undefined,
      episodes: []
    };
  }

  const episodes = index.items
    .filter((item) => item.itemType === "episode" && normalize(item.grandparentTitle) === normalize(show.title))
    .sort((left, right) => {
      const leftSeason = left.seasonIndex ?? 0;
      const rightSeason = right.seasonIndex ?? 0;
      if (leftSeason !== rightSeason) {
        return leftSeason - rightSeason;
      }

      const leftEpisode = left.episodeIndex ?? 0;
      const rightEpisode = right.episodeIndex ?? 0;
      if (leftEpisode !== rightEpisode) {
        return leftEpisode - rightEpisode;
      }

      return left.title.localeCompare(right.title);
    });

  return { show, episodes };
}

export function formatPlexShowSummary(
  summary: { show?: PlexLibraryItem; episodes: PlexLibraryItem[] },
  index: PlexLibraryIndex,
  options: PlexShowSummaryOptions
) {
  if (!summary.show) {
    return `No Plex show matched "${options.showTitle}".`;
  }

  const seasons = [...new Set(summary.episodes.map((episode) => episode.seasonIndex).filter((value) => value !== null && value !== undefined))];
  const lines = [
    `Generated: ${index.generatedAt}`,
    `Show summary for "${summary.show.title}":`,
    "",
    `- Section: ${summary.show.section}`,
    `- Episodes indexed: ${summary.episodes.length}`,
    `- Seasons indexed: ${seasons.length}`,
    `- Content rating: ${summary.show.contentRating || "unknown"}`,
    `- Studio: ${summary.show.studio || "unknown"}`,
    `- Rating: ${summary.show.rating !== null && summary.show.rating !== undefined ? summary.show.rating : "unknown"}`
  ];

  if (summary.show.genres && summary.show.genres.length > 0) {
    lines.push(`- Genres: ${summary.show.genres.join(", ")}`);
  }

  if (summary.show.summarySnippet) {
    lines.push("");
    lines.push(summary.show.summarySnippet);
  }

  if (summary.episodes.length > 0) {
    const recentEpisodes = [...summary.episodes]
      .filter((episode) => episode.addedAt)
      .sort(byNewestAddedAt)
      .slice(0, 3);

    if (recentEpisodes.length > 0) {
      lines.push("");
      lines.push("Most recently added episodes:");
      for (const episode of recentEpisodes) {
        const code = formatEpisodeCode(episode);
        const addedAt = episode.addedAt ? ` | added ${episode.addedAt}` : "";
        lines.push(`- ${code} ${episode.title}${addedAt}`);
      }
    }
  }

  return lines.join("\n");
}

export function browsePlexShowEpisodes(index: PlexLibraryIndex, options: PlexShowEpisodeBrowseOptions) {
  const showTitle = normalize(options.showTitle);
  const limit = Math.min(Math.max(options.limit ?? 25, 1), 100);

  if (!showTitle) {
    return [];
  }

  return index.items
    .filter((item) => {
      if (item.itemType !== "episode") {
        return false;
      }

      if (!normalize(item.grandparentTitle)?.includes(showTitle)) {
        return false;
      }

      if (options.seasonIndex !== undefined && item.seasonIndex !== options.seasonIndex) {
        return false;
      }

      return true;
    })
    .sort((left, right) => {
      const leftSeason = left.seasonIndex ?? 0;
      const rightSeason = right.seasonIndex ?? 0;
      if (leftSeason !== rightSeason) {
        return leftSeason - rightSeason;
      }

      const leftEpisode = left.episodeIndex ?? 0;
      const rightEpisode = right.episodeIndex ?? 0;
      if (leftEpisode !== rightEpisode) {
        return leftEpisode - rightEpisode;
      }

      return left.title.localeCompare(right.title);
    })
    .slice(0, limit);
}

export function formatPlexShowEpisodes(
  episodes: PlexLibraryItem[],
  index: PlexLibraryIndex,
  options: PlexShowEpisodeBrowseOptions
) {
  if (episodes.length === 0) {
    return options.seasonIndex !== undefined
      ? `No Plex episodes matched show "${options.showTitle}" for season ${options.seasonIndex}.`
      : `No Plex episodes matched show "${options.showTitle}".`;
  }

  const seasonLabel = options.seasonIndex !== undefined ? ` season ${options.seasonIndex}` : "";
  const lines = [
    `Generated: ${index.generatedAt}`,
    `Episodes for "${options.showTitle}"${seasonLabel}:`,
    ""
  ];

  for (const episode of episodes) {
    const code = formatEpisodeCode(episode);
    const airDate = episode.originallyAvailableAt ? ` | aired ${episode.originallyAvailableAt}` : "";
    lines.push(`- ${code} ${episode.title}${airDate}`);

    if (episode.summarySnippet) {
      lines.push(`  ${episode.summarySnippet}`);
    }
  }

  return lines.join("\n");
}

export function findPlexEpisodes(index: PlexLibraryIndex, options: PlexEpisodeSearchOptions) {
  const query = normalize(options.query);
  const showTitle = normalize(options.showTitle);
  const limit = Math.min(Math.max(options.limit ?? 10, 1), 25);

  if (!query) {
    return [];
  }

  return index.items
    .filter((item) => {
      if (item.itemType !== "episode") {
        return false;
      }

      if (!item.title.toLowerCase().includes(query)) {
        return false;
      }

      if (showTitle && !normalize(item.grandparentTitle)?.includes(showTitle)) {
        return false;
      }

      return true;
    })
    .sort((left, right) => sortByRelevance(left, right, query))
    .slice(0, limit);
}

export function formatPlexEpisodes(
  episodes: PlexLibraryItem[],
  index: PlexLibraryIndex,
  options: PlexEpisodeSearchOptions
) {
  if (episodes.length === 0) {
    return options.showTitle
      ? `No Plex episodes matched "${options.query}" in show "${options.showTitle}".`
      : `No Plex episodes matched "${options.query}".`;
  }

  const lines = [
    `Generated: ${index.generatedAt}`,
    options.showTitle
      ? `Episode matches for "${options.query}" in "${options.showTitle}":`
      : `Episode matches for "${options.query}":`,
    ""
  ];

  for (const episode of episodes) {
    const code = formatEpisodeCode(episode);
    const showTitle = episode.grandparentTitle ? ` | ${episode.grandparentTitle}` : "";
    const airDate = episode.originallyAvailableAt ? ` | aired ${episode.originallyAvailableAt}` : "";
    lines.push(`- ${code} ${episode.title}${showTitle}${airDate}`);

    if (episode.summarySnippet) {
      lines.push(`  ${episode.summarySnippet}`);
    }
  }

  return lines.join("\n");
}

export function listPlexDuplicates(index: PlexLibraryIndex, options: PlexDuplicateOptions) {
  const itemType = normalize(options.itemType);
  const section = normalize(options.section);
  const limit = Math.min(Math.max(options.limit ?? 15, 1), 50);

  const groups = new Map<string, PlexLibraryItem[]>();

  for (const item of index.items) {
    if (itemType && item.itemType.toLowerCase() !== itemType) {
      continue;
    }

    if (section && !item.section.toLowerCase().includes(section)) {
      continue;
    }

    const key = [normalizeTitleKey(item.title), item.itemType.toLowerCase(), item.section.toLowerCase()].join("|");
    const existing = groups.get(key);
    if (existing) {
      existing.push(item);
    } else {
      groups.set(key, [item]);
    }
  }

  return [...groups.values()]
    .filter((group) => group.length > 1)
    .sort((left, right) => {
      if (right.length !== left.length) {
        return right.length - left.length;
      }

      return left[0].title.localeCompare(right[0].title);
    })
    .slice(0, limit);
}

export function formatPlexDuplicates(
  groups: PlexLibraryItem[][],
  index: PlexLibraryIndex,
  options: PlexDuplicateOptions
) {
  const filters = [options.section ? `section=${options.section}` : "", options.itemType ? `type=${options.itemType}` : ""]
    .filter(Boolean)
    .join(", ");

  const lines = [
    `Generated: ${index.generatedAt}`,
    filters ? `Duplicate Plex items (${filters}):` : "Duplicate Plex items:",
    ""
  ];

  if (groups.length === 0) {
    lines.push("- No duplicate titles matched that filter.");
    return lines.join("\n");
  }

  for (const group of groups) {
    const first = group[0];
    lines.push(`- ${first.title} | ${first.itemType} | ${first.section} | ${group.length} copies`);

    const contexts = uniqueStrings(group.map((item) => {
      const context = formatContext(item);
      return context || undefined;
    }));
    if (contexts.length > 0) {
      lines.push(`  Contexts: ${contexts.slice(0, 3).join("; ")}`);
    }

    const years = uniqueStrings(group.map((item) => (item.year ? String(item.year) : undefined)));
    if (years.length > 0) {
      lines.push(`  Years: ${years.join(", ")}`);
    }

    const addedDates = uniqueStrings(group.map((item) => item.addedAt ?? undefined));
    if (addedDates.length > 0) {
      lines.push(`  Added: ${addedDates.slice(0, 3).join("; ")}`);
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
