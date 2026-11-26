import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { markWhatsNewSeen, markWhatsNewUnread } from "@/lib/whats-new";

// next/link needs a router context jsdom lacks; render a plain anchor.
vi.mock("next/link", () => ({
  default: ({
    children,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    onClick?: () => void;
  }) => <a {...props}>{children}</a>,
}));

const useCurrentUser = vi.fn();
vi.mock("@repo/hooks", () => ({
  useCurrentUser: () => useCurrentUser(),
  useMemberDisplayNames: () => ({ avatarTintFor: () => null }),
}));

const signOutCurrentSession = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/auth/session", () => ({
  signOutCurrentSession: () => signOutCurrentSession(),
}));

const bulkDropNotice = vi.fn((): string | null => null);
vi.mock("@/lib/backwork-bulk/session", () => ({
  bulkDropNotice: () => bulkDropNotice(),
}));

const ownStatus = vi.hoisted(() => ({
  value: null as null | {
    status: "online" | "idle" | "dnd" | "invisible";
    statusEndsAt: number | null;
    line: string | null;
    lineEndsAt: number | null;
  },
}));
const save = vi.fn<(body: Record<string, unknown>) => Promise<boolean>>(
  async () => true,
);
vi.mock("@/lib/realtime/use-own-status", () => ({
  useOwnStatus: () => ownStatus.value,
  useSaveOwnStatus: () => ({ save, isSaving: false }),
}));

const presenceStatus = vi.hoisted(() => ({ value: "online" }));
vi.mock("@/lib/providers/chapter-presence-provider", () => ({
  useChapterPresenceContext: () => ({
    isReady: true,
    statusOf: () => presenceStatus.value,
    lineOf: () => null,
  }),
}));
vi.mock("@/lib/auth/use-frapp-user", () => ({
  useFrappUser: () => ({ userId: "me" }),
}));
const network = vi.hoisted(() => ({ isOffline: false }));
vi.mock("@/lib/providers/network-provider", () => ({
  useNetwork: () => ({ isOffline: network.isOffline }),
}));

const nav = vi.hoisted(() => ({
  permissions: ["*"] as string[] | undefined,
}));
vi.mock("@/lib/hooks/use-nav-permissions", () => ({
  useNavPermissions: () => nav.permissions,
}));
vi.mock("@/lib/hooks/use-chapter-module-gate", () => ({
  useChapterModuleGate: () => undefined,
}));
// A chapter unless a case makes the open tenant a council (#5933).
const tenant = vi.hoisted(() => ({ council: false }));
vi.mock("@/lib/hooks/use-tenant-kind", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/hooks/use-tenant-kind")>()),
  useTenantKind: () => (tenant.council ? "council" : "chapter"),
  useIsCouncil: () => tenant.council,
}));

const { AccountMenu } = await import("./account-menu");
type Switcher = import("./chapter-switcher").ChapterSwitcher;

const select = vi.fn();
function switcher(others: Array<{ id: string; name: string }> = []): Switcher {
  const row = (id: string, name: string) =>
    ({
      chapter_id: id,
      chapter: { name, university: "Westfield University" },
    }) as unknown as Switcher["memberships"][number];
  const otherChapters = others.map((o) => row(o.id, o.name));
  return {
    activeChapterId: "here",
    identity: null,
    failed: false,
    memberships: [row("here", "Beta Theta Omega"), ...otherChapters],
    otherChapters,
    stranded: false,
    switchingTo: null,
    select,
    dialog: null,
  };
}
const ONE_CHAPTER = switcher();

