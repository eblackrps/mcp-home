import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatHomelabStatus, readHomelabStatus } from "./homelab.js";
import {
  formatDockerExposureReport,
  formatDockerFind,
  formatDockerMountReport,
  formatDockerPortMap,
  formatDockerCleanupCandidates,
  formatDockerComposeHealth,
  formatDockerContainerDetails,
  formatDockerContainers,
  formatDockerImages,
  formatDockerIssues,
  formatDockerNetworks,
  formatDockerProjectDetails,
  formatDockerProjects,
  formatDockerRecentActivity,
  formatDockerRestartReport,
  formatDockerResourceUsage,
  formatDockerStatus,
  formatDockerTriageReport,
  formatHostDisks,
  formatHostFind,
  formatHostNetworkSummary,
  formatHostResources,
  formatDockerVolumes,
  NO_HOST_FIND_RESULTS_MESSAGE,
  formatPlexStatus,
  formatWindowsHostStatus,
  readWindowsHostStatus
} from "./host.js";
import {
  formatBackupFind,
  formatBackupStatus,
  formatBackupTargetHealth,
  formatFailedBackups,
  NO_BACKUP_FIND_RESULTS_MESSAGE
} from "./backups.js";
import { formatHomeAssistantStatus } from "./home-assistant.js";
import {
  formatAttentionReport,
  formatDailyDigest,
  formatHomeFind,
  formatNotesFind,
  formatOperationsDashboardForProfile
} from "./home.js";
import { formatIssueExplanation, formatRecommendNextChecks } from "./insights.js";
import {
  findIndexedFile,
  formatFileSearchResults,
  formatFolderSummary,
  formatIndexedFileContent,
  formatRecentFiles,
  listRecentFiles,
  readFileCatalogSnapshot,
  searchFiles,
  summarizeFolder
} from "./files.js";
import { loadAllNotes, readNoteBySlug, searchNotes } from "./notes.js";
import {
  browsePlexByGenre,
  browsePlexByDecade,
  browsePlexShowEpisodes,
  browsePlexChildren,
  findPlex,
  findPlexEpisodes,
  findPlexSeriesGaps,
  formatPlexDecadeBrowse,
  formatPlexFind,
  formatPlexGenreBrowse,
  formatPlexEpisodes,
  formatPlexChildren,
  formatPlexDuplicates,
  formatPlexItemDetails,
  formatPlexLibraryStats,
  formatPlexSeriesGaps,
  formatPlexSeasonSummary,
  formatPlexShowEpisodes,
  formatPlexShowSummary,
  formatRecentlyAiredEpisodes,
  formatPlexSearchResults,
  formatPlexTitleSearchResults,
  formatPlexSections,
  formatRecentPlexAdditions,
  getPlexShowSummary,
  getPlexItemDetails,
  getPlexLibraryStats,
  getPlexSeasonSummary,
  getRecentlyAiredEpisodes,
  getRecentPlexAdditions,
  listPlexDuplicates,
  readPlexLibraryIndex,
  searchPlexLibrary,
  searchPlexTitles
} from "./plex.js";
import {
  formatPlexContinueWatching,
  formatPlexOnDeck,
  formatPlexNowPlaying,
  formatPlexRecentlyWatched,
  formatPlexServerActivity,
  formatPlexUnwatched,
  findPlexUnwatched,
  readPlexActivitySnapshot
} from "./plex-activity.js";
import { auditToolCall, log, summarizeArgs } from "./logger.js";
import {
  formatDnsSummary,
  formatEndpointHealth,
  formatInternetHealth,
  formatNetworkFind,
  NO_NETWORK_FIND_RESULTS_MESSAGE,
  formatPublicExposureSummary,
  formatTailscaleStatus
} from "./network.js";
import {
  formatSnapshotHistory,
  formatSnapshotRecommendations,
  formatSnapshotStatus,
  readSnapshotHistory,
  readSnapshotOverview
} from "./snapshots.js";
import { formatLocalRepos, formatRecentRepoActivity, formatRepoDetails, readRepoStatusSnapshot } from "./repos.js";
import { getRegisteredToolNames, SERVER_NAME, SERVER_VERSION, type ToolProfile } from "./server-meta.js";
import {
  formatLargeFolders,
  formatLowSpaceLocations,
  formatStorageFind,
  formatStorageHealth,
  NO_STORAGE_FIND_RESULTS_MESSAGE
} from "./storage.js";
import {
  formatFailedScheduledTasks,
  formatListeningPorts,
  formatRecentServiceFailures,
  formatScheduledTaskDetails,
  formatScheduledTasks,
  formatShareStatus,
  formatWindowsEventSummary,
  formatWindowsServiceDetails,
  formatWindowsServiceIssues,
  formatWindowsServices,
  searchWindowsEvents
} from "./windows.js";

const DEFAULT_NOTES_DIR = path.resolve(fileURLToPath(new URL("../../notes", import.meta.url)));

type CommandCatalogEntry = {
  name: string;
  summary: string;
  group?: string;
  options?: string[];
  example?: string;
};

const DOCKER_COMMAND_CATALOG: CommandCatalogEntry[] = [
  {
    name: "get_docker_status",
    summary: "High-level Docker Desktop summary with running containers, problems, image count, and network count.",
    example: "get_docker_status"
  },
  {
    name: "list_docker_containers",
    summary: "List containers with optional name and state filters.",
    options: ["name", "state", "limit"],
    example: "list_docker_containers state=running"
  },
  {
    name: "get_docker_projects",
    summary: "Summarize Docker Compose projects and their container states.",
    options: ["project", "limit"],
    example: "get_docker_projects"
  },
  {
    name: "get_docker_project_details",
    summary: "Inspect one Docker Compose project with services, ports, usage, networks, and mounts.",
    options: ["project"],
    example: "get_docker_project_details project=mcphome"
  },
  {
    name: "get_docker_compose_health",
    summary: "Show per-project compose health and flag problem containers.",
    options: ["project", "limit"],
    example: "get_docker_compose_health"
  },
  {
    name: "get_docker_issues",
    summary: "List unhealthy, restarting, dead, or non-zero exited containers.",
    options: ["limit"],
    example: "get_docker_issues"
  },
  {
    name: "get_docker_container_details",
    summary: "Inspect one container with command, ports, mounts, usage, exit code, and restart count.",
    options: ["name"],
    example: "get_docker_container_details name=mcp-home"
  },
  {
    name: "get_docker_resource_usage",
    summary: "Show live CPU, memory, network, block I/O, and PID usage for running containers.",
    options: ["name", "project", "limit"],
    example: "get_docker_resource_usage project=mcphome"
  },
  {
    name: "get_docker_recent_activity",
    summary: "List recently started, finished, or created containers.",
    options: ["state", "sinceHours", "limit"],
    example: "get_docker_recent_activity sinceHours=168"
  },
  {
    name: "list_docker_images",
    summary: "List Docker images with optional repository and dangling filters.",
    options: ["repository", "dangling", "limit"],
    example: "list_docker_images dangling=true"
  },
  {
    name: "list_docker_networks",
    summary: "List Docker networks with an optional name filter.",
    options: ["name", "limit"],
    example: "list_docker_networks"
  },
  {
    name: "list_docker_volumes",
    summary: "List Docker volumes and whether they are anonymous or currently in use.",
    options: ["name", "inUse", "anonymous", "limit"],
    example: "list_docker_volumes inUse=false"
  },
  {
    name: "get_docker_cleanup_candidates",
    summary: "Summarize reclaimable Docker storage plus exited containers, unused images, and unused volumes.",
    options: ["olderThanHours", "limit"],
    example: "get_docker_cleanup_candidates olderThanHours=72"
  },
  {
    name: "get_docker_port_map",
    summary: "Show container port mappings, compose context, and networks from the latest Docker snapshot.",
    options: ["name", "project", "publishedOnly", "limit"],
    example: "get_docker_port_map project=mcphome"
  },
  {
    name: "get_docker_mount_report",
    summary: "Show bind and volume mounts plus read-only or read-write access.",
    options: ["name", "project", "accessMode", "limit"],
    example: "get_docker_mount_report accessMode=ro"
  },
  {
    name: "get_docker_restart_report",
    summary: "Surface restart counts, recent failures, and exit patterns across Docker containers.",
    options: ["name", "project", "sinceHours", "includeHealthy", "limit"],
    example: "get_docker_restart_report sinceHours=168"
  },
  {
    name: "get_docker_exposure_report",
    summary: "Classify published Docker ports as public, loopback-only, or host-IP bindings.",
    options: ["name", "project", "limit"],
    example: "get_docker_exposure_report project=mcphome"
  },
  {
    name: "get_docker_triage_report",
    summary: "Roll up Docker health, restart hotspots, exposed ports, and resource pressure into one triage view.",
    options: ["project", "sinceHours"],
    example: "get_docker_triage_report sinceHours=168"
  }
];

const PLEX_COMMAND_CATALOG: CommandCatalogEntry[] = [
  {
    name: "find_plex",
    summary: "Natural Plex finder for broad requests like Sopranos that can route to details, show summary, or episode results.",
    options: ["query", "mediaType", "intent", "section", "seasonIndex", "limit"],
    example: "find_plex query=Sopranos"
  },
  {
    name: "get_plex_status",
    summary: "High-level Plex server and library summary.",
    example: "get_plex_status"
  },
  {
    name: "get_plex_server_activity",
    summary: "Current Plex activity snapshot including active sessions and latest watched items.",
    example: "get_plex_server_activity"
  },
  {
    name: "get_plex_now_playing",
    summary: "Active Plex playback sessions.",
    example: "get_plex_now_playing"
  },
  {
    name: "get_plex_recently_watched",
    summary: "Recently watched Plex items from the local activity snapshot.",
    options: ["limit"],
    example: "get_plex_recently_watched limit=5"
  },
  {
    name: "get_plex_continue_watching",
    summary: "Plex continue-watching recommendations.",
    options: ["limit"],
    example: "get_plex_continue_watching limit=5"
  },
  {
    name: "get_plex_on_deck",
    summary: "Plex on-deck recommendations for what is next.",
    options: ["limit"],
    example: "get_plex_on_deck limit=5"
  },
  {
    name: "find_plex_unwatched",
    summary: "Find unwatched movies or shows, optionally filtered by title or section.",
    options: ["query", "mediaType", "section", "limit"],
    example: "find_plex_unwatched mediaType=movie"
  },
  {
    name: "list_plex_sections",
    summary: "List the available Plex library sections.",
    example: "list_plex_sections"
  },
  {
    name: "search_plex_library",
    summary: "Search the whole Plex library index by title, section, or item type.",
    options: ["query", "section", "itemType", "limit"],
    example: "search_plex_library query=Daredevil itemType=episode"
  },
  {
    name: "search_plex_titles",
    summary: "Search titles specifically within movies, TV, or audio.",
    options: ["query", "mediaType", "limit"],
    example: "search_plex_titles query=star mediaType=movie"
  },
  {
    name: "get_plex_item_details",
    summary: "Get detailed matches for a specific title.",
    options: ["title", "itemType", "section", "limit"],
    example: "get_plex_item_details title=The Sopranos itemType=show"
  },
  {
    name: "browse_plex_by_genre",
    summary: "Browse movies, shows, or albums by genre.",
    options: ["genre", "mediaType", "section", "limit"],
    example: "browse_plex_by_genre genre=Fantasy mediaType=tv"
  },
  {
    name: "browse_plex_by_decade",
    summary: "Browse movies, shows, or albums from a specific decade.",
    options: ["decade", "mediaType", "section", "limit"],
    example: "browse_plex_by_decade decade=1990 mediaType=movie"
  },
  {
    name: "get_plex_library_stats",
    summary: "Summarize Plex library counts, top genres, duplicates, and recent additions.",
    options: ["mediaType", "section", "topGenreLimit"],
    example: "get_plex_library_stats section=TV Shows mediaType=tv"
  },
  {
    name: "get_plex_show_summary",
    summary: "Summarize a show with seasons, episodes, genres, and recent additions.",
    options: ["showTitle"],
    example: "get_plex_show_summary showTitle=The Sopranos"
  },
  {
    name: "get_plex_season_summary",
    summary: "Summarize one TV season with counts, runtime, and air-date range.",
    options: ["showTitle", "seasonIndex"],
    example: "get_plex_season_summary showTitle=The Sopranos seasonIndex=6"
  },
  {
    name: "browse_plex_show_episodes",
    summary: "Browse episodes for a show with proper season and episode ordering.",
    options: ["showTitle", "seasonIndex", "limit"],
    example: "browse_plex_show_episodes showTitle=The Sopranos seasonIndex=1"
  },
  {
    name: "find_plex_episode",
    summary: "Search episodes by episode title, optionally scoped to one show.",
    options: ["query", "showTitle", "limit"],
    example: "find_plex_episode query=Northern showTitle=Daredevil"
  },
  {
    name: "get_recently_aired_episodes",
    summary: "Find episodes that aired recently, optionally narrowed to one show.",
    options: ["days", "showTitle", "limit"],
    example: "get_recently_aired_episodes days=14"
  },
  {
    name: "find_plex_series_gaps",
    summary: "Detect possible missing seasons or episode gaps in TV shows.",
    options: ["showTitle", "section", "limit"],
    example: "find_plex_series_gaps section=TV Shows"
  },
  {
    name: "browse_plex_children",
    summary: "Browse a show's episodes, an artist's albums, or an album's tracks.",
    options: ["parentTitle", "parentType", "section", "limit"],
    example: "browse_plex_children parentTitle=Ursula K. Le Guin parentType=artist"
  },
  {
    name: "list_plex_duplicates",
    summary: "Find duplicate titles grouped by title, type, and section.",
    options: ["section", "itemType", "limit"],
    example: "list_plex_duplicates section=Audio Books itemType=album"
  },
  {
    name: "get_recent_plex_additions",
    summary: "List the most recent Plex additions.",
    options: ["section", "itemType", "limit"],
    example: "get_recent_plex_additions section=Movies limit=10"
  }
];

