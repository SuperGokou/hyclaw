import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export interface GatewayConfig {
  repoRoot: string;
  nodeBin: string;
  entry: string;
  port: number;
  url: string;
  stateDir: string;
  configPath: string;
  vaultPath: string;
  auditDir: string;
  env: Record<string, string>;
}

const DEFAULT_PORT = 18789;

/**
 * HYClaw uses an isolated state dir (~/.hyclaw) so it never collides with
 * other openclaw-based installs (e.g. QClaw) sharing ~/.openclaw.
 */
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
  const stateDir = env.HYCLAW_STATE_DIR ?? path.join(os.homedir(), ".hyclaw");
  const configPath = path.join(stateDir, "hyclaw.json");
  return {
    repoRoot,
    nodeBin: env.HYCLAW_NODE_BIN ?? "node",
    entry: path.join(repoRoot, "openclaw.mjs"),
    port,
    url: `http://127.0.0.1:${port}/`,
    stateDir,
    configPath,
    vaultPath: path.join(stateDir, "vault.json"),
    auditDir: path.join(stateDir, "audit"),
    env: {
      OPENCLAW_STATE_DIR: stateDir,
      OPENCLAW_CONFIG_PATH: configPath,
    },
  };
}

interface GatewayFileConfig {
  gateway?: {
    mode?: string;
    auth?: { mode?: string; token?: string };
    [key: string]: unknown;
  };
  browser?: { enabled?: boolean; [key: string]: unknown };
  [key: string]: unknown;
}

/**
 * First-run bootstrap: the gateway refuses to start without a config file,
 * and the Control UI refuses connections without an auth token.
 * Creates/patches ~/.hyclaw/hyclaw.json with local mode + a persisted
 * token, preserving any existing user config. Returns the token so the
 * shell can load the Control UI with `?token=`.
 */
export function ensureGatewayBootstrap(config: GatewayConfig): { token: string } {
  mkdirSync(config.stateDir, { recursive: true });
  // 从旧文件名 openclaw.json 一次性迁移到 hyclaw.json,保住已有令牌与配置。
  const legacyConfigPath = path.join(config.stateDir, "openclaw.json");
  if (!existsSync(config.configPath) && existsSync(legacyConfigPath)) {
    try {
      renameSync(legacyConfigPath, config.configPath);
    } catch {
      // 迁移失败则退回全新引导
    }
  }
  let fileConfig: GatewayFileConfig = {};
  if (existsSync(config.configPath)) {
    try {
      fileConfig = JSON.parse(readFileSync(config.configPath, "utf8")) as GatewayFileConfig;
    } catch {
      fileConfig = {};
    }
  }
  const gateway = (fileConfig.gateway ??= {});
  gateway.mode ??= "local";
  const auth = (gateway.auth ??= {});
  auth.mode ??= "token";
  auth.token ??= randomBytes(32).toString("hex");
  // HYClaw default: no browser automation (avoids spawning a visible Chrome the
  // office user never asked for). Users can opt back in by setting browser.enabled.
  const browser = (fileConfig.browser ??= {});
  browser.enabled ??= false;
  writeFileSync(config.configPath, `${JSON.stringify(fileConfig, null, 2)}\n`);
  return { token: auth.token };
}