describe("AccountMenu", () => {
  beforeEach(() => {
    ownStatus.value = {
      status: "online",
      statusEndsAt: null,
      line: null,
      lineEndsAt: null,
    };
    presenceStatus.value = "online";
    network.isOffline = false;
    save.mockClear();
    bulkDropNotice.mockReturnValue(null);
    signOutCurrentSession.mockClear();
    select.mockClear();
    nav.permissions = ["*"];
    tenant.council = false;
    useCurrentUser.mockReturnValue({
      data: {
        display_name: "Paul Carlson",
        email: "paul@example.com",
        avatar_url: null,
      },
    });
  });

  it("carries the affordances it replaced", async () => {
    // Profile left the nav and the header's Sign out button was deleted in the
    // same change. If either one failed to land here it would simply be gone
    // from the dashboard — this is the only place a member can reach them now.
    // The shell then hung it off the top-bar avatar, and since #5946 off the
    // member's row at the sidebar's foot.
    const user = userEvent.setup();
    render(<AccountMenu variant="foot" switcher={ONE_CHAPTER} />);

    await user.click(screen.getByRole("button", { name: /account menu/i }));

    expect(screen.getByRole("menuitem", { name: /profile/i })).toHaveAttribute(
      "href",
      "/profile",
    );
    expect(
      screen.getByRole("menuitem", { name: /sign out/i }),
    ).toBeInTheDocument();
  });

  it("names the signed-in member on the trigger", async () => {
    render(<AccountMenu variant="foot" switcher={ONE_CHAPTER} />);
    expect(
      screen.getByRole("button", { name: /account menu for Paul Carlson/i }),
    ).toBeInTheDocument();
  });

  // `useCurrentUser` as TanStack reports a first read still out.
  const READING = { data: undefined, isError: false, fetchStatus: "fetching" };

  it("draws the row's shape, not a stand-in identity, while the user is read (#6121)", () => {
    useCurrentUser.mockReturnValue(READING);
    const { container } = render(
      <AccountMenu variant="foot" switcher={ONE_CHAPTER} />,
    );
    // The status the dot shows is still spoken; only the name waits.
    expect(
      screen.getByRole("button", { name: "Account menu, Online" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Your account")).toBeNull();
    expect(screen.queryByText("YA")).toBeNull();
    expect(container.querySelectorAll(".skeleton-shimmer").length).toBe(2);
  });

  it("draws the rail's avatar as a disc while the user is read (#6121)", () => {
    useCurrentUser.mockReturnValue(READING);
    const { container } = render(
      <AccountMenu variant="rail" switcher={ONE_CHAPTER} />,
    );
    expect(
      screen.getByRole("button", { name: "Account menu, Online" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("YA")).toBeNull();
    expect(container.querySelectorAll(".skeleton-shimmer").length).toBe(1);
  });

  it("heads the open menu with a name bar, not a stand-in, while the user is read", async () => {
    useCurrentUser.mockReturnValue(READING);
    const user = userEvent.setup();
    render(<AccountMenu variant="foot" switcher={ONE_CHAPTER} />);
    await user.click(screen.getByRole("button", { name: /account menu/i }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.queryByText("Your account")).toBeNull();
    expect(
      screen.getByRole("menu").querySelector(".skeleton-shimmer"),
    ).not.toBeNull();
  });

  it("keeps the shape through a retry paused in a hidden tab", () => {
    useCurrentUser.mockReturnValue({ ...READING, fetchStatus: "paused" });
    render(<AccountMenu variant="foot" switcher={ONE_CHAPTER} />);
    expect(screen.queryByText("Your account")).toBeNull();
  });

  it.each([
    ["failed", { data: undefined, isError: true, fetchStatus: "idle" }, false],
    [
      "can't run",
      { data: undefined, isError: false, fetchStatus: "idle" },
      false,
    ],
    ["offline", { ...READING, fetchStatus: "paused" }, true],
  ] as const)(
    "names the menu in plain words, with a person glyph, when the read %s",
    (_state, query, offline) => {
      network.isOffline = offline;
      useCurrentUser.mockReturnValue(query);
      const { container } = render(
        <AccountMenu variant="foot" switcher={ONE_CHAPTER} />,
      );
      expect(
        screen.getByRole("button", { name: /account menu for Your account/i }),
      ).toBeInTheDocument();
      expect(screen.queryByText("YA")).toBeNull();
      expect(container.querySelector(".skeleton-shimmer")).toBeNull();
      expect(container.querySelector("svg.lucide-user")).not.toBeNull();
    },
  );

  it("closes the mobile drawer behind a Profile tap", async () => {
    // The dropdown is a modal layer above the Sheet, so dismissing it is not an
    // outside-interaction on the sheet — without this the drawer and its
    // overlay stay up covering the page the member just navigated to. Every
    // nav row already gets the same callback via `renderSections`.
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    render(
      <AccountMenu
        variant="foot"
        switcher={ONE_CHAPTER}
        onNavigate={onNavigate}
      />,
    );

    await user.click(screen.getByRole("button", { name: /account menu/i }));
    await user.click(screen.getByRole("menuitem", { name: /profile/i }));

    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it("opens the member's own Settings page, the second door (#3856)", async () => {
    // The chapter menu's item is "Chapter settings"; this one is the member's, and it
    // replaced the "Notification settings" anchor into `/profile`, whose
    // settings sections moved to this page.
    const user = userEvent.setup();
    render(<AccountMenu variant="foot" switcher={ONE_CHAPTER} />);

    await user.click(screen.getByRole("button", { name: /account menu/i }));

    expect(screen.getByRole("menuitem", { name: "Settings" })).toHaveAttribute(
      "href",
      "/preferences",
    );
    expect(
      screen.queryByRole("menuitem", { name: /notification settings/i }),
    ).not.toBeInTheDocument();
  });

  it("opens What's new, the same changelog mobile Settings shows", async () => {
    const user = userEvent.setup();
    render(<AccountMenu variant="foot" switcher={ONE_CHAPTER} />);

    await user.click(screen.getByRole("button", { name: /account menu/i }));

    expect(
      screen.getByRole("menuitem", { name: /what's new/i }),
    ).toHaveAttribute("href", "/whats-new");
  });

  it("marks What's new while an entry is unread, and clears once it is seen", async () => {
    const user = userEvent.setup();
    render(<AccountMenu variant="foot" switcher={ONE_CHAPTER} />);
    act(() => markWhatsNewUnread(true));

    await user.click(screen.getByRole("button", { name: /account menu/i }));
    expect(
      screen.getByRole("menuitem", { name: "What's new, new" }),
    ).toBeInTheDocument();

    act(() => markWhatsNewSeen());
    expect(
      screen.getByRole("menuitem", { name: "What's new" }),
    ).toBeInTheDocument();
  });

  it("holds the chapter's group too: one menu for the member and the chapter (#5946)", async () => {
    // Until #5946 these lived in a second menu on the chapter's name atop the
    // nav; Paul asked for the Claude arrangement, one menu at the foot.
    const user = userEvent.setup();
    render(<AccountMenu variant="foot" switcher={ONE_CHAPTER} />);

    await user.click(screen.getByRole("button", { name: /account menu/i }));

    expect(
      screen.getByRole("menuitem", { name: "Chapter settings" }),
    ).toHaveAttribute("href", "/settings");
    expect(
      screen.getByRole("menuitem", { name: "Join another chapter" }),
    ).toHaveAttribute("href", "/join");
    // Start a council sits beside joining one (#5933).
    expect(
      screen.getByRole("menuitem", { name: "Start a council" }),
    ).toHaveAttribute("href", "/start-council");
    // School and council opens its own page (#5974).
    expect(
      screen.getByRole("menuitem", { name: "School and council" }),
    ).toHaveAttribute("href", "/affiliations");
    // One chapter: nothing to switch to, so no heading for it.
    expect(screen.queryByText("Switch chapter")).not.toBeInTheDocument();
  });

  it("in a council, names Council settings and reads each council by its type (#5933)", async () => {
    tenant.council = true;
    const council = {
      chapter_id: "ifc",
      kind: "council",
      chapter: { name: "Westfield IFC", council_type: "ifc" },
    } as unknown as Switcher["memberships"][number];
    const chapters = switcher([{ id: "two", name: "Alpha Chapter" }]);
    const withCouncil: Switcher = {
      ...chapters,
      memberships: [...chapters.memberships, council],
      otherChapters: [...chapters.otherChapters, council],
    };
    const user = userEvent.setup();
    render(<AccountMenu variant="foot" switcher={withCouncil} />);

    await user.click(screen.getByRole("button", { name: /account menu/i }));

    expect(
      screen.getByRole("menuitem", { name: "Council settings" }),
    ).toHaveAttribute("href", "/settings");
    expect(screen.getByText("Switch chapter or council")).toBeInTheDocument();
    expect(screen.getByText("Interfraternity Council")).toBeInTheDocument();
    expect(screen.getByText("Westfield University")).toBeInTheDocument();
    // A council has no school link to manage from here (#5974).
    expect(
      screen.queryByRole("menuitem", { name: "School and council" }),
    ).not.toBeInTheDocument();
  });

  it("offers School and council only to a chapter viewer who reads its config (#5974)", async () => {
    nav.permissions = ["members:view", "backwork:upload"];
    const user = userEvent.setup();
    const { unmount } = render(
      <AccountMenu variant="foot" switcher={ONE_CHAPTER} />,
    );
    await user.click(screen.getByRole("button", { name: /account menu/i }));
    expect(
      screen.getByRole("menuitem", { name: "Join another chapter" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "School and council" }),
    ).not.toBeInTheDocument();
    unmount();

    // Nor while the permission read is in flight.
    nav.permissions = undefined;
    render(<AccountMenu variant="foot" switcher={ONE_CHAPTER} />);
    await user.click(screen.getByRole("button", { name: /account menu/i }));
    expect(
      screen.getByRole("menuitem", { name: "Join another chapter" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "School and council" }),
    ).not.toBeInTheDocument();
  });

  it("offers Chapter settings only where Settings holds something for the viewer", async () => {
    nav.permissions = ["members:view"];
    const user = userEvent.setup();
    render(<AccountMenu variant="foot" switcher={ONE_CHAPTER} />);

    await user.click(screen.getByRole("button", { name: /account menu/i }));

    expect(
      screen.queryByRole("menuitem", { name: "Chapter settings" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Join another chapter" }),
    ).toBeInTheDocument();
  });

  it("lists the member's other chapters, and switches through the switcher", async () => {
    const user = userEvent.setup();
    render(
      <AccountMenu
        variant="foot"
        switcher={switcher([{ id: "there", name: "Delta Chi" }])}
      />,
    );

    await user.click(screen.getByRole("button", { name: /account menu/i }));
    expect(screen.getByText("Switch chapter")).toBeInTheDocument();
    // The chapter the member is in is not offered as a switch.
    expect(
      screen.queryByRole("menuitem", { name: /Beta Theta Omega/ }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: /Delta Chi/ }));

    expect(select).toHaveBeenCalledWith("there");
  });

  it("draws the foot row as the avatar, the name and the member's status", () => {
    ownStatus.value = {
      status: "online",
      statusEndsAt: null,
      line: "At practice",
      lineEndsAt: null,
    };
    render(<AccountMenu variant="foot" switcher={ONE_CHAPTER} />);

    const trigger = screen.getByRole("button", { name: /account menu/i });
    expect(trigger).toHaveTextContent("Paul Carlson");
    expect(trigger).toHaveTextContent("At practice");
    // The email is the menu's, not the row's.
    expect(trigger).not.toHaveTextContent("paul@example.com");
  });

  it("says the member's presence under the name when they set no status", () => {
    render(<AccountMenu variant="foot" switcher={ONE_CHAPTER} />);
    expect(
      screen.getByRole("button", { name: /account menu/i }),
    ).toHaveTextContent("Online");
  });

  it("draws the rail's trigger as the avatar alone, named for the member", () => {
    render(<AccountMenu variant="rail" switcher={ONE_CHAPTER} />);

    const trigger = screen.getByRole("button", { name: /account menu/i });
    expect(trigger).toHaveAccessibleName(/Paul Carlson/);
    expect(trigger).not.toHaveTextContent("Paul Carlson");
  });

  it("renders no theme section — Signet is dark-only", async () => {
    // The theme radio group was deleted with next-themes in the #920 shell
    // slice. If it ever reappears, this menu is the place it would land.
    const user = userEvent.setup();
    render(<AccountMenu variant="foot" switcher={ONE_CHAPTER} />);

    await user.click(screen.getByRole("button", { name: /account menu/i }));

    expect(screen.queryByText(/theme/i)).not.toBeInTheDocument();
    expect(screen.queryAllByRole("menuitemradio")).toHaveLength(0);
  });
  it("asks before signing out drops Bulk upload documents, and stays put on Cancel", async () => {
    bulkDropNotice.mockReturnValue(
      "Bulk upload has 1 document that isn't uploaded yet. Signing out drops it.",
    );
    const user = userEvent.setup();
    render(<AccountMenu variant="foot" switcher={ONE_CHAPTER} />);
    await user.click(screen.getByRole("button", { name: /account menu/i }));
    await user.click(screen.getByRole("menuitem", { name: /sign out/i }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Signing out drops it.");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(signOutCurrentSession).not.toHaveBeenCalled();
  });

  it("signs out once the member agrees to drop them", async () => {
    bulkDropNotice.mockReturnValue(
      "Bulk upload has 1 document that isn't uploaded yet. Signing out drops it.",
    );
    const user = userEvent.setup();
    render(<AccountMenu variant="foot" switcher={ONE_CHAPTER} />);
    await user.click(screen.getByRole("button", { name: /account menu/i }));
    await user.click(screen.getByRole("menuitem", { name: /sign out/i }));
    await user.click(await screen.findByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(signOutCurrentSession).toHaveBeenCalledTimes(1));
  });

  // #3845: Status is the first row, a submenu, as on Discord and Slack.
  describe("status", () => {
    async function openStatus() {
      const user = userEvent.setup();
      render(<AccountMenu variant="foot" switcher={ONE_CHAPTER} />);
      await user.click(screen.getByRole("button", { name: /account menu/i }));
      const items = screen.getAllByRole("menuitem");
      expect(items[0]).toHaveTextContent("Online");
      // The keyboard path: a pointer leaving a sub-trigger for its submenu
      // runs Radix's grace-area geometry, which jsdom has no layout for.
      items[0]!.focus();
      await user.keyboard("{ArrowRight}");
      return user;
    }

    /** Selects a submenu row the way a keyboard does. */
    async function choose(name: RegExp) {
      const item = await screen.findByRole("menuitem", { name });
      fireEvent.keyDown(item, { key: "Enter" });
    }

    it("names your own status on the trigger, since the dot is decorative", () => {
      presenceStatus.value = "dnd";
      render(<AccountMenu variant="foot" switcher={ONE_CHAPTER} />);
      expect(
        screen.getByRole("button", {
          name: "Account menu for Paul Carlson, Do Not Disturb",
        }),
      ).toBeInTheDocument();
    });

    it("picks Invisible with no end time", async () => {
      await openStatus();
      await choose(/invisible/i);
      expect(save).toHaveBeenCalledWith({
        status: "invisible",
        status_expires_at: null,
      });
    });

    it("turns on DND for 1 hour with an end time an hour out", async () => {
      const user = await openStatus();
      (
        await screen.findByRole("menuitem", { name: /do not disturb/i })
      ).focus();
      await user.keyboard("{ArrowRight}");
      const before = Date.now();
      await choose(/for 1 hour/i);
      const body = save.mock.calls[0]![0] as {
        status: string;
        status_expires_at: string;
      };
      expect(body.status).toBe("dnd");
      const ends = Date.parse(body.status_expires_at);
      expect(ends - before).toBeGreaterThanOrEqual(60 * 60 * 1000 - 1000);
      expect(ends - before).toBeLessThanOrEqual(60 * 60 * 1000 + 5000);
    });

    it("turns on DND until I turn it off with no end time", async () => {
      const user = await openStatus();
      (
        await screen.findByRole("menuitem", { name: /do not disturb/i })
      ).focus();
      await user.keyboard("{ArrowRight}");
      await choose(/until i turn it off/i);
      expect(save).toHaveBeenCalledWith({
        status: "dnd",
        status_expires_at: null,
      });
    });

    it("saves a custom status that clears at the end of today by default", async () => {
      const user = userEvent.setup();
      render(<AccountMenu variant="foot" switcher={ONE_CHAPTER} />);
      await user.click(screen.getByRole("button", { name: /account menu/i }));
      await user.click(
        screen.getByRole("menuitem", { name: /set a custom status/i }),
      );
      const dialog = await screen.findByRole("dialog");
      await user.type(
        within(dialog).getByRole("textbox", { name: "Status" }),
        "At practice till 6",
      );
      await user.click(within(dialog).getByRole("button", { name: "Save" }));

      const body = save.mock.calls[0]![0] as {
        custom_status: string;
        custom_status_expires_at: string;
      };
      expect(body.custom_status).toBe("At practice till 6");
      const end = new Date(body.custom_status_expires_at);
      expect([end.getHours(), end.getMinutes()]).toEqual([0, 0]);
      expect(end.getTime()).toBeGreaterThan(Date.now());
      expect(end.getTime() - Date.now()).toBeLessThanOrEqual(
        24 * 60 * 60 * 1000,
      );
    });

    it("shows the current line and clears it from the dialog", async () => {
      ownStatus.value = { ...ownStatus.value!, line: "Studying" };
      const user = userEvent.setup();
      render(<AccountMenu variant="foot" switcher={ONE_CHAPTER} />);
      await user.click(screen.getByRole("button", { name: /account menu/i }));
      await user.click(screen.getByRole("menuitem", { name: "Studying" }));
      const dialog = await screen.findByRole("dialog");
      await user.click(
        within(dialog).getByRole("button", { name: "Clear status" }),
      );
      expect(save).toHaveBeenCalledWith({ custom_status: null });
    });

    it("puts DND's default first, so opening the submenu lands on it", async () => {
      const user = await openStatus();
      (
        await screen.findByRole("menuitem", { name: /do not disturb/i })
      ).focus();
      await user.keyboard("{ArrowRight}");
      await user.keyboard("{Enter}");
      expect(save).toHaveBeenCalledWith({
        status: "dnd",
        status_expires_at: null,
      });
    });

    it("sends no end time for Don't clear", async () => {
      const user = userEvent.setup();
      render(<AccountMenu variant="foot" switcher={ONE_CHAPTER} />);
      await user.click(screen.getByRole("button", { name: /account menu/i }));
      await user.click(
        screen.getByRole("menuitem", { name: /set a custom status/i }),
      );
      const dialog = await screen.findByRole("dialog");
      await user.type(
        within(dialog).getByRole("textbox", { name: "Status" }),
        "Abroad",
      );
      // The keyboard path: Radix Select picks on pointer-up geometry jsdom
      // lacks. Open on Today (the default), one down is Don't clear.
      fireEvent.keyDown(
        within(dialog).getByRole("combobox", { name: "Clear after" }),
        { key: "ArrowDown" },
      );
      await screen.findByRole("option", { name: "Don't clear" });
      await user.keyboard("{ArrowDown}");
      fireEvent.keyDown(document.activeElement!, { key: " " });
      expect(
        within(dialog).getByRole("combobox", { name: "Clear after" }),
      ).toHaveTextContent("Don't clear");
      await user.click(within(dialog).getByRole("button", { name: "Save" }));
      expect(save).toHaveBeenCalledWith({
        custom_status: "Abroad",
        custom_status_expires_at: null,
      });
    });

    it("won't save a line over 80 characters", async () => {
      const user = userEvent.setup();
      render(<AccountMenu variant="foot" switcher={ONE_CHAPTER} />);
      await user.click(screen.getByRole("button", { name: /account menu/i }));
      await user.click(
        screen.getByRole("menuitem", { name: /set a custom status/i }),
      );
      const dialog = await screen.findByRole("dialog");
      const field = within(dialog).getByRole("textbox", { name: "Status" });
      fireEvent.change(field, { target: { value: "x".repeat(81) } });
      expect(
        within(dialog).getByRole("button", { name: "Save" }),
      ).toBeDisabled();
      expect(dialog).toHaveTextContent("Keep it to 80 characters.");
      fireEvent.submit(field.closest("form")!);
      expect(save).not.toHaveBeenCalled();
    });

    it("disables the status rows while offline", async () => {
      network.isOffline = true;
      const user = userEvent.setup();
      render(<AccountMenu variant="foot" switcher={ONE_CHAPTER} />);
      await user.click(screen.getByRole("button", { name: /account menu/i }));
      expect(screen.getAllByRole("menuitem")[0]).toHaveAttribute(
        "data-disabled",
      );
      expect(
        screen.getByRole("menuitem", { name: /set a custom status/i }),
      ).toHaveAttribute("data-disabled");
    });
  });
});
