/** @vitest-environment jsdom */
import React from "react";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { useRouter } from "expo-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FrappThemeProvider } from "@/lib/theme";
import { screenText, textHeadings } from "@/test/screen-text";

/**
 * The phone's recruitment list (#5924, #5934): one stage at a time behind
 * chips, with one Closed chip that folds every Closed stage, counting the
 * prospects still in play and the viewer's follow-ups due today. A role that
 * works prospects opens on Follow up, adds with the "+", and logs a contact
 * from a row's long press. Titled with the chapter's own word.
 */

const state = vi.hoisted(() => ({
  permissions: [] as string[] | undefined,
  chapter: { enabled_modules: {} } as Record<string, unknown> | undefined,
  pipeline: undefined as unknown,
  pipelineOptions: [] as ({ enabled?: boolean } | undefined)[],
  viewerId: "me" as string | null,
}));
const addProspect = vi.hoisted(() => vi.fn());
const logContact = vi.hoisted(() => vi.fn());

vi.mock("@repo/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/hooks")>()),
  useMyPermissions: () => ({
    data: state.permissions ? { permissions: state.permissions } : undefined,
  }),
  useCurrentChapter: () => ({ data: state.chapter }),
  useViewerUserId: () => state.viewerId,
  useChapterRoster: () => ({ data: [] }),
  useAddRushProspect: () => ({ mutateAsync: addProspect, isPending: false }),
  useLogRushContact: () => ({
    mutateAsync: logContact,
    mutate: vi.fn(),
    isPending: false,
  }),
  useRushPipeline: (options?: { enabled?: boolean }) => {
    state.pipelineOptions.push(options);
    return {
      data: state.pipeline,
      isPending: state.pipeline === undefined,
      isError: false,
      isFetching: false,
      refetch: vi.fn(() => Promise.resolve()),
    };
  },
}));

vi.mock("@/lib/chapter-branding", async () => {
  const { chapterBrandingMock, PURPLE_BRANDING } =
    await import("@/test/chapter-branding");
  return chapterBrandingMock(PURPLE_BRANDING);
});

import { dropAllKeptDrafts } from "@repo/hooks/kept-drafts";
import { RushListScreen, emptyStageLine } from "./rush-list-screen";
import { RushAddProspectSheet } from "./rush-add-prospect-sheet";
import { RushLogContactSheet } from "./rush-log-contact-sheet";

const ALL = [
  "members:view",
  "rush:view",
  "rush:add",
  "rush:vote",
  "rush:view_results",
];

function stage(
  key: string,
  label: string,
  category: string,
  position: number,
  hidden = false,
) {
  return {
    id: `stage-${key}`,
    chapter_id: "chapter-1",
    key,
    label,
    category,
    position,
    hidden,
    created_at: "2026-11-01T00:00:00.000Z",
    updated_at: "2026-11-01T00:00:00.000Z",
  };
}

function candidate(
  id: string,
  name: string,
  stageKey: string,
  extra: Record<string, unknown> = {},
) {
  return {
    id,
    display_name: name,
    user_id: null,
    stage: stageKey,
    closed_reason: null,
    bid_status: "none",
    created_by: "user-a",
    created_by_name: "Alice Park",
    created_at: `2026-11-${10 + Number(id.slice(-1))}T18:00:00.000Z`,
    tag_ids: [],
    viewer_rating: null,
    viewer_has_voted: false,
    owner_id: null,
    owner_name: null,
    // Reached yesterday, so nobody is stale unless a test says so.
    last_contact_on: "2026-11-23",
    last_contact_by: "user-a",
    last_contact_by_name: "Alice Park",
    follow_up_on: null,
    follow_up_note: null,
    follow_up_user_id: null,
    follow_up_user_name: null,
    ...extra,
  };
}

const STAGES = [
  stage("new", "New", "new", 0),
  stage("contacted", "Reached out", "contacted", 0),
  stage("met", "Met", "met", 0),
  stage("closed", "Not a fit", "closed", 0),
  stage("closed-2", "Went elsewhere", "closed", 1),
];

function pipeline(candidates: unknown[], tags: unknown[] = []) {
  return { stages: STAGES, tags, candidates, stale_days: 7 };
}

function render(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <FrappThemeProvider>
        <RushListScreen />
      </FrappThemeProvider>,
    );
  });
  return tree;
}

/** The stage chips, not the List / Summary views in the header (#5973). */
function chips(tree: ReactTestRenderer) {
  const stages = tree.root.findAll(
    (node) =>
      node.props.accessibilityRole === "tablist" &&
      node.props.accessibilityLabel === "Stages",
  )[0];
  if (!stages) return [];
  return stages.findAll(
    (node) =>
      (node.type as unknown) === "Pressable" &&
      node.props.accessibilityRole === "tab",
  );
}

