/** @vitest-environment jsdom */
import React from "react";
import { act } from "react";
import { Alert } from "react-native";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { useRouter } from "expo-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FrappThemeProvider } from "@/lib/theme";
import { screenText } from "@/test/screen-text";

/**
 * A council's Activity tab is its home (#5933): it reads none of Activity's
 * routes, which refuse a council, and draws the council, its state, and the
 * first steps the viewer can take. Rendered through the tab's route file,
 * which lives under `app/` and so can't hold its own spec.
 */

const tenant = vi.hoisted(() => ({ council: true }));
vi.mock("@/lib/tenant-kind", () => ({
  useTenantKind: () => (tenant.council ? "council" : "chapter"),
  useIsCouncil: () => tenant.council,
  useServesChapterFeatures: () => !tenant.council,
}));

const reads = vi.hoisted(() => ({
  council: {
    data: undefined as unknown,
    isPending: false,
    isFetching: false,
    error: null as unknown,
  },
  permissions: undefined as string[] | undefined,
  activity: vi.fn(),
  chapters: {
    data: [] as unknown[] | undefined,
    isPending: false,
    isError: false,
    error: null as unknown,
  },
  candidates: [] as unknown[],
  chaptersEnabled: vi.fn(),
  candidatesEnabled: vi.fn(),
  decide: vi.fn(),
  invite: vi.fn(),
}));

vi.mock("@repo/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/hooks")>()),
  useActiveChapterId: () => "council-1",
  useCouncil: () => ({ ...reads.council, refetch: vi.fn() }),
  useMyPermissions: () => ({
    data: reads.permissions ? { permissions: reads.permissions } : undefined,
    isSuccess: reads.permissions !== undefined,
    refetch: vi.fn(),
  }),
  useCurrentChapter: () => ({ data: { kind: "council", name: "RPI IFC" } }),
  useActivity: (...args: unknown[]) => {
    reads.activity(...args);
    return { data: undefined };
  },
  useCouncilChapters: (options?: { enabled?: boolean }) => {
    reads.chaptersEnabled(options?.enabled);
    return {
      ...reads.chapters,
      isFetching: false,
      refetch: vi.fn(),
    };
  },
  useCouncilInviteCandidates: (options?: { enabled?: boolean }) => {
    reads.candidatesEnabled(options?.enabled);
    return {
      data: reads.candidates,
      isPending: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    };
  },
  useDecideCouncilChapter: () => ({ mutateAsync: reads.decide }),
  useInviteChapter: () => ({ mutateAsync: reads.invite }),
}));

import ActivityTab from "@/app/(app)/(tabs)/activity";
import { COUNCIL_CHAPTERS_COPY } from "@repo/validation";
import {
  currentItemMenu,
  dismissItemMenu,
  pickItemMenuAction,
} from "@/components/item-actions-menu";
import { COUNCIL_HOME_COPY } from "./home";

const IFC = {
  id: "council-1",
  name: "RPI IFC",
  council_type: "ifc",
  recruitment_model: "open_bidding",
  verified: false,
  school: {
    id: "s",
    name: "Rensselaer Polytechnic Institute",
    short_name: "RPI",
  },
};

function link(
  name: string,
  status: string,
  side: "council" | "chapter" = "council",
) {
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

const LINKS = [
  link("Sigma Chi", "proposed", "chapter"),
  link("Theta Xi", "accepted"),
  link("Acacia", "suspended"),
  link("Phi Gamma Delta", "proposed", "council"),
];

const mounted: ReactTestRenderer[] = [];

function render(): ReactTestRenderer {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <QueryClientProvider client={queryClient}>
        <FrappThemeProvider>
          <ActivityTab />
        </FrappThemeProvider>
      </QueryClientProvider>,
    );
  });
  mounted.push(tree);
  return tree;
}

function pressable(tree: ReactTestRenderer, label: string) {
  return tree.root
    .findAll(
      (node) =>
        typeof node.props.onPress === "function" &&
        screenTextOf(node).includes(label),
    )
    .at(-1);
}

function screenTextOf(node: ReactTestRenderer["root"]): string {
  return node
    .findAll((child) => (child.type as unknown) === "Text")
    .map((child) => JSON.stringify(child.props.children ?? ""))
    .join(" ");
}

beforeEach(() => {
  vi.clearAllMocks();
  tenant.council = true;
  reads.council = {
    data: IFC,
    isPending: false,
    isFetching: false,
    error: null,
  };
  reads.permissions = ["*"];
  reads.chapters = { data: [], isPending: false, isError: false, error: null };
  reads.candidates = [];
  reads.decide.mockResolvedValue({});
  reads.invite.mockResolvedValue({});
});

