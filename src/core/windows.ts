import type {
  ListeningPortStatus,
  ShareStatusSnapshot,
  ScheduledTaskStatus,
  SmbShareStatus,
  WindowsEventEntry,
  WindowsEventSnapshot,
  WindowsHostStatus,
  WindowsServiceStatus
} from "./host.js";

function normalize(value: string | undefined) {
  return value?.trim().toLowerCase();
}

function getServices(status: WindowsHostStatus) {
  if (!status.services) {
    throw new Error("Windows host status does not include service details");
  }

  return status.services;
}

function getScheduledTasks(status: WindowsHostStatus) {
  if (!status.scheduledTasks) {
    throw new Error("Windows host status does not include scheduled task details");
  }

  return status.scheduledTasks;
}

function getListeningPorts(status: WindowsHostStatus) {
  if (!status.listeningPorts) {
    throw new Error("Windows host status does not include listening port details");
  }

  return status.listeningPorts;
}

function getEvents(status: WindowsHostStatus): WindowsEventSnapshot {
  if (!status.events) {
    throw new Error("Windows host status does not include Windows event details");
  }

  return status.events;
}

function getShares(status: WindowsHostStatus): ShareStatusSnapshot {
  if (!status.shares) {
    throw new Error("Windows host status does not include share details");
  }

  return status.shares;
}

function findServiceMatch(services: WindowsServiceStatus[], query: string) {
  const normalized = normalize(query);
  if (!normalized) {
    return undefined;
  }

  return (
    services.find(
      (service) =>
        service.name.toLowerCase() === normalized || service.displayName.trim().toLowerCase() === normalized
    ) ??
    services.find(
      (service) =>
        service.name.toLowerCase().includes(normalized) ||
        service.displayName.toLowerCase().includes(normalized) ||
        (service.description?.toLowerCase().includes(normalized) ?? false)
    )
  );
}

function findScheduledTaskMatch(tasks: ScheduledTaskStatus[], query: string) {
  const normalized = normalize(query);
  if (!normalized) {
    return undefined;
  }

  return (
    tasks.find((task) => `${task.path}${task.name}`.toLowerCase() === normalized) ??
    tasks.find(
      (task) =>
        task.name.toLowerCase() === normalized ||
        task.path.toLowerCase() === normalized
    ) ??
    tasks.find(
      (task) =>
        task.name.toLowerCase().includes(normalized) ||
        task.path.toLowerCase().includes(normalized) ||
        (task.description?.toLowerCase().includes(normalized) ?? false) ||
        (task.actions?.some((action) => action.toLowerCase().includes(normalized)) ?? false)
    )
  );
}

function summarizeTaskHealth(task: ScheduledTaskStatus) {
  const bits = [task.state, task.enabled ? "enabled" : "disabled"];
  if (task.lastTaskResult !== null && task.lastTaskResult !== undefined) {
    bits.push(`last result ${task.lastTaskResult}`);
  }
  return bits.join(" | ");
}

function toIsoIfPresent(value: string | null | undefined) {
  return value && value !== "0001-01-01T00:00:00Z" ? value : null;
}

function normalizeEventLevel(value: string | undefined) {
  const normalized = normalize(value);
  if (!normalized) {
    return undefined;
  }

  if (normalized === "warn") {
    return "warning";
  }

  return normalized;
}

function formatEventHeadline(snapshot: WindowsEventSnapshot) {
  return `Window: last ${snapshot.hours} hours | logs ${snapshot.logs.join(", ")} | ${snapshot.eventCount} events | critical ${snapshot.criticalCount} | errors ${snapshot.errorCount} | warnings ${snapshot.warningCount}`;
}

function formatEventLine(event: WindowsEventEntry) {
  const provider = event.providerName ? ` | ${event.providerName}` : "";
  return `- ${event.timeCreated} | ${event.level} | ${event.logName} | event ${event.id}${provider}`;
}

