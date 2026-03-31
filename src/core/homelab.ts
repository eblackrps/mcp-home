import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type HomelabService = {
  name: string;
  status: string;
  details: string;
  lastChecked: string;
};

export type HomelabStatus = {
  generatedAt: string;
  summary: string;
  services: HomelabService[];
};

const DEFAULT_HOMELAB_STATUS_PATH = path.resolve(
  fileURLToPath(new URL("../../data/homelab-status.json", import.meta.url))
);

function assertHomelabStatus(value: unknown): asserts value is HomelabStatus {
  if (!value || typeof value !== "object") {
    throw new Error("Homelab status payload must be an object");
  }

  const candidate = value as Partial<HomelabStatus>;

  if (typeof candidate.generatedAt !== "string" || typeof candidate.summary !== "string") {
    throw new Error("Homelab status payload is missing top-level fields");
  }

  if (!Array.isArray(candidate.services)) {
    throw new Error("Homelab status services must be an array");
  }

  for (const service of candidate.services) {
    if (!service || typeof service !== "object") {
      throw new Error("Homelab service entries must be objects");
    }

    const item = service as Partial<HomelabService>;
    if (
      typeof item.name !== "string" ||
      typeof item.status !== "string" ||
      typeof item.details !== "string" ||
      typeof item.lastChecked !== "string"
    ) {
      throw new Error("Homelab service entries are missing required fields");
    }
  }
}

export function getHomelabStatusPath() {
  return process.env.HOMELAB_STATUS_PATH ?? DEFAULT_HOMELAB_STATUS_PATH;
}

export async function readHomelabStatus(statusPath = getHomelabStatusPath()): Promise<HomelabStatus> {
  const fullPath = path.resolve(statusPath);
  const raw = await fs.readFile(fullPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  assertHomelabStatus(parsed);
  return parsed;
}

export function formatHomelabStatus(status: HomelabStatus, serviceFilter?: string) {
  const normalized = serviceFilter?.trim().toLowerCase();
  const services = normalized
    ? status.services.filter((service) => service.name.toLowerCase().includes(normalized))
    : status.services;

  const lines = [
    `Generated: ${status.generatedAt}`,
    `Summary: ${status.summary}`,
    "",
    "Services:"
  ];

  if (services.length === 0) {
    lines.push(`- No services matched "${serviceFilter}".`);
    return lines.join("\n");
  }

  for (const service of services) {
    lines.push(`- ${service.name} | ${service.status} | last checked ${service.lastChecked}`);
    lines.push(`  ${service.details}`);
  }

  return lines.join("\n");
}
