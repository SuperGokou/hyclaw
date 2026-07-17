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

/**
 * Credential vault: secrets are stored encrypted (via an OS-backed CipherBackend)
 * and only ever surface as plaintext through exportEnv() at gateway spawn time.
 * The on-disk file holds ciphertext; listEntries() exposes ids only.
 */
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

  isBackendAvailable(): boolean {
    return this.backend.isAvailable();
  }

  listEntries(): VaultEntry[] {
    return Object.keys(this.data.entries).map((providerId) => ({
      providerId,
      envVar: providerEnvVar(providerId),
    }));
  }

  /**
   * Decrypt all entries into env vars. Entries that fail to decrypt (e.g.
   * written by a different app identity) are skipped and reported rather than
   * throwing, so one bad credential can never block gateway startup.
   */
  exportEnv(): { env: Record<string, string>; failed: string[] } {
    const env: Record<string, string> = {};
    const failed: string[] = [];
    for (const [providerId, blob] of Object.entries(this.data.entries)) {
      try {
        env[providerEnvVar(providerId)] = this.backend.decryptString(Buffer.from(blob, "base64"));
      } catch {
        failed.push(providerId);
      }
    }
    return { env, failed };
  }

  private persist(): void {
    mkdirSync(path.dirname(this.vaultPath), { recursive: true });
    writeFileSync(this.vaultPath, `${JSON.stringify(this.data, null, 2)}\n`);
  }
}
