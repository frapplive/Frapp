/** @vitest-environment jsdom */
import React from "react";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { useRouter } from "expo-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FrappThemeProvider } from "@/lib/theme";
import { screenText, textHeadings } from "@/test/screen-text";

/**
 * The phone's recruitment list (#5924): one stage at a time behind chips,
 * with one Closed chip that folds every Closed stage, opening on the first
 * stage, counting the prospects still in play, and saying how to add one
 * where adds land. Titled with the chapter's own word.
 */

const state = vi.hoisted(() => ({
  permissions: [] as string[] | undefined,
  chapter: { enabled_modules: {} } as Record<string, unknown> | undefined,
  pipeline: undefined as unknown,
  pipelineOptions: [] as ({ enabled?: boolean } | undefined)[],
}));

vi.mock("@repo/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/hooks")>()),
  useMyPermissions: () => ({
    data: state.permissions ? { permissions: state.permissions } : undefined,
  }),
  useCurrentChapter: () => ({ data: state.chapter }),
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

import { RushListScreen, emptyStageLine } from "./rush-list-screen";

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
    origin: "manual" as const,
    created_at: `2026-11-${10 + Number(id.slice(-1))}T18:00:00.000Z`,
    tag_ids: [],
    viewer_rating: null,
    viewer_has_voted: false,
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
  return { stages: STAGES, tags, candidates };
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

function chips(tree: ReactTestRenderer) {
  return tree.root.findAll(
    (node) =>
      (node.type as unknown) === "Pressable" &&
      node.props.accessibilityRole === "tab",
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

beforeEach(() => {
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

  it("draws a chip per stage in order, then one Closed chip for every Closed stage", () => {
    const tree = render();
    expect(chipLabels(tree)).toEqual([
      "New · 2",
      "Reached out · 1",
      "Met · 0",
      "Closed · 2",
    ]);
  });

  it("opens on the first stage and switches with a chip", () => {
    const tree = render();
    let text = screenText(tree);
    expect(text).toContain("Jordan Reyes");
    expect(text).toContain("Sam Ortiz");
    expect(text).not.toContain("Lee Chen");

    act(() => chips(tree)[3]!.props.onPress());
    text = screenText(tree);
    expect(text).toContain("Max Hill");
    expect(text).toContain("Ari Stone");
    expect(text).not.toContain("Jordan Reyes");
  });

  it("says who added a prospect, their rating when the role sees results, and two tags", () => {
    const text = screenText(render());
    expect(text).toContain("Added by Alice Park · ★ 3.7 · 6 ratings");
    expect(text).toContain("Legacy");
    expect(text).toContain("Athlete");
    expect(text).not.toContain("Met at tabling");
    expect(text).toContain("+1");
  });

  it("draws no rating where the read leaves it out", () => {
    state.permissions = ["members:view", "rush:view"];
    state.pipeline = pipeline([candidate("c1", "Jordan Reyes", "new")]);
    const text = screenText(render());
    expect(text).toContain("Added by Alice Park");
    expect(text).not.toContain("rating");
  });

  it("says how to add a prospect on an empty first stage, in the chapter's command", () => {
    state.chapter = { enabled_modules: {}, org_archetype: "nphc" };
    state.pipeline = pipeline([]);
    const text = screenText(render());
    expect(text).toContain(
      "No prospects in New. Add one in chat with /intake add and their name.",
    );
  });

  it("says only that a stage is empty where nobody is added, or for a role that can't add", () => {
    expect(
      emptyStageLine(
        { label: "Met", closed: false, receivesAdds: false },
        true,
        "/rush",
      ),
    ).toBe("No prospects in Met.");
    expect(
      emptyStageLine(
        { label: "New", closed: false, receivesAdds: true },
        false,
        "/rush",
      ),
    ).toBe("No prospects in New.");
    expect(
      emptyStageLine(
        { label: "Closed", closed: true, receivesAdds: false },
        true,
        "/rush",
      ),
    ).toBe("No closed prospects.");
  });

  it("opens a prospect's screen from their row", () => {
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
