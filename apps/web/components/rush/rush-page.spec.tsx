import { localIsoDate } from "@repo/formatting";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { shiftRushDayKey } from "@repo/validation";

const {
  permissions,
  pipeline,
  moveMutate,
  moduleOn,
  vocabulary,
  searchParams,
} = vi.hoisted(() => ({
  permissions: { current: ["*"] as string[] },
  pipeline: { current: null as unknown },
  moveMutate: vi.fn(),
  moduleOn: { current: true },
  vocabulary: { current: undefined as unknown },
  searchParams: { current: new URLSearchParams() },
}));

// jsdom measures every box at 0, so the page reads as wide unless a test
// says the pane is narrow (`useIsNarrow`).
const narrowPane = vi.hoisted(() => ({ current: null as boolean | null }));
vi.mock("@/lib/use-is-narrow", () => ({
  useIsNarrow: () => [() => undefined, narrowPane.current],
}));

const TODAY = localIsoDate(new Date());

const stage = (
  key: string,
  label: string,
  category: string,
  position = 0,
  hidden = false,
) => ({
  id: `s-${key}`,
  chapter_id: "c",
  key,
  label,
  category,
  position,
  hidden,
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z",
});

const STAGES = [
  stage("new", "New", "new"),
  stage("contacted", "Contacted", "contacted"),
  stage("met", "Met", "met"),
  stage("engaged", "Engaged", "engaged"),
  stage("bid_ready", "Bid ready", "bid_ready"),
  stage("closed", "Closed", "closed"),
];

const candidate = (
  id: string,
  name: string,
  stageKey = "new",
  extra: Record<string, unknown> = {},
) => ({
  id,
  display_name: name,
  user_id: null,
  stage: stageKey,
  closed_reason: stageKey === "closed" ? "not_interested" : null,
  bid_status: "none",
  created_by: "u-1",
  created_by_name: "Moiz Steenhuis",
  created_at: `${TODAY}T12:00:00Z`,
  tag_ids: [],
  viewer_rating: null,
  viewer_has_voted: false,
  owner_id: null,
  owner_name: null,
  last_contact_on: null,
  last_contact_by: null,
  last_contact_by_name: null,
  follow_up_on: null,
  follow_up_note: null,
  follow_up_user_id: null,
  follow_up_user_name: null,
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
  bid_invite_sent: null,
  ...extra,
});

/** Added `days` ago, so with no contact they go stale after 7. */
const addedDaysAgo = (days: number) => ({
  created_at: `${shiftRushDayKey(TODAY, -days)}T12:00:00Z`,
});

const bidMutate = vi.hoisted(() => ({
  extend: vi.fn(),
  decline: vi.fn(),
  accept: vi.fn(),
  confirm: vi.fn(),
  rescind: vi.fn(),
}));

vi.mock("@repo/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/hooks")>()),
  useMyPermissions: () => ({
    data: { permissions: permissions.current },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useRushPipeline: () => ({
    data: pipeline.current,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useViewerUserId: () => "me",
  useMoveRushStage: () => ({ mutate: moveMutate, isPending: false }),
  useRateRushCandidate: () => ({ mutate: vi.fn() }),
  useVoteRushCandidate: () => ({ mutate: vi.fn(), isPending: false }),
  useBidRushCandidate: () => ({ mutate: bidMutate.extend, isPending: false }),
  useRecordRushDecline: () => ({ mutate: bidMutate.decline, isPending: false }),
  useRecordRushAcceptance: () => ({
    mutate: bidMutate.accept,
    isPending: false,
  }),
  useConfirmRushAcceptance: () => ({
    mutate: bidMutate.confirm,
    isPending: false,
  }),
  useRescindRushBid: () => ({ mutate: bidMutate.rescind, isPending: false }),
  useSetRushCandidateTags: () => ({ change: vi.fn(), isPending: false }),
  useRushNotes: () => ({ data: [], isPending: false, isError: false }),
  useAddRushNote: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useEditRushNote: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteRushNote: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAddRushProspect: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useChapterRoster: () => ({ data: [] }),
  useRushContacts: () => ({ data: [], isPending: false, isError: false }),
  useLogRushContact: () => ({ mutate: vi.fn(), isPending: false }),
  useSetRushOwner: () => ({ mutate: vi.fn(), isPending: false }),
  useSetRushFollowUp: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useClearRushFollowUp: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams.current,
}));

vi.mock("@/lib/hooks/use-chapter-module-gate", () => ({
  useChapterModuleGateState: () => ({
    status: "ready",
    isModuleEnabled: (key: string) => key !== "rush" || moduleOn.current,
    retry: vi.fn(),
    fetchStatus: "idle",
  }),
}));

vi.mock("@/lib/hooks/use-chapter-vocabulary", () => ({
  useChapterVocabulary: () => vocabulary.current,
}));

vi.mock("@/lib/providers/network-provider", () => ({
  useNetwork: () => ({ isOffline: false, probeOnce: vi.fn() }),
}));

vi.mock("@/components/shared/subscription-gate", () => ({
  useSubscriptionGate: () => ({
    allowed: true,
    controlProps: () => ({
      disabled: false,
      title: undefined,
      "aria-describedby": undefined,
    }),
  }),
  SubscriptionNotice: () => null,
}));

const { RushPage } = await import("./rush-page");

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <RushPage />
    </QueryClientProvider>,
  );
}

