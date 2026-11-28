import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGroups = vi.fn();
const mockMembers = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockMembership = vi.fn();
const mockDelete = vi.fn();
const mockToast = vi.fn();

vi.mock("@repo/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/hooks")>()),
  useGroups: () => mockGroups(),
  useMembers: () => mockMembers(),
  useCreateGroup: () => ({ mutateAsync: mockCreate, isPending: false }),
  useUpdateGroup: () => ({ mutateAsync: mockUpdate, isPending: false }),
  useSetGroupMembership: () => ({
    mutateAsync: mockMembership,
    isPending: false,
  }),
  useDeleteGroup: () => ({ mutateAsync: mockDelete, isPending: false }),
  useChapterRoleColors: () => [],
  useViewerDisplayName: () => "Me",
}));

vi.mock("@/lib/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock("@/lib/providers/network-provider", () => ({
  useNetwork: () => ({ isOffline: false }),
}));

import { GROUP_MEMBERS_MAX } from "@repo/validation";
import { AutomaticGroupsPage, GroupPage, GroupsGroup } from "./groups-section";

const LINKS = {
  group: (id: string) => `/settings?tab=roles&group=${id}`,
  automatic: "/settings?tab=roles&groups=automatic",
};
const BACK = "/settings?tab=roles";

function list(props: { canManage?: boolean; query?: string } = {}) {
  const onCreated = vi.fn();
  render(
    <GroupsGroup
      canManage={props.canManage ?? true}
      query={props.query ?? ""}
      links={LINKS}
      onCreated={onCreated}
    />,
  );
  return { onCreated };
}

function page(groupId: string, canManage = true) {
  const onDone = vi.fn();
  render(
    <GroupPage
      groupId={groupId}
      canManage={canManage}
      backHref={BACK}
      backLabel="Roles and groups"
      onDone={onDone}
    />,
  );
  return { onDone };
}

const group = (
  id: string,
  name: string,
  kind: "manual" | "pledge_class" | "class_year",
  member_ids: string[],
  extra: Record<string, unknown> = {},
) => ({
  id,
  chapter_id: "c1",
  kind,
  name,
  color: null,
  mentionable: true,
  pledge_class_id: kind === "pledge_class" ? `pc-${id}` : null,
  class_year: kind === "class_year" ? 2027 : null,
  member_ids,
  created_at: "",
  updated_at: "",
  ...extra,
});

const member = (id: string, display_name: string) => ({
  id: `m-${id}`,
  user_id: id,
  display_name,
});

const GROUPS = [
  group("g-floor", "Third floor", "manual", ["u1"]),
  group("g-alpha", "Alpha", "pledge_class", ["u1", "u2"], {
    mentionable: false,
  }),
];
const MEMBERS = [member("u1", "Ann Lee"), member("u2", "Ben Park")];

function loaded(data: unknown) {
  return {
    data,
    isLoading: false,
    isPending: false,
    isError: false,
    fetchStatus: "idle",
    refetch: vi.fn(),
  };
}

