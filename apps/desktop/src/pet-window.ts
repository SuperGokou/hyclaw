import path from "node:path";
import { BrowserWindow, screen } from "electron";

const ASSETS_DIR = path.join(import.meta.dirname, "..", "assets");
const PET_WIDTH = 240;
const PET_HEIGHT = 200;

export interface PetMessage {
  text: string;
  speak?: boolean;
  ms?: number;
}

/**
 * HYPet — a floating, always-on-top desktop companion (the Goku mascot).
 * Frameless + transparent + draggable; speaks and shows text bubbles; clicking
 * it activates the main window. Fully optional (toggled from the tray).
 */
export class PetWindow {
  private win: BrowserWindow | null = null;

  constructor(
    private readonly handlers: {
      onActivateMain: () => void;
      onMenu: () => void;
    },
  ) {}

  isOpen(): boolean {
    return this.win !== null && !this.win.isDestroyed();
  }

  show(): void {
    if (this.isOpen()) {
      this.win?.showInactive();
      return;
    }
    const display = screen.getPrimaryDisplay().workArea;
    const win = new BrowserWindow({
      width: PET_WIDTH,
      height: PET_HEIGHT,
      x: display.x + display.width - PET_WIDTH - 24,
      y: display.y + display.height - PET_HEIGHT - 12,
      frame: false,
      transparent: true,
      resizable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: false,
      focusable: false,
      webPreferences: {
        preload: path.join(import.meta.dirname, "pet-preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    win.setAlwaysOnTop(true, "screen-saver");
    win.setVisibleOnAllWorkspaces(true);
    void win.loadFile(path.join(ASSETS_DIR, "pet.html"));
    win.on("closed", () => {
      this.win = null;
    });
    this.win = win;
  }

  hide(): void {
    this.win?.close();
    this.win = null;
  }

  toggle(): boolean {
    if (this.isOpen()) {
      this.hide();
      return false;
    }
    this.show();
    return true;
  }

  /** Push a message the pet renders as a bubble (and optionally speaks). */
  say(message: PetMessage): void {
    if (!this.isOpen()) return;
    this.win?.webContents.send("hypet:message", message);
  }

  handleActivateMain(): void {
    this.handlers.onActivateMain();
  }

  handleMenu(): void {
    this.handlers.onMenu();
  }
}
