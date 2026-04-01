import { formatFileSearchResults, readFileCatalogSnapshot, searchFiles } from "./files.js";
import { formatHomelabStatus, readHomelabStatus } from "./homelab.js";
import { formatDockerFind, formatHostFind, readWindowsHostStatus } from "./host.js";
import { loadAllNotes, readNoteBySlug, searchNotes } from "./notes.js";
import { findPlex, formatPlexFind, readPlexLibraryIndex } from "./plex.js";
import { readPlexActivitySnapshot } from "./plex-activity.js";
import { formatLocalRepos, readRepoStatusSnapshot } from "./repos.js";
import { formatSnapshotHeadline, readSnapshotOverview } from "./snapshots.js";
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
  const dirtyRepos = repoSnapshot ? repoSnapshot.repos.filter((repo) => repo.dirty) : [];
  const lines = ["Attention report:", "", formatSnapshotHeadline(snapshotOverview), ""];

  if (staleSnapshots.length === 0 && lateSnapshots.length === 0 && dockerProblems === 0 && serviceIssues.length === 0 && failedTasks.length === 0 && dirtyRepos.length === 0) {
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
    formatSnapshotHeadline(snapshotOverview),
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
    lines.push(`Scheduler: ${snapshotOverview.scheduler.taskName}${schedulerBits ? ` | ${schedulerBits}` : ""}`);
  } else {
    lines.push('Scheduler: not installed. Run "npm run schedule:host-refresh" on the Windows host for automatic refreshes.');
  }

  lines.push("");

  if (hostResult.status === "fulfilled") {
    const host = hostResult.value;
    if (profile === "full") {
      lines.push(`Host: ${host.host.computerName} | ${host.summary}`);
    } else {
      lines.push(`Host summary: ${host.summary}`);
    }
    if (host.resources) {
      lines.push(
        `Host resources: CPU ${host.resources.cpu.loadPercent ?? "unknown"}% | RAM ${Math.round(host.resources.memory.percentUsed)}% used | ${host.resources.disks.length} disks | ${host.resources.network.adapterCount} adapters`
      );
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
  if (snapshotOverview.overallFreshness !== "fresh") {
    actions.push('Refresh snapshots with "npm run refresh:host" if these answers look old.');
    actions.push("Use get_snapshot_recommendations to see the likely cause of the stale data.");
  }
  if (!snapshotOverview.scheduler.installed) {
    actions.push('Install the Windows scheduled refresh task with "npm run schedule:host-refresh".');
  }
  if (hostResult.status === "fulfilled" && (hostResult.value.docker?.problemCount ?? 0) > 0) {
    actions.push("Review Docker issues with get_docker_issues or get_docker_restart_report.");
  }
  if (repoResult.status === "fulfilled" && repoResult.value.repos.some((repo) => repo.dirty)) {
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
    area?: "auto" | "docker" | "plex" | "notes" | "homelab" | "host" | "files" | "repos";
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
    formatSnapshotHeadline(snapshotOverview),
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
    if (!hostText.includes("- No host components, resources, disks, network adapters, services, scheduled tasks, or listening ports matched that query.")) {
      lines.push("Host:");
      lines.push(hostText);
      lines.push("");
    }
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
    lines.push("- No Plex, Docker, host, file, repo, note, or homelab matches were found for that query.");
  }

  return lines.join("\n").trimEnd();
}
