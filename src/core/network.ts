import type {
  EndpointHealthStatus,
  PublicExposureItem,
  PublicExposureStatus,
  TailscaleStatus,
  WindowsHostStatus
} from "./host.js";

function normalize(value: string | undefined) {
  return value?.trim().toLowerCase();
}

function getEndpointChecks(status: WindowsHostStatus) {
  return status.endpointChecks ?? [];
}

function getTailscale(status: WindowsHostStatus): TailscaleStatus {
  if (!status.tailscale) {
    throw new Error("Windows host status does not include Tailscale details");
  }

  return status.tailscale;
}

function getPublicExposure(status: WindowsHostStatus): PublicExposureStatus {
  if (!status.publicExposure) {
    throw new Error("Windows host status does not include public exposure details");
  }

  return status.publicExposure;
}

function formatEndpointLine(endpoint: EndpointHealthStatus) {
  const bits = [
    endpoint.healthy ? "healthy" : "unhealthy",
    endpoint.statusCode !== null && endpoint.statusCode !== undefined ? `status ${endpoint.statusCode}` : "",
    endpoint.latencyMs !== null && endpoint.latencyMs !== undefined ? `${endpoint.latencyMs} ms` : "",
    endpoint.error ? `error=${endpoint.error}` : ""
  ]
    .filter(Boolean)
    .join(" | ");

  return `- ${endpoint.name} | ${bits || endpoint.url}`;
}

export function formatEndpointHealth(
  status: WindowsHostStatus,
  options?: {
    query?: string;
    unhealthyOnly?: boolean;
    limit?: number;
  }
) {
  const query = normalize(options?.query);
  const limit = Math.min(Math.max(options?.limit ?? 20, 1), 100);
  const filtered = getEndpointChecks(status)
    .filter((endpoint) => {
      if (options?.unhealthyOnly && endpoint.healthy) {
        return false;
      }

      if (!query) {
        return true;
      }

      return endpoint.name.toLowerCase().includes(query) || endpoint.url.toLowerCase().includes(query);
    })
    .slice(0, limit);

  const filters = [
    options?.query ? `query=${options.query}` : "",
    options?.unhealthyOnly ? "unhealthyOnly=true" : ""
  ]
    .filter(Boolean)
    .join(", ");
  const lines = [
    `Generated: ${status.generatedAt}`,
    filters ? `Endpoint health (${filters}):` : "Endpoint health:",
    ""
  ];

  if (filtered.length === 0) {
    lines.push("- No endpoint checks matched that filter.");
    return lines.join("\n");
  }

  for (const endpoint of filtered) {
    lines.push(formatEndpointLine(endpoint));
    lines.push(`  ${endpoint.url}`);
  }

  return lines.join("\n");
}

export function formatDnsSummary(status: WindowsHostStatus) {
  if (!status.resources) {
    throw new Error("Windows host status does not include host resource details");
  }

  const adapters = status.resources.network.adapters;
  const uniqueDnsServers = [...new Set(adapters.flatMap((adapter) => adapter.dnsServers ?? []))];
  const tailscale = status.tailscale;
  const lines = [
    `Generated: ${status.generatedAt}`,
    "DNS summary:",
    "",
    `Adapters with DNS servers: ${adapters.filter((adapter) => (adapter.dnsServers?.length ?? 0) > 0).length}`,
    `Unique DNS servers: ${uniqueDnsServers.length}`,
    ""
  ];

  lines.push("DNS servers:");
  if (uniqueDnsServers.length === 0) {
    lines.push("- No DNS servers were captured in the latest host snapshot.");
  } else {
    for (const server of uniqueDnsServers) {
      const sources = adapters
        .filter((adapter) => adapter.dnsServers?.includes(server))
        .map((adapter) => adapter.name)
        .slice(0, 5);
      lines.push(`- ${server}${sources.length > 0 ? ` | adapters=${sources.join(", ")}` : ""}`);
    }
  }

  if (tailscale) {
    lines.push("");
    lines.push("MagicDNS:");
    lines.push(
      `- ${tailscale.magicDnsEnabled ? "enabled" : "disabled"}${tailscale.magicDnsSuffix ? ` | suffix ${tailscale.magicDnsSuffix}` : ""}`
    );
    if (tailscale.selfDnsName) {
      lines.push(`- Local device DNS: ${tailscale.selfDnsName}`);
    }
  }

  return lines.join("\n");
}

