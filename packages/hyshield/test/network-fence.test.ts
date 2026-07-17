import { describe, expect, it } from "vitest";
import { assertLoopbackBind } from "../src/network-fence.ts";

describe("assertLoopbackBind", () => {
  it("allows missing bind (default is loopback)", () => {
    expect(assertLoopbackBind({}).ok).toBe(true);
    expect(assertLoopbackBind({ gateway: {} }).ok).toBe(true);
  });

  it("allows explicit loopback", () => {
    expect(assertLoopbackBind({ gateway: { bind: "loopback" } }).ok).toBe(true);
  });

  it("allows custom bound to a loopback host", () => {
    for (const host of ["127.0.0.1", "::1", "localhost"]) {
      expect(assertLoopbackBind({ gateway: { bind: "custom", customBindHost: host } }).ok).toBe(
        true,
      );
    }
  });

  it.each(["lan", "auto", "tailnet"])("rejects exposed profile %s", (bind) => {
    const result = assertLoopbackBind({ gateway: { bind } });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/回环|loopback/);
  });

  it("rejects custom bound to a non-loopback host", () => {
    const result = assertLoopbackBind({ gateway: { bind: "custom", customBindHost: "0.0.0.0" } });
    expect(result.ok).toBe(false);
  });
});
