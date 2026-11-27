import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the data hooks so the tab renders without a query client / network.
const mockUseRoles = vi.fn();
const mockSaveDefaultRole = vi.fn();
const mockPermissions = vi.fn();
// Undefined (not loaded) unless a test says which roles the caller may invite
// into (#1830).
const mockInvitableRoleIds = vi.fn<() => string[] | undefined>();
const mockParams = { value: new URLSearchParams("tab=roles") };
const mockPush = vi.fn();

vi.mock("@repo/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/hooks")>()),
  useRoles: () => mockUseRoles(),
  useGroups: () => ({ data: [] }),
  useInvitableRoleIds: () => ({ data: mockInvitableRoleIds() }),
  useMyPermissions: () => ({
    data: { permissions: mockPermissions() },
    isPending: false,
    isError: false,
  }),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => mockParams.value,
  useRouter: () => ({ push: mockPush }),
}));

// The page opens and closes its pages through the address (#6049).
vi.mock("@/lib/address/address", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/address/address")>()),
  pushAddressTo: (href: string) => mockPush(href),
  closeToAddress: (href: string) => mockPush(href),
}));

// The page head's count and search read the roles pages' data; the pages
// themselves are mocked below.
vi.mock("@/components/roles/use-roles-data", () => ({
  useRolesData: () => ({
    rolesQuery: { isSuccess: true },
    tiersQuery: { isSuccess: true },
    roles: mockUseRoles().data ?? [],
    tiers: [{ id: "tier-1" }],
    words: { singular: "tier", plural: "tiers" },
  }),
}));

type Links = {
  tier: (id: string) => string;
  role: (id: string) => string;
  group: (id: string) => string;
  automatic: string;
};

// The pages have their own specs (`roles/roles-pages.spec.tsx`,
// `roles/groups-section.spec.tsx`); here only which one the URL picks, and
// where each one's links and callbacks lead, are under test.
vi.mock("@/components/roles/roles-overview", () => ({
  RolesOverview: (props: {
    links: Links;
    onOpenRole: (id: string) => void;
  }) => (
    <div data-testid="overview">
      <a href={props.links.tier("tier-1")}>a tier</a>
      <a href={props.links.role("role-1")}>a role</a>
      <button onClick={() => props.onOpenRole("role-1")}>open role</button>
    </div>
  ),
}));
vi.mock("@/components/roles/tier-permissions-page", () => ({
  TierPermissionsPage: (props: {
    tierId: string;
    backHref: string;
    roleHref: (id: string) => string;
    onDeleted: () => void;
  }) => (
    <div data-testid="tier-page" data-back={props.backHref}>
      {props.tierId}
      <a href={props.roleHref("role-2")}>a role in it</a>
      <button onClick={props.onDeleted}>deleted</button>
    </div>
  ),
}));
vi.mock("@/components/roles/role-page", () => ({
  RolePage: (props: {
    roleId: string;
    backHref: string;
    onDeleted: () => void;
  }) => (
    <div data-testid="role-page" data-back={props.backHref}>
      {props.roleId}
      <button onClick={props.onDeleted}>deleted</button>
    </div>
  ),
}));
vi.mock("@/components/roles/groups-section", () => ({
  GroupsGroup: (props: {
    canManage: boolean;
    links: Links;
    onCreated: (id: string) => void;
  }) => (
    <div data-testid="groups" data-can-manage={String(props.canManage)}>
      <a href={props.links.automatic}>automatic</a>
      <button onClick={() => props.onCreated("group-1")}>created</button>
    </div>
  ),
  GroupPage: (props: {
    groupId: string;
    canManage: boolean;
    backHref: string;
    backLabel: string;
    onDone: () => void;
  }) => (
    <div
      data-testid="group-page"
      data-back={props.backHref}
      data-back-label={props.backLabel}
      data-can-manage={String(props.canManage)}
    >
      {props.groupId}
      <button onClick={props.onDone}>done</button>
    </div>
  ),
  AutomaticGroupsPage: (props: {
    backHref: string;
    groupHref: (id: string) => string;
  }) => (
    <div data-testid="automatic-page" data-back={props.backHref}>
      <a href={props.groupHref("group-7")}>a class</a>
    </div>
  ),
}));
vi.mock("@/components/roles/presidency", () => ({
  PresidencyClaimBanner: () => null,
  TransferPresidencyRow: () => <li data-testid="transfer" />,
}));

import { SettingsRolesTab } from "./settings-roles-tab";