export function formatTailscaleStatus(status: WindowsHostStatus) {
  const tailscale = getTailscale(status);
  const lines = [
    `Generated: ${status.generatedAt}`,
    "Tailscale status:",
    "",
    `Installed: ${tailscale.installed ? "yes" : "no"}`,
    `Backend state: ${tailscale.backendState || "unknown"}`,
    `Version: ${tailscale.version || "unknown"}`
  ];

  if (!tailscale.installed) {
    return lines.join("\n");
  }

  lines.push(`Tailnet: ${tailscale.tailnetName || "unknown"}`);
  lines.push(
    `MagicDNS: ${tailscale.magicDnsEnabled ? "enabled" : "disabled"}${tailscale.magicDnsSuffix ? ` | ${tailscale.magicDnsSuffix}` : ""}`
  );
  lines.push(`Self: ${tailscale.selfHostName || "unknown"}${tailscale.selfDnsName ? ` | ${tailscale.selfDnsName}` : ""}`);
  lines.push(`IPs: ${tailscale.tailscaleIps && tailscale.tailscaleIps.length > 0 ? tailscale.tailscaleIps.join(", ") : "unknown"}`);
  lines.push(
    `Peers: ${tailscale.peerCount ?? 0} total | ${tailscale.onlinePeerCount ?? 0} online | ${tailscale.activePeerCount ?? 0} active`
  );
  lines.push(`Funnel: ${tailscale.funnelEnabled ? "on" : "off"}`);
  if (tailscale.funnelTargets && tailscale.funnelTargets.length > 0) {
    for (const target of tailscale.funnelTargets) {
      lines.push(`- Funnel target: ${target}`);
    }
  }
  lines.push(`Serve: ${tailscale.serveEnabled ? "on" : "off"}`);
  if (tailscale.serveTargets && tailscale.serveTargets.length > 0) {
    for (const target of tailscale.serveTargets) {
      lines.push(`- Serve target: ${target}`);
    }
  }

  if (tailscale.peers && tailscale.peers.length > 0) {
    lines.push("");
    lines.push("Peers:");
    for (const peer of tailscale.peers.slice(0, 10)) {
      const bits = [
        peer.os || "",
        peer.online === true ? "online" : peer.online === false ? "offline" : "",
        peer.active === true ? "active" : ""
      ]
        .filter(Boolean)
        .join(" | ");
      lines.push(`- ${peer.name}${peer.dnsName ? ` | ${peer.dnsName}` : ""}${bits ? ` | ${bits}` : ""}`);
    }
  }

  return lines.join("\n");
}

function groupExposureItems(items: PublicExposureItem[], kind: PublicExposureItem["kind"]) {
  return items.filter((item) => item.kind === kind);
}

export function formatPublicExposureSummary(status: WindowsHostStatus) {
  const exposure = getPublicExposure(status);
  const funnelItems = groupExposureItems(exposure.exposedItems, "funnel");
  const serveItems = groupExposureItems(exposure.exposedItems, "serve");
  const dockerPublicItems = groupExposureItems(exposure.exposedItems, "docker-public");
  const dockerHostIpItems = groupExposureItems(exposure.exposedItems, "docker-host-ip");
  const endpointItems = groupExposureItems(exposure.exposedItems, "endpoint");
  const lines = [
    `Generated: ${status.generatedAt}`,
    "Public exposure summary:",
    "",
    `Funnel: ${exposure.funnelEnabled ? "on" : "off"} | targets ${funnelItems.length}`,
    `Serve: ${exposure.serveEnabled ? "on" : "off"} | targets ${serveItems.length}`,
    `Docker public bindings: ${dockerPublicItems.length}`,
    `Docker host-IP bindings: ${dockerHostIpItems.length}`,
    `Endpoint checks referencing public origins: ${endpointItems.length}`,
    ""
  ];

  if (exposure.exposedItems.length === 0) {
    lines.push("- No public exposure items were detected in the latest snapshot.");
    return lines.join("\n");
  }

  lines.push("Exposure items:");
  for (const item of exposure.exposedItems) {
    const bits = [item.kind, item.details || "", item.target || ""].filter(Boolean).join(" | ");
    lines.push(`- ${item.label}${bits ? ` | ${bits}` : ""}`);
  }

  return lines.join("\n");
}

export function formatNetworkFind(
  status: WindowsHostStatus,
  options: {
    query: string;
    limit?: number;
  }
) {
  const query = normalize(options.query) ?? "";
  const limit = Math.min(Math.max(options.limit ?? 10, 1), 25);
  const endpoints = getEndpointChecks(status)
    .filter((endpoint) => endpoint.name.toLowerCase().includes(query) || endpoint.url.toLowerCase().includes(query))
    .slice(0, limit);
  const tailscale = status.tailscale;
  const peerMatches =
    tailscale?.peers?.filter(
      (peer) =>
        peer.name.toLowerCase().includes(query) ||
        (peer.dnsName?.toLowerCase().includes(query) ?? false) ||
        (peer.os?.toLowerCase().includes(query) ?? false) ||
        (peer.tailnetIps?.some((ip) => ip.toLowerCase().includes(query)) ?? false)
    ).slice(0, limit) ?? [];
  const exposureMatches = status.publicExposure
    ? status.publicExposure.exposedItems.filter(
        (item) =>
          item.label.toLowerCase().includes(query) ||
          (item.target?.toLowerCase().includes(query) ?? false) ||
          (item.details?.toLowerCase().includes(query) ?? false) ||
          item.kind.toLowerCase().includes(query)
      ).slice(0, limit)
    : [];

  const lines = [`Generated: ${status.generatedAt}`, `Network finder for "${options.query}":`, ""];

  if (endpoints.length > 0) {
    lines.push("Endpoint checks:");
    for (const endpoint of endpoints) {
      lines.push(formatEndpointLine(endpoint));
    }
    lines.push("");
  }

  if (peerMatches.length > 0) {
    lines.push("Tailscale peers:");
    for (const peer of peerMatches) {
      const bits = [peer.os || "", peer.online === true ? "online" : peer.online === false ? "offline" : ""]
        .filter(Boolean)
        .join(" | ");
      lines.push(`- ${peer.name}${peer.dnsName ? ` | ${peer.dnsName}` : ""}${bits ? ` | ${bits}` : ""}`);
    }
    lines.push("");
  }

  if (exposureMatches.length > 0) {
    lines.push("Exposure:");
    for (const item of exposureMatches) {
      lines.push(`- ${item.label} | ${item.kind}${item.target ? ` | ${item.target}` : ""}`);
    }
    lines.push("");
  }

  if (lines.length <= 3) {
    lines.push("- No endpoint checks, Tailscale peers, or exposure items matched that query.");
  }

  return lines.join("\n").trimEnd();
}
