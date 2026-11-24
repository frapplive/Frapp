import { localIsoDate } from "@repo/formatting";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { rushPipelineAccess, rushNotesMode } from "@repo/hooks";
import { dropAllKeptDrafts } from "@repo/hooks/kept-drafts";
import { shiftRushDayKey } from "@repo/validation";

const {
  notesEnabled,
  notes,
  contacts,
  logMutate,
  ownerMutate,
  followUpMutate,
  clearMutate,
} = vi.hoisted(() => ({
  notesEnabled: vi.fn(),
  notes: {
    current: [] as Array<Record<string, unknown>>,
  },
  contacts: { current: [] as Array<Record<string, unknown>> },
  logMutate: vi.fn(),
  ownerMutate: vi.fn(),
  followUpMutate: vi.fn(),
  clearMutate: vi.fn(),
}));

vi.mock("@repo/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/hooks")>()),
  useCandidateForm: () => ({ data: undefined }),
  useRateRushCandidate: () => ({ mutate: vi.fn() }),
  useVoteRushCandidate: () => ({ mutate: vi.fn(), isPending: false }),
  useSetRushCandidateTags: () => ({ change: vi.fn(), isPending: false }),
  useRushNotes: (_id: string, options?: { enabled?: boolean }) => {
    notesEnabled(options?.enabled);
    return { data: notes.current, isPending: false, isError: false };
  },
  useAddRushNote: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useEditRushNote: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteRushNote: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useChapterRoster: () => ({
    data: [
      {
        user_id: "me",
        display_name: "Chris Lee",
        avatar_url: null,
        role_color: null,
      },
      {
        user_id: "u-2",
        display_name: "Ana Ruiz",
        avatar_url: null,
        role_color: null,
      },
    ],
  }),
  useRushContacts: () => ({
    data: contacts.current,
    isPending: false,
    isError: false,
  }),
  useLogRushContact: () => ({ mutate: logMutate, isPending: false }),
  useSetRushOwner: () => ({ mutate: ownerMutate, isPending: false }),
  useSetRushFollowUp: () => ({
    mutateAsync: followUpMutate,
    isPending: false,
  }),
  useClearRushFollowUp: () => ({ mutate: clearMutate, isPending: false }),
}));

const { RushProspectPanel } = await import("./rush-prospect-panel");

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

const TODAY = localIsoDate(new Date());

const PROSPECT = {
  id: "a",
  display_name: "Jake Smith",
  user_id: null as string | null,
  stage: "new",
  closed_reason: null,
  bid_status: "none" as const,
  created_by: "u-1",
  created_by_name: "Moiz Steenhuis",
  origin: "manual" as const,
  created_at: `${TODAY}T12:00:00Z`,
  tag_ids: ["t-1"],
  rating_average: 3.5,
  rating_count: 2,
  viewer_rating: null,
  vote_count: 4,
  viewer_has_voted: false,
  owner_id: null as string | null,
  owner_name: null as string | null,
  last_contact_on: null as string | null,
  last_contact_by: null as string | null,
  last_contact_by_name: null as string | null,
  follow_up_on: null as string | null,
  follow_up_note: null as string | null,
  follow_up_user_id: null as string | null,
  follow_up_user_name: null as string | null,
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
      staleDays={7}
      today={TODAY}
      term="Rush"
      onClose={vi.fn()}
      onMove={vi.fn()}
    />,
  );
}

const without = (key: string) => EVERY.filter((k) => k !== key);

const MANAGER = [...EVERY, "rush:manage"];

