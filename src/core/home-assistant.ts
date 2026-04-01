import type { HomeAssistantStatus, WindowsHostStatus } from "./host.js";

function getHomeAssistant(status: WindowsHostStatus): HomeAssistantStatus {
  if (!status.homeAssistant) {
    throw new Error("Windows host status does not include Home Assistant details");
  }

  return status.homeAssistant;
}

export function formatHomeAssistantStatus(status: WindowsHostStatus) {
  const assistant = getHomeAssistant(status);
  const lines = [
    `Generated: ${status.generatedAt}`,
    "Home Assistant status:",
    "",
    `Configured: ${assistant.configured ? "yes" : "no"}`,
    `Reachable: ${assistant.reachable ? "yes" : "no"}`,
    `Checked at: ${assistant.checkedAt}`
  ];

  if (assistant.baseUrl) {
    lines.push(`Base URL: ${assistant.baseUrl}`);
  }
  if (assistant.version) {
    lines.push(`Version: ${assistant.version}`);
  }
  if (assistant.stateCount !== null && assistant.stateCount !== undefined) {
    lines.push(`Entity states: ${assistant.stateCount}`);
  }
  if (assistant.unavailableCount !== null && assistant.unavailableCount !== undefined) {
    lines.push(`Unavailable entities: ${assistant.unavailableCount}`);
  }
  if (assistant.captureError) {
    lines.push(`Error: ${assistant.captureError}`);
  }

  if (!assistant.configured) {
    lines.push("");
    lines.push("- HOME_ASSISTANT_URL is not configured on the Windows host refresh path.");
    return lines.join("\n");
  }

  if (assistant.domains && assistant.domains.length > 0) {
    lines.push("");
    lines.push("Top domains:");
    for (const domain of assistant.domains.slice(0, 10)) {
      lines.push(`- ${domain.domain} | ${domain.entityCount} entities | ${domain.unavailableCount} unavailable`);
    }
  }

  if (assistant.unavailableEntities && assistant.unavailableEntities.length > 0) {
    lines.push("");
    lines.push("Unavailable entities:");
    for (const entity of assistant.unavailableEntities.slice(0, 15)) {
      const friendly = entity.friendlyName ? ` (${entity.friendlyName})` : "";
      lines.push(`- ${entity.entityId}${friendly} | ${entity.state}${entity.lastChanged ? ` | changed ${entity.lastChanged}` : ""}`);
    }
  }

  return lines.join("\n");
}
