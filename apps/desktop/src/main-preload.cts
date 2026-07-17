import { contextBridge } from "electron";

// HYClaw is Chinese-first: expose a preferred locale the Control UI's i18n
// honors on first load (before any saved preference). Users can still switch
// language in settings, which persists and overrides this.
contextBridge.exposeInMainWorld("__HYCLAW_LOCALE__", "zh-CN");