const MEMBER = [
  "members:view",
  "rush:view",
  "rush:add",
  "rush:vote",
  "rush:bid",
  "rush:notes",
  "rush:view_results",
];

beforeEach(() => {
  permissions.current = MEMBER;
  moduleOn.current = true;
  vocabulary.current = undefined;
  moveMutate.mockReset();
  pipeline.current = {
    stages: STAGES,
    tags: [],
    stale_days: 7,
    candidates: [
      candidate("a", "Jake Smith"),
      candidate("b", "Owen Park", "contacted"),
      candidate("c", "Leo Grant", "closed"),
    ],
  };
  searchParams.current = new URLSearchParams();
  window.localStorage.clear();
});

describe("the recruitment page", () => {
  it("counts the open prospects, not the closed ones", () => {
    renderPage();
    expect(screen.getByText("2 prospects")).toBeInTheDocument();
  });

  it("draws one column per working stage and one folded Closed column", () => {
    renderPage();
    for (const name of ["New", "Contacted", "Met", "Engaged", "Bid ready"]) {
      expect(
        screen.getByRole("region", { name: new RegExp(`^${name}`) }),
      ).toBeInTheDocument();
    }
    const closed = screen.getByRole("region", { name: /^Closed/ });
    expect(within(closed).getByText("Leo Grant")).toBeInTheDocument();
  });

  it("offers New prospect only to a role that may add one", () => {
    const { unmount } = renderPage();
    expect(
      screen.getByRole("button", { name: "New prospect" }),
    ).toBeInTheDocument();
    unmount();
    permissions.current = MEMBER.filter((key) => key !== "rush:add");
    renderPage();
    expect(
      screen.queryByRole("button", { name: "New prospect" }),
    ).not.toBeInTheDocument();
  });

  it("lets a card be dragged only by a role that may move prospects", () => {
    const { container, unmount } = renderPage();
    expect(
      container
        .querySelector('[data-rush-card="a"]')
        ?.getAttribute("draggable"),
    ).toBe("true");
    unmount();
    permissions.current = MEMBER.filter((key) => key !== "rush:add");
    const again = renderPage();
    expect(
      again.container
        .querySelector('[data-rush-card="a"]')
        ?.getAttribute("draggable"),
    ).toBe("false");
  });

  it("offers Move to in a card's menu only with rush:add", async () => {
    const user = userEvent.setup();
    const { unmount } = renderPage();
    await user.click(
      screen.getByRole("button", { name: "More for Jake Smith" }),
    );
    expect(await screen.findByRole("menuitem", { name: "Met" })).toBeVisible();
    await user.keyboard("{Escape}");
    unmount();
    permissions.current = MEMBER.filter((key) => key !== "rush:add");
    renderPage();
    await user.click(
      screen.getByRole("button", { name: "More for Jake Smith" }),
    );
    expect(await screen.findByRole("menuitem", { name: "Open" })).toBeVisible();
    expect(screen.queryByRole("menuitem", { name: "Met" })).toBeNull();
  });

  it("moves a card dropped on a working column at once", () => {
    const { container } = renderPage();
    const card = container.querySelector('[data-rush-card="a"]')!;
    const met = container.querySelector('[data-rush-column="met"]')!;
    fireEvent.dragStart(card);
    fireEvent.dragOver(met);
    fireEvent.drop(met);
    expect(moveMutate).toHaveBeenCalledWith(
      { candidateId: "a", stage: "met", closedReason: undefined },
      expect.anything(),
    );
  });

  it("asks why before closing a prospect, and cancelling leaves them put", async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    const card = container.querySelector('[data-rush-card="a"]')!;
    const closed = container.querySelector('[data-rush-column="closed"]')!;
    fireEvent.dragStart(card);
    fireEvent.dragOver(closed);
    fireEvent.drop(closed);
    const dialog = await screen.findByRole("dialog", {
      name: "Why is Jake Smith closed?",
    });
    expect(moveMutate).not.toHaveBeenCalled();
    expect(
      within(dialog).getByRole("button", { name: "Close prospect" }),
    ).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(moveMutate).not.toHaveBeenCalled();
  });

  it("closes a prospect with the reason picked", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(
      screen.getByRole("button", { name: "More for Jake Smith" }),
    );
    await user.click(await screen.findByRole("menuitem", { name: "Closed" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Why is Jake Smith closed?",
    });
    await user.click(within(dialog).getByRole("combobox", { name: "Reason" }));
    await user.click(
      await screen.findByRole("option", { name: "No response" }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Close prospect" }),
    );
    expect(moveMutate).toHaveBeenCalledWith(
      { candidateId: "a", stage: "closed", closedReason: "no_response" },
      expect.anything(),
    );
  });

  it("asks which Closed stage too when the folded column holds several", async () => {
    pipeline.current = {
      stages: [...STAGES, stage("dropped", "Dropped", "closed", 1)],
      tags: [],
      stale_days: 7,
      candidates: [candidate("a", "Jake Smith")],
    };
    const { container } = renderPage();
    fireEvent.dragStart(container.querySelector('[data-rush-card="a"]')!);
    const closed = container.querySelector('[data-rush-column="closed"]')!;
    fireEvent.dragOver(closed);
    fireEvent.drop(closed);
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("combobox", { name: "Stage" }),
    ).toBeInTheDocument();
  });

  it("names itself in the chapter's word when empty, with how to add one", () => {
    vocabulary.current = { vocabulary: { recruitment: "Intake" } };
    pipeline.current = {
      stages: STAGES,
      tags: [],
      stale_days: 7,
      candidates: [],
    };
    renderPage();
    expect(
      screen.getByText(
        "No prospects yet. Add one with New prospect, or type /intake add in chat.",
      ),
    ).toBeInTheDocument();
  });

  it("says the module is off rather than drawing a board", () => {
    moduleOn.current = false;
    renderPage();
    expect(
      screen.getByText("Rush is off for this chapter."),
    ).toBeInTheDocument();
  });

  it("shows the same prospects as a list", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("tab", { name: "List" }));
    const table = screen.getByRole("table");
    expect(within(table).getByText("Jake Smith")).toBeInTheDocument();
    expect(
      within(table).getByRole("columnheader", { name: /Rating/ }),
    ).toBeInTheDocument();
  });

  it("leaves the rating column out for a role that can't see results", async () => {
    permissions.current = MEMBER.filter((key) => key !== "rush:view_results");
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("tab", { name: "List" }));
    expect(
      screen.queryByRole("columnheader", { name: /Rating/ }),
    ).not.toBeInTheDocument();
  });
});

