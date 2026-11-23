/** @vitest-environment jsdom */
import React from "react";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { useLocalSearchParams } from "expo-router";
import { Alert } from "react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { dropAllKeptDrafts } from "@repo/hooks/kept-drafts";
import { FrappThemeProvider } from "@/lib/theme";
import { screenText, textHeadings } from "@/test/screen-text";

/**
 * One prospect on the phone (#5924). Each control shows only for the key it
 * needs (`ifc-recruitment.md` § Permission map), a Closed stage asks for one
 * of the four manual reasons first and changes nothing when that's
 * cancelled, and nobody sees, or writes, notes about themselves.
 */

const state = vi.hoisted(() => ({
  permissions: [] as string[],
  viewerId: "viewer-1" as string | null,
  candidate: {} as Record<string, unknown>,
  tags: [] as unknown[],
  notes: [] as unknown[],
  notesOptions: [] as ({ enabled?: boolean } | undefined)[],
}));
const move = vi.hoisted(() => vi.fn());
const rate = vi.hoisted(() => vi.fn());
const vote = vi.hoisted(() => vi.fn());
const setTags = vi.hoisted(() => vi.fn());
const addNote = vi.hoisted(() => vi.fn());
const deleteNote = vi.hoisted(() => vi.fn());

vi.mock("@repo/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/hooks")>()),
  useMyPermissions: () => ({ data: { permissions: state.permissions } }),
  useCurrentChapter: () => ({ data: { enabled_modules: {} } }),
  useViewerUserId: () => state.viewerId,
  useRushPipeline: () => ({
    data: {
      stages: STAGES,
      tags: state.tags,
      candidates: [state.candidate],
    },
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: () => Promise.resolve(),
  }),
  useMoveRushStage: () => ({ mutate: move, isPending: false }),
  useRateRushCandidate: () => ({ mutate: rate, isPending: false }),
  useVoteRushCandidate: () => ({
    mutate: vote,
    isPending: false,
    isSuccess: false,
  }),
  useSetRushCandidateTags: () => ({ change: setTags, isPending: false }),
  useRushNotes: (_id: string, options?: { enabled?: boolean }) => {
    state.notesOptions.push(options);
    return {
      data: options?.enabled === false ? undefined : state.notes,
      isPending: false,
      isError: false,
      refetch: () => Promise.resolve(),
    };
  },
  useAddRushNote: () => ({ mutate: addNote, isPending: false }),
  useEditRushNote: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteRushNote: () => ({ mutate: deleteNote, isPending: false }),
}));

vi.mock("@/lib/chapter-branding", async () => {
  const { chapterBrandingMock, PURPLE_BRANDING } =
    await import("@/test/chapter-branding");
  return chapterBrandingMock(PURPLE_BRANDING);
});

import {
  CLOSED_REASON_TITLE,
  RushProspectScreen,
} from "./rush-prospect-screen";
import { rushNotesMode } from "@repo/hooks";
import { RUSH_NOTES_HEADING, RUSH_NOTES_WRITE_ONLY } from "./rush-notes";
import { RushStars } from "./rush-stars";
import { OptionSheet } from "@/components/option-sheet";

const VIEW = ["members:view", "rush:view"];

function stage(key: string, label: string, category: string, position = 0) {
  return {
    id: `stage-${key}`,
    chapter_id: "chapter-1",
    key,
    label,
    category,
    position,
    hidden: false,
    created_at: "",
    updated_at: "",
  };
}

const STAGES = [
  stage("new", "New", "new"),
  stage("met", "Met", "met"),
  stage("closed", "Closed", "closed"),
];

const CANDIDATE = {
  id: "cand-1",
  display_name: "Jordan Reyes",
  user_id: null,
  stage: "new",
  closed_reason: null,
  bid_status: "none",
  created_by: "user-a",
  created_by_name: "Alice Park",
  created_at: "2026-11-04T18:00:00.000Z",
  tag_ids: ["t1"],
  viewer_rating: null,
  viewer_has_voted: false,
};

const TAGS = [
  { id: "t1", chapter_id: "chapter-1", label: "Legacy", created_at: "" },
  { id: "t2", chapter_id: "chapter-1", label: "Athlete", created_at: "" },
];

