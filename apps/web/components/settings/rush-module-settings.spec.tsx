import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { roles, tiers, mine, updateTier, saveStages, saveSettings } = vi.hoisted(
  () => ({
    saveSettings: vi.fn(),
    roles: { current: [] as Array<Record<string, unknown>> },
    tiers: { current: [] as Array<Record<string, unknown>> },
    mine: { permissions: ["*"] as string[] },
    updateTier: vi.fn(),
    saveStages: vi.fn(),
  }),
);

const ok = (data: unknown) => ({
  data,
  isPending: false,
  isError: false,
  isSuccess: true,
});

const reads = vi.hoisted(() => ({
  pipeline: [] as boolean[],
  settings: 0,
}));

vi.mock("@repo/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/hooks")>()),
  useRoles: () => ok(roles.current),
  useRoleTiers: () => ok(tiers.current),
  useMembers: () => ok([{ user_id: "me", role_ids: ["p"] }]),
  useMyPermissions: () => ok({ permissions: mine.permissions }),
  useViewerUserId: () => "me",
  useUpdateRole: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateRoleTier: () => ({ mutateAsync: updateTier, isPending: false }),
  useSaveRushStages: () => ({ mutate: saveStages, isPending: false }),
  useSaveRushSettings: () => ({ mutate: saveSettings, isPending: false }),
  useCreateRushTag: () => ({ mutateAsync: vi.fn() }),
  useRenameRushTag: () => ({ mutate: vi.fn() }),
  useDeleteRushTag: () => ({ mutateAsync: vi.fn() }),
  useRushPipeline: (options: { enabled?: boolean }) => {
    reads.pipeline.push(options.enabled !== false);
    return { data: undefined, isError: false };
  },
  useRushSettings: () => {
    reads.settings += 1;
    return { data: undefined };
  },
}));

vi.mock("@/lib/hooks/use-chapter-vocabulary", () => ({
  useChapterVocabulary: () => undefined,
}));

vi.mock("@/lib/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
  toast: vi.fn(),
}));

const { RushModuleSettings, RushNotesAccess } =
  await import("./rush-module-settings");
const { RushStageEditor, stagesBody } = await import("./rush-stage-editor");
const { RushStaleDaysRow } = await import("./rush-stale-days");

const stage = (key: string, label: string, category: string, position = 0) => ({
  id: `s-${key}`,
  chapter_id: "c",
  key,
  label,
  category: category as "new",
  position,
  hidden: false,
  created_at: "",
  updated_at: "",
});

const STAGES = [
  stage("new", "New", "new"),
  stage("contacted", "Contacted", "contacted"),
  stage("met", "Met", "met"),
  stage("engaged", "Engaged", "engaged"),
  stage("bid_ready", "Bid ready", "bid_ready"),
  stage("closed", "Closed", "closed"),
];

const TIERS = [
  { id: "t-exec", name: "Exec board", position: 1, permissions: [] },
  { id: "t-off", name: "Officers and chairs", position: 2, permissions: [] },
  { id: "t-mem", name: "Members", position: 3, permissions: [] },
];

beforeEach(() => {
  mine.permissions = ["*"];
  tiers.current = TIERS.map((tier) => ({ ...tier, permissions: [] }));
  roles.current = [
    {
      id: "p",
      name: "President",
      permissions: ["*"],
      tier_id: "t-exec",
      display_order: 0,
    },
  ];
  updateTier.mockReset();
  updateTier.mockResolvedValue({});
  saveStages.mockReset();
});

