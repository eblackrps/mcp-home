import { formatBackupFind, NO_BACKUP_FIND_RESULTS_MESSAGE } from "./backups.js";
import { formatFileSearchResults, readFileCatalogSnapshot, searchFiles } from "./files.js";
import { formatHomelabStatus, readHomelabStatus } from "./homelab.js";
import { formatDockerFind, formatHostFind, NO_HOST_FIND_RESULTS_MESSAGE, readWindowsHostStatus } from "./host.js";
import { formatNetworkFind, NO_NETWORK_FIND_RESULTS_MESSAGE } from "./network.js";
import { loadAllNotes, readNoteBySlug, searchNotes } from "./notes.js";
import { findPlex, formatPlexFind, readPlexLibraryIndex } from "./plex.js";
import { readPlexActivitySnapshot } from "./plex-activity.js";
import { formatLocalRepos, readRepoStatusSnapshot } from "./repos.js";
import { formatStorageFind, NO_STORAGE_FIND_RESULTS_MESSAGE } from "./storage.js";
import { filterSnapshotOverviewForProfile, formatSnapshotHeadlineForProfile, readSnapshotOverview } from "./snapshots.js";
import type { ToolProfile } from "./server-meta.js";

function normalize(value: string | undefined) {
  return value?.trim().toLowerCase();
}

function hasPlexResults(result: {
  titleMatches: unknown[];
  episodeMatches: unknown[];
  searchMatches: unknown[];
}) {
  return result.titleMatches.length > 0 || result.episodeMatches.length > 0 || result.searchMatches.length > 0;
}

function truncate(value: string, maxLength = 400) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

export async function formatNotesFind(
  notesDir: string,
  query: string,
  limit = 5
) {
  const normalized = normalize(query);
  if (!normalized) {
    return "Notes finder:\n\n- A non-empty note query is required.";
  }

  const notes = await loadAllNotes(notesDir);
  const exact = notes.find(
    (note) => note.slug.toLowerCase() === normalized || note.title.trim().toLowerCase() === normalized
  );
  const results = (await searchNotes(notesDir, query)).slice(0, Math.min(Math.max(limit, 1), 10));
  const lines = [`Notes finder for "${query}":`, ""];

  if (exact) {
    const note = await readNoteBySlug(notesDir, exact.slug);
    lines.push(`Exact note: ${note.title} (${note.slug})`);
    lines.push(`Tags: ${note.tags.length > 0 ? note.tags.join(", ") : "none"}`);
    lines.push("");
    lines.push(truncate(note.body, 500));
    lines.push("");
  }

  if (results.length === 0 && !exact) {
    lines.push("- No notes matched that query.");
    return lines.join("\n");
  }

  if (results.length > 0) {
    lines.push("Matches:");
    for (const result of results) {
      lines.push(`- ${result.slug} | ${result.title}${result.tags.length > 0 ? ` | tags: ${result.tags.join(", ")}` : ""}`);
      lines.push(`  ${truncate(result.preview, 220)}`);
    }
  }

  return lines.join("\n");
}

export async function formatOperationsDashboard(notesDir: string) {
  return formatOperationsDashboardForProfile(notesDir, "full");
}

