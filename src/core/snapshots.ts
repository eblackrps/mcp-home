import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getFileCatalogPath, readFileCatalogSnapshot } from "./files.js";
import { getWindowsHostStatusPath, readWindowsHostStatus } from "./host.js";
import { getPlexActivityPath, readPlexActivitySnapshot } from "./plex-activity.js";
import { getPlexLibraryIndexPath, readPlexLibraryIndex } from "./plex.js";
import { getRepoStatusPath, readRepoStatusSnapshot } from "./repos.js";
import type { ToolProfile } from "./server-meta.js";

export type SnapshotFreshness = "fresh" | "late" | "stale" | "missing";
export type SnapshotRunState = "unknown" | "running" | "completed" | "failed";

export type SnapshotSchedulerStatus = {
  taskName: string;
  installed: boolean;
  state?: string | null;
  nextRunTime?: string | null;
  lastRunTime?: string | null;
  lastTaskResult?: number | null;
  intervalMinutes?: number | null;
};

export type SnapshotOutputSummary = {
  path?: string | null;
  exists?: boolean;
  updatedAt?: string | null;
  sizeBytes?: number | null;
  sourceTimestamp?: string | null;
};

type SnapshotStatusFile = {
  startedAt?: string | null;
  completedAt?: string | null;
  runState?: string | null;
  ok?: boolean | null;
  durationSeconds?: number | null;
  warnings?: string[];
  errors?: string[];
  scheduler?: SnapshotSchedulerStatus;
  outputs?: Partial<Record<SnapshotFileStatus["key"], SnapshotOutputSummary>>;
};

export type SnapshotFileStatus = {
  key: "windowsHostStatus" | "plexLibraryIndex" | "plexActivity" | "fileCatalog" | "repoStatus";
  label: string;
  path: string;
  exists: boolean;
  updatedAt?: string | null;
  sourceTimestamp?: string | null;
  ageMinutes?: number | null;
  freshness: SnapshotFreshness;
  thresholdMinutes: number;
  sizeBytes?: number | null;
  warning?: string | null;
};

export type SnapshotOverview = {
  checkedAt: string;
  refresh: {
    runState: SnapshotRunState;
    ok?: boolean | null;
    startedAt?: string | null;
    completedAt?: string | null;
    durationSeconds?: number | null;
    warnings: string[];
    errors: string[];
  };
  scheduler: SnapshotSchedulerStatus;
  files: SnapshotFileStatus[];
  overallFreshness: SnapshotFreshness;
};

export type SnapshotHistoryEntry = {
  checkedAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  runState: SnapshotRunState;
  ok?: boolean | null;
  durationSeconds?: number | null;
  warnings: string[];
  errors: string[];
  outputs?: Partial<Record<SnapshotFileStatus["key"], SnapshotOutputSummary>>;
};

const DEFAULT_SNAPSHOT_STATUS_PATH = path.resolve(
  fileURLToPath(new URL("../../data/local/snapshot-status.json", import.meta.url))
);

const DEFAULT_SNAPSHOT_HISTORY_PATH = path.resolve(
  fileURLToPath(new URL("../../data/local/snapshot-history.json", import.meta.url))
);

const DEFAULT_THRESHOLDS_MINUTES = {
  windowsHostStatus: 90,
  plexLibraryIndex: 24 * 60,
  plexActivity: 90,
  fileCatalog: 90,
  repoStatus: 90
} as const;

const PUBLIC_SAFE_SNAPSHOT_KEYS = new Set<SnapshotFileStatus["key"]>(["windowsHostStatus", "plexLibraryIndex", "plexActivity"]);

let cachedStatusFile:
  | {
      path: string;
      mtimeMs: number;
      value: SnapshotStatusFile;
    }
  | undefined;

let cachedHistoryFile:
  | {
      path: string;
      mtimeMs: number;
      value: SnapshotHistoryEntry[];
    }
  | undefined;

function stripBom(value: string) {
  return value.replace(/^\uFEFF/, "");
}

function toIsoDate(value: Date) {
  return value.toISOString();
}

function parseTimestamp(value: string | null | undefined) {
  if (!value) {
    return Number.NaN;
  }

  return Date.parse(value);
}

