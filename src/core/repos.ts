import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type RepoStatusRecord = {
  name: string;
  path: string;
  branch?: string | null;
  remote?: string | null;
  dirty: boolean;
  ahead?: number | null;
  behind?: number | null;
  stagedCount: number;
  modifiedCount: number;
  untrackedCount: number;
  lastCommitAt?: string | null;
  lastCommitSummary?: string | null;
};

export type RepoStatusSnapshot = {
  generatedAt: string;
  roots: string[];
  repoCount: number;
  repos: RepoStatusRecord[];
};

const DEFAULT_REPO_STATUS_PATH = path.resolve(
  fileURLToPath(new URL("../../data/local/repo-status.json", import.meta.url))
);

let cachedRepoStatus:
  | {
      path: string;
      mtimeMs: number;
      value: RepoStatusSnapshot;
    }
  | undefined;

function stripBom(value: string) {
  return value.replace(/^\uFEFF/, "");
}

function normalize(value: string | undefined) {
  return value?.trim().toLowerCase();
}

function assertRepoStatusRecord(value: unknown): asserts value is RepoStatusRecord {
  if (!value || typeof value !== "object") {
    throw new Error("Repo status entries must be objects");
  }

  const candidate = value as Partial<RepoStatusRecord>;
  if (
    typeof candidate.name !== "string" ||
    typeof candidate.path !== "string" ||
    typeof candidate.dirty !== "boolean" ||
    typeof candidate.stagedCount !== "number" ||
    typeof candidate.modifiedCount !== "number" ||
    typeof candidate.untrackedCount !== "number"
  ) {
    throw new Error("Repo status entries are missing required fields");
  }
}

function assertRepoStatusSnapshot(value: unknown): asserts value is RepoStatusSnapshot {
  if (!value || typeof value !== "object") {
    throw new Error("Repo status snapshot must be an object");
  }

  const candidate = value as Partial<RepoStatusSnapshot>;
  if (
    typeof candidate.generatedAt !== "string" ||
    !Array.isArray(candidate.roots) ||
    typeof candidate.repoCount !== "number" ||
    !Array.isArray(candidate.repos)
  ) {
    throw new Error("Repo status snapshot is missing required fields");
  }

  for (const repo of candidate.repos) {
    assertRepoStatusRecord(repo);
  }
}

export function getRepoStatusPath() {
  return process.env.REPO_STATUS_PATH ?? DEFAULT_REPO_STATUS_PATH;
}

export async function readRepoStatusSnapshot(
  statusPath = getRepoStatusPath()
): Promise<RepoStatusSnapshot> {
  const fullPath = path.resolve(statusPath);
  const stat = await fs.stat(fullPath);

  if (cachedRepoStatus && cachedRepoStatus.path === fullPath && cachedRepoStatus.mtimeMs === stat.mtimeMs) {
    return cachedRepoStatus.value;
  }

  const raw = await fs.readFile(fullPath, "utf8");
  const parsed = JSON.parse(stripBom(raw)) as unknown;
  assertRepoStatusSnapshot(parsed);

  cachedRepoStatus = {
    path: fullPath,
    mtimeMs: stat.mtimeMs,
    value: parsed
  };

  return parsed;
}

function findRepoMatch(repos: RepoStatusRecord[], query: string) {
  const normalized = normalize(query);
  if (!normalized) {
    return undefined;
  }

  return (
    repos.find((repo) => repo.name.toLowerCase() === normalized || repo.path.toLowerCase() === normalized) ??
    repos.find(
      (repo) =>
        repo.name.toLowerCase().includes(normalized) ||
        repo.path.toLowerCase().includes(normalized) ||
        (repo.branch?.toLowerCase().includes(normalized) ?? false) ||
        (repo.remote?.toLowerCase().includes(normalized) ?? false)
    )
  );
}