export async function formatAttentionReport(profile: ToolProfile) {
  const [snapshotOverview, hostStatus] = await Promise.all([readSnapshotOverview(), readWindowsHostStatus()]);
  const repoSnapshot = profile === "full" ? await readRepoStatusSnapshot().catch(() => null) : null;
  const staleSnapshots = snapshotOverview.files.filter((file) => file.freshness === "stale" || file.freshness === "missing");
  const lateSnapshots = snapshotOverview.files.filter((file) => file.freshness === "late");
  const serviceIssues = (hostStatus.services ?? []).filter((service) => {
    const startMode = service.startMode?.toLowerCase() ?? "";
    return service.state.toLowerCase() !== "running" && (startMode === "auto" || startMode === "automatic");
  });
  const failedTasks = (hostStatus.scheduledTasks ?? []).filter((task) => (task.lastTaskResult ?? 0) !== 0);
  const dockerProblems = hostStatus.docker?.problemCount ?? 0;
  const lowSpaceDisks = profile === "full"
    ? (hostStatus.resources?.disks ?? []).filter((disk) => (disk.percentFree ?? 100) <= (hostStatus.storage?.lowSpaceThresholdPercent ?? 15))
    : [];
  const backupIssues = profile === "full" ? (hostStatus.backups?.tasks ?? []).filter((task) => task.issue !== "none") : [];
  const backupTargetIssues = profile === "full" ? (hostStatus.backupTargets?.targets ?? []).filter((target) => target.issue !== "none") : [];
  const eventIssues = profile === "full" ? (hostStatus.events?.criticalCount ?? 0) + (hostStatus.events?.errorCount ?? 0) : 0;
  const shareIssues = profile === "full" ? hostStatus.shares?.pathMissingCount ?? 0 : 0;
  const homeAssistantIssues = profile === "full" && hostStatus.homeAssistant?.configured && !hostStatus.homeAssistant.reachable ? 1 : 0;
  const unhealthyEndpoints = profile === "full" ? (hostStatus.endpointChecks ?? []).filter((endpoint) => !endpoint.healthy) : [];
  const dirtyRepos = repoSnapshot ? repoSnapshot.repos.filter((repo) => repo.dirty) : [];
  const lines = ["Attention report:", "", formatSnapshotHeadlineForProfile(snapshotOverview, "full"), ""];

  if (
    staleSnapshots.length === 0 &&
    lateSnapshots.length === 0 &&
    dockerProblems === 0 &&
    serviceIssues.length === 0 &&
    failedTasks.length === 0 &&
    lowSpaceDisks.length === 0 &&
    backupIssues.length === 0 &&
    backupTargetIssues.length === 0 &&
    eventIssues === 0 &&
    shareIssues === 0 &&
    homeAssistantIssues === 0 &&
    unhealthyEndpoints.length === 0 &&
    dirtyRepos.length === 0
  ) {
    lines.push("- No urgent attention items were found in the latest snapshots.");
    return lines.join("\n");
  }

  if (staleSnapshots.length > 0) {
    lines.push("Stale snapshots:");
    for (const snapshot of staleSnapshots) {
      lines.push(`- ${snapshot.label} | ${snapshot.freshness}`);
    }
    lines.push("");
  } else if (lateSnapshots.length > 0) {
    lines.push("Late snapshots:");
    for (const snapshot of lateSnapshots) {
      lines.push(`- ${snapshot.label} | ${snapshot.freshness}`);
    }
    lines.push("");
  }

  if (dockerProblems > 0) {
    lines.push(`Docker problems: ${dockerProblems}`);
    lines.push("- Review get_docker_issues or get_docker_triage_report.");
    lines.push("");
  }

  if (serviceIssues.length > 0) {
    lines.push(`Stopped automatic services: ${serviceIssues.length}`);
    for (const service of serviceIssues.slice(0, 10)) {
      lines.push(`- ${service.displayName} (${service.name}) | ${service.state}`);
    }
    lines.push("");
  }

  if (failedTasks.length > 0) {
    lines.push(`Failed scheduled tasks: ${failedTasks.length}`);
    for (const task of failedTasks.slice(0, 10)) {
      lines.push(`- ${task.path}${task.name} | last result ${task.lastTaskResult}`);
    }
    lines.push("");
  }

  if (lowSpaceDisks.length > 0) {
    lines.push(`Low-space disks: ${lowSpaceDisks.length}`);
    for (const disk of lowSpaceDisks.slice(0, 10)) {
      lines.push(`- ${disk.name}${disk.volumeName ? ` (${disk.volumeName})` : ""} | ${disk.percentFree?.toFixed(1) ?? "unknown"}% free`);
    }
    lines.push("");
  }

  if (backupIssues.length > 0) {
    lines.push(`Backup issues: ${backupIssues.length}`);
    for (const task of backupIssues.slice(0, 10)) {
      lines.push(`- ${task.displayPath} | ${task.issue} | ${task.reasons.join("; ") || "issue detected"}`);
    }
    lines.push("");
  }

  if (backupTargetIssues.length > 0) {
    lines.push(`Backup target issues: ${backupTargetIssues.length}`);
    for (const target of backupTargetIssues.slice(0, 10)) {
      lines.push(`- ${target.target} | ${target.issue} | ${target.reasons.join("; ") || "issue detected"}`);
    }
    lines.push("");
  }

  if (eventIssues > 0) {
    lines.push(`Windows event errors: ${eventIssues}`);
    lines.push(`- Critical: ${hostStatus.events?.criticalCount ?? 0} | Error: ${hostStatus.events?.errorCount ?? 0}`);
    lines.push("");
  }

  if (shareIssues > 0) {
    lines.push(`Shares with missing paths: ${shareIssues}`);
    for (const share of (hostStatus.shares?.shares ?? []).filter((item) => item.pathExists === false).slice(0, 10)) {
      lines.push(`- ${share.name}${share.path ? ` | ${share.path}` : ""}`);
    }
    lines.push("");
  }

  if (homeAssistantIssues > 0) {
    lines.push("Home Assistant: configured but unreachable");
    if (hostStatus.homeAssistant?.captureError) {
      lines.push(`- ${hostStatus.homeAssistant.captureError}`);
    }
    lines.push("");
  }

  if (unhealthyEndpoints.length > 0) {
    lines.push(`Unhealthy endpoint checks: ${unhealthyEndpoints.length}`);
    for (const endpoint of unhealthyEndpoints.slice(0, 10)) {
      lines.push(`- ${endpoint.name} | ${endpoint.error || endpoint.statusCode || "unhealthy"}`);
    }
    lines.push("");
  }

  if (dirtyRepos.length > 0) {
    lines.push(`Dirty repos: ${dirtyRepos.length}`);
    for (const repo of dirtyRepos.slice(0, 10)) {
      lines.push(`- ${repo.name} | staged ${repo.stagedCount} | modified ${repo.modifiedCount} | untracked ${repo.untrackedCount}`);
    }
    lines.push("");
  }

  lines.push("Recommended next checks:");
  if (staleSnapshots.length > 0 || lateSnapshots.length > 0) {
    lines.push('- Run "npm run refresh:host" if the data looks old, and use get_snapshot_recommendations if it stays stale.');
  }
  if (serviceIssues.length > 0) {
    lines.push("- Use get_windows_service_issues or get_windows_service_details for the affected services.");
  }
  if (failedTasks.length > 0) {
    lines.push("- Use find_failed_tasks or get_scheduled_task_details to inspect the task failures.");
  }
  if (lowSpaceDisks.length > 0) {
    lines.push("- Use get_storage_health or find_low_space_locations to inspect disk pressure and large folders.");
  }
  if (backupIssues.length > 0) {
    lines.push("- Use get_backup_status or find_failed_backups to inspect backup drift or failures.");
  }
  if (backupTargetIssues.length > 0) {
    lines.push("- Use get_backup_target_health to inspect destination reachability and free-space issues.");
  }
  if (eventIssues > 0) {
    lines.push("- Use get_windows_event_summary or search_windows_events to inspect recent event log errors.");
  }
  if (shareIssues > 0) {
    lines.push("- Use get_share_status to inspect missing or misconfigured SMB share paths.");
  }
  if (homeAssistantIssues > 0) {
    lines.push("- Use get_home_assistant_status to inspect the Home Assistant connection and unavailable entities.");
  }
  if (unhealthyEndpoints.length > 0) {
    lines.push("- Use check_endpoint_health or get_public_exposure_summary to inspect network reachability.");
  }
  if (dirtyRepos.length > 0) {
    lines.push("- Use list_local_repos or get_repo_status to review repo changes.");
  }
  if (dockerProblems > 0) {
    lines.push("- Use get_docker_issues or get_docker_restart_report to inspect Docker failures.");
  }

  return lines.join("\n");
}

