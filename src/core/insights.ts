import { readRepoStatusSnapshot } from "./repos.js";
import type { ToolProfile } from "./server-meta.js";
import { formatSnapshotHeadlineForProfile, readSnapshotOverview } from "./snapshots.js";
import { readWindowsHostStatus } from "./host.js";

type InsightDomain =
  | "general"
  | "docker"
  | "plex"
  | "backup"
  | "storage"
  | "network"
  | "service"
  | "task"
  | "event"
  | "share"
  | "home-assistant"
  | "repo";

function normalize(value: string | undefined) {
  return value?.trim().toLowerCase();
}

function detectDomain(query?: string): InsightDomain {
  const normalized = normalize(query);
  if (!normalized) {
    return "general";
  }

  if (/docker|container|compose|image|volume|network\b/.test(normalized)) {
    return "docker";
  }
  if (/plex|show|movie|episode|album|artist|track/.test(normalized)) {
    return "plex";
  }
  if (/backup|archive|restore|veeam|robocopy/.test(normalized)) {
    return "backup";
  }
  if (/disk|storage|space|folder|drive|volume/.test(normalized)) {
    return "storage";
  }
  if (/tailscale|dns|endpoint|network|port|exposure|internet/.test(normalized)) {
    return "network";
  }
  if (/service|startup|daemon/.test(normalized)) {
    return "service";
  }
  if (/task|scheduler|scheduled/.test(normalized)) {
    return "task";
  }
  if (/event|viewer|log/.test(normalized)) {
    return "event";
  }
  if (/share|smb|nas|unc/.test(normalized)) {
    return "share";
  }
  if (/home assistant|hass|entity|automation|zigbee|zwave/.test(normalized)) {
    return "home-assistant";
  }
  if (/repo|git|branch|commit/.test(normalized)) {
    return "repo";
  }

  return "general";
}

function getCommandsForDomain(domain: InsightDomain, profile: ToolProfile) {
  const commands: string[] = [];

  if (domain === "general") {
    commands.push("summarize_system_state", "get_daily_digest", "get_snapshot_recommendations");
    if (profile === "full") {
      commands.push("get_attention_report", "find_host");
    }
    return commands;
  }

  if (domain === "docker") {
    commands.push("get_docker_triage_report", "get_docker_issues", "get_docker_restart_report");
    return commands;
  }

  if (domain === "plex") {
    commands.push("get_plex_status", "get_plex_server_activity", "find_plex");
    return commands;
  }

  if (profile !== "full") {
    return commands;
  }

  if (domain === "backup") {
    commands.push("get_backup_status", "get_backup_target_health", "find_failed_backups");
  } else if (domain === "storage") {
    commands.push("get_storage_health", "find_low_space_locations", "list_large_folders");
  } else if (domain === "network") {
    commands.push("get_internet_health", "check_endpoint_health", "get_public_exposure_summary");
  } else if (domain === "service") {
    commands.push("get_windows_service_issues", "get_windows_event_summary", "find_recent_service_failures");
  } else if (domain === "task") {
    commands.push("find_failed_tasks", "get_scheduled_task_details", "get_backup_status");
  } else if (domain === "event") {
    commands.push("get_windows_event_summary", "search_windows_events", "find_recent_service_failures");
  } else if (domain === "share") {
    commands.push("get_share_status", "get_backup_target_health", "get_storage_health");
  } else if (domain === "home-assistant") {
    commands.push("get_home_assistant_status", "get_attention_report");
  } else if (domain === "repo") {
    commands.push("get_repo_status", "get_recent_repo_activity", "list_local_repos");
  }

  return commands;
}

