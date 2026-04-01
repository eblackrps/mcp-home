import type { BackupTaskStatus, HostBackupStatus, WindowsHostStatus } from "./host.js";

function normalize(value: string | undefined) {
  return value?.trim().toLowerCase();
}

function toDisplayTask(task: BackupTaskStatus) {
  return task.displayPath || `${task.path}${task.name}`;
}

function getBackups(status: WindowsHostStatus): HostBackupStatus {
  if (!status.backups) {
    throw new Error("Windows host status does not include backup details");
  }

  return status.backups;
}

function summarizeIssue(task: BackupTaskStatus) {
  const bits = [task.state, task.enabled ? "enabled" : "disabled"];
  if (task.lastTaskResult !== null && task.lastTaskResult !== undefined) {
    bits.push(`last result ${task.lastTaskResult}`);
  }
  if (task.stale) {
    bits.push("stale");
  }
  if (task.reasons.length > 0) {
    bits.push(task.reasons.join("; "));
  }
  return bits.join(" | ");
}

export function formatBackupStatus(status: WindowsHostStatus) {
  const backups = getBackups(status);
  const issueTasks = backups.tasks.filter((task) => task.issue !== "none");
  const lines = [
    `Generated: ${status.generatedAt}`,
    "Backup status:",
    "",
    `Detected backup tasks: ${backups.taskCount}`,
    `Healthy: ${backups.healthyCount} | Warnings: ${backups.warningCount} | Failures: ${backups.failureCount}`,
    `Stale threshold: ${backups.staleAfterHours} hours`,
    `Keywords: ${backups.taskKeywords.join(", ")}`,
    ""
  ];

  if (backups.tasks.length === 0) {
    lines.push("- No backup-related scheduled tasks were detected in the latest Windows snapshot.");
    return lines.join("\n");
  }

  lines.push("Backup tasks:");
  for (const task of backups.tasks.slice(0, 12)) {
    lines.push(`- ${toDisplayTask(task)} | ${summarizeIssue(task)}`);
    if (task.lastRunTime || task.nextRunTime) {
      lines.push(`  Last run: ${task.lastRunTime || "never"} | Next run: ${task.nextRunTime || "unknown"}`);
    }
  }

  if (issueTasks.length > 0) {
    lines.push("");
    lines.push("Priority follow-up:");
    for (const task of issueTasks.slice(0, 8)) {
      lines.push(`- ${toDisplayTask(task)} | ${task.issue} | ${task.reasons.join("; ") || "issue detected"}`);
    }
  }

  return lines.join("\n");
}

export function formatFailedBackups(
  status: WindowsHostStatus,
  options?: {
    limit?: number;
  }
) {
  const backups = getBackups(status);
  const limit = Math.min(Math.max(options?.limit ?? 20, 1), 100);
  const failing = backups.tasks
    .filter((task) => task.issue !== "none")
    .sort((left, right) => {
      const weight = (task: BackupTaskStatus) => (task.issue === "failure" ? 0 : 1);
      return weight(left) - weight(right) || toDisplayTask(left).localeCompare(toDisplayTask(right));
    })
    .slice(0, limit);

  const lines = [`Generated: ${status.generatedAt}`, "Failed or warning backup tasks:", ""];
  if (failing.length === 0) {
    lines.push("- No failing, stale, or disabled backup tasks were detected.");
    return lines.join("\n");
  }

  for (const task of failing) {
    lines.push(`- ${toDisplayTask(task)} | ${task.issue} | ${summarizeIssue(task)}`);
    if (task.lastRunTime || task.nextRunTime) {
      lines.push(`  Last run: ${task.lastRunTime || "never"} | Next run: ${task.nextRunTime || "unknown"}`);
    }
    if (task.actions && task.actions.length > 0) {
      lines.push(`  Action: ${task.actions[0]}`);
    }
  }

  return lines.join("\n");
}

export function formatBackupFind(
  status: WindowsHostStatus,
  options: {
    query: string;
    limit?: number;
  }
) {
  const backups = getBackups(status);
  const query = normalize(options.query);
  const limit = Math.min(Math.max(options.limit ?? 10, 1), 25);

  if (!query) {
    return `Generated: ${status.generatedAt}\nBackup finder:\n\n- A non-empty backup query is required.`;
  }

  const matches = backups.tasks
    .filter(
      (task) =>
        task.name.toLowerCase().includes(query) ||
        task.path.toLowerCase().includes(query) ||
        task.displayPath.toLowerCase().includes(query) ||
        task.reasons.some((reason) => reason.toLowerCase().includes(query)) ||
        (task.actions?.some((action) => action.toLowerCase().includes(query)) ?? false)
    )
    .slice(0, limit);

  const lines = [`Generated: ${status.generatedAt}`, `Backup finder for "${options.query}":`, ""];

  if (matches.length === 0) {
    lines.push("- No backup tasks matched that query.");
    return lines.join("\n");
  }

  for (const task of matches) {
    lines.push(`- ${toDisplayTask(task)} | ${summarizeIssue(task)}`);
    if (task.lastRunTime || task.nextRunTime) {
      lines.push(`  Last run: ${task.lastRunTime || "never"} | Next run: ${task.nextRunTime || "unknown"}`);
    }
  }

  return lines.join("\n");
}