export async function formatOperationsDashboardForProfile(notesDir: string, profile: ToolProfile) {
  const checkedAt = new Date().toISOString();
  const snapshotOverview = await readSnapshotOverview();
  const visibleSnapshotOverview = filterSnapshotOverviewForProfile(snapshotOverview, profile);
  const [hostResult, activityResult, notesResult, homelabResult, fileResult, repoResult] = await Promise.allSettled([
    readWindowsHostStatus(),
    readPlexActivitySnapshot(),
    loadAllNotes(notesDir),
    readHomelabStatus(),
    readFileCatalogSnapshot(),
    readRepoStatusSnapshot()
  ]);

  const lines = [
    `Checked: ${checkedAt}`,
    formatSnapshotHeadlineForProfile(snapshotOverview, profile),
    ""
  ];

  if (snapshotOverview.scheduler.installed) {
    const schedulerBits = [
      snapshotOverview.scheduler.state ? `state ${snapshotOverview.scheduler.state}` : "",
      snapshotOverview.scheduler.intervalMinutes ? `every ${snapshotOverview.scheduler.intervalMinutes} minutes` : "",
      snapshotOverview.scheduler.nextRunTime ? `next ${snapshotOverview.scheduler.nextRunTime}` : "",
      snapshotOverview.scheduler.lastRunTime ? `last ${snapshotOverview.scheduler.lastRunTime}` : ""
    ]
      .filter(Boolean)
      .join(" | ");
    const schedulerLabel = profile === "full" ? snapshotOverview.scheduler.taskName : "Automatic refresh";
    lines.push(`Scheduler: ${schedulerLabel}${schedulerBits ? ` | ${schedulerBits}` : ""}`);
  } else {
    lines.push('Scheduler: not installed. Run "npm run schedule:host-refresh" on the Windows host for automatic refreshes.');
  }

  lines.push("");

  if (hostResult.status === "fulfilled") {
    const host = hostResult.value;
    if (profile === "full") {
      lines.push(`Host: ${host.host.computerName} | ${host.summary}`);
      if (host.resources) {
        lines.push(
          `Host resources: CPU ${host.resources.cpu.loadPercent ?? "unknown"}% | RAM ${Math.round(host.resources.memory.percentUsed)}% used | ${host.resources.disks.length} disks | ${host.resources.network.adapterCount} adapters`
        );
      }
      if (host.storage) {
        const lowSpaceDisks = (host.resources?.disks ?? []).filter(
        (disk) => (disk.percentFree ?? 100) <= host.storage!.lowSpaceThresholdPercent
        );
        lines.push(
        `Storage: ${host.storage.scannedFolders.length} scanned folders | ${lowSpaceDisks.length} low-space disks at or below ${host.storage.lowSpaceThresholdPercent}% free`
        );
      }
      if (host.backups) {
        lines.push(
        `Backups: ${host.backups.taskCount} tasks | ${host.backups.failureCount} failures | ${host.backups.warningCount} warnings`
        );
      }
      if (host.backupTargets) {
        lines.push(
        `Backup targets: ${host.backupTargets.targetCount} targets | ${host.backupTargets.failureCount} failures | ${host.backupTargets.warningCount} warnings`
        );
      }
      if (host.events) {
        lines.push(
        `Windows events: ${host.events.eventCount} recent entries | critical ${host.events.criticalCount} | errors ${host.events.errorCount} | warnings ${host.events.warningCount}`
        );
      }
      if (host.shares) {
        lines.push(`SMB shares: ${host.shares.shareCount} | missing paths ${host.shares.pathMissingCount}`);
      }
      if (host.endpointChecks) {
        const unhealthyEndpoints = host.endpointChecks.filter((endpoint) => !endpoint.healthy).length;
        lines.push(`Endpoints: ${host.endpointChecks.length} checks | ${unhealthyEndpoints} unhealthy`);
      }
      if (host.tailscale) {
        lines.push(
        `Tailscale: ${host.tailscale.backendState || "unknown"} | funnel ${host.tailscale.funnelEnabled ? "on" : "off"} | peers ${host.tailscale.peerCount ?? 0}`
        );
      }
      if (host.homeAssistant?.configured) {
        lines.push(
        `Home Assistant: ${host.homeAssistant.reachable ? "reachable" : "unreachable"} | unavailable entities ${host.homeAssistant.unavailableCount ?? 0}`
        );
      }
    }
    if (host.docker) {
      lines.push(
        `Docker: ${host.docker.runningCount} running | ${host.docker.problemCount} problems | ${host.docker.imageCount} images | ${host.docker.networkCount} networks | ${host.docker.volumes.length} volumes`
      );
    }
    if (host.plex) {
      lines.push(
        `Plex: ${host.plex.reachable ? "reachable" : "unreachable"} | ${host.plex.indexedItemCount ?? 0} indexed items | ${host.plex.sectionCount ?? 0} sections`
      );
    }
  } else {
    lines.push(`Host: unavailable | ${hostResult.reason instanceof Error ? hostResult.reason.message : String(hostResult.reason)}`);
  }

  if (activityResult.status === "fulfilled") {
    const activity = activityResult.value;
    lines.push(
      `Plex activity: ${activity.activeSessions.length} now playing | ${activity.continueWatching.length} continue watching | ${activity.onDeck.length} on deck | ${activity.recentlyWatched.length} recently watched`
    );
  } else {
    lines.push(
      `Plex activity: unavailable | ${activityResult.reason instanceof Error ? activityResult.reason.message : String(activityResult.reason)}`
    );
  }

  if (profile === "full") {
    if (notesResult.status === "fulfilled") {
      lines.push(`Notes: ${notesResult.value.length} available`);
    } else {
      lines.push(`Notes: unavailable | ${notesResult.reason instanceof Error ? notesResult.reason.message : String(notesResult.reason)}`);
    }

    if (homelabResult.status === "fulfilled") {
      lines.push(`Homelab: ${homelabResult.value.summary}`);
    } else {
      lines.push(
        `Homelab: unavailable | ${homelabResult.reason instanceof Error ? homelabResult.reason.message : String(homelabResult.reason)}`
      );
    }

    if (fileResult.status === "fulfilled") {
      lines.push(`Files: ${fileResult.value.indexedFileCount} indexed across ${fileResult.value.roots.length} roots`);
    } else {
      lines.push(`Files: unavailable | ${fileResult.reason instanceof Error ? fileResult.reason.message : String(fileResult.reason)}`);
    }

    if (repoResult.status === "fulfilled") {
      const dirtyRepos = repoResult.value.repos.filter((repo) => repo.dirty).length;
      lines.push(`Repos: ${repoResult.value.repoCount} indexed | ${dirtyRepos} dirty`);
    } else {
      lines.push(`Repos: unavailable | ${repoResult.reason instanceof Error ? repoResult.reason.message : String(repoResult.reason)}`);
    }
  }

  const actions: string[] = [];
  if (visibleSnapshotOverview.overallFreshness !== "fresh") {
    actions.push('Refresh snapshots with "npm run refresh:host" if these answers look old.');
    actions.push("Use get_snapshot_recommendations to see the likely cause of the stale data.");
  }
  if (!snapshotOverview.scheduler.installed) {
    actions.push('Install the Windows scheduled refresh task with "npm run schedule:host-refresh".');
  }
  if (hostResult.status === "fulfilled" && (hostResult.value.docker?.problemCount ?? 0) > 0) {
    actions.push("Review Docker issues with get_docker_issues or get_docker_restart_report.");
  }
  if (
    profile === "full" &&
    hostResult.status === "fulfilled" &&
    ((hostResult.value.backups?.failureCount ?? 0) > 0 || (hostResult.value.backups?.warningCount ?? 0) > 0)
  ) {
    actions.push("Review backup drift with get_backup_status or find_failed_backups.");
  }
  if (
    profile === "full" &&
    hostResult.status === "fulfilled" &&
    ((hostResult.value.backupTargets?.failureCount ?? 0) > 0 || (hostResult.value.backupTargets?.warningCount ?? 0) > 0)
  ) {
    actions.push("Review backup destination health with get_backup_target_health.");
  }
  if (
    profile === "full" &&
    hostResult.status === "fulfilled" &&
    (((hostResult.value.events?.criticalCount ?? 0) + (hostResult.value.events?.errorCount ?? 0)) > 0)
  ) {
    actions.push("Review recent event log errors with get_windows_event_summary.");
  }
  if (
    profile === "full" &&
    hostResult.status === "fulfilled" &&
    ((hostResult.value.shares?.pathMissingCount ?? 0) > 0)
  ) {
    actions.push("Review SMB path issues with get_share_status.");
  }
  if (
    profile === "full" &&
    hostResult.status === "fulfilled" &&
    hostResult.value.homeAssistant?.configured &&
    !hostResult.value.homeAssistant.reachable
  ) {
    actions.push("Review Home Assistant connectivity with get_home_assistant_status.");
  }
  if (
    profile === "full" &&
    hostResult.status === "fulfilled" &&
    (hostResult.value.endpointChecks?.some((endpoint) => !endpoint.healthy) ?? false)
  ) {
    actions.push("Review network reachability with check_endpoint_health.");
  }
  if (profile === "full" && repoResult.status === "fulfilled" && repoResult.value.repos.some((repo) => repo.dirty)) {
    actions.push("Use list_local_repos or get_repo_status to review dirty repositories.");
  }

  if (actions.length > 0) {
    lines.push("");
    lines.push("Recommended next actions:");
    for (const action of actions) {
      lines.push(`- ${action}`);
    }
  }

  return lines.join("\n");
}