export async function formatRecommendNextChecks(profile: ToolProfile, query?: string) {
  const domain = detectDomain(query);
  const snapshotOverview = await readSnapshotOverview();
  const hostStatus = await readWindowsHostStatus();
  const lines = [
    query ? `Recommended next checks for "${query}":` : "Recommended next checks:",
    "",
    formatSnapshotHeadlineForProfile(snapshotOverview, profile),
    ""
  ];

  if (snapshotOverview.overallFreshness !== "fresh") {
    lines.push("- Start with get_snapshot_recommendations because the underlying data is not fully fresh.");
  }

  if (profile !== "full" && !["general", "docker", "plex"].includes(domain)) {
    lines.push(`- The ${domain} domain is only available in the full tool profile.`);
    lines.push("- Use find_home to stay inside the current public-safe surface, or switch the HTTP profile if you need deeper host visibility.");
    return lines.join("\n");
  }

  if (domain === "docker" && (hostStatus.docker?.problemCount ?? 0) > 0) {
    lines.push(`- Docker currently shows ${hostStatus.docker?.problemCount ?? 0} problems, so start with get_docker_triage_report.`);
  }
  if (domain === "plex" && !hostStatus.plex?.reachable) {
    lines.push("- Plex is not reachable in the latest host snapshot, so confirm get_plex_status before library-specific queries.");
  }
  if (domain === "backup" && (hostStatus.backups?.failureCount ?? 0) > 0) {
    lines.push(`- Backup failures were detected (${hostStatus.backups?.failureCount ?? 0}), so check get_backup_status first.`);
  }
  if (domain === "storage") {
    const lowSpaceCount = (hostStatus.resources?.disks ?? []).filter(
      (disk) => (disk.percentFree ?? 100) <= (hostStatus.storage?.lowSpaceThresholdPercent ?? 15)
    ).length;
    if (lowSpaceCount > 0) {
      lines.push(`- ${lowSpaceCount} disks are below the free-space threshold, so start with find_low_space_locations.`);
    }
  }
  if (domain === "network") {
    const unhealthy = (hostStatus.endpointChecks ?? []).filter((endpoint) => !endpoint.healthy).length;
    if (unhealthy > 0) {
      lines.push(`- ${unhealthy} endpoint checks are unhealthy, so start with get_internet_health or check_endpoint_health.`);
    }
  }
  if (domain === "service" || domain === "event") {
    const eventErrors = hostStatus.events?.errorCount ?? 0;
    const eventCritical = hostStatus.events?.criticalCount ?? 0;
    if (eventErrors + eventCritical > 0) {
      lines.push(`- Recent Windows events include ${eventCritical} critical and ${eventErrors} error entries, so start with get_windows_event_summary.`);
    }
  }
  if (domain === "home-assistant" && hostStatus.homeAssistant?.configured && !hostStatus.homeAssistant.reachable) {
    lines.push("- Home Assistant is configured but not reachable in the latest snapshot, so confirm get_home_assistant_status first.");
  }

  const commands = getCommandsForDomain(domain, profile);
  if (commands.length === 0) {
    lines.push("- No profile-appropriate follow-up commands were found for that domain.");
    return lines.join("\n");
  }

  lines.push("");
  lines.push("Next commands:");
  for (const command of commands) {
    lines.push(`- ${command}`);
  }

  return lines.join("\n");
}

