import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type HostComponent = {
  name: string;
  status: string;
  details: string;
  lastChecked: string;
};

export type PlexLibrarySummary = {
  name: string;
  sectionType: string;
  itemCount: number;
  lastScannedAt?: string | null;
};

export type PlexStatus = {
  reachable: boolean;
  localUrl: string;
  version?: string | null;
  indexedItemCount?: number;
  sectionCount?: number;
  libraries?: PlexLibrarySummary[];
};

export type WindowsHostStatus = {
  generatedAt: string;
  summary: string;
  host: {
    computerName: string;
    osName: string;
    osVersion: string;
    lastBootUpTime: string;
    uptime: string;
  };
  components: HostComponent[];
  plex?: PlexStatus;
};

const DEFAULT_WINDOWS_HOST_STATUS_PATH = path.resolve(
  fileURLToPath(new URL("../../data/local/windows-host-status.json", import.meta.url))
);

let cachedStatus:
  | {
      path: string;
      mtimeMs: number;
      value: WindowsHostStatus;
    }
  | undefined;

function stripBom(value: string) {
  return value.replace(/^\uFEFF/, "");
}

function assertComponent(value: unknown): asserts value is HostComponent {
  if (!value || typeof value !== "object") {
    throw new Error("Host components must be objects");
  }

  const candidate = value as Partial<HostComponent>;
  if (
    typeof candidate.name !== "string" ||
    typeof candidate.status !== "string" ||
    typeof candidate.details !== "string" ||
    typeof candidate.lastChecked !== "string"
  ) {
    throw new Error("Host component entries are missing required fields");
  }
}

function assertPlexStatus(value: unknown): asserts value is PlexStatus {
  if (!value || typeof value !== "object") {
    throw new Error("Plex status must be an object");
  }

  const candidate = value as Partial<PlexStatus>;
  if (typeof candidate.reachable !== "boolean" || typeof candidate.localUrl !== "string") {
    throw new Error("Plex status is missing required fields");
  }

  if (candidate.libraries !== undefined) {
    if (!Array.isArray(candidate.libraries)) {
      throw new Error("Plex libraries must be an array");
    }

    for (const library of candidate.libraries) {
      if (!library || typeof library !== "object") {
        throw new Error("Plex library entries must be objects");
      }

      const item = library as Partial<PlexLibrarySummary>;
      if (
        typeof item.name !== "string" ||
        typeof item.sectionType !== "string" ||
        typeof item.itemCount !== "number"
      ) {
        throw new Error("Plex library entries are missing required fields");
      }
    }
  }
}

function assertWindowsHostStatus(value: unknown): asserts value is WindowsHostStatus {
  if (!value || typeof value !== "object") {
    throw new Error("Windows host status payload must be an object");
  }

  const candidate = value as Partial<WindowsHostStatus>;
  if (typeof candidate.generatedAt !== "string" || typeof candidate.summary !== "string") {
    throw new Error("Windows host status payload is missing top-level fields");
  }

  if (!candidate.host || typeof candidate.host !== "object") {
    throw new Error("Windows host status payload is missing host details");
  }

  const host = candidate.host as Partial<WindowsHostStatus["host"]>;
  if (
    typeof host.computerName !== "string" ||
    typeof host.osName !== "string" ||
    typeof host.osVersion !== "string" ||
    typeof host.lastBootUpTime !== "string" ||
    typeof host.uptime !== "string"
  ) {
    throw new Error("Windows host details are missing required fields");
  }

  if (!Array.isArray(candidate.components)) {
    throw new Error("Windows host components must be an array");
  }

  for (const component of candidate.components) {
    assertComponent(component);
  }

  if (candidate.plex !== undefined) {
    assertPlexStatus(candidate.plex);
  }
}

export function getWindowsHostStatusPath() {
  return process.env.WINDOWS_HOST_STATUS_PATH ?? DEFAULT_WINDOWS_HOST_STATUS_PATH;
}

export async function readWindowsHostStatus(
  statusPath = getWindowsHostStatusPath()
): Promise<WindowsHostStatus> {
  const fullPath = path.resolve(statusPath);
  const stat = await fs.stat(fullPath);

  if (cachedStatus && cachedStatus.path === fullPath && cachedStatus.mtimeMs === stat.mtimeMs) {
    return cachedStatus.value;
  }

  const raw = await fs.readFile(fullPath, "utf8");
  const parsed = JSON.parse(stripBom(raw)) as unknown;
  assertWindowsHostStatus(parsed);

  cachedStatus = {
    path: fullPath,
    mtimeMs: stat.mtimeMs,
    value: parsed
  };

  return parsed;
}

export function formatWindowsHostStatus(status: WindowsHostStatus, componentFilter?: string) {
  const normalized = componentFilter?.trim().toLowerCase();
  const components = normalized
    ? status.components.filter((component) => component.name.toLowerCase().includes(normalized))
    : status.components;

  const lines = [
    `Host: ${status.host.computerName}`,
    `OS: ${status.host.osName} (${status.host.osVersion})`,
    `Last boot: ${status.host.lastBootUpTime}`,
    `Uptime: ${status.host.uptime}`,
    `Generated: ${status.generatedAt}`,
    `Summary: ${status.summary}`,
    "",
    "Components:"
  ];

  if (components.length === 0) {
    lines.push(`- No components matched "${componentFilter}".`);
    return lines.join("\n");
  }

  for (const component of components) {
    lines.push(`- ${component.name} | ${component.status} | last checked ${component.lastChecked}`);
    lines.push(`  ${component.details}`);
  }

  return lines.join("\n");
}

export function formatPlexStatus(status: WindowsHostStatus) {
  const plex = status.plex;
  if (!plex) {
    throw new Error("Windows host status does not include Plex details");
  }

  const lines = [
    `Generated: ${status.generatedAt}`,
    `Reachable: ${plex.reachable ? "yes" : "no"}`,
    `Local URL: ${plex.localUrl}`,
    `Version: ${plex.version || "unknown"}`,
    `Indexed items: ${plex.indexedItemCount ?? 0}`,
    `Indexed sections: ${plex.sectionCount ?? 0}`,
    ""
  ];

  if (plex.libraries && plex.libraries.length > 0) {
    lines.push("Libraries:");
    for (const library of plex.libraries) {
      const suffix = library.lastScannedAt ? ` | last scanned ${library.lastScannedAt}` : "";
      lines.push(`- ${library.name} | ${library.sectionType} | ${library.itemCount} items${suffix}`);
    }
  } else {
    lines.push("Libraries:");
    lines.push("- No Plex library summary is available yet.");
  }

  const plexComponent = status.components.find((component) => component.name === "plex");
  if (plexComponent) {
    lines.push("");
    lines.push(`Runtime: ${plexComponent.status}`);
    lines.push(plexComponent.details);
  }

  return lines.join("\n");
}