const NOTE = {
  id: "note-1",
  candidate_id: "cand-1",
  author_id: "viewer-1",
  author_name: "Viewer One",
  body: "Great at tabling.",
  created_at: "2026-11-05T18:00:00.000Z",
  updated_at: "2026-11-05T18:00:00.000Z",
};

function render(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <FrappThemeProvider>
        <RushProspectScreen />
      </FrappThemeProvider>,
    );
  });
  return tree;
}

function sheet(tree: ReactTestRenderer, title: string) {
  return tree.root
    .findAllByType(OptionSheet)
    .find((node) => node.props.title === title);
}

function stageRow(tree: ReactTestRenderer) {
  return tree.root.findAll(
    (node) =>
      (node.type as unknown) === "Pressable" &&
      node.props.accessibilityLabel === "Stage",
  );
}

function button(tree: ReactTestRenderer, label: string) {
  return tree.root.findAll(
    (node) =>
      (node.type as unknown) === "Pressable" &&
      node.props.accessibilityRole === "button" &&
      node.props.accessibilityLabel === label,
  );
}

beforeEach(() => {
  vi.mocked(useLocalSearchParams).mockReturnValue({ candidateId: "cand-1" });
  state.permissions = VIEW;
  state.viewerId = "viewer-1";
  state.candidate = { ...CANDIDATE };
  state.tags = TAGS;
  state.notes = [NOTE];
  state.notesOptions = [];
  for (const fn of [move, rate, vote, setTags, addNote, deleteNote]) {
    fn.mockClear();
  }
});

