import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { rushPipelineAccess } from "@repo/hooks";

const { notesEnabled, notes } = vi.hoisted(() => ({
  notesEnabled: vi.fn(),
  notes: {
    current: [] as Array<Record<string, unknown>>,
  },
}));

vi.mock("@repo/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/hooks")>()),
  useRateRushCandidate: () => ({ mutate: vi.fn() }),
  useVoteRushCandidate: () => ({ mutate: vi.fn(), isPending: false }),
  useSetRushCandidateTags: () => ({ mutate: vi.fn() }),
  useRushNotes: (_id: string, options?: { enabled?: boolean }) => {
    notesEnabled(options?.enabled);
    return { data: notes.current, isPending: false, isError: false };
  },
  useAddRushNote: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useEditRushNote: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteRushNote: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

const { RushProspectPanel } = await import("./rush-prospect-panel");
const { rushNotesVisible } = await import("./rush-notes");

const STAGES = [
  {
    id: "s-new",
    chapter_id: "c",
    key: "new",
    label: "New",
    category: "new" as const,
    position: 0,
    hidden: false,
    created_at: "",
    updated_at: "",
  },
  {
    id: "s-closed",
    chapter_id: "c",
    key: "closed",
    label: "Closed",
    category: "closed" as const,
    position: 0,
    hidden: false,
    created_at: "",
    updated_at: "",
  },
];

const TAGS = [
  { id: "t-1", chapter_id: "c", label: "Legacy", created_at: "" },
  { id: "t-2", chapter_id: "c", label: "Athlete", created_at: "" },
];

const PROSPECT = {
  id: "a",
  display_name: "Jake Smith",
  user_id: null as string | null,
  stage: "new",
  closed_reason: null,
  bid_status: "none" as const,
  created_by: "u-1",
  created_by_name: "Moiz Steenhuis",
  created_at: "2026-11-20T12:00:00Z",
  tag_ids: ["t-1"],
  rating_average: 3.5,
  rating_count: 2,
  viewer_rating: null,
  vote_count: 4,
  viewer_has_voted: false,
};

const EVERY = [
  "members:view",
  "rush:view",
  "rush:add",
  "rush:vote",
  "rush:notes",
  "rush:read_notes",
  "rush:view_results",
];

function renderPanel(
  keys: string[],
  candidate: typeof PROSPECT = PROSPECT,
  viewerId: string | null = "me",
) {
  // The server leaves results out for a role without them.
  const shown = keys.includes("rush:view_results")
    ? candidate
    : {
        ...candidate,
        rating_average: undefined,
        rating_count: undefined,
        vote_count: undefined,
      };
  return render(
    <RushProspectPanel
      candidate={shown}
      stages={STAGES}
      tags={TAGS}
      access={rushPipelineAccess(keys)}
      writable
      viewerId={viewerId}
      term="Rush"
      onClose={vi.fn()}
      onMove={vi.fn()}
    />,
  );
}

const without = (key: string) => EVERY.filter((k) => k !== key);

beforeEach(() => {
  notesEnabled.mockReset();
  notes.current = [];
});

describe("a prospect's panel", () => {
  it("shows every control to a role that holds every key", () => {
    renderPanel(EVERY);
    expect(screen.getByRole("combobox", { name: "Stage" })).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Your rating of Jake Smith" }),
    ).toBeInTheDocument();
    expect(screen.getByText("★ 3.5 · 2 ratings")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Vote" })).toBeInTheDocument();
    expect(screen.getByText("4 votes")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove Legacy" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Notes · chapter only")).toBeInTheDocument();
  });

  it("reads the stage without rush:add", () => {
    renderPanel(without("rush:add"));
    expect(screen.queryByRole("combobox", { name: "Stage" })).toBeNull();
    expect(screen.getByText("New")).toBeInTheDocument();
  });

  it("has no stars and no Vote without rush:vote", () => {
    renderPanel(without("rush:vote"));
    expect(
      screen.queryByRole("group", { name: /Your rating/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Vote" })).toBeNull();
    // The average still shows to a role that sees results.
    expect(screen.getByText("★ 3.5 · 2 ratings")).toBeInTheDocument();
  });

  it("shows no average and no count without rush:view_results", () => {
    renderPanel(without("rush:view_results"));
    expect(screen.queryByText(/ratings?$/)).toBeNull();
    expect(screen.queryByText(/votes?$/)).toBeNull();
    expect(screen.getByRole("button", { name: "Vote" })).toBeInTheDocument();
  });

  it("says You voted once the viewer has", () => {
    renderPanel(EVERY, { ...PROSPECT, viewer_has_voted: true });
    expect(screen.getByText("You voted")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Vote" })).toBeNull();
  });

  it("draws tags read-only without rush:notes", () => {
    renderPanel(without("rush:notes"));
    expect(screen.getByText("Legacy")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove Legacy" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Add a tag/ }),
    ).not.toBeInTheDocument();
  });

  it("lists notes for a role that reads them, with who wrote each", () => {
    notes.current = [
      {
        id: "n-1",
        candidate_id: "a",
        author_id: "u-2",
        author_name: "Ana Ruiz",
        body: "Met him at tabling.",
        created_at: "2026-11-20T12:00:00Z",
        updated_at: "2026-11-20T12:00:00Z",
      },
    ];
    renderPanel(EVERY);
    expect(notesEnabled).toHaveBeenLastCalledWith(true);
    expect(screen.getByText("Met him at tabling.")).toBeInTheDocument();
    expect(screen.getByText("Ana Ruiz")).toBeInTheDocument();
  });

  it("gives a writer who can't read the box and a line, and no list", () => {
    renderPanel(without("rush:read_notes"));
    expect(notesEnabled).toHaveBeenLastCalledWith(false);
    expect(
      screen.getByRole("textbox", { name: "Note on Jake Smith" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Your role can't read notes/)).toBeInTheDocument();
  });

  it("has no Notes section for a role with neither notes key", () => {
    renderPanel(
      EVERY.filter((k) => k !== "rush:notes" && k !== "rush:read_notes"),
    );
    expect(screen.queryByText("Notes · chapter only")).toBeNull();
  });

  it("never shows a member the notes on their own prospect record", () => {
    renderPanel(EVERY, { ...PROSPECT, user_id: "me" }, "me");
    expect(screen.queryByText("Notes · chapter only")).toBeNull();
    expect(screen.queryByRole("textbox", { name: /Note on/ })).toBeNull();
  });
});

describe("rushNotesVisible", () => {
  const all = rushPipelineAccess(EVERY);
  it("hides a linked prospect's notes until the viewer is known", () => {
    expect(rushNotesVisible({ user_id: "x" }, all, null)).toBe(false);
    expect(rushNotesVisible({ user_id: "x" }, all, "me")).toBe(true);
    expect(rushNotesVisible({ user_id: null }, all, null)).toBe(true);
  });
});