function truncate(value: string | null | undefined, maxLength = 260) {
  if (!value) {
    return "";
  }

  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

function filterEvents(
  snapshot: WindowsEventSnapshot,
  options?: {
    query?: string;
    logName?: string;
    source?: string;
    level?: string;
    limit?: number;
  }
) {
  const query = normalize(options?.query);
  const logName = normalize(options?.logName);
  const source = normalize(options?.source);
  const level = normalizeEventLevel(options?.level);
  const limit = Math.min(Math.max(options?.limit ?? 30, 1), 200);

  return snapshot.events
    .filter((event) => {
      if (logName && event.logName.toLowerCase() !== logName) {
        return false;
      }

      if (level && event.level.toLowerCase() !== level) {
        return false;
      }

      if (source && !(event.providerName?.toLowerCase().includes(source) ?? false)) {
        return false;
      }

      if (
        query &&
        !event.logName.toLowerCase().includes(query) &&
        !(event.providerName?.toLowerCase().includes(query) ?? false) &&
        !String(event.id).includes(query) &&
        !(event.message?.toLowerCase().includes(query) ?? false)
      ) {
        return false;
      }

      return true;
    })
    .slice(0, limit);
}

export function formatWindowsServices(
  status: WindowsHostStatus,
  options?: {
    query?: string;
    state?: string;
    startMode?: string;
    limit?: number;
  }
) {
  const services = getServices(status);
  const query = normalize(options?.query);
  const state = normalize(options?.state);
  const startMode = normalize(options?.startMode);
  const limit = Math.min(Math.max(options?.limit ?? 30, 1), 100);
  const filtered = services
    .filter((service) => {
      if (
        query &&
        !service.name.toLowerCase().includes(query) &&
        !service.displayName.toLowerCase().includes(query) &&
        !(service.description?.toLowerCase().includes(query) ?? false)
      ) {
        return false;
      }

      if (state && service.state.toLowerCase() !== state) {
        return false;
      }

      if (startMode && (service.startMode?.toLowerCase() || "") !== startMode) {
        return false;
      }

      return true;
    })
    .sort((left, right) => left.displayName.localeCompare(right.displayName))
    .slice(0, limit);

  const filters = [
    options?.query ? `query=${options.query}` : "",
    options?.state ? `state=${options.state}` : "",
    options?.startMode ? `startMode=${options.startMode}` : ""
  ]
    .filter(Boolean)
    .join(", ");

  const lines = [
    `Generated: ${status.generatedAt}`,
    filters ? `Windows services (${filters}):` : "Windows services:",
    ""
  ];

  if (filtered.length === 0) {
    lines.push("- No Windows services matched that filter.");
    return lines.join("\n");
  }

  for (const service of filtered) {
    const bits = [service.state, service.startMode ?? "", service.status ?? ""].filter(Boolean).join(" | ");
    lines.push(`- ${service.displayName} (${service.name})${bits ? ` | ${bits}` : ""}`);
    if (service.description) {
      lines.push(`  ${service.description}`);
    }
  }

  return lines.join("\n");
}

export function formatWindowsServiceDetails(status: WindowsHostStatus, query: string) {
  const services = getServices(status);
  const service = findServiceMatch(services, query);
  if (!service) {
    return `Generated: ${status.generatedAt}\nWindows service details:\n\n- No Windows service matched "${query}".`;
  }

  const lines = [
    `Generated: ${status.generatedAt}`,
    "Windows service details:",
    "",
    `Name: ${service.name}`,
    `Display name: ${service.displayName}`,
    `State: ${service.state}`
  ];

  if (service.startMode) {
    lines.push(`Start mode: ${service.startMode}`);
  }
  if (service.status) {
    lines.push(`Status: ${service.status}`);
  }
  if (service.processId !== null && service.processId !== undefined && service.processId !== 0) {
    lines.push(`Process ID: ${service.processId}`);
  }
  if (service.startName) {
    lines.push(`Run as: ${service.startName}`);
  }
  if (service.pathName) {
    lines.push(`Path: ${service.pathName}`);
  }
  if (service.description) {
    lines.push("");
    lines.push(service.description);
  }

  return lines.join("\n");
}

export function formatWindowsServiceIssues(
  status: WindowsHostStatus,
  options?: {
    limit?: number;
  }
) {
  const services = getServices(status);
  const limit = Math.min(Math.max(options?.limit ?? 30, 1), 100);
  const issues = services
    .filter((service) => {
      const state = service.state.toLowerCase();
      const startMode = service.startMode?.toLowerCase() || "";
      return state !== "running" && (startMode === "auto" || startMode === "automatic");
    })
    .sort((left, right) => left.displayName.localeCompare(right.displayName))
    .slice(0, limit);

  const lines = [`Generated: ${status.generatedAt}`, "Windows service issues:", ""];
  if (issues.length === 0) {
    lines.push("- No automatic Windows services appear stopped in the latest snapshot.");
    return lines.join("\n");
  }

  for (const service of issues) {
    lines.push(`- ${service.displayName} (${service.name}) | ${service.state} | ${service.startMode ?? "unknown start mode"}`);
    if (service.description) {
      lines.push(`  ${service.description}`);
    }
  }

  return lines.join("\n");
}

export function formatScheduledTasks(
  status: WindowsHostStatus,
  options?: {
    query?: string;
    state?: string;
    enabled?: boolean;
    limit?: number;
  }
) {
  const tasks = getScheduledTasks(status);
  const query = normalize(options?.query);
  const state = normalize(options?.state);
  const limit = Math.min(Math.max(options?.limit ?? 30, 1), 100);
  const filtered = tasks
    .filter((task) => {
      if (
        query &&
        !task.name.toLowerCase().includes(query) &&
        !task.path.toLowerCase().includes(query) &&
        !(task.description?.toLowerCase().includes(query) ?? false) &&
        !(task.actions?.some((action) => action.toLowerCase().includes(query)) ?? false)
      ) {
        return false;
      }

      if (state && task.state.toLowerCase() !== state) {
        return false;
      }

      if (options?.enabled !== undefined && task.enabled !== options.enabled) {
        return false;
      }

      return true;
    })
    .sort((left, right) => `${left.path}${left.name}`.localeCompare(`${right.path}${right.name}`))
    .slice(0, limit);

  const filters = [
    options?.query ? `query=${options.query}` : "",
    options?.state ? `state=${options.state}` : "",
    options?.enabled !== undefined ? `enabled=${options.enabled}` : ""
  ]
    .filter(Boolean)
    .join(", ");

  const lines = [
    `Generated: ${status.generatedAt}`,
    filters ? `Scheduled tasks (${filters}):` : "Scheduled tasks:",
    ""
  ];

  if (filtered.length === 0) {
    lines.push("- No scheduled tasks matched that filter.");
    return lines.join("\n");
  }

  for (const task of filtered) {
    lines.push(`- ${task.path}${task.name} | ${summarizeTaskHealth(task)}`);
    if (task.nextRunTime) {
      lines.push(`  Next run: ${task.nextRunTime}`);
    }
  }

  return lines.join("\n");
}

export function formatScheduledTaskDetails(status: WindowsHostStatus, query: string) {
  const tasks = getScheduledTasks(status);
  const task = findScheduledTaskMatch(tasks, query);
  if (!task) {
    return `Generated: ${status.generatedAt}\nScheduled task details:\n\n- No scheduled task matched "${query}".`;
  }

  const lines = [
    `Generated: ${status.generatedAt}`,
    "Scheduled task details:",
    "",
    `Task: ${task.path}${task.name}`,
    `State: ${task.state}`,
    `Enabled: ${task.enabled ? "yes" : "no"}`
  ];

  if (task.lastRunTime) {
    lines.push(`Last run: ${task.lastRunTime}`);
  }
  if (task.nextRunTime) {
    lines.push(`Next run: ${task.nextRunTime}`);
  }
  if (task.lastTaskResult !== null && task.lastTaskResult !== undefined) {
    lines.push(`Last task result: ${task.lastTaskResult}`);
  }
  if (task.author) {
    lines.push(`Author: ${task.author}`);
  }
  if (task.description) {
    lines.push(`Description: ${task.description}`);
  }
  if (task.actions && task.actions.length > 0) {
    lines.push("Actions:");
    for (const action of task.actions) {
      lines.push(`- ${action}`);
    }
  }
  if (task.triggers && task.triggers.length > 0) {
    lines.push("Triggers:");
    for (const trigger of task.triggers) {
      lines.push(`- ${trigger}`);
    }
  }

  return lines.join("\n");
}

export function formatFailedScheduledTasks(
  status: WindowsHostStatus,
  options?: {
    limit?: number;
  }
) {
  const tasks = getScheduledTasks(status);
  const limit = Math.min(Math.max(options?.limit ?? 30, 1), 100);
  const failed = tasks
    .filter((task) => (task.lastTaskResult ?? 0) !== 0)
    .sort((left, right) => `${left.path}${left.name}`.localeCompare(`${right.path}${right.name}`))
    .slice(0, limit);

  const lines = [`Generated: ${status.generatedAt}`, "Scheduled task failures:", ""];
  if (failed.length === 0) {
    lines.push("- No scheduled tasks with non-zero last results were found.");
    return lines.join("\n");
  }

  for (const task of failed) {
    lines.push(`- ${task.path}${task.name} | state ${task.state} | last result ${task.lastTaskResult}`);
    if (task.lastRunTime) {
      lines.push(`  Last run: ${task.lastRunTime}`);
    }
    if (task.actions && task.actions.length > 0) {
      lines.push(`  Action: ${task.actions[0]}`);
    }
  }

  return lines.join("\n");
}

export function formatListeningPorts(
  status: WindowsHostStatus,
  options?: {
    query?: string;
    protocol?: "tcp" | "udp";
    port?: number;
    limit?: number;
  }
) {
  const ports = getListeningPorts(status);
  const query = normalize(options?.query);
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 200);
  const filtered = ports
    .filter((port) => {
      if (options?.protocol && port.protocol !== options.protocol) {
        return false;
      }

      if (options?.port !== undefined && port.localPort !== options.port) {
        return false;
      }

      if (
        query &&
        !port.localAddress.toLowerCase().includes(query) &&
        !String(port.localPort).includes(query) &&
        !(port.processName?.toLowerCase().includes(query) ?? false) &&
        !(port.serviceNames?.some((serviceName) => serviceName.toLowerCase().includes(query)) ?? false)
      ) {
        return false;
      }

      return true;
    })
    .sort((left, right) => left.localPort - right.localPort || left.protocol.localeCompare(right.protocol))
    .slice(0, limit);

  const filters = [
    options?.query ? `query=${options.query}` : "",
    options?.protocol ? `protocol=${options.protocol}` : "",
    options?.port !== undefined ? `port=${options.port}` : ""
  ]
    .filter(Boolean)
    .join(", ");

  const lines = [
    `Generated: ${status.generatedAt}`,
    filters ? `Listening ports (${filters}):` : "Listening ports:",
    ""
  ];

  if (filtered.length === 0) {
    lines.push("- No listening ports matched that filter.");
    return lines.join("\n");
  }

  for (const port of filtered) {
    const bits = [
      port.protocol.toUpperCase(),
      `${port.localAddress}:${port.localPort}`,
      port.processName ?? "",
      port.serviceNames && port.serviceNames.length > 0 ? `services=${port.serviceNames.join(", ")}` : ""
    ]
      .filter(Boolean)
      .join(" | ");
    lines.push(`- ${bits}`);
  }

  return lines.join("\n");
}

