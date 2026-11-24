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
    const bridge = { openExternal: () => {} };
    (window as { frappDesktop?: unknown }).frappDesktop = bridge;
    expect(desktopBridge()).toBe(bridge);
  });

  it("ignores an object that can't open the browser", () => {
    (window as { frappDesktop?: unknown }).frappDesktop = { version: "0.1.0" };
    expect(desktopBridge()).toBeNull();
  });
});

describe("desktopAuthLink", () => {
  it("hands the code and where to land back to the app", () => {
    expect(
      desktopAuthLink(new URLSearchParams("next=%2Fjoin%3Ftoken%3Dinv-1&intent=sign-in&code=abc-123")),
    ).toBe("frapp-desktop://auth/callback?code=abc-123&next=%2Fjoin%3Ftoken%3Dinv-1&intent=sign-in");
  });

  it("passes nothing the callback route doesn't read", () => {
    expect(desktopAuthLink(new URLSearchParams("code=abc&state=x&token_hash=y"))).toBe(
      "frapp-desktop://auth/callback?code=abc",
    );
  });

  it("is null when the provider came back without a code", () => {
    expect(desktopAuthLink(new URLSearchParams("error=access_denied&next=%2Fchat"))).toBeNull();
    expect(desktopAuthLink(new URLSearchParams(""))).toBeNull();
  });
});
