import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { permissions, pipeline, moveMutate, moduleOn, vocabulary } = vi.hoisted(
  () => ({
    permissions: { current: ["*"] as string[] },
    pipeline: { current: null as unknown },
    moveMutate: vi.fn(),
    moduleOn: { current: true },
    vocabulary: { current: undefined as unknown },
  }),
);

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

const candidate = (id: string, name: string, stageKey = "new") => ({
  id,
  display_name: name,
  user_id: null,
  stage: stageKey,
  closed_reason: null,
  bid_status: "none",
  created_by: "u-1",
  created_by_name: "Moiz Steenhuis",
  created_at: "2026-11-20T12:00:00Z",
  tag_ids: [],
  viewer_rating: null,
  viewer_has_voted: false,
});

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
  useSetRushCandidateTags: () => ({ change: vi.fn(), isPending: false }),
  useRushNotes: () => ({ data: [], isPending: false, isError: false }),
  useAddRushNote: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useEditRushNote: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteRushNote: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAddRushProspect: () => ({ mutateAsync: vi.fn(), isPending: false }),
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
    candidates: [
      candidate("a", "Jake Smith"),
      candidate("b", "Owen Park", "contacted"),
      candidate("c", "Leo Grant", "closed"),
    ],
  };
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
    pipeline.current = { stages: STAGES, tags: [], candidates: [] };
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
    await user.click(screen.getByRole("radio", { name: "List" }));
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
    await user.click(screen.getByRole("radio", { name: "List" }));
    expect(
      screen.queryByRole("columnheader", { name: /Rating/ }),
    ).not.toBeInTheDocument();
  });
});
