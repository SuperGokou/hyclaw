import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ensureGatewayBootstrap, resolveGatewayConfig } from "../src/gateway-config.js";

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

  it("uses an isolated ~/.hyclaw state dir by default", () => {
    const cfg = resolveGatewayConfig({}, APP_ROOT);
    expect(cfg.stateDir).toBe(path.join(os.homedir(), ".hyclaw"));
    expect(cfg.configPath).toBe(path.join(cfg.stateDir, "hyclaw.json"));
    expect(cfg.vaultPath).toBe(path.join(cfg.stateDir, "vault.json"));
    expect(cfg.auditDir).toBe(path.join(cfg.stateDir, "audit"));
    expect(cfg.env).toEqual({
      OPENCLAW_STATE_DIR: cfg.stateDir,
      OPENCLAW_CONFIG_PATH: cfg.configPath,
    });
  });

  it("honors env overrides", () => {
    const cfg = resolveGatewayConfig(
      {
        HYCLAW_REPO_ROOT: path.join("D:", "hyclaw"),
        HYCLAW_NODE_BIN: path.join("D:", "node", "node.exe"),
        HYCLAW_GATEWAY_PORT: "18999",
        HYCLAW_STATE_DIR: path.join("D:", "state"),
      },
      APP_ROOT,
    );
    expect(cfg.repoRoot).toBe(path.join("D:", "hyclaw"));
    expect(cfg.nodeBin).toBe(path.join("D:", "node", "node.exe"));
    expect(cfg.port).toBe(18999);
    expect(cfg.url).toBe("http://127.0.0.1:18999/");
    expect(cfg.stateDir).toBe(path.join("D:", "state"));
    expect(cfg.env.OPENCLAW_STATE_DIR).toBe(path.join("D:", "state"));
  });

  it.each(["abc", "0", "-1", "70000"])("rejects invalid port %s", (raw) => {
    expect(() => resolveGatewayConfig({ HYCLAW_GATEWAY_PORT: raw }, APP_ROOT)).toThrow(
      /invalid gateway port/,
    );
  });
});

describe("ensureGatewayBootstrap", () => {
  let tmpDir: string | null = null;

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  });

  it("creates local-mode config with a persisted auth token when missing", () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "hyclaw-test-"));
    const stateDir = path.join(tmpDir, "state");
    const cfg = resolveGatewayConfig({ HYCLAW_STATE_DIR: stateDir }, APP_ROOT);
    const { token } = ensureGatewayBootstrap(cfg);
    expect(existsSync(cfg.configPath)).toBe(true);
    const parsed = JSON.parse(readFileSync(cfg.configPath, "utf8"));
    expect(parsed.gateway.mode).toBe("local");
    expect(parsed.gateway.auth.mode).toBe("token");
    expect(parsed.gateway.auth.token).toBe(token);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is idempotent: keeps the same token across runs", () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "hyclaw-test-"));
    const cfg = resolveGatewayConfig({ HYCLAW_STATE_DIR: tmpDir }, APP_ROOT);
    const first = ensureGatewayBootstrap(cfg);
    const second = ensureGatewayBootstrap(cfg);
    expect(second.token).toBe(first.token);
  });

  it("patches an existing config without dropping user fields", () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "hyclaw-test-"));
    const cfg = resolveGatewayConfig({ HYCLAW_STATE_DIR: tmpDir }, APP_ROOT);
    writeFileSync(cfg.configPath, '{"gateway":{"mode":"local"},"custom":true}');
    const { token } = ensureGatewayBootstrap(cfg);
    const parsed = JSON.parse(readFileSync(cfg.configPath, "utf8"));
    expect(parsed.custom).toBe(true);
    expect(parsed.gateway.auth.token).toBe(token);
  });
});
