import fs from "node:fs/promises";
import path from "node:path";

type AuditRecord = {
  timestamp: string;
  event: string;
  tool: string;
  ok: boolean;
  durationMs?: number;
  argSummary?: string;
  error?: string;
};

function getAuditLogPath() {
  return process.env.MCP_AUDIT_LOG_PATH?.trim() || "";
}

function truncate(value: string, maxLength = 96) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

function summarizeScalar(value: unknown): string {
  if (typeof value === "string") {
    return `"${truncate(value)}"`;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (value === null) {
    return "null";
  }

  if (value === undefined) {
    return "undefined";
  }

  if (Array.isArray(value)) {
    return `[${value.length} items]`;
  }

  if (typeof value === "object") {
    return "{object}";
  }

  return typeof value;
}

function isSensitiveKey(key: string) {
  return /token|secret|password|authorization|cookie|key/i.test(key);
}

export function summarizeArgs(input: Record<string, unknown> | undefined) {
  if (!input || Object.keys(input).length === 0) {
    return "none";
  }

  const entries = Object.entries(input).filter(([, value]) => value !== undefined);
  if (entries.length === 0) {
    return "none";
  }

  return entries
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${isSensitiveKey(key) ? "[redacted]" : summarizeScalar(value)}`)
    .join(", ");
}

async function appendAuditRecord(record: AuditRecord) {
  const auditLogPath = getAuditLogPath();
  if (!auditLogPath) {
    return;
  }

  const resolvedPath = path.resolve(auditLogPath);
  await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
  await fs.appendFile(resolvedPath, `${JSON.stringify(record)}\n`, "utf8");
}

export function log(message: string, ...args: unknown[]) {
  console.error(new Date().toISOString(), message, ...args);
}

export async function auditToolCall({
  tool,
  ok,
  startedAt,
  argSummary,
  error
}: {
  tool: string;
  ok: boolean;
  startedAt: number;
  argSummary?: string;
  error?: string;
}) {
  const record: AuditRecord = {
    timestamp: new Date().toISOString(),
    event: "tool_call",
    tool,
    ok,
    durationMs: Date.now() - startedAt,
    argSummary,
    error: error ? truncate(error, 160) : undefined
  };

  console.error(JSON.stringify(record));

  try {
    await appendAuditRecord(record);
  } catch (appendError) {
    const message = appendError instanceof Error ? appendError.message : String(appendError);
    console.error(new Date().toISOString(), "audit log write failed", message);
  }
}
