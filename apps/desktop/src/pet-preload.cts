import { contextBridge, ipcRenderer } from "electron";

interface PetMessage {
  text: string;
  speak?: boolean;
  ms?: number;
}

contextBridge.exposeInMainWorld("hypet", {
  onMessage: (handler: (payload: PetMessage) => void) =>
    ipcRenderer.on("hypet:message", (_event, payload: PetMessage) => handler(payload)),
  activateMain: () => ipcRenderer.send("hypet:activate-main"),
  menu: () => ipcRenderer.send("hypet:menu"),
});
