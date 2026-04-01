import { formatHomelabStatus, readHomelabStatus } from "./homelab.js";
import { formatDockerFind, readWindowsHostStatus } from "./host.js";
import { loadAllNotes, readNoteBySlug, searchNotes } from "./notes.js";
import { findPlex, formatPlexFind, readPlexLibraryIndex } from "./plex.js";
import { readPlexActivitySnapshot } from "./plex-activity.js";
import { formatSnapshotHeadline, readSnapshotOverview } from "./snapshots.js";

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
  const checkedAt = new Date().toISOString();
  const snapshotOverview = await readSnapshotOverview();
  const [hostResult, activityResult, notesResult, homelabResult] = await Promise.allSettled([
    readWindowsHostStatus(),
    readPlexActivitySnapshot(),
    loadAllNotes(notesDir),
    readHomelabStatus()
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
    lines.push(`Host: ${host.host.computerName} | ${host.summary}`);
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

  const actions: string[] = [];
  if (snapshotOverview.overallFreshness !== "fresh") {
    actions.push('Refresh snapshots with "npm run refresh:host" if these answers look old.');
  }
  if (!snapshotOverview.scheduler.installed) {
    actions.push('Install the Windows scheduled refresh task with "npm run schedule:host-refresh".');
  }
  if (hostResult.status === "fulfilled" && (hostResult.value.docker?.problemCount ?? 0) > 0) {
    actions.push("Review Docker issues with get_docker_issues or get_docker_restart_report.");
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
    area?: "auto" | "docker" | "plex" | "notes" | "homelab";
    limit?: number;
  }
) {
  const query = options.query.trim();
  const area = options.area ?? "auto";
  const limit = Math.min(Math.max(options.limit ?? 5, 1), 10);

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

  if (area === "plex") {
    const index = await readPlexLibraryIndex();
    const result = findPlex(index, { query, limit });
    lines.push(formatPlexFind(result, index, { query, limit }));
    return lines.join("\n");
  }

  if (area === "notes") {
    lines.push(await formatNotesFind(notesDir, query, limit));
    return lines.join("\n");
  }

  if (area === "homelab") {
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

  const [hostStatus, plexIndex, noteText, homelabStatus] = await Promise.all([
    readWindowsHostStatus(),
    readPlexLibraryIndex(),
    formatNotesFind(notesDir, query, limit),
    readHomelabStatus()
  ]);

  const dockerText = formatDockerFind(hostStatus, { query, limit });
  const plexResult = findPlex(plexIndex, { query, limit });
  const homelabMatches = homelabStatus.services.filter((service) => {
    const normalizedQuery = query.toLowerCase();
    return (
      service.name.toLowerCase().includes(normalizedQuery) ||
      service.status.toLowerCase().includes(normalizedQuery) ||
      service.details.toLowerCase().includes(normalizedQuery)
    );
  });

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

  if (!noteText.includes("- No notes matched that query.")) {
    lines.push("Notes:");
    lines.push(noteText);
    lines.push("");
  }

  if (homelabMatches.length > 0) {
    lines.push("Homelab:");
    lines.push(formatHomelabStatus({ ...homelabStatus, services: homelabMatches }, undefined));
    lines.push("");
  }

  if (lines.length <= 3) {
    lines.push("- No Plex, Docker, note, or homelab matches were found for that query.");
  }

  return lines.join("\n").trimEnd();
}
