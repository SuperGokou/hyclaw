import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("hyclawVault", {
  meta: (): Promise<{ vaultPath: string; encryptionAvailable: boolean }> =>
    ipcRenderer.invoke("hyclaw:vault:meta"),
  list: (): Promise<Array<{ providerId: string; envVar: string }>> =>
    ipcRenderer.invoke("hyclaw:vault:list"),
  set: (
    providerId: string,
    secret: string,
  ): Promise<{ ok: boolean; error?: string; providerId?: string; envVar?: string; vaultPath?: string }> =>
    ipcRenderer.invoke("hyclaw:vault:set", providerId, secret),
  remove: (providerId: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke("hyclaw:vault:delete", providerId),
});