/** The hook mocks every test in this file renders against. */
function primeMocks() {
  vi.clearAllMocks();
  mockParams.value = new URLSearchParams("tab=roles");
  mockUseRoles.mockReturnValue({
    data: [
      {
        id: "role-member",
        name: "Member",
        permissions: ["members:view"],
        is_system: true,
        display_order: 1,
      },
      {
        id: "role-pledge",
        name: "New Member",
        permissions: [],
        is_system: false,
        display_order: 2,
      },
    ],
    isPending: false,
    isError: false,
    isSuccess: true,
    refetch: vi.fn(),
  });
  mockPermissions.mockReturnValue(["roles:manage", "chapter-config:manage"]);
}

const tab = () => (
  <SettingsRolesTab
    canManage
    defaultInviteRoleId={null}
    onSaveDefaultInviteRole={mockSaveDefaultRole}
  />
);

describe("SettingsRolesTab", () => {
  beforeEach(primeMocks);

  it("lands on Roles and groups, and links a tier and a role by URL", async () => {
    const user = userEvent.setup();
    render(tab());
    expect(
      screen.getByRole("heading", { name: "Roles and groups" }),
    ).toBeInTheDocument();
    expect(screen.getByText("2 roles in 1 tier")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "a tier" })).toHaveAttribute(
      "href",
      "/settings?tab=roles&tier=tier-1",
    );
    expect(screen.getByRole("link", { name: "a role" })).toHaveAttribute(
      "href",
      "/settings?tab=roles&role=role-1",
    );
    // Non-chapter business's Add role opens the new role's page.
    await user.click(screen.getByRole("button", { name: "open role" }));
    expect(mockPush).toHaveBeenCalledWith("/settings?tab=roles&role=role-1");
  });

  it("lists the groups under the roles, on the same page (2026-11-19)", async () => {
    const user = userEvent.setup();
    render(tab());
    const overview = screen.getByTestId("overview");
    const groups = screen.getByTestId("groups");
    expect(
      overview.compareDocumentPosition(groups) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "automatic" })).toHaveAttribute(
      "href",
      "/settings?tab=roles&groups=automatic",
    );
    // A new group opens its page to pick members.
    await user.click(screen.getByRole("button", { name: "created" }));
    expect(mockPush).toHaveBeenCalledWith("/settings?tab=roles&group=group-1");
  });

  it("shows only the groups to a member who can manage groups and nothing else", () => {
    mockPermissions.mockReturnValue(["groups:manage"]);
    render(tab());
    expect(screen.queryByTestId("overview")).toBeNull();
    expect(screen.queryByText(/roles in/)).toBeNull();
    expect(screen.getByTestId("groups")).toHaveAttribute(
      "data-can-manage",
      "true",
    );
  });

  it("opens a tier's page from ?tier=, and goes back to the list once it's deleted", async () => {
    const user = userEvent.setup();
    mockParams.value = new URLSearchParams("tab=roles&tier=tier-9");
    render(tab());
    const page = screen.getByTestId("tier-page");
    expect(page).toHaveTextContent("tier-9");
    expect(page).toHaveAttribute("data-back", "/settings?tab=roles");
    expect(screen.getByRole("link", { name: "a role in it" })).toHaveAttribute(
      "href",
      "/settings?tab=roles&role=role-2",
    );
    expect(screen.queryByTestId("overview")).toBeNull();
    await user.click(screen.getByRole("button", { name: "deleted" }));
    expect(mockPush).toHaveBeenCalledWith("/settings?tab=roles");
  });

  it("opens a role from ?role=, and goes back to the list once it's deleted", async () => {
    const user = userEvent.setup();
    mockParams.value = new URLSearchParams("tab=roles&role=role-3");
    render(tab());
    const page = screen.getByTestId("role-page");
    expect(page).toHaveTextContent("role-3");
    expect(page).toHaveAttribute("data-back", "/settings?tab=roles");
    await user.click(screen.getByRole("button", { name: "deleted" }));
    expect(mockPush).toHaveBeenCalledWith("/settings?tab=roles");
  });

  it("opens a group from ?group=, back to Roles and groups", async () => {
    const user = userEvent.setup();
    mockParams.value = new URLSearchParams("tab=roles&group=group-2");
    render(tab());
    const page = screen.getByTestId("group-page");
    expect(page).toHaveTextContent("group-2");
    expect(page).toHaveAttribute("data-back", "/settings?tab=roles");
    expect(page).toHaveAttribute("data-back-label", "Roles and groups");
    expect(page).toHaveAttribute("data-can-manage", "false");
    await user.click(screen.getByRole("button", { name: "done" }));
    expect(mockPush).toHaveBeenCalledWith("/settings?tab=roles");
  });

  it("opens the automatic groups, and a group from there goes back to them", async () => {
    const user = userEvent.setup();
    mockParams.value = new URLSearchParams("tab=roles&groups=automatic");
    const { unmount } = render(tab());
    expect(screen.getByTestId("automatic-page")).toHaveAttribute(
      "data-back",
      "/settings?tab=roles",
    );
    expect(screen.getByRole("link", { name: "a class" })).toHaveAttribute(
      "href",
      "/settings?tab=roles&group=group-7&from=automatic",
    );
    unmount();

    mockParams.value = new URLSearchParams(
      "tab=roles&group=group-7&from=automatic",
    );
    render(tab());
    const page = screen.getByTestId("group-page");
    expect(page).toHaveAttribute(
      "data-back",
      "/settings?tab=roles&groups=automatic",
    );
    expect(page).toHaveAttribute(
      "data-back-label",
      "Pledge classes, class years and majors",
    );
    await user.click(screen.getByRole("button", { name: "done" }));
    expect(mockPush).toHaveBeenCalledWith(
      "/settings?tab=roles&groups=automatic",
    );
  });

  it("offers Transfer presidency only to the caller who holds everything", () => {
    const { unmount } = render(tab());
    expect(screen.queryByTestId("transfer")).toBeNull();
    unmount();
    mockPermissions.mockReturnValue(["*"]);
    render(tab());
    expect(screen.getByTestId("transfer")).toBeInTheDocument();
  });

  it("keeps Invites and presidency for the President when the config can't load", () => {
    mockPermissions.mockReturnValue(["*"]);
    render(
      <SettingsRolesTab
        canManage
        configUnavailable
        defaultInviteRoleId={null}
        onSaveDefaultInviteRole={mockSaveDefaultRole}
      />,
    );
    expect(screen.getByTestId("transfer")).toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "Default invite role" }),
    ).toBeNull();
  });

  it("hides Invites and presidency from anyone else when the config can't load", () => {
    render(
      <SettingsRolesTab
        canManage
        configUnavailable
        defaultInviteRoleId={null}
        onSaveDefaultInviteRole={mockSaveDefaultRole}
      />,
    );
    expect(screen.queryByText("Invites and presidency")).toBeNull();
  });

  // ── Default invite role (#422) ───────────────────────────────────────────

  describe("default invite role", () => {
    // This block sits outside `SettingsRolesTab`'s describe, so it primes the
    // mocks itself; without this it only passed on state another test left.
    beforeEach(primeMocks);

    const picker = () =>
      screen.getByRole("combobox", { name: "Default invite role" });

    it("selects the configured role and offers an explicit no-default option", async () => {
      const user = userEvent.setup();
      render(
        <SettingsRolesTab
          canManage
          defaultInviteRoleId="role-pledge"
          onSaveDefaultInviteRole={mockSaveDefaultRole}
        />,
      );
      const picker = screen.getByRole("combobox", {
        name: "Default invite role",
      });
      expect(picker).toHaveTextContent("New Member");
      await user.click(picker);
      expect(
        screen.getByRole("option", { name: "No role" }),
      ).toBeInTheDocument();
    });

    it("saves the picked role id", async () => {
      const user = userEvent.setup();
      render(
        <SettingsRolesTab
          canManage
          defaultInviteRoleId={null}
          onSaveDefaultInviteRole={mockSaveDefaultRole}
        />,
      );
      await user.click(
        screen.getByRole("combobox", { name: "Default invite role" }),
      );
      await user.click(screen.getByRole("option", { name: "Member" }));
      expect(mockSaveDefaultRole).toHaveBeenCalledWith("role-member");
    });

    /*
     * Clearing writes `null`. The no-default option carries a sentinel value,
     * because a Radix item cannot hold an empty string, so the component has
     * to translate it — the sentinel reaching the API would fail uuid
     * validation with a 400 rather than clearing the setting.
     */
    it("offers only roles the officer could invite into, keeping the configured one (#1830)", async () => {
      const user = userEvent.setup();
      // Member is ranked at or above this officer; only New Member is below.
      mockInvitableRoleIds.mockReturnValue(["role-pledge"]);
      const { unmount } = render(
        <SettingsRolesTab
          canManage
          defaultInviteRoleId={null}
          onSaveDefaultInviteRole={mockSaveDefaultRole}
        />,
      );
      await user.click(picker());
      expect(screen.getByRole("option", { name: "New Member" })).toBeVisible();
      expect(screen.queryByRole("option", { name: "Member" })).toBeNull();
      unmount();

      // A default someone higher set stays named, so the card doesn't call it gone.
      render(
        <SettingsRolesTab
          canManage
          defaultInviteRoleId="role-member"
          onSaveDefaultInviteRole={mockSaveDefaultRole}
        />,
      );
      expect(picker()).toHaveTextContent("Member");
    });

    it("saves null when the default is cleared", async () => {
      const user = userEvent.setup();
      render(
        <SettingsRolesTab
          canManage
          defaultInviteRoleId="role-member"
          onSaveDefaultInviteRole={mockSaveDefaultRole}
        />,
      );
      await user.click(
        screen.getByRole("combobox", { name: "Default invite role" }),
      );
      await user.click(screen.getByRole("option", { name: "No role" }));
      expect(mockSaveDefaultRole).toHaveBeenCalledWith(null);
    });

    it("reads a default naming the Everyone role as no role (#4191)", async () => {
      mockUseRoles.mockReturnValue({
        data: [
          {
            id: "role-member",
            name: "Everyone",
            system_key: "EVERYONE",
            permissions: ["members:view"],
            is_system: true,
            display_order: 1,
          },
        ],
        isPending: false,
        isError: false,
      });
      render(
        <SettingsRolesTab
          canManage
          defaultInviteRoleId="role-member"
          onSaveDefaultInviteRole={mockSaveDefaultRole}
        />,
      );
      expect(
        screen.getByRole("combobox", { name: "Default invite role" }),
      ).toHaveTextContent("No role");
    });

    it("disables the picker for a caller who cannot manage config", () => {
      render(
        <SettingsRolesTab
          canManage={false}
          defaultInviteRoleId={null}
          onSaveDefaultInviteRole={mockSaveDefaultRole}
        />,
      );
      expect(
        screen.getByRole("combobox", { name: "Default invite role" }),
      ).toBeDisabled();
    });

    it("flags a configured role that is no longer in the catalog", () => {
      render(
        <SettingsRolesTab
          canManage
          defaultInviteRoleId="role-deleted"
          onSaveDefaultInviteRole={mockSaveDefaultRole}
        />,
      );
      expect(
        screen.getByText("That role is gone. Pick another."),
      ).toBeInTheDocument();
      // The placeholder, not an empty box: Radix draws nothing for a value it
      // has no item for.
      expect(picker()).toHaveTextContent("Pick a role");
    });

    /*
     * With the roles list missing, the only item is "No default". The native
     * select this replaced showed that item as already selected, so picking
     * it wrote nothing; a Radix select holding the configured id would treat
     * the same click as a change and clear a valid default, beside copy that
     * says the default cannot be changed.
     */
    it("locks the picker and keeps the configured default when roles fail to load", async () => {
      const user = userEvent.setup();
      mockUseRoles.mockReturnValue({
        data: undefined,
        isPending: false,
        isError: true,
        isSuccess: false,
        refetch: vi.fn(),
      });
      render(
        <SettingsRolesTab
          canManage
          defaultInviteRoleId="role-pledge"
          onSaveDefaultInviteRole={mockSaveDefaultRole}
        />,
      );
      expect(picker()).toBeDisabled();
      expect(
        screen.getByText(
          /Roles could not load, so this can.t change right now/,
        ),
      ).toBeInTheDocument();
      await user.click(picker());
      expect(screen.queryByRole("option")).not.toBeInTheDocument();
      expect(mockSaveDefaultRole).not.toHaveBeenCalled();
    });

    it("locks the picker and says so while roles are loading", () => {
      mockUseRoles.mockReturnValue({
        data: undefined,
        isPending: true,
        isError: false,
        isSuccess: false,
        refetch: vi.fn(),
      });
      render(
        <SettingsRolesTab
          canManage
          defaultInviteRoleId="role-pledge"
          onSaveDefaultInviteRole={mockSaveDefaultRole}
        />,
      );
      expect(picker()).toBeDisabled();
      expect(picker()).toHaveTextContent("Loading roles…");
    });

    it("locks the picker while a config save is in flight", () => {
      render(
        <SettingsRolesTab
          canManage
          defaultInviteRoleId={null}
          onSaveDefaultInviteRole={mockSaveDefaultRole}
          isSavingConfig
        />,
      );
      expect(picker()).toBeDisabled();
    });
  });
});
