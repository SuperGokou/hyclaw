import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import type { GatewayConfig } from "./gateway-config.js";

export type GatewayEvent = "started" | "exited" | "restarting" | "failed";
type SpawnLike = typeof spawn;

interface GatewayManagerOptions {
  spawnFn?: SpawnLike;
  maxRestarts?: number;
  restartDelayMs?: number;
  onEvent?: (event: GatewayEvent, detail?: string) => void;
}

export class GatewayManager {
  private child: ChildProcess | null = null;
  private restarts = 0;
  private stopped = false;
  private readonly spawnFn: SpawnLike;
  private readonly maxRestarts: number;
  private readonly restartDelayMs: number;
  private readonly onEvent: (event: GatewayEvent, detail?: string) => void;

  constructor(
    private readonly config: GatewayConfig,
    options: GatewayManagerOptions = {},
  ) {
    this.spawnFn = options.spawnFn ?? spawn;
    this.maxRestarts = options.maxRestarts ?? 3;
    this.restartDelayMs = options.restartDelayMs ?? 1000;
    this.onEvent = options.onEvent ?? (() => {});
  }

  start(): void {
    if (this.child || this.stopped) return;
    const child = this.spawnFn(
      this.config.nodeBin,
      [this.config.entry, "gateway", "--port", String(this.config.port)],
      {
        cwd: this.config.repoRoot,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, ...this.config.env },
      },
    );
    this.child = child;
    child.stdout?.on("data", (chunk: Buffer) => this.onEvent("started", chunk.toString().trim()));
    child.stderr?.on("data", (chunk: Buffer) => this.onEvent("started", chunk.toString().trim()));
    child.on("exit", (code, signal) => {
      this.child = null;
      this.onEvent("exited", `code=${code} signal=${signal}`);
      if (this.stopped) return;
      if (this.restarts >= this.maxRestarts) {
        this.onEvent("failed", `gateway exited ${this.restarts + 1} times`);
        return;
      }
      this.restarts += 1;
      this.onEvent("restarting", `attempt ${this.restarts}/${this.maxRestarts}`);
      setTimeout(() => {
        if (!this.stopped) this.start();
      }, this.restartDelayMs);
    });
    this.onEvent("started");
  }

  stop(): void {
    this.stopped = true;
    this.child?.kill();
    this.child = null;
  }

  isRunning(): boolean {
    return this.child !== null;
  }
}

interface WaitOptions {
  timeoutMs?: number;
  intervalMs?: number;
  fetchFn?: typeof fetch;
}

export async function waitForGateway(url: string, options: WaitOptions = {}): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const intervalMs = options.intervalMs ?? 500;
  const fetchFn = options.fetchFn ?? fetch;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetchFn(url);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
  throw new Error(`gateway not reachable at ${url} within ${timeoutMs}ms`);
}