const WINDOWS_COMMAND_CATALOG: CommandCatalogEntry[] = [
  {
    name: "list_windows_services",
    summary: "List Windows services with optional name, state, and start-mode filters.",
    options: ["query", "state", "startMode", "limit"],
    example: "list_windows_services state=Running"
  },
  {
    name: "get_windows_service_details",
    summary: "Inspect one Windows service by name or display name.",
    options: ["query"],
    example: "get_windows_service_details query=Tailscale"
  },
  {
    name: "get_windows_service_issues",
    summary: "Show automatic services that appear stopped in the latest host snapshot.",
    options: ["limit"],
    example: "get_windows_service_issues"
  },
  {
    name: "get_windows_event_summary",
    summary: "Summarize recent Windows Event Viewer errors, warnings, and critical events from the host snapshot.",
    options: ["logName", "level", "source", "limit"],
    example: "get_windows_event_summary level=error"
  },
  {
    name: "search_windows_events",
    summary: "Search recent Windows events by message, provider, event ID, or log name.",
    options: ["query", "logName", "level", "limit"],
    example: "search_windows_events query=plex"
  },
  {
    name: "find_recent_service_failures",
    summary: "Highlight recent service-control-related Windows events that likely point to service startup or shutdown failures.",
    options: ["limit"],
    example: "find_recent_service_failures"
  },
  {
    name: "list_scheduled_tasks",
    summary: "List scheduled tasks with optional query, state, or enabled filters.",
    options: ["query", "state", "enabled", "limit"],
    example: "list_scheduled_tasks query=backup"
  },
  {
    name: "get_scheduled_task_details",
    summary: "Inspect one Windows scheduled task with triggers, actions, and recent run details.",
    options: ["query"],
    example: "get_scheduled_task_details query=MCP Home Host Refresh"
  },
  {
    name: "find_failed_tasks",
    summary: "List scheduled tasks with non-zero last results.",
    options: ["limit"],
    example: "find_failed_tasks"
  },
  {
    name: "list_listening_ports",
    summary: "List listening TCP and UDP ports with process and service names.",
    options: ["query", "protocol", "port", "limit"],
    example: "list_listening_ports port=32400"
  },
  {
    name: "get_share_status",
    summary: "Summarize SMB shares and whether their backing paths exist on the Windows host.",
    options: ["query", "missingOnly", "limit"],
    example: "get_share_status missingOnly=true"
  }
];

const STORAGE_COMMAND_CATALOG: CommandCatalogEntry[] = [
  {
    name: "get_storage_health",
    summary: "Summarize disk free space plus the largest scanned folders from the latest storage snapshot.",
    example: "get_storage_health"
  },
  {
    name: "find_low_space_locations",
    summary: "List disks below the free-space threshold and show the biggest scanned folders on those drives.",
    options: ["thresholdPercent", "limit"],
    example: "find_low_space_locations thresholdPercent=15"
  },
  {
    name: "list_large_folders",
    summary: "List the largest scanned folders under the configured storage roots.",
    options: ["root", "limit"],
    example: "list_large_folders root=notes"
  }
];

const BACKUP_COMMAND_CATALOG: CommandCatalogEntry[] = [
  {
    name: "get_backup_status",
    summary: "Summarize detected backup-related scheduled tasks and whether they look healthy, stale, or failing.",
    example: "get_backup_status"
  },
  {
    name: "get_backup_target_health",
    summary: "Inspect backup destination paths, reachability, free space, and whether targets look healthy or stale.",
    options: ["query", "issue", "limit"],
    example: "get_backup_target_health issue=unreachable"
  },
  {
    name: "find_failed_backups",
    summary: "List backup-related scheduled tasks with stale runs, warnings, disabled state, or failures.",
    options: ["limit"],
    example: "find_failed_backups"
  }
];

const NETWORK_COMMAND_CATALOG: CommandCatalogEntry[] = [
  {
    name: "check_endpoint_health",
    summary: "Read the latest snapshot of configured endpoint checks, including local and public MCP and Plex probes.",
    options: ["query", "unhealthyOnly", "limit"],
    example: "check_endpoint_health unhealthyOnly=true"
  },
  {
    name: "get_internet_health",
    summary: "Summarize internet-facing endpoint reachability and likely local-vs-external connectivity issues.",
    example: "get_internet_health"
  },
  {
    name: "get_dns_summary",
    summary: "Summarize Windows adapter DNS servers plus Tailscale MagicDNS status when available.",
    example: "get_dns_summary"
  },
  {
    name: "get_tailscale_status",
    summary: "Summarize local Tailscale backend state, peers, Funnel, and Serve targets from the latest snapshot.",
    example: "get_tailscale_status"
  },
  {
    name: "get_public_exposure_summary",
    summary: "Roll up Tailscale Funnel or Serve targets, public Docker bindings, and public endpoint probes into one view.",
    example: "get_public_exposure_summary"
  }
];

const FILE_COMMAND_CATALOG: CommandCatalogEntry[] = [
  {
    name: "search_files",
    summary: "Search the indexed allowlisted file catalog by path, name, extension, and stored preview text.",
    options: ["query", "root", "extension", "limit"],
    example: "search_files query=backup extension=md"
  },
  {
    name: "list_recent_files",
    summary: "List recently modified indexed files with optional root or extension filters.",
    options: ["root", "extension", "limit"],
    example: "list_recent_files root=notes"
  },
  {
    name: "read_text_file",
    summary: "Read the stored text preview for one indexed file.",
    options: ["query"],
    example: "read_text_file query=homelab.md"
  },
  {
    name: "summarize_folder",
    summary: "Summarize an indexed folder or path prefix with file counts, top extensions, and recent files.",
    options: ["query", "limit"],
    example: "summarize_folder query=notes"
  }
];

const REPO_COMMAND_CATALOG: CommandCatalogEntry[] = [
  {
    name: "list_local_repos",
    summary: "List indexed local git repositories with optional query or dirty-state filters.",
    options: ["query", "dirty", "limit"],
    example: "list_local_repos dirty=true"
  },
  {
    name: "get_repo_status",
    summary: "Inspect one local git repository with branch, remote, dirty counts, and last commit info.",
    options: ["query"],
    example: "get_repo_status query=MCP@home"
  },
  {
    name: "get_recent_repo_activity",
    summary: "List repositories ordered by most recent commit activity.",
    options: ["query", "limit"],
    example: "get_recent_repo_activity"
  }
];

function withGroup(entries: CommandCatalogEntry[], group: string): CommandCatalogEntry[] {
  return entries.map((entry) => ({
    ...entry,
    group
  }));
}

const HOME_COMMAND_CATALOG: CommandCatalogEntry[] = [
  {
    name: "list_home_commands",
    group: "discovery",
    summary: "List the major MCP command groups exposed by this server, with optional area or keyword filtering.",
    options: ["area", "query"],
    example: "list_home_commands area=docker"
  },
  {
    name: "list_docker_commands",
    group: "discovery",
    summary: "List Docker-focused commands with short summaries and examples.",
    options: ["query"],
    example: "list_docker_commands query=cleanup"
  },
  {
    name: "list_plex_commands",
    group: "discovery",
    summary: "List Plex-focused commands with short summaries and examples.",
    options: ["query"],
    example: "list_plex_commands query=episode"
  },
  {
    name: "list_storage_commands",
    group: "storage",
    summary: "List storage-focused commands for disks, low-space detection, and large folder summaries.",
    options: ["query"],
    example: "list_storage_commands query=space"
  },
  {
    name: "list_backup_commands",
    group: "backup",
    summary: "List backup-focused commands for backup task health and failure review.",
    options: ["query"],
    example: "list_backup_commands query=failed"
  },
  {
    name: "list_network_commands",
    group: "network",
    summary: "List network-focused commands for endpoint checks, DNS, Tailscale, and public exposure.",
    options: ["query"],
    example: "list_network_commands query=tailscale"
  },
  {
    name: "get_snapshot_status",
    group: "snapshot",
    summary: "Show snapshot freshness, scheduler status, and whether the host refresh data is current or stale.",
    example: "get_snapshot_status"
  },
  {
    name: "get_snapshot_history",
    group: "snapshot",
    summary: "Show recent refresh runs with durations, warnings, and failures so stale-data problems are easier to diagnose.",
    options: ["limit"],
    example: "get_snapshot_history limit=10"
  },
  {
    name: "get_snapshot_recommendations",
    group: "snapshot",
    summary: "Explain likely causes of stale or incomplete snapshots and recommend the next troubleshooting steps.",
    example: "get_snapshot_recommendations"
  },
  {
    name: "get_operations_dashboard",
    group: "snapshot",
    summary: "Roll up snapshot freshness, Windows host health, Docker, Plex activity, notes, and homelab status into one report.",
    example: "get_operations_dashboard"
  },
  {
    name: "get_attention_report",
    group: "snapshot",
    summary: "Highlight stale snapshots, Docker issues, stopped automatic services, failed tasks, and dirty repos.",
    example: "get_attention_report"
  },
  {
    name: "get_daily_digest",
    group: "snapshot",
    summary: "Summarize the current operational state and recommend the most relevant next checks.",
    example: "get_daily_digest"
  },
  {
    name: "recommend_next_checks",
    group: "discovery",
    summary: "Recommend the most relevant next MCP commands for a query or problem area.",
    options: ["query"],
    example: "recommend_next_checks query=backup"
  },
  {
    name: "explain_issue",
    group: "discovery",
    summary: "Explain the current signals around an issue and point to the next commands to run.",
    options: ["query"],
    example: "explain_issue query=plex offline"
  },
  {
    name: "summarize_system_state",
    group: "snapshot",
    summary: "Natural alias for a broad operational system-state summary across the current tool profile.",
    example: "summarize_system_state"
  },
  {
    name: "find_home",
    group: "discovery",
    summary: "Natural cross-domain finder that searches Plex, Docker, host, notes, and homelab data from a single query.",
    options: ["query", "area", "limit"],
    example: "find_home query=Sopranos"
  },
  {
    name: "find_docker",
    group: "docker",
    summary: "Natural Docker finder for containers, projects, images, networks, or volumes.",
    options: ["query", "domain", "limit"],
    example: "find_docker query=mcp-home"
  },
  {
    name: "find_host",
    group: "host",
    summary: "Natural host finder for components, resources, disks, network adapters, services, tasks, and ports.",
    options: ["query", "domain", "limit"],
    example: "find_host query=memory"
  },
  {
    name: "find_notes",
    group: "notes",
    summary: "Natural note finder that surfaces exact slug or title matches plus content previews.",
    options: ["query", "limit"],
    example: "find_notes query=homelab"
  },
  {
    name: "get_storage_health",
    group: "storage",
    summary: "Summarize disk free space plus the largest scanned folders in the latest storage snapshot.",
    example: "get_storage_health"
  },
  {
    name: "find_low_space_locations",
    group: "storage",
    summary: "List disks below the free-space threshold and the biggest scanned folders on those drives.",
    options: ["thresholdPercent", "limit"],
    example: "find_low_space_locations thresholdPercent=15"
  },
  {
    name: "list_large_folders",
    group: "storage",
    summary: "List the largest scanned folders under the configured storage roots.",
    options: ["root", "limit"],
    example: "list_large_folders root=notes"
  },
  {
    name: "get_backup_status",
    group: "backup",
    summary: "Summarize detected backup-related scheduled tasks and whether they look healthy, stale, or failing.",
    example: "get_backup_status"
  },
  {
    name: "find_failed_backups",
    group: "backup",
    summary: "List backup-related scheduled tasks with stale runs, warnings, disabled state, or failures.",
    options: ["limit"],
    example: "find_failed_backups"
  },
  {
    name: "check_endpoint_health",
    group: "network",
    summary: "Read the latest snapshot of configured endpoint checks and their reachability results.",
    options: ["query", "unhealthyOnly", "limit"],
    example: "check_endpoint_health unhealthyOnly=true"
  },
  {
    name: "get_dns_summary",
    group: "network",
    summary: "Summarize DNS servers from the latest Windows adapter snapshot and Tailscale MagicDNS when present.",
    example: "get_dns_summary"
  },
  {
    name: "get_tailscale_status",
    group: "network",
    summary: "Summarize local Tailscale backend state, peers, Funnel, and Serve targets.",
    example: "get_tailscale_status"
  },
  {
    name: "get_public_exposure_summary",
    group: "network",
    summary: "Roll up public exposure from Tailscale, Docker published ports, and endpoint checks.",
    example: "get_public_exposure_summary"
  },
  {
    name: "get_host_status",
    group: "host",
    summary: "Read the Windows host snapshot with system, Docker, Corsair, and Plex component health.",
    options: ["component"],
    example: "get_host_status component=docker"
  },
  {
    name: "get_host_resources",
    group: "host",
    summary: "Show CPU, memory, disk, and network telemetry from the Windows host snapshot.",
    example: "get_host_resources"
  },
  {
    name: "list_host_disks",
    group: "host",
    summary: "List Windows disks with used and free space, filesystem, and volume labels.",
    options: ["name", "limit"],
    example: "list_host_disks name=C:"
  },
  {
    name: "get_host_network_summary",
    group: "host",
    summary: "List host network adapters, IP addresses, gateways, and DNS settings.",
    options: ["query", "limit"],
    example: "get_host_network_summary query=ethernet"
  },
  {
    name: "get_home_assistant_status",
    group: "assistant",
    summary: "Read the latest Home Assistant connectivity and unavailable-entity snapshot from the Windows host.",
    example: "get_home_assistant_status"
  },
  ...withGroup(WINDOWS_COMMAND_CATALOG, "windows"),
  ...withGroup(STORAGE_COMMAND_CATALOG, "storage"),
  ...withGroup(BACKUP_COMMAND_CATALOG, "backup"),
  ...withGroup(NETWORK_COMMAND_CATALOG, "network"),
  ...withGroup(FILE_COMMAND_CATALOG, "files"),
  ...withGroup(REPO_COMMAND_CATALOG, "repos"),
  {
    name: "get_homelab_status",
    group: "host",
    summary: "Read the static homelab status snapshot with optional service filtering.",
    options: ["service"],
    example: "get_homelab_status service=backups"
  },
  {
    name: "list_notes",
    group: "notes",
    summary: "List available local markdown notes by slug and title.",
    example: "list_notes"
  },
  {
    name: "search_notes",
    group: "notes",
    summary: "Search local notes by keyword, title, tags, and body text.",
    options: ["query"],
    example: "search_notes query=backup"
  },
  {
    name: "read_note",
    group: "notes",
    summary: "Read a local markdown note when you already know the slug.",
    options: ["slug"],
    example: "read_note slug=homelab"
  },
  ...withGroup(DOCKER_COMMAND_CATALOG, "docker"),
  ...withGroup(PLEX_COMMAND_CATALOG, "plex")
];

