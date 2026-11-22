import { describe, expect, it } from "vitest";
import { EVENT_PAGE_COPY, eventInvitees, eventPagePhase } from "./event-page";

// FSL Leaders Reception: 5:00 to 6:00 PM, check-in opening 10 minutes early
// and closing 15 minutes after the end.
const start = "2027-01-19T22:00:00.000Z";
const end = "2027-01-19T23:00:00.000Z";
const at = (iso: string) => Date.parse(iso);

describe("eventPagePhase", () => {
  it("is upcoming until check-in opens", () => {
    expect(eventPagePhase(start, end, 10, at("2026-12-22T22:00:00.000Z"))).toBe(
      "upcoming",
    );
    expect(eventPagePhase(start, end, 10, at("2027-01-19T21:49:59.000Z"))).toBe(
      "upcoming",
    );
  });

  it("is live from the opening through the grace after the end", () => {
    expect(eventPagePhase(start, end, 10, at("2027-01-19T21:50:00.000Z"))).toBe(
      "live",
    );
    expect(eventPagePhase(start, end, 10, at("2027-01-19T23:15:00.000Z"))).toBe(
      "live",
    );
  });

  it("is past once check-in has closed", () => {
    expect(eventPagePhase(start, end, 10, at("2027-01-19T23:15:01.000Z"))).toBe(
      "past",
    );
  });

  it("reads times it can't parse as upcoming", () => {
    expect(eventPagePhase(undefined, end, 10, 0)).toBe("upcoming");
    expect(eventPagePhase("soon", end, 10, 0)).toBe("upcoming");
  });
});

describe("eventInvitees", () => {
  const members = [
    { user_id: "a", role_ids: ["exec"] },
    { user_id: "b", role_ids: ["member"] },
    { user_id: "c", role_ids: ["historian"] },
    { user_id: "d", role_ids: null },
  ];

  it("keeps everyone when the event invites everyone", () => {
    expect(eventInvitees({ is_mandatory: true }, members)).toHaveLength(4);
  });

  it("keeps only the listed roles when nobody else is invited", () => {
    const event = {
      required_role_ids: ["exec"],
      optional_role_ids: ["historian"],
      others_invited: false,
    };
    expect(eventInvitees(event, members).map((m) => m.user_id)).toEqual([
      "a",
      "c",
    ]);
  });

  it("drops an excluded role", () => {
    const event = { excluded_role_ids: ["member"], others_invited: true };
    expect(eventInvitees(event, members).map((m) => m.user_id)).toEqual([
      "a",
      "c",
      "d",
    ]);
  });
});

describe("EVENT_PAGE_COPY", () => {
  it("counts people in words", () => {
    expect(EVENT_PAGE_COPY.people(1)).toBe("1 person");
    expect(EVENT_PAGE_COPY.people(15)).toBe("15 people");
  });
});
