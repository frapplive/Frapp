import { beforeEach, describe, expect, it, vi } from "vitest";
import AsyncStorage from "@react-native-async-storage/async-storage";

const pushState = vi.hoisted(() => ({ tapPending: false }));
vi.mock("@/lib/notifications/push", () => ({
  hasLaunchNotificationTap: () => pushState.tapPending,
}));

const {
  claimChatLaunch,
  readRecentChannels,
  rememberRecentChannel,
  resetChatLaunchForTests,
  settleChatLaunch,
} = await import("./last-channel");

describe("claimChatLaunch", () => {
  beforeEach(() => {
    pushState.tapPending = false;
    resetChatLaunchForTests(1_000);
  });

  it("claims the jump once, inside the launch window", () => {
    expect(claimChatLaunch(2_000)).toBe(true);
    expect(claimChatLaunch(2_001)).toBe(false);
  });

  it("stands aside for a tap that launched the app and is not taken yet", () => {
    pushState.tapPending = true;
    expect(claimChatLaunch(2_000)).toBe(false);
    pushState.tapPending = false;
    expect(claimChatLaunch(2_001)).toBe(false);
  });

  it("never jumps once the launch window has passed", () => {
    expect(claimChatLaunch(1_000 + 10_001)).toBe(false);
  });

  it("never jumps after something else settled the launch", () => {
    settleChatLaunch();
    expect(claimChatLaunch(2_000)).toBe(false);
  });
});

describe("recently opened channels (#6053)", () => {
  // The setup's AsyncStorage reads back nothing; these need it to keep.
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.mocked(AsyncStorage.getItem).mockImplementation(
      async (key: string) => store.get(key) ?? null,
    );
    vi.mocked(AsyncStorage.setItem).mockImplementation(
      async (key: string, value: string) => {
        store.set(key, value);
      },
    );
  });

  it("keeps the newest first, once, per member and chapter, in the order opened", async () => {
    rememberRecentChannel("u-1", "ch-1", "a");
    rememberRecentChannel("u-1", "ch-1", "b");
    rememberRecentChannel("u-1", "ch-1", "a");
    expect(await readRecentChannels("u-1", "ch-1")).toEqual(["a", "b"]);
    expect(await readRecentChannels("u-2", "ch-1")).toEqual([]);
  });

  it("keys a sole membership with no chapter id", async () => {
    rememberRecentChannel("u-3", null, "x");
    expect(await readRecentChannels("u-3", null)).toEqual(["x"]);
  });
});
