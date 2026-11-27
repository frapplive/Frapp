import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { networkMock } from "@/tests/network";

/**
 * The Roles pages (#3990; in the settings-row shape since #6029), walked as
 * an officer of a chapter with tiers: the groups of tiers and their roles, a
 * tier's page (name, @mention, roles in it, switches, its ⋯), and a role's
 * own page. The rank rules (#4071) are mirrored only to disable controls the API
 * would refuse, so the tests pin which controls are live for whom.
 */

const h = vi.hoisted(() => ({
  offline: { value: false },
  roles: [] as Array<Record<string, unknown>>,
  tiers: [] as Array<Record<string, unknown>>,
  members: [] as Array<Record<string, unknown>>,
  mine: ["*"] as string[],
  // `null` is a server without AI; an object is one that has it.
  aiConsent: null as object | null,
  vocabulary: undefined as { vocabulary: Record<string, string> } | undefined,
  updateRole: vi.fn(),
  createRole: vi.fn(),
  deleteRole: vi.fn(),
  updateTier: vi.fn(),
  createTier: vi.fn(),
  deleteTier: vi.fn(),
  reorderTiers: vi.fn(),
  push: vi.fn(),
}));

const ok = (data: unknown) => ({
  data,
  error: null,
  isPending: false,
  isError: false,
  isSuccess: true,
  refetch: vi.fn(),
});
const mutation = (fn: ReturnType<typeof vi.fn>) => ({
  mutateAsync: fn,
  isPending: false,
});

