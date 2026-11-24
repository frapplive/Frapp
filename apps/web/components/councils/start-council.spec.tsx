import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/** Start a council (#5933; `school-layer.md` § 5.3). */
const mocks = vi.hoisted(() => ({
  schools: {
    data: [] as unknown[] | undefined,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  },
  memberships: [] as unknown[],
  create: vi.fn(),
  select: vi.fn(async () => true),
  replace: vi.fn(),
  composerRole: [] as unknown[],
}));

vi.mock("@repo/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/hooks")>()),
  useMySchools: () => mocks.schools,
  useAccessibleChapters: () => ({ data: mocks.memberships }),
  useCreateCouncil: () => ({ mutateAsync: mocks.create, isPending: false }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: vi.fn() }),
}));
vi.mock("@/lib/auth/select-chapter", () => ({
  useSelectChapter: () => mocks.select,
}));
vi.mock("@/components/backwork/bulk/use-confirm-drop-bulk-uploads", () => ({
  useConfirmDropBulkUploads: () => ({
    confirmDrop: async () => true,
    confirmDropDialog: null,
  }),
}));
vi.mock("@/components/members/invite-composer", () => ({
  InviteComposer: ({ role }: { role?: string }) => {
    mocks.composerRole.push(role);
    return <div>Invite composer</div>;
  },
}));
vi.mock("@/components/onboarding/school-step", () => ({
  SchoolStep: ({ doneLabel }: { doneLabel: string }) => (
    <div>School step, then {doneLabel}</div>
  ),
}));

import {
  StartCouncil,
  councilDraftProblem,
  councilNameValue,
  delegateRoleName,
  type CouncilDraft,
} from "./start-council";

const RPI = {
  id: "school-rpi",
  name: "Rensselaer Polytechnic Institute",
  short_name: "RPI",
  slug: "rpi",
  verifiable: true,
  email_domains: ["rpi.edu"],
};
const mine = (school = RPI) => ({
  school,
  status: "member",
  verified_email: "a@rpi.edu",
  verified_at: "2026-11-20T00:00:00Z",
});

const DRAFT: CouncilDraft = {
  schoolId: RPI.id,
  type: "ifc",
  name: null,
  titleKey: "president",
  customTitle: "",
  accepted: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.schools = {
    data: [mine()],
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  };
  mocks.memberships = [];
  mocks.composerRole = [];
  mocks.create.mockResolvedValue({ id: "council-1", name: "RPI IFC" });
});

describe("the council name", () => {
  it("offers the type's default at the school until the founder types one", () => {
    expect(councilNameValue(DRAFT, RPI)).toBe("RPI IFC");
    expect(councilNameValue({ ...DRAFT, type: "panhellenic" }, RPI)).toBe(
      "RPI Panhellenic",
    );
    expect(councilNameValue({ ...DRAFT, name: "" }, RPI)).toBe("");
    expect(councilNameValue({ ...DRAFT, type: null }, RPI)).toBe("");
  });
});

describe("councilDraftProblem", () => {
  it("names the first thing missing, in the form's order", () => {
    expect(councilDraftProblem({ ...DRAFT, type: null }, "x")?.field).toBe(
      "type",
    );
    expect(councilDraftProblem(DRAFT, "  ")?.field).toBe("name");
    expect(councilDraftProblem({ ...DRAFT, titleKey: null }, "x")?.field).toBe(
      "title",
    );
    expect(
      councilDraftProblem({ ...DRAFT, titleKey: "custom" }, "x")?.field,
    ).toBe("customTitle");
    expect(councilDraftProblem({ ...DRAFT, accepted: false }, "x")?.field).toBe(
      "terms",
    );
    expect(councilDraftProblem(DRAFT, "RPI IFC")).toBeNull();
  });
});

describe("delegateRoleName", () => {
  it("is the type's MEMBER floor, which setup invites join as", () => {
    expect(delegateRoleName("ifc")).toBe("Delegate");
    expect(delegateRoleName("nphc")).toBe("Delegate");
  });
});

