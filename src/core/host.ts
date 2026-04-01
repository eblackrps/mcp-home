import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type HostComponent = {
  name: string;
  status: string;
  details: string;
  lastChecked: string;
};

export type WindowsServiceStatus = {
  name: string;
  displayName: string;
  state: string;
  startMode?: string | null;
  status?: string | null;
  processId?: number | null;
  startName?: string | null;
  pathName?: string | null;
  description?: string | null;
};

export type ScheduledTaskStatus = {
  name: string;
  path: string;
  state: string;
  enabled: boolean;
  lastRunTime?: string | null;
  nextRunTime?: string | null;
  lastTaskResult?: number | null;
  author?: string | null;
  description?: string | null;
  actions?: string[];
  triggers?: string[];
};

export type ListeningPortStatus = {
  protocol: "tcp" | "udp";
  localAddress: string;
  localPort: number;
  processId?: number | null;
  processName?: string | null;
  serviceNames?: string[];
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
  resourceUsage?: DockerContainerResourceUsage | null;
  size?: string | null;
};

export type DockerMountStatus = {
  type: string;
  name?: string | null;
  source?: string | null;
  destination: string;
  mode?: string | null;
  readWrite?: boolean | null;
};

export type DockerContainerResourceUsage = {
  sampledAt?: string | null;
  cpuPercent?: number | null;
  memoryUsage?: string | null;
  memoryPercent?: number | null;
  netIO?: string | null;
  blockIO?: string | null;
  pids?: number | null;
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

export type DockerVolumeStatus = {
  name: string;
  driver: string;
  scope: string;
  mountpoint?: string | null;
  createdAt?: string | null;
  anonymous?: boolean;
  inUse?: boolean;
  attachedContainers?: string[];
};

export type DockerStorageSummary = {
  type: string;
  totalCount?: number | null;
  active?: number | null;
  size?: string | null;
  reclaimable?: string | null;
};

export type HostCpuStatus = {
  name: string;
  logicalCores: number;
  loadPercent?: number | null;
  maxClockMHz?: number | null;
};

export type HostMemoryStatus = {
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
  percentUsed: number;
};

export type HostDiskStatus = {
  name: string;
  volumeName?: string | null;
  fileSystem?: string | null;
  driveType?: string | null;
  totalBytes?: number | null;
  freeBytes?: number | null;
  usedBytes?: number | null;
  percentFree?: number | null;
};

export type HostNetworkAdapterStatus = {
  name: string;
  description?: string | null;
  macAddress?: string | null;
  ipv4: string[];
  ipv6: string[];
  gateways?: string[];
  dnsServers?: string[];
  dhcpEnabled?: boolean | null;
};

export type HostNetworkStatus = {
  adapterCount: number;
  ipv4Count: number;
  ipv6Count: number;
  primaryIpv4?: string | null;
  adapters: HostNetworkAdapterStatus[];
};

export type HostResources = {
  cpu: HostCpuStatus;
  memory: HostMemoryStatus;
  disks: HostDiskStatus[];
  network: HostNetworkStatus;
};

export type ScannedFolderSummary = {
  root: string;
  path: string;
  name: string;
  depth: number;
  totalBytes: number;
  fileCount: number;
  directoryCount: number;
  lastModified?: string | null;
  drive?: string | null;
  error?: string | null;
};

export type HostStorageStatus = {
  generatedAt: string;
  scanRoots: string[];
  childLimit: number;
  lowSpaceThresholdPercent: number;
  scannedFolders: ScannedFolderSummary[];
};

export type BackupTaskStatus = {
  name: string;
  path: string;
  displayPath: string;
  state: string;
  enabled: boolean;
  lastRunTime?: string | null;
  nextRunTime?: string | null;
  lastTaskResult?: number | null;
  stale: boolean;
  issue: "none" | "warning" | "failure";
  reasons: string[];
  actions?: string[];
};

export type HostBackupStatus = {
  generatedAt: string;
  staleAfterHours: number;
  taskKeywords: string[];
  taskCount: number;
  healthyCount: number;
  warningCount: number;
  failureCount: number;
  tasks: BackupTaskStatus[];
};

export type EndpointHealthStatus = {
  name: string;
  url: string;
  healthy: boolean;
  statusCode?: number | null;
  statusText?: string | null;
  latencyMs?: number | null;
  checkedAt: string;
  error?: string | null;
};

export type TailscalePeerStatus = {
  name: string;
  dnsName?: string | null;
  os?: string | null;
  online?: boolean | null;
  active?: boolean | null;
  tailnetIps?: string[];
};

export type TailscaleStatus = {
  installed: boolean;
  checkedAt: string;
  version?: string | null;
  backendState?: string | null;
  tailnetName?: string | null;
  magicDnsEnabled?: boolean | null;
  magicDnsSuffix?: string | null;
  selfHostName?: string | null;
  selfDnsName?: string | null;
  selfOnline?: boolean | null;
  tailscaleIps?: string[];
  peerCount?: number | null;
  onlinePeerCount?: number | null;
  activePeerCount?: number | null;
  funnelEnabled?: boolean | null;
  serveEnabled?: boolean | null;
  funnelTargets?: string[];
  serveTargets?: string[];
  peers?: TailscalePeerStatus[];
};

export type PublicExposureItem = {
  kind: "funnel" | "serve" | "docker-public" | "docker-host-ip" | "endpoint";
  label: string;
  target?: string | null;
  details?: string | null;
};

export type PublicExposureStatus = {
  generatedAt: string;
  funnelEnabled: boolean;
  serveEnabled: boolean;
  exposedItems: PublicExposureItem[];
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
  volumes: DockerVolumeStatus[];
  storage: DockerStorageSummary[];
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
  resources?: HostResources;
  components: HostComponent[];
  services?: WindowsServiceStatus[];
  scheduledTasks?: ScheduledTaskStatus[];
  listeningPorts?: ListeningPortStatus[];
  storage?: HostStorageStatus;
  backups?: HostBackupStatus;
  endpointChecks?: EndpointHealthStatus[];
  tailscale?: TailscaleStatus;
  publicExposure?: PublicExposureStatus;
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

  if (candidate.resourceUsage !== undefined && candidate.resourceUsage !== null) {
    if (!candidate.resourceUsage || typeof candidate.resourceUsage !== "object") {
      throw new Error("Docker container resource usage must be an object when present");
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

function assertDockerVolumeStatus(value: unknown): asserts value is DockerVolumeStatus {
  if (!value || typeof value !== "object") {
    throw new Error("Docker volume entries must be objects");
  }

  const candidate = value as Partial<DockerVolumeStatus>;
  if (
    typeof candidate.name !== "string" ||
    typeof candidate.driver !== "string" ||
    typeof candidate.scope !== "string"
  ) {
    throw new Error("Docker volume entries are missing required fields");
  }

  if (candidate.attachedContainers !== undefined && !Array.isArray(candidate.attachedContainers)) {
    throw new Error("Docker volume attachedContainers must be an array when present");
  }
}

function assertDockerStorageSummary(value: unknown): asserts value is DockerStorageSummary {
  if (!value || typeof value !== "object") {
    throw new Error("Docker storage summary entries must be objects");
  }

  const candidate = value as Partial<DockerStorageSummary>;
  if (typeof candidate.type !== "string") {
    throw new Error("Docker storage summary entries are missing required fields");
  }
}

function assertHostCpuStatus(value: unknown): asserts value is HostCpuStatus {
  if (!value || typeof value !== "object") {
    throw new Error("Host CPU status must be an object");
  }

  const candidate = value as Partial<HostCpuStatus>;
  if (typeof candidate.name !== "string" || typeof candidate.logicalCores !== "number") {
    throw new Error("Host CPU status is missing required fields");
  }
}

function assertHostMemoryStatus(value: unknown): asserts value is HostMemoryStatus {
  if (!value || typeof value !== "object") {
    throw new Error("Host memory status must be an object");
  }

  const candidate = value as Partial<HostMemoryStatus>;
  if (
    typeof candidate.totalBytes !== "number" ||
    typeof candidate.freeBytes !== "number" ||
    typeof candidate.usedBytes !== "number" ||
    typeof candidate.percentUsed !== "number"
  ) {
    throw new Error("Host memory status is missing required fields");
  }
}

function assertHostDiskStatus(value: unknown): asserts value is HostDiskStatus {
  if (!value || typeof value !== "object") {
    throw new Error("Host disk entries must be objects");
  }

  const candidate = value as Partial<HostDiskStatus>;
  if (typeof candidate.name !== "string") {
    throw new Error("Host disk entries are missing required fields");
  }
}

function assertHostNetworkAdapterStatus(value: unknown): asserts value is HostNetworkAdapterStatus {
  if (!value || typeof value !== "object") {
    throw new Error("Host network adapter entries must be objects");
  }

  const candidate = value as Partial<HostNetworkAdapterStatus>;
  if (
    typeof candidate.name !== "string" ||
    !Array.isArray(candidate.ipv4) ||
    !Array.isArray(candidate.ipv6)
  ) {
    throw new Error("Host network adapter entries are missing required fields");
  }

  if (candidate.gateways !== undefined && !Array.isArray(candidate.gateways)) {
    throw new Error("Host network adapter gateways must be an array when present");
  }

  if (candidate.dnsServers !== undefined && !Array.isArray(candidate.dnsServers)) {
    throw new Error("Host network adapter DNS servers must be an array when present");
  }
}

function assertHostNetworkStatus(value: unknown): asserts value is HostNetworkStatus {
  if (!value || typeof value !== "object") {
    throw new Error("Host network status must be an object");
  }

  const candidate = value as Partial<HostNetworkStatus>;
  if (
    typeof candidate.adapterCount !== "number" ||
    typeof candidate.ipv4Count !== "number" ||
    typeof candidate.ipv6Count !== "number" ||
    !Array.isArray(candidate.adapters)
  ) {
    throw new Error("Host network status is missing required fields");
  }

  for (const adapter of candidate.adapters) {
    assertHostNetworkAdapterStatus(adapter);
  }
}

function assertScannedFolderSummary(value: unknown): asserts value is ScannedFolderSummary {
  if (!value || typeof value !== "object") {
    throw new Error("Scanned folder entries must be objects");
  }

  const candidate = value as Partial<ScannedFolderSummary>;
  if (
    typeof candidate.root !== "string" ||
    typeof candidate.path !== "string" ||
    typeof candidate.name !== "string" ||
    typeof candidate.depth !== "number" ||
    typeof candidate.totalBytes !== "number" ||
    typeof candidate.fileCount !== "number" ||
    typeof candidate.directoryCount !== "number"
  ) {
    throw new Error("Scanned folder entries are missing required fields");
  }
}

function assertHostStorageStatus(value: unknown): asserts value is HostStorageStatus {
  if (!value || typeof value !== "object") {
    throw new Error("Host storage status must be an object");
  }

  const candidate = value as Partial<HostStorageStatus>;
  if (
    typeof candidate.generatedAt !== "string" ||
    !Array.isArray(candidate.scanRoots) ||
    typeof candidate.childLimit !== "number" ||
    typeof candidate.lowSpaceThresholdPercent !== "number" ||
    !Array.isArray(candidate.scannedFolders)
  ) {
    throw new Error("Host storage status is missing required fields");
  }

  for (const folder of candidate.scannedFolders) {
    assertScannedFolderSummary(folder);
  }
}

function assertBackupTaskStatus(value: unknown): asserts value is BackupTaskStatus {
  if (!value || typeof value !== "object") {
    throw new Error("Backup task entries must be objects");
  }

  const candidate = value as Partial<BackupTaskStatus>;
  if (
    typeof candidate.name !== "string" ||
    typeof candidate.path !== "string" ||
    typeof candidate.displayPath !== "string" ||
    typeof candidate.state !== "string" ||
    typeof candidate.enabled !== "boolean" ||
    typeof candidate.stale !== "boolean" ||
    typeof candidate.issue !== "string" ||
    !Array.isArray(candidate.reasons)
  ) {
    throw new Error("Backup task entries are missing required fields");
  }
}

function assertHostBackupStatus(value: unknown): asserts value is HostBackupStatus {
  if (!value || typeof value !== "object") {
    throw new Error("Host backup status must be an object");
  }

  const candidate = value as Partial<HostBackupStatus>;
  if (
    typeof candidate.generatedAt !== "string" ||
    typeof candidate.staleAfterHours !== "number" ||
    !Array.isArray(candidate.taskKeywords) ||
    typeof candidate.taskCount !== "number" ||
    typeof candidate.healthyCount !== "number" ||
    typeof candidate.warningCount !== "number" ||
    typeof candidate.failureCount !== "number" ||
    !Array.isArray(candidate.tasks)
  ) {
    throw new Error("Host backup status is missing required fields");
  }

  for (const task of candidate.tasks) {
    assertBackupTaskStatus(task);
  }
}

function assertEndpointHealthStatus(value: unknown): asserts value is EndpointHealthStatus {
  if (!value || typeof value !== "object") {
    throw new Error("Endpoint health entries must be objects");
  }

  const candidate = value as Partial<EndpointHealthStatus>;
  if (
    typeof candidate.name !== "string" ||
    typeof candidate.url !== "string" ||
    typeof candidate.healthy !== "boolean" ||
    typeof candidate.checkedAt !== "string"
  ) {
    throw new Error("Endpoint health entries are missing required fields");
  }
}

function assertTailscalePeerStatus(value: unknown): asserts value is TailscalePeerStatus {
  if (!value || typeof value !== "object") {
    throw new Error("Tailscale peer entries must be objects");
  }

  const candidate = value as Partial<TailscalePeerStatus>;
  if (typeof candidate.name !== "string") {
    throw new Error("Tailscale peer entries are missing required fields");
  }

  if (candidate.tailnetIps !== undefined && !Array.isArray(candidate.tailnetIps)) {
    throw new Error("Tailscale peer tailnetIps must be an array when present");
  }
}

function assertTailscaleStatus(value: unknown): asserts value is TailscaleStatus {
  if (!value || typeof value !== "object") {
    throw new Error("Tailscale status must be an object");
  }

  const candidate = value as Partial<TailscaleStatus>;
  if (typeof candidate.installed !== "boolean" || typeof candidate.checkedAt !== "string") {
    throw new Error("Tailscale status is missing required fields");
  }

  if (candidate.tailscaleIps !== undefined && !Array.isArray(candidate.tailscaleIps)) {
    throw new Error("Tailscale IPs must be an array when present");
  }

  if (candidate.funnelTargets !== undefined && !Array.isArray(candidate.funnelTargets)) {
    throw new Error("Tailscale funnel targets must be an array when present");
  }

  if (candidate.serveTargets !== undefined && !Array.isArray(candidate.serveTargets)) {
    throw new Error("Tailscale serve targets must be an array when present");
  }

  if (candidate.peers !== undefined) {
    if (!Array.isArray(candidate.peers)) {
      throw new Error("Tailscale peers must be an array when present");
    }

    for (const peer of candidate.peers) {
      assertTailscalePeerStatus(peer);
    }
  }
}

function assertPublicExposureItem(value: unknown): asserts value is PublicExposureItem {
  if (!value || typeof value !== "object") {
    throw new Error("Public exposure entries must be objects");
  }

  const candidate = value as Partial<PublicExposureItem>;
  if (typeof candidate.kind !== "string" || typeof candidate.label !== "string") {
    throw new Error("Public exposure entries are missing required fields");
  }
}

function assertPublicExposureStatus(value: unknown): asserts value is PublicExposureStatus {
  if (!value || typeof value !== "object") {
    throw new Error("Public exposure status must be an object");
  }

  const candidate = value as Partial<PublicExposureStatus>;
  if (
    typeof candidate.generatedAt !== "string" ||
    typeof candidate.funnelEnabled !== "boolean" ||
    typeof candidate.serveEnabled !== "boolean" ||
    !Array.isArray(candidate.exposedItems)
  ) {
    throw new Error("Public exposure status is missing required fields");
  }

  for (const item of candidate.exposedItems) {
    assertPublicExposureItem(item);
  }
}

function assertHostResources(value: unknown): asserts value is HostResources {
  if (!value || typeof value !== "object") {
    throw new Error("Host resources must be an object");
  }

  const candidate = value as Partial<HostResources>;
  assertHostCpuStatus(candidate.cpu);
  assertHostMemoryStatus(candidate.memory);

  if (!Array.isArray(candidate.disks)) {
    throw new Error("Host disks must be an array");
  }

  for (const disk of candidate.disks) {
    assertHostDiskStatus(disk);
  }

  assertHostNetworkStatus(candidate.network);
}

function assertWindowsServiceStatus(value: unknown): asserts value is WindowsServiceStatus {
  if (!value || typeof value !== "object") {
    throw new Error("Windows service entries must be objects");
  }

  const candidate = value as Partial<WindowsServiceStatus>;
  if (
    typeof candidate.name !== "string" ||
    typeof candidate.displayName !== "string" ||
    typeof candidate.state !== "string"
  ) {
    throw new Error("Windows service entries are missing required fields");
  }
}

function assertScheduledTaskStatus(value: unknown): asserts value is ScheduledTaskStatus {
  if (!value || typeof value !== "object") {
    throw new Error("Scheduled task entries must be objects");
  }

  const candidate = value as Partial<ScheduledTaskStatus>;
  if (
    typeof candidate.name !== "string" ||
    typeof candidate.path !== "string" ||
    typeof candidate.state !== "string" ||
    typeof candidate.enabled !== "boolean"
  ) {
    throw new Error("Scheduled task entries are missing required fields");
  }

  if (candidate.actions !== undefined && !Array.isArray(candidate.actions)) {
    throw new Error("Scheduled task actions must be an array when present");
  }

  if (candidate.triggers !== undefined && !Array.isArray(candidate.triggers)) {
    throw new Error("Scheduled task triggers must be an array when present");
  }
}

function assertListeningPortStatus(value: unknown): asserts value is ListeningPortStatus {
  if (!value || typeof value !== "object") {
    throw new Error("Listening port entries must be objects");
  }

  const candidate = value as Partial<ListeningPortStatus>;
  if (
    (candidate.protocol !== "tcp" && candidate.protocol !== "udp") ||
    typeof candidate.localAddress !== "string" ||
    typeof candidate.localPort !== "number"
  ) {
    throw new Error("Listening port entries are missing required fields");
  }

  if (candidate.serviceNames !== undefined && !Array.isArray(candidate.serviceNames)) {
    throw new Error("Listening port service names must be an array when present");
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
    !Array.isArray(candidate.networks) ||
    !Array.isArray(candidate.volumes) ||
    !Array.isArray(candidate.storage)
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

  for (const volume of candidate.volumes) {
    assertDockerVolumeStatus(volume);
  }

  for (const storage of candidate.storage) {
    assertDockerStorageSummary(storage);
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

  if (candidate.resources !== undefined) {
    assertHostResources(candidate.resources);
  }

  if (candidate.services !== undefined) {
    if (!Array.isArray(candidate.services)) {
      throw new Error("Windows services must be an array when present");
    }

    for (const service of candidate.services) {
      assertWindowsServiceStatus(service);
    }
  }

  if (candidate.scheduledTasks !== undefined) {
    if (!Array.isArray(candidate.scheduledTasks)) {
      throw new Error("Scheduled tasks must be an array when present");
    }

    for (const task of candidate.scheduledTasks) {
      assertScheduledTaskStatus(task);
    }
  }

  if (candidate.listeningPorts !== undefined) {
    if (!Array.isArray(candidate.listeningPorts)) {
      throw new Error("Listening ports must be an array when present");
    }

    for (const port of candidate.listeningPorts) {
      assertListeningPortStatus(port);
    }
  }

  if (candidate.storage !== undefined) {
    assertHostStorageStatus(candidate.storage);
  }

  if (candidate.backups !== undefined) {
    assertHostBackupStatus(candidate.backups);
  }

  if (candidate.endpointChecks !== undefined) {
    if (!Array.isArray(candidate.endpointChecks)) {
      throw new Error("Endpoint checks must be an array when present");
    }

    for (const endpoint of candidate.endpointChecks) {
      assertEndpointHealthStatus(endpoint);
    }
  }

  if (candidate.tailscale !== undefined) {
    assertTailscaleStatus(candidate.tailscale);
  }

  if (candidate.publicExposure !== undefined) {
    assertPublicExposureStatus(candidate.publicExposure);
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

function formatByteSize(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "unknown";
  }

  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  const digits = size >= 100 || unitIndex === 0 ? 0 : size >= 10 ? 1 : 2;
  return `${size.toFixed(digits)} ${units[unitIndex]}`;
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "unknown";
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
}

function getHostResources(status: WindowsHostStatus) {
  if (!status.resources) {
    throw new Error("Windows host status does not include host resource details");
  }

  return status.resources;
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

function getDockerLatestActivityTimestamp(container: DockerContainerStatus) {
  const candidates = [container.finishedAt, container.startedAt, container.createdAt]
    .map((value) => (value ? Date.parse(value) : Number.NaN))
    .filter((value) => Number.isFinite(value));

  return candidates.length > 0 ? Math.max(...candidates) : Number.NaN;
}

function getDockerProjectHealth(projectContainers: DockerContainerStatus[]) {
  const problemContainers = getDockerProblemContainers(projectContainers);
  const runningCount = projectContainers.filter((container) => container.state === "running").length;

  if (problemContainers.length > 0) {
    return "degraded";
  }

  if (runningCount === projectContainers.length && runningCount > 0) {
    return "healthy";
  }

  if (runningCount > 0) {
    return "mixed";
  }

  return "inactive";
}

function getDockerProjectMatch(containers: DockerContainerStatus[], projectQuery: string) {
  const normalized = normalize(projectQuery);
  if (!normalized) {
    return undefined;
  }

  return getDockerComposeProjects(containers).find((project) => project.name.toLowerCase() === normalized) ??
    getDockerComposeProjects(containers).find((project) => project.name.toLowerCase().includes(normalized));
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

  try {
    const raw = await fs.readFile(fullPath, "utf8");
    const parsed = JSON.parse(stripBom(raw)) as unknown;
    assertWindowsHostStatus(parsed);

    cachedStatus = {
      path: fullPath,
      mtimeMs: stat.mtimeMs,
      value: parsed
    };

    return parsed;
  } catch (err) {
    throw new Error(
      `Failed to read/parse Windows host status at ${fullPath}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
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
  ];

  if (status.resources) {
    lines.push(
      `Resources: CPU ${status.resources.cpu.name} | load ${formatPercent(status.resources.cpu.loadPercent ?? null)} | RAM ${formatByteSize(status.resources.memory.usedBytes)} used of ${formatByteSize(status.resources.memory.totalBytes)} (${formatPercent(status.resources.memory.percentUsed)})`
    );

    const topDisk = [...status.resources.disks]
      .filter((disk) => disk.totalBytes !== undefined && disk.totalBytes !== null && disk.freeBytes !== undefined && disk.freeBytes !== null)
      .sort((left, right) => (left.percentFree ?? 100) - (right.percentFree ?? 100))[0];

    if (topDisk) {
      lines.push(
        `Storage: ${topDisk.name}${topDisk.volumeName ? ` (${topDisk.volumeName})` : ""} | free ${formatByteSize(topDisk.freeBytes)} of ${formatByteSize(topDisk.totalBytes)} (${formatPercent(topDisk.percentFree)})`
      );
    }

    if (status.resources.network.primaryIpv4) {
      lines.push(
        `Network: ${status.resources.network.adapterCount} adapters | primary IPv4 ${status.resources.network.primaryIpv4}`
      );
    } else {
      lines.push(`Network: ${status.resources.network.adapterCount} adapters`);
    }

    lines.push("");
  }

  if (status.services) {
    const runningServices = status.services.filter((service) => service.state.toLowerCase() === "running").length;
    lines.push(`Services: ${status.services.length} total | ${runningServices} running`);
  }

  if (status.scheduledTasks) {
    const enabledTasks = status.scheduledTasks.filter((task) => task.enabled).length;
    lines.push(`Scheduled tasks: ${status.scheduledTasks.length} total | ${enabledTasks} enabled`);
  }

  if (status.listeningPorts) {
    lines.push(`Listening ports: ${status.listeningPorts.length}`);
  }

  if (status.services || status.scheduledTasks || status.listeningPorts) {
    lines.push("");
  }

  if (status.storage) {
    const lowSpaceDisks = (status.resources?.disks ?? []).filter(
      (disk) => (disk.percentFree ?? 100) <= status.storage!.lowSpaceThresholdPercent
    );
    lines.push(
      `Storage scan: ${status.storage.scannedFolders.length} folders | threshold ${status.storage.lowSpaceThresholdPercent}% free | ${lowSpaceDisks.length} low-space disks`
    );
  }

  if (status.backups) {
    lines.push(
      `Backups: ${status.backups.taskCount} tasks | ${status.backups.failureCount} failures | ${status.backups.warningCount} warnings`
    );
  }

  if (status.endpointChecks) {
    const unhealthyEndpoints = status.endpointChecks.filter((endpoint) => !endpoint.healthy).length;
    lines.push(`Endpoint checks: ${status.endpointChecks.length} total | ${unhealthyEndpoints} unhealthy`);
  }

  if (status.tailscale) {
    lines.push(
      `Tailscale: ${status.tailscale.backendState || "unknown"} | funnel ${status.tailscale.funnelEnabled ? "on" : "off"} | peers ${status.tailscale.peerCount ?? 0}`
    );
  }

  if (status.storage || status.backups || status.endpointChecks || status.tailscale) {
    lines.push("");
  }

  lines.push(
    "Components:"
  );

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

export function formatHostResources(status: WindowsHostStatus) {
  const resources = getHostResources(status);
  const lines = [
    `Generated: ${status.generatedAt}`,
    "Windows host resources:",
    "",
    `CPU: ${resources.cpu.name}`,
    `Logical cores: ${resources.cpu.logicalCores}`,
    `Load: ${formatPercent(resources.cpu.loadPercent ?? null)}`
  ];

  if (resources.cpu.maxClockMHz !== undefined && resources.cpu.maxClockMHz !== null) {
    lines.push(`Max clock: ${resources.cpu.maxClockMHz} MHz`);
  }

  lines.push(
    `Memory: ${formatByteSize(resources.memory.usedBytes)} used of ${formatByteSize(resources.memory.totalBytes)} (${formatPercent(resources.memory.percentUsed)})`
  );
  lines.push(`Memory free: ${formatByteSize(resources.memory.freeBytes)}`);
  lines.push(`Disks: ${resources.disks.length}`);
  lines.push(
    `Network: ${resources.network.adapterCount} adapters | ${resources.network.ipv4Count} IPv4 addresses | ${resources.network.ipv6Count} IPv6 addresses`
  );

  if (resources.network.primaryIpv4) {
    lines.push(`Primary IPv4: ${resources.network.primaryIpv4}`);
  }

  const lowSpaceDisks = resources.disks
    .filter((disk) => disk.percentFree !== undefined && disk.percentFree !== null)
    .sort((left, right) => (left.percentFree ?? 100) - (right.percentFree ?? 100))
    .slice(0, 3);

  if (lowSpaceDisks.length > 0) {
    lines.push("");
    lines.push("Lowest free-space disks:");
    for (const disk of lowSpaceDisks) {
      lines.push(
        `- ${disk.name}${disk.volumeName ? ` (${disk.volumeName})` : ""} | free ${formatByteSize(disk.freeBytes)} of ${formatByteSize(disk.totalBytes)} (${formatPercent(disk.percentFree)})`
      );
    }
  }

  const connectedAdapters = resources.network.adapters.filter((adapter) => adapter.ipv4.length > 0 || adapter.ipv6.length > 0).slice(0, 3);
  if (connectedAdapters.length > 0) {
    lines.push("");
    lines.push("Connected adapters:");
    for (const adapter of connectedAdapters) {
      const addresses = [...adapter.ipv4, ...adapter.ipv6].slice(0, 4).join(", ");
      lines.push(`- ${adapter.name} | ${addresses || "no addresses recorded"}`);
    }
  }

  return lines.join("\n");
}

export function formatHostDisks(
  status: WindowsHostStatus,
  options?: {
    name?: string;
    limit?: number;
  }
) {
  const resources = getHostResources(status);
  const name = normalize(options?.name);
  const limit = Math.min(Math.max(options?.limit ?? 20, 1), 50);
  const disks = resources.disks
    .filter((disk) => {
      if (!name) {
        return true;
      }

      return (
        disk.name.toLowerCase().includes(name) ||
        (disk.volumeName?.toLowerCase().includes(name) ?? false) ||
        (disk.fileSystem?.toLowerCase().includes(name) ?? false)
      );
    })
    .sort((left, right) => (left.percentFree ?? 100) - (right.percentFree ?? 100) || left.name.localeCompare(right.name))
    .slice(0, limit);

  const lines = [
    `Generated: ${status.generatedAt}`,
    options?.name ? `Host disks (${options.name}):` : "Host disks:",
    ""
  ];

  if (disks.length === 0) {
    lines.push("- No host disks matched that filter.");
    return lines.join("\n");
  }

  for (const disk of disks) {
    const flags = [disk.driveType, disk.fileSystem].filter(Boolean).join(" | ");
    lines.push(
      `- ${disk.name}${disk.volumeName ? ` (${disk.volumeName})` : ""}${flags ? ` | ${flags}` : ""}`
    );
    lines.push(
      `  Used ${formatByteSize(disk.usedBytes)} of ${formatByteSize(disk.totalBytes)} | free ${formatByteSize(disk.freeBytes)} (${formatPercent(disk.percentFree)})`
    );
  }

  return lines.join("\n");
}

export function formatHostNetworkSummary(
  status: WindowsHostStatus,
  options?: {
    query?: string;
    limit?: number;
  }
) {
  const resources = getHostResources(status);
  const query = normalize(options?.query);
  const limit = Math.min(Math.max(options?.limit ?? 20, 1), 50);
  const adapters = resources.network.adapters
    .filter((adapter) => {
      if (!query) {
        return true;
      }

      return (
        adapter.name.toLowerCase().includes(query) ||
        (adapter.description?.toLowerCase().includes(query) ?? false) ||
        (adapter.macAddress?.toLowerCase().includes(query) ?? false) ||
        adapter.ipv4.some((value) => value.toLowerCase().includes(query)) ||
        adapter.ipv6.some((value) => value.toLowerCase().includes(query)) ||
        (adapter.gateways?.some((value) => value.toLowerCase().includes(query)) ?? false) ||
        (adapter.dnsServers?.some((value) => value.toLowerCase().includes(query)) ?? false)
      );
    })
    .slice(0, limit);

  const lines = [
    `Generated: ${status.generatedAt}`,
    query ? `Host network summary (${options?.query}):` : "Host network summary:",
    "",
    `Adapters: ${resources.network.adapterCount}`,
    `IPv4 addresses: ${resources.network.ipv4Count}`,
    `IPv6 addresses: ${resources.network.ipv6Count}`
  ];

  if (resources.network.primaryIpv4) {
    lines.push(`Primary IPv4: ${resources.network.primaryIpv4}`);
  }

  lines.push("");
  lines.push("Adapters:");

  if (adapters.length === 0) {
    lines.push("- No network adapters matched that filter.");
    return lines.join("\n");
  }

  for (const adapter of adapters) {
    lines.push(`- ${adapter.name}`);
    if (adapter.description && adapter.description !== adapter.name) {
      lines.push(`  Description: ${adapter.description}`);
    }
    if (adapter.macAddress) {
      lines.push(`  MAC: ${adapter.macAddress}`);
    }
    lines.push(`  IPv4: ${adapter.ipv4.length > 0 ? adapter.ipv4.join(", ") : "none"}`);
    lines.push(`  IPv6: ${adapter.ipv6.length > 0 ? adapter.ipv6.join(", ") : "none"}`);
    if (adapter.gateways && adapter.gateways.length > 0) {
      lines.push(`  Gateways: ${adapter.gateways.join(", ")}`);
    }
    if (adapter.dnsServers && adapter.dnsServers.length > 0) {
      lines.push(`  DNS: ${adapter.dnsServers.join(", ")}`);
    }
    if (adapter.dhcpEnabled !== undefined && adapter.dhcpEnabled !== null) {
      lines.push(`  DHCP: ${adapter.dhcpEnabled ? "enabled" : "disabled"}`);
    }
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
    `Images: ${docker.imageCount} | Networks: ${docker.networkCount} | Volumes: ${docker.volumes.length} | Compose projects: ${docker.composeProjectCount}`,
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

export function formatDockerComposeHealth(
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
    projectFilter ? `Docker Compose health (${options?.project}):` : "Docker Compose health:",
    ""
  ];

  if (projects.length === 0) {
    lines.push("- No compose projects matched that filter.");
    return lines.join("\n");
  }

  for (const project of projects) {
    const health = getDockerProjectHealth(project.containers);
    const runningCount = project.containers.filter((container) => container.state === "running").length;
    const problemContainers = getDockerProblemContainers(project.containers);
    lines.push(
      `- ${project.name} | ${health} | ${runningCount}/${project.containers.length} running | ${problemContainers.length} problems`
    );

    if (problemContainers.length === 0) {
      lines.push("  No current problem containers in this project.");
    } else {
      for (const container of problemContainers.slice(0, 10)) {
        lines.push(`  ${container.name} | ${container.status}`);
      }
    }
  }

  return lines.join("\n");
}

export function formatDockerProjectDetails(status: WindowsHostStatus, projectQuery: string) {
  const docker = status.docker;
  if (!docker) {
    throw new Error("Windows host status does not include Docker details");
  }

  const project = getDockerProjectMatch(docker.containers, projectQuery);
  if (!project) {
    return `Generated: ${status.generatedAt}\nDocker Compose project details:\n\n- No compose project matched "${projectQuery}".`;
  }

  const runningCount = project.containers.filter((container) => container.state === "running").length;
  const problemContainers = getDockerProblemContainers(project.containers);
  const totalCpu = project.containers.reduce((sum, container) => sum + (container.resourceUsage?.cpuPercent ?? 0), 0);
  const totalMemoryPercent = project.containers.reduce(
    (sum, container) => sum + (container.resourceUsage?.memoryPercent ?? 0),
    0
  );
  const networks = [...new Set(project.containers.flatMap((container) => container.networks ?? []))].sort();
  const mounts = [...new Set(project.containers.flatMap((container) => (container.mounts ?? []).map((mount) => mount.destination)))].sort();

  const lines = [
    `Generated: ${status.generatedAt}`,
    "Docker Compose project details:",
    "",
    `Project: ${project.name}`,
    `Health: ${getDockerProjectHealth(project.containers)}`,
    `Containers: ${project.containers.length}`,
    `Running: ${runningCount}`,
    `Problems: ${problemContainers.length}`,
    `Services: ${[...project.services].sort().join(", ") || "none"}`
  ];

  if (project.containers.some((container) => container.resourceUsage)) {
    lines.push(`Aggregate CPU: ${totalCpu.toFixed(2)}%`);
    lines.push(`Aggregate Mem%: ${totalMemoryPercent.toFixed(2)}%`);
  }

  if (networks.length > 0) {
    lines.push(`Networks: ${networks.join(", ")}`);
  }

  if (mounts.length > 0) {
    lines.push(`Mount targets: ${mounts.join(", ")}`);
  }

  lines.push("");
  lines.push("Containers:");
  for (const container of project.containers.sort((left, right) => left.name.localeCompare(right.name))) {
    lines.push(`- ${container.name} | ${container.state} | ${container.status}`);

    if (container.composeService) {
      lines.push(`  Service: ${container.composeService}`);
    }

    if (container.ports) {
      lines.push(`  Ports: ${container.ports}`);
    }

    if (container.resourceUsage) {
      const usageBits = [
        container.resourceUsage.cpuPercent !== undefined && container.resourceUsage.cpuPercent !== null
          ? `CPU ${container.resourceUsage.cpuPercent.toFixed(2)}%`
          : "",
        container.resourceUsage.memoryUsage ? `Mem ${container.resourceUsage.memoryUsage}` : "",
        container.resourceUsage.memoryPercent !== undefined && container.resourceUsage.memoryPercent !== null
          ? `Mem% ${container.resourceUsage.memoryPercent.toFixed(2)}%`
          : ""
      ]
        .filter(Boolean)
        .join(" | ");
      if (usageBits) {
        lines.push(`  ${usageBits}`);
      }
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

export function formatDockerResourceUsage(
  status: WindowsHostStatus,
  options?: {
    name?: string;
    project?: string;
    limit?: number;
  }
) {
  const docker = status.docker;
  if (!docker) {
    throw new Error("Windows host status does not include Docker details");
  }

  const name = normalize(options?.name);
  const project = normalize(options?.project);
  const limit = Math.min(Math.max(options?.limit ?? 20, 1), 50);
  const containers = docker.containers
    .filter((container) => container.state === "running" && container.resourceUsage)
    .filter((container) => {
      if (name && !container.name.toLowerCase().includes(name) && !container.image.toLowerCase().includes(name)) {
        return false;
      }

      if (project && (container.composeProject?.toLowerCase() || "") !== project) {
        return false;
      }

      return true;
    })
    .sort(
      (left, right) =>
        (right.resourceUsage?.memoryPercent ?? -1) - (left.resourceUsage?.memoryPercent ?? -1) ||
        (right.resourceUsage?.cpuPercent ?? -1) - (left.resourceUsage?.cpuPercent ?? -1) ||
        left.name.localeCompare(right.name)
    )
    .slice(0, limit);

  const filters = [
    options?.name ? `name=${options.name}` : "",
    options?.project ? `project=${options.project}` : ""
  ]
    .filter(Boolean)
    .join(", ");

  const lines = [
    `Generated: ${status.generatedAt}`,
    filters ? `Docker resource usage (${filters}):` : "Docker resource usage:",
    ""
  ];

  if (containers.length === 0) {
    lines.push("- No running containers with resource usage matched that filter.");
    return lines.join("\n");
  }

  for (const container of containers) {
    const usage = container.resourceUsage;
    if (!usage) {
      continue;
    }

    const usageBits = [
      usage.cpuPercent !== undefined && usage.cpuPercent !== null ? `CPU ${usage.cpuPercent.toFixed(2)}%` : "",
      usage.memoryUsage ? `Mem ${usage.memoryUsage}` : "",
      usage.memoryPercent !== undefined && usage.memoryPercent !== null ? `Mem% ${usage.memoryPercent.toFixed(2)}%` : "",
      usage.netIO ? `Net ${usage.netIO}` : "",
      usage.blockIO ? `Block ${usage.blockIO}` : "",
      usage.pids !== undefined && usage.pids !== null ? `PIDs ${usage.pids}` : ""
    ]
      .filter(Boolean)
      .join(" | ");
    lines.push(`- ${container.name} | ${container.image}`);
    lines.push(`  ${usageBits}`);

    if (container.composeProject || container.composeService) {
      lines.push(
        `  Compose: ${container.composeProject || "unknown project"} / ${container.composeService || "unknown service"}`
      );
    }

    if (usage.sampledAt) {
      lines.push(`  Sampled: ${usage.sampledAt}`);
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

  if (container.resourceUsage) {
    const usageBits = [
      container.resourceUsage.cpuPercent !== undefined && container.resourceUsage.cpuPercent !== null
        ? `CPU ${container.resourceUsage.cpuPercent.toFixed(2)}%`
        : "",
      container.resourceUsage.memoryUsage ? `Mem ${container.resourceUsage.memoryUsage}` : "",
      container.resourceUsage.memoryPercent !== undefined && container.resourceUsage.memoryPercent !== null
        ? `Mem% ${container.resourceUsage.memoryPercent.toFixed(2)}%`
        : "",
      container.resourceUsage.netIO ? `Net ${container.resourceUsage.netIO}` : "",
      container.resourceUsage.blockIO ? `Block ${container.resourceUsage.blockIO}` : "",
      container.resourceUsage.pids !== undefined && container.resourceUsage.pids !== null
        ? `PIDs ${container.resourceUsage.pids}`
        : ""
    ]
      .filter(Boolean)
      .join(" | ");
    if (usageBits) {
      lines.push(`Usage: ${usageBits}`);
    }
    if (container.resourceUsage.sampledAt) {
      lines.push(`Usage sampled: ${container.resourceUsage.sampledAt}`);
    }
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

export function formatDockerRecentActivity(
  status: WindowsHostStatus,
  options?: {
    state?: string;
    sinceHours?: number;
    limit?: number;
  }
) {
  const docker = status.docker;
  if (!docker) {
    throw new Error("Windows host status does not include Docker details");
  }

  const state = normalize(options?.state);
  const sinceHours = Math.min(Math.max(options?.sinceHours ?? 72, 1), 24 * 30);
  const limit = Math.min(Math.max(options?.limit ?? 20, 1), 50);
  const cutoff = Date.now() - sinceHours * 60 * 60 * 1000;
  const containers = docker.containers
    .filter((container) => !state || container.state.toLowerCase() === state)
    .map((container) => ({ container, latestTimestamp: getDockerLatestActivityTimestamp(container) }))
    .filter(({ latestTimestamp }) => Number.isFinite(latestTimestamp) && latestTimestamp >= cutoff)
    .sort((left, right) => right.latestTimestamp - left.latestTimestamp)
    .slice(0, limit);

  const filters = [
    options?.state ? `state=${options.state}` : "",
    `sinceHours=${sinceHours}`
  ]
    .filter(Boolean)
    .join(", ");

  const lines = [
    `Generated: ${status.generatedAt}`,
    `Docker recent activity (${filters}):`,
    ""
  ];

  if (containers.length === 0) {
    lines.push("- No containers matched that activity window.");
    return lines.join("\n");
  }

  for (const { container, latestTimestamp } of containers) {
    const latestAt = new Date(latestTimestamp).toISOString();
    const activityBits = [
      container.startedAt ? `started ${container.startedAt}` : "",
      container.finishedAt ? `finished ${container.finishedAt}` : "",
      container.createdAt ? `created ${container.createdAt}` : "",
      container.restartCount !== undefined && container.restartCount !== null ? `restartCount ${container.restartCount}` : "",
      container.exitCode !== undefined && container.exitCode !== null ? `exitCode ${container.exitCode}` : ""
    ]
      .filter(Boolean)
      .join(" | ");

    lines.push(`- ${container.name} | ${container.state} | latest ${latestAt}`);
    if (activityBits) {
      lines.push(`  ${activityBits}`);
    }
  }

  return lines.join("\n");
}

export function formatDockerVolumes(
  status: WindowsHostStatus,
  options?: {
    name?: string;
    inUse?: boolean;
    anonymous?: boolean;
    limit?: number;
  }
) {
  const docker = status.docker;
  if (!docker) {
    throw new Error("Windows host status does not include Docker details");
  }

  const name = normalize(options?.name);
  const limit = Math.min(Math.max(options?.limit ?? 25, 1), 50);
  const volumes = docker.volumes
    .filter((volume) => {
      if (name && !volume.name.toLowerCase().includes(name)) {
        return false;
      }

      if (options?.inUse !== undefined && Boolean(volume.inUse) !== options.inUse) {
        return false;
      }

      if (options?.anonymous !== undefined && Boolean(volume.anonymous) !== options.anonymous) {
        return false;
      }

      return true;
    })
    .sort((left, right) => left.name.localeCompare(right.name))
    .slice(0, limit);

  const filters = [
    options?.name ? `name=${options.name}` : "",
    options?.inUse !== undefined ? `inUse=${options.inUse}` : "",
    options?.anonymous !== undefined ? `anonymous=${options.anonymous}` : ""
  ]
    .filter(Boolean)
    .join(", ");

  const lines = [
    `Generated: ${status.generatedAt}`,
    filters ? `Docker volumes (${filters}):` : "Docker volumes:",
    ""
  ];

  if (volumes.length === 0) {
    lines.push("- No volumes matched that filter.");
    return lines.join("\n");
  }

  for (const volume of volumes) {
    const flags = [
      volume.driver,
      volume.scope,
      volume.inUse ? "in use" : "unused",
      volume.anonymous ? "anonymous" : ""
    ]
      .filter(Boolean)
      .join(" | ");
    lines.push(`- ${volume.name} | ${flags}`);

    if (volume.createdAt) {
      lines.push(`  Created: ${volume.createdAt}`);
    }

    if (volume.mountpoint) {
      lines.push(`  Mountpoint: ${volume.mountpoint}`);
    }

    if (volume.attachedContainers && volume.attachedContainers.length > 0) {
      lines.push(`  Attached containers: ${volume.attachedContainers.join(", ")}`);
    }
  }

  return lines.join("\n");
}

export function formatDockerCleanupCandidates(
  status: WindowsHostStatus,
  options?: {
    limit?: number;
    olderThanHours?: number;
  }
) {
  const docker = status.docker;
  if (!docker) {
    throw new Error("Windows host status does not include Docker details");
  }

  const limit = Math.min(Math.max(options?.limit ?? 20, 1), 50);
  const olderThanHours = Math.min(Math.max(options?.olderThanHours ?? 72, 1), 24 * 90);
  const cutoff = Date.now() - olderThanHours * 60 * 60 * 1000;
  const reclaimableStorage = docker.storage.filter((entry) => entry.reclaimable && entry.reclaimable !== "0B (0%)" && entry.reclaimable !== "0B");
  const exitedContainers = docker.containers
    .filter((container) => container.state === "exited")
    .filter((container) => {
      const latest = getDockerLatestActivityTimestamp(container);
      return Number.isNaN(latest) || latest <= cutoff;
    })
    .sort((left, right) => getDockerLatestActivityTimestamp(right) - getDockerLatestActivityTimestamp(left))
    .slice(0, limit);
  const unusedImages = docker.images
    .filter((image) => (image.containers ?? 0) === 0 || image.dangling)
    .slice(0, limit);
  const unusedVolumes = docker.volumes
    .filter((volume) => !volume.inUse)
    .slice(0, limit);

  const lines = [
    `Generated: ${status.generatedAt}`,
    `Docker cleanup candidates (olderThanHours=${olderThanHours}):`,
    ""
  ];

  if (reclaimableStorage.length > 0) {
    lines.push("Reclaimable storage:");
    for (const entry of reclaimableStorage) {
      lines.push(`- ${entry.type} | reclaimable ${entry.reclaimable} | total ${entry.size || "unknown"} | active ${entry.active ?? "unknown"} of ${entry.totalCount ?? "unknown"}`);
    }
    lines.push("");
  }

  lines.push("Exited containers:");
  if (exitedContainers.length === 0) {
    lines.push("- No exited containers older than that window.");
  } else {
    for (const container of exitedContainers) {
      lines.push(`- ${container.name} | ${container.status}`);
    }
  }

  lines.push("");
  lines.push("Unused images:");
  if (unusedImages.length === 0) {
    lines.push("- No unused or dangling images in the latest snapshot.");
  } else {
    for (const image of unusedImages) {
      const flags = [image.dangling ? "dangling" : "", image.containers !== undefined ? `${image.containers} containers` : ""]
        .filter(Boolean)
        .join(" | ");
      lines.push(`- ${image.repository}:${image.tag} | ${image.size || "size unknown"}${flags ? ` | ${flags}` : ""}`);
    }
  }

  lines.push("");
  lines.push("Unused volumes:");
  if (unusedVolumes.length === 0) {
    lines.push("- No unused volumes in the latest snapshot.");
  } else {
    for (const volume of unusedVolumes) {
      lines.push(`- ${volume.name} | ${volume.driver}${volume.anonymous ? " | anonymous" : ""}`);
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

export function formatDockerFind(
  status: WindowsHostStatus,
  options: {
    query: string;
    domain?: "auto" | "container" | "project" | "image" | "network" | "volume";
    limit?: number;
  }
) {
  const docker = status.docker;
  if (!docker) {
    throw new Error("Windows host status does not include Docker details");
  }

  const query = normalize(options.query);
  if (!query) {
    return `Generated: ${status.generatedAt}\nDocker finder:\n\n- A non-empty Docker query is required.`;
  }

  const domain = options.domain ?? "auto";
  const limit = Math.min(Math.max(options.limit ?? 10, 1), 25);

  const containers = docker.containers
    .filter(
      (container) =>
        container.name.toLowerCase().includes(query) ||
        container.id.toLowerCase().includes(query) ||
        container.image.toLowerCase().includes(query) ||
        (container.composeProject?.toLowerCase().includes(query) ?? false) ||
        (container.composeService?.toLowerCase().includes(query) ?? false)
    )
    .slice(0, limit);

  const projects = getDockerComposeProjects(docker.containers)
    .filter(
      (project) =>
        project.name.toLowerCase().includes(query) ||
        [...project.services].some((service) => service.toLowerCase().includes(query)) ||
        project.containers.some((container) => container.name.toLowerCase().includes(query))
    )
    .slice(0, limit);

  const images = docker.images
    .filter(
      (image) =>
        image.repository.toLowerCase().includes(query) ||
        image.tag.toLowerCase().includes(query) ||
        image.id.toLowerCase().includes(query)
    )
    .slice(0, limit);

  const networks = docker.networks
    .filter(
      (network) =>
        network.name.toLowerCase().includes(query) ||
        network.id.toLowerCase().includes(query) ||
        network.driver.toLowerCase().includes(query) ||
        (network.composeProject?.toLowerCase().includes(query) ?? false)
    )
    .slice(0, limit);

  const volumes = docker.volumes
    .filter(
      (volume) =>
        volume.name.toLowerCase().includes(query) ||
        volume.driver.toLowerCase().includes(query) ||
        (volume.attachedContainers?.some((container) => container.toLowerCase().includes(query)) ?? false)
    )
    .slice(0, limit);

  const sections = [
    domain === "auto" || domain === "container"
      ? {
          label: "Containers",
          count: containers.length,
          lines:
            containers.length === 0
              ? []
              : containers.flatMap((container) => {
                  const detailBits = [
                    container.state,
                    container.health ? `health=${container.health}` : "",
                    container.composeProject ? `project=${container.composeProject}` : "",
                    container.composeService ? `service=${container.composeService}` : ""
                  ]
                    .filter(Boolean)
                    .join(" | ");
                  return [
                    `- ${container.name} | ${container.image}${detailBits ? ` | ${detailBits}` : ""}`,
                    container.ports ? `  Ports: ${container.ports}` : `  Status: ${container.status}`
                  ];
                })
        }
      : undefined,
    domain === "auto" || domain === "project"
      ? {
          label: "Projects",
          count: projects.length,
          lines:
            projects.length === 0
              ? []
              : projects.flatMap((project) => {
                  const health = getDockerProjectHealth(project.containers);
                  return [
                    `- ${project.name} | ${health} | ${project.containers.length} containers | ${project.services.size} services`,
                    `  Services: ${[...project.services].sort().join(", ") || "none"}`
                  ];
                })
        }
      : undefined,
    domain === "auto" || domain === "image"
      ? {
          label: "Images",
          count: images.length,
          lines:
            images.length === 0
              ? []
              : images.flatMap((image) => [
                  `- ${image.repository}:${image.tag} | ${image.size || "size unknown"} | ${image.containers ?? 0} containers`,
                  image.createdAt ? `  Created: ${image.createdAt}` : ""
                ])
        }
      : undefined,
    domain === "auto" || domain === "network"
      ? {
          label: "Networks",
          count: networks.length,
          lines:
            networks.length === 0
              ? []
              : networks.flatMap((network) => [
                  `- ${network.name} | ${network.driver} | ${network.scope}${network.composeProject ? ` | compose=${network.composeProject}` : ""}`,
                  network.createdAt ? `  Created: ${network.createdAt}` : ""
                ])
        }
      : undefined,
    domain === "auto" || domain === "volume"
      ? {
          label: "Volumes",
          count: volumes.length,
          lines:
            volumes.length === 0
              ? []
              : volumes.flatMap((volume) => [
                  `- ${volume.name} | ${volume.driver} | ${volume.inUse ? "in use" : "unused"}${volume.anonymous ? " | anonymous" : ""}`,
                  volume.attachedContainers && volume.attachedContainers.length > 0
                    ? `  Attached containers: ${volume.attachedContainers.join(", ")}`
                    : ""
                ])
        }
      : undefined
  ].filter((section): section is { label: string; count: number; lines: string[] } => Boolean(section));

  const totalMatches = sections.reduce((sum, section) => sum + section.count, 0);
  const lines = [
    `Generated: ${status.generatedAt}`,
    `Docker finder for "${options.query}"${domain !== "auto" ? ` (${domain})` : ""}:`,
    ""
  ];

  if (totalMatches === 0) {
    lines.push("- No Docker containers, projects, images, networks, or volumes matched that query.");
    return lines.join("\n");
  }

  for (const section of sections) {
    if (section.count === 0) {
      continue;
    }

    lines.push(`${section.label}:`);
    for (const line of section.lines.filter(Boolean)) {
      lines.push(line);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

export function formatDockerPortMap(
  status: WindowsHostStatus,
  options?: {
    name?: string;
    project?: string;
    publishedOnly?: boolean;
    limit?: number;
  }
) {
  const docker = status.docker;
  if (!docker) {
    throw new Error("Windows host status does not include Docker details");
  }

  const name = normalize(options?.name);
  const project = normalize(options?.project);
  const publishedOnly = options?.publishedOnly ?? true;
  const limit = Math.min(Math.max(options?.limit ?? 25, 1), 50);
  const containers = docker.containers
    .filter((container) => !name || container.name.toLowerCase().includes(name) || container.image.toLowerCase().includes(name))
    .filter((container) => !project || (container.composeProject?.toLowerCase() || "") === project)
    .filter((container) => (publishedOnly ? Boolean(container.ports?.trim()) : true))
    .slice(0, limit);

  const filters = [
    options?.name ? `name=${options.name}` : "",
    options?.project ? `project=${options.project}` : "",
    `publishedOnly=${publishedOnly}`
  ]
    .filter(Boolean)
    .join(", ");

  const lines = [
    `Generated: ${status.generatedAt}`,
    `Docker port map (${filters}):`,
    ""
  ];

  if (containers.length === 0) {
    lines.push("- No Docker containers with matching port mappings were found.");
    return lines.join("\n");
  }

  for (const container of containers) {
    lines.push(`- ${container.name} | ${container.image}`);
    lines.push(`  Ports: ${container.ports || "no published ports recorded"}`);
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

export function formatDockerMountReport(
  status: WindowsHostStatus,
  options?: {
    name?: string;
    project?: string;
    accessMode?: "ro" | "rw";
    limit?: number;
  }
) {
  const docker = status.docker;
  if (!docker) {
    throw new Error("Windows host status does not include Docker details");
  }

  const name = normalize(options?.name);
  const project = normalize(options?.project);
  const accessMode = options?.accessMode;
  const limit = Math.min(Math.max(options?.limit ?? 25, 1), 50);

  const containers = docker.containers
    .filter((container) => !name || container.name.toLowerCase().includes(name) || container.image.toLowerCase().includes(name))
    .filter((container) => !project || (container.composeProject?.toLowerCase() || "") === project)
    .map((container) => {
      const mounts = (container.mounts ?? []).filter((mount) => {
        if (!accessMode) {
          return true;
        }

        return accessMode === "ro" ? mount.readWrite === false : mount.readWrite === true;
      });

      return {
        container,
        mounts
      };
    })
    .filter(({ mounts }) => mounts.length > 0)
    .slice(0, limit);

  const filters = [
    options?.name ? `name=${options.name}` : "",
    options?.project ? `project=${options.project}` : "",
    accessMode ? `accessMode=${accessMode}` : ""
  ]
    .filter(Boolean)
    .join(", ");

  const lines = [
    `Generated: ${status.generatedAt}`,
    filters ? `Docker mount report (${filters}):` : "Docker mount report:",
    ""
  ];

  if (containers.length === 0) {
    lines.push("- No Docker mounts matched that filter.");
    return lines.join("\n");
  }

  for (const { container, mounts } of containers) {
    lines.push(`- ${container.name} | ${container.image}`);
    if (container.composeProject || container.composeService) {
      lines.push(
        `  Compose: ${container.composeProject || "unknown project"} / ${container.composeService || "unknown service"}`
      );
    }

    for (const mount of mounts) {
      const source = mount.source ? `${mount.source} -> ` : "";
      const access = mount.readWrite === false ? "ro" : mount.readWrite === true ? "rw" : "unknown";
      const detailBits = [mount.type, mount.mode, access]
        .filter((value, index, values) => Boolean(value) && values.indexOf(value) === index)
        .join(" | ");
      lines.push(`  - ${source}${mount.destination}${detailBits ? ` | ${detailBits}` : ""}`);
    }
  }

  return lines.join("\n");
}

export function formatDockerRestartReport(
  status: WindowsHostStatus,
  options?: {
    name?: string;
    project?: string;
    sinceHours?: number;
    includeHealthy?: boolean;
    limit?: number;
  }
) {
  const docker = status.docker;
  if (!docker) {
    throw new Error("Windows host status does not include Docker details");
  }

  const name = normalize(options?.name);
  const project = normalize(options?.project);
  const includeHealthy = options?.includeHealthy ?? false;
  const sinceHours = Math.min(Math.max(options?.sinceHours ?? 24 * 7, 1), 24 * 180);
  const cutoff = Date.now() - sinceHours * 60 * 60 * 1000;
  const limit = Math.min(Math.max(options?.limit ?? 25, 1), 50);

  const containers = docker.containers
    .filter((container) => !name || container.name.toLowerCase().includes(name) || container.image.toLowerCase().includes(name))
    .filter((container) => !project || (container.composeProject?.toLowerCase() || "") === project)
    .filter((container) => {
      if (includeHealthy) {
        return true;
      }

      return (
        (container.restartCount ?? 0) > 0 ||
        container.state.toLowerCase() === "restarting" ||
        (container.state.toLowerCase() === "exited" && (container.exitCode ?? 0) !== 0)
      );
    })
    .map((container) => ({
      container,
      latestActivity: getDockerLatestActivityTimestamp(container)
    }))
    .filter(({ latestActivity }) => Number.isNaN(latestActivity) || latestActivity >= cutoff)
    .sort(
      (left, right) =>
        (right.container.restartCount ?? 0) - (left.container.restartCount ?? 0) ||
        right.latestActivity - left.latestActivity
    )
    .slice(0, limit);

  const filters = [
    options?.name ? `name=${options.name}` : "",
    options?.project ? `project=${options.project}` : "",
    `sinceHours=${sinceHours}`,
    `includeHealthy=${includeHealthy}`
  ]
    .filter(Boolean)
    .join(", ");

  const lines = [
    `Generated: ${status.generatedAt}`,
    `Docker restart report (${filters}):`,
    ""
  ];

  if (containers.length === 0) {
    lines.push("- No Docker containers matched that restart or failure window.");
    return lines.join("\n");
  }

  for (const { container, latestActivity } of containers) {
    const detailBits = [
      `state=${container.state}`,
      container.health ? `health=${container.health}` : "",
      container.restartCount !== undefined && container.restartCount !== null ? `restartCount=${container.restartCount}` : "",
      container.exitCode !== undefined && container.exitCode !== null ? `exitCode=${container.exitCode}` : "",
      Number.isFinite(latestActivity) ? `latest=${new Date(latestActivity).toISOString()}` : ""
    ]
      .filter(Boolean)
      .join(" | ");
    lines.push(`- ${container.name} | ${container.image}${detailBits ? ` | ${detailBits}` : ""}`);
    lines.push(`  ${container.status}`);

    if (container.composeProject || container.composeService) {
      lines.push(
        `  Compose: ${container.composeProject || "unknown project"} / ${container.composeService || "unknown service"}`
      );
    }

    const timingBits = [
      container.startedAt ? `started ${container.startedAt}` : "",
      container.finishedAt ? `finished ${container.finishedAt}` : ""
    ]
      .filter(Boolean)
      .join(" | ");
    if (timingBits) {
      lines.push(`  ${timingBits}`);
    }

    if (container.error) {
      lines.push(`  Error: ${container.error}`);
    }
  }

  return lines.join("\n");
}

type DockerExposureKind = "public" | "local-only" | "host-ip" | "internal";

type DockerExposureRecord = {
  container: DockerContainerStatus;
  exposure: DockerExposureKind;
  bindings: string[];
};

function getDockerExposure(container: DockerContainerStatus): DockerExposureRecord | undefined {
  const raw = container.ports?.trim();
  if (!raw) {
    return undefined;
  }

  const bindings = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (bindings.length === 0) {
    return undefined;
  }

  let exposure: DockerExposureKind = "internal";
  for (const binding of bindings) {
    if (/0\.0\.0\.0:|\[::\]:|:::/.test(binding)) {
      exposure = "public";
      break;
    }

    if (/127\.0\.0\.1:|localhost:|\[::1\]:/.test(binding)) {
      exposure = exposure === "internal" ? "local-only" : exposure;
      continue;
    }

    if (binding.includes("->")) {
      exposure = exposure === "internal" ? "host-ip" : exposure;
    }
  }

  return {
    container,
    exposure,
    bindings
  };
}

export function formatDockerExposureReport(
  status: WindowsHostStatus,
  options?: {
    name?: string;
    project?: string;
    limit?: number;
  }
) {
  const docker = status.docker;
  if (!docker) {
    throw new Error("Windows host status does not include Docker details");
  }

  const name = normalize(options?.name);
  const project = normalize(options?.project);
  const limit = Math.min(Math.max(options?.limit ?? 25, 1), 50);
  const exposures = docker.containers
    .filter((container) => !name || container.name.toLowerCase().includes(name) || container.image.toLowerCase().includes(name))
    .filter((container) => !project || (container.composeProject?.toLowerCase() || "") === project)
    .map((container) => getDockerExposure(container))
    .filter((record): record is DockerExposureRecord => Boolean(record))
    .slice(0, limit);

  const publicBindings = exposures.filter((record) => record.exposure === "public");
  const localBindings = exposures.filter((record) => record.exposure === "local-only");
  const hostIpBindings = exposures.filter((record) => record.exposure === "host-ip");

  const filters = [
    options?.name ? `name=${options.name}` : "",
    options?.project ? `project=${options.project}` : ""
  ]
    .filter(Boolean)
    .join(", ");

  const lines = [
    `Generated: ${status.generatedAt}`,
    filters ? `Docker exposure report (${filters}):` : "Docker exposure report:",
    "",
    `Containers with published ports: ${exposures.length}`,
    `Public bindings: ${publicBindings.length}`,
    `Loopback-only bindings: ${localBindings.length}`,
    `Host-IP bindings: ${hostIpBindings.length}`,
    ""
  ];

  if (exposures.length === 0) {
    lines.push("- No Docker containers with published ports were found.");
    return lines.join("\n");
  }

  const sections: Array<{ title: string; records: DockerExposureRecord[] }> = [
    { title: "Public bindings", records: publicBindings },
    { title: "Host-IP bindings", records: hostIpBindings },
    { title: "Loopback-only bindings", records: localBindings }
  ];

  for (const section of sections) {
    lines.push(`${section.title}:`);
    if (section.records.length === 0) {
      lines.push("- None.");
    } else {
      for (const record of section.records) {
        const container = record.container;
        lines.push(`- ${container.name} | ${container.image}`);
        lines.push(`  Ports: ${record.bindings.join(", ")}`);
        if (container.composeProject || container.composeService) {
          lines.push(
            `  Compose: ${container.composeProject || "unknown project"} / ${container.composeService || "unknown service"}`
          );
        }
        if (container.networks && container.networks.length > 0) {
          lines.push(`  Networks: ${container.networks.join(", ")}`);
        }
      }
    }
    lines.push("");
  }

  lines.push("Guidance:");
  if (publicBindings.length > 0) {
    lines.push("- Review public bindings carefully before exposing this host outside your tailnet.");
  } else {
    lines.push("- No public 0.0.0.0 or IPv6-any bindings were detected in the latest snapshot.");
  }

  if (localBindings.length > 0) {
    lines.push("- Loopback-only bindings are good candidates for private reverse-proxy patterns like Caddy on 127.0.0.1.");
  }

  return lines.join("\n").trimEnd();
}

export function formatDockerTriageReport(
  status: WindowsHostStatus,
  options?: {
    project?: string;
    sinceHours?: number;
  }
) {
  const docker = status.docker;
  if (!docker) {
    throw new Error("Windows host status does not include Docker details");
  }

  const project = normalize(options?.project);
  const sinceHours = Math.min(Math.max(options?.sinceHours ?? 24 * 7, 1), 24 * 180);
  const scopedContainers = docker.containers.filter(
    (container) => !project || (container.composeProject?.toLowerCase() || "") === project
  );
  const problemContainers = getDockerProblemContainers(scopedContainers);
  const restartHotspots = scopedContainers
    .filter((container) => (container.restartCount ?? 0) > 0)
    .sort((left, right) => (right.restartCount ?? 0) - (left.restartCount ?? 0))
    .slice(0, 5);
  const resourceHotspots = scopedContainers
    .filter((container) => container.resourceUsage)
    .sort(
      (left, right) =>
        (right.resourceUsage?.memoryPercent ?? -1) - (left.resourceUsage?.memoryPercent ?? -1) ||
        (right.resourceUsage?.cpuPercent ?? -1) - (left.resourceUsage?.cpuPercent ?? -1)
    )
    .slice(0, 5);
  const exposures = scopedContainers
    .map((container) => getDockerExposure(container))
    .filter((record): record is DockerExposureRecord => Boolean(record));
  const publicExposures = exposures.filter((record) => record.exposure === "public");
  const recentCutoff = Date.now() - sinceHours * 60 * 60 * 1000;
  const recentFailures = scopedContainers
    .map((container) => ({ container, latest: getDockerLatestActivityTimestamp(container) }))
    .filter(({ container, latest }) => {
      const failed =
        container.state.toLowerCase() === "restarting" ||
        (container.state.toLowerCase() === "exited" && (container.exitCode ?? 0) !== 0);
      return failed && (Number.isNaN(latest) || latest >= recentCutoff);
    })
    .sort((left, right) => right.latest - left.latest)
    .slice(0, 5);
  const reclaimableStorage = docker.storage.filter(
    (entry) => entry.reclaimable && entry.reclaimable !== "0B" && entry.reclaimable !== "0B (0%)"
  );

  const filters = [options?.project ? `project=${options.project}` : "", `sinceHours=${sinceHours}`]
    .filter(Boolean)
    .join(", ");
  const lines = [
    `Generated: ${status.generatedAt}`,
    `Docker triage report (${filters}):`,
    "",
    `Scope: ${project ? options?.project : "all Docker projects and containers"}`,
    `Containers: ${scopedContainers.length}`,
    `Problem containers: ${problemContainers.length}`,
    `Publicly exposed containers: ${publicExposures.length}`,
    `Containers with restart history: ${restartHotspots.length}`,
    ""
  ];

  lines.push("Priority findings:");
  if (
    problemContainers.length === 0 &&
    publicExposures.length === 0 &&
    restartHotspots.length === 0 &&
    recentFailures.length === 0
  ) {
    lines.push("- No urgent Docker problems were detected in the latest snapshot.");
  } else {
    if (problemContainers.length > 0) {
      lines.push(`- ${problemContainers.length} containers are unhealthy, restarting, dead, or exited non-zero.`);
    }
    if (publicExposures.length > 0) {
      lines.push(`- ${publicExposures.length} containers publish ports on 0.0.0.0 or IPv6-any bindings.`);
    }
    if (restartHotspots.length > 0) {
      lines.push(`- ${restartHotspots.length} containers show restart history worth reviewing.`);
    }
    if (recentFailures.length > 0) {
      lines.push(`- ${recentFailures.length} containers failed recently inside the last ${sinceHours} hours.`);
    }
  }

  lines.push("");
  lines.push("Top resource consumers:");
  if (resourceHotspots.length === 0) {
    lines.push("- No running containers with resource usage data were found.");
  } else {
    for (const container of resourceHotspots) {
      const usageBits = [
        container.resourceUsage?.cpuPercent !== undefined && container.resourceUsage?.cpuPercent !== null
          ? `CPU ${container.resourceUsage.cpuPercent.toFixed(2)}%`
          : "",
        container.resourceUsage?.memoryUsage ? `Mem ${container.resourceUsage.memoryUsage}` : "",
        container.resourceUsage?.memoryPercent !== undefined && container.resourceUsage?.memoryPercent !== null
          ? `Mem% ${container.resourceUsage.memoryPercent.toFixed(2)}%`
          : ""
      ]
        .filter(Boolean)
        .join(" | ");
      lines.push(`- ${container.name} | ${container.image}${usageBits ? ` | ${usageBits}` : ""}`);
    }
  }

  lines.push("");
  lines.push("Restart and failure hotspots:");
  if (restartHotspots.length === 0 && recentFailures.length === 0) {
    lines.push("- No restart hotspots or recent failures were detected.");
  } else {
    for (const container of restartHotspots) {
      lines.push(`- ${container.name} | restartCount ${container.restartCount ?? 0} | ${container.status}`);
    }

    for (const { container, latest } of recentFailures) {
      const latestText = Number.isFinite(latest) ? new Date(latest).toISOString() : "unknown";
      lines.push(`- ${container.name} | recent failure | latest ${latestText} | ${container.status}`);
    }
  }

  lines.push("");
  lines.push("Exposure:");
  if (publicExposures.length === 0) {
    lines.push("- No public Docker port bindings were detected in this scope.");
  } else {
    for (const record of publicExposures) {
      lines.push(`- ${record.container.name} | ${record.bindings.join(", ")}`);
    }
  }

  if (reclaimableStorage.length > 0) {
    lines.push("");
    lines.push("Reclaimable storage:");
    for (const entry of reclaimableStorage) {
      lines.push(`- ${entry.type} | reclaimable ${entry.reclaimable} | total ${entry.size || "unknown"}`);
    }
  }

  lines.push("");
  lines.push("Recommended next commands:");
  if (problemContainers.length > 0) {
    lines.push("- get_docker_issues");
  }
  if (restartHotspots.length > 0 || recentFailures.length > 0) {
    lines.push(`- get_docker_restart_report sinceHours=${sinceHours}`);
  }
  if (resourceHotspots.length > 0) {
    lines.push("- get_docker_resource_usage");
  }
  if (publicExposures.length > 0) {
    lines.push("- get_docker_exposure_report");
  }
  if (reclaimableStorage.length > 0) {
    lines.push("- get_docker_cleanup_candidates");
  }
  if (problemContainers.length === 0 && restartHotspots.length === 0 && recentFailures.length === 0 && publicExposures.length === 0) {
    lines.push("- get_docker_compose_health");
  }

  return lines.join("\n");
}

export function formatHostFind(
  status: WindowsHostStatus,
  options: {
    query: string;
    domain?: "auto" | "component" | "resource" | "disk" | "network" | "service" | "task" | "port";
    limit?: number;
  }
) {
  const resources = getHostResources(status);
  const query = normalize(options.query);
  if (!query) {
    return `Generated: ${status.generatedAt}\nHost finder:\n\n- A non-empty host query is required.`;
  }

  const domain = options.domain ?? "auto";
  const limit = Math.min(Math.max(options.limit ?? 10, 1), 25);
  const queryLooksLikeResource = /cpu|memory|ram|resource|load|uptime/.test(query);

  const components =
    domain === "auto" || domain === "component"
      ? status.components
          .filter(
            (component) =>
              component.name.toLowerCase().includes(query) ||
              component.status.toLowerCase().includes(query) ||
              component.details.toLowerCase().includes(query)
          )
          .slice(0, limit)
      : [];

  const diskMatches =
    domain === "auto" || domain === "disk"
      ? resources.disks
          .filter(
            (disk) =>
              disk.name.toLowerCase().includes(query) ||
              (disk.volumeName?.toLowerCase().includes(query) ?? false) ||
              (disk.fileSystem?.toLowerCase().includes(query) ?? false)
          )
          .slice(0, limit)
      : [];

  const networkMatches =
    domain === "auto" || domain === "network"
      ? resources.network.adapters
          .filter(
            (adapter) =>
              adapter.name.toLowerCase().includes(query) ||
              (adapter.description?.toLowerCase().includes(query) ?? false) ||
              adapter.ipv4.some((value) => value.toLowerCase().includes(query)) ||
              adapter.ipv6.some((value) => value.toLowerCase().includes(query)) ||
              (adapter.gateways?.some((value) => value.toLowerCase().includes(query)) ?? false) ||
              (adapter.dnsServers?.some((value) => value.toLowerCase().includes(query)) ?? false)
          )
          .slice(0, limit)
      : [];
  const serviceMatches =
    domain === "auto" || domain === "service"
      ? (status.services ?? [])
          .filter(
            (service) =>
              service.name.toLowerCase().includes(query) ||
              service.displayName.toLowerCase().includes(query) ||
              service.state.toLowerCase().includes(query) ||
              (service.description?.toLowerCase().includes(query) ?? false)
          )
          .slice(0, limit)
      : [];
  const taskMatches =
    domain === "auto" || domain === "task"
      ? (status.scheduledTasks ?? [])
          .filter(
            (task) =>
              task.name.toLowerCase().includes(query) ||
              task.path.toLowerCase().includes(query) ||
              task.state.toLowerCase().includes(query) ||
              (task.description?.toLowerCase().includes(query) ?? false) ||
              (task.actions?.some((action) => action.toLowerCase().includes(query)) ?? false)
          )
          .slice(0, limit)
      : [];
  const portMatches =
    domain === "auto" || domain === "port"
      ? (status.listeningPorts ?? [])
          .filter(
            (port) =>
              port.localAddress.toLowerCase().includes(query) ||
              String(port.localPort).includes(query) ||
              port.protocol.toLowerCase().includes(query) ||
              (port.processName?.toLowerCase().includes(query) ?? false) ||
              (port.serviceNames?.some((serviceName) => serviceName.toLowerCase().includes(query)) ?? false)
          )
          .slice(0, limit)
      : [];

  const includeResourceSummary = domain === "resource" || queryLooksLikeResource;
  const lines = [
    `Generated: ${status.generatedAt}`,
    `Host finder for "${options.query}"${domain !== "auto" ? ` (${domain})` : ""}:`,
    ""
  ];

  if (includeResourceSummary) {
    lines.push("Resources:");
    lines.push(`- CPU ${resources.cpu.name} | load ${formatPercent(resources.cpu.loadPercent ?? null)} | logical cores ${resources.cpu.logicalCores}`);
    lines.push(
      `- Memory ${formatByteSize(resources.memory.usedBytes)} used of ${formatByteSize(resources.memory.totalBytes)} (${formatPercent(resources.memory.percentUsed)})`
    );
    lines.push(`- Network adapters ${resources.network.adapterCount} | primary IPv4 ${resources.network.primaryIpv4 || "unknown"}`);
    lines.push("");
  }

  if (components.length > 0) {
    lines.push("Components:");
    for (const component of components) {
      lines.push(`- ${component.name} | ${component.status}`);
      lines.push(`  ${component.details}`);
    }
    lines.push("");
  }

  if (diskMatches.length > 0) {
    lines.push("Disks:");
    for (const disk of diskMatches) {
      lines.push(
        `- ${disk.name}${disk.volumeName ? ` (${disk.volumeName})` : ""} | free ${formatByteSize(disk.freeBytes)} of ${formatByteSize(disk.totalBytes)} (${formatPercent(disk.percentFree)})`
      );
    }
    lines.push("");
  }

  if (networkMatches.length > 0) {
    lines.push("Network adapters:");
    for (const adapter of networkMatches) {
      lines.push(`- ${adapter.name}`);
      lines.push(`  IPv4: ${adapter.ipv4.length > 0 ? adapter.ipv4.join(", ") : "none"}`);
      if (adapter.dnsServers && adapter.dnsServers.length > 0) {
        lines.push(`  DNS: ${adapter.dnsServers.join(", ")}`);
      }
    }
    lines.push("");
  }

  if (serviceMatches.length > 0) {
    lines.push("Services:");
    for (const service of serviceMatches) {
      lines.push(`- ${service.displayName} (${service.name}) | ${service.state}${service.startMode ? ` | ${service.startMode}` : ""}`);
    }
    lines.push("");
  }

  if (taskMatches.length > 0) {
    lines.push("Scheduled tasks:");
    for (const task of taskMatches) {
      lines.push(`- ${task.path}${task.name} | ${task.state} | ${task.enabled ? "enabled" : "disabled"}`);
      if (task.lastTaskResult !== null && task.lastTaskResult !== undefined) {
        lines.push(`  Last result: ${task.lastTaskResult}`);
      }
    }
    lines.push("");
  }

  if (portMatches.length > 0) {
    lines.push("Listening ports:");
    for (const port of portMatches) {
      const serviceText = port.serviceNames && port.serviceNames.length > 0 ? ` | services=${port.serviceNames.join(", ")}` : "";
      lines.push(`- ${port.protocol.toUpperCase()} ${port.localAddress}:${port.localPort} | ${port.processName || "unknown"}${serviceText}`);
    }
    lines.push("");
  }

  if (lines.length <= 3) {
    lines.push("- No host components, resources, disks, network adapters, services, scheduled tasks, or listening ports matched that query.");
  }

  return lines.join("\n").trimEnd();
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