function views(tree: ReactTestRenderer) {
  return tree.root.findAll(
    (node) =>
      (node.type as unknown) === "Pressable" &&
      node.props.accessibilityRole === "tab" &&
      (node.props.accessibilityLabel === "List" ||
        node.props.accessibilityLabel === "Summary"),
  );
}

function chipLabels(tree: ReactTestRenderer): string[] {
  return chips(tree).map((chip) =>
    chip
      .findAllByType("Text" as never)
      .map((text) => text.children.join(""))
      .join(""),
  );
}

function pressable(tree: ReactTestRenderer, label: string) {
  return tree.root.findAll(
    (node) =>
      (node.type as unknown) === "Pressable" &&
      node.props.accessibilityLabel === label,
  );
}

beforeEach(() => {
  // A Tuesday, so "today" and the stale days are fixed.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 24, 12));
  dropAllKeptDrafts();
  addProspect.mockReset();
  logContact.mockReset();
  state.viewerId = "me";
  state.permissions = ALL;
  state.chapter = { enabled_modules: {} };
  state.pipelineOptions = [];
  state.pipeline = pipeline(
    [
      candidate("c1", "Jordan Reyes", "new", {
        rating_average: 3.7,
        rating_count: 6,
        tag_ids: ["t1", "t2", "t3"],
      }),
      candidate("c2", "Sam Ortiz", "new"),
      candidate("c3", "Lee Chen", "contacted"),
      candidate("c4", "Max Hill", "closed", { closed_reason: "no_response" }),
      candidate("c5", "Ari Stone", "closed-2", {
        closed_reason: "chapter_passed",
      }),
    ],
    [
      { id: "t1", chapter_id: "chapter-1", label: "Legacy", created_at: "" },
      { id: "t2", chapter_id: "chapter-1", label: "Athlete", created_at: "" },
      {
        id: "t3",
        chapter_id: "chapter-1",
        label: "Met at tabling",
        created_at: "",
      },
    ],
  );
});

