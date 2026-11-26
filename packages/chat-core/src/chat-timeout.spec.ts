import { describe, expect, it } from "vitest";
import { CHAT_TIMED_OUT_REFUSAL } from "@repo/validation";
import { QueryClient } from "@tanstack/react-query";
import { vi } from "vitest";
import { classifyChatError, refreshTimeoutIfRefused } from "./chat-client";
import {
  canTimeOutSender,
  chatTimeoutNotice,
  runningTimeoutLine,
  timeOutOfferedIn,
  timeoutEndLabel,
} from "./chat-timeout";

// Tests run in America/Los_Angeles (package.json).
const NOW = new Date("2026-11-25T20:00:00.000Z"); // Wednesday 12:00 PM

describe("timeoutEndLabel", () => {
  it("says the time today, tomorrow, the weekday, then the date", () => {
    expect(timeoutEndLabel("2026-11-25T23:40:00.000Z", NOW)).toBe("3:40 PM");
    expect(timeoutEndLabel("2026-11-26T20:00:00.000Z", NOW)).toBe(
      "tomorrow at 12 PM",
    );
    expect(timeoutEndLabel("2026-11-28T20:00:00.000Z", NOW)).toBe(
      "Saturday at 12 PM",
    );
    expect(timeoutEndLabel("2026-12-02T20:30:00.000Z", NOW)).toBe(
      "December 2 at 12:30 PM",
    );
  });
});

describe("chatTimeoutNotice", () => {
  const timeout = { until: "2026-11-25T23:40:00.000Z", reason: " spamming " };

  it("says until when, with the reason, in a channel", () => {
    expect(chatTimeoutNotice(timeout, { type: "PUBLIC" }, NOW)).toEqual({
      title: "You're timed out until 3:40 PM",
      detail: "Reason: spamming",
    });
  });

  it("says nothing in a DM or group DM", () => {
    expect(chatTimeoutNotice(timeout, { type: "DM" }, NOW)).toBeNull();
    expect(chatTimeoutNotice(timeout, { type: "GROUP_DM" }, NOW)).toBeNull();
  });

  it("says nothing once it has passed, or with none", () => {
    expect(
      chatTimeoutNotice(
        timeout,
        { type: "PUBLIC" },
        new Date("2026-11-26T00:00:00Z"),
      ),
    ).toBeNull();
    expect(
      chatTimeoutNotice({ until: null, reason: null }, { type: "PUBLIC" }, NOW),
    ).toBeNull();
  });

  it("leaves the reason out when none was given", () => {
    expect(
      chatTimeoutNotice({ ...timeout, reason: null }, { type: "PRIVATE" }, NOW)
        ?.detail,
    ).toBeNull();
  });
});

describe("Time out on a message", () => {
  const message = {
    sender_id: "user-2",
    _status: "confirmed" as const,
    is_deleted: false,
    kind: "text" as const,
  };

  it("is offered in a channel to a moderator, never in a DM", () => {
    expect(timeOutOfferedIn(true, { type: "PUBLIC" })).toBe(true);
    expect(timeOutOfferedIn(false, { type: "PUBLIC" })).toBe(false);
    expect(timeOutOfferedIn(true, { type: "DM" })).toBe(false);
    expect(timeOutOfferedIn(true, null)).toBe(false);
  });

  it("is on someone else's message, never your own", () => {
    expect(canTimeOutSender(message, "user-1", true)).toBe(true);
    expect(canTimeOutSender(message, "user-2", true)).toBe(false);
    expect(canTimeOutSender(message, "user-1", false)).toBe(false);
  });

  it("never on an imported row with no sender, or a pending one", () => {
    expect(
      canTimeOutSender({ ...message, sender_id: null }, "user-1", true),
    ).toBe(false);
    expect(
      canTimeOutSender({ ...message, _status: "pending" }, "user-1", true),
    ).toBe(false);
  });
});

describe("runningTimeoutLine", () => {
  it("says until when and why, or nothing once it has passed", () => {
    expect(
      runningTimeoutLine("2026-11-25T23:40:00.000Z", " spamming ", NOW),
    ).toBe("Timed out until 3:40 PM · spamming");
    expect(runningTimeoutLine("2026-11-25T23:40:00.000Z", null, NOW)).toBe(
      "Timed out until 3:40 PM",
    );
    expect(
      runningTimeoutLine("2026-11-25T19:00:00.000Z", "spamming", NOW),
    ).toBeNull();
    expect(runningTimeoutLine(null, null, NOW)).toBeNull();
  });
});

describe("a refused send", () => {
  const body = {
    statusCode: 403,
    code: "chat.timed_out",
    message: "whatever the server says",
  };

  it("fails terminally with the timeout sentence", () => {
    expect(classifyChatError(body)).toEqual({
      terminal: true,
      status: 403,
      message: CHAT_TIMED_OUT_REFUSAL,
      busy: false,
    });
  });

  it("re-reads the member's own timeout only for a timeout refusal", () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    refreshTimeoutIfRefused(queryClient, { statusCode: 403 });
    expect(invalidate).not.toHaveBeenCalled();
    refreshTimeoutIfRefused(queryClient, body);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["chat-timeout"] });
  });
});