function formatListEntry(slug: string, title: string, tags: string[]) {
  const suffix = tags.length > 0 ? ` | tags: ${tags.join(", ")}` : "";
  return `- ${slug} | ${title}${suffix}`;
}

function formatCommandCatalog(title: string, entries: CommandCatalogEntry[], query?: string) {
  const normalized = query?.trim().toLowerCase();
  const filtered = normalized
    ? entries.filter((entry) => {
        const haystack = [entry.name, entry.group ?? "", entry.summary, ...(entry.options ?? []), entry.example ?? ""]
          .join(" ")
          .toLowerCase();
        return haystack.includes(normalized);
      })
    : entries;

  const lines = [
    `${title} commands: ${filtered.length}${normalized ? ` matched "${query}"` : ` available`}.`,
    normalized ? `Tip: remove the filter to see the full ${title.toLowerCase()} command list.` : `Tip: pass a short query to narrow results, for example "cleanup", "volume", "show", or "watch".`,
    ""
  ];

  if (filtered.length === 0) {
    lines.push(`- No ${title.toLowerCase()} commands matched that filter.`);
    return lines.join("\n");
  }

  for (const entry of filtered) {
    lines.push(`- ${entry.name}`);
    if (entry.group) {
      lines.push(`  Group: ${entry.group}`);
    }
    lines.push(`  ${entry.summary}`);

    if (entry.options && entry.options.length > 0) {
      lines.push(`  Options: ${entry.options.join(", ")}`);
    }

    if (entry.example) {
      lines.push(`  Example: ${entry.example}`);
    }
  }

  return lines.join("\n");
}

