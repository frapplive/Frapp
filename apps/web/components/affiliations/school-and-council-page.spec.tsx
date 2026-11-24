import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ChapterCouncilRow } from "@repo/hooks";

const state = vi.hoisted(() => ({
  permissions: ["*"] as readonly string[] | undefined,
  affiliations: {
    data: undefined as unknown,
    isPending: false,
    isError: false,
    error: null as unknown,
    refetch: vi.fn(),
  },
  schools: [] as unknown[],
  linkSchool: vi.fn(async () => ({})),
  decideSchool: vi.fn(async () => ({})),
  requestCouncil: vi.fn(async () => ({})),
  decideCouncil: vi.fn(async () => ({})),
  toast: vi.fn(),
}));

vi.mock("@repo/hooks", () => ({
  SCHOOL_SEARCH_MIN_LENGTH: 2,
  affiliationErrorCopy: (_e: unknown, fallback: string) => fallback,
  useChapterAffiliations: () => state.affiliations,
  useLinkChapterSchool: () => ({ mutateAsync: state.linkSchool }),
  useDecideChapterSchool: () => ({ mutateAsync: state.decideSchool }),
  useRequestCouncil: () => ({ mutateAsync: state.requestCouncil }),
  useDecideChapterCouncil: () => ({ mutateAsync: state.decideCouncil }),
  useSchoolSearch: (q: string) => ({
    data: q.length >= 2 ? state.schools : undefined,
    isPending: q.length < 2,
    isError: false,
  }),
}));
vi.mock("@repo/hooks/error-copy", () => ({
  describeLoadFailure: () => "Check your connection and try again.",
}));
vi.mock("@/lib/hooks/use-debounced-value", () => ({
  useDebouncedValue: (value: unknown) => value,
}));
vi.mock("@/lib/hooks/use-nav-permissions", () => ({
  useNavPermissions: () => state.permissions,
}));
vi.mock("@/lib/hooks/use-toast", () => ({
  useToast: () => ({ toast: state.toast }),
}));
vi.mock("@/lib/stores/chapter-store", () => ({
  useChapterStore: (select: (s: { activeChapterId: string }) => unknown) =>
    select({ activeChapterId: "chap-1" }),
}));

import {
  SchoolAndCouncilPage,
  councilRowStep,
} from "./school-and-council-page";

const RPI = {
  id: "rpi",
  name: "Rensselaer Polytechnic Institute",
  short_name: "RPI",
};

function school(status: "proposed" | "active", linkId = "school-link") {
  return { link_id: linkId, status, is_primary: true, school: RPI };
}

function council(
  id: string,
  name: string,
  link: ChapterCouncilRow["link"],
  overrides: Partial<ChapterCouncilRow["council"]> = {},
): ChapterCouncilRow {
  return {
    council: {
      id,
      name,
      council_type: "ifc",
      verified: true,
      school_id: "rpi",
      ...overrides,
    },
    link,
    offered: true,
  };
}

function link(
  id: string,
  status: NonNullable<ChapterCouncilRow["link"]>["status"],
  side: "council" | "chapter",
) {
  return {
    id,
    status,
    proposed_by_side: side,
    created_at: "2026-11-20T00:00:00Z",
    decided_at: null,
  };
}

function withData(data: unknown) {
  state.affiliations = {
    data,
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  };
}

beforeEach(() => {
  state.permissions = ["*"];
  state.schools = [];
  for (const fn of [
    state.linkSchool,
    state.decideSchool,
    state.requestCouncil,
    state.decideCouncil,
    state.toast,
  ]) {
    fn.mockClear();
  }
});

describe("councilRowStep", () => {
  it("offers each link's own next step", () => {
    expect(councilRowStep(council("c", "IFC", null))).toBe("ask");
    expect(
      councilRowStep(council("c", "IFC", link("l", "ended", "chapter"))),
    ).toBe("ask");
    expect(
      councilRowStep(council("c", "IFC", link("l", "proposed", "chapter"))),
    ).toBe("cancel");
    expect(
      councilRowStep(council("c", "IFC", link("l", "proposed", "council"))),
    ).toBe("answer");
    expect(
      councilRowStep(council("c", "IFC", link("l", "accepted", "council"))),
    ).toBe("leave");
    expect(
      councilRowStep(council("c", "IFC", link("l", "suspended", "chapter"))),
    ).toBe("leave");
  });
});