export async function formatHomeFind(
  notesDir: string,
  options: {
    query: string;
    area?: "auto" | "docker" | "plex" | "notes" | "homelab" | "host" | "files" | "repos" | "storage" | "backup" | "network" | "assistant";
    limit?: number;
    profile?: ToolProfile;
  }
) {
  const query = options.query.trim();
  const area = options.area ?? "auto";
  const profile = options.profile ?? "full";
  const limit = Math.min(Math.max(options.limit ?? 5, 1), 10);
  const notesAllowed = profile === "full";
  const homelabAllowed = profile === "full";
  const hostAllowed = profile === "full";
  const fileAllowed = profile === "full";
  const repoAllowed = profile === "full";

  if (!query) {
    return "Home finder:\n\n- A non-empty search query is required.";
  }

  const snapshotOverview = await readSnapshotOverview();
  const lines = [
    `Home finder for "${query}"${area !== "auto" ? ` (${area})` : ""}:`,
    formatSnapshotHeadlineForProfile(snapshotOverview, profile),
    ""
  ];

  if (area === "docker") {
    const status = await readWindowsHostStatus();
    lines.push(formatDockerFind(status, { query, limit }));
    return lines.join("\n");
  }

  if (area === "host") {
    if (!hostAllowed) {
      lines.push('- Host search is not available in the current public-safe tool profile.');
      return lines.join("\n");
    }
    const status = await readWindowsHostStatus();
    lines.push(formatHostFind(status, { query, limit }));
    return lines.join("\n");
  }

  if (area === "storage") {
    if (!hostAllowed) {
      lines.push('- Storage search is not available in the current public-safe tool profile.');
      return lines.join("\n");
    }
    const status = await readWindowsHostStatus();
    lines.push(formatStorageFind(status, { query, limit }));
    return lines.join("\n");
  }

  if (area === "backup") {
    if (!hostAllowed) {
      lines.push('- Backup search is not available in the current public-safe tool profile.');
      return lines.join("\n");
    }
    const status = await readWindowsHostStatus();
    lines.push(formatBackupFind(status, { query, limit }));
    return lines.join("\n");
  }

  if (area === "network") {
    if (!hostAllowed) {
      lines.push('- Network search is not available in the current public-safe tool profile.');
      return lines.join("\n");
    }
    const status = await readWindowsHostStatus();
    lines.push(formatNetworkFind(status, { query, limit }));
    return lines.join("\n");
  }

  if (area === "assistant") {
    if (!hostAllowed) {
      lines.push('- Home Assistant search is not available in the current public-safe tool profile.');
      return lines.join("\n");
    }
    const status = await readWindowsHostStatus();
    lines.push(formatHostFind(status, { query, domain: "assistant", limit }));
    return lines.join("\n");
   }

  if (area === "plex") {
    const index = await readPlexLibraryIndex();
    const result = findPlex(index, { query, limit });
    lines.push(formatPlexFind(result, index, { query, limit }));
    return lines.join("\n");
  }

  if (area === "notes") {
    if (!notesAllowed) {
      lines.push('- Notes search is not available in the current public-safe tool profile.');
      return lines.join("\n");
    }
    lines.push(await formatNotesFind(notesDir, query, limit));
    return lines.join("\n");
  }

  if (area === "files") {
    if (!fileAllowed) {
      lines.push('- File search is not available in the current public-safe tool profile.');
      return lines.join("\n");
    }
    const snapshot = await readFileCatalogSnapshot();
    const results = searchFiles(snapshot, { query, limit });
    lines.push(formatFileSearchResults(snapshot, results, { query, limit }));
    return lines.join("\n");
  }

  if (area === "repos") {
    if (!repoAllowed) {
      lines.push('- Repo search is not available in the current public-safe tool profile.');
      return lines.join("\n");
    }
    const snapshot = await readRepoStatusSnapshot();
    lines.push(formatLocalRepos(snapshot, { query, limit }));
    return lines.join("\n");
  }

  if (area === "homelab") {
    if (!homelabAllowed) {
      lines.push('- Homelab search is not available in the current public-safe tool profile.');
      return lines.join("\n");
    }
    const status = await readHomelabStatus();
    const normalizedQuery = query.toLowerCase();
    const matches = status.services.filter((service) => {
      return (
        service.name.toLowerCase().includes(normalizedQuery) ||
        service.status.toLowerCase().includes(normalizedQuery) ||
        service.details.toLowerCase().includes(normalizedQuery)
      );
    });
    lines.push(
      matches.length > 0
        ? formatHomelabStatus({ ...status, services: matches }, undefined)
        : `Generated: ${status.generatedAt}\nSummary: ${status.summary}\n\nServices:\n- No homelab services matched "${query}".`
    );
    return lines.join("\n");
  }

  const [hostStatus, plexIndex, noteText, homelabStatus, fileSnapshot, repoSnapshot] = await Promise.all([
    readWindowsHostStatus(),
    readPlexLibraryIndex(),
    notesAllowed ? formatNotesFind(notesDir, query, limit) : Promise.resolve(""),
    homelabAllowed ? readHomelabStatus() : Promise.resolve(null),
    fileAllowed ? readFileCatalogSnapshot() : Promise.resolve(null),
    repoAllowed ? readRepoStatusSnapshot() : Promise.resolve(null)
  ]);

  const dockerText = formatDockerFind(hostStatus, { query, limit });
  const storageText = hostAllowed ? formatStorageFind(hostStatus, { query, limit }) : "";
  const backupText = hostAllowed ? formatBackupFind(hostStatus, { query, limit }) : "";
  const networkText = hostAllowed ? formatNetworkFind(hostStatus, { query, limit }) : "";
  const plexResult = findPlex(plexIndex, { query, limit });
  const homelabMatches =
    homelabAllowed && homelabStatus
      ? homelabStatus.services.filter((service) => {
          const normalizedQuery = query.toLowerCase();
          return (
            service.name.toLowerCase().includes(normalizedQuery) ||
            service.status.toLowerCase().includes(normalizedQuery) ||
            service.details.toLowerCase().includes(normalizedQuery)
          );
        })
      : [];
  const fileText =
    fileAllowed && fileSnapshot
      ? formatFileSearchResults(fileSnapshot, searchFiles(fileSnapshot, { query, limit }), { query, limit })
      : "";
  const repoText = repoAllowed && repoSnapshot ? formatLocalRepos(repoSnapshot, { query, limit }) : "";

  if (hasPlexResults(plexResult)) {
    lines.push("Plex:");
    lines.push(formatPlexFind(plexResult, plexIndex, { query, limit }));
    lines.push("");
  }

  if (!dockerText.includes("- No Docker containers, projects, images, networks, or volumes matched that query.")) {
    lines.push("Docker:");
    lines.push(dockerText);
    lines.push("");
  }

  if (hostAllowed) {
    const hostText = formatHostFind(hostStatus, { query, limit });
    if (!hostText.includes(NO_HOST_FIND_RESULTS_MESSAGE)) {
      lines.push("Host:");
      lines.push(hostText);
      lines.push("");
    }
  }

  if (hostAllowed && storageText && !storageText.includes(NO_STORAGE_FIND_RESULTS_MESSAGE)) {
    lines.push("Storage:");
    lines.push(storageText);
    lines.push("");
  }

  if (hostAllowed && backupText && !backupText.includes(NO_BACKUP_FIND_RESULTS_MESSAGE)) {
    lines.push("Backups:");
    lines.push(backupText);
    lines.push("");
  }

  if (hostAllowed && networkText && !networkText.includes(NO_NETWORK_FIND_RESULTS_MESSAGE)) {
    lines.push("Network:");
    lines.push(networkText);
    lines.push("");
  }

  if (notesAllowed && noteText && !noteText.includes("- No notes matched that query.")) {
    lines.push("Notes:");
    lines.push(noteText);
    lines.push("");
  }

  if (fileAllowed && fileText && !fileText.includes("- No indexed files matched that search.")) {
    lines.push("Files:");
    lines.push(fileText);
    lines.push("");
  }

  if (repoAllowed && repoText && !repoText.includes("- No local repos matched that filter.")) {
    lines.push("Repos:");
    lines.push(repoText);
    lines.push("");
  }

  if (homelabAllowed && homelabStatus && homelabMatches.length > 0) {
    lines.push("Homelab:");
    lines.push(formatHomelabStatus({ ...homelabStatus, services: homelabMatches }, undefined));
    lines.push("");
  }

  if (lines.length <= 3) {
    lines.push("- No Plex, Docker, host, storage, backup, network, file, repo, note, or homelab matches were found for that query.");
  }

  return lines.join("\n").trimEnd();
}

