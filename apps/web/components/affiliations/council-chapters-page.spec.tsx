import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CouncilChapterRow } from "@repo/hooks";

const state = vi.hoisted(() => ({
  permissions: ["*"] as readonly string[] | undefined,
  chapters: {
    data: [] as unknown[] | undefined,
    isPending: false,
    isError: false,
    error: null as unknown,
    refetch: vi.fn(),
  },
  candidates: { data: [] as unknown[], isPending: false, isError: false },
  council: { verified: true } as { verified: boolean } | undefined,
  decide: vi.fn(async () => ({})),
  invite: vi.fn(async () => ({})),
  toast: vi.fn(),
}));

vi.mock("@repo/hooks", async () => {
  const actual =
    await vi.importActual<typeof import("@repo/hooks")>("@repo/hooks");
  return {
    chapterListingLine: actual.chapterListingLine,
    groupCouncilChapters: actual.groupCouncilChapters,
    affiliationErrorCopy: (_e: unknown, fallback: string) => fallback,
    useCouncil: () => ({ data: state.council }),
    useCouncilChapters: () => state.chapters,
    useCouncilInviteCandidates: () => state.candidates,
    useDecideCouncilChapter: () => ({ mutateAsync: state.decide }),
    useInviteChapter: () => ({ mutateAsync: state.invite }),
  };
});
vi.mock("@/lib/hooks/use-tenant-kind", () => ({
  useTenantKind: () => "council",
}));
vi.mock("@repo/hooks/error-copy", () => ({
  describeLoadFailure: () => "Check your connection and try again.",
}));
vi.mock("@/lib/hooks/use-nav-permissions", () => ({
  useNavPermissions: () => state.permissions,
}));
vi.mock("@/lib/hooks/use-toast", () => ({
  useToast: () => ({ toast: state.toast }),
}));
vi.mock("@/lib/stores/chapter-store", () => ({
  useChapterStore: (select: (s: { activeChapterId: string }) => unknown) =>
    select({ activeChapterId: "council-1" }),
}));

import { CouncilChaptersPage } from "./council-chapters-page";

function row(
  id: string,
  name: string,
  status: CouncilChapterRow["link"]["status"],
  side: "council" | "chapter" = "council",
): CouncilChapterRow {
  return {
    link: {
      id: `link-${id}`,
      status,
      proposed_by_side: side,
      created_at: "2026-11-20T00:00:00Z",
      decided_at: null,
    },
    chapter: {
      id,
      name,
      org_archetype: "ifc",
      university: "Rensselaer Polytechnic Institute",
    },
  };
}

const ROWS = [
  row("a", "Phi Gamma Delta", "accepted"),
  row("b", "Sigma Chi", "suspended"),
  row("c", "Theta Xi", "proposed", "chapter"),
  row("d", "Delta Upsilon", "proposed", "council"),
  row("e", "Pi Kappa Alpha", "declined"),
  row("f", "Chi Phi", "ended"),
];

beforeEach(() => {
  state.permissions = ["*"];
  state.chapters = {
    data: ROWS,
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  };
  state.council = { verified: true };
  state.decide.mockClear();
  state.invite.mockClear();
  state.toast.mockClear();
});

describe("CouncilChaptersPage", () => {
  it("gives a chapters manager every section, and the chapter's listing only", () => {
    render(<CouncilChaptersPage />);
    expect(
      screen.getByRole("heading", { name: "Waiting on you" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Member chapters" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Invited" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Invite a chapter" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Suspended")).toBeInTheDocument();
    expect(
      screen.getAllByText("IFC Fraternity · Rensselaer Polytechnic Institute")
        .length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText("Pi Kappa Alpha")).not.toBeInTheDocument();
    expect(screen.queryByText("Chi Phi")).not.toBeInTheDocument();
  });

  it("accepts and declines a request, and cancels an invite", async () => {
    const user = userEvent.setup();
    render(<CouncilChaptersPage />);
    await user.click(screen.getByRole("button", { name: "Accept: Theta Xi" }));
    expect(state.decide).toHaveBeenCalledWith({
      linkId: "link-c",
      status: "accepted",
    });
    await user.click(screen.getByRole("button", { name: "Decline: Theta Xi" }));
    expect(state.decide).toHaveBeenLastCalledWith({
      linkId: "link-c",
      status: "declined",
    });
    await user.click(
      screen.getByRole("button", { name: "Cancel invite: Delta Upsilon" }),
    );
    expect(state.decide).toHaveBeenLastCalledWith({
      linkId: "link-d",
      status: "ended",
    });
  });

  it("removes a member chapter only after the confirm", async () => {
    const user = userEvent.setup();
    render(<CouncilChaptersPage />);
    await user.click(
      screen.getByRole("button", { name: "Actions for Phi Gamma Delta" }),
    );
    expect(
      await screen.findByRole("menuitem", { name: "Suspend" }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("menuitem", { name: "Remove from council" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(state.decide).not.toHaveBeenCalled();
    await user.click(
      within(dialog).getByRole("button", { name: "Remove from council" }),
    );
    await waitFor(() =>
      expect(state.decide).toHaveBeenCalledWith({
        linkId: "link-a",
        status: "ended",
      }),
    );
  });

  it("reinstates a suspended chapter from its menu", async () => {
    const user = userEvent.setup();
    render(<CouncilChaptersPage />);
    await user.click(
      screen.getByRole("button", { name: "Actions for Sigma Chi" }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Reinstate" }),
    );
    expect(state.decide).toHaveBeenCalledWith({
      linkId: "link-b",
      status: "accepted",
    });
  });

  it("says a failed step in plain words", async () => {
    state.decide.mockRejectedValueOnce(new Error("boom"));
    const user = userEvent.setup();
    render(<CouncilChaptersPage />);
    await user.click(screen.getByRole("button", { name: "Accept: Theta Xi" }));
    await waitFor(() =>
      expect(state.toast).toHaveBeenCalledWith({
        variant: "destructive",
        title: "Couldn't update that chapter. Try again in a moment.",
      }),
    );
  });

  it("gives a delegate the member chapters alone, read-only", () => {
    state.permissions = ["members:view"];
    render(<CouncilChaptersPage />);
    expect(screen.getByText("Phi Gamma Delta")).toBeInTheDocument();
    expect(screen.queryByText("Theta Xi")).not.toBeInTheDocument();
    expect(screen.queryByText("Delta Upsilon")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Invite a chapter" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Actions for/ }),
    ).not.toBeInTheDocument();
  });

  it("keeps the layout at zero, with the way in for a manager", () => {
    state.chapters.data = [];
    state.council = { verified: false };
    render(<CouncilChaptersPage />);
    expect(
      screen.getByRole("heading", { name: "Member chapters" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/^No chapters yet\. Invite/)).toBeInTheDocument();
    expect(screen.getByText(/isn't verified yet/)).toBeInTheDocument();
  });

  it("draws the error card with a retry when the list can't load", async () => {
    state.chapters = {
      data: undefined,
      isPending: false,
      isError: true,
      error: new Error("down"),
      refetch: vi.fn(),
    };
    const user = userEvent.setup();
    render(<CouncilChaptersPage />);
    expect(screen.getByText("Couldn't load your chapters")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(state.chapters.refetch).toHaveBeenCalled();
  });
});
