import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CredentialVault, providerEnvVar } from "../src/vault.ts";

// 可逆的假加密后端(XOR),仅用于测试保险箱逻辑,不涉及真实 OS 加密
const fakeBackend = {
  isAvailable: () => true,
  encryptString: (plain: string) =>
    Buffer.from(Buffer.from(plain, "utf8").map((b) => b ^ 0x5a)),
  decryptString: (blob: Buffer) =>
    Buffer.from(Buffer.from(blob).map((b) => b ^ 0x5a)).toString("utf8"),
};

let dir: string | null = null;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

function newVault() {
  dir = mkdtempSync(path.join(os.tmpdir(), "hyclaw-vault-"));
  const vaultPath = path.join(dir, "vault.json");
  return { vaultPath, vault: new CredentialVault(vaultPath, fakeBackend) };
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
      env: {
        HYCLAW_CRED_ANTHROPIC: "sk-secret-123456",
        HYCLAW_CRED_DEEPSEEK: "ds-key-abc",
      },
      failed: [],
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
    expect(reopened.exportEnv().env.HYCLAW_CRED_ANTHROPIC).toBe("sk-1");
    reopened.deleteSecret("anthropic");
    expect(reopened.hasSecret("anthropic")).toBe(false);
    expect(existsSync(vaultPath)).toBe(true);
  });
});