describe("StartCouncil", () => {
  it("with no verified school, says so and leads to the school step", async () => {
    mocks.schools.data = [];
    render(<StartCouncil />);
    expect(
      screen.getByText("Starting a council takes a verified school email."),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Verify your school email" }),
    );
    expect(screen.getByText("School step, then Continue")).toBeInTheDocument();
  });

  it("offers a chapterless founder the chapter wizard, and a member the way back", () => {
    const { unmount } = render(<StartCouncil />);
    expect(
      screen.getByRole("link", { name: "Create a chapter" }),
    ).toHaveAttribute("href", "/chat?setup=chapter");
    unmount();
    mocks.memberships = [{ chapter_id: "c-1" }];
    render(<StartCouncil />);
    expect(screen.getByRole("link", { name: "Back to chat" })).toHaveAttribute(
      "href",
      "/chat",
    );
  });

  it("checks on Start, not per keystroke, and sends nothing incomplete", async () => {
    render(<StartCouncil />);
    expect(screen.queryByText("Pick a council type.")).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: "Start council" }),
    );
    expect(screen.getByText("Pick a council type.")).toBeInTheDocument();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("starts the council with the founder's own title, selects it, then invites delegates", async () => {
    const user = userEvent.setup();
    render(<StartCouncil />);
    expect(screen.getByText(RPI.name)).toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: "Council type" }));
    await user.click(
      await screen.findByRole("option", { name: /Panhellenic Council/ }),
    );
    expect(screen.getByLabelText("Council name")).toHaveValue(
      "RPI Panhellenic",
    );
    await user.click(screen.getByRole("combobox", { name: "Your title" }));
    await user.click(
      await screen.findByRole("option", { name: "Something else" }),
    );
    await user.type(
      screen.getByLabelText("Your title, as you'd write it"),
      "Recruitment Chair",
    );
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Start council" }));

    await waitFor(() =>
      expect(mocks.create).toHaveBeenCalledWith({
        school_id: RPI.id,
        council_type: "panhellenic",
        name: "RPI Panhellenic",
        title_key: "custom",
        custom_title: "Recruitment Chair",
        accept_terms_privacy: true,
      }),
    );
    expect(mocks.select).toHaveBeenCalledWith("council-1");
    expect(
      await screen.findByRole("heading", { name: "Invite your delegates" }),
    ).toBeInTheDocument();
    expect(mocks.composerRole.at(-1)).toBe("Delegate");
    await user.click(screen.getByRole("button", { name: "Skip for now" }));
    expect(mocks.replace).toHaveBeenCalledWith("/chat");
  });

  it("clears the title when the type changes, since each type seeds its own", async () => {
    const user = userEvent.setup();
    render(<StartCouncil />);
    await user.click(screen.getByRole("combobox", { name: "Council type" }));
    await user.click(
      await screen.findByRole("option", { name: /Interfraternity Council/ }),
    );
    await user.click(screen.getByRole("combobox", { name: "Your title" }));
    await user.click(
      await screen.findByRole("option", { name: "VP Recruitment" }),
    );
    await user.click(screen.getByRole("combobox", { name: "Council type" }));
    await user.click(
      await screen.findByRole("option", { name: /National Pan-Hellenic/ }),
    );
    expect(
      screen.getByRole("combobox", { name: "Your title" }),
    ).toHaveTextContent("Pick your title");
    await user.click(screen.getByRole("combobox", { name: "Your title" }));
    expect(
      await screen.findByRole("option", { name: "Parliamentarian" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "VP Recruitment" })).toBeNull();
  });

  it("shows the API's own sentence when the school already has that council", async () => {
    mocks.create.mockRejectedValue({
      code: "council.type_taken",
      message: "Rensselaer Polytechnic Institute already has an IFC in Frapp.",
    });
    const user = userEvent.setup();
    render(<StartCouncil />);
    await user.click(screen.getByRole("combobox", { name: "Council type" }));
    await user.click(
      await screen.findByRole("option", { name: /Interfraternity Council/ }),
    );
    await user.click(screen.getByRole("combobox", { name: "Your title" }));
    await user.click(await screen.findByRole("option", { name: "President" }));
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Start council" }));
    expect(
      await screen.findByText(
        "Rensselaer Polytechnic Institute already has an IFC in Frapp.",
      ),
    ).toBeInTheDocument();
    expect(mocks.select).not.toHaveBeenCalled();
  });
});