describe("the Groups group (#4076, rows since #6029)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGroups.mockReturnValue(loaded(GROUPS));
    mockMembers.mockReturnValue(loaded(MEMBERS));
    mockDelete.mockResolvedValue(undefined);
  });

  it("lists manual groups as rows, and the automatic ones behind one row", () => {
    list();
    const groups = screen.getByRole("list", { name: "Groups" });
    const floor = within(groups).getByRole("link", { name: /^Third floor/ });
    expect(floor).toHaveAttribute("href", LINKS.group("g-floor"));
    expect(floor).toHaveTextContent("1 member");
    // The pledge class isn't a row of its own here, only counted on the row
    // that opens the automatic groups' page.
    expect(within(groups).queryByRole("link", { name: /^Alpha/ })).toBeNull();
    const automatic = within(groups).getByRole("link", {
      name: /^Pledge classes, class years and majors/,
    });
    expect(automatic).toHaveAttribute("href", LINKS.automatic);
    expect(automatic).toHaveTextContent("1");
    // A manual group has a ⋯; the automatic row has none.
    expect(
      screen.getByRole("button", { name: "More for Third floor" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^More for Pledge/ }),
    ).toBeNull();
  });

  it("finds an automatic group by name inline, saying what it follows", async () => {
    list({ query: "alp" });
    const alpha = screen.getByRole("link", { name: /^Alpha/ });
    expect(alpha).toHaveTextContent("Follows pledge class");
    expect(alpha).toHaveTextContent("2 members");
    expect(screen.queryByRole("link", { name: /^Third floor/ })).toBeNull();
    // Nothing to add while searching.
    expect(screen.queryByRole("button", { name: "New group" })).toBeNull();
  });

  it("deletes a manual group from its ⋯, only after a confirmation", async () => {
    const user = userEvent.setup();
    list();
    await user.click(
      screen.getByRole("button", { name: "More for Third floor" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Delete group" }));
    expect(mockDelete).not.toHaveBeenCalled();
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Delete Third floor",
      }),
    );
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith("g-floor"));
  });

  it("offers no writes without groups:manage", () => {
    list({ canManage: false });
    expect(screen.queryByRole("button", { name: "New group" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^More for/ })).toBeNull();
    expect(
      screen.getByRole("link", { name: /^Third floor/ }),
    ).toBeInTheDocument();
  });

  it("says None yet to a member who can't add one, when there are none", () => {
    mockGroups.mockReturnValue(loaded([]));
    list({ canManage: false });
    expect(screen.getByRole("list", { name: "Groups" })).toHaveTextContent(
      "None yet",
    );
  });

  it("creates a group and opens it to pick members", async () => {
    const user = userEvent.setup();
    mockCreate.mockResolvedValue(group("g-new", "Live-ins", "manual", []));
    const { onCreated } = list();
    await user.click(screen.getByRole("button", { name: "New group" }));
    await user.type(
      screen.getByRole("textbox", { name: "New group name" }),
      "  Live-ins {Enter}",
    );
    expect(mockCreate).toHaveBeenCalledWith({ name: "Live-ins" });
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("g-new"));
  });
});

