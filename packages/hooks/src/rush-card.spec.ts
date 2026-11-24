import { describe, expect, it } from "vitest";
import { moduleDisabledMessage } from "@repo/validation";
import {
  canReadCardRushCandidate,
  readLiveRushCandidate,
  RUSH_CARD_REFUSAL_COPY,
  rushCardBadgeLabel,
  rushCardControls,
  rushCardGateRefusal,
  rushCardTally,
  type LiveRushCandidate,
} from "./rush-card";

/** The view the rush routes return. */
const VIEW = {
  id: "cand-1",
  chapter_id: "chapter-1",
  display_name: "Jordan Reyes",
  name_key: "jordan reyes",
  user_id: null,
  stage: "new",
  bid_status: "none",
  created_by: "user-a",
  created_at: "2026-11-04T18:00:00.000Z",
  vote_count: 3,
  viewer_has_voted: false,
};

function live(overrides: Partial<LiveRushCandidate> = {}): LiveRushCandidate {
  return {
    id: "cand-1",
    display_name: "Jordan Reyes",
    vote_count: 3,
    viewer_has_voted: false,
    bid_extended: false,
    bid_state: "none",
    ...overrides,
  };
}

describe("readLiveRushCandidate", () => {
  it("reads what a card draws off the view", () => {
    expect(readLiveRushCandidate(VIEW)).toEqual(live());
    expect(
      readLiveRushCandidate({
        ...VIEW,
        bid_status: "extended",
        viewer_has_voted: true,
      }),
    ).toEqual(
      live({
        bid_extended: true,
        bid_state: "extended",
        viewer_has_voted: true,
      }),
    );
    // The full state when the API sends it (#5973): an acceptance reads as
    // extended in `bid_status`, for shipped cards.
    expect(
      readLiveRushCandidate({
        ...VIEW,
        bid_status: "extended",
        bid_state: "accepted",
      }),
    ).toMatchObject({ bid_extended: true, bid_state: "accepted" });
  });

  it("is null before the read lands, after a 403 or 404, or for a shape it can't draw", () => {
    expect(readLiveRushCandidate(undefined)).toBe(null);
    expect(readLiveRushCandidate(null)).toBe(null);
    expect(readLiveRushCandidate({ ...VIEW, id: undefined })).toBe(null);
    expect(readLiveRushCandidate({ ...VIEW, display_name: 7 })).toBe(null);
    expect(readLiveRushCandidate({ ...VIEW, vote_count: "3" })).toBe(null);
    expect(readLiveRushCandidate({ ...VIEW, vote_count: Number.NaN })).toBe(
      null,
    );
  });

  it("reads an absent count as hidden (rush:view_results), not as a miss", () => {
    const withoutCount: Record<string, unknown> = { ...VIEW };
    delete withoutCount.vote_count;
    expect(readLiveRushCandidate(withoutCount)).toEqual(
      live({ vote_count: null }),
    );
  });

  it("reads anything but an explicit true as not voted, and anything but extended as no bid", () => {
    const read = readLiveRushCandidate({
      ...VIEW,
      viewer_has_voted: "yes",
      bid_status: "EXTENDED",
    });
    expect(read?.viewer_has_voted).toBe(false);
    expect(read?.bid_extended).toBe(false);
  });
});

const MEMBER_KEYS = [
  "members:view",
  "rush:view",
  "rush:add",
  "rush:vote",
  "rush:bid",
] as const;
const without = (key: string) => MEMBER_KEYS.filter((held) => held !== key);

describe("canReadCardRushCandidate", () => {
  it("asks only for a holder of members:view and rush:view, the viewer the route answers", () => {
    expect(canReadCardRushCandidate(MEMBER_KEYS)).toBe(true);
    expect(canReadCardRushCandidate(["*"])).toBe(true);
    expect(canReadCardRushCandidate(without("members:view"))).toBe(false);
    expect(canReadCardRushCandidate(without("rush:view"))).toBe(false);
  });

  it("asks while permissions are unknown, so a failed permissions read doesn't empty the card", () => {
    expect(canReadCardRushCandidate(undefined)).toBe(true);
  });
});

