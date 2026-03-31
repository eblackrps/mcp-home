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
  command?: string | null;
  health?: string | null;
  exitCode?: number | null;
  error?: string | null;
  restartCount?: number | null;
  ports?: string | null;
  runningFor?: string | null;
  createdAt?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  networks?: string[];
  composeProject?: string | null;
  composeService?: string | null;
  mounts?: DockerMountStatus[];
  size?: string | null;
};

export type DockerMountStatus = {
  type: string;
  source?: string | null;
  destination: string;
  mode?: string | null;
  readWrite?: boolean | null;
};

export type DockerImageStatus = {
  id: string;
  repository: string;
  tag: string;
  size?: string | null;
  containers?: number | null;
  createdAt?: string | null;
  createdSince?: string | null;
  dangling?: boolean;
};

export type DockerNetworkStatus = {
  id: string;
  name: string;
  driver: string;
  scope: string;
  internal?: boolean | null;
  ipv6?: boolean | null;
  composeProject?: string | null;
  createdAt?: string | null;
};

export type DockerStatus = {
  available: boolean;
  cliVersion?: string | null;
  containerCount: number;
  runningCount: number;
  exitedCount: number;
  unhealthyCount: number;
  problemCount: number;
  imageCount: number;
  networkCount: number;
  composeProjectCount: number;
  containers: DockerContainerStatus[];
  images: DockerImageStatus[];
  networks: DockerNetworkStatus[];
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

  if (candidate.mounts !== undefined) {
    if (!Array.isArray(candidate.mounts)) {
      throw new Error("Docker container mounts must be an array when present");
    }

    for (const mount of candidate.mounts) {
      if (!mount || typeof mount !== "object") {
        throw new Error("Docker mount entries must be objects");
      }

      const item = mount as Partial<DockerMountStatus>;
      if (typeof item.type !== "string" || typeof item.destination !== "string") {
        throw new Error("Docker mount entries are missing required fields");
      }
    }
  }
}

function assertDockerImageStatus(value: unknown): asserts value is DockerImageStatus {
  if (!value || typeof value !== "object") {
    throw new Error("Docker image entries must be objects");
  }

  const candidate = value as Partial<DockerImageStatus>;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.repository !== "string" ||
    typeof candidate.tag !== "string"
  ) {
    throw new Error("Docker image entries are missing required fields");
  }
}

function assertDockerNetworkStatus(value: unknown): asserts value is DockerNetworkStatus {
  if (!value || typeof value !== "object") {
    throw new Error("Docker network entries must be objects");
  }

  const candidate = value as Partial<DockerNetworkStatus>;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.name !== "string" ||
    typeof candidate.driver !== "string" ||
    typeof candidate.scope !== "string"
  ) {
    throw new Error("Docker network entries are missing required fields");
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
    typeof candidate.problemCount !== "number" ||
    typeof candidate.imageCount !== "number" ||
    typeof candidate.networkCount !== "number" ||
    typeof candidate.composeProjectCount !== "number" ||
    !Array.isArray(candidate.containers) ||
    !Array.isArray(candidate.images) ||
    !Array.isArray(candidate.networks)
  ) {
    throw new Error("Docker status is missing required fields");
  }

  for (const container of candidate.containers) {
    assertDockerContainerStatus(container);
  }

  for (const image of candidate.images) {
    assertDockerImageStatus(image);
  }

  for (const network of candidate.networks) {
    assertDockerNetworkStatus(network);
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

function toLocalDateDisplay(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return value;
  }

  return value;
}

function findDockerContainerMatch(containers: DockerContainerStatus[], query: string) {
  const normalized = normalize(query);
  if (!normalized) {
    return undefined;
  }

  return (
    containers.find(
      (container) => container.name.toLowerCase() === normalized || container.id.toLowerCase() === normalized
    ) ??
    containers.find(
      (container) =>
        container.name.toLowerCase().includes(normalized) ||
        container.id.toLowerCase().includes(normalized) ||
        container.image.toLowerCase().includes(normalized)
    )
  );
}

