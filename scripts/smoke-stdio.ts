import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  getCriticalToolNames,
  resolveToolProfile,
  SERVER_NAME,
  SERVER_VERSION
} from "../src/core/server-meta.js";

type TextContent = {
  type: "text";
  text: string;
};

function getFirstText(content: unknown): string {
  if (!Array.isArray(content) || content.length === 0) {
    return "";
  }

  const first = content[0];
  if (
    first &&
    typeof first === "object" &&
    "type" in first &&
    "text" in first &&
    (first as TextContent).type === "text" &&
    typeof (first as TextContent).text === "string"
  ) {
    return (first as TextContent).text;
  }

  return "";
}

async function main() {
  const toolProfile = resolveToolProfile(process.env.MCP_STDIO_TOOL_PROFILE ?? process.env.MCP_TOOL_PROFILE, "full");
  const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/index-stdio.js"],
    env: {
      ...process.env,
      MCP_STDIO_TOOL_PROFILE: toolProfile
    } as Record<string, string>
  });

  const client = new Client({ name: "mcp-home-stdio-smoke", version: SERVER_VERSION });
  await client.connect(transport);

  try {
    const tools = await client.listTools();
    const toolNames = tools.tools.map((tool) => tool.name);
    const missingTools = getCriticalToolNames(toolProfile).filter((toolName) => !toolNames.includes(toolName));
    if (missingTools.length > 0) {
      throw new Error(`Missing critical tools from the advertised list: ${missingTools.join(", ")}`);
    }

    const plex = await client.callTool({
      name: "find_plex",
      arguments: { query: "Sopranos" }
    });
    const docker = await client.callTool({
      name: "get_docker_status",
      arguments: {}
    });
    const snapshot = await client.callTool({
      name: "get_snapshot_status",
      arguments: {}
    });
    const snapshotHistory = await client.callTool({
      name: "get_snapshot_history",
      arguments: { limit: 3 }
    });
    const snapshotRecommendations = await client.callTool({
      name: "get_snapshot_recommendations",
      arguments: {}
    });
    const dashboard = await client.callTool({
      name: "get_operations_dashboard",
      arguments: {}
    });
    const digest = await client.callTool({
      name: "get_daily_digest",
      arguments: {}
    });
    const systemState = await client.callTool({
      name: "summarize_system_state",
      arguments: {}
    });
    const home = await client.callTool({
      name: "find_home",
      arguments: { query: "Sopranos", limit: 3 }
    });
    const recommend = await client.callTool({
      name: "recommend_next_checks",
      arguments: { query: "backup" }
    });
    const explain = await client.callTool({
      name: "explain_issue",
      arguments: { query: "backup failures" }
    });

    const plexText = getFirstText(plex.content);
    const dockerText = getFirstText(docker.content);
    const snapshotText = getFirstText(snapshot.content);
    const snapshotHistoryText = getFirstText(snapshotHistory.content);
    const snapshotRecommendationsText = getFirstText(snapshotRecommendations.content);
    const dashboardText = getFirstText(dashboard.content);
    const digestText = getFirstText(digest.content);
    const systemStateText = getFirstText(systemState.content);
    const homeText = getFirstText(home.content);
    const recommendText = getFirstText(recommend.content);
    const explainText = getFirstText(explain.content);
    let portText = "";
    let hostResourcesText = "";
    let dockerTriageText = "";
    let hostFindText = "";
    let attentionText = "";
    let windowsServicesText = "";
    let windowsEventsText = "";
    let shareStatusText = "";
    let backupTargetText = "";
    let internetHealthText = "";
    let homeAssistantText = "";
    let fileSearchText = "";
    let repoStatusText = "";
    if (toolNames.includes("get_docker_port_map")) {
      const dockerPorts = await client.callTool({
        name: "get_docker_port_map",
        arguments: { project: "mcphome", limit: 5 }
      });
      portText = getFirstText(dockerPorts.content);
    }
    if (toolNames.includes("get_host_resources")) {
      const hostResources = await client.callTool({
        name: "get_host_resources",
        arguments: {}
      });
      hostResourcesText = getFirstText(hostResources.content);
    }
    if (toolNames.includes("get_docker_triage_report")) {
      const dockerTriage = await client.callTool({
        name: "get_docker_triage_report",
        arguments: { sinceHours: 168 }
      });
      dockerTriageText = getFirstText(dockerTriage.content);
    }
    if (toolNames.includes("find_host")) {
      const hostFind = await client.callTool({
        name: "find_host",
        arguments: { query: "memory", limit: 3 }
      });
      hostFindText = getFirstText(hostFind.content);
    }
    if (toolNames.includes("get_attention_report")) {
      const attention = await client.callTool({
        name: "get_attention_report",
        arguments: {}
      });
      attentionText = getFirstText(attention.content);
    }
    if (toolNames.includes("list_windows_services")) {
      const services = await client.callTool({
        name: "list_windows_services",
        arguments: { query: "docker", limit: 5 }
      });
      windowsServicesText = getFirstText(services.content);
    }
    if (toolNames.includes("get_windows_event_summary")) {
      const windowsEvents = await client.callTool({
        name: "get_windows_event_summary",
        arguments: { level: "error", limit: 5 }
      });
      windowsEventsText = getFirstText(windowsEvents.content);
    }
    if (toolNames.includes("get_share_status")) {
      const shareStatus = await client.callTool({
        name: "get_share_status",
        arguments: { limit: 5 }
      });
      shareStatusText = getFirstText(shareStatus.content);
    }
    if (toolNames.includes("get_backup_target_health")) {
      const backupTarget = await client.callTool({
        name: "get_backup_target_health",
        arguments: { limit: 5 }
      });
      backupTargetText = getFirstText(backupTarget.content);
    }
    if (toolNames.includes("get_internet_health")) {
      const internetHealth = await client.callTool({
        name: "get_internet_health",
        arguments: {}
      });
      internetHealthText = getFirstText(internetHealth.content);
    }
    if (toolNames.includes("get_home_assistant_status")) {
      const homeAssistant = await client.callTool({
        name: "get_home_assistant_status",
        arguments: {}
      });
      homeAssistantText = getFirstText(homeAssistant.content);
    }
    if (toolNames.includes("search_files")) {
      const fileSearch = await client.callTool({
        name: "search_files",
        arguments: { query: "homelab", limit: 5 }
      });
      fileSearchText = getFirstText(fileSearch.content);
    }
    if (toolNames.includes("get_repo_status")) {
      const repoStatus = await client.callTool({
        name: "get_repo_status",
        arguments: { query: "MCP@home" }
      });
      repoStatusText = getFirstText(repoStatus.content);
    }

    if (!plexText.toLowerCase().includes("sopranos")) {
      throw new Error("find_plex did not return the expected Plex match");
    }

    if (!dockerText.includes("Docker")) {
      throw new Error("get_docker_status did not return the expected Docker summary");
    }

    if (!snapshotText.includes("Overall freshness")) {
      throw new Error("get_snapshot_status did not return the expected snapshot summary");
    }

    if (!snapshotHistoryText.includes("Snapshot history")) {
      throw new Error("get_snapshot_history did not return the expected history summary");
    }

    if (!snapshotRecommendationsText.includes("Snapshot recommendations")) {
      throw new Error("get_snapshot_recommendations did not return the expected recommendation summary");
    }

    if (!dashboardText.includes("Snapshot freshness")) {
      throw new Error("get_operations_dashboard did not return the expected dashboard summary");
    }

    if (!digestText.includes("Daily digest")) {
      throw new Error("get_daily_digest did not return the expected daily digest summary");
    }

    if (!systemStateText.includes("System state summary")) {
      throw new Error("summarize_system_state did not return the expected system state summary");
    }

    if (!homeText.toLowerCase().includes("sopranos")) {
      throw new Error("find_home did not return the expected natural-language match");
    }

    if (!recommendText.includes("Recommended next checks")) {
      throw new Error("recommend_next_checks did not return the expected recommendation summary");
    }

    if (!explainText.includes("Issue explanation")) {
      throw new Error("explain_issue did not return the expected issue explanation summary");
    }

    if (toolProfile === "public-safe" && !recommendText.includes("only available in the full tool profile")) {
      throw new Error("recommend_next_checks did not enforce the public-safe profile boundary for full-only domains");
    }

    if (toolProfile === "public-safe" && !explainText.includes("only available in the full tool profile")) {
      throw new Error("explain_issue did not enforce the public-safe profile boundary for full-only domains");
    }

    if (toolNames.includes("get_docker_port_map") && !portText.toLowerCase().includes("ports")) {
      throw new Error("get_docker_port_map did not return the expected port mapping summary");
    }

    if (toolNames.includes("get_host_resources") && !hostResourcesText.includes("Windows host resources")) {
      throw new Error("get_host_resources did not return the expected host resource summary");
    }

    if (toolNames.includes("get_docker_triage_report") && !dockerTriageText.includes("Docker triage report")) {
      throw new Error("get_docker_triage_report did not return the expected triage summary");
    }

    if (toolNames.includes("find_host") && !hostFindText.toLowerCase().includes("memory")) {
      throw new Error("find_host did not return the expected host match");
    }

    if (toolNames.includes("get_attention_report") && !attentionText.includes("Attention report")) {
      throw new Error("get_attention_report did not return the expected attention summary");
    }

    if (toolNames.includes("list_windows_services") && !windowsServicesText.includes("Windows services")) {
      throw new Error("list_windows_services did not return the expected Windows service summary");
    }

    if (toolNames.includes("get_windows_event_summary") && !windowsEventsText.includes("Windows event summary")) {
      throw new Error("get_windows_event_summary did not return the expected Windows event summary");
    }

    if (toolNames.includes("get_share_status") && !shareStatusText.includes("SMB share status")) {
      throw new Error("get_share_status did not return the expected SMB share summary");
    }

    if (toolNames.includes("get_backup_target_health") && !backupTargetText.includes("Backup target health")) {
      throw new Error("get_backup_target_health did not return the expected backup target summary");
    }

    if (toolNames.includes("get_internet_health") && !internetHealthText.includes("Internet health")) {
      throw new Error("get_internet_health did not return the expected internet health summary");
    }

    if (toolNames.includes("get_home_assistant_status") && !homeAssistantText.includes("Home Assistant status")) {
      throw new Error("get_home_assistant_status did not return the expected Home Assistant summary");
    }

    if (toolNames.includes("search_files") && !fileSearchText.includes("File search")) {
      throw new Error("search_files did not return the expected indexed file summary");
    }

    if (toolNames.includes("get_repo_status") && !repoStatusText.includes("Repo status")) {
      throw new Error("get_repo_status did not return the expected repo status summary");
    }

    console.log(
      JSON.stringify(
        {
          serverName: SERVER_NAME,
          toolProfile,
          toolCount: toolNames.length,
          plexPreview: plexText.slice(0, 120),
          dockerPreview: dockerText.slice(0, 120),
          snapshotPreview: snapshotText.slice(0, 120),
          snapshotHistoryPreview: snapshotHistoryText.slice(0, 120),
          snapshotRecommendationsPreview: snapshotRecommendationsText.slice(0, 120),
          dashboardPreview: dashboardText.slice(0, 120),
          digestPreview: digestText.slice(0, 120),
          systemStatePreview: systemStateText.slice(0, 120),
          homePreview: homeText.slice(0, 120),
          recommendPreview: recommendText.slice(0, 120),
          explainPreview: explainText.slice(0, 120),
          hostResourcesPreview: hostResourcesText.slice(0, 120),
          hostFindPreview: hostFindText.slice(0, 120),
          attentionPreview: attentionText.slice(0, 120),
          windowsServicesPreview: windowsServicesText.slice(0, 120),
          windowsEventsPreview: windowsEventsText.slice(0, 120),
          shareStatusPreview: shareStatusText.slice(0, 120),
          backupTargetPreview: backupTargetText.slice(0, 120),
          internetHealthPreview: internetHealthText.slice(0, 120),
          homeAssistantPreview: homeAssistantText.slice(0, 120),
          fileSearchPreview: fileSearchText.slice(0, 120),
          repoStatusPreview: repoStatusText.slice(0, 120),
          dockerTriagePreview: dockerTriageText.slice(0, 120),
          portPreview: portText.slice(0, 120)
        },
        null,
        2
      )
    );
  } finally {
    await transport.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
