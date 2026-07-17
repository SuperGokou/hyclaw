# HYClaw M1 Implementation Plan — Fork + 品牌化 + Electron 壳

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 openclaw fork 基础上交付品牌化的 HYClaw Electron 桌面壳:启动即拉起本机 Gateway 子进程,加载品牌化控制台,可对话。

**Architecture:** Electron 主进程(`apps/desktop/`)以子进程方式管理 openclaw Gateway(系统 Node 运行 `openclaw.mjs gateway`),窗口先显示品牌化加载页,Gateway 就绪后加载 `http://127.0.0.1:18789/`(回环连接免配对)。品牌化走「表面精准替换」:语言包集中字段 `brandName`/`productName` + 少量硬编码点 + 图标资产,不做全局查找替换。

**Tech Stack:** Electron ^38 + TypeScript(NodeNext/ESM)+ vitest;图标生成 sharp + decode-ico + png-to-ico;打包 electron-builder(NSIS)。

## Global Constraints

- Node `>=22.22.3 <23 || >=24.15.0 <25 || >=25.9.0`(本机 v24.15.0 已满足);包管理器 **pnpm 11.2.2**(corepack)
- 仓库根即 openclaw fork 根(`C:\Users\xiaming\Desktop\HYClaw`);上游远程 `upstream`,不向上游推送
- **最小化上游文件侵入**:新代码只进 `apps/desktop/`、`branding/`;上游文件仅允许改本计划点名的行
- 全部 ESM(`"type": "module"`);TypeScript strict;单文件 <400 行;无硬编码密钥
- 提交格式:`<type>: <description>`(feat/fix/refactor/docs/test/chore);**不加 Co-Authored-By**(用户全局配置已禁用归属)
- 品牌名:英文 `HYClaw`,中文副题 `和熠智脑`,公司 `EFD 和熠光显`;窗口标题 `HYClaw · 和熠智脑`
- Logo 源文件:`C:\Users\xiaming\Desktop\favicon.ico`(仅 ≤48px 层,放大到 256/512 会有锯齿——**可接受,已知风险**,后续向设计部要矢量源文件再重跑生成脚本)
- 每个任务结束运行受影响包的测试;涉及上游 `ui/` 的改动必须跑 `pnpm --filter openclaw-control-ui build` 验证

---

### Task 1: 验证上游在 Windows 原生构建可用(无提交)

**Files:** 无新增/修改。

**Interfaces:**
- Produces: 可用的 `dist/`(Gateway 构建产物)与 `dist/control-ui/`(控制台静态资源);确认 `node openclaw.mjs gateway` 在本机可启动并服务控制台。

- [ ] **Step 1: 安装依赖**

Run: `pnpm install`(仓库根)
Expected: 退出码 0。若出现平台相关可选依赖告警可忽略;若 postinstall 脚本失败,记录失败的包名并检查是否 Windows 不兼容(此时停下上报,不要绕过)。

- [ ] **Step 2: 构建**

Run: `pnpm build`
Expected: 退出码 0,生成 `dist/index.js`。

Run: `pnpm ui:build`
Expected: 退出码 0,生成 `dist/control-ui/index.html`。

- [ ] **Step 3: 启动 Gateway 并验证控制台**

Run(后台启动,验证后关闭): `node openclaw.mjs gateway --port 18789`
Expected: 进程存活,日志出现 gateway 监听信息。

Run(另一终端): `curl.exe -s -o NUL -w "%{http_code}" http://127.0.0.1:18789/`
Expected: `200`(或 3xx;非连接拒绝即可)。

若 Gateway 因缺少初始配置退出:运行 `node openclaw.mjs setup` 后重试,并把所需步骤记录进 Task 9 的 README。验证完成后结束 Gateway 进程(Ctrl+C 或 `taskkill /PID <pid>`)。

- [ ] **Step 4: 确认端口只绑回环**

Run: `netstat -ano | findstr 18789`
Expected: 监听地址为 `127.0.0.1:18789`(不是 `0.0.0.0`)。如是 `0.0.0.0`,记录到计划备注,M2 HYShield 必须修——但 M1 不改。

---

### Task 2: branding 包 — 从 EFD logo 生成全套图标

**Files:**
- Create: `branding/package.json`
- Create: `branding/source/efd-logo.ico`(从 `C:\Users\xiaming\Desktop\favicon.ico` 复制)
- Create: `branding/scripts/generate-icons.mjs`
- Create: `branding/scripts/verify-icons.mjs`
- Create: `branding/generated/`(脚本产物,提交入库)
- Modify: `pnpm-workspace.yaml`(packages 列表追加 `branding`、`apps/desktop` 两项)

