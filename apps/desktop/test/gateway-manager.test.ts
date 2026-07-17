import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import type { GatewayConfig } from "../src/gateway-config.js";
import { GatewayManager, waitForGateway } from "../src/gateway-manager.js";

const CONFIG: GatewayConfig = {
  repoRoot: "C:/repo",
  nodeBin: "node",
  entry: "C:/repo/openclaw.mjs",
  port: 18789,
  url: "http://127.0.0.1:18789/",
  stateDir: "C:/state/.hyclaw",
  configPath: "C:/state/.hyclaw/openclaw.json",
  env: {
    OPENCLAW_STATE_DIR: "C:/state/.hyclaw",
    OPENCLAW_CONFIG_PATH: "C:/state/.hyclaw/openclaw.json",
  },
};

class FakeChild extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  killed = false;
  kill(): boolean {
    this.killed = true;
    this.emit("exit", null, "SIGTERM");
    return true;
  }
}

function makeManager(overrides: { maxRestarts?: number } = {}) {
  const children: FakeChild[] = [];
  const spawnFn = vi.fn(() => {
    const child = new FakeChild();
    children.push(child);
    return child as never;
  });
  const events: string[] = [];
  const manager = new GatewayManager(CONFIG, {
    spawnFn: spawnFn as never,
    maxRestarts: overrides.maxRestarts ?? 3,
    restartDelayMs: 0,
    onEvent: (event) => events.push(event),
  });
  return { manager, spawnFn, children, events };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

describe("GatewayManager", () => {
  it("spawns gateway with node entry and port args", () => {
    const { manager, spawnFn } = makeManager();
    manager.start();
    expect(spawnFn).toHaveBeenCalledWith(
      "node",
      ["C:/repo/openclaw.mjs", "gateway", "--port", "18789"],
      expect.objectContaining({
        cwd: "C:/repo",
        env: expect.objectContaining({ OPENCLAW_STATE_DIR: "C:/state/.hyclaw" }),
      }),
    );
    expect(manager.isRunning()).toBe(true);
  });

  it("restarts on unexpected exit, then fails after maxRestarts", async () => {
    const { manager, spawnFn, children, events } = makeManager({ maxRestarts: 2 });
    manager.start();
    children[0].emit("exit", 1, null);
    await tick();
    expect(spawnFn).toHaveBeenCalledTimes(2);
    children[1].emit("exit", 1, null);
    await tick();
    expect(spawnFn).toHaveBeenCalledTimes(3);
    children[2].emit("exit", 1, null);
    await tick();
    expect(spawnFn).toHaveBeenCalledTimes(3);
    expect(events).toContain("failed");
  });

  it("does not restart after stop()", async () => {
    const { manager, spawnFn, children } = makeManager();
    manager.start();
    manager.stop();
    expect(children[0].killed).toBe(true);
    await tick();
    expect(spawnFn).toHaveBeenCalledTimes(1);
    expect(manager.isRunning()).toBe(false);
  });
});

describe("waitForGateway", () => {
  it("resolves once fetch succeeds", async () => {
    let calls = 0;
    const fetchFn = vi.fn(async () => {
      calls += 1;
      if (calls < 3) throw new Error("ECONNREFUSED");
      return new Response("ok");
    });
    await waitForGateway("http://127.0.0.1:18789/", {
      fetchFn: fetchFn as never,
      intervalMs: 1,
      timeoutMs: 1000,
    });
    expect(calls).toBe(3);
  });

  it("rejects on timeout", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    await expect(
      waitForGateway("http://127.0.0.1:18789/", {
        fetchFn: fetchFn as never,
        intervalMs: 1,
        timeoutMs: 15,
      }),
    ).rejects.toThrow(/not reachable/);
  });
});
