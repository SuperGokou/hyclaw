import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { appendAudit, assertLoopbackBind } from "@hyclaw/hyshield";
import { BrowserWindow, app, ipcMain } from "electron";
import { ensureGatewayBootstrap, resolveGatewayConfig } from "./gateway-config.js";
import { GatewayManager, waitForGateway } from "./gateway-manager.js";
import { createSafeStorageBackend } from "./safe-storage-backend.js";
import { createTray } from "./tray.js";
import { CredentialVault, providerEnvVar } from "./vault.js";
import { createMainWindow, showFailurePage } from "./window.js";

// 网关冷启动实测约 46s(13 个插件),留双倍余量
const GATEWAY_READY_TIMEOUT_MS = 120_000;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let mainWindow: BrowserWindow | null = null;
  let credentialsWindow: BrowserWindow | null = null;
  let manager: GatewayManager | null = null;
  let quitting = false;

  const showWindow = () => {
    mainWindow?.show();
    mainWindow?.focus();
  };

  app.on("second-instance", showWindow);

  const bootstrap = async () => {
    const config = resolveGatewayConfig(process.env, app.getAppPath());
    const { token } = ensureGatewayBootstrap(config);
    const now = () => new Date().toISOString();

    mainWindow = createMainWindow();
    mainWindow.on("close", (event) => {
      if (!quitting) {
        event.preventDefault();
        mainWindow?.hide();
      }
    });

    // 凭证保险箱(与 IPC 共用同一实例)
    const vault = new CredentialVault(config.vaultPath, createSafeStorageBackend());

    // Bootstrap hook: a provisioning file drops keys the real app re-encrypts
    // with its own identity (so keys stay decryptable). Deleted after import.
    const importPath = path.join(config.stateDir, "import-key.json");
    if (existsSync(importPath)) {
      try {
        const items = JSON.parse(readFileSync(importPath, "utf8")) as Array<{
          providerId: string;
          secret: string;
        }>;
        for (const item of items) {
          if (item?.providerId && item?.secret) vault.setSecret(item.providerId, item.secret);
        }
        rmSync(importPath, { force: true });
        console.log(`[vault] imported ${items.length} credential(s) from import-key.json`);
      } catch (error) {
        console.error("[vault] import-key.json failed", error);
      }
    }

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
          preload: path.join(import.meta.dirname, "preload.cjs"),
          contextIsolation: true,
          nodeIntegration: false,
        },
      });
      void credentialsWindow.loadFile(
        path.join(import.meta.dirname, "..", "assets", "credentials.html"),
      );
    };

    createTray({
      onShow: showWindow,
      onCredentials: openCredentials,
      onQuit: () => app.quit(),
    });

    ipcMain.handle("hyclaw:vault:meta", () => ({
      vaultPath: config.vaultPath,
      encryptionAvailable: vault.isBackendAvailable(),
    }));
    ipcMain.handle("hyclaw:vault:list", () => vault.listEntries());
    ipcMain.handle("hyclaw:vault:set", (_event, providerId: string, secret: string) => {
      const id = String(providerId ?? "").trim();
      if (!id) return { ok: false, error: "请填写供应商 ID / Provider ID is required" };
      if (!secret) return { ok: false, error: "请填写密钥 / API key is required" };
      try {
        vault.setSecret(id, secret);
        const envVar = providerEnvVar(id);
        appendAudit(config.auditDir, "credential.saved", { provider: id, env: envVar }, now());
        return { ok: true, providerId: id, envVar, vaultPath: config.vaultPath };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    });
    ipcMain.handle("hyclaw:vault:delete", (_event, providerId: string) => {
      vault.deleteSecret(providerId);
      appendAudit(config.auditDir, "credential.deleted", { provider: providerId }, now());
      return { ok: true };
    });

    // HYShield 网络围栏预检:非回环绑定拒绝启动
    let fileConfig: { gateway?: { bind?: string; customBindHost?: string } } = {};
    try {
      fileConfig = JSON.parse(readFileSync(config.configPath, "utf8"));
    } catch {
      fileConfig = {};
    }
    const fence = assertLoopbackBind(fileConfig);
    if (!fence.ok) {
      appendAudit(config.auditDir, "gateway.fence-blocked", { reason: fence.reason ?? "" }, now());
      console.error("[hyshield] fence blocked:", fence.reason);
      showFailurePage(mainWindow);
      return;
    }

    // 解密保险箱并把凭证注入网关子进程环境;无法解密的条目跳过并告警,
    // 绝不因单个坏凭证阻断网关启动。
    const { env: credentialEnv, failed } = vault.exportEnv();
    if (failed.length) {
      console.warn(`[vault] skipped undecryptable credentials: ${failed.join(", ")}`);
    }
    for (const providerId of Object.keys(credentialEnv)) {
      appendAudit(config.auditDir, "credential.injected", { provider: providerId }, now());
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

    appendAudit(config.auditDir, "gateway.start", { port: String(config.port) }, now());
    manager.start();
    await waitForGateway(config.url, { timeoutMs: GATEWAY_READY_TIMEOUT_MS });
    await mainWindow.loadURL(`${config.url}?token=${encodeURIComponent(token)}`);
  };

  app.whenReady().then(() => {
    bootstrap().catch((error) => {
      // Any startup failure surfaces on the branded failure page instead of
      // an unhandled rejection that leaves the window stuck on the loader.
      console.error("[hyclaw] startup failed", error);
      if (mainWindow) showFailurePage(mainWindow);
    });
  });

  app.on("before-quit", () => {
    quitting = true;
    manager?.stop();
  });

  app.on("window-all-closed", () => {
    // 常驻托盘,不随窗口关闭退出
  });
}
