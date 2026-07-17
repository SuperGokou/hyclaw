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