async function withAudit<T>(
  tool: string,
  args: Record<string, unknown> | undefined,
  run: () => Promise<T>
): Promise<T> {
  const startedAt = Date.now();
  const argSummary = summarizeArgs(args);

  try {
    const result = await run();
    await auditToolCall({
      tool,
      ok: true,
      startedAt,
      argSummary
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await auditToolCall({
      tool,
      ok: false,
      startedAt,
      argSummary,
      error: message
    });
    throw error;
  }
}

export function createServer(options?: { profile?: ToolProfile }) {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION
  });
  const profile = options?.profile ?? "full";
  const allowedToolNames = new Set<string>(getRegisteredToolNames(profile));
  const serverToolTarget = server as unknown as {
    tool: (name: string, ...args: any[]) => unknown;
  };
  const originalTool = serverToolTarget.tool.bind(server);
  serverToolTarget.tool = (name: string, ...args: any[]) => {
    if (!allowedToolNames.has(name)) {
      return server;
    }

    originalTool(name, ...args);
    return server;
  };

  const notesDir = process.env.NOTES_DIR ?? DEFAULT_NOTES_DIR;
  const visibleHomeCatalog = HOME_COMMAND_CATALOG.filter((entry) => allowedToolNames.has(entry.name));
  const visibleDockerCatalog = DOCKER_COMMAND_CATALOG.filter((entry) => allowedToolNames.has(entry.name));
  const visiblePlexCatalog = PLEX_COMMAND_CATALOG.filter((entry) => allowedToolNames.has(entry.name));
  const visibleWindowsCatalog = WINDOWS_COMMAND_CATALOG.filter((entry) => allowedToolNames.has(entry.name));
  const visibleStorageCatalog = STORAGE_COMMAND_CATALOG.filter((entry) => allowedToolNames.has(entry.name));
  const visibleBackupCatalog = BACKUP_COMMAND_CATALOG.filter((entry) => allowedToolNames.has(entry.name));
  const visibleNetworkCatalog = NETWORK_COMMAND_CATALOG.filter((entry) => allowedToolNames.has(entry.name));
  const visibleFileCatalog = FILE_COMMAND_CATALOG.filter((entry) => allowedToolNames.has(entry.name));
  const visibleRepoCatalog = REPO_COMMAND_CATALOG.filter((entry) => allowedToolNames.has(entry.name));

  server.tool("ping", "Use this to verify that the MCP server is reachable.", {}, async () => {
    return withAudit("ping", undefined, async () => ({
      content: [{ type: "text", text: "pong" }]
    }));
  });

  server.tool(
    "get_time",
    "Use this to get the current server time in ISO 8601 format.",
    {},
    async () => {
      return withAudit("get_time", undefined, async () => ({
        content: [{ type: "text", text: new Date().toISOString() }]
      }));
    }
  );

  server.tool(
    "list_home_commands",
    "Use this to list the major MCP commands exposed by this server, with optional area and keyword filters.",
    {
      area: z
        .enum(["all", "discovery", "snapshot", "host", "assistant", "windows", "storage", "backup", "network", "files", "repos", "docker", "plex", "notes"])
        .optional()
        .describe("Optional command group filter"),
      query: z
        .string()
        .min(1)
        .optional()
        .describe("Optional keyword filter, for example stale, mount, restart, watch, or summary")
    },
    async ({ area, query }) => {
      return withAudit("list_home_commands", { area, query }, async () => {
        const scopedCatalog = !area || area === "all" ? visibleHomeCatalog : visibleHomeCatalog.filter((entry) => entry.group === area);
        const text = [`Tool profile: ${profile}`, "", formatCommandCatalog("Home", scopedCatalog, query)].join("\n");

        return {
          content: [{ type: "text", text }]
        };
      });
    }
  );

  server.tool(
    "list_docker_commands",
    "Use this to list Docker-related MCP commands exposed by this server, with an optional keyword filter.",
    {
      query: z
        .string()
        .min(1)
        .optional()
        .describe("Optional keyword filter, for example cleanup, volume, project, resource, or health")
    },
    async ({ query }) => {
      return withAudit("list_docker_commands", { query }, async () => ({
        content: [{ type: "text", text: [`Tool profile: ${profile}`, "", formatCommandCatalog("Docker", visibleDockerCatalog, query)].join("\n") }]
      }));
    }
  );

  server.tool(
    "list_plex_commands",
    "Use this to list Plex-related MCP commands exposed by this server, with an optional keyword filter.",
    {
      query: z
        .string()
        .min(1)
        .optional()
        .describe("Optional keyword filter, for example episode, show, duplicate, recent, watch, or search")
    },
    async ({ query }) => {
      return withAudit("list_plex_commands", { query }, async () => ({
        content: [{ type: "text", text: [`Tool profile: ${profile}`, "", formatCommandCatalog("Plex", visiblePlexCatalog, query)].join("\n") }]
      }));
    }
  );

  server.tool(
    "list_windows_commands",
    "Use this to list Windows service, task, and listening-port MCP commands exposed by this server.",
    {
      query: z.string().min(1).optional().describe("Optional keyword filter, for example service, task, port, or failed")
    },
    async ({ query }) => {
      return withAudit("list_windows_commands", { query }, async () => ({
        content: [
          {
            type: "text",
            text: [`Tool profile: ${profile}`, "", formatCommandCatalog("Windows", visibleWindowsCatalog, query)].join("\n")
          }
        ]
      }));
    }
  );

  server.tool(
    "list_storage_commands",
    "Use this to list storage-focused MCP commands for disk pressure and large-folder review.",
    {
      query: z.string().min(1).optional().describe("Optional keyword filter, for example disk, folder, or space")
    },
    async ({ query }) => {
      return withAudit("list_storage_commands", { query }, async () => ({
        content: [
          {
            type: "text",
            text: [`Tool profile: ${profile}`, "", formatCommandCatalog("Storage", visibleStorageCatalog, query)].join("\n")
          }
        ]
      }));
    }
  );

  server.tool(
    "list_backup_commands",
    "Use this to list backup-focused MCP commands exposed by this server.",
    {
      query: z.string().min(1).optional().describe("Optional keyword filter, for example backup, stale, or failed")
    },
    async ({ query }) => {
      return withAudit("list_backup_commands", { query }, async () => ({
        content: [
          {
            type: "text",
            text: [`Tool profile: ${profile}`, "", formatCommandCatalog("Backups", visibleBackupCatalog, query)].join("\n")
          }
        ]
      }));
    }
  );

  server.tool(
    "list_network_commands",
    "Use this to list network-focused MCP commands for endpoint checks, DNS, Tailscale, and public exposure.",
    {
      query: z.string().min(1).optional().describe("Optional keyword filter, for example endpoint, dns, tailscale, or exposure")
    },
    async ({ query }) => {
      return withAudit("list_network_commands", { query }, async () => ({
        content: [
          {
            type: "text",
            text: [`Tool profile: ${profile}`, "", formatCommandCatalog("Network", visibleNetworkCatalog, query)].join("\n")
          }
        ]
      }));
    }
  );

  server.tool(
    "list_file_commands",
    "Use this to list indexed-file and folder MCP commands exposed by this server.",
    {
      query: z.string().min(1).optional().describe("Optional keyword filter, for example search, recent, read, or folder")
    },
    async ({ query }) => {
      return withAudit("list_file_commands", { query }, async () => ({
        content: [
          {
            type: "text",
            text: [`Tool profile: ${profile}`, "", formatCommandCatalog("Files", visibleFileCatalog, query)].join("\n")
          }
        ]
      }));
    }
  );

  server.tool(
    "list_repo_commands",
    "Use this to list local git repository MCP commands exposed by this server.",
    {
      query: z.string().min(1).optional().describe("Optional keyword filter, for example dirty, branch, repo, or activity")
    },
    async ({ query }) => {
      return withAudit("list_repo_commands", { query }, async () => ({
        content: [
          {
            type: "text",
            text: [`Tool profile: ${profile}`, "", formatCommandCatalog("Repos", visibleRepoCatalog, query)].join("\n")
          }
        ]
      }));
    }
  );

  server.tool(
    "get_snapshot_status",
    "Use this to inspect host snapshot freshness, scheduled refresh state, and whether Docker and Plex data may be stale.",
    {},
    async () => {
      return withAudit("get_snapshot_status", undefined, async () => {
        try {
          const overview = await readSnapshotOverview();
          return {
            content: [{ type: "text", text: formatSnapshotStatus(overview, profile) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool get_snapshot_status returned error", message);
          return {
            content: [{ type: "text", text: `Unable to read snapshot freshness: ${message}` }],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "get_snapshot_history",
    "Use this to review recent snapshot refresh runs with timings, warnings, and failures.",
    {
      limit: z.number().int().min(1).max(100).optional().describe("Maximum number of recent runs to include, from 1 to 100")
    },
    async ({ limit }) => {
      return withAudit("get_snapshot_history", { limit }, async () => {
        try {
          const history = await readSnapshotHistory(limit);
          return {
            content: [{ type: "text", text: formatSnapshotHistory(history, { limit }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool get_snapshot_history returned error", message);
          return {
            content: [{ type: "text", text: `Unable to read snapshot history: ${message}` }],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "get_snapshot_recommendations",
    "Use this to explain likely causes of stale or incomplete snapshots and recommend the next troubleshooting steps.",
    {},
    async () => {
      return withAudit("get_snapshot_recommendations", undefined, async () => {
        try {
          const [overview, history] = await Promise.all([readSnapshotOverview(), readSnapshotHistory(10)]);
          return {
            content: [{ type: "text", text: formatSnapshotRecommendations(overview, history, profile) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool get_snapshot_recommendations returned error", message);
          return {
            content: [{ type: "text", text: `Unable to build snapshot recommendations: ${message}` }],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "get_operations_dashboard",
    "Use this to roll up snapshot freshness, Windows host health, Docker, Plex activity, notes, and homelab status into one report.",
    {},
    async () => {
      return withAudit("get_operations_dashboard", undefined, async () => {
        try {
          return {
            content: [{ type: "text", text: await formatOperationsDashboardForProfile(notesDir, profile) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool get_operations_dashboard returned error", message);
          return {
            content: [{ type: "text", text: `Unable to build the operations dashboard: ${message}` }],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "get_attention_report",
    "Use this to highlight stale snapshots, Docker problems, stopped automatic services, failed tasks, low-space disks, backup issues, unhealthy endpoints, and dirty repos.",
    {},
    async () => {
      return withAudit("get_attention_report", undefined, async () => {
        try {
          return {
            content: [{ type: "text", text: await formatAttentionReport(profile) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool get_attention_report returned error", message);
          return {
            content: [{ type: "text", text: `Unable to build the attention report: ${message}` }],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "get_daily_digest",
    "Use this to summarize the current operational state and recommend the most relevant next checks.",
    {},
    async () => {
      return withAudit("get_daily_digest", undefined, async () => {
        try {
          return {
            content: [{ type: "text", text: await formatDailyDigest(profile) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool get_daily_digest returned error", message);
          return {
            content: [{ type: "text", text: `Unable to build the daily digest: ${message}` }],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "summarize_system_state",
    "Use this as a natural alias for a broad operational system-state summary across the current tool profile.",
    {},
    async () => {
      return withAudit("summarize_system_state", undefined, async () => {
        try {
          const dashboard = await formatOperationsDashboardForProfile(notesDir, profile);
          return {
            content: [{ type: "text", text: `System state summary\n\n${dashboard}` }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool summarize_system_state returned error", message);
          return {
            content: [{ type: "text", text: `Unable to summarize the system state: ${message}` }],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "recommend_next_checks",
    "Use this to recommend the next MCP commands to run for a problem area like backups, Docker, Plex, or networking.",
    {
      query: z
        .string()
        .min(1)
        .optional()
        .describe("Optional issue or domain hint, for example backup, plex offline, or storage pressure")
    },
    async ({ query }) => {
      return withAudit("recommend_next_checks", { query }, async () => {
        try {
          return {
            content: [{ type: "text", text: await formatRecommendNextChecks(profile, query) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool recommend_next_checks returned error", message);
          return {
            content: [{ type: "text", text: `Unable to recommend next checks: ${message}` }],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "explain_issue",
    "Use this to summarize the current signals behind a problem description and point you to the most relevant next commands.",
    {
      query: z.string().min(1).describe("Issue description, for example plex offline, backup failures, or docker restart loop")
    },
    async ({ query }) => {
      return withAudit("explain_issue", { query }, async () => {
        try {
          return {
            content: [{ type: "text", text: await formatIssueExplanation(profile, query) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool explain_issue returned error", message);
          return {
            content: [{ type: "text", text: `Unable to explain the issue: ${message}` }],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "find_home",
    "Use this as the broad natural-language entrypoint when you are not sure whether the answer lives in Plex, Docker, host, storage, backups, network, files, repos, notes, or homelab data.",
    {
      query: z.string().min(1).describe("Natural search phrase, for example Sopranos, backups, or mcp-home"),
      area: z
        .enum(["auto", "docker", "plex", "notes", "homelab", "host", "assistant", "storage", "backup", "network", "files", "repos"])
        .optional()
        .describe("Optional scope if you already know the area to search"),
      limit: z.number().int().min(1).max(10).optional().describe("Maximum number of top matches to include, from 1 to 10")
    },
    async ({ query, area, limit }) => {
      return withAudit("find_home", { query, area, limit }, async () => {
        try {
          return {
            content: [{ type: "text", text: await formatHomeFind(notesDir, { query, area, limit, profile }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool find_home returned error", message);
          return {
            content: [{ type: "text", text: `Unable to run the home finder: ${message}` }],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "find_docker",
    "Use this as the natural Docker entrypoint for container, project, image, network, or volume lookups.",
    {
      query: z.string().min(1).describe("Natural Docker query, for example mcp-home, caddy, bridge, or postgres"),
      domain: z
        .enum(["auto", "container", "project", "image", "network", "volume"])
        .optional()
        .describe("Optional Docker object scope"),
      limit: z.number().int().min(1).max(25).optional().describe("Maximum number of matches to return, from 1 to 25")
    },
    async ({ query, domain, limit }) => {
      return withAudit("find_docker", { query, domain, limit }, async () => {
        try {
          const status = await readWindowsHostStatus();
          return {
            content: [{ type: "text", text: formatDockerFind(status, { query, domain, limit }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool find_docker returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to search Docker data: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "find_host",
    "Use this as the natural Windows host entrypoint for components, resources, disks, storage folders, backups, endpoint checks, Tailscale, services, tasks, and ports.",
    {
      query: z.string().min(1).describe("Natural host query, for example memory, C:, ethernet, or corsair"),
      domain: z
        .enum(["auto", "component", "resource", "disk", "storage", "network", "backup", "endpoint", "tailscale", "service", "task", "port", "event", "share", "assistant"])
        .optional()
        .describe("Optional host scope"),
      limit: z.number().int().min(1).max(25).optional().describe("Maximum number of matches to return, from 1 to 25")
    },
    async ({ query, domain, limit }) => {
      return withAudit("find_host", { query, domain, limit }, async () => {
        try {
          const status = await readWindowsHostStatus();
          if (domain === "storage") {
            return {
              content: [{ type: "text", text: formatStorageFind(status, { query, limit }) }]
            };
          }
          if (domain === "backup") {
            return {
              content: [{ type: "text", text: formatBackupFind(status, { query, limit }) }]
            };
          }
          if (domain === "network" || domain === "endpoint" || domain === "tailscale") {
            return {
              content: [{ type: "text", text: formatNetworkFind(status, { query, limit }) }]
            };
          }

          if (!domain || domain === "auto") {
            const sections: string[] = [];
            const hostText = formatHostFind(status, { query, limit });
            if (!hostText.includes(NO_HOST_FIND_RESULTS_MESSAGE)) {
              sections.push(hostText);
            }

            const storageText = formatStorageFind(status, { query, limit });
            if (!storageText.includes(NO_STORAGE_FIND_RESULTS_MESSAGE)) {
              sections.push(storageText);
            }

            const backupText = formatBackupFind(status, { query, limit });
            if (!backupText.includes(NO_BACKUP_FIND_RESULTS_MESSAGE)) {
              sections.push(backupText);
            }

            const networkText = formatNetworkFind(status, { query, limit });
            if (!networkText.includes(NO_NETWORK_FIND_RESULTS_MESSAGE)) {
              sections.push(networkText);
            }

            return {
              content: [
                {
                  type: "text",
                  text:
                    sections.length > 0
                      ? sections.join("\n\n")
                      : `Generated: ${status.generatedAt}\nHost finder for "${query}":\n\n- No host, storage, backup, or network matches were found.`
                }
              ]
            };
          }

          return {
            content: [{ type: "text", text: formatHostFind(status, { query, domain, limit }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool find_host returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to search host data: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "find_notes",
    "Use this as the natural note entrypoint when you want to find a note by slug, title, tags, or body text.",
    {
      query: z.string().min(1).describe("Natural note query, for example homelab, backups, or welcome"),
      limit: z.number().int().min(1).max(10).optional().describe("Maximum number of matching notes to include, from 1 to 10")
    },
    async ({ query, limit }) => {
      return withAudit("find_notes", { query, limit }, async () => {
        try {
          return {
            content: [{ type: "text", text: await formatNotesFind(notesDir, query, limit) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool find_notes returned error", message);
          return {
            content: [{ type: "text", text: `Unable to search notes: ${message}` }],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "find_plex",
    "Use this as the broad Plex entrypoint for natural requests like finding Sopranos. It can route to title details, show summaries, or episode results.",
    {
      query: z.string().min(1).describe("Natural Plex query, for example Sopranos, Sopranos season 2, or Pine Barrens"),
      mediaType: z
        .enum(["movie", "tv", "audio"])
        .optional()
        .describe("Optional media scope: movie for films, tv for shows, or audio for artists, albums, and tracks"),
      intent: z
        .enum(["auto", "details", "summary", "episodes", "episode_search"])
        .optional()
        .describe("Optional routing hint. Leave as auto for normal natural-language lookups."),
      section: z.string().min(1).optional().describe("Optional Plex library section name filter"),
      seasonIndex: z.number().int().min(1).optional().describe("Optional season number when you want episode browsing"),
      limit: z.number().int().min(1).max(25).optional().describe("Maximum number of results to return, from 1 to 25")
    },
    async ({ query, mediaType, intent, section, seasonIndex, limit }) => {
      return withAudit("find_plex", { query, mediaType, intent, section, seasonIndex, limit }, async () => {
        try {
          const index = await readPlexLibraryIndex();
          const result = findPlex(index, { query, mediaType, intent, section, seasonIndex, limit });

          return {
            content: [{ type: "text", text: formatPlexFind(result, index, { query, mediaType, intent, section, seasonIndex, limit }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool find_plex returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to run Plex finder: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "get_homelab_status",
    "Use this to read the current homelab status summary from a local JSON snapshot. Optionally filter by service name.",
    {
      service: z.string().min(1).optional().describe("Optional service name filter, for example nas or backups")
    },
    async ({ service }) => {
      return withAudit("get_homelab_status", { service }, async () => {
        try {
          const status = await readHomelabStatus();
          return {
            content: [{ type: "text", text: formatHomelabStatus(status, service) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool get_homelab_status returned error", message);
          return {
            content: [{ type: "text", text: `Unable to read homelab status: ${message}` }],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "get_host_status",
    "Use this to read the current Windows host status snapshot, including Docker Desktop, Corsair iCUE, Plex, and system uptime. Optionally filter by component name.",
    {
      component: z
        .string()
        .min(1)
        .optional()
        .describe("Optional component filter, for example system, docker, corsair, or plex")
    },
    async ({ component }) => {
      return withAudit("get_host_status", { component }, async () => {
        try {
          const status = await readWindowsHostStatus();
          return {
            content: [{ type: "text", text: formatWindowsHostStatus(status, component) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool get_host_status returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to read Windows host status: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "get_host_resources",
    "Use this to read CPU, memory, disk, and network telemetry from the Windows host snapshot.",
    {},
    async () => {
      return withAudit("get_host_resources", undefined, async () => {
        try {
          const status = await readWindowsHostStatus();
          return {
            content: [{ type: "text", text: formatHostResources(status) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool get_host_resources returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to read host resources: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "list_host_disks",
    "Use this to list Windows disks with used and free space plus filesystem and volume labels.",
    {
      name: z.string().min(1).optional().describe("Optional disk, volume label, or filesystem filter"),
      limit: z.number().int().min(1).max(50).optional().describe("Maximum number of disks to return, from 1 to 50")
    },
    async ({ name, limit }) => {
      return withAudit("list_host_disks", { name, limit }, async () => {
        try {
          const status = await readWindowsHostStatus();
          return {
            content: [{ type: "text", text: formatHostDisks(status, { name, limit }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool list_host_disks returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to list host disks: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "get_host_network_summary",
    "Use this to list host network adapters, IP addresses, gateways, and DNS settings from the Windows host snapshot.",
    {
      query: z.string().min(1).optional().describe("Optional adapter, address, or DNS filter"),
      limit: z.number().int().min(1).max(50).optional().describe("Maximum number of adapters to return, from 1 to 50")
    },
    async ({ query, limit }) => {
      return withAudit("get_host_network_summary", { query, limit }, async () => {
        try {
          const status = await readWindowsHostStatus();
          return {
            content: [{ type: "text", text: formatHostNetworkSummary(status, { query, limit }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool get_host_network_summary returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to read host network summary: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "get_storage_health",
    "Use this to summarize disk free space plus the largest scanned folders from the latest storage snapshot.",
    {},
    async () => {
      return withAudit("get_storage_health", undefined, async () => {
        try {
          const status = await readWindowsHostStatus();
          return {
            content: [{ type: "text", text: formatStorageHealth(status) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool get_storage_health returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to read storage health: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "find_low_space_locations",
    "Use this to list disks below the free-space threshold and the biggest scanned folders on those drives.",
    {
      thresholdPercent: z.number().min(1).max(75).optional().describe("Optional free-space threshold percent from 1 to 75"),
      limit: z.number().int().min(1).max(50).optional().describe("Maximum number of disks to return, from 1 to 50")
    },
    async ({ thresholdPercent, limit }) => {
      return withAudit("find_low_space_locations", { thresholdPercent, limit }, async () => {
        try {
          const status = await readWindowsHostStatus();
          return {
            content: [{ type: "text", text: formatLowSpaceLocations(status, { thresholdPercent, limit }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool find_low_space_locations returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to inspect low-space disks: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "list_large_folders",
    "Use this to list the largest scanned folders under the configured storage roots.",
    {
      root: z.string().min(1).optional().describe("Optional scan root, path fragment, or folder-name filter"),
      limit: z.number().int().min(1).max(100).optional().describe("Maximum number of folders to return, from 1 to 100")
    },
    async ({ root, limit }) => {
      return withAudit("list_large_folders", { root, limit }, async () => {
        try {
          const status = await readWindowsHostStatus();
          return {
            content: [{ type: "text", text: formatLargeFolders(status, { root, limit }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool list_large_folders returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to list large folders: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "get_backup_status",
    "Use this to summarize detected backup-related scheduled tasks and whether they look healthy, stale, or failing.",
    {},
    async () => {
      return withAudit("get_backup_status", undefined, async () => {
        try {
          const status = await readWindowsHostStatus();
          return {
            content: [{ type: "text", text: formatBackupStatus(status) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool get_backup_status returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to read backup status: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "get_backup_target_health",
    "Use this to inspect backup destination reachability, free space, and stale or missing backup targets from the latest host snapshot.",
    {
      query: z.string().min(1).optional().describe("Optional backup target path, kind, or hostname filter"),
      issue: z
        .enum(["none", "warning", "failure"])
        .optional()
        .describe("Optional backup target issue filter"),
      limit: z.number().int().min(1).max(100).optional().describe("Maximum number of backup targets to return, from 1 to 100")
    },
    async ({ query, issue, limit }) => {
      return withAudit("get_backup_target_health", { query, issue, limit }, async () => {
        try {
          const status = await readWindowsHostStatus();
          return {
            content: [{ type: "text", text: formatBackupTargetHealth(status, { query, issue, limit }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool get_backup_target_health returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to read backup target health: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "find_failed_backups",
    "Use this to list backup-related scheduled tasks with stale runs, warnings, disabled state, or failures.",
    {
      limit: z.number().int().min(1).max(100).optional().describe("Maximum number of backup tasks to return, from 1 to 100")
    },
    async ({ limit }) => {
      return withAudit("find_failed_backups", { limit }, async () => {
        try {
          const status = await readWindowsHostStatus();
          return {
            content: [{ type: "text", text: formatFailedBackups(status, { limit }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool find_failed_backups returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to inspect backup failures: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "check_endpoint_health",
    "Use this to read the latest snapshot of configured endpoint checks and their reachability results.",
    {
      query: z.string().min(1).optional().describe("Optional endpoint name or URL filter"),
      unhealthyOnly: z.boolean().optional().describe("Optional filter to show only unhealthy endpoints"),
      limit: z.number().int().min(1).max(100).optional().describe("Maximum number of endpoint checks to return, from 1 to 100")
    },
    async ({ query, unhealthyOnly, limit }) => {
      return withAudit("check_endpoint_health", { query, unhealthyOnly, limit }, async () => {
        try {
          const status = await readWindowsHostStatus();
          return {
            content: [{ type: "text", text: formatEndpointHealth(status, { query, unhealthyOnly, limit }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool check_endpoint_health returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to inspect endpoint health: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "get_internet_health",
    "Use this to summarize internet-facing endpoint reachability and distinguish local-only failures from broader external issues.",
    {},
    async () => {
      return withAudit("get_internet_health", undefined, async () => {
        try {
          const status = await readWindowsHostStatus();
          return {
            content: [{ type: "text", text: formatInternetHealth(status) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool get_internet_health returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to read internet health: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "get_dns_summary",
    "Use this to summarize DNS servers from the latest Windows adapter snapshot and Tailscale MagicDNS when present.",
    {},
    async () => {
      return withAudit("get_dns_summary", undefined, async () => {
        try {
          const status = await readWindowsHostStatus();
          return {
            content: [{ type: "text", text: formatDnsSummary(status) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool get_dns_summary returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to read the DNS summary: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "get_tailscale_status",
    "Use this to summarize local Tailscale backend state, peers, Funnel, and Serve targets from the latest snapshot.",
    {},
    async () => {
      return withAudit("get_tailscale_status", undefined, async () => {
        try {
          const status = await readWindowsHostStatus();
          return {
            content: [{ type: "text", text: formatTailscaleStatus(status) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool get_tailscale_status returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to read the Tailscale status snapshot: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "get_public_exposure_summary",
    "Use this to roll up Tailscale Funnel or Serve targets, public Docker bindings, and public endpoint probes into one view.",
    {},
    async () => {
      return withAudit("get_public_exposure_summary", undefined, async () => {
        try {
          const status = await readWindowsHostStatus();
          return {
            content: [{ type: "text", text: formatPublicExposureSummary(status) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool get_public_exposure_summary returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to read the public exposure summary: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "list_windows_services",
    "Use this to list Windows services from the host snapshot, with optional query, state, and start-mode filters.",
    {
      query: z.string().min(1).optional().describe("Optional service name, display name, or description filter"),
      state: z.string().min(1).optional().describe("Optional service state filter, for example Running or Stopped"),
      startMode: z.string().min(1).optional().describe("Optional start mode filter, for example Auto or Manual"),
      limit: z.number().int().min(1).max(100).optional().describe("Maximum number of services to return, from 1 to 100")
    },
    async ({ query, state, startMode, limit }) => {
      return withAudit("list_windows_services", { query, state, startMode, limit }, async () => {
        try {
          const status = await readWindowsHostStatus();
          return {
            content: [{ type: "text", text: formatWindowsServices(status, { query, state, startMode, limit }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool list_windows_services returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to list Windows services: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "get_windows_service_details",
    "Use this to inspect one Windows service by service name or display name.",
    {
      query: z.string().min(1).describe("Service name or display name, for example Tailscale or Docker Desktop Service")
    },
    async ({ query }) => {
      return withAudit("get_windows_service_details", { query }, async () => {
        try {
          const status = await readWindowsHostStatus();
          return {
            content: [{ type: "text", text: formatWindowsServiceDetails(status, query) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool get_windows_service_details returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to inspect the Windows service: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "get_windows_service_issues",
    "Use this to surface automatic Windows services that appear stopped in the latest host snapshot.",
    {
      limit: z.number().int().min(1).max(100).optional().describe("Maximum number of stopped automatic services to return, from 1 to 100")
    },
    async ({ limit }) => {
      return withAudit("get_windows_service_issues", { limit }, async () => {
        try {
          const status = await readWindowsHostStatus();
          return {
            content: [{ type: "text", text: formatWindowsServiceIssues(status, { limit }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool get_windows_service_issues returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to inspect Windows service issues: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "get_windows_event_summary",
    "Use this to summarize recent Windows Event Viewer errors, warnings, and critical events from the latest host snapshot.",
    {
      logName: z.string().min(1).optional().describe("Optional event log name filter, for example System or Application"),
      level: z
        .enum(["critical", "error", "warning", "information", "verbose"])
        .optional()
        .describe("Optional event level filter"),
      source: z.string().min(1).optional().describe("Optional provider or source filter"),
      limit: z.number().int().min(1).max(100).optional().describe("Maximum number of recent event entries to include, from 1 to 100")
    },
    async ({ logName, level, source, limit }) => {
      return withAudit("get_windows_event_summary", { logName, level, source, limit }, async () => {
        try {
          const status = await readWindowsHostStatus();
          return {
            content: [{ type: "text", text: formatWindowsEventSummary(status, { logName, level, source, limit }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool get_windows_event_summary returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to summarize Windows events: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "search_windows_events",
    "Use this to search recent Windows event entries by message text, provider, event ID, or log name.",
    {
      query: z.string().min(1).describe("Search term for event message, provider, or event ID"),
      logName: z.string().min(1).optional().describe("Optional event log name filter"),
      level: z
        .enum(["critical", "error", "warning", "information", "verbose"])
        .optional()
        .describe("Optional event level filter"),
      limit: z.number().int().min(1).max(100).optional().describe("Maximum number of matching events to return, from 1 to 100")
    },
    async ({ query, logName, level, limit }) => {
      return withAudit("search_windows_events", { query, logName, level, limit }, async () => {
        try {
          const status = await readWindowsHostStatus();
          return {
            content: [{ type: "text", text: searchWindowsEvents(status, { query, logName, level, limit }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool search_windows_events returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to search Windows events: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "find_recent_service_failures",
    "Use this to highlight recent Windows events that likely point to service start, stop, or crash failures.",
    {
      limit: z.number().int().min(1).max(100).optional().describe("Maximum number of service-failure events to return, from 1 to 100")
    },
    async ({ limit }) => {
      return withAudit("find_recent_service_failures", { limit }, async () => {
        try {
          const status = await readWindowsHostStatus();
          return {
            content: [{ type: "text", text: formatRecentServiceFailures(status, { limit }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool find_recent_service_failures returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to inspect recent service failures: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "list_scheduled_tasks",
    "Use this to list Windows scheduled tasks with optional query, state, and enabled filters.",
    {
      query: z.string().min(1).optional().describe("Optional task name, path, description, or action filter"),
      state: z.string().min(1).optional().describe("Optional task state filter"),
      enabled: z.boolean().optional().describe("Optional enabled or disabled filter"),
      limit: z.number().int().min(1).max(100).optional().describe("Maximum number of scheduled tasks to return, from 1 to 100")
    },
    async ({ query, state, enabled, limit }) => {
      return withAudit("list_scheduled_tasks", { query, state, enabled, limit }, async () => {
        try {
          const status = await readWindowsHostStatus();
          return {
            content: [{ type: "text", text: formatScheduledTasks(status, { query, state, enabled, limit }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool list_scheduled_tasks returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to list scheduled tasks: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "get_scheduled_task_details",
    "Use this to inspect one Windows scheduled task with its actions, triggers, and recent run details.",
    {
      query: z.string().min(1).describe("Task name or full task path, for example MCP Home Host Refresh")
    },
    async ({ query }) => {
      return withAudit("get_scheduled_task_details", { query }, async () => {
        try {
          const status = await readWindowsHostStatus();
          return {
            content: [{ type: "text", text: formatScheduledTaskDetails(status, query) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool get_scheduled_task_details returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to inspect the scheduled task: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "find_failed_tasks",
    "Use this to list scheduled tasks with non-zero last results in the latest host snapshot.",
    {
      limit: z.number().int().min(1).max(100).optional().describe("Maximum number of failed tasks to return, from 1 to 100")
    },
    async ({ limit }) => {
      return withAudit("find_failed_tasks", { limit }, async () => {
        try {
          const status = await readWindowsHostStatus();
          return {
            content: [{ type: "text", text: formatFailedScheduledTasks(status, { limit }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool find_failed_tasks returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to list failed scheduled tasks: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "list_listening_ports",
    "Use this to list listening TCP and UDP ports from the Windows host snapshot, including process and service names.",
    {
      query: z.string().min(1).optional().describe("Optional process, service, address, or port search term"),
      protocol: z.enum(["tcp", "udp"]).optional().describe("Optional protocol filter"),
      port: z.number().int().min(1).max(65535).optional().describe("Optional exact local port filter"),
      limit: z.number().int().min(1).max(200).optional().describe("Maximum number of listening ports to return, from 1 to 200")
    },
    async ({ query, protocol, port, limit }) => {
      return withAudit("list_listening_ports", { query, protocol, port, limit }, async () => {
        try {
          const status = await readWindowsHostStatus();
          return {
            content: [{ type: "text", text: formatListeningPorts(status, { query, protocol, port, limit }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool list_listening_ports returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to list listening ports: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "get_share_status",
    "Use this to summarize SMB shares and whether their configured backing paths exist on the Windows host.",
    {
      query: z.string().min(1).optional().describe("Optional share name, path, or description filter"),
      missingOnly: z.boolean().optional().describe("Optional filter to show only shares whose backing paths are missing"),
      limit: z.number().int().min(1).max(100).optional().describe("Maximum number of shares to return, from 1 to 100")
    },
    async ({ query, missingOnly, limit }) => {
      return withAudit("get_share_status", { query, missingOnly, limit }, async () => {
        try {
          const status = await readWindowsHostStatus();
          return {
            content: [{ type: "text", text: formatShareStatus(status, { query, missingOnly, limit }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool get_share_status returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to read SMB share status: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "get_home_assistant_status",
    "Use this to inspect Home Assistant connectivity, top domains, and unavailable entities from the latest host snapshot.",
    {},
    async () => {
      return withAudit("get_home_assistant_status", undefined, async () => {
        try {
          const status = await readWindowsHostStatus();
          return {
            content: [{ type: "text", text: formatHomeAssistantStatus(status) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool get_home_assistant_status returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to read Home Assistant status: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "get_docker_status",
    "Use this to read the current Docker Desktop and container summary from the local Windows host snapshot.",
    {},
    async () => {
      return withAudit("get_docker_status", undefined, async () => {
        try {
          const status = await readWindowsHostStatus();
          return {
            content: [{ type: "text", text: formatDockerStatus(status) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool get_docker_status returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to read Docker status: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "list_docker_containers",
    "Use this to list Docker containers from the local Windows host snapshot, with optional name or state filters.",
    {
      name: z.string().min(1).optional().describe("Optional container name or image substring filter"),
      state: z
        .enum(["running", "exited", "paused", "restarting", "created", "dead"])
        .optional()
        .describe("Optional Docker state filter"),
      limit: z.number().int().min(1).max(50).optional().describe("Maximum number of containers to return, from 1 to 50")
    },
    async ({ name, state, limit }) => {
      return withAudit("list_docker_containers", { name, state, limit }, async () => {
        try {
          const status = await readWindowsHostStatus();
          return {
            content: [{ type: "text", text: formatDockerContainers(status, { name, state, limit }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool list_docker_containers returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to list Docker containers: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "get_docker_projects",
    "Use this to summarize Docker Compose projects and their container states from the local Windows host snapshot.",
    {
      project: z.string().min(1).optional().describe("Optional compose project name filter"),
      limit: z.number().int().min(1).max(50).optional().describe("Maximum number of projects to return, from 1 to 50")
    },
    async ({ project, limit }) => {
      return withAudit("get_docker_projects", { project, limit }, async () => {
        try {
          const status = await readWindowsHostStatus();
          return {
            content: [{ type: "text", text: formatDockerProjects(status, { project, limit }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool get_docker_projects returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to summarize Docker projects: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "get_docker_issues",
    "Use this to list unhealthy, restarting, dead, or non-zero exited Docker containers from the local Windows host snapshot.",
    {
      limit: z.number().int().min(1).max(50).optional().describe("Maximum number of problem containers to return, from 1 to 50")
    },
    async ({ limit }) => {
      return withAudit("get_docker_issues", { limit }, async () => {
        try {
          const status = await readWindowsHostStatus();
          return {
            content: [{ type: "text", text: formatDockerIssues(status, { limit }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool get_docker_issues returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to read Docker issues: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "get_docker_container_details",
    "Use this to inspect a specific Docker container from the local Windows host snapshot.",
    {
      name: z.string().min(1).describe("Container name, ID, or image substring to inspect")
    },
    async ({ name }) => {
      return withAudit("get_docker_container_details", { name }, async () => {
        try {
          const status = await readWindowsHostStatus();
          return {
            content: [{ type: "text", text: formatDockerContainerDetails(status, name) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool get_docker_container_details returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to inspect Docker container details: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "list_docker_images",
    "Use this to list Docker images from the local Windows host snapshot, with optional repository and dangling filters.",
    {
      repository: z.string().min(1).optional().describe("Optional repository substring filter"),
      dangling: z.boolean().optional().describe("Optional dangling image filter"),
      limit: z.number().int().min(1).max(50).optional().describe("Maximum number of images to return, from 1 to 50")
    },
    async ({ repository, dangling, limit }) => {
      return withAudit("list_docker_images", { repository, dangling, limit }, async () => {
        try {
          const status = await readWindowsHostStatus();
          return {
            content: [{ type: "text", text: formatDockerImages(status, { repository, dangling, limit }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool list_docker_images returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to list Docker images: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "list_docker_networks",
    "Use this to list Docker networks from the local Windows host snapshot, with an optional name filter.",
    {
      name: z.string().min(1).optional().describe("Optional Docker network name filter"),
      limit: z.number().int().min(1).max(50).optional().describe("Maximum number of networks to return, from 1 to 50")
    },
    async ({ name, limit }) => {
      return withAudit("list_docker_networks", { name, limit }, async () => {
        try {
          const status = await readWindowsHostStatus();
          return {
            content: [{ type: "text", text: formatDockerNetworks(status, { name, limit }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool list_docker_networks returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to list Docker networks: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "get_docker_resource_usage",
    "Use this to list live Docker resource usage from the latest local Windows host snapshot.",
    {
      name: z.string().min(1).optional().describe("Optional container name or image substring filter"),
      project: z.string().min(1).optional().describe("Optional compose project name filter"),
      limit: z.number().int().min(1).max(50).optional().describe("Maximum number of containers to return, from 1 to 50")
    },
    async ({ name, project, limit }) => {
      return withAudit("get_docker_resource_usage", { name, project, limit }, async () => {
        try {
          const status = await readWindowsHostStatus();
          return {
            content: [{ type: "text", text: formatDockerResourceUsage(status, { name, project, limit }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool get_docker_resource_usage returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to read Docker resource usage: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "get_docker_recent_activity",
    "Use this to list recently started, finished, or created Docker containers from the local Windows host snapshot.",
    {
      state: z
        .enum(["running", "exited", "paused", "restarting", "created", "dead"])
        .optional()
        .describe("Optional Docker state filter"),
      sinceHours: z.number().int().min(1).max(24 * 30).optional().describe("Activity lookback window in hours, from 1 to 720"),
      limit: z.number().int().min(1).max(50).optional().describe("Maximum number of containers to return, from 1 to 50")
    },
    async ({ state, sinceHours, limit }) => {
      return withAudit("get_docker_recent_activity", { state, sinceHours, limit }, async () => {
        try {
          const status = await readWindowsHostStatus();
          return {
            content: [{ type: "text", text: formatDockerRecentActivity(status, { state, sinceHours, limit }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool get_docker_recent_activity returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to read Docker recent activity: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "get_docker_compose_health",
    "Use this to summarize Docker Compose project health from the local Windows host snapshot.",
    {
      project: z.string().min(1).optional().describe("Optional compose project name filter"),
      limit: z.number().int().min(1).max(50).optional().describe("Maximum number of projects to return, from 1 to 50")
    },
    async ({ project, limit }) => {
      return withAudit("get_docker_compose_health", { project, limit }, async () => {
        try {
          const status = await readWindowsHostStatus();
          return {
            content: [{ type: "text", text: formatDockerComposeHealth(status, { project, limit }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool get_docker_compose_health returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to summarize Docker Compose health: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "get_docker_project_details",
    "Use this to inspect a specific Docker Compose project from the local Windows host snapshot.",
    {
      project: z.string().min(1).describe("Compose project name to inspect")
    },
    async ({ project }) => {
      return withAudit("get_docker_project_details", { project }, async () => {
        try {
          const status = await readWindowsHostStatus();
          return {
            content: [{ type: "text", text: formatDockerProjectDetails(status, project) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool get_docker_project_details returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to inspect Docker project details: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "list_docker_volumes",
    "Use this to list Docker volumes from the local Windows host snapshot, with optional usage and anonymity filters.",
    {
      name: z.string().min(1).optional().describe("Optional Docker volume name filter"),
      inUse: z.boolean().optional().describe("Optional filter for whether the volume is currently attached to a container"),
      anonymous: z.boolean().optional().describe("Optional filter for anonymous Docker volumes"),
      limit: z.number().int().min(1).max(50).optional().describe("Maximum number of volumes to return, from 1 to 50")
    },
    async ({ name, inUse, anonymous, limit }) => {
      return withAudit("list_docker_volumes", { name, inUse, anonymous, limit }, async () => {
        try {
          const status = await readWindowsHostStatus();
          return {
            content: [{ type: "text", text: formatDockerVolumes(status, { name, inUse, anonymous, limit }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool list_docker_volumes returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to list Docker volumes: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "get_docker_cleanup_candidates",
    "Use this to summarize reclaimable Docker storage plus exited containers, unused images, and unused volumes from the local Windows host snapshot.",
    {
      olderThanHours: z.number().int().min(1).max(24 * 90).optional().describe("Only consider exited containers older than this many hours, from 1 to 2160"),
      limit: z.number().int().min(1).max(50).optional().describe("Maximum number of candidates per section to return, from 1 to 50")
    },
    async ({ olderThanHours, limit }) => {
      return withAudit("get_docker_cleanup_candidates", { olderThanHours, limit }, async () => {
        try {
          const status = await readWindowsHostStatus();
          return {
            content: [{ type: "text", text: formatDockerCleanupCandidates(status, { olderThanHours, limit }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool get_docker_cleanup_candidates returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to summarize Docker cleanup candidates: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "get_docker_port_map",
    "Use this to inspect Docker port mappings, compose context, and network placement from the local Windows host snapshot.",
    {
      name: z.string().min(1).optional().describe("Optional container name or image substring filter"),
      project: z.string().min(1).optional().describe("Optional compose project name filter"),
      publishedOnly: z.boolean().optional().describe("Whether to show only containers with published ports; defaults to true"),
      limit: z.number().int().min(1).max(50).optional().describe("Maximum number of containers to return, from 1 to 50")
    },
    async ({ name, project, publishedOnly, limit }) => {
      return withAudit("get_docker_port_map", { name, project, publishedOnly, limit }, async () => {
        try {
          const status = await readWindowsHostStatus();
          return {
            content: [{ type: "text", text: formatDockerPortMap(status, { name, project, publishedOnly, limit }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool get_docker_port_map returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to inspect Docker port mappings: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "get_docker_mount_report",
    "Use this to inspect Docker mounts, including bind and volume targets plus read-only vs read-write access.",
    {
      name: z.string().min(1).optional().describe("Optional container name or image substring filter"),
      project: z.string().min(1).optional().describe("Optional compose project name filter"),
      accessMode: z.enum(["ro", "rw"]).optional().describe("Optional access mode filter"),
      limit: z.number().int().min(1).max(50).optional().describe("Maximum number of containers to return, from 1 to 50")
    },
    async ({ name, project, accessMode, limit }) => {
      return withAudit("get_docker_mount_report", { name, project, accessMode, limit }, async () => {
        try {
          const status = await readWindowsHostStatus();
          return {
            content: [{ type: "text", text: formatDockerMountReport(status, { name, project, accessMode, limit }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool get_docker_mount_report returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to inspect Docker mounts: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "get_docker_restart_report",
    "Use this to inspect restart counts, recent failures, and exit patterns from the Docker snapshot.",
    {
      name: z.string().min(1).optional().describe("Optional container name or image substring filter"),
      project: z.string().min(1).optional().describe("Optional compose project name filter"),
      sinceHours: z.number().int().min(1).max(24 * 180).optional().describe("Lookback window in hours, from 1 to 4320"),
      includeHealthy: z.boolean().optional().describe("Include healthy containers too; defaults to false"),
      limit: z.number().int().min(1).max(50).optional().describe("Maximum number of containers to return, from 1 to 50")
    },
    async ({ name, project, sinceHours, includeHealthy, limit }) => {
      return withAudit("get_docker_restart_report", { name, project, sinceHours, includeHealthy, limit }, async () => {
        try {
          const status = await readWindowsHostStatus();
          return {
            content: [{ type: "text", text: formatDockerRestartReport(status, { name, project, sinceHours, includeHealthy, limit }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool get_docker_restart_report returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to inspect Docker restart patterns: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "get_docker_exposure_report",
    "Use this to classify published Docker ports as public, loopback-only, or host-IP bindings from the latest snapshot.",
    {
      name: z.string().min(1).optional().describe("Optional container name or image filter"),
      project: z.string().min(1).optional().describe("Optional compose project name filter"),
      limit: z.number().int().min(1).max(50).optional().describe("Maximum number of containers to return, from 1 to 50")
    },
    async ({ name, project, limit }) => {
      return withAudit("get_docker_exposure_report", { name, project, limit }, async () => {
        try {
          const status = await readWindowsHostStatus();
          return {
            content: [{ type: "text", text: formatDockerExposureReport(status, { name, project, limit }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool get_docker_exposure_report returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to inspect Docker exposure: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "get_docker_triage_report",
    "Use this to roll up Docker problems, restart hotspots, exposed ports, and resource pressure into one triage report.",
    {
      project: z.string().min(1).optional().describe("Optional compose project name filter"),
      sinceHours: z.number().int().min(1).max(24 * 180).optional().describe("Failure and restart lookback window in hours")
    },
    async ({ project, sinceHours }) => {
      return withAudit("get_docker_triage_report", { project, sinceHours }, async () => {
        try {
          const status = await readWindowsHostStatus();
          return {
            content: [{ type: "text", text: formatDockerTriageReport(status, { project, sinceHours }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool get_docker_triage_report returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to build Docker triage report: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "get_plex_status",
    "Use this to read the current Plex server status and library summary from the local Windows host snapshot.",
    {},
    async () => {
      return withAudit("get_plex_status", undefined, async () => {
        try {
          const status = await readWindowsHostStatus();
          return {
            content: [{ type: "text", text: formatPlexStatus(status) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool get_plex_status returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to read Plex status: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "get_plex_server_activity",
    "Use this to read the current Plex activity snapshot, including active sessions and the latest watched item.",
    {},
    async () => {
      return withAudit("get_plex_server_activity", undefined, async () => {
        try {
          const snapshot = await readPlexActivitySnapshot();
          return {
            content: [{ type: "text", text: formatPlexServerActivity(snapshot) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool get_plex_server_activity returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to read Plex activity: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "get_plex_now_playing",
    "Use this to list active Plex playback sessions from the latest local activity snapshot.",
    {},
    async () => {
      return withAudit("get_plex_now_playing", undefined, async () => {
        try {
          const snapshot = await readPlexActivitySnapshot();
          return {
            content: [{ type: "text", text: formatPlexNowPlaying(snapshot) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool get_plex_now_playing returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to read Plex now-playing sessions: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "get_plex_recently_watched",
    "Use this to list recently watched Plex items from the latest local activity snapshot.",
    {
      limit: z.number().int().min(1).max(25).optional().describe("Maximum number of recently watched items to return, from 1 to 25")
    },
    async ({ limit }) => {
      return withAudit("get_plex_recently_watched", { limit }, async () => {
        try {
          const snapshot = await readPlexActivitySnapshot();
          return {
            content: [{ type: "text", text: formatPlexRecentlyWatched(snapshot, limit) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool get_plex_recently_watched returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to read Plex recently watched items: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "get_plex_continue_watching",
    "Use this to list Plex continue-watching recommendations from the latest local activity snapshot.",
    {
      limit: z.number().int().min(1).max(25).optional().describe("Maximum number of continue-watching items to return, from 1 to 25")
    },
    async ({ limit }) => {
      return withAudit("get_plex_continue_watching", { limit }, async () => {
        try {
          const snapshot = await readPlexActivitySnapshot();
          return {
            content: [{ type: "text", text: formatPlexContinueWatching(snapshot, limit) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool get_plex_continue_watching returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to read Plex continue-watching items: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "get_plex_on_deck",
    "Use this to list Plex on-deck recommendations from the latest local activity snapshot.",
    {
      limit: z.number().int().min(1).max(25).optional().describe("Maximum number of on-deck items to return, from 1 to 25")
    },
    async ({ limit }) => {
      return withAudit("get_plex_on_deck", { limit }, async () => {
        try {
          const snapshot = await readPlexActivitySnapshot();
          return {
            content: [{ type: "text", text: formatPlexOnDeck(snapshot, limit) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool get_plex_on_deck returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to read Plex on-deck items: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "find_plex_unwatched",
    "Use this to find unwatched Plex movies or shows from the latest local activity snapshot.",
    {
      query: z.string().min(1).optional().describe("Optional title phrase filter for unwatched items"),
      mediaType: z.enum(["movie", "tv"]).optional().describe("Optional unwatched media filter: movie or tv"),
      section: z.string().min(1).optional().describe("Optional Plex section name filter"),
      limit: z.number().int().min(1).max(25).optional().describe("Maximum number of unwatched items to return, from 1 to 25")
    },
    async ({ query, mediaType, section, limit }) => {
      return withAudit("find_plex_unwatched", { query, mediaType, section, limit }, async () => {
        try {
          const snapshot = await readPlexActivitySnapshot();
          const items = findPlexUnwatched(snapshot, { query, mediaType, section, limit });

          return {
            content: [{ type: "text", text: formatPlexUnwatched(items, snapshot, { query, mediaType, section, limit }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool find_plex_unwatched returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to read Plex unwatched items: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "get_plex_item_details",
    "Use this to get detailed Plex matches for a specific movie, show, album, artist, track, or episode title.",
    {
      title: z.string().min(1).describe("The item title to look up in Plex"),
      itemType: z
        .enum(["movie", "show", "episode", "artist", "album", "track"])
        .optional()
        .describe("Optional Plex item type filter"),
      section: z.string().min(1).optional().describe("Optional Plex section name filter"),
      limit: z.number().int().min(1).max(10).optional().describe("Maximum number of matching items to return, from 1 to 10")
    },
    async ({ title, itemType, section, limit }) => {
      return withAudit("get_plex_item_details", { title, itemType, section, limit }, async () => {
        try {
          const index = await readPlexLibraryIndex();
          const results = getPlexItemDetails(index, { title, itemType, section, limit });

          return {
            content: [{ type: "text", text: formatPlexItemDetails(results, index, { title, itemType, section, limit }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool get_plex_item_details returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to read Plex item details: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "browse_plex_by_genre",
    "Use this to browse Plex movies, shows, or albums by genre.",
    {
      genre: z.string().min(1).describe("Genre name or phrase to browse for, for example science fiction or audiobook"),
      mediaType: z
        .enum(["movie", "tv", "audio"])
        .optional()
        .describe("Optional media filter: movie for films, tv for series, or audio for albums"),
      section: z.string().min(1).optional().describe("Optional Plex section name filter"),
      limit: z.number().int().min(1).max(25).optional().describe("Maximum number of matching items to return, from 1 to 25")
    },
    async ({ genre, mediaType, section, limit }) => {
      return withAudit("browse_plex_by_genre", { genre, mediaType, section, limit }, async () => {
        try {
          const index = await readPlexLibraryIndex();
          const results = browsePlexByGenre(index, { genre, mediaType, section, limit });

          return {
            content: [{ type: "text", text: formatPlexGenreBrowse(results, index, { genre, mediaType, section, limit }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool browse_plex_by_genre returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to browse Plex by genre: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "browse_plex_by_decade",
    "Use this to browse Plex movies, shows, or albums from a specific decade.",
    {
      decade: z.number().int().describe("Decade to browse, for example 1990 or 2000"),
      mediaType: z
        .enum(["movie", "tv", "audio"])
        .optional()
        .describe("Optional media filter: movie for films, tv for series, or audio for albums"),
      section: z.string().min(1).optional().describe("Optional Plex section name filter"),
      limit: z.number().int().min(1).max(25).optional().describe("Maximum number of matching items to return, from 1 to 25")
    },
    async ({ decade, mediaType, section, limit }) => {
      return withAudit("browse_plex_by_decade", { decade, mediaType, section, limit }, async () => {
        try {
          const index = await readPlexLibraryIndex();
          const results = browsePlexByDecade(index, { decade, mediaType, section, limit });

          return {
            content: [{ type: "text", text: formatPlexDecadeBrowse(results, index, { decade, mediaType, section, limit }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool browse_plex_by_decade returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to browse Plex by decade: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "get_plex_library_stats",
    "Use this to summarize Plex library counts, top genres, duplicate groups, and recent additions.",
    {
      mediaType: z
        .enum(["movie", "tv", "audio"])
        .optional()
        .describe("Optional media filter: movie, tv, or audio"),
      section: z.string().min(1).optional().describe("Optional Plex section name filter"),
      topGenreLimit: z.number().int().min(1).max(20).optional().describe("Maximum number of top genres to report, from 1 to 20")
    },
    async ({ mediaType, section, topGenreLimit }) => {
      return withAudit("get_plex_library_stats", { mediaType, section, topGenreLimit }, async () => {
        try {
          const index = await readPlexLibraryIndex();
          const stats = getPlexLibraryStats(index, { mediaType, section, topGenreLimit });

          return {
            content: [{ type: "text", text: formatPlexLibraryStats(stats, index, { mediaType, section, topGenreLimit }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool get_plex_library_stats returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to summarize Plex library stats: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "get_plex_show_summary",
    "Use this to summarize a Plex show with episode counts, seasons, genres, and recent additions.",
    {
      showTitle: z.string().min(1).describe("The show title to summarize")
    },
    async ({ showTitle }) => {
      return withAudit("get_plex_show_summary", { showTitle }, async () => {
        try {
          const index = await readPlexLibraryIndex();
          const summary = getPlexShowSummary(index, { showTitle });

          return {
            content: [{ type: "text", text: formatPlexShowSummary(summary, index, { showTitle }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool get_plex_show_summary returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to summarize Plex show: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "get_plex_season_summary",
    "Use this to summarize a specific Plex TV season with episode counts, runtime, and air-date range.",
    {
      showTitle: z.string().min(1).describe("The show title to summarize"),
      seasonIndex: z.number().int().min(1).describe("Season number to summarize")
    },
    async ({ showTitle, seasonIndex }) => {
      return withAudit("get_plex_season_summary", { showTitle, seasonIndex }, async () => {
        try {
          const index = await readPlexLibraryIndex();
          const summary = getPlexSeasonSummary(index, { showTitle, seasonIndex });

          return {
            content: [{ type: "text", text: formatPlexSeasonSummary(summary, index, { showTitle, seasonIndex }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool get_plex_season_summary returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to summarize Plex season: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "get_recently_aired_episodes",
    "Use this to find Plex episodes that aired recently, optionally narrowed to a specific show.",
    {
      days: z.number().int().min(1).max(365).optional().describe("Number of days back to search for aired episodes, from 1 to 365"),
      showTitle: z.string().min(1).optional().describe("Optional show title filter"),
      limit: z.number().int().min(1).max(25).optional().describe("Maximum number of episodes to return, from 1 to 25")
    },
    async ({ days, showTitle, limit }) => {
      return withAudit("get_recently_aired_episodes", { days, showTitle, limit }, async () => {
        try {
          const index = await readPlexLibraryIndex();
          const episodes = getRecentlyAiredEpisodes(index, { days, showTitle, limit });

          return {
            content: [{ type: "text", text: formatRecentlyAiredEpisodes(episodes, index, { days, showTitle, limit }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool get_recently_aired_episodes returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to find recently aired Plex episodes: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "find_plex_series_gaps",
    "Use this to find potential missing seasons or episode gaps in Plex TV shows.",
    {
      showTitle: z.string().min(1).optional().describe("Optional show title filter"),
      section: z.string().min(1).optional().describe("Optional Plex section name filter"),
      limit: z.number().int().min(1).max(25).optional().describe("Maximum number of gap reports to return, from 1 to 25")
    },
    async ({ showTitle, section, limit }) => {
      return withAudit("find_plex_series_gaps", { showTitle, section, limit }, async () => {
        try {
          const index = await readPlexLibraryIndex();
          const reports = findPlexSeriesGaps(index, { showTitle, section, limit });

          return {
            content: [{ type: "text", text: formatPlexSeriesGaps(reports, index, { showTitle, section, limit }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool find_plex_series_gaps returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to detect Plex series gaps: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "list_plex_sections",
    "Use this to list the available Plex library sections from the local exported index.",
    {},
    async () => {
      return withAudit("list_plex_sections", undefined, async () => {
        try {
          const index = await readPlexLibraryIndex();
          return {
            content: [{ type: "text", text: formatPlexSections(index) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool list_plex_sections returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to list Plex sections: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "browse_plex_show_episodes",
    "Use this to browse Plex show episodes with proper season and episode ordering.",
    {
      showTitle: z.string().min(1).describe("The show title whose episodes you want to browse"),
      seasonIndex: z.number().int().min(1).optional().describe("Optional season number filter"),
      limit: z.number().int().min(1).max(100).optional().describe("Maximum number of episodes to return, from 1 to 100")
    },
    async ({ showTitle, seasonIndex, limit }) => {
      return withAudit("browse_plex_show_episodes", { showTitle, seasonIndex, limit }, async () => {
        try {
          const index = await readPlexLibraryIndex();
          const episodes = browsePlexShowEpisodes(index, { showTitle, seasonIndex, limit });

          return {
            content: [{ type: "text", text: formatPlexShowEpisodes(episodes, index, { showTitle, seasonIndex, limit }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool browse_plex_show_episodes returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to browse Plex show episodes: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "browse_plex_children",
    "Use this to browse episodes for a show, albums for an artist, or tracks for an album from the local Plex index.",
    {
      parentTitle: z.string().min(1).describe("The show, artist, or album title whose children you want to browse"),
      parentType: z
        .enum(["show", "artist", "album"])
        .describe("Choose show for episodes, artist for albums, or album for tracks"),
      section: z.string().min(1).optional().describe("Optional Plex section name filter"),
      limit: z.number().int().min(1).max(50).optional().describe("Maximum number of child items to return, from 1 to 50")
    },
    async ({ parentTitle, parentType, section, limit }) => {
      return withAudit("browse_plex_children", { parentTitle, parentType, section, limit }, async () => {
        try {
          const index = await readPlexLibraryIndex();
          const results = browsePlexChildren(index, { parentTitle, parentType, section, limit });

          return {
            content: [
              { type: "text", text: formatPlexChildren(results, index, { parentTitle, parentType, section, limit }) }
            ]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool browse_plex_children returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to browse Plex children: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "find_plex_episode",
    "Use this to search Plex episodes by episode title, optionally restricted to a specific show.",
    {
      query: z.string().min(1).describe("Episode title or phrase to search for"),
      showTitle: z.string().min(1).optional().describe("Optional show title filter"),
      limit: z.number().int().min(1).max(25).optional().describe("Maximum number of matching episodes to return, from 1 to 25")
    },
    async ({ query, showTitle, limit }) => {
      return withAudit("find_plex_episode", { query, showTitle, limit }, async () => {
        try {
          const index = await readPlexLibraryIndex();
          const episodes = findPlexEpisodes(index, { query, showTitle, limit });

          return {
            content: [{ type: "text", text: formatPlexEpisodes(episodes, index, { query, showTitle, limit }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool find_plex_episode returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to search Plex episodes: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "search_plex_library",
    "Use this to search the local Plex library index by title, with optional section and item type filters.",
    {
      query: z.string().min(1).describe("Title or phrase to search for in Plex"),
      section: z.string().min(1).optional().describe("Optional library section name, for example Movies or TV Shows"),
      itemType: z
        .enum(["movie", "show", "season", "episode", "artist", "album", "track"])
        .optional()
        .describe("Optional Plex item type filter"),
      limit: z.number().int().min(1).max(25).optional().describe("Maximum number of results to return, from 1 to 25")
    },
    async ({ query, section, itemType, limit }) => {
      return withAudit("search_plex_library", { query, section, itemType, limit }, async () => {
        try {
          const index = await readPlexLibraryIndex();
          const results = searchPlexLibrary(index, { query, section, itemType, limit });

          return {
            content: [{ type: "text", text: formatPlexSearchResults(results, index, { query, section, itemType, limit }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool search_plex_library returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to search Plex: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "search_plex_titles",
    "Use this to search Plex titles by media type when you specifically want movies, TV shows, or audio titles.",
    {
      query: z.string().min(1).describe("Title or phrase to search for in Plex titles"),
      mediaType: z
        .enum(["movie", "tv", "audio"])
        .describe("Choose movie for films, tv for series titles, or audio for artist, album, or track titles"),
      limit: z.number().int().min(1).max(25).optional().describe("Maximum number of results to return, from 1 to 25")
    },
    async ({ query, mediaType, limit }) => {
      return withAudit("search_plex_titles", { query, mediaType, limit }, async () => {
        try {
          const index = await readPlexLibraryIndex();
          const results = searchPlexTitles(index, { query, mediaType, limit });

          return {
            content: [{ type: "text", text: formatPlexTitleSearchResults(results, index, { query, mediaType, limit }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool search_plex_titles returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to search Plex titles: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "list_plex_duplicates",
    "Use this to find duplicate Plex titles grouped by title, type, and section.",
    {
      section: z.string().min(1).optional().describe("Optional Plex section name filter"),
      itemType: z
        .enum(["movie", "show", "episode", "artist", "album", "track"])
        .optional()
        .describe("Optional Plex item type filter"),
      limit: z.number().int().min(1).max(50).optional().describe("Maximum number of duplicate groups to return, from 1 to 50")
    },
    async ({ section, itemType, limit }) => {
      return withAudit("list_plex_duplicates", { section, itemType, limit }, async () => {
        try {
          const index = await readPlexLibraryIndex();
          const groups = listPlexDuplicates(index, { section, itemType, limit });

          return {
            content: [{ type: "text", text: formatPlexDuplicates(groups, index, { section, itemType, limit }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool list_plex_duplicates returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to list Plex duplicates: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "get_recent_plex_additions",
    "Use this to list the most recent Plex additions, with optional section and item type filters.",
    {
      section: z.string().min(1).optional().describe("Optional library section name, for example Movies, TV Shows, Music, or Audio Books"),
      itemType: z
        .enum(["movie", "show", "season", "episode", "artist", "album", "track"])
        .optional()
        .describe("Optional Plex item type filter"),
      limit: z.number().int().min(1).max(25).optional().describe("Maximum number of results to return, from 1 to 25")
    },
    async ({ section, itemType, limit }) => {
      return withAudit("get_recent_plex_additions", { section, itemType, limit }, async () => {
        try {
          const index = await readPlexLibraryIndex();
          const results = getRecentPlexAdditions(index, { section, itemType, limit });

          return {
            content: [{ type: "text", text: formatRecentPlexAdditions(results, index, { section, itemType, limit }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool get_recent_plex_additions returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to read recent Plex additions: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "search_files",
    "Use this to search the indexed allowlisted file catalog by path, name, extension, and stored preview text.",
    {
      query: z.string().min(1).describe("Keyword or path fragment to search for in indexed files"),
      root: z.string().min(1).optional().describe("Optional indexed root or relative path prefix filter"),
      extension: z.string().min(1).optional().describe("Optional file extension filter, for example md or .json"),
      limit: z.number().int().min(1).max(100).optional().describe("Maximum number of indexed files to return, from 1 to 100")
    },
    async ({ query, root, extension, limit }) => {
      return withAudit("search_files", { query, root, extension, limit }, async () => {
        try {
          const snapshot = await readFileCatalogSnapshot();
          const results = searchFiles(snapshot, { query, root, extension, limit });
          return {
            content: [{ type: "text", text: formatFileSearchResults(snapshot, results, { query, root, extension, limit }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool search_files returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to search indexed files: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "list_recent_files",
    "Use this to list recently modified indexed files with optional root or extension filters.",
    {
      root: z.string().min(1).optional().describe("Optional indexed root or path prefix filter"),
      extension: z.string().min(1).optional().describe("Optional file extension filter, for example md or .log"),
      limit: z.number().int().min(1).max(100).optional().describe("Maximum number of indexed files to return, from 1 to 100")
    },
    async ({ root, extension, limit }) => {
      return withAudit("list_recent_files", { root, extension, limit }, async () => {
        try {
          const snapshot = await readFileCatalogSnapshot();
          const items = listRecentFiles(snapshot, { root, extension, limit });
          return {
            content: [{ type: "text", text: formatRecentFiles(snapshot, items, { root, extension, limit }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool list_recent_files returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to list recent indexed files: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "read_text_file",
    "Use this to read the stored preview for one indexed text file.",
    {
      query: z.string().min(1).describe("Indexed file name, relative path, or full path")
    },
    async ({ query }) => {
      return withAudit("read_text_file", { query }, async () => {
        try {
          const snapshot = await readFileCatalogSnapshot();
          const item = findIndexedFile(snapshot, query);
          if (!item) {
            return {
              content: [{ type: "text", text: `Generated: ${snapshot.generatedAt}\nIndexed file preview:\n\n- No indexed file matched "${query}".` }],
              isError: true
            };
          }

          return {
            content: [{ type: "text", text: formatIndexedFileContent(snapshot, item) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool read_text_file returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to read the indexed file preview: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "summarize_folder",
    "Use this to summarize an indexed folder or path prefix with file counts, top extensions, and recent files.",
    {
      query: z.string().min(1).describe("Indexed root or relative path prefix to summarize"),
      limit: z.number().int().min(1).max(50).optional().describe("Maximum number of recent files to include, from 1 to 50")
    },
    async ({ query, limit }) => {
      return withAudit("summarize_folder", { query, limit }, async () => {
        try {
          const snapshot = await readFileCatalogSnapshot();
          const summary = summarizeFolder(snapshot, query, limit);
          return {
            content: [{ type: "text", text: formatFolderSummary(snapshot, summary) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool summarize_folder returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to summarize the indexed folder: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "list_local_repos",
    "Use this to list indexed local git repositories with optional query or dirty-state filters.",
    {
      query: z.string().min(1).optional().describe("Optional repo name, path, branch, or remote filter"),
      dirty: z.boolean().optional().describe("Optional dirty or clean filter"),
      limit: z.number().int().min(1).max(100).optional().describe("Maximum number of repos to return, from 1 to 100")
    },
    async ({ query, dirty, limit }) => {
      return withAudit("list_local_repos", { query, dirty, limit }, async () => {
        try {
          const snapshot = await readRepoStatusSnapshot();
          return {
            content: [{ type: "text", text: formatLocalRepos(snapshot, { query, dirty, limit }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool list_local_repos returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to list local repos: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "get_repo_status",
    "Use this to inspect one local git repository with branch, remote, dirty counts, and last commit information.",
    {
      query: z.string().min(1).describe("Repo name or path, for example MCP@home")
    },
    async ({ query }) => {
      return withAudit("get_repo_status", { query }, async () => {
        try {
          const snapshot = await readRepoStatusSnapshot();
          return {
            content: [{ type: "text", text: formatRepoDetails(snapshot, query) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool get_repo_status returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to inspect the local repo: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "get_recent_repo_activity",
    "Use this to list indexed local git repositories ordered by most recent commit activity.",
    {
      query: z.string().min(1).optional().describe("Optional repo name, path, or branch filter"),
      limit: z.number().int().min(1).max(100).optional().describe("Maximum number of repos to return, from 1 to 100")
    },
    async ({ query, limit }) => {
      return withAudit("get_recent_repo_activity", { query, limit }, async () => {
        try {
          const snapshot = await readRepoStatusSnapshot();
          return {
            content: [{ type: "text", text: formatRecentRepoActivity(snapshot, { query, limit }) }]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool get_recent_repo_activity returned error", message);
          return {
            content: [
              {
                type: "text",
                text: `Unable to inspect recent repo activity: ${message}. Run "npm run refresh:host" on the Windows host first.`
              }
            ],
            isError: true
          };
        }
      });
    }
  );

  server.tool(
    "list_notes",
    "Use this to list available markdown notes from the local notes directory.",
    {},
    async () => {
      return withAudit("list_notes", undefined, async () => {
        const notes = await loadAllNotes(notesDir);
        const text =
          notes.length === 0
            ? "No notes found."
            : notes.map((note) => formatListEntry(note.slug, note.title, note.tags)).join("\n");

        return {
          content: [{ type: "text", text }]
        };
      });
    }
  );

  server.tool(
    "search_notes",
    "Use this to search note titles, tags, and content for a short keyword or phrase.",
    {
      query: z.string().min(1).describe("Keyword or short phrase to search for")
    },
    async ({ query }) => {
      return withAudit("search_notes", { query }, async () => {
        const results = await searchNotes(notesDir, query);

        if (results.length === 0) {
          return {
            content: [{ type: "text", text: `No notes matched "${query}".` }]
          };
        }

        const text = results
          .map((result) => `${formatListEntry(result.slug, result.title, result.tags)}\n  ${result.preview}`)
          .join("\n");

        return {
          content: [{ type: "text", text }]
        };
      });
    }
  );

  server.tool(
    "read_note",
    "Use this to read a markdown note by slug when you already know which note you need.",
    {
      slug: z.string().min(1).describe("Note slug, for example welcome or homelab")
    },
    async ({ slug }) => {
      return withAudit("read_note", { slug }, async () => {
        try {
          const note = await readNoteBySlug(notesDir, slug);
          const tagText = note.tags.length > 0 ? note.tags.join(", ") : "none";

          return {
            content: [
              {
                type: "text",
                text: `# ${note.title}\n\nSlug: ${note.slug}\nTags: ${tagText}\n\n${note.body}`
              }
            ]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          log("tool read_note returned error", message);
          return {
            content: [{ type: "text", text: `Unable to read note "${slug}": ${message}` }],
            isError: true
          };
        }
      });
    }
  );
  return server;
}
