import { beforeEach, describe, expect, it } from "vitest";
import {
  readLastChannel,
  readRecentChannels,
  writeLastChannel,
} from "./last-channel";

describe("last channel and recently opened (#6053)", () => {
  beforeEach(() => window.localStorage.clear());

  it("remembers a channel opened as the last one and as recently opened", () => {
    writeLastChannel("u1", "ch1", "a");
    writeLastChannel("u1", "ch1", "b");
    writeLastChannel("u1", "ch1", "a");
    expect(readLastChannel("u1", "ch1")).toBe("a");
    expect(readRecentChannels("u1", "ch1")).toEqual(["a", "b"]);
  });

  it("keeps a direct message out of the recently opened channels", () => {
    writeLastChannel("u1", "ch1", "dm", "direct");
    expect(readLastChannel("u1", "ch1", "direct")).toBe("dm");
    expect(readRecentChannels("u1", "ch1")).toEqual([]);
  });

  it("keeps each member's and chapter's list apart", () => {
    writeLastChannel("u1", "ch1", "a");
    expect(readRecentChannels("u2", "ch1")).toEqual([]);
    expect(readRecentChannels("u1", "ch2")).toEqual([]);
  });

  it("reads nothing without a member or a chapter", () => {
    expect(readRecentChannels(null, "ch1")).toEqual([]);
    expect(readRecentChannels("u1", undefined)).toEqual([]);
  });
});
