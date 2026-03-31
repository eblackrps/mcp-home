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

export type DockerContainerStatus = {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  ports?: string | null;
  runningFor?: string | null;
  createdAt?: string | null;
  networks?: string[];
  composeProject?: string | null;
  composeService?: string | null;
};

export type DockerStatus = {
  available: boolean;
  cliVersion?: string | null;
  containerCount: number;
  runningCount: number;
  exitedCount: number;
  unhealthyCount: number;
  containers: DockerContainerStatus[];
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
  docker?: DockerStatus;
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

function assertDockerContainerStatus(value: unknown): asserts value is DockerContainerStatus {
  if (!value || typeof value !== "object") {
    throw new Error("Docker container entries must be objects");
  }

  const candidate = value as Partial<DockerContainerStatus>;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.name !== "string" ||
    typeof candidate.image !== "string" ||
    typeof candidate.state !== "string" ||
    typeof candidate.status !== "string"
  ) {
    throw new Error("Docker container entries are missing required fields");
  }

  if (candidate.networks !== undefined && !Array.isArray(candidate.networks)) {
    throw new Error("Docker container networks must be an array when present");
  }
}

function assertDockerStatus(value: unknown): asserts value is DockerStatus {
  if (!value || typeof value !== "object") {
    throw new Error("Docker status must be an object");
  }

  const candidate = value as Partial<DockerStatus>;
  if (
    typeof candidate.available !== "boolean" ||
    typeof candidate.containerCount !== "number" ||
    typeof candidate.runningCount !== "number" ||
    typeof candidate.exitedCount !== "number" ||
    typeof candidate.unhealthyCount !== "number" ||
    !Array.isArray(candidate.containers)
  ) {
    throw new Error("Docker status is missing required fields");
  }

  for (const container of candidate.containers) {
    assertDockerContainerStatus(container);
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

  if (candidate.docker !== undefined) {
    assertDockerStatus(candidate.docker);
  }

  if (candidate.plex !== undefined) {
    assertPlexStatus(candidate.plex);
  }
}

function normalize(value: string | undefined) {
  return value?.trim().toLowerCase();
}

function formatDockerContainerLine(container: DockerContainerStatus) {
  return `- ${container.name} | ${container.state} | ${container.image}`;
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
  const normalized = normalize(componentFilter);
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

export function formatDockerStatus(status: WindowsHostStatus) {
  const docker = status.docker;
  if (!docker) {
    throw new Error("Windows host status does not include Docker details");
  }

  const dockerComponent = status.components.find((component) => component.name === "docker");
  const lines = [
    `Generated: ${status.generatedAt}`,
    `Docker CLI available: ${docker.available ? "yes" : "no"}`,
    `Client version: ${docker.cliVersion || "unknown"}`,
    `Containers: ${docker.containerCount} total | ${docker.runningCount} running | ${docker.exitedCount} exited | ${docker.unhealthyCount} unhealthy`,
    ""
  ];

  if (dockerComponent) {
    lines.push(`Runtime: ${dockerComponent.status}`);
    lines.push(dockerComponent.details);
    lines.push("");
  }

  lines.push("Active containers:");
  const activeContainers = docker.containers.filter((container) => container.state === "running");
  if (activeContainers.length === 0) {
    lines.push("- No running containers in the latest snapshot.");
  } else {
    for (const container of activeContainers) {
      lines.push(formatDockerContainerLine(container));
      lines.push(`  ${container.status}`);

      if (container.ports) {
        lines.push(`  Ports: ${container.ports}`);
      }
    }
  }

  return lines.join("\n");
}

export function formatDockerContainers(
  status: WindowsHostStatus,
  options?: {
    name?: string;
    state?: string;
    limit?: number;
  }
) {
  const docker = status.docker;
  if (!docker) {
    throw new Error("Windows host status does not include Docker details");
  }

  const name = normalize(options?.name);
  const state = normalize(options?.state);
  const limit = Math.min(Math.max(options?.limit ?? 20, 1), 50);

  const filtered = docker.containers
    .filter((container) => {
      if (name && !container.name.toLowerCase().includes(name) && !container.image.toLowerCase().includes(name)) {
        return false;
      }

      if (state && container.state.toLowerCase() !== state) {
        return false;
      }

      return true;
    })
    .sort((left, right) => left.name.localeCompare(right.name))
    .slice(0, limit);

  const filters = [
    options?.name ? `name=${options.name}` : "",
    options?.state ? `state=${options.state}` : ""
  ]
    .filter(Boolean)
    .join(", ");

  const lines = [
    `Generated: ${status.generatedAt}`,
    filters ? `Docker containers (${filters}):` : "Docker containers:",
    ""
  ];

  if (filtered.length === 0) {
    lines.push("- No containers matched that filter.");
    return lines.join("\n");
  }

  for (const container of filtered) {
    lines.push(formatDockerContainerLine(container));
    lines.push(`  ${container.status}`);

    if (container.ports) {
      lines.push(`  Ports: ${container.ports}`);
    }

    if (container.composeProject || container.composeService) {
      lines.push(
        `  Compose: ${container.composeProject || "unknown project"} / ${container.composeService || "unknown service"}`
      );
    }

    if (container.networks && container.networks.length > 0) {
      lines.push(`  Networks: ${container.networks.join(", ")}`);
    }
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