export async function formatDailyDigest(profile: ToolProfile) {
  const [snapshotOverview, hostStatus] = await Promise.all([readSnapshotOverview(), readWindowsHostStatus()]);
  const visibleSnapshotOverview = filterSnapshotOverviewForProfile(snapshotOverview, profile);
  const repoSnapshot = profile === "full" ? await readRepoStatusSnapshot().catch(() => null) : null;
  const dirtyRepos = repoSnapshot ? repoSnapshot.repos.filter((repo) => repo.dirty).length : 0;
  const lowSpaceDisks = profile === "full"
    ? (hostStatus.resources?.disks ?? []).filter((disk) => (disk.percentFree ?? 100) <= (hostStatus.storage?.lowSpaceThresholdPercent ?? 15))
    : [];
  const backupIssues = profile === "full" ? (hostStatus.backups?.tasks ?? []).filter((task) => task.issue !== "none") : [];
  const backupTargetIssues = profile === "full" ? (hostStatus.backupTargets?.targets ?? []).filter((target) => target.issue !== "none") : [];
  const eventIssues = profile === "full" ? (hostStatus.events?.criticalCount ?? 0) + (hostStatus.events?.errorCount ?? 0) : 0;
  const shareIssues = profile === "full" ? hostStatus.shares?.pathMissingCount ?? 0 : 0;
  const homeAssistantIssues = profile === "full" && hostStatus.homeAssistant?.configured && !hostStatus.homeAssistant.reachable ? 1 : 0;
  const unhealthyEndpoints = profile === "full" ? (hostStatus.endpointChecks ?? []).filter((endpoint) => !endpoint.healthy) : [];
  const dockerProblems = hostStatus.docker?.problemCount ?? 0;
  const plexReachable = hostStatus.plex?.reachable ?? false;
  const lines = [
    `Daily digest: ${new Date().toISOString()}`,
    "",
    formatSnapshotHeadlineForProfile(snapshotOverview, profile),
    "",
    "Headline:",
    `- Docker problems: ${dockerProblems}`,
    `- Plex reachable: ${plexReachable ? "yes" : "no"}`,
    `- Snapshot freshness: ${visibleSnapshotOverview.overallFreshness}`,
    profile === "full" ? `- Low-space disks: ${lowSpaceDisks.length}` : "",
    profile === "full" ? `- Backup issues: ${backupIssues.length}` : "",
    profile === "full" ? `- Backup target issues: ${backupTargetIssues.length}` : "",
    profile === "full" ? `- Event errors: ${eventIssues}` : "",
    profile === "full" ? `- Share path issues: ${shareIssues}` : "",
    profile === "full" && hostStatus.homeAssistant?.configured ? `- Home Assistant reachable: ${hostStatus.homeAssistant.reachable ? "yes" : "no"}` : "",
    profile === "full" ? `- Unhealthy endpoints: ${unhealthyEndpoints.length}` : "",
    profile === "full" && repoSnapshot ? `- Dirty repos: ${dirtyRepos}` : ""
  ].filter(Boolean);

  lines.push("");
  lines.push("What needs attention:");
  const attention: string[] = [];
  if (visibleSnapshotOverview.overallFreshness !== "fresh") {
    attention.push("Snapshot data is not fully fresh.");
  }
  if (dockerProblems > 0) {
    attention.push(`${dockerProblems} Docker problems were detected.`);
  }
  if (profile === "full" && lowSpaceDisks.length > 0) {
    attention.push(`${lowSpaceDisks.length} disks are below the free-space threshold.`);
  }
  if (profile === "full" && backupIssues.length > 0) {
    attention.push(`${backupIssues.length} backup tasks need follow-up.`);
  }
  if (profile === "full" && backupTargetIssues.length > 0) {
    attention.push(`${backupTargetIssues.length} backup targets need follow-up.`);
  }
  if (profile === "full" && eventIssues > 0) {
    attention.push(`${eventIssues} Windows event errors were captured recently.`);
  }
  if (profile === "full" && shareIssues > 0) {
    attention.push(`${shareIssues} SMB shares point at missing paths.`);
  }
  if (profile === "full" && homeAssistantIssues > 0) {
    attention.push("Home Assistant was configured but unreachable in the latest snapshot.");
  }
  if (profile === "full" && unhealthyEndpoints.length > 0) {
    attention.push(`${unhealthyEndpoints.length} endpoint checks are unhealthy.`);
  }
  if (profile === "full" && dirtyRepos > 0) {
    attention.push(`${dirtyRepos} local repos are dirty.`);
  }
  if (!plexReachable) {
    attention.push("Plex is not reachable from the host snapshot.");
  }

  if (attention.length === 0) {
    lines.push("- Nothing urgent stands out in the latest snapshots.");
  } else {
    for (const item of attention) {
      lines.push(`- ${item}`);
    }
  }

  lines.push("");
  lines.push("Recommended next checks:");
  const actions: string[] = [];
  if (visibleSnapshotOverview.overallFreshness !== "fresh") {
    actions.push("get_snapshot_recommendations");
  }
  if (dockerProblems > 0) {
    actions.push("get_docker_triage_report");
  }
  if (profile === "full" && lowSpaceDisks.length > 0) {
    actions.push("find_low_space_locations");
  }
  if (profile === "full" && backupIssues.length > 0) {
    actions.push("find_failed_backups");
  }
  if (profile === "full" && backupTargetIssues.length > 0) {
    actions.push("get_backup_target_health");
  }
  if (profile === "full" && eventIssues > 0) {
    actions.push("get_windows_event_summary");
  }
  if (profile === "full" && shareIssues > 0) {
    actions.push("get_share_status");
  }
  if (profile === "full" && homeAssistantIssues > 0) {
    actions.push("get_home_assistant_status");
  }
  if (profile === "full" && unhealthyEndpoints.length > 0) {
    actions.push("check_endpoint_health");
  }
  if (actions.length === 0) {
    lines.push("- No follow-up commands are strongly indicated right now.");
  } else {
    for (const action of actions) {
      lines.push(`- ${action}`);
    }
  }

  return lines.join("\n");
}
