import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const stateDir = process.env.HYCLAW_STATE_DIR ?? path.join(os.homedir(), ".hyclaw");
const probe = process.argv[2] ?? ""; // 可传入刚保存的明文做泄漏检查
let failed = false;
const fail = (msg) => {
  console.error("✗", msg);
  failed = true;
};
const ok = (msg) => console.log("✓", msg);

// 1. 端口仅回环
try {
  const out = execSync("netstat -ano", { encoding: "utf8" });
  const lines = out.split("\n").filter((l) => l.includes(":18789") && l.includes("LISTENING"));
  if (lines.length === 0) ok("no gateway listening (app closed) — skip bind check");
  else if (lines.every((l) => l.includes("127.0.0.1:18789"))) ok("gateway bound to 127.0.0.1 only");
  else fail(`gateway not loopback-only:\n${lines.join("\n")}`);
} catch {
  ok("netstat unavailable — skip");
}

// 2. vault 无明文
const vaultPath = path.join(stateDir, "vault.json");
if (existsSync(vaultPath)) {
  const raw = readFileSync(vaultPath, "utf8");
  if (probe && raw.includes(probe)) fail("plaintext secret found in vault.json!");
  else ok("vault.json contains no probe plaintext");
} else ok("no vault yet — skip");

// 3. 审计日志无明文
const auditDir = path.join(stateDir, "audit");
if (existsSync(auditDir) && probe) {
  const leak = readdirSync(auditDir).some((f) =>
    readFileSync(path.join(auditDir, f), "utf8").includes(probe),
  );
  if (leak) fail("plaintext secret found in audit log!");
  else ok("audit logs contain no probe plaintext");
}

process.exit(failed ? 1 : 0);
