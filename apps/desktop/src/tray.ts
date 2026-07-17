import path from "node:path";
import { Menu, Tray, nativeImage } from "electron";

const ASSETS_DIR = path.join(import.meta.dirname, "..", "assets");

export function createTray(handlers: {
  onShow: () => void;
  onCredentials: () => void;
  onTogglePet: () => void;
  onQuit: () => void;
}): Tray {
  const icon = nativeImage.createFromPath(path.join(ASSETS_DIR, "icon-32.png"));
  const tray = new Tray(icon);
  tray.setToolTip("HYClaw · 和熠智脑");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "打开 HYClaw / Open", click: handlers.onShow },
      { label: "凭证保险箱 / Credentials", click: handlers.onCredentials },
      { label: "桌面伴侣 / Desktop Pet (Ctrl+Alt+H)", click: handlers.onTogglePet },
      { type: "separator" },
      { label: "退出 / Quit", click: handlers.onQuit },
    ]),
  );
  tray.on("double-click", handlers.onShow);
  return tray;
}
