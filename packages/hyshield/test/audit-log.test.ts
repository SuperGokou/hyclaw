import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { appendAudit, readAuditTail } from "../src/audit-log.ts";

let dir: string | null = null;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

describe("audit-log", () => {
  it("appends jsonl rows to a per-day file and reads them back", () => {
    dir = mkdtempSync(path.join(os.tmpdir(), "hyshield-audit-"));
    appendAudit(dir, "gateway.start", { port: "18789" }, "2026-07-17T10:00:00.000Z");
    appendAudit(dir, "credential.injected", { provider: "anthropic" }, "2026-07-17T10:00:01.000Z");
    const file = path.join(dir, "audit-2026-07-17.jsonl");
    const lines = readFileSync(file, "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    const tail = readAuditTail(dir, 10);
    expect(tail.map((r) => r.event)).toEqual(["gateway.start", "credential.injected"]);
    expect(tail[0].detail.port).toBe("18789");
  });

  it("redacts secret-looking values defensively", () => {
    dir = mkdtempSync(path.join(os.tmpdir(), "hyshield-audit-"));
    appendAudit(dir, "credential.saved", { token: "a".repeat(40) }, "2026-07-17T10:00:00.000Z");
    const tail = readAuditTail(dir, 10);
    expect(tail[0].detail.token).toBe("***redacted***");
  });

  it("readAuditTail returns only the last `limit` rows across days", () => {
    dir = mkdtempSync(path.join(os.tmpdir(), "hyshield-audit-"));
    appendAudit(dir, "gateway.start", { n: "1" }, "2026-07-16T10:00:00.000Z");
    appendAudit(dir, "gateway.start", { n: "2" }, "2026-07-17T10:00:00.000Z");
    appendAudit(dir, "gateway.start", { n: "3" }, "2026-07-17T11:00:00.000Z");
    const tail = readAuditTail(dir, 2);
    expect(tail.map((r) => r.detail.n)).toEqual(["2", "3"]);
  });
});