describe("follow-ups on the recruitment page (#5934)", () => {
  const due = (id: string, name: string, stageKey = "new") =>
    candidate(id, name, stageKey, {
      follow_up_on: TODAY,
      follow_up_note: "invite to house dinner",
      follow_up_user_id: "me",
      follow_up_user_name: "Chris Lee",
    });

  it("says how many follow-ups are due today for the viewer", () => {
    pipeline.current = {
      stages: STAGES,
      tags: [],
      stale_days: 7,
      candidates: [
        due("a", "Jake Smith"),
        candidate("b", "Owen Park", "contacted", {
          follow_up_on: shiftRushDayKey(TODAY, -2),
          follow_up_user_id: "me",
        }),
        // Someone else's, and one still ahead: not counted.
        candidate("c", "Leo Grant", "new", {
          follow_up_on: TODAY,
          follow_up_user_id: "u-2",
        }),
        candidate("d", "Ray Diaz", "new", {
          follow_up_on: shiftRushDayKey(TODAY, 3),
          follow_up_user_id: "me",
        }),
      ],
    };
    renderPage();
    expect(
      screen.getByText("4 prospects · 2 follow-ups due today"),
    ).toBeInTheDocument();
  });

  it("leaves the follow-ups off the count when none are due", () => {
    renderPage();
    expect(screen.getByText("2 prospects")).toBeInTheDocument();
  });

  it("opens on Follow up when the viewer has some, and All shows the rest", async () => {
    const user = userEvent.setup();
    pipeline.current = {
      stages: STAGES,
      tags: [],
      stale_days: 7,
      candidates: [
        due("a", "Jake Smith"),
        // Owned by the viewer and gone quiet: theirs to follow up.
        candidate("b", "Owen Park", "contacted", {
          owner_id: "me",
          owner_name: "Chris Lee",
          ...addedDaysAgo(9),
        }),
        candidate("c", "Leo Grant"),
      ],
    };
    renderPage();
    expect(screen.getByRole("tab", { name: "Follow up" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("Jake Smith")).toBeInTheDocument();
    expect(screen.getByText("Owen Park")).toBeInTheDocument();
    expect(screen.queryByText("Leo Grant")).toBeNull();
    await user.click(screen.getByRole("tab", { name: "All" }));
    expect(screen.getByText("Leo Grant")).toBeInTheDocument();
  });

  it("opens on All when the viewer has nothing to follow up", () => {
    renderPage();
    expect(screen.getByRole("tab", { name: "All" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("says what Follow up holds once it is empty", () => {
    pipeline.current = {
      stages: STAGES,
      tags: [],
      stale_days: 7,
      candidates: [due("a", "Jake Smith")],
    };
    const { rerender } = renderPage();
    pipeline.current = {
      stages: STAGES,
      tags: [],
      stale_days: 7,
      candidates: [candidate("a", "Jake Smith", "contacted")],
    };
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <RushPage />
      </QueryClientProvider>,
    );
    expect(screen.getByText(/^Nothing to follow up on\./)).toBeInTheDocument();
  });

  it("gives no Follow up switch to a role that can't work prospects", () => {
    permissions.current = MEMBER.filter((key) => key !== "rush:add");
    renderPage();
    expect(screen.queryByRole("tab", { name: "Follow up" })).toBeNull();
  });

  it("shows the owner and the follow-up on a card", () => {
    pipeline.current = {
      stages: STAGES,
      tags: [],
      stale_days: 7,
      candidates: [
        candidate("a", "Jake Smith", "new", {
          owner_id: "u-2",
          owner_name: "Ana Ruiz",
          follow_up_on: shiftRushDayKey(TODAY, 3),
          follow_up_user_id: "u-2",
        }),
        candidate("b", "Owen Park", "contacted", {
          follow_up_on: TODAY,
          follow_up_user_id: "u-2",
        }),
      ],
    };
    const { container } = renderPage();
    const card = container.querySelector('[data-rush-card="a"]')!;
    expect(card.textContent).toMatch(/Owned by Ana Ruiz · Follow-up /);
    const dueCard = container.querySelector('[data-rush-card="b"]')!;
    expect(dueCard.textContent).toContain("No owner");
    expect(dueCard.textContent).toContain("Follow-up today");
  });

  it("flags a prospect gone quiet, but never a closed one", () => {
    pipeline.current = {
      stages: STAGES,
      tags: [],
      stale_days: 7,
      candidates: [
        candidate("a", "Jake Smith", "new", addedDaysAgo(8)),
        candidate("b", "Owen Park", "new", addedDaysAgo(3)),
        candidate("c", "Leo Grant", "closed", {
          ...addedDaysAgo(30),
          follow_up_on: TODAY,
        }),
      ],
    };
    const { container } = renderPage();
    expect(
      container.querySelector('[data-rush-card="a"]')!.textContent,
    ).toContain("Needs follow-up");
    expect(
      container.querySelector('[data-rush-card="b"]')!.textContent,
    ).not.toContain("Needs follow-up");
    const closed = container.querySelector('[data-rush-card="c"]')!;
    expect(closed.textContent).not.toContain("Needs follow-up");
    expect(closed.textContent).not.toContain("Follow-up");
  });

  it("finds a prospect by name on the list", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("tab", { name: "List" }));
    await user.type(
      screen.getByRole("searchbox", { name: "Search prospects by name" }),
      "owe",
    );
    const table = screen.getByRole("table");
    expect(within(table).getByText("Owen Park")).toBeInTheDocument();
    expect(within(table).queryByText("Jake Smith")).toBeNull();
    await user.clear(
      screen.getByRole("searchbox", { name: "Search prospects by name" }),
    );
    await user.type(
      screen.getByRole("searchbox", { name: "Search prospects by name" }),
      "zzz",
    );
    expect(screen.getByText('No prospects match "zzz".')).toBeInTheDocument();
  });

  it("shows owner and follow-up columns on the list", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("tab", { name: "List" }));
    const table = screen.getByRole("table");
    expect(
      within(table).getByRole("columnheader", { name: /Owner/ }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole("columnheader", { name: /Follow-up/ }),
    ).toBeInTheDocument();
  });

  it("opens the prospect a notification links to", async () => {
    searchParams.current = new URLSearchParams("prospect=b");
    renderPage();
    expect(
      await screen.findByRole("heading", { name: "Owen Park" }),
    ).toBeInTheDocument();
    expect(screen.getByText("No contact logged yet")).toBeInTheDocument();
  });
});

describe("the recruitment page beside chat (2026-11-24)", () => {
  beforeEach(() => {
    narrowPane.current = null;
  });

  it("keeps the views as words when the pane has room", () => {
    renderPage();
    expect(screen.getByRole("tab", { name: "Board" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^View:/ }),
    ).not.toBeInTheDocument();
  });

  it("folds the views into one View menu on a narrow pane", async () => {
    narrowPane.current = true;
    const user = userEvent.setup();
    renderPage();
    expect(
      screen.queryByRole("tab", { name: "Board" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "View: Board" }));
    await user.click(screen.getByRole("menuitemradio", { name: "List" }));
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "View: List" }),
    ).toBeInTheDocument();
  });
});
