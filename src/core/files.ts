import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type IndexedFileRecord = {
  path: string;
  root: string;
  relativePath: string;
  name: string;
  extension: string;
  sizeBytes: number;
  modifiedAt: string;
  kind: "text" | "binary";
  preview?: string | null;
};

export type FileCatalogSnapshot = {
  generatedAt: string;
  roots: string[];
  indexedFileCount: number;
  skippedRoots?: string[];
  maxFiles?: number | null;
  items: IndexedFileRecord[];
};

const DEFAULT_FILE_CATALOG_PATH = path.resolve(
  fileURLToPath(new URL("../../data/local/file-catalog.json", import.meta.url))
);

let cachedCatalog:
  | {
      path: string;
      mtimeMs: number;
      value: FileCatalogSnapshot;
    }
  | undefined;

function stripBom(value: string) {
  return value.replace(/^\uFEFF/, "");
}

function normalize(value: string | undefined) {
  return value?.trim().toLowerCase();
}

function assertIndexedFileRecord(value: unknown): asserts value is IndexedFileRecord {
  if (!value || typeof value !== "object") {
    throw new Error("Indexed file entries must be objects");
  }

  const candidate = value as Partial<IndexedFileRecord>;
  if (
    typeof candidate.path !== "string" ||
    typeof candidate.root !== "string" ||
    typeof candidate.relativePath !== "string" ||
    typeof candidate.name !== "string" ||
    typeof candidate.extension !== "string" ||
    typeof candidate.sizeBytes !== "number" ||
    typeof candidate.modifiedAt !== "string" ||
    (candidate.kind !== "text" && candidate.kind !== "binary")
  ) {
    throw new Error("Indexed file entries are missing required fields");
  }
}

function assertFileCatalogSnapshot(value: unknown): asserts value is FileCatalogSnapshot {
  if (!value || typeof value !== "object") {
    throw new Error("File catalog snapshot must be an object");
  }

  const candidate = value as Partial<FileCatalogSnapshot>;
  if (
    typeof candidate.generatedAt !== "string" ||
    !Array.isArray(candidate.roots) ||
    typeof candidate.indexedFileCount !== "number" ||
    !Array.isArray(candidate.items)
  ) {
    throw new Error("File catalog snapshot is missing required fields");
  }

  for (const item of candidate.items) {
    assertIndexedFileRecord(item);
  }
}

export function getFileCatalogPath() {
  return process.env.FILE_CATALOG_PATH ?? DEFAULT_FILE_CATALOG_PATH;
}