beforeEach(() => {
  notesEnabled.mockReset();
  notes.current = [];
  contacts.current = [];
  logMutate.mockReset();
  ownerMutate.mockReset();
  followUpMutate.mockReset();
  followUpMutate.mockResolvedValue({});
  clearMutate.mockReset();
  dropAllKeptDrafts();
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

  it("keeps a half-written note when another prospect is opened and back", async () => {
    const user = userEvent.setup();
    const { rerender } = renderPanel(EVERY);
    await user.type(
      screen.getByRole("textbox", { name: "Note on Jake Smith" }),
      "Great at tabling",
    );
    const other = { ...PROSPECT, id: "b", display_name: "Owen Park" };
    const panel = (candidate: typeof PROSPECT) => (
      <RushProspectPanel
        candidate={candidate}
        stages={STAGES}
        tags={TAGS}
        access={rushPipelineAccess(EVERY)}
        writable
        viewerId="me"
        staleDays={7}
        today={TODAY}
        term="Rush"
        onClose={vi.fn()}
        onMove={vi.fn()}
      />
    );
    rerender(panel(other));
    expect(
      screen.getByRole("textbox", { name: "Note on Owen Park" }),
    ).toHaveValue("");
    rerender(panel(PROSPECT));
    expect(
      screen.getByRole("textbox", { name: "Note on Jake Smith" }),
    ).toHaveValue("Great at tabling");
  });

  it("never shows a member the notes on their own prospect record", () => {
    renderPanel(EVERY, { ...PROSPECT, user_id: "me" }, "me");
    expect(screen.queryByText("Notes · chapter only")).toBeNull();
    expect(screen.queryByRole("textbox", { name: /Note on/ })).toBeNull();
  });
});