describe("the recruitment list (#5924)", () => {
  it("is titled with the chapter's own word and counts the open prospects", () => {
    state.chapter = {
      enabled_modules: {},
      org_archetype: "nphc",
      vocabulary: {},
    };
    const tree = render();
    const headings = textHeadings(tree).map((node) => node.children.join(""));
    expect(headings).toContain("Intake");
    // Five prospects, two of them Closed.
    expect(screenText(tree)).toContain("3 prospects");
  });

  it("draws Follow up, a chip per stage in order, then one Closed chip for every Closed stage", () => {
    const tree = render();
    expect(chipLabels(tree)).toEqual([
      "Follow up · 0",
      "New · 2",
      "Reached out · 1",
      "Met · 0",
      "Closed · 2",
    ]);
  });

  it("switches to Summary: the counts and the funnel, the board's columns, with no chips or search (#5973)", () => {
    const tree = render();
    expect(views(tree).map((v) => v.props.accessibilityLabel)).toEqual([
      "List",
      "Summary",
    ]);
    act(() => views(tree)[1]!.props.onPress());
    expect(chips(tree)).toEqual([]);
    const text = screenText(tree);
    expect(text).toContain("Open prospects");
    expect(text).toContain("By stage");
    // The funnel is the chips' own columns: Closed folds both Closed stages.
    expect(text).toContain("Reached out");
    expect(text).toContain("Top rated");
    expect(text).not.toContain("Search prospects");
  });

  it("opens on the first stage for a role that can't work prospects, and switches with a chip", () => {
    state.permissions = ["members:view", "rush:view", "rush:view_results"];
    const tree = render();
    expect(chipLabels(tree)[0]).toBe("New · 2");
    let text = screenText(tree);
    expect(text).toContain("Jordan Reyes");
    expect(text).toContain("Sam Ortiz");
    expect(text).not.toContain("Lee Chen");

    act(() => chips(tree).at(-1)!.props.onPress());
    text = screenText(tree);
    expect(text).toContain("Max Hill");
    expect(text).toContain("Ari Stone");
    expect(text).not.toContain("Jordan Reyes");
  });

  it("says who owns a prospect, their rating when the role sees results, and two tags", () => {
    state.permissions = ["members:view", "rush:view", "rush:view_results"];
    const text = screenText(render());
    expect(text).toContain("No owner · ★ 3.7 · 6 ratings");
    expect(text).toContain("Legacy");
    expect(text).toContain("Athlete");
    expect(text).not.toContain("Met at tabling");
    expect(text).toContain("+1");
  });

  it("draws no rating where the read leaves it out", () => {
    state.permissions = ["members:view", "rush:view"];
    state.pipeline = pipeline([candidate("c1", "Jordan Reyes", "new")]);
    const text = screenText(render());
    expect(text).toContain("No owner");
    expect(text).not.toContain("rating");
  });

  it("says only that a stage is empty, and what Follow up holds", () => {
    expect(
      emptyStageLine({ label: "Met", closed: false, followUp: false }, 7),
    ).toBe("No prospects in Met.");
    expect(
      emptyStageLine({ label: "Closed", closed: true, followUp: false }, 7),
    ).toBe("No closed prospects.");
    expect(
      emptyStageLine({ label: "Follow up", closed: false, followUp: true }, 7),
    ).toBe(
      "Nothing to follow up on. Your follow-ups show here when they're due, and prospects you own after 7 days without a contact.",
    );
  });

  it("no longer points to the chat command on an empty first stage", () => {
    state.permissions = ["members:view", "rush:view"];
    state.pipeline = pipeline([]);
    const text = screenText(render());
    expect(text).toContain("No prospects in New.");
    expect(text).not.toContain("in chat");
  });

  it("opens a prospect's screen from their row", () => {
    state.permissions = ["members:view", "rush:view"];
    const tree = render();
    const push = vi.mocked(useRouter().push);
    push.mockClear();
    const row = tree.root.find(
      (node) =>
        (node.type as unknown) === "Pressable" &&
        node.props.accessibilityLabel === "Jordan Reyes",
    );
    act(() => row.props.onPress());
    expect(push).toHaveBeenCalledWith({
      pathname: "/rush-prospect",
      params: { candidateId: "c1" },
    });
  });

  it("goes back to You for a role without rush:view, and never reads the pipeline", () => {
    state.permissions = ["members:view"];
    const tree = render();
    expect(tree.root.findAllByType("Redirect" as never)).toHaveLength(1);
    expect(state.pipelineOptions.every((o) => o?.enabled === false)).toBe(true);
  });

  it("goes back to You while Recruitment is off", () => {
    state.chapter = { enabled_modules: { rush: false } };
    const tree = render();
    expect(tree.root.findAllByType("Redirect" as never)).toHaveLength(1);
  });

  it("waits for the permissions read rather than turning a member away", () => {
    state.permissions = undefined;
    const tree = render();
    expect(tree.root.findAllByType("Redirect" as never)).toHaveLength(0);
  });
});