describe("SchoolAndCouncilPage", () => {
  it("with no school, searches and links the officer's pick", async () => {
    withData({ schools: [], councils: [] });
    state.schools = [
      { ...RPI, slug: "rpi", verifiable: true, email_domains: [] },
    ];
    const user = userEvent.setup();
    render(<SchoolAndCouncilPage />);
    expect(
      screen.getByText("Your chapter isn't linked to a school yet."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Confirm your school to see its councils."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Pick your school" }));
    expect(
      await screen.findByText("Type your school's name"),
    ).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText("Find your school"), "Rens");
    await user.click(
      await screen.findByText("Rensselaer Polytechnic Institute"),
    );
    expect(state.linkSchool).toHaveBeenCalledWith("rpi");
  });

  it("confirms or refuses a proposed school", async () => {
    withData({ schools: [school("proposed")], councils: [] });
    const user = userEvent.setup();
    render(<SchoolAndCouncilPage />);
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(state.decideSchool).toHaveBeenCalledWith({
      linkId: "school-link",
      status: "active",
    });
    await user.click(screen.getByRole("button", { name: "Not our school" }));
    expect(state.decideSchool).toHaveBeenLastCalledWith({
      linkId: "school-link",
      status: "declined",
    });
    // Councils wait for a confirmed school.
    expect(
      screen.getByText("Confirm your school to see its councils."),
    ).toBeInTheDocument();
  });

  it("unlinks a school only after a confirm that names the councils it ends", async () => {
    withData({ schools: [school("active")], councils: [] });
    const user = userEvent.setup();
    render(<SchoolAndCouncilPage />);
    expect(
      screen.getByText("No council at your school is on Frapp yet."),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", {
        name: "Actions for Rensselaer Polytechnic Institute",
      }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Unlink school" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(/also ends your chapter's council memberships/),
    ).toBeInTheDocument();
    expect(state.decideSchool).not.toHaveBeenCalled();
    await user.click(
      within(dialog).getByRole("button", { name: "Unlink school" }),
    );
    await waitFor(() =>
      expect(state.decideSchool).toHaveBeenCalledWith({
        linkId: "school-link",
        status: "ended",
      }),
    );
  });

  it("gives each council the step for its state", async () => {
    withData({
      schools: [school("active")],
      councils: [
        council("ifc", "RPI IFC", null),
        council(
          "pan",
          "RPI Panhellenic",
          link("l-pan", "proposed", "chapter"),
          {
            council_type: "panhellenic",
          },
        ),
        council("mgc", "RPI MGC", link("l-mgc", "proposed", "council"), {
          council_type: "mgc",
          verified: false,
        }),
        council("nphc", "RPI NPHC", link("l-nphc", "accepted", "chapter"), {
          council_type: "nphc",
        }),
      ],
    });
    const user = userEvent.setup();
    render(<SchoolAndCouncilPage />);

    expect(screen.getByText("Asked to join")).toBeInTheDocument();
    expect(screen.getByText("Invited")).toBeInTheDocument();
    expect(screen.getByText("Member")).toBeInTheDocument();
    expect(screen.getByText(/Not verified yet/)).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Ask to join: RPI IFC" }),
    );
    expect(state.requestCouncil).toHaveBeenCalledWith("ifc");

    await user.click(
      screen.getByRole("button", { name: "Cancel request: RPI Panhellenic" }),
    );
    expect(state.decideCouncil).toHaveBeenCalledWith({
      linkId: "l-pan",
      status: "ended",
    });

    await user.click(screen.getByRole("button", { name: "Accept: RPI MGC" }));
    expect(state.decideCouncil).toHaveBeenLastCalledWith({
      linkId: "l-mgc",
      status: "accepted",
    });
    await user.click(screen.getByRole("button", { name: "Decline: RPI MGC" }));
    expect(state.decideCouncil).toHaveBeenLastCalledWith({
      linkId: "l-mgc",
      status: "declined",
    });

    state.decideCouncil.mockClear();
    await user.click(
      screen.getByRole("button", { name: "Actions for RPI NPHC" }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Leave council" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(state.decideCouncil).not.toHaveBeenCalled();
    await user.click(
      within(dialog).getByRole("button", { name: "Leave council" }),
    );
    await waitFor(() =>
      expect(state.decideCouncil).toHaveBeenCalledWith({
        linkId: "l-nphc",
        status: "ended",
      }),
    );
  });

  it("is read-only for a viewer without chapter-config:manage", () => {
    state.permissions = ["chapter-config:view"];
    withData({
      schools: [school("active")],
      councils: [
        council("ifc", "RPI IFC", null),
        council("mgc", "RPI MGC", link("l-mgc", "proposed", "council")),
      ],
    });
    render(<SchoolAndCouncilPage />);
    expect(screen.getByText("RPI IFC")).toBeInTheDocument();
    expect(screen.getByText("Invited")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Ask to join/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Accept/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Actions for/ })).toBeNull();
  });

  it("hides the school search from a read-only viewer", () => {
    state.permissions = ["chapter-config:view"];
    withData({ schools: [], councils: [] });
    render(<SchoolAndCouncilPage />);
    expect(
      screen.queryByRole("button", { name: "Pick your school" }),
    ).toBeNull();
  });

  it("says a refused step through the affiliation copy", async () => {
    withData({
      schools: [school("active")],
      councils: [council("ifc", "RPI IFC", null)],
    });
    state.requestCouncil.mockRejectedValueOnce(new Error("refused"));
    const user = userEvent.setup();
    render(<SchoolAndCouncilPage />);
    await user.click(
      screen.getByRole("button", { name: "Ask to join: RPI IFC" }),
    );
    await waitFor(() =>
      expect(state.toast).toHaveBeenCalledWith({
        variant: "destructive",
        title: "Couldn't save that. Try again in a moment.",
      }),
    );
  });

  it("draws the error card when the read fails", () => {
    state.affiliations = {
      data: undefined,
      isPending: false,
      isError: true,
      error: new Error("down"),
      refetch: vi.fn(),
    };
    render(<SchoolAndCouncilPage />);
    expect(
      screen.getByText("Couldn't load your school and councils"),
    ).toBeInTheDocument();
  });
});