describe("a prospect's screen (#5924)", () => {
  it("heads with the name and who added them, the stage under it", () => {
    const tree = render();
    expect(textHeadings(tree).map((node) => node.children.join(""))).toEqual([
      "Jordan Reyes",
    ]);
    const text = screenText(tree);
    expect(text).toMatch(/Added by Alice Park · /);
    expect(text).toContain("Stage");
    expect(text).toContain("New");
  });

  describe("for a role that may only look", () => {
    it("shows the stage and tags read-only, and no rating, vote or notes", () => {
      const tree = render();
      expect(stageRow(tree)).toHaveLength(0);
      expect(tree.root.findAllByType(OptionSheet)).toHaveLength(0);
      expect(tree.root.findAllByType(RushStars)).toHaveLength(0);
      expect(button(tree, "Vote")).toHaveLength(0);
      expect(button(tree, "Edit tags")).toHaveLength(0);
      expect(sheet(tree, "Tags")).toBeUndefined();
      const text = screenText(tree);
      expect(text).toContain("Legacy");
      expect(text).not.toContain(RUSH_NOTES_HEADING);
    });
  });

  describe("the stage picker (rush:add)", () => {
    beforeEach(() => {
      state.permissions = [...VIEW, "rush:add"];
    });

    it("opens from the Stage row and moves to an open stage at once", () => {
      const tree = render();
      expect(stageRow(tree)).toHaveLength(1);
      act(() => sheet(tree, "Stage")!.props.onSelect("met"));
      expect(move).toHaveBeenCalledWith(
        { candidateId: "cand-1", stage: "met", closedReason: undefined },
        expect.anything(),
      );
    });

    it("asks for one of the four reasons before a Closed stage", () => {
      const tree = render();
      const reasons = sheet(tree, CLOSED_REASON_TITLE)!;
      expect(
        reasons.props.options.map((o: { label: string }) => o.label),
      ).toEqual([
        "Not interested",
        "Not eligible",
        "Chapter passed",
        "No response",
      ]);

      act(() => {
        sheet(tree, "Stage")!.props.onSelect("closed");
        sheet(tree, "Stage")!.props.onDismiss();
      });
      expect(move).not.toHaveBeenCalled();

      act(() =>
        sheet(tree, CLOSED_REASON_TITLE)!.props.onSelect("no_response"),
      );
      expect(move).toHaveBeenCalledWith(
        { candidateId: "cand-1", stage: "closed", closedReason: "no_response" },
        expect.anything(),
      );
    });

    it("changes nothing when the reason is cancelled", () => {
      const tree = render();
      act(() => {
        sheet(tree, "Stage")!.props.onSelect("closed");
        sheet(tree, "Stage")!.props.onDismiss();
        sheet(tree, CLOSED_REASON_TITLE)!.props.onDismiss();
      });
      expect(move).not.toHaveBeenCalled();
      // A reason picked later, with no stage waiting, moves nothing either.
      act(() =>
        sheet(tree, CLOSED_REASON_TITLE)!.props.onSelect("no_response"),
      );
      expect(move).not.toHaveBeenCalled();
    });

    it("says a Closed prospect's reason with their stage", () => {
      state.candidate = {
        ...CANDIDATE,
        stage: "closed",
        closed_reason: "chapter_passed",
      };
      expect(screenText(render())).toContain("Closed · Chapter passed");
    });
  });

  describe("rating and vote", () => {
    it("offers the stars and Vote for rush:vote, with no count or average without results", () => {
      state.permissions = [...VIEW, "rush:vote"];
      const tree = render();
      const stars = tree.root.findByType(RushStars);
      act(() => stars.props.onRate(4));
      expect(rate).toHaveBeenCalledWith(
        { candidateId: "cand-1", rating: 4 },
        expect.anything(),
      );
      expect(button(tree, "Vote")).toHaveLength(1);
      act(() => button(tree, "Vote")[0]!.props.onPress());
      expect(vote).toHaveBeenCalledWith("cand-1", expect.anything());
      const text = screenText(tree);
      expect(text).not.toMatch(/\d+ votes?/);
      expect(text).not.toContain("★");
      expect(text).not.toContain("No ratings yet");
    });

    it("says You voted once voted, and the count and average for rush:view_results", () => {
      state.permissions = [...VIEW, "rush:vote", "rush:view_results"];
      state.candidate = {
        ...CANDIDATE,
        viewer_has_voted: true,
        vote_count: 4,
        rating_average: 3.5,
        rating_count: 2,
        viewer_rating: 3,
      };
      const tree = render();
      expect(button(tree, "Vote")).toHaveLength(0);
      const text = screenText(tree);
      expect(text).toContain("You voted");
      expect(text).toContain("4 votes");
      expect(text).toContain("★ 3.5 · 2 ratings");
      expect(tree.root.findByType(RushStars).props.value).toBe(3);
    });

    it("shows the average without the stars to a role that sees results but can't rate", () => {
      state.permissions = [...VIEW, "rush:view_results"];
      state.candidate = {
        ...CANDIDATE,
        vote_count: 1,
        rating_average: 4,
        rating_count: 1,
      };
      const tree = render();
      expect(tree.root.findAllByType(RushStars)).toHaveLength(0);
      expect(button(tree, "Vote")).toHaveLength(0);
      const text = screenText(tree);
      expect(text).toContain("★ 4 · 1 rating");
      expect(text).toContain("1 vote");
    });
  });

  describe("tags", () => {
    it("are edited from the chapter's list with rush:notes", () => {
      state.permissions = [...VIEW, "rush:notes"];
      const tree = render();
      expect(button(tree, "Edit tags")).toHaveLength(1);
      act(() => sheet(tree, "Tags")!.props.onSelect("t2"));
      expect(setTags).toHaveBeenCalledWith(
        { candidateId: "cand-1", toggle: "t2" },
        expect.anything(),
      );
      act(() => sheet(tree, "Tags")!.props.onSelect("t1"));
      expect(setTags).toHaveBeenLastCalledWith(
        { candidateId: "cand-1", toggle: "t1" },
        expect.anything(),
      );
    });

    it("offer no editor when the chapter keeps no tags", () => {
      state.permissions = [...VIEW, "rush:notes"];
      state.tags = [];
      state.candidate = { ...CANDIDATE, tag_ids: [] };
      const tree = render();
      expect(button(tree, "Add tags")).toHaveLength(0);
      expect(screenText(tree)).not.toContain("Tags");
    });
  });

  describe("notes", () => {
    it("lists them and offers the box with rush:read_notes and rush:notes", () => {
      state.permissions = [...VIEW, "rush:notes", "rush:read_notes"];
      const tree = render();
      const text = screenText(tree);
      expect(text).toContain(RUSH_NOTES_HEADING);
      expect(text).toContain("Great at tabling.");
      expect(text).not.toContain(RUSH_NOTES_WRITE_ONLY);
      expect(button(tree, "Add note")).toHaveLength(1);
    });

    it("keeps a new note's words when the member leaves and comes back", () => {
      dropAllKeptDrafts();
      state.permissions = [...VIEW, "rush:notes"];
      const first = render();
      const field = () =>
        first.root.find(
          (node) =>
            (node.type as unknown) === "TextInput" &&
            node.props.accessibilityLabel === "Write a note",
        );
      act(() => field().props.onChangeText("Knows three brothers"));
      act(() => first.unmount());

      const again = render();
      const back = again.root.find(
        (node) =>
          (node.type as unknown) === "TextInput" &&
          node.props.accessibilityLabel === "Write a note",
      );
      expect(back.props.value).toBe("Knows three brothers");
      dropAllKeptDrafts();
    });

    it("gives a writer who can't read the box and who can read, and no list", () => {
      state.permissions = [...VIEW, "rush:notes"];
      const tree = render();
      const text = screenText(tree);
      expect(text).toContain(RUSH_NOTES_WRITE_ONLY);
      expect(text).not.toContain("Great at tabling.");
      expect(button(tree, "Add note")).toHaveLength(1);
      expect(state.notesOptions.every((o) => o?.enabled === false)).toBe(true);
    });

    it("never shows notes, or the box, on a prospect linked to the viewer", () => {
      state.permissions = [...VIEW, "rush:notes", "rush:read_notes"];
      state.candidate = { ...CANDIDATE, user_id: "viewer-1" };
      const tree = render();
      const text = screenText(tree);
      expect(text).not.toContain(RUSH_NOTES_HEADING);
      expect(text).not.toContain("Great at tabling.");
      expect(button(tree, "Add note")).toHaveLength(0);
      expect(state.notesOptions).toEqual([]);
    });

    it("waits for the viewer's id before showing notes on a linked prospect", () => {
      expect(
        rushNotesMode({ readNotes: true, writeNotes: true }, "someone", null),
      ).toBeNull();
      expect(
        rushNotesMode({ readNotes: true, writeNotes: false }, null, null),
      ).toEqual({ read: true, write: false });
      expect(
        rushNotesMode({ readNotes: false, writeNotes: false }, null, "v"),
      ).toBeNull();
    });

    it("lets the author delete their own note after a confirm", async () => {
      state.permissions = [...VIEW, "rush:notes", "rush:read_notes"];
      const tree = render();
      const more = button(tree, "More actions for Viewer One's note");
      expect(more).toHaveLength(1);
      const row = tree.root.find(
        (node) =>
          (node.type as unknown) === "Pressable" &&
          node.props.accessibilityLabel === "Viewer One: Great at tabling.",
      );
      const labels = row.props.accessibilityActions.map(
        (a: { label: string }) => a.label,
      );
      expect(labels).toEqual(["Edit note", "Delete note"]);

      vi.mocked(Alert.alert).mockClear();
      act(() => {
        row.props.onAccessibilityAction({
          nativeEvent: { actionName: "menu:delete" },
        });
      });
      const buttons = vi.mocked(Alert.alert).mock.calls[0]![2]!;
      await act(async () => {
        buttons.find((b) => b.text === "Delete")!.onPress!();
      });
      expect(deleteNote).toHaveBeenCalledWith(
        { candidateId: "cand-1", noteId: "note-1" },
        expect.anything(),
      );
    });

    it("lets rush:manage delete someone else's note, but not edit it", () => {
      state.permissions = [
        ...VIEW,
        "rush:notes",
        "rush:read_notes",
        "rush:manage",
      ];
      state.notes = [{ ...NOTE, author_id: "other", author_name: "Other" }];
      const tree = render();
      const row = tree.root.find(
        (node) =>
          (node.type as unknown) === "Pressable" &&
          node.props.accessibilityLabel === "Other: Great at tabling.",
      );
      expect(
        row.props.accessibilityActions.map((a: { label: string }) => a.label),
      ).toEqual(["Delete note"]);
    });

    it("offers no actions on someone else's note without rush:manage", () => {
      state.permissions = [...VIEW, "rush:notes", "rush:read_notes"];
      state.notes = [{ ...NOTE, author_id: "other", author_name: "Other" }];
      const tree = render();
      expect(button(tree, "More actions for Other's note")).toHaveLength(0);
    });
  });

  it("goes back to the list under the chapter's word", () => {
    const tree = render();
    const back = tree.root.find(
      (node) =>
        (node.type as unknown) === "Pressable" &&
        typeof node.props.accessibilityLabel === "string" &&
        node.props.accessibilityLabel.startsWith("Back to "),
    );
    expect(back.props.accessibilityLabel).toBe("Back to Rush");
  });
});