function formatAgeMinutes(ageMinutes: number | null | undefined) {
  if (ageMinutes === null || ageMinutes === undefined || !Number.isFinite(ageMinutes)) {
    return "unknown";
  }

  if (ageMinutes < 1) {
    return "under 1 minute";
  }

  if (ageMinutes < 60) {
    return `${Math.round(ageMinutes)} minutes`;
  }

  const hours = ageMinutes / 60;
  if (hours < 24) {
    return `${hours.toFixed(hours >= 10 ? 0 : 1)} hours`;
  }

  return `${(hours / 24).toFixed(1)} days`;
}

function classifyFreshness(ageMinutes: number | null | undefined, thresholdMinutes: number, exists: boolean): SnapshotFreshness {
  if (!exists) {
    return "missing";
  }

  if (ageMinutes === null || ageMinutes === undefined || !Number.isFinite(ageMinutes)) {
    return "stale";
  }

  if (ageMinutes <= thresholdMinutes) {
    return "fresh";
  }

  if (ageMinutes <= thresholdMinutes * 3) {
    return "late";
  }

  return "stale";
}

function summarizeOverallFreshness(files: SnapshotFileStatus[]): SnapshotFreshness {
  if (files.length === 0) {
    return "missing";
  }

  if (files.some((file) => file.freshness === "missing")) {
    return "missing";
  }

  if (files.some((file) => file.freshness === "stale")) {
    return "stale";
  }

  if (files.some((file) => file.freshness === "late")) {
    return "late";
  }

  return "fresh";
}

function toRunState(value: string | null | undefined): SnapshotRunState {
  if (value === "running" || value === "completed" || value === "failed") {
    return value;
  }

  return "unknown";
}

function getThresholdMinutes(key: keyof typeof DEFAULT_THRESHOLDS_MINUTES) {
  const envVarName =
    key === "windowsHostStatus"
      ? "HOST_SNAPSHOT_STALE_MINUTES"
      : key === "plexLibraryIndex"
        ? "PLEX_INDEX_STALE_MINUTES"
        : key === "plexActivity"
          ? "PLEX_ACTIVITY_STALE_MINUTES"
          : key === "fileCatalog"
            ? "FILE_CATALOG_STALE_MINUTES"
            : "REPO_STATUS_STALE_MINUTES";
  const raw = process.env[envVarName];
  if (!raw) {
    return DEFAULT_THRESHOLDS_MINUTES[key];
  }

  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    return DEFAULT_THRESHOLDS_MINUTES[key];
  }

  return parsed;
}