export function formatWindowsEventSummary(
  status: WindowsHostStatus,
  options?: {
    logName?: string;
    source?: string;
    level?: string;
    limit?: number;
  }
) {
  const snapshot = getEvents(status);
  const events = filterEvents(snapshot, {
    logName: options?.logName,
    source: options?.source,
    level: options?.level,
    limit: options?.limit
  });
  const filters = [
    options?.logName ? `logName=${options.logName}` : "",
    options?.source ? `source=${options.source}` : "",
    options?.level ? `level=${options.level}` : ""
  ]
    .filter(Boolean)
    .join(", ");
  const lines = [
    `Generated: ${status.generatedAt}`,
    filters ? `Windows event summary (${filters}):` : "Windows event summary:",
    "",
    formatEventHeadline(snapshot),
    ""
  ];

  if (snapshot.captureError) {
    lines.push(`Capture warning: ${snapshot.captureError}`);
    lines.push("");
  }

  if (events.length === 0) {
    lines.push("- No Windows events matched that filter.");
    return lines.join("\n");
  }

  lines.push("Recent events:");
  for (const event of events) {
    lines.push(formatEventLine(event));
    if (event.message) {
      lines.push(`  ${truncate(event.message)}`);
    }
  }

  return lines.join("\n");
}

export function searchWindowsEvents(
  status: WindowsHostStatus,
  options: {
    query: string;
    logName?: string;
    level?: string;
    limit?: number;
  }
) {
  const snapshot = getEvents(status);
  const query = options.query.trim();
  if (!query) {
    return `Generated: ${status.generatedAt}\nWindows event search:\n\n- A non-empty event query is required.`;
  }

  const events = filterEvents(snapshot, {
    query,
    logName: options.logName,
    level: options.level,
    limit: options.limit
  });

  const lines = [
    `Generated: ${status.generatedAt}`,
    `Windows event search for "${query}":`,
    "",
    formatEventHeadline(snapshot),
    ""
  ];

  if (events.length === 0) {
    lines.push("- No Windows events matched that query.");
    return lines.join("\n");
  }

  for (const event of events) {
    lines.push(formatEventLine(event));
    if (event.message) {
      lines.push(`  ${truncate(event.message)}`);
    }
  }

  return lines.join("\n");
}

