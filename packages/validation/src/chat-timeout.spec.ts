import { describe, expect, it } from "vitest";
import {
  CHAT_TIMEOUT_DURATIONS,
  chatTimeoutApplies,
  chatTimeoutDuration,
  isChatTimeoutActive,
} from "./chat-timeout";

const NOW = Date.parse("2026-11-25T15:00:00.000Z");

describe("chat timeouts (#6006)", () => {
  it("offers 5 minutes, 1 hour, 1 day and 1 week, shortest first", () => {
    expect(CHAT_TIMEOUT_DURATIONS.map((d) => d.label)).toEqual([
      "5 minutes",
      "1 hour",
      "1 day",
      "1 week",
    ]);
    expect(chatTimeoutDuration("1w")?.minutes).toBe(10080);
    expect(chatTimeoutDuration("forever")).toBeUndefined();
  });

  it("is active only before its time", () => {
    expect(isChatTimeoutActive("2026-11-25T15:40:00.000Z", NOW)).toBe(true);
    expect(isChatTimeoutActive("2026-11-25T15:00:00.000Z", NOW)).toBe(false);
    expect(isChatTimeoutActive(null, NOW)).toBe(false);
    expect(isChatTimeoutActive("not a date", NOW)).toBe(false);
  });

  it("reaches every channel but a DM or group DM", () => {
    expect(chatTimeoutApplies({ type: "PUBLIC" })).toBe(true);
    expect(chatTimeoutApplies({ type: "PRIVATE" })).toBe(true);
    expect(chatTimeoutApplies({ type: "ROLE_GATED" })).toBe(true);
    expect(chatTimeoutApplies({ type: "DM" })).toBe(false);
    expect(chatTimeoutApplies({ type: "GROUP_DM" })).toBe(false);
  });
});