export async function readFileCatalogSnapshot(
  catalogPath = getFileCatalogPath()
): Promise<FileCatalogSnapshot> {
  const fullPath = path.resolve(catalogPath);
  const stat = await fs.stat(fullPath);

  if (cachedCatalog && cachedCatalog.path === fullPath && cachedCatalog.mtimeMs === stat.mtimeMs) {
    return cachedCatalog.value;
  }

  try {
    const raw = await fs.readFile(fullPath, "utf8");
    const parsed = JSON.parse(stripBom(raw)) as unknown;
    assertFileCatalogSnapshot(parsed);

    cachedCatalog = {
      path: fullPath,
      mtimeMs: stat.mtimeMs,
      value: parsed
    };

    return parsed;
  } catch (err) {
    throw new Error(
      `Failed to read/parse file catalog snapshot at ${fullPath}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

function scoreFile(record: IndexedFileRecord, query: string) {
  let score = 0;
  const name = record.name.toLowerCase();
  const relativePath = record.relativePath.toLowerCase();
  const preview = record.preview?.toLowerCase() ?? "";

  if (name === query) score += 10;
  if (relativePath === query) score += 12;
  if (name.includes(query)) score += 6;
  if (relativePath.includes(query)) score += 4;
  if (preview.includes(query)) score += 1;

  return score;
}

export function searchFiles(
  snapshot: FileCatalogSnapshot,
  options: {
    query: string;
    root?: string;
    extension?: string;
    limit?: number;
  }
) {
  const query = normalize(options.query);
  if (!query) {
    return [];
  }

  const root = normalize(options.root);
  const extension = normalize(options.extension);
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);

  return snapshot.items
    .map((item) => ({
      item,
      score: scoreFile(item, query)
    }))
    .filter(({ item, score }) => {
      if (score <= 0) {
        return false;
      }

      if (root && !item.root.toLowerCase().includes(root) && !item.relativePath.toLowerCase().includes(root)) {
        return false;
      }

      if (extension) {
        const normalizedExtension = extension.startsWith(".") ? extension : `.${extension}`;
        if (item.extension.toLowerCase() !== normalizedExtension) {
          return false;
        }
      }

      return true;
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        Date.parse(right.item.modifiedAt) - Date.parse(left.item.modifiedAt) ||
        left.item.relativePath.localeCompare(right.item.relativePath)
    )
    .slice(0, limit)
    .map(({ item }) => item);
}

function formatByteSize(value: number) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  const digits = size >= 100 || unitIndex === 0 ? 0 : size >= 10 ? 1 : 2;
  return `${size.toFixed(digits)} ${units[unitIndex]}`;
}

export function formatFileSearchResults(
  snapshot: FileCatalogSnapshot,
  results: IndexedFileRecord[],
  options: {
    query: string;
    root?: string;
    extension?: string;
    limit?: number;
  }
) {
  const filters = [
    `query=${options.query}`,
    options.root ? `root=${options.root}` : "",
    options.extension ? `extension=${options.extension}` : ""
  ]
    .filter(Boolean)
    .join(", ");
  const lines = [
    `Generated: ${snapshot.generatedAt}`,
    `Indexed files: ${snapshot.indexedFileCount}`,
    `File search (${filters}):`,
    ""
  ];

  if (results.length === 0) {
    lines.push("- No indexed files matched that search.");
    return lines.join("\n");
  }

  for (const item of results) {
    lines.push(`- ${item.relativePath} | ${formatByteSize(item.sizeBytes)} | ${item.modifiedAt}`);
    if (item.preview) {
      lines.push(`  ${item.preview.replace(/\s+/g, " ").slice(0, 220)}`);
    }
  }

  return lines.join("\n");
}

export function listRecentFiles(
  snapshot: FileCatalogSnapshot,
  options?: {
    root?: string;
    extension?: string;
    limit?: number;
  }
) {
  const root = normalize(options?.root);
  const extension = normalize(options?.extension);
  const limit = Math.min(Math.max(options?.limit ?? 20, 1), 100);

  return snapshot.items
    .filter((item) => {
      if (root && !item.root.toLowerCase().includes(root) && !item.relativePath.toLowerCase().includes(root)) {
        return false;
      }

      if (extension) {
        const normalizedExtension = extension.startsWith(".") ? extension : `.${extension}`;
        if (item.extension.toLowerCase() !== normalizedExtension) {
          return false;
        }
      }

      return true;
    })
    .sort((left, right) => Date.parse(right.modifiedAt) - Date.parse(left.modifiedAt))
    .slice(0, limit);
}

export function formatRecentFiles(
  snapshot: FileCatalogSnapshot,
  items: IndexedFileRecord[],
  options?: {
    root?: string;
    extension?: string;
    limit?: number;
  }
) {
  const filters = [
    options?.root ? `root=${options.root}` : "",
    options?.extension ? `extension=${options.extension}` : ""
  ]
    .filter(Boolean)
    .join(", ");
  const lines = [
    `Generated: ${snapshot.generatedAt}`,
    filters ? `Recent files (${filters}):` : "Recent files:",
    ""
  ];

  if (items.length === 0) {
    lines.push("- No indexed files matched that filter.");
    return lines.join("\n");
  }

  for (const item of items) {
    lines.push(`- ${item.relativePath} | ${item.modifiedAt} | ${formatByteSize(item.sizeBytes)}`);
  }

  return lines.join("\n");
}

export function findIndexedFile(snapshot: FileCatalogSnapshot, query: string) {
  const normalized = normalize(query);
  if (!normalized) {
    return undefined;
  }

  return (
    snapshot.items.find((item) => item.relativePath.toLowerCase() === normalized || item.path.toLowerCase() === normalized) ??
    snapshot.items.find((item) => item.name.toLowerCase() === normalized) ??
    snapshot.items.find((item) => item.relativePath.toLowerCase().includes(normalized) || item.name.toLowerCase().includes(normalized))
  );
}

export function formatIndexedFileContent(snapshot: FileCatalogSnapshot, item: IndexedFileRecord) {
  const lines = [
    `Generated: ${snapshot.generatedAt}`,
    `Path: ${item.relativePath}`,
    `Root: ${item.root}`,
    `Modified: ${item.modifiedAt}`,
    `Size: ${formatByteSize(item.sizeBytes)}`,
    `Kind: ${item.kind}`,
    ""
  ];

  if (item.kind !== "text") {
    lines.push("This indexed file is marked as binary, so no text preview is stored.");
    return lines.join("\n");
  }

  if (!item.preview) {
    lines.push("No stored preview is available for this file.");
    return lines.join("\n");
  }

  lines.push(item.preview);
  return lines.join("\n");
}

export function summarizeFolder(
  snapshot: FileCatalogSnapshot,
  query: string,
  limit = 10
) {
  const normalized = normalize(query);
  if (!normalized) {
    return undefined;
  }

  const items = snapshot.items.filter(
    (item) =>
      item.root.toLowerCase().includes(normalized) ||
      item.relativePath.toLowerCase().startsWith(normalized) ||
      item.relativePath.toLowerCase().includes(`${normalized}\\`) ||
      item.relativePath.toLowerCase().includes(`${normalized}/`)
  );

  if (items.length === 0) {
    return undefined;
  }

  const totalBytes = items.reduce((sum, item) => sum + item.sizeBytes, 0);
  const recentItems = [...items].sort((left, right) => Date.parse(right.modifiedAt) - Date.parse(left.modifiedAt)).slice(0, limit);
  const extensionCounts = new Map<string, number>();
  for (const item of items) {
    const key = item.extension || "[no extension]";
    extensionCounts.set(key, (extensionCounts.get(key) ?? 0) + 1);
  }

  return {
    query,
    itemCount: items.length,
    totalBytes,
    recentItems,
    topExtensions: [...extensionCounts.entries()].sort((left, right) => right[1] - left[1]).slice(0, 5)
  };
}

export function formatFolderSummary(
  snapshot: FileCatalogSnapshot,
  summary:
    | {
        query: string;
        itemCount: number;
        totalBytes: number;
        recentItems: IndexedFileRecord[];
        topExtensions: Array<[string, number]>;
      }
    | undefined
) {
  const lines = [`Generated: ${snapshot.generatedAt}`, "Folder summary:", ""];

  if (!summary) {
    lines.push("- No indexed folder or path prefix matched that query.");
    return lines.join("\n");
  }

  lines.push(`Query: ${summary.query}`);
  lines.push(`Files: ${summary.itemCount}`);
  lines.push(`Total size: ${formatByteSize(summary.totalBytes)}`);
  lines.push("");

  if (summary.topExtensions.length > 0) {
    lines.push("Top extensions:");
    for (const [extension, count] of summary.topExtensions) {
      lines.push(`- ${extension} | ${count} files`);
    }
    lines.push("");
  }

  lines.push("Recent files:");
  for (const item of summary.recentItems) {
    lines.push(`- ${item.relativePath} | ${item.modifiedAt}`);
  }

  return lines.join("\n");
}