describe("a prospect's contacts, owner and follow-up (#5934)", () => {
  it("says nobody has logged a contact, then who did and when", () => {
    const { unmount } = renderPanel(EVERY);
    expect(screen.getByText("No contact logged yet")).toBeInTheDocument();
    unmount();
    renderPanel(EVERY, {
      ...PROSPECT,
      last_contact_on: TODAY,
      last_contact_by: "u-2",
      last_contact_by_name: "Ana Ruiz",
    });
    expect(
      screen.getByText("Last contacted today · by Ana Ruiz"),
    ).toBeInTheDocument();
  });

  it("logs a contact today in two clicks", async () => {
    const user = userEvent.setup();
    renderPanel(EVERY);
    await user.click(screen.getByRole("button", { name: "Log contact" }));
    await user.click(await screen.findByRole("menuitem", { name: "Text" }));
    expect(logMutate).toHaveBeenCalledWith(
      {
        candidateId: "a",
        kind: "text",
        contactedOn: TODAY,
        byName: "Chris Lee",
      },
      expect.anything(),
    );
  });

  it("logs another day with a note from the dialog", async () => {
    const user = userEvent.setup();
    renderPanel(EVERY);
    await user.click(screen.getByRole("button", { name: "Log contact" }));
    await user.click(
      await screen.findByRole("menuitem", { name: "Another day or a note…" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Log contact with Jake Smith",
    });
    await user.type(
      within(dialog).getByRole("textbox", { name: "Note" }),
      "Asked about the house",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Log contact" }),
    );
    expect(logMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateId: "a",
        kind: "text",
        contactedOn: TODAY,
        note: "Asked about the house",
      }),
      expect.anything(),
    );
  });

  it("offers Log contact only with rush:add, and never on your own record", () => {
    const { unmount } = renderPanel(without("rush:add"));
    expect(screen.queryByRole("button", { name: "Log contact" })).toBeNull();
    unmount();
    renderPanel(EVERY, { ...PROSPECT, user_id: "me" }, "me");
    expect(screen.queryByRole("button", { name: "Log contact" })).toBeNull();
  });

  it("lists the logged contacts newest first, with a note when present", () => {
    contacts.current = [
      {
        id: "k-1",
        candidate_id: "a",
        logged_by: "u-2",
        logged_by_name: "Ana Ruiz",
        kind: "text",
        contacted_on: TODAY,
        note: "Coming Thursday",
        created_at: `${TODAY}T12:00:00Z`,
      },
    ];
    renderPanel(EVERY);
    expect(
      screen.getByText("Texted · Today · by Ana Ruiz"),
    ).toBeInTheDocument();
    expect(screen.getByText("Coming Thursday")).toBeInTheDocument();
  });

  it("lets a recruiter claim an unowned prospect", async () => {
    const user = userEvent.setup();
    renderPanel(EVERY);
    expect(screen.getByText("No owner")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Claim" }));
    expect(ownerMutate).toHaveBeenCalledWith(
      { candidateId: "a", ownerId: "me", ownerName: "Chris Lee" },
      expect.anything(),
    );
  });

  it("lets the owner let go, and nobody else touch another's prospect", () => {
    const { unmount } = renderPanel(EVERY, {
      ...PROSPECT,
      owner_id: "me",
      owner_name: "Chris Lee",
    });
    expect(screen.getByRole("button", { name: "Let go" })).toBeInTheDocument();
    unmount();
    renderPanel(EVERY, {
      ...PROSPECT,
      owner_id: "u-2",
      owner_name: "Ana Ruiz",
    });
    expect(screen.getByText("Ana Ruiz")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Claim" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Let go" })).toBeNull();
  });

  it("offers no Claim without rush:add", () => {
    renderPanel(without("rush:add"));
    expect(screen.queryByRole("button", { name: "Claim" })).toBeNull();
  });

  it("gives rush:manage a picker to assign anyone", async () => {
    const user = userEvent.setup();
    renderPanel(MANAGER, {
      ...PROSPECT,
      owner_id: "u-2",
      owner_name: "Ana Ruiz",
    });
    expect(screen.queryByRole("button", { name: "Claim" })).toBeNull();
    await user.click(
      screen.getByRole("button", { name: "Owner of Jake Smith: Ana Ruiz" }),
    );
    await user.click(await screen.findByRole("option", { name: /Chris Lee/ }));
    expect(ownerMutate).toHaveBeenCalledWith(
      { candidateId: "a", ownerId: "me", ownerName: "Chris Lee" },
      expect.anything(),
    );
  });

  it("says in words that someone else claimed them first", async () => {
    ownerMutate.mockImplementation((_input, options) =>
      options.onError({ status: 409 }),
    );
    const user = userEvent.setup();
    renderPanel(EVERY);
    await user.click(screen.getByRole("button", { name: "Claim" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Someone else claimed them first.",
    );
  });

  it("sets a follow-up for the owner by default", async () => {
    const user = userEvent.setup();
    renderPanel(EVERY, {
      ...PROSPECT,
      owner_id: "u-2",
      owner_name: "Ana Ruiz",
    });
    await user.click(screen.getByRole("button", { name: "Set" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Follow up with Jake Smith",
    });
    expect(
      within(dialog).getByRole("button", { name: "For: Ana Ruiz" }),
    ).toBeInTheDocument();
    await user.type(
      within(dialog).getByRole("textbox", { name: "What to do" }),
      "Invite to house dinner",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Set follow-up" }),
    );
    expect(followUpMutate).toHaveBeenCalledWith({
      candidateId: "a",
      dueOn: shiftRushDayKey(TODAY, 1),
      note: "Invite to house dinner",
      forUserId: "u-2",
    });
  });

  it("shows a follow-up with who it's for, and clears it", async () => {
    const user = userEvent.setup();
    renderPanel(EVERY, {
      ...PROSPECT,
      follow_up_on: TODAY,
      follow_up_note: "invite to house dinner",
      follow_up_user_id: "u-2",
      follow_up_user_name: "Ana Ruiz",
    });
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText(/invite to house dinner/)).toBeInTheDocument();
    expect(screen.getByText(/for Ana Ruiz/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear follow-up" }));
    expect(clearMutate).toHaveBeenCalledWith("a", expect.anything());
  });

  it("reads the follow-up without rush:add", () => {
    renderPanel(without("rush:add"), {
      ...PROSPECT,
      follow_up_on: TODAY,
      follow_up_user_id: "me",
      follow_up_user_name: "Chris Lee",
    });
    expect(screen.queryByRole("button", { name: "Change" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Clear follow-up" }),
    ).toBeNull();
  });

  it("flags a prospect nobody has contacted for the stale days", () => {
    renderPanel(EVERY, {
      ...PROSPECT,
      created_at: `${shiftRushDayKey(TODAY, -8)}T12:00:00Z`,
    });
    expect(screen.getByText("Needs follow-up")).toBeInTheDocument();
  });
});

describe("rushNotesMode", () => {
  const all = rushPipelineAccess(EVERY);
  it("hides a linked prospect's notes until the viewer is known", () => {
    expect(rushNotesMode(all, "x", null)).toBeNull();
    expect(rushNotesMode(all, "x", "me")).not.toBeNull();
    expect(rushNotesMode(all, null, null)).not.toBeNull();
  });
});