export function formatRecentServiceFailures(
  status: WindowsHostStatus,
  options?: {
    hours?: number;
    limit?: number;
  }
) {
  const snapshot = getEvents(status);
  const hours = Math.min(Math.max(options?.hours ?? snapshot.hours, 1), snapshot.hours);
  const limit = Math.min(Math.max(options?.limit ?? 20, 1), 100);
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  const events = snapshot.events
    .filter((event) => {
      const time = Date.parse(event.timeCreated);
      if (!Number.isFinite(time) || time < cutoff) {
        return false;
      }

      const provider = event.providerName?.toLowerCase() ?? "";
      const message = event.message?.toLowerCase() ?? "";
      return (
        provider.includes("service control manager") ||
        provider.includes("service") ||
        message.includes("service") ||
        message.includes("failed to start") ||
        message.includes("terminated unexpectedly")
      );
    })
    .slice(0, limit);

  const lines = [
    `Generated: ${status.generatedAt}`,
    `Recent service failures (last ${hours} hours):`,
    ""
  ];

  if (events.length === 0) {
    lines.push("- No recent service-related warnings or errors were found.");
    return lines.join("\n");
  }

  for (const event of events) {
    lines.push(formatEventLine(event));
    if (event.message) {
      lines.push(`  ${truncate(event.message)}`);
    }
  }

  return lines.join("\n");
}

