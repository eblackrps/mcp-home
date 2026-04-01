import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getWindowsHostStatusPath, readWindowsHostStatus } from "./host.js";
import { getPlexActivityPath, readPlexActivitySnapshot } from "./plex-activity.js";
import { getPlexLibraryIndexPath, readPlexLibraryIndex } from "./plex.js";

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

type SnapshotStatusFile = {
  startedAt?: string | null;
  completedAt?: string | null;
  runState?: string | null;
  ok?: boolean | null;
  durationSeconds?: number | null;
  warnings?: string[];
  errors?: string[];
  scheduler?: SnapshotSchedulerStatus;
};

export type SnapshotFileStatus = {
  key: "windowsHostStatus" | "plexLibraryIndex" | "plexActivity";
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

const DEFAULT_SNAPSHOT_STATUS_PATH = path.resolve(
  fileURLToPath(new URL("../../data/local/snapshot-status.json", import.meta.url))
);

const DEFAULT_THRESHOLDS_MINUTES = {
  windowsHostStatus: 90,
  plexLibraryIndex: 24 * 60,
  plexActivity: 90
} as const;

let cachedStatusFile:
  | {
      path: string;
      mtimeMs: number;
      value: SnapshotStatusFile;
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
        : "PLEX_ACTIVITY_STALE_MINUTES";
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

export function formatSnapshotHeadline(overview: SnapshotOverview) {
  const pieces = overview.files.map((file) => {
    const age = formatAgeMinutes(file.ageMinutes);
    return `${file.label}: ${file.freshness} (${age})`;
  });

  return `Snapshot freshness: ${overview.overallFreshness}. ${pieces.join("; ")}.`;
}

export function formatSnapshotStatus(overview: SnapshotOverview) {
  const lines = [
    `Checked: ${overview.checkedAt}`,
    `Overall freshness: ${overview.overallFreshness}`,
    `Refresh run state: ${overview.refresh.runState}${overview.refresh.ok === true ? " | ok" : overview.refresh.ok === false ? " | failed" : ""}`,
    ""
  ];

  if (overview.refresh.startedAt) {
    lines.push(`Last refresh started: ${overview.refresh.startedAt}`);
  }

  if (overview.refresh.completedAt) {
    lines.push(`Last refresh completed: ${overview.refresh.completedAt}`);
  }

  if (overview.refresh.durationSeconds !== null && overview.refresh.durationSeconds !== undefined) {
    lines.push(`Last refresh duration: ${overview.refresh.durationSeconds.toFixed(1)} seconds`);
  }

  lines.push("");
  lines.push("Scheduler:");

  if (!overview.scheduler.installed) {
    lines.push("- MCP Home Host Refresh is not installed.");
    lines.push('  Run "npm run schedule:host-refresh" on the Windows host if you want automatic refreshes.');
  } else {
    const schedulerBits = [
      overview.scheduler.state ? `state ${overview.scheduler.state}` : "",
      overview.scheduler.intervalMinutes ? `every ${overview.scheduler.intervalMinutes} minutes` : "",
      overview.scheduler.nextRunTime ? `next ${overview.scheduler.nextRunTime}` : "",
      overview.scheduler.lastRunTime ? `last ${overview.scheduler.lastRunTime}` : "",
      overview.scheduler.lastTaskResult !== null && overview.scheduler.lastTaskResult !== undefined
        ? `last result ${overview.scheduler.lastTaskResult}`
        : ""
    ]
      .filter(Boolean)
      .join(" | ");
    lines.push(`- ${overview.scheduler.taskName}${schedulerBits ? ` | ${schedulerBits}` : ""}`);
  }

  lines.push("");
  lines.push("Snapshots:");

  for (const file of overview.files) {
    const details = [
      file.freshness,
      `age ${formatAgeMinutes(file.ageMinutes)}`,
      `threshold ${file.thresholdMinutes} minutes`,
      file.sizeBytes !== null && file.sizeBytes !== undefined ? `${file.sizeBytes} bytes` : ""
    ]
      .filter(Boolean)
      .join(" | ");
    lines.push(`- ${file.label} | ${details}`);
    lines.push(`  Path: ${file.path}`);

    if (file.sourceTimestamp) {
      lines.push(`  Source timestamp: ${file.sourceTimestamp}`);
    } else if (file.updatedAt) {
      lines.push(`  File updated: ${file.updatedAt}`);
    }

    if (file.warning) {
      lines.push(`  Warning: ${file.warning}`);
    }
  }

  if (overview.refresh.warnings.length > 0) {
    lines.push("");
    lines.push("Refresh warnings:");
    for (const warning of overview.refresh.warnings) {
      lines.push(`- ${warning}`);
    }
  }

  if (overview.refresh.errors.length > 0) {
    lines.push("");
    lines.push("Refresh errors:");
    for (const error of overview.refresh.errors) {
      lines.push(`- ${error}`);
    }
  }

  return lines.join("\n");
}
