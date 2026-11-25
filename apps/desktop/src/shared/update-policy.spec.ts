import { describe, expect, it } from "vitest";
import { parseUpdateChannel, updateMenuItem, updatesSupported } from "./update-policy";

describe("parseUpdateChannel", () => {
  it("reads a saved beta opt-in", () => {
    expect(parseUpdateChannel("beta\n")).toBe("beta");
  });

  it("falls back to what every member gets for anything else", () => {
    for (const raw of [null, undefined, "", "latest", "nightly", "BETA"]) {
      expect(parseUpdateChannel(raw)).toBe("latest");
    }
  });
});

describe("updateMenuItem", () => {
  it("offers a check while nothing is happening", () => {
    expect(updateMenuItem({ kind: "idle" })).toEqual({
      label: "Check for Updates…",
      enabled: true,
      action: "check",
    });
  });

  it("shows progress without a second click to make", () => {
    expect(updateMenuItem({ kind: "checking" })).toMatchObject({ enabled: false, action: null });
    expect(updateMenuItem({ kind: "downloading", version: "0.2.0" })).toEqual({
      label: "Downloading Frapp 0.2.0…",
      enabled: false,
      action: null,
    });
  });

  it("offers the restart once the update is on disk", () => {
    expect(updateMenuItem({ kind: "ready", version: "0.2.0" })).toEqual({
      label: "Restart to Update to 0.2.0",
      enabled: true,
      action: "restart",
    });
  });
});

describe("updatesSupported", () => {
  it("is the packaged Mac and Windows apps only", () => {
    expect(updatesSupported({ isPackaged: true, platform: "darwin" })).toBe(true);
    expect(updatesSupported({ isPackaged: true, platform: "win32" })).toBe(true);
    expect(updatesSupported({ isPackaged: true, platform: "linux" })).toBe(false);
    expect(updatesSupported({ isPackaged: false, platform: "darwin" })).toBe(false);
  });
});
