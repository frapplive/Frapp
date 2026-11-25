import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const { roles, tiers, updateRole, updateTier, mine } = vi.hoisted(() => ({
  roles: {
    current: [] as Array<Record<string, unknown>>,
  },
  tiers: {
    current: [] as Array<Record<string, unknown>>,
  },
  updateRole: vi.fn(),
  updateTier: vi.fn(),
  mine: { permissions: ["*"] as string[] },
}));

const ok = (data: unknown) => ({
  data,
  isPending: false,
  isError: false,
  isSuccess: true,
});

vi.mock("@repo/hooks", () => ({
  useRoles: () => ok(roles.current),
  useRoleTiers: () => ok(tiers.current),
  useMembers: () => ok([{ user_id: "me", role_ids: ["p"] }]),
  useMyPermissions: () => ok({ permissions: mine.permissions }),
  useViewerUserId: () => "me",
  useUpdateRole: () => ({ mutateAsync: updateRole, isPending: false }),
  useUpdateRoleTier: () => ({ mutateAsync: updateTier, isPending: false }),
}));

vi.mock("@/lib/hooks/use-chapter-vocabulary", () => ({
  useChapterVocabulary: () => undefined,
}));

vi.mock("@/lib/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

const { ModuleSettingsPage } = await import("./module-settings-page");
const { PointsRules, ServiceHoursRules } = await import("./module-rules");
const { moduleSettingsFor } = await import("./settings-modules");

const hours = moduleSettingsFor("hours")!;

/** The Service hours page, or one of its pages (`?page=`). */
function renderHours(
  props: Partial<Parameters<typeof ModuleSettingsPage>[0]> = {},
) {
  return render(
    <ModuleSettingsPage
      module={hours}
      on
      canManage
      onToggle={vi.fn()}
      page={null}
      pageHref={(page) =>
        page ? `/settings?tab=hours&page=${page}` : "/settings?tab=hours"
      }
      canSeeWhoCan={false}
      {...props}
    />,
  );
}

/**
 * A module page (#4073) shows what is stored and read, for an officer setting
 * the module up for a 100-member chapter: the switch, the rules that save,
 * and who can do what, from the same roles the Roles page edits. Since #6030
 * it is in the settings-rows shape: Who can is a row per permission with its
 * answer, opening that permission's page.
 */
describe("a module page", () => {
  it("says what switching it off took away, and that nothing was deleted", () => {
    renderHours({ on: false });
    expect(
      screen.getByRole("switch", { name: "Service hours" }),
    ).not.toBeChecked();
    expect(screen.getByText(/^Off\./)).toHaveTextContent(
      /nothing was deleted/i,
    );
  });

  it("draws an always-on module locked, with no switch", () => {
    render(
      <ModuleSettingsPage
        module={moduleSettingsFor("chat")!}
        on
        canManage
        onToggle={vi.fn()}
        page={null}
        pageHref={() => "/settings?tab=chat"}
        canSeeWhoCan={false}
      />,
    );
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.getByText("Always on")).toBeInTheDocument();
  });

  it("answers each permission in its row, tiers first, leaving the President's wildcard out", () => {
    tiers.current = [
      {
        id: "t1",
        name: "Exec board",
        position: 1,
        permissions: ["service:approve"],
      },
      { id: "t3", name: "Members", position: 3, permissions: ["service:log"] },
    ];
    roles.current = [
      { id: "p", name: "President", permissions: ["*"], display_order: 0 },
      {
        id: "s",
        name: "Service Chair",
        color: "#3366ff",
        permissions: ["service:approve", "service:log"],
        display_order: 3,
        tier_id: "t3",
      },
      {
        id: "m",
        name: "Member",
        permissions: ["service:log"],
        display_order: 9,
        tier_id: "t3",
      },
    ];
    renderHours({ canSeeWhoCan: true });
    const list = screen.getByRole("list", { name: "Who can" });
    // The tier answers for its roles; a role shows on its own only where
    // it differs from its tier.
    const approve = within(list).getByRole("link", {
      name: /approve service hours/i,
    });
    expect(approve).toHaveTextContent("Exec board, Service Chair");
    expect(approve).not.toHaveTextContent("President");
    expect(approve).toHaveAttribute(
      "href",
      "/settings?tab=hours&page=can-service:approve",
    );
    const log = within(list).getByRole("link", { name: /^log service/i });
    expect(log).toHaveTextContent("Members");
    expect(log).not.toHaveTextContent("Service Chair");
    expect(
      screen.getByText("The President can do everything."),
    ).toBeInTheDocument();
  });

  it("says Only the President where no tier or role holds it", () => {
    tiers.current = [];
    roles.current = [
      { id: "p", name: "President", permissions: ["*"], display_order: 0 },
    ];
    renderHours({ canSeeWhoCan: true });
    expect(
      screen.getByRole("link", { name: /approve service hours/i }),
    ).toHaveTextContent("Only the President");
  });

  it("takes a permission from a tier with its switch on the permission's page", async () => {
    const user = userEvent.setup();
    updateTier.mockReset().mockResolvedValue(undefined);
    tiers.current = [
      { id: "t1", name: "Exec board", position: 1, permissions: [] },
      {
        id: "t2",
        name: "Officers",
        position: 2,
        permissions: ["service:approve", "service:log"],
      },
    ];
    roles.current = [
      { id: "p", name: "President", permissions: ["*"], display_order: 0 },
      {
        id: "s",
        name: "Service Chair",
        permissions: ["service:approve", "service:log"],
        display_order: 3,
        tier_id: "t2",
      },
    ];
    renderHours({
      canSeeWhoCan: true,
      canEditRoles: true,
      page: "can-service:approve",
    });
    expect(
      screen.getByRole("heading", { name: "Approve service hours" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Service hours" })).toHaveAttribute(
      "href",
      "/settings?tab=hours",
    );
    const officers = screen.getByRole("switch", { name: "Officers" });
    expect(officers).toBeChecked();
    expect(
      screen.getByRole("switch", { name: "Exec board" }),
    ).not.toBeChecked();
    await user.click(officers);
    expect(updateTier).toHaveBeenCalledWith({
      id: "t2",
      body: { permissions: ["service:log"] },
    });
  });

  it("adds a role from a list it can filter, leaving the President out", async () => {
    const user = userEvent.setup();
    updateRole.mockReset().mockResolvedValue(undefined);
    tiers.current = [];
    roles.current = [
      { id: "p", name: "President", permissions: ["*"], display_order: 0 },
      {
        id: "t",
        name: "Treasurer",
        permissions: ["service:log"],
        display_order: 2,
      },
      { id: "m", name: "Member", permissions: [], display_order: 9 },
    ];
    renderHours({
      canSeeWhoCan: true,
      canEditRoles: true,
      page: "can-service:approve",
    });
    await user.click(screen.getByRole("button", { name: "Add a role" }));
    expect(screen.queryByRole("option", { name: /president/i })).toBeNull();
    await user.type(screen.getByPlaceholderText("Find a role"), "trea");
    expect(screen.queryByRole("option", { name: "Member" })).toBeNull();
    await user.click(screen.getByRole("option", { name: "Treasurer" }));
    expect(updateRole).toHaveBeenCalledWith({
      id: "t",
      body: { permissions: ["service:log", "service:approve"] },
    });
  });

  it("locks a tier ranked at or above the caller's own, and says why", () => {
    mine.permissions = ["roles:manage", "service:approve", "members:view"];
    tiers.current = [
      { id: "t1", name: "Exec board", position: 1, permissions: [] },
      { id: "t2", name: "Officers", position: 2, permissions: [] },
    ];
    roles.current = [
      {
        id: "p",
        name: "Vice President",
        permissions: ["roles:manage", "service:approve"],
        display_order: 1,
        tier_id: "t1",
      },
    ];
    renderHours({
      canSeeWhoCan: true,
      canEditRoles: true,
      page: "can-service:approve",
    });
    expect(screen.getByRole("switch", { name: "Exec board" })).toBeDisabled();
    expect(
      screen.getByText("At or above your rank, so your role can't change it."),
    ).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Officers" })).toBeEnabled();
    mine.permissions = ["*"];
  });

  it("shows the module page for a permission that isn't this module's", () => {
    renderHours({ canSeeWhoCan: true, page: "can-events:create" });
    expect(
      screen.getByRole("switch", { name: "Service hours" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Create events" })).toBeNull();
  });
});

describe("Service hours rules", () => {
  it("saves a new point rate as the service config, and says what it means", async () => {
    const user = userEvent.setup();
    const onPatch = vi.fn().mockResolvedValue(undefined);
    render(
      <ServiceHoursRules
        minutesPerPoint={60}
        workflows={[{ key: "wf_hours_receipt", label: "x", enabled: true }]}
        canManage
        savingRate={false}
        savingWorkflows={false}
        onPatch={onPatch}
      />,
    );
    const rate = screen.getByLabelText(/minutes of service per point/i);
    await user.clear(rate);
    await user.type(rate, "30");
    expect(
      screen.getByText(/3-hour shift earns 6 points/i),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /save rate/i }));
    expect(onPatch).toHaveBeenCalledWith(
      { service: { minutes_per_point: 30 } },
      "Point rate saved",
    );
  });

  it("refuses an empty rate under the field instead of sending it", async () => {
    const user = userEvent.setup();
    const onPatch = vi.fn();
    render(
      <ServiceHoursRules
        minutesPerPoint={60}
        workflows={[]}
        canManage
        savingRate={false}
        savingWorkflows={false}
        onPatch={onPatch}
      />,
    );
    await user.clear(screen.getByLabelText(/minutes of service per point/i));
    await user.click(screen.getByRole("button", { name: /save rate/i }));
    expect(onPatch).not.toHaveBeenCalled();
    expect(screen.getByText("Enter a number.")).toBeInTheDocument();
  });

  it("saves the proof switch as the receipt workflow the API reads", async () => {
    const user = userEvent.setup();
    const onPatch = vi.fn().mockResolvedValue(undefined);
    render(
      <ServiceHoursRules
        minutesPerPoint={60}
        workflows={[{ key: "wf_hours_receipt", label: "x", enabled: true }]}
        canManage
        savingRate={false}
        savingWorkflows={false}
        onPatch={onPatch}
      />,
    );
    await user.click(screen.getByRole("switch", { name: /ask for proof/i }));
    expect(onPatch).toHaveBeenCalledWith(
      { workflows: [{ key: "wf_hours_receipt", enabled: false }] },
      "Proof is now optional",
    );
  });
});

describe("Points rules", () => {
  it("refuses a rate limit over the API's ceiling by name", async () => {
    const user = userEvent.setup();
    const onPatch = vi.fn();
    render(
      <PointsRules
        points={{
          adjustment_rate_limit_per_hour: 50,
          anomaly_threshold: 100,
          prediction_max_stake: 25,
        }}
        canManage
        saving={false}
        onPatch={onPatch}
      />,
    );
    const rate = screen.getByLabelText(/adjustments per officer each hour/i);
    await user.clear(rate);
    await user.type(rate, "5000");
    await user.click(screen.getByRole("button", { name: /save limits/i }));
    expect(onPatch).not.toHaveBeenCalled();
    expect(screen.getByText("Use 1,000 or less.")).toBeInTheDocument();
  });

  it("is read-only for a role that can't manage chapter config", () => {
    render(
      <PointsRules
        points={undefined}
        canManage={false}
        saving={false}
        onPatch={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/flag adjustments of/i)).toBeDisabled();
    expect(screen.queryByRole("button", { name: /save limits/i })).toBeNull();
  });
});
