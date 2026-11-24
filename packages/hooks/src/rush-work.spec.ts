import { describe, expect, it } from "vitest";
import type { RushContact } from "./use-rush-pipeline";
import {
  rushAddProspectProblem,
  rushContactLine,
  rushFollowUpFor,
  rushFollowUpLine,
  rushFollowUpTarget,
  rushLastContactLine,
  rushListSubtitle,
  rushOwnerProblem,
  rushOwnerWords,
  rushRowMark,
} from "./rush-work";

/**
 * The phone's words for a prospect's work (#5934): the list's header, a
 * row's follow-up mark, the prospect screen's lines, and the plain-word
 * refusals for an owner change and a name already on the list.
 */

// A Tuesday.
const TODAY = "2026-11-24";

const OPEN = {
  closed_reason: null,
  created_at: "2026-11-22T18:00:00.000Z",
  last_contact_on: null,
  last_contact_by_name: null,
  follow_up_on: null,
  follow_up_note: null,
  follow_up_user_id: null,
  follow_up_user_name: null,
  owner_id: null,
  owner_name: null,
};

describe("the list's subtitle", () => {
  it("adds the viewer's follow-ups due today, and leaves them out at zero", () => {
    expect(rushListSubtitle(48, 3)).toBe(
      "48 prospects · 3 follow-ups due today",
    );
    expect(rushListSubtitle(1, 1)).toBe("1 prospect · 1 follow-up due today");
    expect(rushListSubtitle(48, 0)).toBe("48 prospects");
  });
});

describe("a row's follow-up mark", () => {
  it("names a follow-up's day, loud once it is due", () => {
    expect(
      rushRowMark({ ...OPEN, follow_up_on: "2026-11-26" }, 7, TODAY),
    ).toEqual({ label: "Follow-up Thursday", tone: "planned" });
    expect(rushRowMark({ ...OPEN, follow_up_on: TODAY }, 7, TODAY)).toEqual({
      label: "Follow-up today",
      tone: "due",
    });
  });

  it("says Needs follow-up for a prospect nobody has reached in the stale days", () => {
    expect(
      rushRowMark({ ...OPEN, last_contact_on: "2026-11-10" }, 7, TODAY),
    ).toEqual({ label: "Needs follow-up", tone: "stale" });
    expect(
      rushRowMark({ ...OPEN, last_contact_on: "2026-11-23" }, 7, TODAY),
    ).toBeNull();
  });

  it("marks nothing on a closed prospect", () => {
    expect(
      rushRowMark(
        {
          ...OPEN,
          closed_reason: "no_response",
          follow_up_on: TODAY,
          last_contact_on: "2026-10-01",
        },
        7,
        TODAY,
      ),
    ).toBeNull();
  });
});

describe("the prospect screen's lines", () => {
  it("says when they were last contacted and by whom", () => {
    expect(
      rushLastContactLine(
        { last_contact_on: "2026-11-24", last_contact_by_name: "Chris" },
        TODAY,
      ),
    ).toBe("Last contacted today · by Chris");
    expect(
      rushLastContactLine(
        { last_contact_on: "2026-11-20", last_contact_by_name: "Chris" },
        TODAY,
      ),
    ).toBe("Last contacted November 20 · by Chris");
    expect(rushLastContactLine(OPEN, TODAY)).toBe("No contact logged yet");
  });

  it("says the follow-up's day and what to do", () => {
    expect(
      rushFollowUpLine(
        {
          follow_up_on: "2026-11-26",
          follow_up_note: "invite to house dinner",
        },
        TODAY,
      ),
    ).toBe("Follow-up Thursday, invite to house dinner");
    expect(
      rushFollowUpLine(
        { follow_up_on: "2026-11-25", follow_up_note: null },
        TODAY,
      ),
    ).toBe("Follow-up tomorrow");
    expect(rushFollowUpLine(OPEN, TODAY)).toBeNull();
  });

  it("says who a follow-up is for only when it isn't the viewer", () => {
    const set = {
      follow_up_on: TODAY,
      follow_up_user_id: "chris",
      follow_up_user_name: "Chris",
    };
    expect(rushFollowUpFor(set, "me")).toBe("For Chris");
    expect(rushFollowUpFor(set, "chris")).toBeNull();
  });

  it("aims a new follow-up at the owner, else the viewer, and keeps a set one's", () => {
    expect(rushFollowUpTarget(OPEN, "me")).toEqual({
      id: "me",
      words: "For you",
    });
    expect(
      rushFollowUpTarget(
        { ...OPEN, owner_id: "chris", owner_name: "Chris" },
        "me",
      ),
    ).toEqual({ id: "chris", words: "For Chris" });
    expect(
      rushFollowUpTarget(
        {
          ...OPEN,
          owner_id: "chris",
          owner_name: "Chris",
          follow_up_user_id: "sam",
          follow_up_user_name: "Sam",
        },
        "me",
      ),
    ).toEqual({ id: "sam", words: "For Sam" });
  });

  it("names a row's owner", () => {
    expect(rushOwnerWords({ owner_id: "c", owner_name: "Chris" })).toBe(
      "Owned by Chris",
    );
    expect(rushOwnerWords(OPEN)).toBe("No owner");
  });
});

describe("the contact history", () => {
  it("reads kind, day and who: Texted · Tuesday · by Chris", () => {
    const contact: RushContact = {
      id: "k1",
      candidate_id: "c1",
      logged_by: "chris",
      logged_by_name: "Chris",
      kind: "text",
      contacted_on: "2026-11-24",
      created_at: "2026-11-24T18:00:00.000Z",
    };
    expect(rushContactLine(contact, "2026-11-28")).toBe(
      "Texted · November 24 · by Chris",
    );
  });
});

describe("plain-word refusals", () => {
  it("says someone claimed them first, or the member can't work prospects", () => {
    expect(rushOwnerProblem({ status: 409 })).toBe(
      "Someone else claimed them first.",
    );
    expect(rushOwnerProblem({ status: 400 })).toMatch(/can't work prospects/);
    expect(rushOwnerProblem({ status: 500 })).toBeNull();
  });

  it("says a name is already on the list", () => {
    expect(rushAddProspectProblem({ status: 409 }, "Jordan Reyes")).toBe(
      "Jordan Reyes is already on the list. Add something to tell them apart, like a last initial.",
    );
    expect(rushAddProspectProblem({ status: 500 }, "Jordan")).toBeNull();
  });
});