describe("rushCardControls", () => {
  const controls = (
    overrides: Partial<Parameters<typeof rushCardControls>[0]> = {},
  ) =>
    rushCardControls({
      live: live(),
      recruitmentOff: false,
      permissions: MEMBER_KEYS,
      ...overrides,
    });

  it("offers nothing until the live candidate is read", () => {
    expect(controls({ live: null })).toEqual([]);
  });

  it("offers nothing while Recruitment is off", () => {
    expect(controls({ recruitmentOff: true })).toEqual([]);
  });

  it("offers Vote and Extend bid to a member who hasn't voted, on an open candidate", () => {
    expect(controls()).toEqual(["vote", "bid"]);
    expect(controls({ permissions: ["*"] })).toEqual(["vote", "bid"]);
  });

  it("swaps Vote for the Voted indicator once the viewer has voted", () => {
    expect(controls({ live: live({ viewer_has_voted: true }) })).toEqual([
      "voted",
      "bid",
    ]);
  });

  it("drops Extend bid once a bid is out, answered or rescinded, not once it expired (#5973)", () => {
    for (const state of [
      "extended",
      "accepted",
      "declined",
      "rescinded",
    ] as const) {
      expect(controls({ live: live({ bid_state: state }) })).toEqual(["vote"]);
    }
    expect(controls({ live: live({ bid_state: "expired" }) })).toEqual([
      "vote",
      "bid",
    ]);
  });

  // #4084: a role without the key isn't offered what the server refuses.
  it("leaves Vote out for a role without rush:vote", () => {
    expect(controls({ permissions: without("rush:vote") })).toEqual(["bid"]);
  });

  it("leaves Extend bid out for a role without rush:bid", () => {
    expect(controls({ permissions: without("rush:bid") })).toEqual(["vote"]);
  });

  it("still shows Voted to a viewer who voted and has since lost rush:vote", () => {
    expect(
      controls({
        live: live({ viewer_has_voted: true }),
        permissions: without("rush:vote"),
      }),
    ).toEqual(["voted", "bid"]);
  });

  it("offers both while permissions are unknown; the server is the gate", () => {
    expect(controls({ permissions: undefined })).toEqual(["vote", "bid"]);
  });
});

describe("rushCardBadgeLabel", () => {
  it("says where the bid stands", () => {
    expect(rushCardBadgeLabel(live())).toBe("Open");
    expect(
      rushCardBadgeLabel(live({ bid_extended: true, bid_state: "extended" })),
    ).toBe("Bid extended");
    expect(rushCardBadgeLabel(live({ bid_state: "accepted" }))).toBe(
      "Accepted",
    );
    expect(rushCardBadgeLabel(live({ bid_state: "declined" }))).toBe(
      "Declined",
    );
  });
});

describe("rushCardTally", () => {
  it("counts votes, singular for one", () => {
    expect(rushCardTally(live({ vote_count: 0 }))).toBe("0 votes");
    expect(rushCardTally(live({ vote_count: 1 }))).toBe("1 vote");
    expect(rushCardTally(live({ vote_count: 4 }))).toBe("4 votes");
  });

  it("says when the viewer is among them", () => {
    expect(rushCardTally(live({ vote_count: 1, viewer_has_voted: true }))).toBe(
      "1 vote · you voted",
    );
  });

  // #4084: a hidden count is never drawn as 0.
  it("says only the viewer's own vote when the count is hidden", () => {
    expect(rushCardTally(live({ vote_count: null }))).toBe(null);
    expect(
      rushCardTally(live({ vote_count: null, viewer_has_voted: true })),
    ).toBe("You voted");
  });
});

describe("rushCardGateRefusal", () => {
  const refusal = (message: string, statusCode = 403) => ({
    statusCode,
    message,
  });

  it("puts the subscription gate in a member's words", () => {
    expect(
      rushCardGateRefusal(
        refusal(
          "Chapter subscription is past due; write actions are blocked until payment is resolved.",
        ),
      ),
    ).toBe(RUSH_CARD_REFUSAL_COPY.subscription);
  });

  it("puts the Recruitment gate in a member's words, naming the module as Settings does", () => {
    expect(rushCardGateRefusal(refusal(moduleDisabledMessage("rush")))).toBe(
      RUSH_CARD_REFUSAL_COPY.recruitmentOff,
    );
    expect(RUSH_CARD_REFUSAL_COPY.recruitmentOff).toMatch(/^Recruitment /);
  });

  it("leaves every other failure to the card, including a 403 that isn't a gate", () => {
    expect(rushCardGateRefusal(refusal("No roles assigned"))).toBe(null);
    expect(
      rushCardGateRefusal(refusal(moduleDisabledMessage("rush"), 400)),
    ).toBe(null);
    expect(rushCardGateRefusal(refusal(moduleDisabledMessage("polls")))).toBe(
      null,
    );
    expect(rushCardGateRefusal(new Error("Network request failed"))).toBe(null);
  });

  it("points at an officer, the only actor a member has", () => {
    // The store-answer guard (no price, purchase path, venue or link, and no
    // retry) runs on this copy in `apps/mobile/lib/subscription-refusal.spec.ts`,
    // beside the copy it was written for, so the two can't disagree.
    for (const copy of Object.values(RUSH_CARD_REFUSAL_COPY)) {
      expect(copy).toMatch(/officer/i);
    }
  });
});
