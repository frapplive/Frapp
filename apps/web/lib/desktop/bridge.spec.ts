// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { desktopAuthLink, desktopBridge } from "./bridge";

afterEach(() => {
  delete (window as { frappDesktop?: unknown }).frappDesktop;
});

describe("desktopBridge", () => {
  it("is null in a browser", () => {
    expect(desktopBridge()).toBeNull();
  });

  it("is the shell's bridge inside the desktop app", () => {
    const bridge = { openExternal: async () => true };
    (window as { frappDesktop?: unknown }).frappDesktop = bridge;
    expect(desktopBridge()).toBe(bridge);
  });

  it("ignores an object that can't open the browser", () => {
    (window as { frappDesktop?: unknown }).frappDesktop = { version: "0.1.0" };
    expect(desktopBridge()).toBeNull();
  });
});

describe("desktopAuthLink", () => {
  it("hands the code, where to land and the flow back to the app", () => {
    expect(
      desktopAuthLink(new URLSearchParams("next=%2Fjoin%3Ftoken%3Dinv-1&flow=f-1&handoff=abc-123")),
    ).toBe("frapp-desktop://auth/callback?code=abc-123&next=%2Fjoin%3Ftoken%3Dinv-1&flow=f-1");
  });

  it("passes nothing else", () => {
    expect(desktopAuthLink(new URLSearchParams("handoff=abc&state=x&token_hash=y&intent=confirm"))).toBe(
      "frapp-desktop://auth/callback?code=abc",
    );
  });

  it("is null without a handed-off code, and never reads `code` itself", () => {
    expect(desktopAuthLink(new URLSearchParams("authError=access_denied"))).toBeNull();
    expect(desktopAuthLink(new URLSearchParams("code=abc&flow=f-1"))).toBeNull();
    expect(desktopAuthLink(new URLSearchParams(""))).toBeNull();
  });
});