vi.mock("@/lib/providers/network-provider", () => networkMock(h.offline));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: h.push }),
  usePathname: () => "/settings",
  useSearchParams: () => new URLSearchParams("tab=roles&role=brother"),
}));
vi.mock("@repo/hooks", async (importOriginal) => {
  // The real rule (#4504), fed whether this server has AI from `h`.
  const { isPermissionHidden } =
    await importOriginal<typeof import("@repo/hooks")>();
  return {
    useAiConsent: () => ({ data: h.aiConsent }),
    aiAvailableFrom: (consent: { data: object | null | undefined }) =>
      consent.data === undefined ? undefined : consent.data !== null,
    useIsPermissionHidden: () => (permission: string) =>
      isPermissionHidden(
        permission,
        h.aiConsent === undefined ? undefined : h.aiConsent !== null,
      ),
    useRoles: () => ok(h.roles),
    useRoleTiers: () => ok(h.tiers),
    useMembers: () => ok(h.members),
    useMyPermissions: () => ok({ permissions: h.mine }),
    useViewerUserId: () => "me",
    useViewerDisplayName: () => "Me",
    useChapterRoleColors: () => [],
    useUpdateRole: () => mutation(h.updateRole),
    useCreateRole: () => mutation(h.createRole),
    useDeleteRole: () => mutation(h.deleteRole),
    useUpdateRoleTier: () => mutation(h.updateTier),
    useCreateRoleTier: () => mutation(h.createTier),
    useDeleteRoleTier: () => mutation(h.deleteTier),
    useReorderRoleTiers: () => mutation(h.reorderTiers),
  };
});
vi.mock("@/lib/hooks/use-chapter-vocabulary", () => ({
  useChapterVocabulary: () => h.vocabulary,
}));
vi.mock("@/lib/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

import { RolesOverview } from "@/components/roles/roles-overview";
import { TierPermissionsPage } from "@/components/roles/tier-permissions-page";
import { RolePage } from "@/components/roles/role-page";
import { useChapterStore } from "@/lib/stores/chapter-store";
import { useRolePreviewStore } from "@/lib/stores/role-preview-store";

const EXEC = {
  id: "t1",
  name: "Exec board",
  position: 1,
  permissions: ["members:view", "roles:manage", "service:approve"],
};
const OFFICERS = {
  id: "t2",
  name: "Officers and chairs",
  position: 2,
  permissions: ["members:view", "service:approve"],
};
const MEMBERS = {
  id: "t3",
  name: "Members",
  position: 3,
  permissions: ["members:view"],
};

const role = (
  id: string,
  name: string,
  tier: string | null,
  permissions: string[],
  extra: Record<string, unknown> = {},
) => ({
  id,
  name,
  tier_id: tier,
  permissions,
  permission_overrides: {},
  is_system: false,
  display_order: 1,
  color: null,
  ...extra,
});

function chapter() {
  h.tiers = [EXEC, OFFICERS, MEMBERS];
  h.roles = [
    role("pres", "President", "t1", ["*"], { is_system: true }),
    role("vp", "Vice President", "t1", EXEC.permissions),
    role(
      "treas",
      "Treasurer",
      "t2",
      [...OFFICERS.permissions, "events:create"],
      {
        permission_overrides: { "events:create": true },
      },
    ),
    role("brother", "Brothers", "t3", MEMBERS.permissions),
    role("alum", "Alumni", null, []),
    role("everyone", "Everyone", null, ["members:view"], {
      is_system: true,
      system_key: "EVERYONE",
    }),
    role("cabinet", "Cabinet", null, ["channels:read:cabinet"]),
  ];
  h.members = [
    { user_id: "me", role_ids: ["pres"] },
    { user_id: "u2", role_ids: ["brother"] },
    { user_id: "u3", role_ids: ["brother", "treas"] },
  ];
  h.mine = ["*"];
}

beforeEach(() => {
  vi.clearAllMocks();
  h.offline.value = false;
  h.vocabulary = undefined;
  for (const fn of [
    h.updateRole,
    h.createRole,
    h.deleteRole,
    h.updateTier,
    h.createTier,
    h.deleteTier,
    h.reorderTiers,
  ]) {
    fn.mockResolvedValue({});
  }
  chapter();
  useChapterStore.setState({ activeChapterId: "c1" });
  useRolePreviewStore.setState({ preview: null });
});

const BACK = "/settings?tab=roles";
const LINKS = {
  tier: (id: string) => `${BACK}&tier=${id}`,
  role: (id: string) => `${BACK}&role=${id}`,
};

function overview(query = "") {
  const onOpenRole = vi.fn();
  render(<RolesOverview query={query} links={LINKS} onOpenRole={onOpenRole} />);
  return { onOpenRole };
}

function tierPage(tierId: string) {
  const onDeleted = vi.fn();
  render(
    <TierPermissionsPage
      tierId={tierId}
      backHref={BACK}
      roleHref={LINKS.role}
      onDeleted={onDeleted}
    />,
  );
  return { onDeleted };
}

function rolePage(roleId: string) {
  const onDeleted = vi.fn();
  render(<RolePage roleId={roleId} backHref={BACK} onDeleted={onDeleted} />);
  return { onDeleted };
}

/** A settings group, named by its heading. */
const group = (name: string) => screen.getByRole("list", { name });

/** Opens a role's permission picker and returns its three answers. */
async function openPick(
  user: ReturnType<typeof userEvent.setup>,
  name: RegExp,
) {
  await user.click(screen.getByRole("combobox", { name }));
  return screen.getByRole("listbox");
}

/** Make the caller the Vice President: Exec board, not the President. */
function asVicePresident() {
  h.members = [{ user_id: "me", role_ids: ["vp"] }];
  h.mine = EXEC.permissions;
}

const pickable = () =>
  role("im", "Intramurals", null, [], { self_assignable: true });

describe("the tier list", () => {
  it("shows the tiers in order with their roles, then the roles outside them", () => {
    overview();
    const headings = screen
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent);
    expect(headings).toEqual([
      "Exec board",
      "Officers and chairs",
      "Members",
      "Outside the tiers",
      "Non-chapter business",
    ]);
    const members = group("Members");
    expect(
      within(members).getByRole("link", { name: /^Brothers/ }),
    ).toHaveTextContent("2 members");
    expect(group("Outside the tiers")).toHaveTextContent("Alumni");
    expect(screen.getByText("Can do everything")).toBeInTheDocument();
    expect(screen.getByText("Pinged as @everyone")).toBeInTheDocument();
  });

  it("leads each tier with its Permissions row, counting what's on", () => {
    overview();
    const permissions = within(group("Officers and chairs")).getByRole("link", {
      name: /^Permissions/,
    });
    expect(permissions).toHaveTextContent("2 on");
    expect(permissions).toHaveAttribute("href", LINKS.tier("t2"));
  });

  it("lists the roles members pick themselves under Non-chapter business (#4958)", () => {
    h.roles = [...h.roles, pickable()];
    overview();
    expect(group("Non-chapter business")).toHaveTextContent("Intramurals");
    expect(group("Outside the tiers")).not.toHaveTextContent("Intramurals");
  });

  it("offers no move into a tier on a Non-chapter business role", async () => {
    h.roles = [...h.roles, pickable()];
    const user = userEvent.setup();
    overview();
    await user.click(
      screen.getByRole("button", { name: "More for Intramurals" }),
    );
    expect(screen.queryByRole("menuitem", { name: "Exec board" })).toBeNull();
    expect(
      screen.queryByRole("menuitem", { name: "Outside the tiers" }),
    ).toBeNull();
    expect(
      screen.getByRole("menuitem", { name: "Delete role" }),
    ).toBeInTheDocument();
  });

  // #5736: the section adds its own role, already pickable, and opens it.
  it("adds a Non-chapter business role already pickable, then opens it", async () => {
    h.createRole.mockResolvedValue({ id: "new-im" });
    const user = userEvent.setup();
    const { onOpenRole } = overview();
    const business = group("Non-chapter business");
    expect(business).toHaveTextContent("None yet");
    await user.click(
      within(business).getByRole("button", { name: "Add role" }),
    );
    await user.type(
      within(business).getByRole("textbox", {
        name: "New Non-chapter business role",
      }),
      "Intramural soccer{Enter}",
    );
    expect(h.createRole).toHaveBeenCalledWith({
      name: "Intramural soccer",
      permissions: [],
      tier_id: null,
      self_assignable: true,
    });
    expect(onOpenRole).toHaveBeenCalledWith("new-im");
  });

  it("offers no Add role under Non-chapter business to a roles manager outside the tiers", () => {
    h.members = [{ user_id: "me", role_ids: ["alum"] }];
    h.mine = ["roles:manage", "members:view"];
    overview();
    expect(
      within(group("Non-chapter business")).queryByRole("button", {
        name: "Add role",
      }),
    ).toBeNull();
  });

  it("keeps Add role under Non-chapter business once it has roles", () => {
    h.roles = [...h.roles, pickable()];
    overview();
    expect(
      within(group("Non-chapter business")).getByRole("button", {
        name: "Add role",
      }),
    ).toBeInTheDocument();
  });

  it("hides an empty Non-chapter business from a member who can't manage roles", () => {
    h.members = [{ user_id: "me", role_ids: ["brother"] }];
    h.mine = MEMBERS.permissions;
    overview();
    expect(
      screen.queryByRole("heading", { name: "Non-chapter business" }),
    ).toBeNull();
    // Nor any writes: no Add role, Add tier, or ⋯.
    expect(screen.queryByRole("button", { name: "Add role" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add tier" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^More for/ })).toBeNull();
  });

  it("uses the chapter's own word for a tier", async () => {
    h.vocabulary = { vocabulary: { tier: "Level" } };
    const user = userEvent.setup();
    overview();
    expect(
      screen.getByRole("heading", { name: "Outside the levels" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Rank below every level, like alumni or advisors."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add level" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "More for Brothers" }));
    expect(
      screen.getByRole("menuitem", { name: "Outside the levels" }),
    ).toBeInTheDocument();
  });

  it("links a tier's permissions and a role's page", () => {
    overview();
    const officers = group("Officers and chairs");
    expect(
      within(officers).getByRole("link", { name: /^Permissions/ }),
    ).toHaveAttribute("href", "/settings?tab=roles&tier=t2");
    expect(
      within(officers).getByRole("link", { name: /^Treasurer/ }),
    ).toHaveAttribute("href", "/settings?tab=roles&role=treas");
  });

  it("adds a role into a tier, taking the tier's permissions", async () => {
    const user = userEvent.setup();
    overview();
    const officers = group("Officers and chairs");
    await user.click(
      within(officers).getByRole("button", { name: "Add role" }),
    );
    await user.type(
      within(officers).getByRole("textbox", { name: "New role name" }),
      "Social chair{Enter}",
    );
    expect(h.createRole).toHaveBeenCalledWith({
      name: "Social chair",
      permissions: [],
      tier_id: "t2",
    });
  });

  it("adds a tier at the bottom, holding nothing", async () => {
    const user = userEvent.setup();
    overview();
    await user.click(screen.getByRole("button", { name: "Add tier" }));
    await user.type(
      screen.getByRole("textbox", { name: "New tier name" }),
      "Pledges{Enter}",
    );
    expect(h.createTier).toHaveBeenCalledWith({
      name: "Pledges",
      permissions: [],
    });
  });

  it("moves a role to another tier from its menu", async () => {
    const user = userEvent.setup();
    overview();
    await user.click(screen.getByRole("button", { name: "More for Brothers" }));
    await user.click(
      screen.getByRole("menuitem", { name: "Officers and chairs" }),
    );
    expect(h.updateRole).toHaveBeenCalledWith({
      id: "brother",
      body: { tier_id: "t2" },
    });
  });

  it("deletes a role from its menu only after a confirmation", async () => {
    const user = userEvent.setup();
    overview();
    await user.click(screen.getByRole("button", { name: "More for Alumni" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete role" }));
    expect(h.deleteRole).not.toHaveBeenCalled();
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Delete role",
      }),
    );
    await waitFor(() => expect(h.deleteRole).toHaveBeenCalledWith("alum"));
  });

  it("offers neither a move nor a delete on Everyone", () => {
    overview();
    expect(
      screen.queryByRole("button", { name: "More for Everyone" }),
    ).toBeNull();
  });

  // Two roles added at once share an order (every role here is 1): Move up
  // renumbers the tier from 0, writing only the roles whose place changed.
  it("moves a role up past a neighbour that shares its order", async () => {
    const user = userEvent.setup();
    overview();
    await user.click(
      screen.getByRole("button", { name: "More for President" }),
    );
    expect(screen.getByRole("menuitem", { name: "Move up" })).toHaveAttribute(
      "data-disabled",
    );
    await user.keyboard("{Escape}");
    await user.click(
      screen.getByRole("button", { name: "More for Vice President" }),
    );
    expect(screen.getByRole("menuitem", { name: "Move down" })).toHaveAttribute(
      "data-disabled",
    );
    await user.click(screen.getByRole("menuitem", { name: "Move up" }));
    await waitFor(() =>
      expect(h.updateRole).toHaveBeenCalledWith({
        id: "vp",
        body: { display_order: 0 },
      }),
    );
    expect(h.updateRole).toHaveBeenCalledTimes(1);
  });

  it("keeps Move up and Move down inside a role's own list", async () => {
    // Intramurals sorts first by order, but it's Non-chapter business, so
    // Alumni still leads the roles outside the tiers.
    h.roles = [...h.roles, { ...pickable(), display_order: 0 }];
    const user = userEvent.setup();
    overview();
    await user.click(screen.getByRole("button", { name: "More for Alumni" }));
    expect(screen.getByRole("menuitem", { name: "Move up" })).toHaveAttribute(
      "data-disabled",
    );
    expect(
      screen.getByRole("menuitem", { name: "Move down" }),
    ).not.toHaveAttribute("data-disabled");
    await user.keyboard("{Escape}");
    await user.click(
      screen.getByRole("button", { name: "More for Intramurals" }),
    );
    expect(screen.getByRole("menuitem", { name: "Move up" })).toHaveAttribute(
      "data-disabled",
    );
    expect(screen.getByRole("menuitem", { name: "Move down" })).toHaveAttribute(
      "data-disabled",
    );
  });

  it("keeps the caller's own tier and everything above it out of reach", async () => {
    const user = userEvent.setup();
    asVicePresident();
    overview();
    expect(
      within(group("Exec board")).queryByRole("button", { name: "Add role" }),
    ).toBeNull();
    expect(
      within(group("Officers and chairs")).getByRole("button", {
        name: "Add role",
      }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "More for Vice President" }),
    );
    expect(
      screen.getByRole("menuitem", { name: "Delete role" }),
    ).toHaveAttribute("data-disabled");
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "More for Brothers" }));
    expect(
      screen.getByRole("menuitem", { name: "Exec board" }),
    ).toHaveAttribute("data-disabled");
    expect(
      screen.getByRole("menuitem", { name: "Officers and chairs" }),
    ).not.toHaveAttribute("data-disabled");
  });

  it("finds a role by name across a chapter with many", () => {
    h.roles = [
      ...h.roles,
      ...Array.from({ length: 100 }, (_, i) =>
        role(`r${i}`, `Committee ${i}`, "t3", MEMBERS.permissions),
      ),
    ];
    overview("treas");
    expect(
      screen.getByRole("link", { name: /^Treasurer/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Committee 4")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Members" })).toBeNull();
    // A search shows roles only: no Permissions rows, nothing to add.
    expect(screen.queryByRole("link", { name: /^Permissions/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add role" })).toBeNull();
  });
});

describe("a tier's page", () => {
  it("lists every module's switches and saves a flip as the tier's whole list", async () => {
    const user = userEvent.setup();
    tierPage("t2");
    expect(
      screen.getByRole("heading", { name: "Officers and chairs" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Roles and groups" }),
    ).toHaveAttribute("href", BACK);
    expect(screen.getByRole("heading", { name: "Events" })).toBeInTheDocument();
    const approve = screen.getByRole("switch", {
      name: /approve service hours for officers and chairs/i,
    });
    expect(approve).toBeChecked();
    await user.click(approve);
    expect(h.updateTier).toHaveBeenCalledWith({
      id: "t2",
      body: { permissions: ["members:view"] },
    });
  });

  it("composes a second flip on the first, not on stale props", async () => {
    const user = userEvent.setup();
    let resolve!: () => void;
    h.updateTier.mockImplementationOnce(
      () => new Promise<void>((done) => (resolve = done)),
    );
    tierPage("t3");
    await user.click(
      screen.getByRole("switch", { name: /^create events for/i }),
    );
    resolve();
    await waitFor(() => expect(h.updateTier).toHaveBeenCalledTimes(1));
    await user.click(
      screen.getByRole("switch", { name: /^create polls for/i }),
    );
    expect(h.updateTier).toHaveBeenLastCalledWith({
      id: "t3",
      body: { permissions: ["members:view", "events:create", "polls:create"] },
    });
  });

  it("lists the roles in it, each linking to its page", () => {
    tierPage("t1");
    const roles = group("Roles in it");
    expect(
      within(roles).getByRole("link", { name: /^Vice President/ }),
    ).toHaveAttribute("href", LINKS.role("vp"));
    expect(
      within(roles).getByRole("link", { name: /^President/ }),
    ).toHaveTextContent("1 member");
  });

  it("renames the tier on Enter, and says Saved", async () => {
    const user = userEvent.setup();
    tierPage("t2");
    const name = screen.getByLabelText("Name");
    await user.clear(name);
    await user.type(name, "Officers{Enter}");
    expect(h.updateTier).toHaveBeenCalledWith({
      id: "t2",
      body: { name: "Officers" },
    });
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });

  it("renames on leaving the field, never sends a blank name, and Escape puts the name back", async () => {
    const user = userEvent.setup();
    tierPage("t2");
    const name = screen.getByLabelText("Name");
    await user.clear(name);
    await user.tab();
    expect(h.updateTier).not.toHaveBeenCalled();
    expect(name).toHaveValue("Officers and chairs");
    await user.type(name, " too{Escape}");
    expect(name).toHaveValue("Officers and chairs");
    expect(h.updateTier).not.toHaveBeenCalled();
    await user.type(name, "!");
    await user.tab();
    expect(h.updateTier).toHaveBeenCalledWith({
      id: "t2",
      body: { name: "Officers and chairs!" },
    });
  });

  it("saves its @mention switch on the flip", async () => {
    const user = userEvent.setup();
    tierPage("t2");
    await user.click(
      screen.getByRole("switch", { name: "Anyone can @mention this tier" }),
    );
    expect(h.updateTier).toHaveBeenCalledWith({
      id: "t2",
      body: { mentionable: false },
    });
  });

  it("moves a tier down with the whole order, highest first", async () => {
    const user = userEvent.setup();
    tierPage("t2");
    await user.click(
      screen.getByRole("button", { name: "More for Officers and chairs" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Move down" }));
    expect(h.reorderTiers).toHaveBeenCalledWith(["t1", "t3", "t2"]);
  });

  it("offers no Move up on the highest tier", async () => {
    const user = userEvent.setup();
    tierPage("t1");
    await user.click(
      screen.getByRole("button", { name: "More for Exec board" }),
    );
    expect(screen.getByRole("menuitem", { name: "Move up" })).toHaveAttribute(
      "data-disabled",
    );
  });

  it("deletes only an empty tier, after a confirmation, then goes back", async () => {
    const user = userEvent.setup();
    h.tiers = [
      ...h.tiers,
      { id: "t4", name: "Pledges", position: 4, permissions: [] },
    ];
    const { unmount } = render(
      <TierPermissionsPage
        tierId="t3"
        backHref={BACK}
        roleHref={LINKS.role}
        onDeleted={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "More for Members" }));
    expect(
      screen.getByRole("menuitem", {
        name: /delete tier \(move its roles out first\)/i,
      }),
    ).toHaveAttribute("data-disabled");
    await user.keyboard("{Escape}");
    unmount();

    const { onDeleted } = tierPage("t4");
    await user.click(screen.getByRole("button", { name: "More for Pledges" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete tier" }));
    expect(h.deleteTier).not.toHaveBeenCalled();
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Delete tier",
      }),
    );
    await waitFor(() => expect(h.deleteTier).toHaveBeenCalledWith("t4"));
    expect(onDeleted).toHaveBeenCalled();
  });

  it("is read-only for a tier at or above the caller's own, and says why", () => {
    asVicePresident();
    tierPage("t1");
    expect(screen.getByText(/ranks at or above yours/i)).toBeInTheDocument();
    for (const control of screen.getAllByRole("switch")) {
      expect(control).toBeDisabled();
    }
    expect(screen.getByLabelText("Name")).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "More for Exec board" }),
    ).toBeNull();
  });

  it("won't switch on what the caller doesn't hold, and says so on the row", () => {
    asVicePresident();
    tierPage("t2");
    expect(
      screen.getByRole("switch", { name: /^create events for/i }),
    ).toBeDisabled();
    expect(
      screen.getAllByText(/your role doesn't have it/i).length,
    ).toBeGreaterThan(0);
    // On already, so taking it away is still allowed.
    expect(
      screen.getByRole("switch", { name: /approve service hours for/i }),
    ).toBeEnabled();
  });

  it("never draws the wildcard as a switch", () => {
    tierPage("t1");
    expect(screen.queryByRole("switch", { name: /everything/i })).toBeNull();
  });

  it("leaves out the AI switches while the server has AI off", () => {
    h.aiConsent = null;
    tierPage("t1");
    expect(screen.queryByRole("switch", { name: /use ai/i })).toBeNull();
    expect(
      screen.queryByRole("switch", { name: /let ai take actions/i }),
    ).toBeNull();
  });

  it("offers the AI switches once the server has AI", () => {
    h.aiConsent = {};
    try {
      tierPage("t1");
      expect(
        screen.getByRole("switch", { name: /use ai/i }),
      ).toBeInTheDocument();
    } finally {
      h.aiConsent = null;
    }
  });
});

describe("a role's page", () => {
  it("marks where the role differs from its tier", () => {
    rolePage("treas");
    expect(
      screen.getByText("Set for this role. Officers and chairs has it off."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Starts from Officers and chairs. Rows set apart from it say so.",
      ),
    ).toBeInTheDocument();
  });

  it("shows what the role ends up with, and Same as the tier where it has no answer of its own", async () => {
    const user = userEvent.setup();
    rolePage("treas");
    const service = screen.getByRole("combobox", {
      name: /approve service hours for treasurer/i,
    });
    expect(service).toHaveTextContent("On");
    const answers = await openPick(
      user,
      /approve service hours for treasurer/i,
    );
    expect(
      within(answers).getByRole("option", {
        name: "Same as Officers and chairs · On",
      }),
    ).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Escape}");
    const events = await openPick(user, /create events for treasurer/i);
    expect(within(events).getByRole("option", { name: "On" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("saves a pick as one override key, and Same as clears it", async () => {
    const user = userEvent.setup();
    rolePage("treas");
    await user.click(
      within(
        await openPick(user, /approve service hours for treasurer/i),
      ).getByRole("option", { name: "Off" }),
    );
    expect(h.updateRole).toHaveBeenCalledWith({
      id: "treas",
      body: { permission_overrides: { "service:approve": false } },
    });
    await user.click(
      within(await openPick(user, /create events for treasurer/i)).getByRole(
        "option",
        { name: /^Same as Officers and chairs/ },
      ),
    );
    expect(h.updateRole).toHaveBeenLastCalledWith({
      id: "treas",
      body: { permission_overrides: { "events:create": null } },
    });
  });

  it("puts the chapter's word for a tier on the tier picker", async () => {
    h.vocabulary = { vocabulary: { tier: "Level" } };
    const user = userEvent.setup();
    rolePage("brother");
    await user.click(screen.getByRole("combobox", { name: "Level" }));
    expect(
      screen.getByRole("option", { name: "Outside the levels" }),
    ).toBeInTheDocument();
  });

  it("won't switch on what the caller doesn't hold, and says so on the row", async () => {
    asVicePresident();
    const user = userEvent.setup();
    rolePage("brother");
    expect(
      screen.getAllByText(/your role doesn't have it/i).length,
    ).toBeGreaterThan(0);
    const answers = await openPick(user, /create events for brothers/i);
    expect(within(answers).getByRole("option", { name: "On" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(
      within(answers).getByRole("option", { name: "Off" }),
    ).not.toHaveAttribute("aria-disabled", "true");
  });

  it("gives a role outside the tiers one column of live switches", async () => {
    const user = userEvent.setup();
    rolePage("alum");
    expect(screen.queryByRole("combobox", { name: /for alumni/i })).toBeNull();
    expect(
      screen.getByText("Outside the tiers, so its permissions are its own."),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("switch", { name: /create events for alumni/i }),
    );
    expect(h.updateRole).toHaveBeenCalledWith({
      id: "alum",
      body: { permissions: ["events:create"] },
    });
  });

  it("leaves out the retired permissions a role holds, and keeps them on save (#5728)", async () => {
    const user = userEvent.setup();
    h.roles = h.roles.map((r) =>
      r.id === "alum" ? { ...r, permissions: ["alumni:post"] } : r,
    );
    rolePage("alum");
    expect(
      screen.queryByRole("switch", { name: /post in the alumni channel/i }),
    ).toBeNull();
    expect(
      screen.queryByRole("switch", { name: /post announcements/i }),
    ).toBeNull();
    expect(screen.queryByText(/no longer used/i)).toBeNull();
    await user.click(
      screen.getByRole("switch", { name: /create events for alumni/i }),
    );
    expect(h.updateRole).toHaveBeenCalledWith({
      id: "alum",
      body: { permissions: ["alumni:post", "events:create"] },
    });
  });

  it("views the app as the role, then comes back to its page", async () => {
    const user = userEvent.setup();
    rolePage("brother");
    await user.click(screen.getByRole("button", { name: "View as Brothers" }));
    expect(useRolePreviewStore.getState().preview).toEqual({
      chapterId: "c1",
      roleId: "brother",
      roleName: "Brothers",
      permissions: ["members:view"],
      returnTo: "/settings?tab=roles&role=brother",
    });
    expect(h.push).toHaveBeenCalledWith("/chat");
  });

  it("previews a role with what Everyone holds beside it, as every member has it", async () => {
    const user = userEvent.setup();
    rolePage("cabinet");
    await user.click(screen.getByRole("button", { name: "View as Cabinet" }));
    expect(useRolePreviewStore.getState().preview?.permissions).toEqual([
      "channels:read:cabinet",
      "members:view",
    ]);
  });

  it("offers no View as on the President's role, or to someone who can't edit roles", () => {
    const { unmount } = render(
      <RolePage roleId="pres" backHref={BACK} onDeleted={vi.fn()} />,
    );
    expect(screen.queryByRole("button", { name: /^view as/i })).toBeNull();
    unmount();
    h.members = [{ user_id: "me", role_ids: ["brother"] }];
    h.mine = MEMBERS.permissions;
    rolePage("alum");
    expect(screen.queryByRole("button", { name: /^view as/i })).toBeNull();
  });

  it("locks every switch on the President's role", () => {
    rolePage("pres");
    expect(
      screen.getByText(/only moves through transfer presidency/i),
    ).toBeInTheDocument();
    for (const control of screen.getAllByRole("switch", {
      name: / for President$/,
    })) {
      expect(control).toBeDisabled();
    }
  });

  it("saves details without a permissions key, and moves the role between tiers", async () => {
    const user = userEvent.setup();
    rolePage("brother");
    expect(group("Role")).toHaveTextContent("2 members");
    await user.click(screen.getByRole("combobox", { name: "Tier" }));
    await user.click(
      screen.getByRole("option", { name: "Officers and chairs" }),
    );
    await user.click(
      screen.getByRole("switch", { name: /anyone can @mention/i }),
    );
    await user.click(screen.getByRole("button", { name: "Save role" }));
    expect(h.updateRole).toHaveBeenCalledWith({
      id: "brother",
      body: {
        name: undefined,
        color: undefined,
        mentionable: false,
        self_assignable: undefined,
        tier_id: "t2",
      },
    });
  });

  it("renames the role on Save role", async () => {
    const user = userEvent.setup();
    rolePage("brother");
    const name = screen.getByLabelText("Name");
    await user.clear(name);
    await user.type(name, "  Actives ");
    await user.click(screen.getByRole("button", { name: "Save role" }));
    expect(h.updateRole.mock.calls[0]![0].body).toMatchObject({
      name: "Actives",
    });
  });

  it("marks a role outside the tiers as Non-chapter business (#4958)", async () => {
    const user = userEvent.setup();
    rolePage("alum");
    await user.click(
      screen.getByRole("switch", { name: "Non-chapter business" }),
    );
    await user.click(screen.getByRole("button", { name: "Save role" }));
    expect(h.updateRole.mock.calls[0]![0].body).toMatchObject({
      self_assignable: true,
    });
  });

  it("explains why a role in a tier can't be Non-chapter business", () => {
    rolePage("brother");
    expect(
      screen.getByRole("switch", { name: "Non-chapter business" }),
    ).toBeDisabled();
    expect(
      screen.getByText(/Roles members pick themselves sit outside the tiers/),
    ).toBeInTheDocument();
  });

  it("lets a tiered role moved out of its tier be marked in the same save", async () => {
    // The switch judges the permissions the save leaves: Brothers carries
    // only its tier's, so outside the tiers it holds none.
    const user = userEvent.setup();
    rolePage("brother");
    await user.click(screen.getByRole("combobox", { name: "Tier" }));
    await user.click(screen.getByRole("option", { name: "Outside the tiers" }));
    const pick = screen.getByRole("switch", { name: "Non-chapter business" });
    expect(pick).toBeEnabled();
    await user.click(pick);
    await user.click(screen.getByRole("button", { name: "Save role" }));
    expect(h.updateRole.mock.calls[0]![0].body).toMatchObject({
      tier_id: null,
      self_assignable: true,
    });
  });

  it("refuses to mark a role outside the tiers that carries a permission", () => {
    h.roles = [
      ...h.roles,
      role("rush", "Rush crew", null, ["events:create"], {
        permission_overrides: { "events:create": true },
      }),
    ];
    rolePage("rush");
    expect(
      screen.getByRole("switch", { name: "Non-chapter business" }),
    ).toBeDisabled();
    expect(
      screen.getByText(/can't carry permissions, since anyone can join them/),
    ).toBeInTheDocument();
  });

  it("judges a drafted move into a tier, and still lets a marked role be turned off", async () => {
    h.roles = [...h.roles, pickable()];
    const user = userEvent.setup();
    rolePage("im");
    await user.click(screen.getByRole("combobox", { name: "Tier" }));
    await user.click(screen.getByRole("option", { name: "Members" }));
    expect(
      screen.getByText(/Roles members pick themselves sit outside the tiers/),
    ).toBeInTheDocument();
    const pick = screen.getByRole("switch", { name: "Non-chapter business" });
    expect(pick).toBeEnabled();
    await user.click(pick);
    expect(pick).not.toBeChecked();
    expect(pick).toBeDisabled();
  });

  it("offers no Non-chapter business switch on a built-in role", () => {
    rolePage("everyone");
    expect(
      screen.getByRole("heading", { name: "Everyone" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("switch", { name: "Non-chapter business" }),
    ).toBeNull();
  });

  it("saves a picked swatch, and leaves an untouched color out", async () => {
    const user = userEvent.setup();
    rolePage("brother");
    await user.click(screen.getByRole("button", { name: "No color" }));
    await user.click(
      within(screen.getByRole("group", { name: "Color" })).getByRole("button", {
        name: "Teal",
      }),
    );
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Save role" }));
    const body = h.updateRole.mock.calls[0]![0].body;
    expect(body.color).toBe("#3DD6C4");
    expect(body).not.toHaveProperty("permissions", expect.anything());
  });

  // Move up and Move down in the header's ⋯ replaced the "Position in its
  // list" number box (#6029).
  it("moves the role up its list from the header's ⋯", async () => {
    h.roles = h.roles.map((r) =>
      r.id === "pres" ? { ...r, display_order: 1 } : { ...r, display_order: 2 },
    );
    const user = userEvent.setup();
    rolePage("vp");
    await user.click(
      screen.getByRole("button", { name: "More for Vice President" }),
    );
    expect(screen.getByRole("menuitem", { name: "Move down" })).toHaveAttribute(
      "data-disabled",
    );
    await user.click(screen.getByRole("menuitem", { name: "Move up" }));
    await waitFor(() => expect(h.updateRole).toHaveBeenCalledTimes(2));
    expect(h.updateRole).toHaveBeenNthCalledWith(1, {
      id: "vp",
      body: { display_order: 1 },
    });
    expect(h.updateRole).toHaveBeenNthCalledWith(2, {
      id: "pres",
      body: { display_order: 2 },
    });
  });

  it("deletes a role only after a confirmation, then goes back", async () => {
    const user = userEvent.setup();
    const { onDeleted } = rolePage("alum");
    await user.click(screen.getByRole("button", { name: "More for Alumni" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete role" }));
    expect(h.deleteRole).not.toHaveBeenCalled();
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Delete role",
      }),
    );
    await waitFor(() => expect(h.deleteRole).toHaveBeenCalledWith("alum"));
    expect(onDeleted).toHaveBeenCalled();
  });

  it("is read-only for a role in the caller's own tier", () => {
    asVicePresident();
    rolePage("vp");
    expect(screen.queryByRole("button", { name: "Save role" })).toBeNull();
    expect(screen.getByLabelText("Name")).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "More for Vice President" }),
    ).toBeNull();
    expect(screen.getByRole("combobox", { name: "Tier" })).toBeDisabled();
  });
});
