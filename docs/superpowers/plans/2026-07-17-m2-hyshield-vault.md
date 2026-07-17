# HYClaw M2 Implementation Plan — HYShield 安全围栏 + 凭证保险箱

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 HYClaw 满足验收标准的安全一票否决项——网关只允许回环绑定(否则拒绝启动),API 密钥经 OS 加密保险箱存储、配置文件零明文,并有审计日志记录凭证使用与 skill 加载。

**Architecture:** 在 `packages/hyshield/` 实现纯逻辑(bind 校验、审计日志),在 `apps/desktop/` 实现凭证保险箱(Electron `safeStorage` → DPAPI/Keychain/libsecret)与壳内凭证管理窗口。密钥永不进网关托管的控制台;配置文件里只写 `${HYCLAW_CRED_*}` 占位符,主进程启动网关前解密保险箱并把真实密钥注入子进程环境变量(复用 M1 `GatewayManager` 的 env 通道 + 上游 `env-substitution.ts` 的 `${VAR}` 机制)。

**Tech Stack:** TypeScript(NodeNext/ESM);Electron `safeStorage`;vitest。出站域名白名单拆到 M2.5(需改上游或架代理),本计划不含。

## Global Constraints

- Node `>=22.22.3 <23 || >=24.15.0 <25 || >=25.9.0`;pnpm 11.2;全 ESM;TypeScript strict;单文件 <400 行
- 最小侵入:新代码进 `packages/hyshield/`、`apps/desktop/`;不改上游 `src/`
- 提交格式 `<type>: <description>`,不加 Co-Authored-By
- 密钥永不落盘明文;审计日志永不含明文密钥
- 环境变量约定:保险箱条目 `<providerId>` → 注入为 `HYCLAW_CRED_<PROVIDERID大写>`(如 `anthropic` → `HYCLAW_CRED_ANTHROPIC`),配置占位符同名
- 分支:`feat/m2-hyshield`,从 main 切出;完成合并回 main 推送 origin

---

### Task 1: hyshield 包 — bind 预检(TDD)

**Files:**

- Create: `packages/hyshield/package.json`
- Create: `packages/hyshield/tsconfig.json`
- Create: `packages/hyshield/src/network-fence.ts`
- Test: `packages/hyshield/test/network-fence.test.ts`
- Modify: `pnpm-workspace.yaml`(packages 已含 `packages/*`,无需改)

**Interfaces:**

- Produces:

  ```ts
  type BindProfile = "loopback" | "lan" | "auto" | "custom" | "tailnet" | undefined;
  interface FenceResult {
    ok: boolean;
    reason?: string;
  }
  function assertLoopbackBind(config: {
    gateway?: { bind?: string; customBindHost?: string };
  }): FenceResult;
  ```

  规则:`bind` 缺省或 `"loopback"` → ok;`"custom"` 且 `customBindHost` 为 `127.0.0.1`/`::1`/`localhost` → ok;其余(`lan`/`auto`/`tailnet`/非回环 custom)→ `{ ok:false, reason }`(中文说明)。

- [ ] **Step 1: package.json**

```json
{
  "name": "@hyclaw/hyshield",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "test": "vitest run" },
  "devDependencies": { "vitest": "^3.0.0" }
}
```

- [ ] **Step 2: tsconfig.json**

```json
{
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "target": "ES2023",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: 写失败测试 test/network-fence.test.ts**

```ts
import { describe, expect, it } from "vitest";
import { assertLoopbackBind } from "../src/network-fence.ts";