afterEach(() => {
  dismissItemMenu();
  act(() => {
    for (const tree of mounted.splice(0)) tree.unmount();
  });
});

describe("a council's Activity tab", () => {
  it("draws the council with its state first, and reads nothing of Activity's", () => {
    const text = screenText(render());
    expect(text).toContain("RPI IFC");
    expect(text).toContain("Interfraternity Council · RPI");
    expect(text).toContain(COUNCIL_HOME_COPY.notVerified);
    expect(reads.activity).not.toHaveBeenCalled();
  });

  it("says Verified once staff have verified it", () => {
    reads.council = { ...reads.council, data: { ...IFC, verified: true } };
    const text = screenText(render());
    expect(text).toContain(COUNCIL_HOME_COPY.verified);
    expect(text).not.toContain(COUNCIL_HOME_COPY.notVerified);
  });

  it("offers the Council admin both first steps, each to its screen", () => {
    const tree = render();
    expect(screenText(tree)).toContain(COUNCIL_HOME_COPY.getStarted);
    act(() => pressable(tree, COUNCIL_HOME_COPY.invite)!.props.onPress());
    expect(vi.mocked(useRouter)().push).toHaveBeenCalledWith("/invite");
    act(() => pressable(tree, COUNCIL_HOME_COPY.titles)!.props.onPress());
    expect(vi.mocked(useRouter)().push).toHaveBeenCalledWith("/chapter-roles");
  });

  it("gives a delegate Activity's empty line where the steps would be", () => {
    reads.permissions = ["members:view"];
    const text = screenText(render());
    expect(text).not.toContain(COUNCIL_HOME_COPY.getStarted);
    expect(text).not.toContain(COUNCIL_HOME_COPY.invite);
    expect(text).toContain("Nothing to do right now.");
  });

  it("draws neither steps nor the empty line until permissions answer", () => {
    reads.permissions = undefined;
    const text = screenText(render());
    expect(text).not.toContain(COUNCIL_HOME_COPY.getStarted);
    expect(text).not.toContain("Nothing to do right now.");
  });

  it("says a failed read in plain words, never as an empty council", () => {
    reads.council = {
      data: undefined,
      isPending: false,
      isFetching: false,
      error: new TypeError("Network request failed"),
    };
    const text = screenText(render());
    expect(text).toContain(COUNCIL_HOME_COPY.failed);
    expect(text).not.toContain(COUNCIL_HOME_COPY.notVerified);
  });
});

