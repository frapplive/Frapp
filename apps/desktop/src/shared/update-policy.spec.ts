import { describe, expect, it } from "vitest";
import {
  parseUpdateChannel,
  setUpdateChannel,
  updateMenuItem,
  updatesSupported,
} from "./update-policy";

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
    expect(updateMenuItem({ kind: "checking" })).toMatchObject({
      enabled: false,
      action: null,
    });
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
  const release = { isPackaged: true, hasUpdateConfig: true };

  it("is the released Mac and Windows apps only", () => {
    expect(updatesSupported({ ...release, platform: "darwin" })).toBe(true);
    expect(updatesSupported({ ...release, platform: "win32" })).toBe(true);
    expect(updatesSupported({ ...release, platform: "linux" })).toBe(false);
    expect(
      updatesSupported({ ...release, isPackaged: false, platform: "darwin" }),
    ).toBe(false);
  });

  it("is never a build with no update address, which is every unsigned one", () => {
    expect(
      updatesSupported({
        ...release,
        hasUpdateConfig: false,
        platform: "win32",
      }),
    ).toBe(false);
    expect(
      updatesSupported({
        ...release,
        hasUpdateConfig: false,
        platform: "darwin",
      }),
    ).toBe(false);
  });
});

describe("setUpdateChannel", () => {
  it("leaves downgrades off, though the library turns them on with every channel change", () => {
    // electron-updater's own behaviour: setting a channel allows downgrades.
    const updater = {
      allowDowngrade: false,
      current: null as string | null,
      get channel(): string | null {
        return this.current;
      },
      set channel(value: string | null) {
        this.current = value;
        this.allowDowngrade = true;
      },
    };
    setUpdateChannel(updater, "beta");
    expect(updater.channel).toBe("beta");
    expect(updater.allowDowngrade).toBe(false);
    setUpdateChannel(updater, "latest");
    expect(updater.channel).toBe("latest");
    expect(updater.allowDowngrade).toBe(false);
  });
});