describe("assertLoopbackBind", () => {
  it("allows missing bind (default is loopback)", () => {
    expect(assertLoopbackBind({}).ok).toBe(true);
    expect(assertLoopbackBind({ gateway: {} }).ok).toBe(true);
  });

  it("allows explicit loopback", () => {
    expect(assertLoopbackBind({ gateway: { bind: "loopback" } }).ok).toBe(true);
  });

  it("allows custom bound to a loopback host", () => {
    for (const host of ["127.0.0.1", "::1", "localhost"]) {
      expect(assertLoopbackBind({ gateway: { bind: "custom", customBindHost: host } }).ok).toBe(
        true,
      );
    }
  });

  it.each(["lan", "auto", "tailnet"])("rejects exposed profile %s", (bind) => {
    const result = assertLoopbackBind({ gateway: { bind } });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/回环|loopback/);
  });

  it("rejects custom bound to a non-loopback host", () => {
    const result = assertLoopbackBind({ gateway: { bind: "custom", customBindHost: "0.0.0.0" } });
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 4: 跑测试确认失败**

Run: `pnpm --filter @hyclaw/hyshield test`
Expected: FAIL — 找不到 `../src/network-fence.ts`。

- [ ] **Step 5: 实现 src/network-fence.ts**

```ts
export interface FenceResult {
  ok: boolean;
  reason?: string;
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);
const EXPOSED_REASON =
  "HYShield 拒绝启动:网关绑定配置会把服务暴露到本机以外。请将 gateway.bind 设为 " +
  '"loopback"(仅本机访问);手机互联请用 HYClaw 的扫码配对功能,而非放开绑定。';

export function assertLoopbackBind(config: {
  gateway?: { bind?: string; customBindHost?: string };
}): FenceResult {
  const bind = config.gateway?.bind;
  if (!bind || bind === "loopback") return { ok: true };
  if (bind === "custom") {
    const host = config.gateway?.customBindHost ?? "";
    if (LOOPBACK_HOSTS.has(host)) return { ok: true };
    return { ok: false, reason: `${EXPOSED_REASON}(当前 customBindHost=${host || "未设置"})` };
  }
  return { ok: false, reason: `${EXPOSED_REASON}(当前 gateway.bind=${bind})` };
}
```

- [ ] **Step 6: 创建 src/index.ts**

```ts
export { assertLoopbackBind } from "./network-fence.ts";
export type { FenceResult } from "./network-fence.ts";
export { appendAudit, readAuditTail } from "./audit-log.ts";
export type { AuditEvent, AuditRecord } from "./audit-log.ts";
```

(注意:`audit-log.ts` 在 Task 2 创建;Task 1 提交时 index.ts 先只导出 network-fence,Task 2 再补审计导出——避免引用未创建文件。**修正:Task 1 的 index.ts 只写 network-fence 两行导出;审计导出在 Task 2 Step 追加。**)

实际 Task 1 的 index.ts:

```ts
export { assertLoopbackBind } from "./network-fence.ts";
export type { FenceResult } from "./network-fence.ts";
```

- [ ] **Step 7: 跑测试确认通过**

Run: `pnpm --filter @hyclaw/hyshield test`
Expected: PASS(5 组用例)。

- [ ] **Step 8: 提交**

```bash
git add packages/hyshield pnpm-lock.yaml
git commit -m "feat: add hyshield network fence (loopback-only bind guard)"
```

---

### Task 2: hyshield 包 — 审计日志(TDD)

**Files:**

- Create: `packages/hyshield/src/audit-log.ts`
- Test: `packages/hyshield/test/audit-log.test.ts`
- Modify: `packages/hyshield/src/index.ts`(追加审计导出)

**Interfaces:**

- Produces:

  ```ts
  type AuditEvent =
    | "gateway.start"
    | "gateway.fence-blocked"
    | "credential.injected"
    | "credential.saved"
    | "credential.deleted";
  interface AuditRecord {
    ts: string;
    event: AuditEvent;
    detail: Record<string, string>;
  }
  function appendAudit(
    logDir: string,
    event: AuditEvent,
    detail: Record<string, string>,
    now: string,
  ): void;
  function readAuditTail(logDir: string, limit: number): AuditRecord[];
  ```

  日志按天滚动:`<logDir>/audit-YYYY-MM-DD.jsonl`(取 `now` 的前 10 字符),每行一条 JSON。`detail` 的值调用方保证不含明文密钥;`appendAudit` 额外做一层防御:值里出现长度≥16 的十六进制/base64 样式串时替换为 `***redacted***`。

- [ ] **Step 1: 写失败测试 test/audit-log.test.ts**

```ts
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @hyclaw/hyshield test`
Expected: FAIL — 找不到 `../src/audit-log.ts`。

- [ ] **Step 3: 实现 src/audit-log.ts**

```ts
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
```

- [ ] **Step 4: 追加 index.ts 审计导出**

在 `packages/hyshield/src/index.ts` 追加:

```ts
export { appendAudit, readAuditTail } from "./audit-log.ts";
export type { AuditEvent, AuditRecord } from "./audit-log.ts";
```

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm --filter @hyclaw/hyshield test`
Expected: PASS(network-fence + audit-log 全部)。

- [ ] **Step 6: 提交**

```bash
git add packages/hyshield/src/audit-log.ts packages/hyshield/test/audit-log.test.ts packages/hyshield/src/index.ts
git commit -m "feat: add hyshield append-only audit log with secret redaction"
```

---

### Task 3: 凭证保险箱(TDD,纯逻辑与加密后端解耦)

**Files:**

- Create: `apps/desktop/src/vault.ts`
- Test: `apps/desktop/test/vault.test.ts`

**Interfaces:**

- Produces:

  ```ts
  interface CipherBackend {
    isAvailable(): boolean;
    encryptString(plain: string): Buffer;
    decryptString(blob: Buffer): string;
  }
  interface VaultEntry {
    providerId: string;
    envVar: string;
  }
  class CredentialVault {
    constructor(vaultPath: string, backend: CipherBackend);
    setSecret(providerId: string, secret: string): void;
    deleteSecret(providerId: string): void;
    listEntries(): VaultEntry[]; // 只返回 id 与 envVar,绝不返回明文
    exportEnv(): Record<string, string>; // { HYCLAW_CRED_ANTHROPIC: "<plain>", ... } 供注入
    hasSecret(providerId: string): boolean;
  }
  function providerEnvVar(providerId: string): string; // "anthropic" -> "HYCLAW_CRED_ANTHROPIC"
  ```

  磁盘格式:`vaultPath` 存 JSON `{ version: 1, entries: { [providerId]: base64(encryptedBlob) } }`。明文只在内存 `exportEnv()` 返回值中出现。`providerEnvVar`:大写 + 非 `[A-Z0-9_]` 替换为 `_`。

- [ ] **Step 1: 写失败测试 test/vault.test.ts**

```ts
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CredentialVault, providerEnvVar } from "../src/vault.ts";

// 可逆的假加密后端(XOR),仅用于测试保险箱逻辑,不涉及真实 OS 加密
const fakeBackend = {
  isAvailable: () => true,
  encryptString: (plain: string) => Buffer.from(plain, "utf8").map((b) => b ^ 0x5a),
  decryptString: (blob: Buffer) =>
    Buffer.from(blob)
      .map((b) => b ^ 0x5a)
      .toString("utf8"),
};

let dir: string | null = null;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

function newVault() {
  dir = mkdtempSync(path.join(os.tmpdir(), "hyclaw-vault-"));
  return {
    vaultPath: path.join(dir, "vault.json"),
    vault: new CredentialVault(path.join(dir, "vault.json"), fakeBackend),
  };
}

describe("providerEnvVar", () => {
  it("maps provider id to HYCLAW_CRED_ env var", () => {
    expect(providerEnvVar("anthropic")).toBe("HYCLAW_CRED_ANTHROPIC");
    expect(providerEnvVar("my-provider.2")).toBe("HYCLAW_CRED_MY_PROVIDER_2");
  });
});

describe("CredentialVault", () => {
  it("stores secrets encrypted (never plaintext on disk)", () => {
    const { vaultPath, vault } = newVault();
    vault.setSecret("anthropic", "sk-secret-123456");
    const raw = readFileSync(vaultPath, "utf8");
    expect(raw).not.toContain("sk-secret-123456");
  });

  it("round-trips secrets via exportEnv", () => {
    const { vault } = newVault();
    vault.setSecret("anthropic", "sk-secret-123456");
    vault.setSecret("deepseek", "ds-key-abc");
    expect(vault.exportEnv()).toEqual({
      HYCLAW_CRED_ANTHROPIC: "sk-secret-123456",
      HYCLAW_CRED_DEEPSEEK: "ds-key-abc",
    });
  });

  it("listEntries never leaks plaintext", () => {
    const { vault } = newVault();
    vault.setSecret("anthropic", "sk-secret-123456");
    const entries = vault.listEntries();
    expect(entries).toEqual([{ providerId: "anthropic", envVar: "HYCLAW_CRED_ANTHROPIC" }]);
    expect(JSON.stringify(entries)).not.toContain("sk-secret");
  });

  it("persists across instances and supports delete", () => {
    const { vaultPath, vault } = newVault();
    vault.setSecret("anthropic", "sk-1");
    const reopened = new CredentialVault(vaultPath, fakeBackend);
    expect(reopened.hasSecret("anthropic")).toBe(true);
    expect(reopened.exportEnv().HYCLAW_CRED_ANTHROPIC).toBe("sk-1");
    reopened.deleteSecret("anthropic");
    expect(reopened.hasSecret("anthropic")).toBe(false);
    expect(existsSync(vaultPath)).toBe(true);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @hyclaw/desktop test`
Expected: FAIL — 找不到 `../src/vault.ts`。

- [ ] **Step 3: 实现 src/vault.ts**

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export interface CipherBackend {
  isAvailable(): boolean;
  encryptString(plain: string): Buffer;
  decryptString(blob: Buffer): string;
}

export interface VaultEntry {
  providerId: string;
  envVar: string;
}

interface VaultFile {
  version: 1;
  entries: Record<string, string>; // providerId -> base64(encrypted)
}

export function providerEnvVar(providerId: string): string {
  return `HYCLAW_CRED_${providerId.toUpperCase().replace(/[^A-Z0-9_]/g, "_")}`;
}

export class CredentialVault {
  private data: VaultFile = { version: 1, entries: {} };

  constructor(
    private readonly vaultPath: string,
    private readonly backend: CipherBackend,
  ) {
    if (existsSync(vaultPath)) {
      try {
        this.data = JSON.parse(readFileSync(vaultPath, "utf8")) as VaultFile;
      } catch {
        this.data = { version: 1, entries: {} };
      }
    }
  }

  setSecret(providerId: string, secret: string): void {
    if (!this.backend.isAvailable()) {
      throw new Error("凭证保险箱不可用:操作系统加密后端未就绪");
    }
    this.data.entries[providerId] = this.backend.encryptString(secret).toString("base64");
    this.persist();
  }

  deleteSecret(providerId: string): void {
    delete this.data.entries[providerId];
    this.persist();
  }

  hasSecret(providerId: string): boolean {
    return providerId in this.data.entries;
  }

  listEntries(): VaultEntry[] {
    return Object.keys(this.data.entries).map((providerId) => ({
      providerId,
      envVar: providerEnvVar(providerId),
    }));
  }

  exportEnv(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [providerId, blob] of Object.entries(this.data.entries)) {
      out[providerEnvVar(providerId)] = this.backend.decryptString(Buffer.from(blob, "base64"));
    }
    return out;
  }

  private persist(): void {
    mkdirSync(path.dirname(this.vaultPath), { recursive: true });
    writeFileSync(this.vaultPath, `${JSON.stringify(this.data, null, 2)}\n`);
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @hyclaw/desktop test`
Expected: PASS(vault + M1 既有测试全绿)。

- [ ] **Step 5: 提交**

```bash
git add apps/desktop/src/vault.ts apps/desktop/test/vault.test.ts
git commit -m "feat: add encrypted credential vault (backend-agnostic core)"
```

---

### Task 4: safeStorage 后端 + 主进程接线(围栏预检 + 凭证注入 + 审计)

**Files:**

- Create: `apps/desktop/src/safe-storage-backend.ts`
- Modify: `apps/desktop/src/gateway-config.ts`(新增 `resolveVaultPath`、`resolveAuditDir`)
- Modify: `apps/desktop/src/main.ts`(接线)
- Modify: `apps/desktop/package.json`(依赖 `@hyclaw/hyshield`)
- Test: `apps/desktop/test/gateway-config.test.ts`(补 vaultPath/auditDir 断言)

**Interfaces:**

- Consumes: `CredentialVault`、`CipherBackend`(Task 3);`assertLoopbackBind`、`appendAudit`(Task 1/2);`resolveGatewayConfig`(M1)
- Produces:

  ```ts
  function createSafeStorageBackend(): CipherBackend; // 包裹 electron safeStorage
  // gateway-config.ts 追加:
  //   config.vaultPath  = <stateDir>/vault.json
  //   config.auditDir   = <stateDir>/audit
  ```

  主进程启动序列(见 Step 3):bind 预检失败 → 审计 `gateway.fence-blocked` + 故障页 + 不 spawn;成功 → 解密保险箱 exportEnv 注入子进程 → 审计 `gateway.start` + 每个注入的凭证 `credential.injected`(detail 只记 provider id,不记密钥)。

- [ ] **Step 1: safe-storage-backend.ts**

```ts
import { safeStorage } from "electron";
import type { CipherBackend } from "./vault.js";

// DPAPI(Windows)/ Keychain(macOS)/ libsecret(Linux),由 Electron 统一封装。
export function createSafeStorageBackend(): CipherBackend {
  return {
    isAvailable: () => safeStorage.isEncryptionAvailable(),
    encryptString: (plain) => safeStorage.encryptString(plain),
    decryptString: (blob) => safeStorage.decryptString(blob),
  };
}
```

- [ ] **Step 2: gateway-config.ts 追加保险箱/审计路径**

在 `GatewayConfig` 接口追加两字段:

```ts
vaultPath: string;
auditDir: string;
```

在 `resolveGatewayConfig` 的 return 对象追加(紧跟 `configPath` 之后):

```ts
    vaultPath: path.join(stateDir, "vault.json"),
    auditDir: path.join(stateDir, "audit"),
```

- [ ] **Step 3: 重写 main.ts 的 whenReady 序列**

将 `app.whenReady().then(async () => { ... })` 内部替换为(其余文件不变):

```ts
app.whenReady().then(async () => {
  const config = resolveGatewayConfig(process.env, app.getAppPath());
  const { token } = ensureGatewayBootstrap(config);

  mainWindow = createMainWindow();
  mainWindow.on("close", (event) => {
    if (!quitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
  createTray({ onShow: showWindow, onQuit: () => app.quit() });

  // 读网关配置做 HYShield 网络围栏预检
  let fileConfig: { gateway?: { bind?: string; customBindHost?: string } } = {};
  try {
    fileConfig = JSON.parse(readFileSync(config.configPath, "utf8"));
  } catch {
    fileConfig = {};
  }
  const fence = assertLoopbackBind(fileConfig);
  if (!fence.ok) {
    appendAudit(
      config.auditDir,
      "gateway.fence-blocked",
      { reason: fence.reason ?? "" },
      new Date().toISOString(),
    );
    console.error("[hyshield] fence blocked:", fence.reason);
    showFailurePage(mainWindow);
    return;
  }

  // 凭证保险箱:解密并注入子进程环境
  const vault = new CredentialVault(config.vaultPath, createSafeStorageBackend());
  const credentialEnv = vault.exportEnv();
  for (const entry of vault.listEntries()) {
    appendAudit(
      config.auditDir,
      "credential.injected",
      { provider: entry.providerId },
      new Date().toISOString(),
    );
  }

  manager = new GatewayManager(
    { ...config, env: { ...config.env, ...credentialEnv } },
    {
      onEvent: (event, detail) => {
        console.log(`[gateway] ${event}${detail ? `: ${detail}` : ""}`);
        if (event === "failed" && mainWindow) showFailurePage(mainWindow);
      },
    },
  );

  appendAudit(
    config.auditDir,
    "gateway.start",
    { port: String(config.port) },
    new Date().toISOString(),
  );
  manager.start();
  try {
    await waitForGateway(config.url, { timeoutMs: GATEWAY_READY_TIMEOUT_MS });
    await mainWindow.loadURL(`${config.url}?token=${encodeURIComponent(token)}`);
  } catch (error) {
    console.error("[gateway] startup failed", error);
    showFailurePage(mainWindow);
  }
});
```

并在 main.ts 顶部补齐 import:

```ts
import { readFileSync } from "node:fs";
import { assertLoopbackBind, appendAudit } from "@hyclaw/hyshield";
import { CredentialVault } from "./vault.js";
import { createSafeStorageBackend } from "./safe-storage-backend.js";
```

- [ ] **Step 4: package.json 加依赖**

在 `apps/desktop/package.json` 的 devDependencies 之外新增 dependencies:

```json
  "dependencies": {
    "@hyclaw/hyshield": "workspace:*"
  },
```

- [ ] **Step 5: 补 gateway-config 测试断言**

在 `apps/desktop/test/gateway-config.test.ts` 的「uses an isolated ~/.hyclaw state dir by default」用例追加:

```ts
expect(cfg.vaultPath).toBe(path.join(cfg.stateDir, "vault.json"));
expect(cfg.auditDir).toBe(path.join(cfg.stateDir, "audit"));
```

- [ ] **Step 6: 安装、构建、测试**

Run: `pnpm install`
Run: `pnpm --filter @hyclaw/desktop build`
Expected: tsc 通过。

Run: `pnpm --filter @hyclaw/desktop test`
Expected: PASS(gateway-config/gateway-manager/vault 全绿)。

- [ ] **Step 7: 提交**

```bash
git add apps/desktop/src/safe-storage-backend.ts apps/desktop/src/gateway-config.ts apps/desktop/src/main.ts apps/desktop/package.json apps/desktop/test/gateway-config.test.ts pnpm-lock.yaml
git commit -m "feat: wire hyshield fence, credential vault injection, and audit into shell"
```

---

### Task 5: 壳内凭证管理窗口 + IPC(密钥录入不经网关 UI)

**Files:**

- Create: `apps/desktop/src/preload.ts`
- Create: `apps/desktop/assets/credentials.html`
- Modify: `apps/desktop/src/main.ts`(IPC handlers + 打开凭证窗口 + 托盘入口)
- Modify: `apps/desktop/tsconfig.json`(确保编译 preload)

**Interfaces:**

- Consumes: `CredentialVault`(单例,与 Task 4 共用实例)
- Produces:IPC 通道 `hyclaw:vault:list` / `hyclaw:vault:set` / `hyclaw:vault:delete`;凭证窗口(独立 BrowserWindow,加载本地 `credentials.html`,通过 `preload.ts` 暴露 `window.hyclawVault`)。托盘菜单新增「凭证保险箱 / Credentials」。**密钥只在此窗口经 IPC 进保险箱,永不经过网关托管的控制台。**

- [ ] **Step 1: preload.ts(contextBridge 暴露最小 API)**

```ts
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("hyclawVault", {
  list: (): Promise<Array<{ providerId: string; envVar: string }>> =>
    ipcRenderer.invoke("hyclaw:vault:list"),
  set: (providerId: string, secret: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke("hyclaw:vault:set", providerId, secret),
  remove: (providerId: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke("hyclaw:vault:delete", providerId),
});
```

- [ ] **Step 2: credentials.html(中文优先的凭证管理界面)**

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>凭证保险箱 · HYClaw</title>
    <style>
      :root {
        color-scheme: light dark;
      }
      body {
        margin: 0;
        padding: 24px;
        font-family: "Segoe UI", "Microsoft YaHei", sans-serif;
        background: light-dark(#fafafa, #1b1b1f);
        color: light-dark(#26262a, #e4e4e8);
      }
      h1 {
        font-size: 1.2rem;
      }
      .hint {
        color: light-dark(#6b6b73, #9a9aa4);
        font-size: 0.85rem;
        margin-bottom: 16px;
      }
      .row {
        display: flex;
        gap: 8px;
        align-items: center;
        margin-bottom: 8px;
      }
      input,
      select,
      button {
        font: inherit;
        padding: 6px 10px;
        border-radius: 6px;
        border: 1px solid light-dark(#d9d9df, #3a3a42);
        background: light-dark(#fff, #26262a);
        color: inherit;
      }
      button.primary {
        background: #c8281e;
        color: #fff;
        border: none;
        cursor: pointer;
      }
      ul {
        list-style: none;
        padding: 0;
      }
      li {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 0;
        border-bottom: 1px solid light-dark(#eee, #333);
      }
      code {
        font-size: 0.8rem;
        color: light-dark(#6b6b73, #9a9aa4);
      }
      button.del {
        border: none;
        background: transparent;
        color: #c8281e;
        cursor: pointer;
      }
    </style>
  </head>
  <body>
    <h1>凭证保险箱 · Credential Vault</h1>
    <p class="hint">
      密钥经操作系统加密后保存,配置文件中只保留占位符,网关子进程运行时才注入。此处录入的密钥不会经过网关控制台。<br />
      Keys are OS-encrypted; the config only holds placeholders. Reference them in model config as
      <code>${HYCLAW_CRED_&lt;ID&gt;}</code>.
    </p>
    <div class="row">
      <input id="pid" placeholder="Provider ID(如 anthropic / deepseek)" />
      <input id="secret" type="password" placeholder="API Key" style="flex:1" />
      <button class="primary" id="save">保存 / Save</button>
    </div>
    <p class="hint" id="envhint"></p>
    <ul id="list"></ul>
    <script>
      const listEl = document.getElementById("list");
      async function refresh() {
        const entries = await window.hyclawVault.list();
        listEl.innerHTML = "";
        for (const e of entries) {
          const li = document.createElement("li");
          const label = document.createElement("span");
          label.innerHTML = e.providerId + " &nbsp; <code>${" + e.envVar + "}</code>";
          const del = document.createElement("button");
          del.className = "del";
          del.textContent = "删除 / Delete";
          del.onclick = async () => {
            await window.hyclawVault.remove(e.providerId);
            refresh();
          };
          li.append(label, del);
          listEl.appendChild(li);
        }
      }
      document.getElementById("pid").addEventListener("input", (ev) => {
        const id = ev.target.value.trim();
        document.getElementById("envhint").textContent = id
          ? "配置中引用:${HYCLAW_CRED_" + id.toUpperCase().replace(/[^A-Z0-9_]/g, "_") + "}"
          : "";
      });
      document.getElementById("save").onclick = async () => {
        const pid = document.getElementById("pid").value.trim();
        const secret = document.getElementById("secret").value;
        if (!pid || !secret) return;
        const res = await window.hyclawVault.set(pid, secret);
        if (!res.ok) {
          alert(res.error || "保存失败");
          return;
        }
        document.getElementById("secret").value = "";
        document.getElementById("pid").value = "";
        document.getElementById("envhint").textContent = "";
        refresh();
      };
      refresh();
    </script>
  </body>
</html>
```

- [ ] **Step 3: main.ts 增加 IPC + 凭证窗口 + 托盘入口**

在 main.ts 顶部 import 追加:

```ts
import path from "node:path";
import { app, BrowserWindow, ipcMain } from "electron";
import { appendAudit as auditAppend } from "@hyclaw/hyshield";
import { providerEnvVar } from "./vault.js";
```

(注意:`appendAudit` 已在 Task 4 导入;这里复用同一导入,不重复。若已导入则跳过。)

将 Task 4 中创建的 `vault` 提升为 whenReady 作用域内可被 IPC 闭包访问的变量(已是局部 const,IPC 注册放在其后)。在 `manager.start()` 之前追加 IPC 注册与凭证窗口工厂:

```ts
let credentialsWindow: BrowserWindow | null = null;
const openCredentials = () => {
  if (credentialsWindow && !credentialsWindow.isDestroyed()) {
    credentialsWindow.focus();
    return;
  }
  credentialsWindow = new BrowserWindow({
    width: 640,
    height: 520,
    title: "凭证保险箱 · HYClaw",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(import.meta.dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  void credentialsWindow.loadFile(
    path.join(import.meta.dirname, "..", "assets", "credentials.html"),
  );
};

ipcMain.handle("hyclaw:vault:list", () => vault.listEntries());
ipcMain.handle("hyclaw:vault:set", (_e, providerId: string, secret: string) => {
  try {
    vault.setSecret(providerId, secret);
    appendAudit(
      config.auditDir,
      "credential.saved",
      { provider: providerId, env: providerEnvVar(providerId) },
      new Date().toISOString(),
    );
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
});
ipcMain.handle("hyclaw:vault:delete", (_e, providerId: string) => {
  vault.deleteSecret(providerId);
  appendAudit(
    config.auditDir,
    "credential.deleted",
    { provider: providerId },
    new Date().toISOString(),
  );
  return { ok: true };
});
```

并把托盘创建改为带凭证入口(替换 Task 4 中的 `createTray` 调用):

```ts
createTray({
  onShow: showWindow,
  onCredentials: openCredentials,
  onQuit: () => app.quit(),
});
```

- [ ] **Step 4: tray.ts 增加凭证菜单项**

修改 `createTray` 签名与菜单(`apps/desktop/src/tray.ts`):

```ts
export function createTray(handlers: {
  onShow: () => void;
  onCredentials: () => void;
  onQuit: () => void;
}): Tray {
  const icon = nativeImage.createFromPath(path.join(ASSETS_DIR, "icon-32.png"));
  const tray = new Tray(icon);
  tray.setToolTip("HYClaw · 和熠智脑");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "打开 HYClaw / Open", click: handlers.onShow },
      { label: "凭证保险箱 / Credentials", click: handlers.onCredentials },
      { type: "separator" },
      { label: "退出 / Quit", click: handlers.onQuit },
    ]),
  );
  tray.on("double-click", handlers.onShow);
  return tray;
}
```

- [ ] **Step 5: 确保 electron-builder 打包含 preload + credentials.html**

`scripts/pack.mjs` 已复制整个 `dist/` 与 `assets/`,preload.js 会随 tsc 进 dist、credentials.html 在 assets,无需改。构建验证即可。

- [ ] **Step 6: 构建 + 冒烟**

Run: `pnpm --filter @hyclaw/desktop build`
Expected: tsc 通过,`dist/preload.js` 存在。

手动冒烟(需先停掉旧实例、释放 18789):
Run: `pnpm --filter @hyclaw/desktop start`
Expected(逐项):

1. 正常进控制台(默认中文)
2. 托盘菜单出现「凭证保险箱 / Credentials」,点开是独立窗口
3. 录入 providerId=`anthropic` + 任意串 → 保存 → 列表出现 `anthropic ${HYCLAW_CRED_ANTHROPIC}`
4. 关闭应用后 `Get-Content ~/.hyclaw/vault.json` **搜不到刚才明文串**
5. `Get-Content ~/.hyclaw/audit/audit-*.jsonl` 有 `credential.saved`,且其中无明文密钥

- [ ] **Step 7: 提交**

```bash
git add apps/desktop/src/preload.ts apps/desktop/assets/credentials.html apps/desktop/src/main.ts apps/desktop/src/tray.ts
git commit -m "feat: add in-shell credential manager window with IPC vault access"
```

---

### Task 6: 安全冒烟脚本 + 打包 + 合并推送

**Files:**

- Create: `apps/desktop/scripts/security-smoke.mjs`

**Interfaces:**

- Produces:可重复运行的安全自检脚本,覆盖验收标准 2.1/2.2 的一票否决项(端口仅回环、vault 无明文)。

- [ ] **Step 1: security-smoke.mjs**

```ts
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
  if (probe && raw.includes(probe)) fail(`plaintext secret found in vault.json!`);
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
```

在 `apps/desktop/package.json` scripts 追加:

```json
    "security-smoke": "node scripts/security-smoke.mjs",
```

- [ ] **Step 2: 运行安全冒烟**

Run(应用运行时): `pnpm --filter @hyclaw/desktop security-smoke <刚保存的明文串>`
Expected: 全部 ✓,退出码 0。

- [ ] **Step 3: 打包验证**

Run: `pnpm --filter @hyclaw/desktop pack:dir`
Expected: 退出码 0,`release/win-unpacked/HYClaw.exe` 更新。

- [ ] **Step 4: 提交 + 合并推送**

```bash
git add apps/desktop/scripts/security-smoke.mjs apps/desktop/package.json
git commit -m "test: add HYShield security smoke script (loopback + no-plaintext)"
git switch main
git merge feat/m2-hyshield --ff-only
git push origin main
```

---

## Self-Review 结论

- **Spec 覆盖**:对应设计文档第 5 节 HYShield 的「网络围栏」「凭证加密(OmniVault V1 地基)」「审计日志」;「出站域名白名单」按用户决策拆到 M2.5(需改上游/架代理),已在计划标题与 Global Constraints 注明。满足验收标准 2.1(仅回环、非回环拒启)、2.2(无明文密钥、加密持久化)、2.3 的审计部分。「模型配置页三类 Provider + 连通性测试」保留在网关既有控制台(上游已有 model-providers 页),本计划新增的是**密钥安全录入路径**(壳内保险箱窗口),二者互补。
- **占位符扫描**:无 TBD;所有代码块完整。Task 1 Step 6 明确了 index.ts 分两次写(先 network-fence,Task 2 补审计)以免引用未创建文件。
- **类型一致性**:`CipherBackend`/`CredentialVault`/`providerEnvVar` 在 Task 3 定义,Task 4/5 消费一致;`createTray` 签名在 Task 5 Step 3/4 同步加 `onCredentials`;`GatewayConfig` 追加 `vaultPath`/`auditDir` 在 Task 4 定义并被 main.ts、测试消费。
- **安全边界**:密钥仅经壳内 IPC 窗口进保险箱,不经网关控制台;magic 注入走 M1 已有 env 通道;审计双层防泄漏(调用方不传密钥 + appendAudit 正则兜底)。
