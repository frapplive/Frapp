import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  CHAPTER_PROFILE_PERMISSIONS,
  CHAT_REPORT_QUEUE_PERMISSIONS,
} from "@repo/validation";
import { CHAT_REPORTS_NOTIFICATION_SCREEN } from "@repo/hooks";
import { cardFilledContainers } from "@/tests/card-surfaces";
import { networkMock } from "@/tests/network";

/*
 * The body of Chapter settings' Chat page (#6031): the Channels group (the
 * fold-out category tree of #5727, New channel and New category), then Look
 * and Moderation, each a row that opens its own page. One channel's own page
 * is `channel-settings-page.tsx`, with its own spec.
 *
 * The report queue has its own spec (`chat-reports-card.spec.tsx`) and is
 * stubbed here, as is the background picker; so is the screen-level `<Can>`,
 * whose fallbacks `can-fallback.spec.tsx` pins.
 */

const {
  mockOffline,
  reads,
  permissions,
  mockCreateChannel,
  mockCreateCategory,
  mockUpdateCategory,
  mockDeleteCategory,
  mockChatReports,
  mockDiscordImports,
  mockMarkSeen,
} = vi.hoisted(() => ({
  mockOffline: { value: false },
  permissions: { current: [] as string[] },
  mockCreateChannel: vi.fn(),
  mockCreateCategory: vi.fn(),
  mockUpdateCategory: vi.fn(),
  mockDeleteCategory: vi.fn(),
  mockChatReports: vi.fn(),
  mockDiscordImports: vi.fn(),
  mockMarkSeen: vi.fn(),
  reads: {
    channels: {} as Record<string, unknown>,
    categories: {} as Record<string, unknown>,
    accessOptions: {} as Record<string, unknown>,
    reports: {} as Record<string, unknown>,
    imports: {} as Record<string, unknown>,
    background: {} as Record<string, unknown>,
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@repo/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@repo/hooks")>();
  return {
    ...actual,
    useChapterChatBackground: () => reads.background,
    useCurrentChapter: () => ({ data: undefined }),
    useChannels: () => reads.channels,
    useCategories: () => reads.categories,
    useChannelAccessOptions: () => reads.accessOptions,
    usePermissionList: () => permissions.current,
    useChatReports: (...args: unknown[]) => {
      mockChatReports(...args);
      return reads.reports;
    },
    useDiscordImports: (...args: unknown[]) => {
      mockDiscordImports(...args);
      return reads.imports;
    },
    useMarkNotificationScreensSeen: (...args: unknown[]) =>
      mockMarkSeen(...args),
    useRoles: () => ({ data: [] }),
    useCreateChannel: () => ({
      mutateAsync: mockCreateChannel,
      isPending: false,
    }),
    useCreateCategory: () => ({
      mutateAsync: mockCreateCategory,
      isPending: false,
    }),
    useUpdateCategory: () => ({
      mutateAsync: mockUpdateCategory,
      isPending: false,
    }),
    useDeleteCategory: () => ({
      mutateAsync: mockDeleteCategory,
      isPending: false,
    }),
  };
});

vi.mock("@/components/shared/can", () => ({
  Can: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("./chat-reports-card", () => ({
  ChatReportsCard: ({ channelId }: { channelId?: string }) => (
    <div data-testid="report-queue" data-channel={channelId ?? "chapter"} />
  ),
}));

vi.mock("./chat-background-default-card", () => ({
  ChatBackgroundDefaultCard: () => <div data-testid="background-picker" />,
}));

vi.mock("@/lib/providers/network-provider", () => networkMock(mockOffline));

vi.mock("@/lib/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

const { ChatAdminPage, ChatSettingsSubpage } =
  await import("./chat-admin-page");

const EXEC_TIER = "tier:00000000-0000-4000-8000-000000000001";
const channel = (
  id: string,
  name: string,
  type: "PUBLIC" | "PRIVATE" | "ROLE_GATED",
) => ({
  id,
  name,
  description: null,
  type,
  who_can_see: null,
  who_can_post: null,
  category_id: "cat-1",
  is_read_only: false,
  default_notification_level: null,
});

const CHANNELS = [
  channel("ch-1", "general", "PUBLIC"),
  channel("ch-2", "exec", "PRIVATE"),
  {
    ...channel("ch-3", "officers", "ROLE_GATED"),
    who_can_see: [EXEC_TIER],
  },
];
const ACCESS_OPTIONS = [
  {
    entry: EXEC_TIER,
    kind: "tier",
    id: "00000000-0000-4000-8000-000000000001",
    name: "Executive board",
    color: null,
    tier_id: null,
    user_ids: ["u-1", "u-2"],
  },
];
const CATEGORIES = [{ id: "cat-1", name: "Chapter", display_order: 0 }];

function settled(data: unknown) {
  return {
    data,
    isPending: false,
    isLoading: false,
    isSuccess: true,
    isError: false,
    fetchStatus: "idle",
    refetch: vi.fn(),
  };
}

/** A read with nothing to show: what failed or paused before any data. */
function empty(overrides: Record<string, unknown>) {
  return { ...settled(undefined), ...overrides };
}

const CHANNELS_STALE =
  "Couldn't refresh the channels. These are the last ones that loaded.";

beforeEach(() => {
  vi.clearAllMocks();
  mockOffline.value = false;
  permissions.current = [];
  reads.channels = settled(CHANNELS);
  reads.categories = settled(CATEGORIES);
  reads.accessOptions = settled(ACCESS_OPTIONS);
  reads.reports = settled([]);
  reads.imports = settled([]);
  reads.background = { data: undefined };
});

const channelsRegion = () => screen.getByRole("region", { name: "Channels" });
const toggle = (name: string) =>
  within(channelsRegion()).getByRole("button", {
    name: new RegExp(`^${name}`),
  });
/** The name a channel row shows, without its mark or its access line. */
const channelName = (link: HTMLElement) =>
  link.querySelector(".flex-1")?.textContent ?? "";
/** A channel's row in the tree, by the name it shows. */
const queryChannelLink = (name: string) =>
  screen.queryAllByRole("link").find((link) => channelName(link) === name) ??
  null;
const channelLink = (name: string) => {
  const link = queryChannelLink(name);
  if (!link) throw new Error(`No row for #${name}`);
  return link;
};
const follows = (a: Element, b: Element) =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe("ChatAdminPage — on the page surface (#2500, #6031)", () => {
  it("draws Channels as a labelled section, with New channel in its heading and no wrapper card", () => {
    const { container } = render(<ChatAdminPage />);

    expect(
      within(channelsRegion()).getByRole("button", { name: "New channel" }),
    ).toBeInTheDocument();
    // The settings groups' own lists are the only surfaces: no card wraps
    // the page or a group.
    for (const el of cardFilledContainers(container)) {
      expect(el.tagName).toBe("UL");
    }
    expect(screen.queryByText(/Create, edit, and delete channels/)).toBeNull();
  });

  it("draws no channel editor, pins or report queue of its own", () => {
    permissions.current = [...CHAT_REPORT_QUEUE_PERMISSIONS];
    render(<ChatAdminPage />);

    expect(screen.queryByLabelText("Name")).toBeNull();
    expect(screen.queryByText(/^Pinned messages/)).toBeNull();
    expect(screen.queryByTestId("report-queue")).toBeNull();
    expect(
      screen.queryByRole("combobox", { name: "Edit a channel" }),
    ).toBeNull();
  });

  it("lets a category row's controls set its height", () => {
    render(<ChatAdminPage />);
    expect(toggle("Chapter").className).toContain("min-h-11");
  });
});

describe("ChatAdminPage — the category tree (#5727)", () => {
  it("opens a category out to its channels, each opening its own page, and folds it again", () => {
    render(<ChatAdminPage />);
    const chapter = toggle("Chapter");
    expect(chapter).toHaveAttribute("aria-expanded", "false");
    expect(chapter).toHaveTextContent("3 channels");
    expect(queryChannelLink("general")).toBeNull();

    fireEvent.click(chapter);
    expect(chapter).toHaveAttribute("aria-expanded", "true");
    const list = document.getElementById(
      chapter.getAttribute("aria-controls") ?? "",
    ) as HTMLElement;
    const links = within(list).getAllByRole("link");
    // No one has arranged them, so A to Z, as the rail draws them.
    expect(links.map(channelName)).toEqual(["exec", "general", "officers"]);
    expect(channelLink("general")).toHaveAttribute(
      "href",
      "/settings?tab=chat&channel=ch-1",
    );
    // Each row says who can see the channel.
    expect(
      within(channelLink("exec")).getByText("Only people added"),
    ).toBeInTheDocument();

    fireEvent.click(chapter);
    expect(chapter).toHaveAttribute("aria-expanded", "false");
    expect(queryChannelLink("general")).toBeNull();
  });

  it("orders a category's channels by the chapter's drag order first", () => {
    // A to Z would be exec, general, officers.
    reads.channels = settled([
      { ...CHANNELS[0], display_order: 1 },
      { ...CHANNELS[1], display_order: 2 },
      { ...CHANNELS[2], display_order: 0 },
    ]);
    render(<ChatAdminPage />);
    fireEvent.click(toggle("Chapter"));
    expect(
      within(channelsRegion()).getAllByRole("link").map(channelName),
    ).toEqual(["officers", "general", "exec"]);
  });

  it("keeps the categories in the server's order", () => {
    reads.categories = settled([
      { id: "cat-2", name: "Social", display_order: 5 },
      { id: "cat-1", name: "Chapter", display_order: 0 },
    ]);
    render(<ChatAdminPage />);
    expect(follows(toggle("Social"), toggle("Chapter"))).toBe(true);
  });

  it("says each category's access in its row", () => {
    reads.categories = settled([
      ...CATEGORIES,
      {
        id: "cat-2",
        name: "Exec",
        display_order: 1,
        who_can_see: [EXEC_TIER],
      },
    ]);
    render(<ChatAdminPage />);
    expect(toggle("Chapter")).toHaveTextContent("Everyone can see and post");
    expect(toggle("Exec")).toHaveTextContent(
      "Seen by Executive board. Posts: everyone who can see it",
    );
  });

  it("says a category with no channels is empty when opened", () => {
    reads.categories = settled([
      ...CATEGORIES,
      { id: "cat-2", name: "Social", display_order: 1 },
    ]);
    render(<ChatAdminPage />);
    expect(toggle("Social")).toHaveTextContent("0 channels");
    fireEvent.click(toggle("Social"));
    expect(
      screen.getByText("No channels in this category."),
    ).toBeInTheDocument();
  });

  it("puts channels in no category, or a deleted one, in a No category group first, as the rail does", () => {
    reads.channels = settled([
      CHANNELS[0],
      { ...CHANNELS[1], category_id: null },
      { ...CHANNELS[2], category_id: "cat-gone" },
    ]);
    render(<ChatAdminPage />);
    const none = toggle("No category");
    expect(none).toHaveAttribute("aria-expanded", "false");
    expect(none).toHaveTextContent("2 channels");
    expect(follows(none, toggle("Chapter"))).toBe(true);
    // No ⋯ menu on a group that isn't a category: nothing to rename or delete.
    expect(
      within(none.closest("li") as HTMLElement).getAllByRole("button"),
    ).toHaveLength(1);
    expect(
      screen.queryByRole("button", { name: "More for No category" }),
    ).toBeNull();
    // A category carries one.
    expect(
      within(toggle("Chapter").closest("li") as HTMLElement).getByRole(
        "button",
        { name: "More for Chapter" },
      ),
    ).toBeInTheDocument();
    fireEvent.click(none);
    expect(channelLink("exec")).toBeInTheDocument();
    expect(channelLink("officers")).toBeInTheDocument();
  });

  it("puts the audit log in a System group last, as the rail does", () => {
    reads.channels = settled([
      ...CHANNELS,
      {
        ...channel("ch-audit", "chapter-audit", "PUBLIC"),
        category_id: null,
        is_audit_log: true,
      },
    ]);
    render(<ChatAdminPage />);
    const system = toggle("System");
    expect(system).toHaveTextContent("1 channel");
    expect(follows(toggle("Chapter"), system)).toBe(true);
    // The audit log is the only channel outside a category, so there is no
    // No category group.
    expect(
      within(channelsRegion()).queryByRole("button", { name: /^No category/ }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "More for System" }),
    ).toBeNull();
    fireEvent.click(system);
    expect(channelLink("chapter-audit")).toHaveAttribute(
      "href",
      "/settings?tab=chat&channel=ch-audit",
    );
  });

  it("opens the No category group by default when the chapter has no categories, and closes it on a click", () => {
    reads.categories = settled([]);
    render(<ChatAdminPage />);
    const none = toggle("No category");
    expect(none).toHaveAttribute("aria-expanded", "true");
    expect(channelLink("general")).toHaveAttribute(
      "href",
      "/settings?tab=chat&channel=ch-1",
    );
    fireEvent.click(none);
    expect(none).toHaveAttribute("aria-expanded", "false");
    expect(queryChannelLink("general")).toBeNull();
  });

  it("keeps the officer's open or closed choice when the first category is created or the last deleted", () => {
    reads.categories = settled([]);
    reads.channels = settled(
      CHANNELS.map((c) => ({ ...c, category_id: null })),
    );
    const { rerender } = render(<ChatAdminPage />);
    // Closed by hand, then the first category arrives: it stays closed.
    fireEvent.click(toggle("No category"));
    reads.categories = settled(CATEGORIES);
    rerender(<ChatAdminPage />);
    expect(toggle("No category")).toHaveAttribute("aria-expanded", "false");
    // Opened by hand, then the last category goes: it stays open.
    fireEvent.click(toggle("No category"));
    reads.categories = settled([]);
    rerender(<ChatAdminPage />);
    expect(toggle("No category")).toHaveAttribute("aria-expanded", "true");
  });
});

describe("ChatAdminPage — a category's ⋯ menu", () => {
  async function openMenu(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: "More for Chapter" }));
  }

  it("offers who can see and post, rename and delete", async () => {
    const user = userEvent.setup();
    render(<ChatAdminPage />);
    await openMenu(user);

    const items = (await screen.findAllByRole("menuitem")).map(
      (item) => item.textContent,
    );
    expect(items).toEqual([
      "Who can see and post",
      "Rename",
      "Delete category",
    ]);
  });

  it("renames a category in place of its row, and Cancel puts the row back", async () => {
    const user = userEvent.setup();
    mockUpdateCategory.mockResolvedValue({});
    render(<ChatAdminPage />);

    await openMenu(user);
    await user.click(await screen.findByRole("menuitem", { name: "Rename" }));
    const field = screen.getByRole("textbox", { name: "Rename Chapter" });
    expect(field).toHaveValue("Chapter");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      screen.queryByRole("textbox", { name: "Rename Chapter" }),
    ).toBeNull();
    expect(toggle("Chapter")).toBeInTheDocument();

    await openMenu(user);
    await user.click(await screen.findByRole("menuitem", { name: "Rename" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Rename Chapter" }), {
      target: { value: "  " },
    });
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: "Rename Chapter" }), {
      target: { value: " Brothers " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mockUpdateCategory).toHaveBeenCalledWith({
        id: "cat-1",
        body: { name: "Brothers" },
      }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("textbox", { name: "Rename Chapter" }),
      ).toBeNull(),
    );
  });

  it("deletes a category once the officer confirms", async () => {
    const user = userEvent.setup();
    mockDeleteCategory.mockResolvedValue({});
    render(<ChatAdminPage />);

    await openMenu(user);
    await user.click(
      await screen.findByRole("menuitem", { name: "Delete category" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(/Its channels move to No category/),
    ).toBeInTheDocument();
    expect(mockDeleteCategory).not.toHaveBeenCalled();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Delete category" }),
    );

    await waitFor(() =>
      expect(mockDeleteCategory).toHaveBeenCalledWith("cat-1"),
    );
  });

  it("edits a category's lists under its row and names the channels that follow", async () => {
    const user = userEvent.setup();
    mockUpdateCategory.mockResolvedValue({});
    render(<ChatAdminPage />);

    await openMenu(user);
    await user.click(
      await screen.findByRole("menuitem", { name: "Who can see and post" }),
    );
    // #general matches the category; #officers is custom; #exec is private.
    expect(
      screen.getByText(/Saving also changes #general/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/One channel has custom access and keeps it/),
    ).toBeInTheDocument();
    // Nothing changed yet, so Save access has nothing to send.
    const see = screen.getByRole("group", { name: "Who can see" });
    fireEvent.click(within(see).getByRole("radio", { name: "Chosen roles" }));
    // An empty chosen list is refused.
    expect(screen.getByRole("button", { name: "Save access" })).toBeDisabled();
    fireEvent.click(
      within(see).getByRole("button", { name: "Add to who can see" }),
    );
    fireEvent.click(
      await screen.findByRole("option", { name: /Executive board/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save access" }));

    // Only the list the officer changed goes out.
    await waitFor(() =>
      expect(mockUpdateCategory).toHaveBeenCalledWith({
        id: "cat-1",
        body: { who_can_see: [EXEC_TIER] },
      }),
    );
  });

  it("closes the access editor without a request when nothing changed", async () => {
    const user = userEvent.setup();
    render(<ChatAdminPage />);

    await openMenu(user);
    await user.click(
      await screen.findByRole("menuitem", { name: "Who can see and post" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save access" }));

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Save access" })).toBeNull(),
    );
    expect(mockUpdateCategory).not.toHaveBeenCalled();
  });

  it("says when no channel follows the category", async () => {
    const user = userEvent.setup();
    reads.channels = settled([CHANNELS[1], CHANNELS[2]]);
    render(<ChatAdminPage />);

    await openMenu(user);
    await user.click(
      await screen.findByRole("menuitem", { name: "Who can see and post" }),
    );
    expect(
      screen.getByText(/No channel here matches it now/),
    ).toBeInTheDocument();
  });
});

describe("ChatAdminPage — New category", () => {
  it("is the group's last row, and becomes a name field that creates the category", async () => {
    mockCreateCategory.mockResolvedValue({});
    reads.categories = settled([
      { id: "cat-1", name: "Chapter", display_order: 0 },
      { id: "cat-3", name: "Social", display_order: 4 },
    ]);
    render(<ChatAdminPage />);

    const list = within(channelsRegion()).getByRole("list", {
      name: "Channels",
    });
    const rows = list.querySelectorAll(":scope > li");
    const add = within(rows[rows.length - 1] as HTMLElement).getByRole(
      "button",
      { name: "New category" },
    );
    fireEvent.click(add);

    const field = screen.getByRole("textbox", { name: "New category name" });
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
    fireEvent.change(field, { target: { value: " Alumni " } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    // One past the highest order, not the count, so none tie after a delete.
    await waitFor(() =>
      expect(mockCreateCategory).toHaveBeenCalledWith({
        name: "Alumni",
        display_order: 5,
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "New category" }),
      ).toBeInTheDocument(),
    );
  });

  it("puts the row back on Cancel without creating anything", () => {
    render(<ChatAdminPage />);
    fireEvent.click(screen.getByRole("button", { name: "New category" }));
    fireEvent.change(
      screen.getByRole("textbox", { name: "New category name" }),
      { target: { value: "Alumni" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(
      screen.queryByRole("textbox", { name: "New category name" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "New category" }),
    ).toBeInTheDocument();
    expect(mockCreateCategory).not.toHaveBeenCalled();
  });

  it("starts the first category at order 0", async () => {
    mockCreateCategory.mockResolvedValue({});
    reads.categories = settled([]);
    render(<ChatAdminPage />);
    fireEvent.click(screen.getByRole("button", { name: "New category" }));
    fireEvent.change(
      screen.getByRole("textbox", { name: "New category name" }),
      { target: { value: "Chapter" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(mockCreateCategory).toHaveBeenCalledWith({
        name: "Chapter",
        display_order: 0,
      }),
    );
  });
});

describe("ChatAdminPage — the create panel", () => {
  it("says a private channel is for the people added, and that the type is final", () => {
    render(<ChatAdminPage />);
    fireEvent.click(screen.getByRole("button", { name: "New channel" }));

    const dialog = within(screen.getByRole("dialog"));
    expect(
      dialog.getByRole("switch", { name: "Private channel" }),
    ).not.toBeChecked();
    expect(dialog.getByText(/Only people you add can see it/)).toBeVisible();
    expect(
      dialog.getByText(/type can.t be changed after it.s created/),
    ).toBeInTheDocument();
    expect(dialog.queryByText(/visible to every member/)).toBeNull();
    // No read-only switch or permission grid: the two lists replace them.
    expect(dialog.queryByText(/^Read-only/)).toBeNull();
    expect(dialog.queryAllByRole("checkbox")).toEqual([]);
  });

  it("creates a private channel with no lists", async () => {
    mockCreateChannel.mockResolvedValue({});
    render(<ChatAdminPage />);
    fireEvent.click(screen.getByRole("button", { name: "New channel" }));
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "exec" },
    });
    fireEvent.click(screen.getByRole("switch", { name: "Private channel" }));
    expect(screen.queryByRole("group", { name: "Who can see" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Create channel" }));

    await waitFor(() => expect(mockCreateChannel).toHaveBeenCalledTimes(1));
    const body = mockCreateChannel.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(body.type).toBe("PRIVATE");
    expect(body).not.toHaveProperty("who_can_see");
  });

  it("creates a channel only the chosen tier can see", async () => {
    mockCreateChannel.mockResolvedValue({});
    render(<ChatAdminPage />);
    fireEvent.click(screen.getByRole("button", { name: "New channel" }));
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "exec-board" },
    });
    const see = screen.getByRole("group", { name: "Who can see" });
    fireEvent.click(within(see).getByRole("radio", { name: "Chosen roles" }));
    // Nothing chosen yet: the panel won't create a channel nobody can see.
    expect(
      screen.getByRole("button", { name: "Create channel" }),
    ).toBeDisabled();
    fireEvent.click(
      within(see).getByRole("button", { name: "Add to who can see" }),
    );
    fireEvent.click(
      await screen.findByRole("option", { name: /Executive board/ }),
    );
    expect(
      within(see).getByText("Reaches 2 people.", { exact: false }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Create channel" }));

    await waitFor(() =>
      expect(mockCreateChannel).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "exec-board",
          type: "ROLE_GATED",
          who_can_see: [EXEC_TIER],
          who_can_post: null,
        }),
      ),
    );
  });

  // The footer's Create sits outside the form and submits it through `form=`.
  it("creates the channel from the footer's Create button", async () => {
    mockCreateChannel.mockResolvedValue({});
    render(<ChatAdminPage />);
    fireEvent.click(screen.getByRole("button", { name: "New channel" }));
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "rush-planning" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Create channel" }));

    await waitFor(() =>
      expect(mockCreateChannel).toHaveBeenCalledWith(
        expect.objectContaining({ name: "rush-planning", type: "PUBLIC" }),
      ),
    );
    // Lists untouched: the server copies the category's.
    expect(mockCreateChannel.mock.calls[0]?.[0]).not.toHaveProperty(
      "who_can_see",
    );
  });

  it("creates the channel unlocked by default, and Always formal when switched on (#3787)", async () => {
    mockCreateChannel.mockResolvedValue({});
    render(<ChatAdminPage />);
    fireEvent.click(screen.getByRole("button", { name: "New channel" }));
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "announcements-2" },
    });
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("switch", {
        name: /Always formal/,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Create channel" }));

    await waitFor(() =>
      expect(mockCreateChannel).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "announcements-2",
          display_locked: true,
        }),
      ),
    );
  });

  it("sends Always formal off when the switch is left alone (#3787)", async () => {
    mockCreateChannel.mockResolvedValue({});
    render(<ChatAdminPage />);
    fireEvent.click(screen.getByRole("button", { name: "New channel" }));
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "random-2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create channel" }));

    await waitFor(() =>
      expect(mockCreateChannel).toHaveBeenCalledWith(
        expect.objectContaining({ display_locked: false }),
      ),
    );
  });

  // Cancel gives the draft up; leaving keeps it (#4593).
  it("drops the draft on Cancel, so the next New channel starts empty", () => {
    render(<ChatAdminPage />);
    fireEvent.click(screen.getByRole("button", { name: "New channel" }));
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "rush-planning" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "New channel" }));

    expect(screen.getByLabelText("Name")).toHaveValue("");
  });
});