describe("the automatic groups' page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGroups.mockReturnValue(loaded(GROUPS));
  });

  it("lists the groups Frapp keeps, each saying what it follows", () => {
    render(<AutomaticGroupsPage backHref={BACK} groupHref={LINKS.group} />);
    expect(
      screen.getByRole("heading", {
        name: "Pledge classes, class years and majors",
      }),
    ).toBeInTheDocument();
    const alpha = screen.getByRole("link", { name: /^Alpha/ });
    expect(alpha).toHaveTextContent("Follows pledge class");
    expect(alpha).toHaveTextContent("2 members");
    expect(alpha).toHaveAttribute("href", LINKS.group("g-alpha"));
    expect(screen.queryByRole("link", { name: /^Third floor/ })).toBeNull();
  });

  it("names a class year by its standing too, and an alumni year by year only (#5786)", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-20T12:00:00Z"));
    try {
      mockGroups.mockReturnValue(
        loaded([
          group("g-29", "Class of 2029", "class_year", ["u1"], {
            class_year: 2029,
          }),
          group("g-25", "Class of 2025", "class_year", ["u2"], {
            class_year: 2025,
          }),
        ]),
      );
      render(<AutomaticGroupsPage backHref={BACK} groupHref={LINKS.group} />);
      expect(screen.getByText("Sophomores · Class of 2029")).toBeTruthy();
      expect(screen.getByText("Class of 2025")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("a group's page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGroups.mockReturnValue(loaded(GROUPS));
    mockMembers.mockReturnValue(loaded(MEMBERS));
    mockUpdate.mockResolvedValue(undefined);
    mockMembership.mockResolvedValue(undefined);
    mockDelete.mockResolvedValue(undefined);
  });

  it("adds and takes out a manual group's members one at a time, staying on the page", async () => {
    const user = userEvent.setup();
    const { onDone } = page("g-floor");
    expect(
      screen.getByRole("heading", { name: "Third floor" }),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText("Add a member"), "ben");
    await user.click(screen.getByRole("option", { name: "Ben Park" }));
    await waitFor(() =>
      expect(mockMembership).toHaveBeenCalledWith({
        groupId: "g-floor",
        userId: "u2",
        in: true,
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Remove Ann Lee from Third floor" }),
    );
    await waitFor(() =>
      expect(mockMembership).toHaveBeenLastCalledWith({
        groupId: "g-floor",
        userId: "u1",
        in: false,
      }),
    );
    // One request per member, never the whole list, and nothing else.
    expect(mockMembership).toHaveBeenCalledTimes(2);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });

  it("says a refused member change failed", async () => {
    const user = userEvent.setup();
    mockMembership.mockRejectedValueOnce(new Error("Not a member any more"));
    page("g-floor");
    await user.click(
      screen.getByRole("button", { name: "Remove Ann Lee from Third floor" }),
    );
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Couldn't save group",
          variant: "destructive",
        }),
      ),
    );
  });

  it("takes no one else into a full group", async () => {
    mockGroups.mockReturnValue(
      loaded([
        group(
          "g-floor",
          "Third floor",
          "manual",
          Array.from({ length: GROUP_MEMBERS_MAX }, (_, index) => `x${index}`),
        ),
      ]),
    );
    page("g-floor");
    expect(screen.getByLabelText("Add a member")).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      `A group can hold at most ${GROUP_MEMBERS_MAX} members.`,
    );
  });

  it("renames a manual group on leaving the field, sending only its name", async () => {
    const user = userEvent.setup();
    page("g-floor");
    const name = screen.getByLabelText("Name");
    await user.clear(name);
    await user.type(name, "Fourth floor");
    expect(mockUpdate).not.toHaveBeenCalled();
    await user.tab();
    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith({
        id: "g-floor",
        body: { name: "Fourth floor" },
      }),
    );
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockMembership).not.toHaveBeenCalled();
  });

  it("lists everyone who can be added as soon as the search is clicked (#5738)", async () => {
    const user = userEvent.setup();
    page("g-floor");
    await user.click(screen.getByLabelText("Add a member"));
    expect(screen.getAllByRole("option").length).toBeGreaterThan(0);
    expect(screen.queryByRole("option", { name: "Ann Lee" })).toBeNull();
  });

  it("lets an automatic group's ping switch change, and not its name or members", async () => {
    const user = userEvent.setup();
    page("g-alpha");
    expect(screen.getByLabelText("Name")).toBeDisabled();
    expect(screen.queryByLabelText("Add a member")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Remove / })).toBeNull();
    expect(
      screen.getByText(
        "Follows the pledge class: rename the class to rename it.",
      ),
    ).toBeInTheDocument();
    // An automatic group is never deleted by hand.
    expect(screen.queryByRole("button", { name: "More for Alpha" })).toBeNull();
    const ping = screen.getByRole("switch", {
      name: "Anyone can @mention this group",
    });
    await user.click(ping);
    // Saved the moment it flips, sending only its own key.
    expect(mockUpdate).toHaveBeenCalledWith({
      id: "g-alpha",
      body: { mentionable: true },
    });
    expect(mockMembership).not.toHaveBeenCalled();
  });

  it("is read-only without groups:manage", () => {
    page("g-floor", false);
    expect(screen.getByLabelText("Name")).toBeDisabled();
    expect(
      screen.getByRole("switch", { name: "Anyone can @mention this group" }),
    ).toBeDisabled();
    expect(screen.queryByLabelText("Add a member")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "More for Third floor" }),
    ).toBeNull();
  });

  it("deletes a manual group from the header's ⋯, after a confirmation, then goes back", async () => {
    const user = userEvent.setup();
    const { onDone } = page("g-floor");
    await user.click(
      screen.getByRole("button", { name: "More for Third floor" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Delete group" }));
    expect(mockDelete).not.toHaveBeenCalled();
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Delete Third floor",
      }),
    );
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith("g-floor"));
    expect(onDone).toHaveBeenCalled();
  });
});