describe("a council's Chapters", () => {
  it("lists requests, members and invites for a manager, each chapter by its kind and school", () => {
    reads.chapters = { ...reads.chapters, data: LINKS };
    const text = screenText(render());
    const at = (needle: string) => text.indexOf(needle);
    expect(at(COUNCIL_CHAPTERS_COPY.requests)).toBeGreaterThan(-1);
    // What waits on you, then the members, then what waits on them.
    expect(at(COUNCIL_CHAPTERS_COPY.requests)).toBeLessThan(
      at(COUNCIL_CHAPTERS_COPY.members),
    );
    expect(at(COUNCIL_CHAPTERS_COPY.members)).toBeLessThan(
      at(COUNCIL_CHAPTERS_COPY.invited),
    );
    expect(at("Acacia")).toBeLessThan(at("Theta Xi"));
    expect(text).toContain("Suspended");
    expect(text).toContain("IFC Fraternity · Rensselaer Polytechnic Institute");
    expect(text).toContain(COUNCIL_CHAPTERS_COPY.invite);
  });

  it("accepts and declines a request from its row", async () => {
    reads.chapters = { ...reads.chapters, data: LINKS };
    const tree = render();
    await act(async () => {
      pressable(tree, COUNCIL_CHAPTERS_COPY.accept)!.props.onPress();
    });
    expect(reads.decide).toHaveBeenCalledWith({
      linkId: "link-Sigma Chi",
      status: "accepted",
    });
    await act(async () => {
      pressable(tree, COUNCIL_CHAPTERS_COPY.decline)!.props.onPress();
    });
    expect(reads.decide).toHaveBeenLastCalledWith({
      linkId: "link-Sigma Chi",
      status: "declined",
    });
  });

  it("opens a member's menu, and removes it only once confirmed", async () => {
    reads.chapters = { ...reads.chapters, data: LINKS };
    const tree = render();
    act(() => pressable(tree, "Theta Xi")!.props.onPress());
    expect(currentItemMenu()?.actions.map((a) => a.label)).toEqual([
      COUNCIL_CHAPTERS_COPY.suspend,
      COUNCIL_CHAPTERS_COPY.remove,
    ]);
    vi.mocked(Alert.alert).mockImplementationOnce((_title, _body, buttons) =>
      buttons?.at(-1)?.onPress?.(),
    );
    await act(async () => {
      pickItemMenuAction(COUNCIL_CHAPTERS_COPY.remove);
    });
    expect(vi.mocked(Alert.alert).mock.calls.at(-1)?.[0]).toBe(
      COUNCIL_CHAPTERS_COPY.removeTitle("Theta Xi"),
    );
    expect(reads.decide).toHaveBeenCalledWith({
      linkId: "link-Theta Xi",
      status: "ended",
    });
  });

  it("reinstates a suspended chapter, and cancels an invite", async () => {
    reads.chapters = { ...reads.chapters, data: LINKS };
    const tree = render();
    act(() => pressable(tree, "Acacia")!.props.onPress());
    await act(async () => {
      pickItemMenuAction(COUNCIL_CHAPTERS_COPY.reinstate);
    });
    expect(reads.decide).toHaveBeenCalledWith({
      linkId: "link-Acacia",
      status: "accepted",
    });
    act(() => pressable(tree, "Phi Gamma Delta")!.props.onPress());
    await act(async () => {
      pickItemMenuAction(COUNCIL_CHAPTERS_COPY.cancelInvite);
    });
    expect(reads.decide).toHaveBeenLastCalledWith({
      linkId: "link-Phi Gamma Delta",
      status: "ended",
    });
  });

  it("invites a chapter from the sheet, offered ones first", async () => {
    reads.candidates = [
      {
        chapter: {
          id: "zp",
          name: "Zeta Psi",
          org_archetype: null,
          university: "RPI",
        },
        offered: false,
      },
      {
        chapter: {
          id: "ac",
          name: "Alpha Chi Rho",
          org_archetype: "ifc",
          university: "RPI",
        },
        offered: true,
      },
    ];
    const tree = render();
    const sheet = tree.root.findAll(
      (node) =>
        node.props.title === COUNCIL_CHAPTERS_COPY.invite &&
        Array.isArray(node.props.options),
    )[0]!;
    expect(sheet.props.options.map((o: { label: string }) => o.label)).toEqual([
      "Alpha Chi Rho",
      "Zeta Psi",
    ]);
    await act(async () => {
      sheet.props.onSelect("ac");
    });
    expect(reads.invite).toHaveBeenCalledWith("ac");
  });

  it("says the school has no one to invite on the invite row", () => {
    const text = screenText(render());
    expect(text).toContain(COUNCIL_CHAPTERS_COPY.noCandidates);
    expect(text).toContain(COUNCIL_CHAPTERS_COPY.empty);
    expect(text).toContain(COUNCIL_CHAPTERS_COPY.emptyBody);
  });

  it("shows a delegate the members and invites, with nothing to act on and no requests", () => {
    reads.permissions = ["members:view"];
    reads.chapters = { ...reads.chapters, data: LINKS };
    const tree = render();
    const text = screenText(tree);
    expect(text).toContain("Theta Xi");
    expect(text).not.toContain("Sigma Chi");
    expect(text).not.toContain(COUNCIL_CHAPTERS_COPY.requests);
    expect(text).not.toContain(COUNCIL_CHAPTERS_COPY.invite);
    expect(text).not.toContain(COUNCIL_CHAPTERS_COPY.emptyBody);
    expect(pressable(tree, "Theta Xi")).toBeUndefined();
    expect(reads.candidatesEnabled).toHaveBeenLastCalledWith(false);
  });

  it("reads nothing for a viewer without members:view, or before permissions answer", () => {
    reads.permissions = [];
    let text = screenText(render());
    expect(text).not.toContain(COUNCIL_CHAPTERS_COPY.members);
    expect(reads.chaptersEnabled).toHaveBeenLastCalledWith(false);
    reads.permissions = undefined;
    text = screenText(render());
    expect(text).not.toContain(COUNCIL_CHAPTERS_COPY.members);
    expect(reads.chaptersEnabled).toHaveBeenLastCalledWith(false);
  });

  it("says a failed read in plain words, never as an empty list", () => {
    reads.chapters = {
      data: undefined,
      isPending: false,
      isError: true,
      error: new TypeError("Network request failed"),
    };
    const text = screenText(render());
    expect(text).toContain(COUNCIL_CHAPTERS_COPY.loadFailedTitle);
    expect(text).not.toContain(COUNCIL_CHAPTERS_COPY.empty);
  });

  it("says a refused step in the API's words", async () => {
    reads.chapters = { ...reads.chapters, data: LINKS };
    reads.decide.mockRejectedValueOnce({
      code: "affiliation.invalid_transition",
      message: "That chapter already answered.",
    });
    const tree = render();
    await act(async () => {
      pressable(tree, COUNCIL_CHAPTERS_COPY.accept)!.props.onPress();
    });
    expect(screenText(tree)).toContain("That chapter already answered.");
  });
});