describe("follow-ups on the list (#5934)", () => {
  const due = (id: string, name: string, extra: Record<string, unknown> = {}) =>
    candidate(id, name, "met", {
      follow_up_on: "2026-11-24",
      follow_up_note: "Invite to house dinner",
      follow_up_user_id: "me",
      follow_up_user_name: "Me",
      ...extra,
    });

  beforeEach(() => {
    state.pipeline = pipeline([
      due("c1", "Jordan Reyes"),
      due("c2", "Sam Ortiz", { follow_up_on: "2026-11-22" }),
      // Someone else's follow-up: not under the viewer's chip or count.
      due("c3", "Lee Chen", { follow_up_user_id: "other" }),
      // Owned by the viewer and not reached in 10 days: stale.
      candidate("c4", "Max Hill", "contacted", {
        owner_id: "me",
        owner_name: "Me",
        last_contact_on: "2026-11-14",
      }),
      // A later follow-up of the viewer's: not due yet.
      due("c5", "Ari Stone", { follow_up_on: "2026-11-26" }),
    ]);
  });

  it("opens on Follow up, with the viewer's due follow-ups then the stale prospects they own", () => {
    const tree = render();
    expect(chipLabels(tree)[0]).toBe("Follow up · 3");
    const rows = tree.root
      .findAll(
        (node) =>
          (node.type as unknown) === "Pressable" &&
          node.props.accessibilityRole === "button" &&
          [
            "Jordan Reyes",
            "Sam Ortiz",
            "Lee Chen",
            "Max Hill",
            "Ari Stone",
          ].includes(node.props.accessibilityLabel),
      )
      .map((node) => node.props.accessibilityLabel);
    // Oldest due first, then the stale one.
    expect(rows).toEqual(["Sam Ortiz", "Jordan Reyes", "Max Hill"]);
  });

  it("says the viewer's follow-ups due today in the header", () => {
    const text = screenText(render());
    // Five open prospects; two follow-ups of the viewer's are due.
    expect(text).toContain("5 prospects · 2 follow-ups due today");
  });

  it("leaves the count out of the header at zero", () => {
    state.pipeline = pipeline([candidate("c1", "Jordan Reyes", "new")]);
    const text = screenText(render());
    expect(text).toContain("1 prospect");
    expect(text).not.toContain("due today");
  });

  it("marks a row with its follow-up's day, or Needs follow-up when stale, and its owner", () => {
    const tree = render();
    let text = screenText(tree);
    expect(text).toContain("Follow-up today");
    expect(text).toContain("Needs follow-up");
    expect(text).toContain("Owned by Me");
    // Met holds the later one: a quiet "Follow-up Thursday".
    act(() => chips(tree)[3]!.props.onPress());
    text = screenText(tree);
    expect(text).toContain("Follow-up Thursday");
  });

  it("marks nothing on a closed prospect", () => {
    state.pipeline = pipeline([
      candidate("c1", "Max Hill", "closed", {
        closed_reason: "no_response",
        owner_id: "me",
        last_contact_on: "2026-10-01",
        follow_up_on: "2026-11-24",
        follow_up_user_id: "me",
      }),
    ]);
    const tree = render();
    act(() => chips(tree).at(-1)!.props.onPress());
    const text = screenText(tree);
    expect(text).toContain("Max Hill");
    expect(text).not.toContain("Follow-up");
    expect(text).not.toContain("Needs follow-up");
  });

  it("says what goes under an empty Follow up", () => {
    state.pipeline = pipeline([candidate("c1", "Jordan Reyes", "new")]);
    expect(screenText(render())).toContain("Nothing to follow up on.");
  });

  it("logs a contact from a row's long press", () => {
    const tree = render();
    const row = pressable(tree, "Jordan Reyes")[0]!;
    expect(
      row.props.accessibilityActions.map((a: { label: string }) => a.label),
    ).toEqual(["Log contact"]);
    act(() =>
      row.props.onAccessibilityAction({
        nativeEvent: { actionName: "menu:log-contact" },
      }),
    );
    const sheet = tree.root.findByType(RushLogContactSheet);
    expect(sheet.props.candidateId).toBe("c1");
  });

  it("offers no long press to a role that can't work prospects", () => {
    state.permissions = ["members:view", "rush:view"];
    state.pipeline = pipeline([candidate("c1", "Jordan Reyes", "new")]);
    const row = pressable(render(), "Jordan Reyes")[0]!;
    expect(row.props.accessibilityActions).toBeUndefined();
  });
});

describe("New prospect (#5931)", () => {
  function open(tree: ReactTestRenderer) {
    act(() => pressable(tree, "New prospect")[0]!.props.onPress());
  }
  function field(tree: ReactTestRenderer) {
    return tree.root.find(
      (node) =>
        (node.type as unknown) === "BottomSheetTextInput" &&
        node.props.accessibilityLabel === "Name",
    );
  }
  function commit(tree: ReactTestRenderer) {
    return pressable(tree, "Add prospect")[0]!;
  }

  it("is the floating + for rush:add, and absent without it", () => {
    expect(pressable(render(), "New prospect")).toHaveLength(1);
    state.permissions = ["members:view", "rush:view"];
    expect(pressable(render(), "New prospect")).toHaveLength(0);
  });

  it("adds the name, then shows the stage it landed in", async () => {
    addProspect.mockResolvedValue({ id: "new-1" });
    const tree = render();
    open(tree);
    expect(commit(tree).props.accessibilityState).toEqual({ disabled: true });
    act(() => field(tree).props.onChangeText("  Pat Kim "));
    await act(async () => commit(tree).props.onPress());
    expect(addProspect).toHaveBeenCalledWith("Pat Kim");
    // From Follow up to New, where the prospect landed.
    const selected = chips(tree).findIndex(
      (chip) => chip.props.accessibilityState?.selected,
    );
    expect(chipLabels(tree)[selected]).toMatch(/^New/);
  });

  it("says a name already on the list under the field, keeping what was typed", async () => {
    addProspect.mockRejectedValue({ status: 409 });
    const tree = render();
    open(tree);
    act(() => field(tree).props.onChangeText("Jordan Reyes"));
    await act(async () => commit(tree).props.onPress());
    expect(screenText(tree)).toContain(
      "Jordan Reyes is already on the list. Add something to tell them apart, like a last initial.",
    );
    expect(field(tree).props.value).toBe("Jordan Reyes");
    expect(tree.root.findAllByType(RushAddProspectSheet)).toHaveLength(1);
  });
});