function formatShareLine(share: SmbShareStatus) {
  const bits = [
    share.path || "no path",
    share.pathExists === true ? "path ok" : share.pathExists === false ? "path missing" : "",
    share.currentUsers !== null && share.currentUsers !== undefined ? `users ${share.currentUsers}` : "",
    share.encryptData === true ? "encrypted" : "",
    share.continuouslyAvailable === true ? "continuous" : ""
  ]
    .filter(Boolean)
    .join(" | ");

  return `- ${share.name}${bits ? ` | ${bits}` : ""}`;
}

export function formatShareStatus(
  status: WindowsHostStatus,
  options?: {
    query?: string;
    missingOnly?: boolean;
    pathMissingOnly?: boolean;
    limit?: number;
  }
) {
  const snapshot = getShares(status);
  const query = normalize(options?.query);
  const limit = Math.min(Math.max(options?.limit ?? 30, 1), 100);
  const shares = snapshot.shares
    .filter((share) => {
      if ((options?.pathMissingOnly || options?.missingOnly) && share.pathExists !== false) {
        return false;
      }

      if (
        query &&
        !share.name.toLowerCase().includes(query) &&
        !(share.path?.toLowerCase().includes(query) ?? false) &&
        !(share.description?.toLowerCase().includes(query) ?? false)
      ) {
        return false;
      }

      return true;
    })
    .slice(0, limit);

  const filters = [
    options?.query ? `query=${options.query}` : "",
    options?.pathMissingOnly || options?.missingOnly ? "missingOnly=true" : ""
  ]
    .filter(Boolean)
    .join(", ");
  const lines = [
    `Generated: ${status.generatedAt}`,
    filters ? `SMB share status (${filters}):` : "SMB share status:",
    "",
    `Shares: ${snapshot.shareCount} | paths missing: ${snapshot.pathMissingCount}`,
    ""
  ];

  if (snapshot.captureError) {
    lines.push(`Capture warning: ${snapshot.captureError}`);
    lines.push("");
  }

  if (shares.length === 0) {
    lines.push("- No SMB shares matched that filter.");
    return lines.join("\n");
  }

  for (const share of shares) {
    lines.push(formatShareLine(share));
    if (share.description) {
      lines.push(`  ${share.description}`);
    }
  }

  return lines.join("\n");
}
