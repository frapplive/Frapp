import { describe, expect, it } from "vitest";
import { rushBidActions, rushBidBadge, rushBidLines } from "./rush-bids";

const NONE = {
  user_id: null,
  bid_state: "none" as const,
  bid_extended_at: null,
  bid_extended_by_name: null,
  bid_expires_at: null,
  bid_acceptance_recorded_at: null,
  bid_acceptance_recorded_by_name: null,
  bid_confirm_emailed: false,
  bid_answered_at: null,
  bid_answered_by_name: null,
  bid_answered_via: null,
  bid_rescind_reason: null,
};

// Noon UTC, so the local day is the same day in every test runner's zone.
const OUT = {
  ...NONE,
  bid_state: "extended" as const,
  bid_extended_at: "2026-11-24T12:00:00Z",
  bid_extended_by_name: "Chris",
  bid_expires_at: "2026-12-01T12:00:00Z",
};
const WAITING = {
  ...OUT,
  bid_acceptance_recorded_at: "2026-11-25T12:00:00Z",
  bid_acceptance_recorded_by_name: "Chris",
  bid_confirm_emailed: true,
};
const TODAY = "2026-11-25";
const NOW = new Date("2026-11-25T15:00:00Z");
const ALL = { bid: true, manage: true };

describe("rush bids in words (#5973)", () => {
  it("badges each state, with Waiting to confirm for a recorded acceptance", () => {
    expect(rushBidBadge(NONE)).toBeNull();
    expect(rushBidBadge(OUT)).toEqual({ label: "Bid extended", tone: "out" });
    expect(rushBidBadge(WAITING)).toEqual({
      label: "Waiting to confirm",
      tone: "waiting",
    });
    expect(rushBidBadge({ ...NONE, bid_state: "accepted" })?.label).toBe(
      "Accepted",
    );
    expect(rushBidBadge({ ...NONE, bid_state: "expired" })?.label).toBe(
      "Bid expired",
    );
  });

  it("says who did what and when, state first", () => {
    expect(rushBidLines(OUT, TODAY)).toEqual({
      title: "Bid extended yesterday by Chris",
      detail: "Expires Tuesday",
    });
    expect(rushBidLines(WAITING, TODAY)).toEqual({
      title: "Recorded by Chris, waiting to be confirmed",
      detail: "Emailed them to confirm. It expires Tuesday if nobody does.",
    });
    expect(
      rushBidLines({ ...WAITING, bid_confirm_emailed: false }, TODAY)?.detail,
    ).toBe(
      "No email, so someone who manages recruitment confirms it. It expires Tuesday otherwise.",
    );
    expect(
      rushBidLines(
        {
          ...NONE,
          bid_state: "accepted",
          bid_answered_at: "2026-11-25T12:00:00Z",
          bid_answered_via: "pnm",
        },
        TODAY,
      )?.title,
    ).toBe("Accepted, confirmed by them today");
    expect(
      rushBidLines(
        {
          ...NONE,
          bid_state: "rescinded",
          bid_answered_by_name: "Dana",
          bid_rescind_reason: "Grades came back",
        },
        TODAY,
      ),
    ).toEqual({ title: "Rescinded by Dana", detail: "Grades came back" });
  });

  it("offers each action only where the bid takes it", () => {
    expect(rushBidActions(NONE, ALL, "me", NOW)).toEqual({
      extend: true,
      recordAcceptance: false,
      recordDecline: false,
      confirm: false,
      rescind: false,
    });
    expect(rushBidActions(OUT, ALL, "me", NOW)).toEqual({
      extend: false,
      recordAcceptance: true,
      recordDecline: true,
      confirm: false,
      rescind: true,
    });
    expect(rushBidActions(WAITING, ALL, "me", NOW)).toMatchObject({
      recordAcceptance: false,
      recordDecline: true,
      confirm: true,
    });
    // rush:bid without rush:manage records, but never confirms.
    expect(
      rushBidActions(WAITING, { bid: true, manage: false }, "me", NOW),
    ).toMatchObject({ confirm: false, rescind: false, recordDecline: true });
  });

  it("offers nothing on an expired open bid, or on a bid to the viewer", () => {
    const late = new Date("2026-12-02T00:00:00Z");
    expect(Object.values(rushBidActions(OUT, ALL, "me", late))).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
    expect(
      Object.values(rushBidActions({ ...NONE, user_id: "me" }, ALL, "me", NOW)),
    ).toEqual([false, false, false, false, false]);
  });
});