describe("the recruitment stage editor", () => {
  it("refuses to hide the last New stage, says why, and sends nothing", async () => {
    const user = userEvent.setup();
    render(<RushStageEditor stages={STAGES} canEdit />);
    await user.click(
      screen.getByRole("switch", { name: "Show New on the board" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "New needs at least one stage that isn't hidden.",
    );
    expect(saveStages).not.toHaveBeenCalled();
  });

  it("refuses two stages with one name", async () => {
    const user = userEvent.setup();
    render(<RushStageEditor stages={STAGES} canEdit />);
    const met = screen.getByRole("textbox", { name: "Rename Met" });
    await user.clear(met);
    await user.type(met, "contacted{Enter}");
    expect(screen.getByRole("alert")).toHaveTextContent(
      'Two stages are named "contacted".',
    );
    expect(saveStages).not.toHaveBeenCalled();
  });

  it("saves every stage, in order, once a rename passes", async () => {
    const user = userEvent.setup();
    render(<RushStageEditor stages={STAGES} canEdit />);
    const met = screen.getByRole("textbox", { name: "Rename Met" });
    await user.clear(met);
    await user.type(met, "Hung out{Enter}");
    expect(saveStages).toHaveBeenCalledTimes(1);
    const body = saveStages.mock.calls[0]![0] as Array<{
      id?: string;
      label: string;
    }>;
    expect(body.map((s) => s.label)).toEqual([
      "New",
      "Contacted",
      "Hung out",
      "Engaged",
      "Bid ready",
      "Closed",
    ]);
    expect(body[2]!.id).toBe("s-met");
  });

  it("adds a stage to a category without an id", async () => {
    const user = userEvent.setup();
    render(<RushStageEditor stages={STAGES} canEdit />);
    const met = screen.getByRole("region", { name: "Met" });
    await user.click(within(met).getByRole("button", { name: "Add a stage" }));
    await user.type(
      within(met).getByRole("textbox", { name: "New met stage" }),
      "Coffee{Enter}",
    );
    const body = saveStages.mock.calls[0]![0] as Array<{
      id?: string;
      label: string;
      category: string;
    }>;
    expect(body[3]).toEqual({
      label: "Coffee",
      category: "met",
      hidden: false,
    });
  });

  it("reorders a stage within its category from the keyboard", async () => {
    const user = userEvent.setup();
    const stages = [...STAGES, stage("coffee", "Coffee", "met", 1)];
    render(<RushStageEditor stages={stages} canEdit />);
    screen.getByRole("button", { name: "Reorder Coffee" }).focus();
    await user.keyboard("{ArrowUp}");
    const body = saveStages.mock.calls[0]![0] as Array<{
      id?: string;
      label: string;
    }>;
    expect(body.map((row) => row.label)).toEqual([
      "New",
      "Contacted",
      "Coffee",
      "Met",
      "Engaged",
      "Bid ready",
      "Closed",
    ]);
    expect(body.every((row) => row.id)).toBe(true);
  });

  it("holds a change made while a save is out, then sends it with the new stage's id", async () => {
    const user = userEvent.setup();
    render(<RushStageEditor stages={STAGES} canEdit />);
    const met = screen.getByRole("region", { name: "Met" });
    await user.click(within(met).getByRole("button", { name: "Add a stage" }));
    await user.type(
      within(met).getByRole("textbox", { name: "New met stage" }),
      "Coffee{Enter}",
    );
    expect(saveStages).toHaveBeenCalledTimes(1);
    // A second change before the first save returns waits for it.
    await user.click(
      screen.getByRole("switch", { name: "Show Engaged on the board" }),
    );
    expect(saveStages).toHaveBeenCalledTimes(1);
    const [, options] = saveStages.mock.calls[0]! as [
      unknown,
      { onSuccess: (saved: unknown) => void },
    ];
    options.onSuccess([...STAGES, stage("s_new", "Coffee", "met", 1)]);
    await screen.findByRole("switch", { name: "Show Engaged on the board" });
    expect(saveStages).toHaveBeenCalledTimes(2);
    const second = saveStages.mock.calls[1]![0] as Array<{
      id?: string;
      label: string;
      hidden: boolean;
    }>;
    expect(second.find((row) => row.label === "Coffee")?.id).toBe("s-s_new");
    expect(second.find((row) => row.label === "Engaged")?.hidden).toBe(true);
  });

  it("is read-only without rush:manage", () => {
    render(<RushStageEditor stages={STAGES} canEdit={false} />);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByRole("button", { name: "Add a stage" })).toBeNull();
    // The category's heading, then its one stage.
    expect(
      within(screen.getByRole("region", { name: "Bid ready" })).getAllByText(
        "Bid ready",
      ),
    ).toHaveLength(2);
  });

  it("keeps a stage's category when it builds the body", () => {
    expect(
      stagesBody([
        { rowKey: "x", label: " Closed ", category: "closed", hidden: false },
        {
          id: "s-new",
          rowKey: "s-new",
          label: "New",
          category: "new",
          hidden: true,
        },
      ]),
    ).toEqual([
      { id: "s-new", label: "New", category: "new", hidden: true },
      { label: "Closed", category: "closed", hidden: false },
    ]);
  });
});

describe("turning recruitment notes on", () => {
  it("says nobody can read notes and grants the top two tiers", async () => {
    const user = userEvent.setup();
    render(<RushNotesAccess canEditRoles />);
    expect(
      screen.getByText("Nobody can read recruitment notes yet."),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Let the top two tiers read them" }),
    );
    expect(updateTier).toHaveBeenCalledTimes(2);
    expect(updateTier).toHaveBeenCalledWith({
      id: "t-exec",
      body: { permissions: ["rush:read_notes"] },
    });
    expect(updateTier).toHaveBeenCalledWith({
      id: "t-off",
      body: { permissions: ["rush:read_notes"] },
    });
  });

  it("doesn't count the President's wildcard as anyone reading them", () => {
    render(<RushNotesAccess canEditRoles />);
    expect(
      screen.getByText("Nobody can read recruitment notes yet."),
    ).toBeInTheDocument();
  });

  it("goes away once both top tiers hold it", () => {
    tiers.current = TIERS.map((tier, index) => ({
      ...tier,
      permissions: index < 2 ? ["rush:read_notes"] : [],
    }));
    const { container } = render(<RushNotesAccess canEditRoles />);
    expect(container).toBeEmptyDOMElement();
  });

  it("goes away once a tier below the top two holds it", () => {
    tiers.current = TIERS.map((tier, index) => ({
      ...tier,
      permissions: index === 2 ? ["rush:read_notes"] : [],
    }));
    const { container } = render(<RushNotesAccess canEditRoles />);
    expect(container).toBeEmptyDOMElement();
  });

  it("stays after a grant that only half landed, and finishes it", async () => {
    // The first tier's write fails: the overlay toasts and doesn't throw.
    updateTier.mockRejectedValueOnce(new Error("offline"));
    const user = userEvent.setup();
    const view = render(<RushNotesAccess canEditRoles />);
    await user.click(
      screen.getByRole("button", { name: "Let the top two tiers read them" }),
    );
    tiers.current = TIERS.map((tier, index) => ({
      ...tier,
      permissions: index === 1 ? ["rush:read_notes"] : [],
    }));
    view.rerender(<RushNotesAccess canEditRoles />);
    expect(
      screen.getByText(
        "Only Officers and chairs can read recruitment notes so far.",
      ),
    ).toBeInTheDocument();
    updateTier.mockClear();
    await user.click(
      screen.getByRole("button", { name: "Let Exec board read them too" }),
    );
    expect(updateTier).toHaveBeenCalledTimes(1);
    expect(updateTier).toHaveBeenCalledWith({
      id: "t-exec",
      body: { permissions: ["rush:read_notes"] },
    });
  });

  it("goes away once a role outside the tiers holds it", () => {
    roles.current = [
      ...roles.current,
      {
        id: "r",
        name: "Recruitment chair",
        permissions: ["rush:read_notes"],
        tier_id: null,
        display_order: 1,
      },
    ];
    render(<RushNotesAccess canEditRoles />);
    expect(screen.queryByText(/Nobody can read/)).toBeNull();
  });

  it("is dimmed, with the reason, without roles:manage", () => {
    mine.permissions = ["members:view"];
    render(<RushNotesAccess canEditRoles={false} />);
    const button = screen.getByRole("button", {
      name: "Let the top two tiers read them",
    });
    expect(button).toBeDisabled();
    expect(
      screen.getByText("Your role can't change roles."),
    ).toBeInTheDocument();
  });

  it("is dimmed for an officer who can't hand out a key they don't hold", () => {
    mine.permissions = ["members:view", "roles:manage"];
    roles.current = [
      {
        id: "o",
        name: "Secretary",
        permissions: ["members:view", "roles:manage"],
        tier_id: "t-off",
        display_order: 0,
      },
    ];
    render(<RushNotesAccess canEditRoles />);
    expect(
      screen.getByRole("button", { name: "Let the top two tiers read them" }),
    ).toBeDisabled();
    expect(
      screen.getByText("Only the President can turn this on."),
    ).toBeInTheDocument();
  });
});

describe("the stale days (#5934)", () => {
  beforeEach(() => saveSettings.mockReset());

  it("reads as a sentence for a role that can't change it", () => {
    render(
      <ul>
        <RushStaleDaysRow staleDays={7} canEdit={false} />
      </ul>,
    );
    expect(
      screen.getByText("Needs follow-up after 7 days without a logged contact"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("saves a new number on Enter for rush:manage", async () => {
    const user = userEvent.setup();
    render(
      <ul>
        <RushStaleDaysRow staleDays={7} canEdit />
      </ul>,
    );
    const field = screen.getByRole("textbox", { name: /Days without/ });
    await user.clear(field);
    await user.type(field, "10{Enter}");
    expect(saveSettings).toHaveBeenCalledWith(
      { stale_days: 10 },
      expect.anything(),
    );
  });

  it("refuses a number outside 1 to 60 and sends nothing", async () => {
    const user = userEvent.setup();
    render(
      <ul>
        <RushStaleDaysRow staleDays={7} canEdit />
      </ul>,
    );
    const field = screen.getByRole("textbox", { name: /Days without/ });
    await user.clear(field);
    await user.type(field, "90{Enter}");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Pick from 1 to 60 days.",
    );
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it("puts the old number back on Escape", async () => {
    const user = userEvent.setup();
    render(
      <ul>
        <RushStaleDaysRow staleDays={7} canEdit />
      </ul>,
    );
    const field = screen.getByRole("textbox", { name: /Days without/ });
    await user.clear(field);
    await user.type(field, "12{Escape}");
    expect(field).toHaveValue("7");
    expect(saveSettings).not.toHaveBeenCalled();
  });
});

/**
 * The pipeline and recruitment settings routes refuse a viewer without
 * rush:view and a chapter with Recruitment off, so the Recruitment page
 * doesn't ask them (#6030).
 */
describe("the Recruitment page's reads", () => {
  it("asks for nothing while Recruitment is off", () => {
    reads.pipeline = [];
    reads.settings = 0;
    render(
      <RushModuleSettings
        moduleOn={false}
        canSeeWhoCan
        pageHref={(page) => `/settings?tab=rush&page=${page}`}
      />,
    );
    expect(reads.pipeline.every((enabled) => !enabled)).toBe(true);
    expect(reads.settings).toBe(0);
  });

  it("asks for nothing from a viewer without rush:view", () => {
    reads.pipeline = [];
    reads.settings = 0;
    mine.permissions = ["chapter-config:view", "members:view"];
    render(
      <RushModuleSettings
        moduleOn
        canSeeWhoCan
        pageHref={(page) => `/settings?tab=rush&page=${page}`}
      />,
    );
    expect(reads.pipeline.every((enabled) => !enabled)).toBe(true);
    expect(reads.settings).toBe(0);
    mine.permissions = ["*"];
  });
});
