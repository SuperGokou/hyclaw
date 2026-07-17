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
    webPreferences: {
      preload: path.join(import.meta.dirname, "main-preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
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