describe("ChatAdminPage — the create panel docked (#4593)", () => {
  const docked = () => (
    <div data-tool-column="">
      <div data-tool-page="">
        <ChatAdminPage />
      </div>
    </div>
  );

  it("opens in place of the Chat page beside chat, and the arrow keeps the draft", () => {
    render(docked());
    fireEvent.click(screen.getByRole("button", { name: "New channel" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    const region = screen.getByRole("region", { name: "Create a channel" });
    expect(region.parentElement).toHaveAttribute("data-tool-column");
    // The line under the title is the panel's description, as it was the
    // sheet's.
    expect(region).toHaveAccessibleDescription(
      /Choose who can see the channel/,
    );
    fireEvent.change(within(region).getByLabelText("Name"), {
      target: { value: "rush-planning" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Back to Chat" }));
    expect(
      screen.queryByRole("region", { name: "Create a channel" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "New channel" }));
    expect(screen.getByLabelText("Name")).toHaveValue("rush-planning");
    expect(screen.getByText("Draft restored")).toBeInTheDocument();

    // Discard starts over in place.
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(screen.getByLabelText("Name")).toHaveValue("");
    expect(screen.queryByText("Draft restored")).toBeNull();
  });

  it("reopens New channel on its draft when the page was left with it open", async () => {
    const first = render(docked());
    fireEvent.click(screen.getByRole("button", { name: "New channel" }));
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "rush-planning" },
    });
    first.unmount();

    render(docked());
    const region = await screen.findByRole("region", {
      name: "Create a channel",
    });
    expect(within(region).getByLabelText("Name")).toHaveValue("rush-planning");
    expect(within(region).getByText("Draft restored")).toBeInTheDocument();
  });

  it("keeps nothing for a New channel opened and left untouched", () => {
    render(docked());
    fireEvent.click(screen.getByRole("button", { name: "New channel" }));
    fireEvent.click(screen.getByRole("button", { name: "Back to Chat" }));
    fireEvent.click(screen.getByRole("button", { name: "New channel" }));
    expect(screen.queryByText("Draft restored")).toBeNull();
  });
});

describe("ChatAdminPage — the channel structure's states", () => {
  it("keeps the loaded channels through a failed background read, and says they are the last that loaded", () => {
    reads.channels = { ...settled(CHANNELS), isError: true };
    render(<ChatAdminPage />);

    expect(toggle("Chapter")).toHaveTextContent("3 channels");
    expect(screen.queryByText("Couldn't load channels")).toBeNull();
    expect(screen.getByText(CHANNELS_STALE)).toBeInTheDocument();
  });

  it("has the notice's live region mounted before a read fails, so its line is announced", () => {
    const { container, rerender } = render(<ChatAdminPage />);
    const regions = [...container.querySelectorAll('[role="status"]')];

    reads.channels = { ...settled(CHANNELS), isError: true };
    rerender(<ChatAdminPage />);

    expect(regions).toContain(
      screen.getByText(CHANNELS_STALE).closest('[role="status"]'),
    );
  });

  it("keeps the loaded categories through a failed background read", () => {
    reads.categories = { ...settled(CATEGORIES), isError: true };
    render(<ChatAdminPage />);

    expect(toggle("Chapter")).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load channels")).toBeNull();
    // The categories are what went stale, so the notice says so for them too.
    expect(screen.getByText(CHANNELS_STALE)).toBeInTheDocument();
  });

  it("says a chapter has no channels yet, and still offers New category", () => {
    reads.channels = settled([]);
    reads.categories = settled([]);
    render(<ChatAdminPage />);

    expect(screen.getByText("No channels yet.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "New category" }),
    ).toBeInTheDocument();
  });

  it("shows its loading state in the nested family", () => {
    reads.channels = empty({
      isPending: true,
      isLoading: true,
      fetchStatus: "fetching",
    });
    const { container } = render(<ChatAdminPage />);

    expect(screen.getByText("Loading channels")).toBeInTheDocument();
    expect(cardFilledContainers(container)).toEqual([]);
  });

  it("says what failed when the first read fails, in the nested family", () => {
    reads.channels = empty({ isError: true });
    const { container } = render(<ChatAdminPage />);

    expect(
      screen.getByRole("heading", { name: "Couldn't load channels" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Couldn't reach Frapp. Check your connection and try again.",
      ),
    ).toBeInTheDocument();
    expect(cardFilledContainers(container)).toEqual([]);
  });

  it("says the channels are unavailable offline when none are cached", () => {
    mockOffline.value = true;
    reads.channels = empty({ isPending: true, fetchStatus: "paused" });
    const { container } = render(<ChatAdminPage />);
    expect(cardFilledContainers(container)).toEqual([]);

    expect(
      screen.getByRole("heading", { name: "Channels unavailable offline" }),
    ).toBeInTheDocument();
  });
});

describe("ChatAdminPage — Look", () => {
  it("is hidden from a viewer who can't edit the chapter profile", () => {
    render(<ChatAdminPage />);
    expect(screen.queryByText("Look")).toBeNull();
    expect(screen.queryByRole("link", { name: /^Chat background/ })).toBeNull();
  });

  it("shows the chapter's background in a row that opens its page", () => {
    permissions.current = [...CHAPTER_PROFILE_PERMISSIONS];
    reads.background = { data: { background: "letters" } };
    render(<ChatAdminPage />);

    const look = screen.getByRole("list", { name: "Look" });
    const row = within(look).getByRole("link", { name: /^Chat background/ });
    expect(row).toHaveAttribute("href", "/settings?tab=chat&page=background");
    expect(row).toHaveTextContent("Letters");
    // After Channels.
    expect(follows(channelsRegion(), look)).toBe(true);
  });

  it("draws the row with no value while the background loads", () => {
    permissions.current = [...CHAPTER_PROFILE_PERMISSIONS];
    render(<ChatAdminPage />);
    expect(
      screen.getByRole("link", { name: /^Chat background/ }),
    ).toHaveTextContent(/^Chat background$/);
  });
});

describe("ChatAdminPage — Moderation", () => {
  it("is hidden from a viewer who reviews no reports and holds no Discord import", () => {
    render(<ChatAdminPage />);
    expect(screen.queryByText("Moderation")).toBeNull();
    expect(screen.queryByRole("link", { name: /^Reports/ })).toBeNull();
  });

  it("shows the open reports in a row that opens the queue's page", () => {
    permissions.current = [...CHAT_REPORT_QUEUE_PERMISSIONS];
    render(<ChatAdminPage />);

    const moderation = screen.getByRole("list", { name: "Moderation" });
    const row = within(moderation).getByRole("link", { name: /^Reports/ });
    expect(row).toHaveAttribute("href", "/settings?tab=chat&page=reports");
    expect(row).toHaveTextContent("None open");
    expect(mockChatReports).toHaveBeenCalledWith("open", undefined, true);
    // No Discord import without the tool.
    expect(
      within(moderation).queryByRole("link", { name: /^Discord import/ }),
    ).toBeNull();
    expect(mockDiscordImports).toHaveBeenCalledWith({ enabled: false });
  });

  it("counts the open reports", () => {
    permissions.current = [...CHAT_REPORT_QUEUE_PERMISSIONS];
    reads.reports = settled([{ id: "r-1" }, { id: "r-2" }]);
    render(<ChatAdminPage />);
    expect(screen.getByRole("link", { name: /^Reports/ })).toHaveTextContent(
      "2 open",
    );
  });

  it("draws the Reports row with no count while the queue loads", () => {
    permissions.current = [...CHAT_REPORT_QUEUE_PERMISSIONS];
    reads.reports = empty({ isLoading: true, isPending: true });
    render(<ChatAdminPage />);
    expect(screen.getByRole("link", { name: /^Reports/ })).toHaveTextContent(
      /^Reports$/,
    );
  });

  it("shows Discord import's state to a viewer who holds it, without Reports for a non-reviewer", () => {
    reads.imports = settled([
      {
        id: "imp-1",
        status: "completed",
        created_at: "2026-11-01T00:00:00Z",
        imported_messages: 1234,
      },
    ]);
    render(<ChatAdminPage holdsDiscordImport />);

    const moderation = screen.getByRole("list", { name: "Moderation" });
    const row = within(moderation).getByRole("link", {
      name: /^Discord import/,
    });
    expect(row).toHaveAttribute(
      "href",
      "/settings?tab=chat&tool=discord-import",
    );
    expect(row).toHaveTextContent("1,234 messages");
    expect(mockDiscordImports).toHaveBeenCalledWith({ enabled: true });
    expect(
      within(moderation).queryByRole("link", { name: /^Reports/ }),
    ).toBeNull();
  });

  it("says an import hasn't started when there is none", () => {
    render(<ChatAdminPage holdsDiscordImport />);
    expect(
      screen.getByRole("link", { name: /^Discord import/ }),
    ).toHaveTextContent("Not started");
  });

  it("puts Moderation after Look", () => {
    permissions.current = [
      ...CHAPTER_PROFILE_PERMISSIONS,
      ...CHAT_REPORT_QUEUE_PERMISSIONS,
    ];
    render(<ChatAdminPage holdsDiscordImport />);
    expect(
      follows(
        screen.getByRole("list", { name: "Look" }),
        screen.getByRole("list", { name: "Moderation" }),
      ),
    ).toBe(true);
  });
});

describe("ChatSettingsSubpage", () => {
  it("draws the whole chapter's report queue, with a way back to Chat, and reads its notices", () => {
    render(<ChatSettingsSubpage page="reports" />);

    expect(
      screen.getByRole("heading", { level: 2, name: "Reports" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Chat" })).toHaveAttribute(
      "href",
      "/settings?tab=chat",
    );
    expect(screen.getByTestId("report-queue")).toHaveAttribute(
      "data-channel",
      "chapter",
    );
    expect(mockMarkSeen).toHaveBeenCalledWith(
      [CHAT_REPORTS_NOTIFICATION_SCREEN],
      expect.anything(),
    );
  });

  it("draws the background picker as its own page", () => {
    render(<ChatSettingsSubpage page="background" />);

    expect(
      screen.getByRole("heading", { level: 2, name: "Chat background" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Chat" })).toHaveAttribute(
      "href",
      "/settings?tab=chat",
    );
    expect(screen.getByTestId("background-picker")).toBeInTheDocument();
    expect(screen.queryByTestId("report-queue")).toBeNull();
  });
});