function getDockerProblemContainers(containers: DockerContainerStatus[]) {
  return containers.filter((container) => {
    if (container.health?.toLowerCase() === "unhealthy") {
      return true;
    }

    if (["restarting", "dead"].includes(container.state.toLowerCase())) {
      return true;
    }

    if (container.state.toLowerCase() === "exited" && container.exitCode !== undefined && container.exitCode !== null) {
      return container.exitCode !== 0;
    }

    return false;
  });
}

function getDockerComposeProjects(containers: DockerContainerStatus[]) {
  const projects = new Map<
    string,
    {
      name: string;
      containers: DockerContainerStatus[];
      services: Set<string>;
    }
  >();

  for (const container of containers) {
    if (!container.composeProject) {
      continue;
    }

    const key = container.composeProject;
    const existing = projects.get(key);
    if (existing) {
      existing.containers.push(container);
      if (container.composeService) {
        existing.services.add(container.composeService);
      }
      continue;
    }

    projects.set(key, {
      name: key,
      containers: [container],
      services: new Set(container.composeService ? [container.composeService] : [])
    });
  }

  return [...projects.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function formatDockerContainerLine(container: DockerContainerStatus) {
  const health = container.health ? ` | health=${container.health}` : "";
  return `- ${container.name} | ${container.state}${health} | ${container.image}`;
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
  const activeContainers = docker.containers.filter((container) => container.state === "running");
  const problemContainers = getDockerProblemContainers(docker.containers);
  const lines = [
    `Generated: ${status.generatedAt}`,
    `Docker CLI available: ${docker.available ? "yes" : "no"}`,
    `Client version: ${docker.cliVersion || "unknown"}`,
    `Containers: ${docker.containerCount} total | ${docker.runningCount} running | ${docker.exitedCount} exited | ${docker.unhealthyCount} unhealthy | ${docker.problemCount} problems`,
    `Images: ${docker.imageCount} | Networks: ${docker.networkCount} | Compose projects: ${docker.composeProjectCount}`,
    ""
  ];

  if (dockerComponent) {
    lines.push(`Runtime: ${dockerComponent.status}`);
    lines.push(dockerComponent.details);
    lines.push("");
  }

  lines.push("Active containers:");
  if (activeContainers.length === 0) {
    lines.push("- No running containers in the latest snapshot.");
  } else {
    for (const container of activeContainers) {
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
    }
  }

  lines.push("");
  lines.push("Problem containers:");
  if (problemContainers.length === 0) {
    lines.push("- No unhealthy, restarting, dead, or non-zero exited containers in the latest snapshot.");
  } else {
    for (const container of problemContainers.slice(0, 10)) {
      lines.push(formatDockerContainerLine(container));
      lines.push(`  ${container.status}`);
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

    if (container.health) {
      lines.push(`  Health: ${container.health}`);
    }

    if (container.exitCode !== undefined && container.exitCode !== null) {
      lines.push(`  Exit code: ${container.exitCode}`);
    }
  }

  return lines.join("\n");
}

export function formatDockerProjects(
  status: WindowsHostStatus,
  options?: {
    project?: string;
    limit?: number;
  }
) {
  const docker = status.docker;
  if (!docker) {
    throw new Error("Windows host status does not include Docker details");
  }

  const projectFilter = normalize(options?.project);
  const limit = Math.min(Math.max(options?.limit ?? 20, 1), 50);
  const projects = getDockerComposeProjects(docker.containers)
    .filter((project) => !projectFilter || project.name.toLowerCase().includes(projectFilter))
    .slice(0, limit);

  const lines = [
    `Generated: ${status.generatedAt}`,
    projectFilter ? `Docker Compose projects (${options?.project}):` : "Docker Compose projects:",
    ""
  ];

  if (projects.length === 0) {
    lines.push("- No compose projects matched that filter.");
    return lines.join("\n");
  }

  for (const project of projects) {
    const runningCount = project.containers.filter((container) => container.state === "running").length;
    const problemCount = getDockerProblemContainers(project.containers).length;
    const services = [...project.services].sort();
    lines.push(
      `- ${project.name} | ${project.containers.length} containers | ${runningCount} running | ${problemCount} problems`
    );
    lines.push(`  Services: ${services.length > 0 ? services.join(", ") : "none"}`);

    for (const container of project.containers.sort((left, right) => left.name.localeCompare(right.name))) {
      lines.push(`  ${container.name} | ${container.state} | ${container.status}`);
    }
  }

  return lines.join("\n");
}

export function formatDockerIssues(
  status: WindowsHostStatus,
  options?: {
    limit?: number;
  }
) {
  const docker = status.docker;
  if (!docker) {
    throw new Error("Windows host status does not include Docker details");
  }

  const limit = Math.min(Math.max(options?.limit ?? 20, 1), 50);
  const issues = getDockerProblemContainers(docker.containers).slice(0, limit);
  const lines = [`Generated: ${status.generatedAt}`, "Docker issues:", ""];

  if (issues.length === 0) {
    lines.push("- No unhealthy, restarting, dead, or non-zero exited containers were found.");
    return lines.join("\n");
  }

  for (const container of issues) {
    lines.push(formatDockerContainerLine(container));
    lines.push(`  ${container.status}`);

    if (container.exitCode !== undefined && container.exitCode !== null) {
      lines.push(`  Exit code: ${container.exitCode}`);
    }

    if (container.error) {
      lines.push(`  Error: ${container.error}`);
    }

    if (container.composeProject || container.composeService) {
      lines.push(
        `  Compose: ${container.composeProject || "unknown project"} / ${container.composeService || "unknown service"}`
      );
    }
  }

  return lines.join("\n");
}

export function formatDockerContainerDetails(status: WindowsHostStatus, containerQuery: string) {
  const docker = status.docker;
  if (!docker) {
    throw new Error("Windows host status does not include Docker details");
  }

  const container = findDockerContainerMatch(docker.containers, containerQuery);
  if (!container) {
    return `Generated: ${status.generatedAt}\nDocker container details:\n\n- No container matched "${containerQuery}".`;
  }

  const lines = [
    `Generated: ${status.generatedAt}`,
    "Docker container details:",
    "",
    `Name: ${container.name}`,
    `ID: ${container.id}`,
    `Image: ${container.image}`,
    `State: ${container.state}`,
    `Status: ${container.status}`
  ];

  if (container.health) {
    lines.push(`Health: ${container.health}`);
  }

  if (container.exitCode !== undefined && container.exitCode !== null) {
    lines.push(`Exit code: ${container.exitCode}`);
  }

  if (container.restartCount !== undefined && container.restartCount !== null) {
    lines.push(`Restart count: ${container.restartCount}`);
  }

  if (container.command) {
    lines.push(`Command: ${container.command}`);
  }

  if (container.composeProject || container.composeService) {
    lines.push(`Compose: ${container.composeProject || "unknown project"} / ${container.composeService || "unknown service"}`);
  }

  if (container.runningFor) {
    lines.push(`Running for: ${container.runningFor}`);
  }

  if (container.createdAt) {
    lines.push(`Created: ${container.createdAt}`);
  }

  if (container.startedAt) {
    lines.push(`Started: ${toLocalDateDisplay(container.startedAt)}`);
  }

  if (container.finishedAt) {
    lines.push(`Finished: ${toLocalDateDisplay(container.finishedAt)}`);
  }

  if (container.ports) {
    lines.push(`Ports: ${container.ports}`);
  }

  if (container.networks && container.networks.length > 0) {
    lines.push(`Networks: ${container.networks.join(", ")}`);
  }

  if (container.size) {
    lines.push(`Size: ${container.size}`);
  }

  if (container.error) {
    lines.push(`Error: ${container.error}`);
  }

  lines.push("");
  lines.push("Mounts:");
  if (!container.mounts || container.mounts.length === 0) {
    lines.push("- No mounts recorded in the latest snapshot.");
  } else {
    for (const mount of container.mounts) {
      const source = mount.source ? `${mount.source} -> ` : "";
      const accessMode = mount.readWrite === false ? "ro" : mount.readWrite === true ? "rw" : "";
      const modeParts = [mount.type, mount.mode, accessMode]
        .filter((part, index, parts) => Boolean(part) && parts.indexOf(part) === index)
        .join(", ");
      lines.push(`- ${source}${mount.destination}${modeParts ? ` | ${modeParts}` : ""}`);
    }
  }

  return lines.join("\n");
}

export function formatDockerImages(
  status: WindowsHostStatus,
  options?: {
    repository?: string;
    dangling?: boolean;
    limit?: number;
  }
) {
  const docker = status.docker;
  if (!docker) {
    throw new Error("Windows host status does not include Docker details");
  }

  const repository = normalize(options?.repository);
  const limit = Math.min(Math.max(options?.limit ?? 25, 1), 50);
  const images = docker.images
    .filter((image) => {
      if (repository && !image.repository.toLowerCase().includes(repository)) {
        return false;
      }

      if (options?.dangling !== undefined && Boolean(image.dangling) !== options.dangling) {
        return false;
      }

      return true;
    })
    .sort((left, right) => left.repository.localeCompare(right.repository) || left.tag.localeCompare(right.tag))
    .slice(0, limit);

  const filters = [
    options?.repository ? `repository=${options.repository}` : "",
    options?.dangling !== undefined ? `dangling=${options.dangling}` : ""
  ]
    .filter(Boolean)
    .join(", ");

  const lines = [
    `Generated: ${status.generatedAt}`,
    filters ? `Docker images (${filters}):` : "Docker images:",
    ""
  ];

  if (images.length === 0) {
    lines.push("- No images matched that filter.");
    return lines.join("\n");
  }

  for (const image of images) {
    lines.push(
      `- ${image.repository}:${image.tag} | ${image.size || "size unknown"} | ${image.containers ?? 0} containers`
    );

    const meta = [image.createdSince, image.createdAt ? `created ${image.createdAt}` : "", image.dangling ? "dangling" : ""]
      .filter(Boolean)
      .join(" | ");
    if (meta) {
      lines.push(`  ${meta}`);
    }
  }

  return lines.join("\n");
}

export function formatDockerNetworks(
  status: WindowsHostStatus,
  options?: {
    name?: string;
    limit?: number;
  }
) {
  const docker = status.docker;
  if (!docker) {
    throw new Error("Windows host status does not include Docker details");
  }

  const name = normalize(options?.name);
  const limit = Math.min(Math.max(options?.limit ?? 25, 1), 50);
  const networks = docker.networks
    .filter((network) => !name || network.name.toLowerCase().includes(name))
    .sort((left, right) => left.name.localeCompare(right.name))
    .slice(0, limit);

  const lines = [
    `Generated: ${status.generatedAt}`,
    options?.name ? `Docker networks (${options.name}):` : "Docker networks:",
    ""
  ];

  if (networks.length === 0) {
    lines.push("- No networks matched that filter.");
    return lines.join("\n");
  }

  for (const network of networks) {
    const flags = [
      network.driver,
      network.scope,
      network.internal ? "internal" : "",
      network.ipv6 ? "ipv6" : "",
      network.composeProject ? `compose=${network.composeProject}` : ""
    ]
      .filter(Boolean)
      .join(" | ");
    lines.push(`- ${network.name} | ${flags}`);

    if (network.createdAt) {
      lines.push(`  Created: ${network.createdAt}`);
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
