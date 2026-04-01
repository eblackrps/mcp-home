import type { HostDiskStatus, HostStorageStatus, ScannedFolderSummary, WindowsHostStatus } from "./host.js";

function normalize(value: string | undefined) {
  return value?.trim().toLowerCase();
}

function formatByteSize(bytes: number | null | undefined) {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) {
    return "unknown";
  }

  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const fixed = value >= 100 || unitIndex === 0 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(fixed)} ${units[unitIndex]}`;
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "unknown";
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
}

function getStorage(status: WindowsHostStatus): HostStorageStatus {
  if (!status.storage) {
    throw new Error("Windows host status does not include storage scan details");
  }

  return status.storage;
}

function getDisks(status: WindowsHostStatus): HostDiskStatus[] {
  if (!status.resources) {
    throw new Error("Windows host status does not include host resource details");
  }

  return status.resources.disks;
}

function getDriveKey(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const match = /^[A-Za-z]:/.exec(value);
  return match ? match[0].toUpperCase() : "";
}

function toDisplayPath(folder: ScannedFolderSummary) {
  return folder.path === folder.root ? `${folder.path} (root)` : folder.path;
}

export function formatStorageHealth(status: WindowsHostStatus) {
  const storage = getStorage(status);
  const disks = getDisks(status);
  const lowSpaceDisks = disks
    .filter((disk) => disk.percentFree !== undefined && disk.percentFree !== null)
    .filter((disk) => (disk.percentFree ?? 100) <= storage.lowSpaceThresholdPercent)
    .sort((left, right) => (left.percentFree ?? 100) - (right.percentFree ?? 100));
  const biggestFolders = [...storage.scannedFolders].sort((left, right) => right.totalBytes - left.totalBytes).slice(0, 8);

  const lines = [
    `Generated: ${status.generatedAt}`,
    "Storage health:",
    "",
    `Disks: ${disks.length}`,
    `Low-space threshold: ${storage.lowSpaceThresholdPercent}% free`,
    `Scan roots: ${storage.scanRoots.length > 0 ? storage.scanRoots.join(", ") : "none configured"}`,
    `Scanned folders: ${storage.scannedFolders.length}`,
    ""
  ];

  lines.push("Disk health:");
  if (disks.length === 0) {
    lines.push("- No fixed-disk data was captured in the latest host snapshot.");
  } else {
    for (const disk of [...disks].sort((left, right) => (left.percentFree ?? 100) - (right.percentFree ?? 100)).slice(0, 8)) {
      lines.push(
        `- ${disk.name}${disk.volumeName ? ` (${disk.volumeName})` : ""} | free ${formatByteSize(disk.freeBytes)} of ${formatByteSize(disk.totalBytes)} (${formatPercent(disk.percentFree)})`
      );
    }
  }

  lines.push("");
  lines.push("Low-space disks:");
  if (lowSpaceDisks.length === 0) {
    lines.push(`- No disks are below the ${storage.lowSpaceThresholdPercent}% free threshold.`);
  } else {
    for (const disk of lowSpaceDisks) {
      lines.push(
        `- ${disk.name}${disk.volumeName ? ` (${disk.volumeName})` : ""} | free ${formatByteSize(disk.freeBytes)} of ${formatByteSize(disk.totalBytes)} (${formatPercent(disk.percentFree)})`
      );
    }
  }

  lines.push("");
  lines.push("Largest scanned folders:");
  if (biggestFolders.length === 0) {
    lines.push("- No storage roots were scanned. Set STORAGE_SCAN_ROOTS and run npm run refresh:host.");
  } else {
    for (const folder of biggestFolders) {
      const detailBits = [
        `${formatByteSize(folder.totalBytes)}`,
        `${folder.fileCount} files`,
        `${folder.directoryCount} dirs`,
        folder.error ? `warning=${folder.error}` : ""
      ]
        .filter(Boolean)
        .join(" | ");
      lines.push(`- ${toDisplayPath(folder)} | ${detailBits}`);
    }
  }

  return lines.join("\n");
}

export function formatLowSpaceLocations(
  status: WindowsHostStatus,
  options?: {
    thresholdPercent?: number;
    limit?: number;
  }
) {
  const storage = getStorage(status);
  const disks = getDisks(status);
  const thresholdPercent = Math.min(Math.max(options?.thresholdPercent ?? storage.lowSpaceThresholdPercent, 1), 75);
  const limit = Math.min(Math.max(options?.limit ?? 10, 1), 50);
  const lowSpaceDisks = disks
    .filter((disk) => disk.percentFree !== undefined && disk.percentFree !== null)
    .filter((disk) => (disk.percentFree ?? 100) <= thresholdPercent)
    .sort((left, right) => (left.percentFree ?? 100) - (right.percentFree ?? 100))
    .slice(0, limit);

  const lines = [
    `Generated: ${status.generatedAt}`,
    `Low-space locations (threshold ${thresholdPercent}% free):`,
    ""
  ];

  if (lowSpaceDisks.length === 0) {
    lines.push("- No disks are currently below that free-space threshold.");
    return lines.join("\n");
  }

  for (const disk of lowSpaceDisks) {
    const driveKey = getDriveKey(disk.name);
    lines.push(
      `- ${disk.name}${disk.volumeName ? ` (${disk.volumeName})` : ""} | free ${formatByteSize(disk.freeBytes)} of ${formatByteSize(disk.totalBytes)} (${formatPercent(disk.percentFree)})`
    );

    const relatedFolders = storage.scannedFolders
      .filter((folder) => getDriveKey(folder.path || folder.root) === driveKey)
      .sort((left, right) => right.totalBytes - left.totalBytes)
      .slice(0, 3);

    if (relatedFolders.length > 0) {
      lines.push("  Largest scanned folders on this drive:");
      for (const folder of relatedFolders) {
        lines.push(`  - ${toDisplayPath(folder)} | ${formatByteSize(folder.totalBytes)}`);
      }
    }
  }

  return lines.join("\n");
}

export function formatLargeFolders(
  status: WindowsHostStatus,
  options?: {
    root?: string;
    limit?: number;
  }
) {
  const storage = getStorage(status);
  const root = normalize(options?.root);
  const limit = Math.min(Math.max(options?.limit ?? 20, 1), 100);
  const folders = storage.scannedFolders
    .filter((folder) => {
      if (!root) {
        return true;
      }

      return (
        folder.root.toLowerCase().includes(root) ||
        folder.path.toLowerCase().includes(root) ||
        folder.name.toLowerCase().includes(root)
      );
    })
    .sort((left, right) => right.totalBytes - left.totalBytes || left.path.localeCompare(right.path))
    .slice(0, limit);

  const lines = [
    `Generated: ${status.generatedAt}`,
    root ? `Large scanned folders (${options?.root}):` : "Large scanned folders:",
    ""
  ];

  if (folders.length === 0) {
    lines.push("- No scanned folders matched that filter.");
    return lines.join("\n");
  }

  for (const folder of folders) {
    const bits = [
      formatByteSize(folder.totalBytes),
      `${folder.fileCount} files`,
      `${folder.directoryCount} dirs`,
      folder.lastModified ? `last modified ${folder.lastModified}` : "",
      folder.error ? `warning=${folder.error}` : ""
    ]
      .filter(Boolean)
      .join(" | ");
    lines.push(`- ${toDisplayPath(folder)} | ${bits}`);
  }

  return lines.join("\n");
}

export function formatStorageFind(
  status: WindowsHostStatus,
  options: {
    query: string;
    limit?: number;
  }
) {
  const storage = getStorage(status);
  const disks = getDisks(status);
  const query = normalize(options.query);
  const limit = Math.min(Math.max(options.limit ?? 10, 1), 25);

  if (!query) {
    return `Generated: ${status.generatedAt}\nStorage finder:\n\n- A non-empty storage query is required.`;
  }

  const diskMatches = disks
    .filter(
      (disk) =>
        disk.name.toLowerCase().includes(query) ||
        (disk.volumeName?.toLowerCase().includes(query) ?? false) ||
        (disk.fileSystem?.toLowerCase().includes(query) ?? false)
    )
    .slice(0, limit);

  const folderMatches = storage.scannedFolders
    .filter(
      (folder) =>
        folder.root.toLowerCase().includes(query) ||
        folder.path.toLowerCase().includes(query) ||
        folder.name.toLowerCase().includes(query) ||
        (folder.drive?.toLowerCase().includes(query) ?? false)
    )
    .sort((left, right) => right.totalBytes - left.totalBytes)
    .slice(0, limit);

  const lines = [`Generated: ${status.generatedAt}`, `Storage finder for "${options.query}":`, ""];

  if (diskMatches.length > 0) {
    lines.push("Disks:");
    for (const disk of diskMatches) {
      lines.push(
        `- ${disk.name}${disk.volumeName ? ` (${disk.volumeName})` : ""} | free ${formatByteSize(disk.freeBytes)} of ${formatByteSize(disk.totalBytes)} (${formatPercent(disk.percentFree)})`
      );
    }
    lines.push("");
  }

  if (folderMatches.length > 0) {
    lines.push("Scanned folders:");
    for (const folder of folderMatches) {
      lines.push(`- ${toDisplayPath(folder)} | ${formatByteSize(folder.totalBytes)} | ${folder.fileCount} files`);
    }
    lines.push("");
  }

  if (diskMatches.length === 0 && folderMatches.length === 0) {
    lines.push("- No disks or scanned folders matched that query.");
  }

  return lines.join("\n").trimEnd();
}
