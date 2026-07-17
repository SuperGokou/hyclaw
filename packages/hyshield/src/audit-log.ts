import { appendFileSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

export type AuditEvent =
  | "gateway.start"
  | "gateway.fence-blocked"
  | "credential.injected"
  | "credential.saved"
  | "credential.deleted";

export interface AuditRecord {
  ts: string;
  event: AuditEvent;
  detail: Record<string, string>;
}

// 兜底脱敏:值像长十六进制或 base64 时视为密钥,防止调用方误传明文。
const SECRET_LIKE = /^(?:[0-9a-fA-F]{16,}|[A-Za-z0-9+/_-]{24,}={0,2})$/;

function redact(detail: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(detail)) {
    out[key] = SECRET_LIKE.test(value) ? "***redacted***" : value;
  }
  return out;
}

export function appendAudit(
  logDir: string,
  event: AuditEvent,
  detail: Record<string, string>,
  now: string,
): void {
  mkdirSync(logDir, { recursive: true });
  const day = now.slice(0, 10);
  const record: AuditRecord = { ts: now, event, detail: redact(detail) };
  appendFileSync(path.join(logDir, `audit-${day}.jsonl`), `${JSON.stringify(record)}\n`);
}

export function readAuditTail(logDir: string, limit: number): AuditRecord[] {
  let files: string[];
  try {
    files = readdirSync(logDir)
      .filter((f) => f.startsWith("audit-") && f.endsWith(".jsonl"))
      .sort();
  } catch {
    return [];
  }
  const rows: AuditRecord[] = [];
  for (const file of files) {
    const content = readFileSync(path.join(logDir, file), "utf8").trim();
    if (!content) continue;
    for (const line of content.split("\n")) {
      try {
        rows.push(JSON.parse(line) as AuditRecord);
      } catch {
        // 跳过损坏行
      }
    }
  }
  return rows.slice(-limit);
}