export function formatLocalRepos(
  snapshot: RepoStatusSnapshot,
  options?: {
    query?: string;
    dirty?: boolean;
    limit?: number;
  }
) {
  const query = normalize(options?.query);
  const limit = Math.min(Math.max(options?.limit ?? 30, 1), 100);
  const repos = snapshot.repos
    .filter((repo) => {
      if (
        query &&
        !repo.name.toLowerCase().includes(query) &&
        !repo.path.toLowerCase().includes(query) &&
        !(repo.branch?.toLowerCase().includes(query) ?? false) &&
        !(repo.remote?.toLowerCase().includes(query) ?? false)
      ) {
        return false;
      }

      if (options?.dirty !== undefined && repo.dirty !== options.dirty) {
        return false;
      }

      return true;
    })
    .sort((left, right) => left.name.localeCompare(right.name))
    .slice(0, limit);

  const filters = [
    options?.query ? `query=${options.query}` : "",
    options?.dirty !== undefined ? `dirty=${options.dirty}` : ""
  ]
    .filter(Boolean)
    .join(", ");

  const lines = [
    `Generated: ${snapshot.generatedAt}`,
    filters ? `Local repos (${filters}):` : "Local repos:",
    ""
  ];

  if (repos.length === 0) {
    lines.push("- No local repos matched that filter.");
    return lines.join("\n");
  }

  for (const repo of repos) {
    const bits = [
      repo.branch ? `branch ${repo.branch}` : "",
      repo.dirty ? "dirty" : "clean",
      repo.ahead ? `ahead ${repo.ahead}` : "",
      repo.behind ? `behind ${repo.behind}` : ""
    ]
      .filter(Boolean)
      .join(" | ");
    lines.push(`- ${repo.name} | ${bits}`);
    lines.push(`  ${repo.path}`);
  }

  return lines.join("\n");
}

export function formatRepoDetails(snapshot: RepoStatusSnapshot, query: string) {
  const repo = findRepoMatch(snapshot.repos, query);
  if (!repo) {
    return `Generated: ${snapshot.generatedAt}\nRepo status:\n\n- No local repo matched "${query}".`;
  }

  const lines = [
    `Generated: ${snapshot.generatedAt}`,
    "Repo status:",
    "",
    `Name: ${repo.name}`,
    `Path: ${repo.path}`,
    `Branch: ${repo.branch || "unknown"}`,
    `Remote: ${repo.remote || "none"}`,
    `Dirty: ${repo.dirty ? "yes" : "no"}`,
    `Staged changes: ${repo.stagedCount}`,
    `Modified changes: ${repo.modifiedCount}`,
    `Untracked files: ${repo.untrackedCount}`
  ];

  if (repo.ahead !== null && repo.ahead !== undefined) {
    lines.push(`Ahead: ${repo.ahead}`);
  }
  if (repo.behind !== null && repo.behind !== undefined) {
    lines.push(`Behind: ${repo.behind}`);
  }
  if (repo.lastCommitAt) {
    lines.push(`Last commit: ${repo.lastCommitAt}`);
  }
  if (repo.lastCommitSummary) {
    lines.push(`Last commit summary: ${repo.lastCommitSummary}`);
  }

  return lines.join("\n");
}

export function formatRecentRepoActivity(
  snapshot: RepoStatusSnapshot,
  options?: {
    query?: string;
    limit?: number;
  }
) {
  const query = normalize(options?.query);
  const limit = Math.min(Math.max(options?.limit ?? 20, 1), 100);
  const repos = snapshot.repos
    .filter((repo) => {
      if (
        query &&
        !repo.name.toLowerCase().includes(query) &&
        !repo.path.toLowerCase().includes(query) &&
        !(repo.branch?.toLowerCase().includes(query) ?? false)
      ) {
        return false;
      }

      return true;
    })
    .sort((left, right) => Date.parse(right.lastCommitAt ?? "") - Date.parse(left.lastCommitAt ?? ""))
    .slice(0, limit);

  const lines = [
    `Generated: ${snapshot.generatedAt}`,
    options?.query ? `Recent repo activity (${options.query}):` : "Recent repo activity:",
    ""
  ];

  if (repos.length === 0) {
    lines.push("- No local repos matched that filter.");
    return lines.join("\n");
  }

  for (const repo of repos) {
    const bits = [
      repo.lastCommitAt ? `last commit ${repo.lastCommitAt}` : "last commit unknown",
      repo.lastCommitSummary ?? "",
      repo.dirty ? "dirty" : "clean"
    ]
      .filter(Boolean)
      .join(" | ");
    lines.push(`- ${repo.name} | ${bits}`);
  }

  return lines.join("\n");
}