async function statIfExists(filePath: string) {
  try {
    return await fs.stat(filePath);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code) : "";
    if (code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

async function readSnapshotStatusFile(statusPath = getSnapshotStatusPath()): Promise<SnapshotStatusFile | undefined> {
  const fullPath = path.resolve(statusPath);
  const stat = await statIfExists(fullPath);
  if (!stat) {
    return undefined;
  }

  if (cachedStatusFile && cachedStatusFile.path === fullPath && cachedStatusFile.mtimeMs === stat.mtimeMs) {
    return cachedStatusFile.value;
  }

  const raw = await fs.readFile(fullPath, "utf8");
  const parsed = JSON.parse(stripBom(raw)) as SnapshotStatusFile;
  cachedStatusFile = {
    path: fullPath,
    mtimeMs: stat.mtimeMs,
    value: parsed
  };
  return parsed;
}

function normalizeHistoryEntry(value: unknown): SnapshotHistoryEntry {
  if (!value || typeof value !== "object") {
    throw new Error("Snapshot history entries must be objects");
  }

  const candidate = value as Partial<SnapshotHistoryEntry>;
  return {
    checkedAt: candidate.checkedAt ?? null,
    startedAt: candidate.startedAt ?? null,
    completedAt: candidate.completedAt ?? null,
    runState: toRunState(candidate.runState),
    ok: candidate.ok ?? null,
    durationSeconds:
      typeof candidate.durationSeconds === "number" && Number.isFinite(candidate.durationSeconds)
        ? candidate.durationSeconds
        : null,
    warnings: Array.isArray(candidate.warnings) ? candidate.warnings.filter((item): item is string => typeof item === "string") : [],
    errors: Array.isArray(candidate.errors) ? candidate.errors.filter((item): item is string => typeof item === "string") : [],
    outputs: candidate.outputs
  };
}

export function getSnapshotHistoryPath() {
  return process.env.SNAPSHOT_HISTORY_PATH ?? DEFAULT_SNAPSHOT_HISTORY_PATH;
}

async function readSnapshotHistoryFile(historyPath = getSnapshotHistoryPath()): Promise<SnapshotHistoryEntry[]> {
  const fullPath = path.resolve(historyPath);
  const stat = await statIfExists(fullPath);
  if (!stat) {
    return [];
  }

  if (cachedHistoryFile && cachedHistoryFile.path === fullPath && cachedHistoryFile.mtimeMs === stat.mtimeMs) {
    return cachedHistoryFile.value;
  }

  const raw = await fs.readFile(fullPath, "utf8");
  const parsed = JSON.parse(stripBom(raw)) as unknown;
  let entries: SnapshotHistoryEntry[];

  if (Array.isArray(parsed)) {
    entries = parsed.map(normalizeHistoryEntry);
  } else if (parsed && typeof parsed === "object" && Array.isArray((parsed as { entries?: unknown[] }).entries)) {
    entries = (parsed as { entries: unknown[] }).entries.map(normalizeHistoryEntry);
  } else {
    throw new Error("Snapshot history file is not in the expected format");
  }

  cachedHistoryFile = {
    path: fullPath,
    mtimeMs: stat.mtimeMs,
    value: entries
  };

  return entries;
}

async function buildSnapshotFileStatus(
  key: SnapshotFileStatus["key"],
  label: string,
  filePath: string,
  readSourceTimestamp: () => Promise<string | null | undefined>
): Promise<SnapshotFileStatus> {
  const resolvedPath = path.resolve(filePath);
  const stat = await statIfExists(resolvedPath);
  const thresholdMinutes = getThresholdMinutes(key);

  if (!stat) {
    return {
      key,
      label,
      path: resolvedPath,
      exists: false,
      freshness: "missing",
      thresholdMinutes
    };
  }

  let sourceTimestamp: string | null | undefined;
  let warning: string | null = null;

  try {
    sourceTimestamp = await readSourceTimestamp();
  } catch (error) {
    warning = error instanceof Error ? error.message : String(error);
  }

  const updatedAt = toIsoDate(stat.mtime);
  const ageReferenceTimestamp = parseTimestamp(sourceTimestamp ?? updatedAt);
  const ageMinutes = Number.isFinite(ageReferenceTimestamp) ? (Date.now() - ageReferenceTimestamp) / 60_000 : null;

  return {
    key,
    label,
    path: resolvedPath,
    exists: true,
    updatedAt,
    sourceTimestamp: sourceTimestamp ?? null,
    ageMinutes,
    freshness: classifyFreshness(ageMinutes, thresholdMinutes, true),
    thresholdMinutes,
    sizeBytes: stat.size,
    warning
  };
}

export function getSnapshotStatusPath() {
  return process.env.SNAPSHOT_STATUS_PATH ?? DEFAULT_SNAPSHOT_STATUS_PATH;
}

export async function readSnapshotOverview(): Promise<SnapshotOverview> {
  const statusFile = await readSnapshotStatusFile();
  const files = await Promise.all([
    buildSnapshotFileStatus("windowsHostStatus", "Windows host status", getWindowsHostStatusPath(), async () => {
      const status = await readWindowsHostStatus();
      return status.generatedAt;
    }),
    buildSnapshotFileStatus("plexLibraryIndex", "Plex library index", getPlexLibraryIndexPath(), async () => {
      const index = await readPlexLibraryIndex();
      return index.generatedAt;
    }),
    buildSnapshotFileStatus("plexActivity", "Plex activity snapshot", getPlexActivityPath(), async () => {
      const snapshot = await readPlexActivitySnapshot();
      return snapshot.fetchedAt;
    }),
    buildSnapshotFileStatus("fileCatalog", "File catalog snapshot", getFileCatalogPath(), async () => {
      const snapshot = await readFileCatalogSnapshot();
      return snapshot.generatedAt;
    }),
    buildSnapshotFileStatus("repoStatus", "Repo status snapshot", getRepoStatusPath(), async () => {
      const snapshot = await readRepoStatusSnapshot();
      return snapshot.generatedAt;
    })
  ]);

  const scheduler: SnapshotSchedulerStatus = statusFile?.scheduler ?? {
    taskName: "MCP Home Host Refresh",
    installed: false
  };

  return {
    checkedAt: new Date().toISOString(),
    refresh: {
      runState: toRunState(statusFile?.runState),
      ok: statusFile?.ok ?? null,
      startedAt: statusFile?.startedAt ?? null,
      completedAt: statusFile?.completedAt ?? null,
      durationSeconds: statusFile?.durationSeconds ?? null,
      warnings: statusFile?.warnings ?? [],
      errors: statusFile?.errors ?? []
    },
    scheduler,
    files,
    overallFreshness: summarizeOverallFreshness(files)
  };
}

export async function readSnapshotHistory(limit?: number): Promise<SnapshotHistoryEntry[]> {
  const history = await readSnapshotHistoryFile();
  const normalizedLimit = limit ? Math.min(Math.max(limit, 1), 100) : undefined;
  const sorted = [...history].sort((left, right) => parseTimestamp(right.checkedAt) - parseTimestamp(left.checkedAt));
  return normalizedLimit ? sorted.slice(0, normalizedLimit) : sorted;
}

function getVisibleSnapshotFiles(files: SnapshotFileStatus[], profile: ToolProfile) {
  if (profile === "full") {
    return files;
  }

  return files.filter((file) => PUBLIC_SAFE_SNAPSHOT_KEYS.has(file.key));
}

export function filterSnapshotOverviewForProfile(overview: SnapshotOverview, profile: ToolProfile): SnapshotOverview {
  const files = getVisibleSnapshotFiles(overview.files, profile);
  return {
    ...overview,
    files,
    overallFreshness: summarizeOverallFreshness(files)
  };
}

export function formatSnapshotHeadline(overview: SnapshotOverview) {
  const pieces = overview.files.map((file) => {
    const age = formatAgeMinutes(file.ageMinutes);
    return `${file.label}: ${file.freshness} (${age})`;
  });

  return `Snapshot freshness: ${overview.overallFreshness}. ${pieces.join("; ")}.`;
}

export function formatSnapshotHeadlineForProfile(overview: SnapshotOverview, profile: ToolProfile) {
  return formatSnapshotHeadline(filterSnapshotOverviewForProfile(overview, profile));
}

function summarizeHistoryFailures(entries: SnapshotHistoryEntry[]) {
  const failedRuns = entries.filter((entry) => entry.runState === "failed" || entry.ok === false);
  const completedRuns = entries.filter((entry) => entry.runState === "completed" && entry.ok === true);
  return {
    total: entries.length,
    failed: failedRuns.length,
    completed: completedRuns.length
  };
}

export function formatSnapshotStatus(overview: SnapshotOverview, profile: ToolProfile = "full") {
  const scopedOverview = filterSnapshotOverviewForProfile(overview, profile);
  const lines = [
    `Checked: ${scopedOverview.checkedAt}`,
    `Overall freshness: ${scopedOverview.overallFreshness}`,
    `Refresh run state: ${scopedOverview.refresh.runState}${scopedOverview.refresh.ok === true ? " | ok" : scopedOverview.refresh.ok === false ? " | failed" : ""}`,
    ""
  ];

  if (scopedOverview.refresh.startedAt) {
    lines.push(`Last refresh started: ${scopedOverview.refresh.startedAt}`);
  }

  if (scopedOverview.refresh.completedAt) {
    lines.push(`Last refresh completed: ${scopedOverview.refresh.completedAt}`);
  }

  if (scopedOverview.refresh.durationSeconds !== null && scopedOverview.refresh.durationSeconds !== undefined) {
    lines.push(`Last refresh duration: ${scopedOverview.refresh.durationSeconds.toFixed(1)} seconds`);
  }

  lines.push("");
  lines.push("Scheduler:");

  if (!scopedOverview.scheduler.installed) {
    lines.push(profile === "full" ? "- MCP Home Host Refresh is not installed." : "- Automatic host refresh is not installed.");
    lines.push('  Run "npm run schedule:host-refresh" on the Windows host if you want automatic refreshes.');
  } else {
    const schedulerBits = [
      scopedOverview.scheduler.state ? `state ${scopedOverview.scheduler.state}` : "",
      scopedOverview.scheduler.intervalMinutes ? `every ${scopedOverview.scheduler.intervalMinutes} minutes` : "",
      scopedOverview.scheduler.nextRunTime ? `next ${scopedOverview.scheduler.nextRunTime}` : "",
      scopedOverview.scheduler.lastRunTime ? `last ${scopedOverview.scheduler.lastRunTime}` : "",
      scopedOverview.scheduler.lastTaskResult !== null && scopedOverview.scheduler.lastTaskResult !== undefined
        ? `last result ${scopedOverview.scheduler.lastTaskResult}`
        : ""
    ]
      .filter(Boolean)
      .join(" | ");
    const schedulerLabel = profile === "full" ? scopedOverview.scheduler.taskName : "Automatic host refresh";
    lines.push(`- ${schedulerLabel}${schedulerBits ? ` | ${schedulerBits}` : ""}`);
  }

  lines.push("");
  lines.push("Snapshots:");

  for (const file of scopedOverview.files) {
    const details = [
      file.freshness,
      `age ${formatAgeMinutes(file.ageMinutes)}`,
      `threshold ${file.thresholdMinutes} minutes`,
      file.sizeBytes !== null && file.sizeBytes !== undefined ? `${file.sizeBytes} bytes` : ""
    ]
      .filter(Boolean)
      .join(" | ");
    lines.push(`- ${file.label} | ${details}`);
    if (profile === "full") {
      lines.push(`  Path: ${file.path}`);
      if (file.sourceTimestamp) {
        lines.push(`  Source timestamp: ${file.sourceTimestamp}`);
      } else if (file.updatedAt) {
        lines.push(`  File updated: ${file.updatedAt}`);
      }
    } else if (file.sourceTimestamp || file.updatedAt) {
      lines.push(`  Updated: ${file.sourceTimestamp || file.updatedAt}`);
    }

    if (file.warning) {
      lines.push(`  Warning: ${file.warning}`);
    }
  }

  if (scopedOverview.refresh.warnings.length > 0) {
    lines.push("");
    lines.push("Refresh warnings:");
    for (const warning of scopedOverview.refresh.warnings) {
      lines.push(`- ${warning}`);
    }
  }

  if (scopedOverview.refresh.errors.length > 0) {
    lines.push("");
    lines.push("Refresh errors:");
    for (const error of scopedOverview.refresh.errors) {
      lines.push(`- ${error}`);
    }
  }

  return lines.join("\n");
}

export function formatSnapshotHistory(entries: SnapshotHistoryEntry[], options?: { limit?: number }) {
  const limit = Math.min(Math.max(options?.limit ?? entries.length, 1), 100);
  const selected = entries.slice(0, limit);
  const summary = summarizeHistoryFailures(selected);
  const lines = [
    `Snapshot history: ${selected.length} runs shown.`,
    `Completed: ${summary.completed} | Failed: ${summary.failed}`,
    ""
  ];

  if (selected.length === 0) {
    lines.push("- No snapshot refresh history has been recorded yet.");
    return lines.join("\n");
  }

  for (const entry of selected) {
    const statusBits = [
      entry.runState,
      entry.ok === true ? "ok" : entry.ok === false ? "failed" : "",
      entry.durationSeconds !== null && entry.durationSeconds !== undefined
        ? `${entry.durationSeconds.toFixed(1)}s`
        : ""
    ]
      .filter(Boolean)
      .join(" | ");
    lines.push(`- ${entry.checkedAt || entry.completedAt || entry.startedAt || "unknown"} | ${statusBits}`);

    if (entry.startedAt || entry.completedAt) {
      lines.push(`  Started: ${entry.startedAt || "unknown"} | Completed: ${entry.completedAt || "unknown"}`);
    }

    if (entry.warnings.length > 0) {
      lines.push(`  Warnings: ${entry.warnings.join(" | ")}`);
    }

    if (entry.errors.length > 0) {
      lines.push(`  Errors: ${entry.errors.join(" | ")}`);
    }
  }

  return lines.join("\n");
}

export function formatSnapshotRecommendations(overview: SnapshotOverview, history: SnapshotHistoryEntry[], profile: ToolProfile = "full") {
  const scopedOverview = filterSnapshotOverviewForProfile(overview, profile);
  const lines = [
    "Snapshot recommendations:",
    "",
    formatSnapshotHeadline(scopedOverview),
    ""
  ];

  const recommendations: string[] = [];
  const likelyCauses: string[] = [];
  const recentHistory = history.slice(0, 5);
  const recentFailures = recentHistory.filter((entry) => entry.runState === "failed" || entry.ok === false);
  const fileMap = new Map(scopedOverview.files.map((file) => [file.key, file]));
  const hostFile = fileMap.get("windowsHostStatus");
  const plexIndexFile = fileMap.get("plexLibraryIndex");
  const plexActivityFile = fileMap.get("plexActivity");
  const fileCatalogFile = fileMap.get("fileCatalog");
  const repoStatusFile = fileMap.get("repoStatus");
  const warningText = overview.refresh.warnings.join(" ").toLowerCase();
  const errorText = overview.refresh.errors.join(" ").toLowerCase();

  if (!scopedOverview.scheduler.installed) {
    recommendations.push('Install the scheduled refresh task with "npm run schedule:host-refresh" so snapshots do not depend on manual refreshes.');
  } else if (scopedOverview.scheduler.lastTaskResult !== null && scopedOverview.scheduler.lastTaskResult !== undefined && scopedOverview.scheduler.lastTaskResult !== 0) {
    recommendations.push("The Windows scheduled task is installed but the last task result was non-zero. Inspect Task Scheduler for the latest host refresh run.");
  }

  if (scopedOverview.refresh.runState === "failed" || scopedOverview.refresh.ok === false) {
    recommendations.push('Run "npm run refresh:host" on the Windows host and inspect the reported errors before trusting stale data.');
  }

  if ((hostFile?.freshness === "stale" || hostFile?.freshness === "missing") && !overview.scheduler.installed) {
    likelyCauses.push("The Windows host snapshot is stale because there is no automatic refresh task installed.");
  }

  if ((plexIndexFile?.freshness === "stale" || plexIndexFile?.freshness === "missing") && /python|export script|plex database/.test(warningText + " " + errorText)) {
    likelyCauses.push("The Plex library index is stale because the local export prerequisites are missing or failing.");
    recommendations.push("Verify Python 3, the Plex database path, and the Plex export script on the Windows host.");
  }

  if ((plexActivityFile?.freshness === "stale" || plexActivityFile?.freshness === "missing") && /no plex token/.test(warningText)) {
    likelyCauses.push("The Plex activity snapshot is stale or incomplete because no local Plex token was found.");
    recommendations.push("Set a local Plex token so continue-watching, on-deck, and history snapshots can refresh fully.");
  }

  if ((hostFile?.freshness === "stale" || hostFile?.freshness === "missing") && /docker cli was not available/.test(warningText)) {
    likelyCauses.push("Docker snapshot data may be stale because the Docker CLI was unavailable during refresh.");
    recommendations.push("Make sure Docker Desktop is running and the Docker CLI is available in the Windows host environment.");
  }

  if (fileCatalogFile?.freshness === "missing") {
    likelyCauses.push("The indexed file catalog has not been generated yet or the configured file catalog path does not exist.");
    recommendations.push('Run "npm run refresh:host" and confirm FILE_INDEX_ROOTS includes at least one readable path.');
  } else if (fileCatalogFile?.freshness === "stale") {
    recommendations.push("The indexed file catalog is stale, so file search and folder summaries may be out of date.");
  }

  if (repoStatusFile?.freshness === "missing") {
    likelyCauses.push("The local repo status snapshot has not been generated yet or the configured repo status path does not exist.");
    recommendations.push('Run "npm run refresh:host" and confirm REPO_SCAN_ROOTS includes one or more local git workspaces.');
  } else if (repoStatusFile?.freshness === "stale") {
    recommendations.push("The local repo status snapshot is stale, so repo activity and dirty-state answers may be out of date.");
  }

  if (scopedOverview.overallFreshness === "late") {
    recommendations.push('Snapshots are late but not fully stale yet. A manual "npm run refresh:host" is worth doing if answers look old.');
  }

  if (scopedOverview.overallFreshness === "fresh") {
    recommendations.push("Snapshot freshness looks healthy right now. If answers still look wrong, compare the live tool output against the underlying host or Plex source.");
  }

  if (recentFailures.length >= 2) {
    likelyCauses.push(`The last ${recentHistory.length} runs include ${recentFailures.length} failures, so this is a repeated refresh problem rather than a one-off miss.`);
  }

  if (likelyCauses.length > 0) {
    lines.push("Likely causes:");
    for (const cause of likelyCauses) {
      lines.push(`- ${cause}`);
    }
    lines.push("");
  }

  lines.push("Recommended next actions:");
  if (recommendations.length === 0) {
    lines.push("- No special action is required right now.");
  } else {
    for (const recommendation of recommendations) {
      lines.push(`- ${recommendation}`);
    }
  }

  if (recentHistory.length > 0) {
    lines.push("");
    lines.push("Recent run summary:");
    for (const entry of recentHistory) {
      const statusBits = [
        entry.runState,
        entry.ok === true ? "ok" : entry.ok === false ? "failed" : "",
        entry.durationSeconds !== null && entry.durationSeconds !== undefined
          ? `${entry.durationSeconds.toFixed(1)}s`
          : ""
      ]
        .filter(Boolean)
        .join(" | ");
      lines.push(`- ${entry.checkedAt || entry.completedAt || entry.startedAt || "unknown"} | ${statusBits}`);
    }
  }

  return lines.join("\n");
}