**Interfaces:**
- Produces: `branding/generated/icon-{16,24,32,48,64,128,180,256,512}.png`、`branding/generated/icon.ico`(含 256px 层)、`branding/generated/favicon.svg`。Task 3/4/8 直接消费这些文件。

- [ ] **Step 1: 修改 pnpm-workspace.yaml**

在 packages 列表(现有 `"."`, `ui`, `packages/*`, `extensions/*`, `examples/*`)追加两行:

```yaml
  - branding
  - apps/desktop
```

- [ ] **Step 2: 创建 branding/package.json**

```json
{
  "name": "@hyclaw/branding",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "generate": "node scripts/generate-icons.mjs",
    "verify": "node scripts/verify-icons.mjs"
  },
  "devDependencies": {
    "decode-ico": "^0.4.1",
    "png-to-ico": "^2.1.8",
    "sharp": "^0.34.0"
  }
}
```

- [ ] **Step 3: 复制 logo 源文件**

Run: `Copy-Item "C:\Users\xiaming\Desktop\favicon.ico" "branding\source\efd-logo.ico"`(先 `New-Item -ItemType Directory -Force branding\source`)

- [ ] **Step 4: 写生成脚本 branding/scripts/generate-icons.mjs**

```js
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import decodeIco from "decode-ico";
import pngToIco from "png-to-ico";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const sourceIco = path.join(root, "source", "efd-logo.ico");
const outDir = path.join(root, "generated");
const PNG_SIZES = [16, 24, 32, 48, 64, 128, 180, 256, 512];
const ICO_SIZES = new Set([16, 24, 32, 48, 64, 128, 256]);

const images = decodeIco(await readFile(sourceIco));
const largest = images.reduce((a, b) => (b.width > a.width ? b : a));
const base =
  largest.type === "png"
    ? sharp(Buffer.from(largest.data))
    : sharp(Buffer.from(largest.data), {
        raw: { width: largest.width, height: largest.height, channels: 4 },
      });
const basePng = await base.png().toBuffer();

await mkdir(outDir, { recursive: true });
const icoInputs = [];
for (const size of PNG_SIZES) {
  const file = path.join(outDir, `icon-${size}.png`);
  await sharp(basePng)
    .resize(size, size, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    })
    .png()
    .toFile(file);
  if (ICO_SIZES.has(size)) icoInputs.push(file);
}
await writeFile(path.join(outDir, "icon.ico"), await pngToIco(icoInputs));

const png256 = await readFile(path.join(outDir, "icon-256.png"));
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><image href="data:image/png;base64,${png256.toString("base64")}" width="256" height="256"/></svg>\n`;
await writeFile(path.join(outDir, "favicon.svg"), svg);

