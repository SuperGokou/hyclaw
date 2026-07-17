// Control UI tests cover sidebar pinned-route customization behavior.
// HYClaw slims the navigation to office-focused destinations; these tests
// assert the trimmed layout plus the migration-safety invariants that survive.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SIDEBAR_PINNED_ROUTES,
  SETTINGS_NAVIGATION_GROUPS,
  SIDEBAR_NAV_ROUTES,
  isSettingsNavigationRoute,
  normalizeSidebarPinnedRoutes,
  sidebarMoreRoutes,
} from "./app-navigation.ts";

const settingsRoutes = SETTINGS_NAVIGATION_GROUPS.flatMap((group) => group.routes);

describe("sidebar pinned routes", () => {
  it("keeps the slim office destinations visible by default", () => {
    expect(DEFAULT_SIDEBAR_PINNED_ROUTES).toEqual(["skills", "usage"]);
    expect(SIDEBAR_NAV_ROUTES).toEqual(["skills", "usage"]);
  });

  it("drops retired/removed routes from persisted pins", () => {
    // worktrees/nodes/activity/plugins/cron/tasks were removed from nav; a
    // persisted pin referencing them must be silently dropped, not crash.
    expect(normalizeSidebarPinnedRoutes(["overview", "usage"])).toEqual(["usage"]);
    expect(normalizeSidebarPinnedRoutes(["worktrees", "usage"])).toEqual(["usage"]);
    expect(normalizeSidebarPinnedRoutes(["nodes", "usage"])).toEqual(["usage"]);
    expect(normalizeSidebarPinnedRoutes(["activity", "usage"])).toEqual(["usage"]);
    expect(normalizeSidebarPinnedRoutes(["plugins", "usage"])).toEqual(["usage"]);
  });

  it("removes developer/distributed routes from settings groups", () => {
    for (const removed of [
      "worktrees",
      "nodes",
      "activity",
      "debug",
      "approvals",
      "memory-import",
    ]) {
      expect(settingsRoutes).not.toContain(removed);
    }
  });

  it("keeps the core office settings slices", () => {
    expect(settingsRoutes).toEqual(
      expect.arrayContaining([
        "profile",
        "config",
        "channels",
        "connection",
        "sessions",
        "model-providers",
        "model-setup",
        "mcp",
        "logs",
        "about",
      ]),
    );
    expect(settingsRoutes.every((routeId) => isSettingsNavigationRoute(routeId))).toBe(true);
  });

  it("normalizes persisted pinned routes, dropping unknown and duplicate entries", () => {
    expect(
      normalizeSidebarPinnedRoutes(["usage", "skills", "usage", "worktrees", "instances", 7]),
    ).toEqual(["usage", "skills"]);
    expect(normalizeSidebarPinnedRoutes([])).toEqual([]);
  });

  it("falls back to null for non-list values so callers use defaults", () => {
    expect(normalizeSidebarPinnedRoutes(undefined)).toBeNull();
    expect(normalizeSidebarPinnedRoutes({ usage: true })).toBeNull();
    expect(normalizeSidebarPinnedRoutes("usage")).toBeNull();
  });

  it("puts every unpinned nav route into the More section", () => {
    const pinned = ["usage"] as const;
    const more = sidebarMoreRoutes(pinned);
    expect(more).not.toContain("usage");
    expect(new Set([...pinned, ...more])).toEqual(new Set(SIDEBAR_NAV_ROUTES));
  });
});
