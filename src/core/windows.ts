import type {
  ListeningPortStatus,
  ScheduledTaskStatus,
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