console.log(`generated ${PNG_SIZES.length} PNGs + icon.ico + favicon.svg (source layer: ${largest.width}px)`);
```

- [ ] **Step 5: 写校验脚本 branding/scripts/verify-icons.mjs**

```js
import { stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const outDir = path.resolve(import.meta.dirname, "..", "generated");
const meta = await sharp(path.join(outDir, "icon-256.png")).metadata();
if (meta.width !== 256 || meta.height !== 256) {
  throw new Error(`icon-256.png is ${meta.width}x${meta.height}, expected 256x256`);
}
const ico = await stat(path.join(outDir, "icon.ico"));
if (ico.size < 1000) throw new Error(`icon.ico is ${ico.size} bytes, looks empty`);
const svg = await stat(path.join(outDir, "favicon.svg"));
if (svg.size < 500) throw new Error("favicon.svg looks empty");
console.log("branding assets OK");
```

- [ ] **Step 6: 安装依赖并先跑校验(应失败)**

Run: `pnpm install`(根目录,让 workspace 收编 branding)
Run: `pnpm --filter @hyclaw/branding verify`
Expected: FAIL(`generated/` 尚不存在)——确认校验脚本真的在校验。

- [ ] **Step 7: 生成并校验(应通过)**

Run: `pnpm --filter @hyclaw/branding generate`
Expected: 输出 `generated 9 PNGs + icon.ico + favicon.svg`。

Run: `pnpm --filter @hyclaw/branding verify`
Expected: `branding assets OK`。

- [ ] **Step 8: 提交**

```bash
git add pnpm-workspace.yaml branding pnpm-lock.yaml
git commit -m "feat: add EFD branding package with icon generation pipeline"
```

---

### Task 3: 控制台 UI 表面品牌化

**Files:**
- Modify: `ui/index.html:9,218,222,225,319`
- Modify: `ui/src/components/app-sidebar.ts:104`
- Modify: `ui/src/components/app-topbar.ts:44,51`
- Modify: `ui/src/i18n/locales/en.ts`、`ui/src/i18n/locales/zh-CN.ts`、`ui/src/i18n/locales/zh-TW.ts`(仅 `brandName`/`productName` 两字段)
- Modify: `ui/src/pages/about/view.test.ts:44`、`ui/src/e2e/about.e2e.test.ts:86`(期望值同步)
- Replace: `ui/public/favicon.ico`、`ui/public/favicon-32.png`、`ui/public/favicon.svg`、`ui/public/apple-touch-icon.png`

**Interfaces:**
- Consumes: `branding/generated/*`(Task 2)
- Produces: 构建后 `dist/control-ui/` 全部展示 HYClaw 品牌。

- [ ] **Step 1: 改标题与回退页文案(ui/index.html)**

第 9 行 `<title>OpenClaw Control</title>` → `<title>HYClaw Control · 和熠智脑</title>`;第 218/222/225/319 行中的 `OpenClaw` → `HYClaw`(仅这四处,保持句式)。

- [ ] **Step 2: 改侧边栏/顶栏品牌字**

`ui/src/components/app-sidebar.ts:104`:`<span class="sidebar-brand__title">OpenClaw</span>` → `HYClaw`
`ui/src/components/app-topbar.ts:44`:`aria-label="OpenClaw"` → `aria-label="HYClaw"`;`:51` 的 `<span class="topbar-brand__title">OpenClaw</span>` → `HYClaw`

- [ ] **Step 3: 改语言包品牌字段**

在 `en.ts`、`zh-CN.ts`、`zh-TW.ts` 中(各文件两处,用 grep `brandName:` / `productName:` 定位):`"OpenClaw"` → `"HYClaw"`。其他语言包不动(V1 只交付中英)。

- [ ] **Step 4: 同步两个断言**

`ui/src/pages/about/view.test.ts:44` 与 `ui/src/e2e/about.e2e.test.ts:86` 中期望的 `"OpenClaw"` → `"HYClaw"`。

- [ ] **Step 5: 替换 favicon 资产**

```powershell
Copy-Item branding\generated\icon.ico ui\public\favicon.ico -Force
Copy-Item branding\generated\icon-32.png ui\public\favicon-32.png -Force
Copy-Item branding\generated\favicon.svg ui\public\favicon.svg -Force
Copy-Item branding\generated\icon-180.png ui\public\apple-touch-icon.png -Force
```

- [ ] **Step 6: 跑受影响的单测**

Run: `pnpm --filter openclaw-control-ui exec vitest run src/pages/about/view.test.ts`
Expected: PASS。

- [ ] **Step 7: 构建控制台**

Run: `pnpm ui:build`
Expected: 退出码 0。`Select-String -Path dist\control-ui\index.html -Pattern "HYClaw"` 有命中。

- [ ] **Step 8: 提交**

```bash
git add ui/index.html ui/src/components/app-sidebar.ts ui/src/components/app-topbar.ts ui/src/i18n/locales/en.ts ui/src/i18n/locales/zh-CN.ts ui/src/i18n/locales/zh-TW.ts ui/src/pages/about/view.test.ts ui/src/e2e/about.e2e.test.ts ui/public
git commit -m "feat: rebrand control UI surface to HYClaw"
```

---

### Task 4: apps/desktop 脚手架 — 品牌窗口能开

**Files:**
- Create: `apps/desktop/package.json`
- Create: `apps/desktop/tsconfig.json`
- Create: `apps/desktop/.gitignore`
- Create: `apps/desktop/assets/loading.html`
- Create: `apps/desktop/assets/`(复制 `icon.ico`、`icon-32.png`、`icon-256.png`)
- Create: `apps/desktop/src/window.ts`
- Create: `apps/desktop/src/main.ts`(本任务为最小版,Task 7 扩写)

**Interfaces:**
- Produces: `createMainWindow(): BrowserWindow`、`showFailurePage(win: BrowserWindow): void`(`src/window.ts`);`pnpm --filter @hyclaw/desktop start` 打开品牌窗口。

- [ ] **Step 1: package.json**

```json
{
  "name": "@hyclaw/desktop",
  "version": "0.1.0",
  "private": true,
  "description": "HYClaw desktop shell (EFD)",
  "type": "module",
  "main": "dist/main.js",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "start": "pnpm run build && electron .",
    "test": "vitest run",
    "pack:dir": "pnpm run build && electron-builder --dir --config electron-builder.yml"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "electron": "^38.0.0",
    "electron-builder": "^26.0.0",
    "typescript": "^5.9.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: tsconfig.json**

```json
{
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "target": "ES2023",
    "lib": ["ES2023"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "types": ["node"],
    "skipLibCheck": true,
    "sourceMap": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: .gitignore**

```
dist/
release/
```

- [ ] **Step 4: 复制图标资产**

```powershell
New-Item -ItemType Directory -Force apps\desktop\assets
Copy-Item branding\generated\icon.ico apps\desktop\assets\icon.ico
Copy-Item branding\generated\icon-32.png apps\desktop\assets\icon-32.png
Copy-Item branding\generated\icon-256.png apps\desktop\assets\icon-256.png
```

- [ ] **Step 5: assets/loading.html(品牌加载/故障页)**

```html
<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>HYClaw · 和熠智脑</title>
<style>
  :root { color-scheme: light dark; }
  body {
    margin: 0; height: 100vh; display: grid; place-items: center;
    font-family: "Segoe UI", "Microsoft YaHei", sans-serif;
    background: light-dark(#fafafa, #1b1b1f); color: light-dark(#26262a, #e4e4e8);
  }
  .card { text-align: center; }
  .card img { width: 96px; height: 96px; }
  h1 { font-size: 1.4rem; margin: 16px 0 4px; }
  p { margin: 4px 0; color: light-dark(#6b6b73, #9a9aa4); }
  .spinner {
    width: 28px; height: 28px; margin: 20px auto 0; border-radius: 50%;
    border: 3px solid light-dark(#d9d9df, #3a3a42); border-top-color: #c8281e;
    animation: spin 0.9s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .failed .spinner { display: none; }
  .failed-only { display: none; }
  .failed .failed-only { display: block; }
  .failed .loading-only { display: none; }
</style>
</head>
<body>
<div class="card" id="card">
  <img src="icon-256.png" alt="EFD HYClaw" />
  <h1>HYClaw · 和熠智脑</h1>
  <p class="loading-only">正在启动本地智能体网关… / Starting local gateway…</p>
  <p class="failed-only">网关启动失败,请查看日志后重启应用。<br />Gateway failed to start. Check logs and restart.</p>
  <div class="spinner"></div>
</div>
<script>
  if (new URLSearchParams(location.search).get("state") === "failed") {
    document.getElementById("card").classList.add("failed");
  }
</script>
</body>
</html>
```

- [ ] **Step 6: src/window.ts**

```ts
import path from "node:path";
import { BrowserWindow } from "electron";

const ASSETS_DIR = path.join(import.meta.dirname, "..", "assets");

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: "HYClaw · 和熠智脑",
    icon: path.join(ASSETS_DIR, "icon.ico"),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  win.on("page-title-updated", (event) => event.preventDefault());
  void win.loadFile(path.join(ASSETS_DIR, "loading.html"));
  return win;
}

export function showFailurePage(win: BrowserWindow): void {
  void win.loadFile(path.join(ASSETS_DIR, "loading.html"), {
    query: { state: "failed" },
  });
}
```

- [ ] **Step 7: src/main.ts(最小版)**

```ts
import { app } from "electron";
import { createMainWindow } from "./window.js";

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(() => {
    createMainWindow();
  });
  app.on("window-all-closed", () => {
    app.quit();
  });
}
```

- [ ] **Step 8: 安装并启动验证**

Run: `pnpm install`(根)
Run: `pnpm --filter @hyclaw/desktop start`
Expected: 打开 1280×800 窗口,标题 `HYClaw · 和熠智脑`,任务栏图标为 EFD logo,页面显示品牌加载卡片。关闭窗口应用退出。

- [ ] **Step 9: 提交**

```bash
git add apps/desktop pnpm-lock.yaml
git commit -m "feat: scaffold HYClaw electron desktop shell with branded window"
```

---

### Task 5: gateway-config — 配置解析(TDD)

**Files:**
- Create: `apps/desktop/src/gateway-config.ts`
- Test: `apps/desktop/test/gateway-config.test.ts`

**Interfaces:**
- Produces:
  ```ts
  interface GatewayConfig {
    repoRoot: string; nodeBin: string; entry: string; port: number; url: string;
  }
  function resolveGatewayConfig(env?: NodeJS.ProcessEnv, appRoot?: string): GatewayConfig
  ```
  `appRoot` 是 `apps/desktop` 目录(main 里传 `app.getAppPath()`);`repoRoot` 默认取其上两级。环境变量:`HYCLAW_REPO_ROOT`、`HYCLAW_NODE_BIN`、`HYCLAW_GATEWAY_PORT`。

- [ ] **Step 1: 写失败测试 test/gateway-config.test.ts**

```ts
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveGatewayConfig } from "../src/gateway-config.js";

const APP_ROOT = path.join("C:", "repo", "apps", "desktop");

describe("resolveGatewayConfig", () => {
  it("defaults to port 18789 with repo root two levels up", () => {
    const cfg = resolveGatewayConfig({}, APP_ROOT);
    expect(cfg.port).toBe(18789);
    expect(cfg.url).toBe("http://127.0.0.1:18789/");
    expect(cfg.repoRoot).toBe(path.resolve(APP_ROOT, "..", ".."));
    expect(cfg.entry).toBe(path.join(cfg.repoRoot, "openclaw.mjs"));
    expect(cfg.nodeBin).toBe("node");
  });

  it("honors env overrides", () => {
    const cfg = resolveGatewayConfig(
      {
        HYCLAW_REPO_ROOT: path.join("D:", "hyclaw"),
        HYCLAW_NODE_BIN: path.join("D:", "node", "node.exe"),
        HYCLAW_GATEWAY_PORT: "18999",
      },
      APP_ROOT,
    );
    expect(cfg.repoRoot).toBe(path.join("D:", "hyclaw"));
    expect(cfg.nodeBin).toBe(path.join("D:", "node", "node.exe"));
    expect(cfg.port).toBe(18999);
    expect(cfg.url).toBe("http://127.0.0.1:18999/");
  });

  it.each(["abc", "0", "-1", "70000"])("rejects invalid port %s", (raw) => {
    expect(() => resolveGatewayConfig({ HYCLAW_GATEWAY_PORT: raw }, APP_ROOT)).toThrow(
      /invalid gateway port/,
    );
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @hyclaw/desktop test`
Expected: FAIL — 找不到 `../src/gateway-config.js`。

- [ ] **Step 3: 实现 src/gateway-config.ts**

```ts
import path from "node:path";

export interface GatewayConfig {
  repoRoot: string;
  nodeBin: string;
  entry: string;
  port: number;
  url: string;
}

const DEFAULT_PORT = 18789;

export function resolveGatewayConfig(
  env: NodeJS.ProcessEnv = process.env,
  appRoot: string = path.resolve(import.meta.dirname, ".."),
): GatewayConfig {
  const rawPort = env.HYCLAW_GATEWAY_PORT ?? String(DEFAULT_PORT);
  const port = Number.parseInt(rawPort, 10);
  if (!Number.isInteger(port) || String(port) !== rawPort.trim() || port <= 0 || port > 65535) {
    throw new Error(`invalid gateway port: ${rawPort}`);
  }
  const repoRoot = env.HYCLAW_REPO_ROOT ?? path.resolve(appRoot, "..", "..");
  return {
    repoRoot,
    nodeBin: env.HYCLAW_NODE_BIN ?? "node",
    entry: path.join(repoRoot, "openclaw.mjs"),
    port,
    url: `http://127.0.0.1:${port}/`,
  };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @hyclaw/desktop test`
Expected: PASS(3 个用例组全绿)。

- [ ] **Step 5: 提交**

```bash
git add apps/desktop/src/gateway-config.ts apps/desktop/test/gateway-config.test.ts
git commit -m "feat: add gateway config resolution for desktop shell"
```

---

### Task 6: gateway-manager — 子进程生命周期(TDD)

**Files:**
- Create: `apps/desktop/src/gateway-manager.ts`
- Test: `apps/desktop/test/gateway-manager.test.ts`

**Interfaces:**
- Consumes: `GatewayConfig`(Task 5)
- Produces:
  ```ts
  type GatewayEvent = "started" | "exited" | "restarting" | "failed";
  class GatewayManager {
    constructor(config: GatewayConfig, options?: {
      spawnFn?: SpawnLike; maxRestarts?: number; restartDelayMs?: number;
      onEvent?: (event: GatewayEvent, detail?: string) => void;
    });
    start(): void; stop(): void; isRunning(): boolean;
  }
  function waitForGateway(url: string, options?: {
    timeoutMs?: number; intervalMs?: number; fetchFn?: typeof fetch;
  }): Promise<void>
  ```
  崩溃自动重启,超过 `maxRestarts`(默认 3)发出 `failed`;`stop()` 后不再重启。`waitForGateway` 轮询 HTTP,拿到任意响应即就绪,超时 reject。

- [ ] **Step 1: 写失败测试 test/gateway-manager.test.ts**

```ts
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import type { GatewayConfig } from "../src/gateway-config.js";
import { GatewayManager, waitForGateway } from "../src/gateway-manager.js";

const CONFIG: GatewayConfig = {
  repoRoot: "C:/repo",
  nodeBin: "node",
  entry: "C:/repo/openclaw.mjs",
  port: 18789,
  url: "http://127.0.0.1:18789/",
};

class FakeChild extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  killed = false;
  kill(): boolean {
    this.killed = true;
    this.emit("exit", null, "SIGTERM");
    return true;
  }
}

function makeManager(overrides: { maxRestarts?: number } = {}) {
  const children: FakeChild[] = [];
  const spawnFn = vi.fn(() => {
    const child = new FakeChild();
    children.push(child);
    return child as never;
  });
  const events: string[] = [];
  const manager = new GatewayManager(CONFIG, {
    spawnFn: spawnFn as never,
    maxRestarts: overrides.maxRestarts ?? 3,
    restartDelayMs: 0,
    onEvent: (event) => events.push(event),
  });
  return { manager, spawnFn, children, events };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

describe("GatewayManager", () => {
  it("spawns gateway with node entry and port args", () => {
    const { manager, spawnFn } = makeManager();
    manager.start();
    expect(spawnFn).toHaveBeenCalledWith(
      "node",
      ["C:/repo/openclaw.mjs", "gateway", "--port", "18789"],
      expect.objectContaining({ cwd: "C:/repo" }),
    );
    expect(manager.isRunning()).toBe(true);
  });

  it("restarts on unexpected exit, then fails after maxRestarts", async () => {
    const { manager, spawnFn, children, events } = makeManager({ maxRestarts: 2 });
    manager.start();
    children[0].emit("exit", 1, null);
    await tick();
    expect(spawnFn).toHaveBeenCalledTimes(2);
    children[1].emit("exit", 1, null);
    await tick();
    expect(spawnFn).toHaveBeenCalledTimes(3);
    children[2].emit("exit", 1, null);
    await tick();
    expect(spawnFn).toHaveBeenCalledTimes(3);
    expect(events).toContain("failed");
  });

  it("does not restart after stop()", async () => {
    const { manager, spawnFn, children } = makeManager();
    manager.start();
    manager.stop();
    expect(children[0].killed).toBe(true);
    await tick();
    expect(spawnFn).toHaveBeenCalledTimes(1);
    expect(manager.isRunning()).toBe(false);
  });
});

describe("waitForGateway", () => {
  it("resolves once fetch succeeds", async () => {
    let calls = 0;
    const fetchFn = vi.fn(async () => {
      calls += 1;
      if (calls < 3) throw new Error("ECONNREFUSED");
      return new Response("ok");
    });
    await waitForGateway("http://127.0.0.1:18789/", {
      fetchFn: fetchFn as never,
      intervalMs: 1,
      timeoutMs: 1000,
    });
    expect(calls).toBe(3);
  });

  it("rejects on timeout", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    await expect(
      waitForGateway("http://127.0.0.1:18789/", {
        fetchFn: fetchFn as never,
        intervalMs: 1,
        timeoutMs: 15,
      }),
    ).rejects.toThrow(/not reachable/);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @hyclaw/desktop test`
Expected: FAIL — 找不到 `../src/gateway-manager.js`。

- [ ] **Step 3: 实现 src/gateway-manager.ts**

```ts
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import type { GatewayConfig } from "./gateway-config.js";

export type GatewayEvent = "started" | "exited" | "restarting" | "failed";
type SpawnLike = typeof spawn;

interface GatewayManagerOptions {
  spawnFn?: SpawnLike;
  maxRestarts?: number;
  restartDelayMs?: number;
  onEvent?: (event: GatewayEvent, detail?: string) => void;
}

export class GatewayManager {
  private child: ChildProcess | null = null;
  private restarts = 0;
  private stopped = false;
  private readonly spawnFn: SpawnLike;
  private readonly maxRestarts: number;
  private readonly restartDelayMs: number;
  private readonly onEvent: (event: GatewayEvent, detail?: string) => void;

  constructor(
    private readonly config: GatewayConfig,
    options: GatewayManagerOptions = {},
  ) {
    this.spawnFn = options.spawnFn ?? spawn;
    this.maxRestarts = options.maxRestarts ?? 3;
    this.restartDelayMs = options.restartDelayMs ?? 1000;
    this.onEvent = options.onEvent ?? (() => {});
  }

  start(): void {
    if (this.child || this.stopped) return;
    const child = this.spawnFn(
      this.config.nodeBin,
      [this.config.entry, "gateway", "--port", String(this.config.port)],
      { cwd: this.config.repoRoot, stdio: ["ignore", "pipe", "pipe"] },
    );
    this.child = child;
    child.stdout?.on("data", (chunk: Buffer) => this.onEvent("started", chunk.toString().trim()));
    child.stderr?.on("data", (chunk: Buffer) => this.onEvent("started", chunk.toString().trim()));
    child.on("exit", (code, signal) => {
      this.child = null;
      this.onEvent("exited", `code=${code} signal=${signal}`);
      if (this.stopped) return;
      if (this.restarts >= this.maxRestarts) {
        this.onEvent("failed", `gateway exited ${this.restarts + 1} times`);
        return;
      }
      this.restarts += 1;
      this.onEvent("restarting", `attempt ${this.restarts}/${this.maxRestarts}`);
      setTimeout(() => {
        if (!this.stopped) this.start();
      }, this.restartDelayMs);
    });
    this.onEvent("started");
  }

  stop(): void {
    this.stopped = true;
    this.child?.kill();
    this.child = null;
  }

  isRunning(): boolean {
    return this.child !== null;
  }
}

interface WaitOptions {
  timeoutMs?: number;
  intervalMs?: number;
  fetchFn?: typeof fetch;
}

export async function waitForGateway(url: string, options: WaitOptions = {}): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const intervalMs = options.intervalMs ?? 500;
  const fetchFn = options.fetchFn ?? fetch;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetchFn(url);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
  throw new Error(`gateway not reachable at ${url} within ${timeoutMs}ms`);
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @hyclaw/desktop test`
Expected: PASS(全部用例)。

- [ ] **Step 5: 提交**

```bash
git add apps/desktop/src/gateway-manager.ts apps/desktop/test/gateway-manager.test.ts
git commit -m "feat: add gateway child-process manager with restart policy"
```

---

### Task 7: 接线 — 托盘、生命周期、加载真实控制台

**Files:**
- Create: `apps/desktop/src/tray.ts`
- Modify: `apps/desktop/src/main.ts`(替换 Task 4 的最小版,完整内容如下)

**Interfaces:**
- Consumes: Task 4-6 的全部导出
- Produces: `createTray(handlers: { onShow: () => void; onQuit: () => void }): Tray`;完整桌面应用行为(见 Step 3 验收)。

- [ ] **Step 1: src/tray.ts**

```ts
import path from "node:path";
import { Menu, Tray, nativeImage } from "electron";

const ASSETS_DIR = path.join(import.meta.dirname, "..", "assets");

export function createTray(handlers: { onShow: () => void; onQuit: () => void }): Tray {
  const icon = nativeImage.createFromPath(path.join(ASSETS_DIR, "icon-32.png"));
  const tray = new Tray(icon);
  tray.setToolTip("HYClaw · 和熠智脑");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "打开 HYClaw / Open", click: handlers.onShow },
      { type: "separator" },
      { label: "退出 / Quit", click: handlers.onQuit },
    ]),
  );
  tray.on("double-click", handlers.onShow);
  return tray;
}
```

- [ ] **Step 2: 重写 src/main.ts**

```ts
import { app, BrowserWindow } from "electron";
import { resolveGatewayConfig } from "./gateway-config.js";
import { GatewayManager, waitForGateway } from "./gateway-manager.js";
import { createTray } from "./tray.js";
import { createMainWindow, showFailurePage } from "./window.js";

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let mainWindow: BrowserWindow | null = null;
  let manager: GatewayManager | null = null;
  let quitting = false;

  const showWindow = () => {
    mainWindow?.show();
    mainWindow?.focus();
  };

  app.on("second-instance", showWindow);

  app.whenReady().then(async () => {
    const config = resolveGatewayConfig(process.env, app.getAppPath());
    manager = new GatewayManager(config, {
      onEvent: (event, detail) => {
        console.log(`[gateway] ${event}${detail ? `: ${detail}` : ""}`);
        if (event === "failed" && mainWindow) showFailurePage(mainWindow);
      },
    });

    mainWindow = createMainWindow();
    mainWindow.on("close", (event) => {
      if (!quitting) {
        event.preventDefault();
        mainWindow?.hide();
      }
    });
    createTray({
      onShow: showWindow,
      onQuit: () => app.quit(),
    });

    manager.start();
    try {
      await waitForGateway(config.url);
      await mainWindow.loadURL(config.url);
    } catch (error) {
      console.error("[gateway] startup failed", error);
      showFailurePage(mainWindow);
    }
  });

  app.on("before-quit", () => {
    quitting = true;
    manager?.stop();
  });

  app.on("window-all-closed", () => {
    // 常驻托盘,不随窗口关闭退出
  });
}
```

- [ ] **Step 3: 手动冒烟验收**

Run: `pnpm --filter @hyclaw/desktop start`
Expected(逐项确认):
1. 窗口先显示品牌加载页,数秒内自动切换到控制台,能发消息对话
2. 窗口标题保持 `HYClaw · 和熠智脑`,侧边栏品牌字为 `HYClaw`
3. 点窗口 ✕ → 窗口隐藏、托盘图标仍在;托盘双击 → 窗口回来
4. 托盘「退出」→ 应用退出,且 `netstat -ano | findstr 18789` 无监听(Gateway 已被杀)
5. 再次启动时重复启动第二个实例 → 第二实例退出并聚焦第一实例窗口

- [ ] **Step 4: 单测回归**

Run: `pnpm --filter @hyclaw/desktop test`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/desktop/src
git commit -m "feat: wire gateway lifecycle, tray, and control UI into desktop shell"
```

---

### Task 8: electron-builder 打包路径验证(--dir)

**Files:**
- Create: `apps/desktop/electron-builder.yml`

**Interfaces:**
- Produces: `pnpm --filter @hyclaw/desktop pack:dir` 产出 `apps/desktop/release/win-unpacked/HYClaw.exe`。完整离线安装器(捆绑 Node+Gateway、QClaw 式版本目录)属 M6,此处仅验证壳的打包路径。

- [ ] **Step 1: electron-builder.yml**

```yaml
appId: com.efd.hyclaw
productName: HYClaw
copyright: © 2026 EFD 和熠光显
directories:
  output: release
files:
  - dist/**
  - assets/**
  - package.json
win:
  icon: assets/icon.ico
  target:
    - nsis
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  perMachine: false
  artifactName: HYClaw-Setup-${version}.exe
  shortcutName: HYClaw
```

- [ ] **Step 2: 跑 --dir 打包**

Run: `pnpm --filter @hyclaw/desktop pack:dir`
Expected: 退出码 0,存在 `apps/desktop/release/win-unpacked/HYClaw.exe`,图标为 EFD logo。

- [ ] **Step 3: 验证 unpacked 可启动(带环境变量指向仓库)**

Run: `$env:HYCLAW_REPO_ROOT = "C:\Users\xiaming\Desktop\HYClaw"; & "apps\desktop\release\win-unpacked\HYClaw.exe"`
Expected: 品牌窗口打开并加载控制台(打包后 `app.getAppPath()` 指向 asar,故必须靠 `HYCLAW_REPO_ROOT` 找到 Gateway——离线自带 Gateway 是 M6 工作)。验证后退出。

- [ ] **Step 4: 提交**

```bash
git add apps/desktop/electron-builder.yml
git commit -m "feat: add electron-builder packaging config for HYClaw shell"
```

---

### Task 9: 仓库迁移推送 + fork 说明文档

**Files:**
- Create: `README.hyclaw.md`(仓库根)

**Interfaces:**
- Produces: `origin` = `https://github.com/SuperGokou/hyclaw.git` 且 `main` 已推送;`upstream` = openclaw 保留(拉取安全补丁用,**不推送**)。

- [ ] **Step 1: 写 README.hyclaw.md**

```markdown
# HYClaw · 和熠智脑

HYClaw 是 [OpenClaw](https://github.com/openclaw/openclaw)(MIT)的企业化分支,
由 EFD 和熠光显维护,面向公司内部的本地优先 AI 工作台。

## 与上游的差异

- `apps/desktop/` — Electron 桌面壳(Windows/macOS/Linux)
- `branding/` — EFD 品牌资产与图标生成管线
- 控制台 UI 表面品牌化(HYClaw 命名 + EFD 图标)
- 规划中:HYShield 安全围栏、Office skills、数据可视化、企微/钉钉渠道
  (见 `docs/superpowers/specs/2026-07-16-hyclaw-v1-design.md`)

## 开发

​```bash
pnpm install
pnpm build && pnpm ui:build        # 构建 Gateway 与控制台
pnpm --filter @hyclaw/desktop start # 启动桌面版
pnpm --filter @hyclaw/desktop test  # 桌面壳单测
​```

## 上游同步

​```bash
git fetch upstream main
git merge upstream/main   # 每月一次,解决冲突后回归测试
​```
```

(注意:写入文件时代码块围栏用正常三反引号,上面的零宽字符仅为本计划文档转义。)

- [ ] **Step 2: 提交**

```bash
git add README.hyclaw.md
git commit -m "docs: add HYClaw fork overview and dev guide"
```

- [ ] **Step 3: 配置 origin 并推送**

Run: `git remote add origin https://github.com/SuperGokou/hyclaw.git`
Run: `git push -u origin main`(仓库含上游全历史,体量大,耐心等待;若提示认证,用 `gh auth status` 检查 GitHub CLI 登录状态,未登录则停下向用户说明)
Expected: 推送成功,`git remote -v` 显示 origin=SuperGokou/hyclaw(fetch/push)、upstream=openclaw(fetch)。

- [ ] **Step 4: 验证远端**

Run: `git ls-remote origin main`
Expected: 返回与本地 `git rev-parse main` 相同的 SHA。

> 用户要求的「移除原始远程」安排在 V1 全部完成时(M6)执行 `git remote remove upstream`;在此之前保留 upstream 以合并安全补丁——此决策已写入设计文档第 4 节并获批准。

---

## Self-Review 结论

- **Spec 覆盖**:本计划只覆盖 M1(spec 第 9 节第一行);M2-M6 各自另开计划。M1 验收「Windows 双击启动」由 Task 8 的 unpacked exe 满足最低形态,完整安装器归 M6。
- **占位符扫描**:无 TBD/TODO;所有代码块完整;唯一的执行时不确定点(Task 1 gateway 首启是否需要 setup)已给出明确的处置分支。
- **类型一致性**:`GatewayConfig` 在 Task 5 定义、Task 6/7 消费,字段一致;`createMainWindow`/`showFailurePage`/`createTray` 签名在定义与调用处一致。