export async function formatIssueExplanation(profile: ToolProfile, query: string) {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return "Issue explanation:\n\n- A non-empty issue query is required.";
  }

  const domain = detectDomain(trimmedQuery);
  const snapshotOverview = await readSnapshotOverview();
  const hostStatus = await readWindowsHostStatus();
  const repoSnapshot = profile === "full" ? await readRepoStatusSnapshot().catch(() => null) : null;
  const lines = [
    `Issue explanation for "${trimmedQuery}":`,
    "",
    `Likely domain: ${domain}`,
    formatSnapshotHeadlineForProfile(snapshotOverview, profile),
    "",
    "Current signals:"
  ];

  if (snapshotOverview.overallFreshness !== "fresh") {
    lines.push(`- Snapshot freshness is ${snapshotOverview.overallFreshness}, which can affect every other reading.`);
  }

  if (profile !== "full" && !["general", "docker", "plex"].includes(domain)) {
    lines.push(`- The ${domain} domain is only available in the full tool profile.`);
    lines.push("- This public-safe surface can still help with Docker, Plex, and broad system freshness, but deeper host analysis needs the full profile.");
    lines.push("");
    lines.push("Recommended next commands:");
    lines.push("- summarize_system_state");
    lines.push("- get_daily_digest");
    lines.push("- get_snapshot_recommendations");
    if (domain === "network") {
      lines.push("- find_home");
    }
    return lines.join("\n");
  }

  if (domain === "docker") {
    lines.push(`- Docker problems: ${hostStatus.docker?.problemCount ?? 0}`);
    lines.push(`- Running containers: ${hostStatus.docker?.runningCount ?? 0}`);
    lines.push(`- Unhealthy containers: ${hostStatus.docker?.unhealthyCount ?? 0}`);
  } else if (domain === "plex") {
    lines.push(`- Plex reachable: ${hostStatus.plex?.reachable ? "yes" : "no"}`);
    lines.push(`- Active sessions: ${hostStatus.plex && hostStatus.plex.reachable ? hostStatus.components.find((item) => item.name === "plex")?.status ?? "unknown" : "unknown"}`);
    lines.push(`- Indexed items: ${hostStatus.plex?.indexedItemCount ?? 0}`);
  } else if (domain === "backup") {
    lines.push(`- Backup warnings: ${hostStatus.backups?.warningCount ?? 0}`);
    lines.push(`- Backup failures: ${hostStatus.backups?.failureCount ?? 0}`);
    lines.push(`- Backup targets with issues: ${hostStatus.backupTargets?.targets.filter((target) => target.issue !== "none").length ?? 0}`);
  } else if (domain === "storage") {
    const lowSpaceDisks = (hostStatus.resources?.disks ?? []).filter(
      (disk) => (disk.percentFree ?? 100) <= (hostStatus.storage?.lowSpaceThresholdPercent ?? 15)
    );
    lines.push(`- Low-space disks: ${lowSpaceDisks.length}`);
    if (lowSpaceDisks.length > 0) {
      lines.push(`- Worst disk: ${lowSpaceDisks[0].name} at ${lowSpaceDisks[0].percentFree?.toFixed(1) ?? "unknown"}% free`);
    }
  } else if (domain === "network") {
    const unhealthy = (hostStatus.endpointChecks ?? []).filter((endpoint) => !endpoint.healthy);
    lines.push(`- Unhealthy endpoint checks: ${unhealthy.length}`);
    lines.push(`- Tailscale backend state: ${hostStatus.tailscale?.backendState ?? "unknown"}`);
    lines.push(`- Funnel enabled: ${hostStatus.tailscale?.funnelEnabled ? "yes" : "no"}`);
  } else if (domain === "service") {
    const serviceIssues = (hostStatus.services ?? []).filter((service) => {
      const startMode = service.startMode?.toLowerCase() ?? "";
      return service.state.toLowerCase() !== "running" && (startMode === "auto" || startMode === "automatic");
    });
    lines.push(`- Stopped automatic services: ${serviceIssues.length}`);
    lines.push(`- Recent event errors: ${(hostStatus.events?.errorCount ?? 0) + (hostStatus.events?.criticalCount ?? 0)}`);
  } else if (domain === "task") {
    const failedTasks = (hostStatus.scheduledTasks ?? []).filter((task) => (task.lastTaskResult ?? 0) !== 0);
    lines.push(`- Failed scheduled tasks: ${failedTasks.length}`);
    lines.push(`- Backup-related tasks with issues: ${(hostStatus.backups?.tasks.filter((task) => task.issue !== "none").length ?? 0)}`);
  } else if (domain === "event") {
    lines.push(`- Critical events: ${hostStatus.events?.criticalCount ?? 0}`);
    lines.push(`- Error events: ${hostStatus.events?.errorCount ?? 0}`);
    lines.push(`- Warning events: ${hostStatus.events?.warningCount ?? 0}`);
  } else if (domain === "share") {
    lines.push(`- Shares with missing paths: ${hostStatus.shares?.pathMissingCount ?? 0}`);
    lines.push(`- Backup targets on network paths: ${hostStatus.backupTargets?.targets.filter((target) => target.kind === "network").length ?? 0}`);
  } else if (domain === "home-assistant") {
    lines.push(`- Home Assistant configured: ${hostStatus.homeAssistant?.configured ? "yes" : "no"}`);
    lines.push(`- Home Assistant reachable: ${hostStatus.homeAssistant?.reachable ? "yes" : "no"}`);
    lines.push(`- Unavailable entities: ${hostStatus.homeAssistant?.unavailableCount ?? 0}`);
  } else if (domain === "repo") {
    lines.push(`- Dirty repos: ${repoSnapshot?.repos.filter((repo) => repo.dirty).length ?? 0}`);
    lines.push(`- Indexed repos: ${repoSnapshot?.repoCount ?? 0}`);
  } else {
    lines.push(`- Docker problems: ${hostStatus.docker?.problemCount ?? 0}`);
    lines.push(`- Plex reachable: ${hostStatus.plex?.reachable ? "yes" : "no"}`);
    lines.push(`- Backup issues: ${(hostStatus.backups?.warningCount ?? 0) + (hostStatus.backups?.failureCount ?? 0)}`);
    lines.push(`- Unhealthy endpoints: ${(hostStatus.endpointChecks ?? []).filter((endpoint) => !endpoint.healthy).length}`);
  }

  lines.push("");
  lines.push("Recommended next commands:");
  const commands = getCommandsForDomain(domain, profile);
  if (commands.length === 0) {
    lines.push("- No profile-appropriate follow-up commands were found for that domain.");
    return lines.join("\n");
  }
  for (const command of commands) {
    lines.push(`- ${command}`);
  }

  return lines.join("\n");
}
