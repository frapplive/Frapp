import { describe, expect, it } from "vitest";
import type { CouncilChapterRow, InviteCandidate } from "@repo/hooks";
import {
  canManageCouncilChapters,
  canViewCouncilChapters,
  chapterListingLine,
  councilChapterActions,
  groupCouncilChapters,
  orderedInviteCandidates,
} from "./chapters";

function row(
  name: string,
  status: CouncilChapterRow["link"]["status"],
  side: CouncilChapterRow["link"]["proposed_by_side"] = "council",
): CouncilChapterRow {
  return {
    link: {
      id: `link-${name}`,
      status,
      proposed_by_side: side,
      created_at: "2026-11-20T12:00:00Z",
      decided_at: null,
    },
    chapter: {
      id: `chapter-${name}`,
      name,
      org_archetype: "ifc",
      university: "Rensselaer Polytechnic Institute",
    },
  };
}

const MANAGER = ["members:view", "council:chapters_manage"];
const DELEGATE = ["members:view"];

describe("groupCouncilChapters", () => {
  it("puts requests, members and invites in their own lists, and drops history", () => {
    const groups = groupCouncilChapters([
      row("Sigma Chi", "proposed", "chapter"),
      row("Theta Xi", "accepted"),
      row("Acacia", "suspended"),
      row("Phi Gamma Delta", "proposed", "council"),
      row("Delta Phi", "declined"),
      row("Chi Phi", "ended"),
    ]);
    expect(groups.requests.map((r) => r.chapter.name)).toEqual(["Sigma Chi"]);
    // By name, a suspended one in its place.
    expect(groups.members.map((r) => r.chapter.name)).toEqual([
      "Acacia",
      "Theta Xi",
    ]);
    expect(groups.invited.map((r) => r.chapter.name)).toEqual([
      "Phi Gamma Delta",
    ]);
  });

  it("is empty for a council with no live links", () => {
    expect(groupCouncilChapters([row("Chi Phi", "ended")])).toEqual({
      requests: [],
      members: [],
      invited: [],
    });
  });
});

describe("councilChapterActions", () => {
  const keys = (r: CouncilChapterRow, permissions: string[]) =>
    councilChapterActions(r, permissions).map((a) => [a.key, a.status]);

  it("answers a request with Accept, then Decline", () => {
    expect(keys(row("A", "proposed", "chapter"), MANAGER)).toEqual([
      ["accept", "accepted"],
      ["decline", "declined"],
    ]);
  });

  it("suspends or reinstates a member, then removes it, red and asked first", () => {
    expect(keys(row("A", "accepted"), MANAGER)).toEqual([
      ["suspend", "suspended"],
      ["remove", "ended"],
    ]);
    expect(keys(row("A", "suspended"), MANAGER)).toEqual([
      ["reinstate", "accepted"],
      ["remove", "ended"],
    ]);
    const remove = councilChapterActions(row("A", "accepted"), MANAGER)[1]!;
    expect(remove).toMatchObject({ destructive: true, confirm: true });
  });

  it("cancels an invite", () => {
    expect(keys(row("A", "proposed", "council"), MANAGER)).toEqual([
      ["cancelInvite", "ended"],
    ]);
  });

  it("gives a delegate nothing to do, and the Council admin everything", () => {
    expect(keys(row("A", "accepted"), DELEGATE)).toEqual([]);
    expect(keys(row("A", "proposed", "chapter"), DELEGATE)).toEqual([]);
    expect(keys(row("A", "accepted"), ["*"])).toHaveLength(2);
  });

  it("offers nothing on a link that's history", () => {
    expect(keys(row("A", "declined"), MANAGER)).toEqual([]);
    expect(keys(row("A", "ended"), MANAGER)).toEqual([]);
  });
});

describe("who reads and who manages", () => {
  it("reads with members:view and manages with council:chapters_manage", () => {
    expect(canViewCouncilChapters(DELEGATE)).toBe(true);
    expect(canViewCouncilChapters([])).toBe(false);
    expect(canManageCouncilChapters(DELEGATE)).toBe(false);
    expect(canManageCouncilChapters(MANAGER)).toBe(true);
    expect(canManageCouncilChapters(["*"])).toBe(true);
  });
});

describe("chapterListingLine", () => {
  it("names the chapter's kind and school", () => {
    expect(
      chapterListingLine({
        org_archetype: "npc",
        university: "Rensselaer Polytechnic Institute",
      }),
    ).toBe("NPC Sorority · Rensselaer Polytechnic Institute");
  });

  it("leaves out a kind it doesn't know rather than guessing IFC", () => {
    expect(
      chapterListingLine({ org_archetype: "toString", university: "RPI" }),
    ).toBe("RPI");
    expect(chapterListingLine({ org_archetype: null, university: "RPI" })).toBe(
      "RPI",
    );
  });
});

describe("orderedInviteCandidates", () => {
  it("lists offered chapters first, each group by name", () => {
    const candidate = (name: string, offered: boolean): InviteCandidate => ({
      chapter: { id: name, name, org_archetype: null, university: "RPI" },
      offered,
    });
    expect(
      orderedInviteCandidates([
        candidate("Zeta Psi", false),
        candidate("Theta Xi", true),
        candidate("Alpha Phi", false),
        candidate("Acacia", true),
      ]).map((c) => c.chapter.name),
    ).toEqual(["Acacia", "Theta Xi", "Alpha Phi", "Zeta Psi"]);
  });
});
