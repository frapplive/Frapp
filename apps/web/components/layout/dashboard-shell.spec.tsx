import { afterEach, describe, it, expect, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { PageActions, PageViews } from "@/components/layout/page-actions";
import { ViewLabels } from "@/components/shared/view-labels";
import { NewButton } from "@/components/ui/new-button";

/*
 * The assembled shell (#5946): one sidebar holding the rows, the chapter's
 * channels and the member; no top bar from `lg` up; the page and the docked
 * conversation in `<main>`. Chat's panel and the sidebar's channel list have
 * their own specs (`chat-shell.spec.tsx`); here chat is a stub that reports
 * what the shell hands it.
 */

const {
  mockPathname,
  mockChapter,
  mockPermissions,
  mockUnread,
  mockLevels,
  mockChannels,
  unreadReads,
  mockActivity,
} = vi.hoisted(() => ({
  mockActivity: { value: undefined as unknown },
  mockPathname: { value: "/events" },
  unreadReads: { count: 0 },
  mockUnread: {
    value: [] as {
      channel_id: string;
      unread_count: number;
      mention_count: number;
    }[],
  },
  mockLevels: {
    value: [] as { channel_id: string; level: string }[] | undefined,
  },
  mockChannels: { value: [] as { id: string; type: string }[] },
  // `undefined` is a chapter read still in flight, which every test but the
  // module-gating one wants: nothing is gated until it resolves.
  mockChapter: { value: undefined as unknown },
  // `undefined` is a permission read still in flight.
  mockPermissions: { value: [] as string[] | undefined },
}));
const routerPush = vi.hoisted(() => vi.fn());
const routerReplace = vi.hoisted(() => vi.fn());
const mockSearch = vi.hoisted(() => ({ value: "" }));
/** The phone this browser runs on: none in jsdom unless a test says so. */
const device = vi.hoisted(() => ({ phone: null as "ios" | "android" | null }));
// The live-meeting card has its own spec (#5219).
vi.mock("@/components/meetings/live-meeting-card", () => ({
  LiveMeetingCard: () => null,
}));

vi.mock("@/lib/use-phone-platform", () => ({
  usePhonePlatform: () => device.phone,
  // The store app, as on app.frapp.live (`nativeAppForOrigin`).
  useNativeApp: () => ({
    id: "live.frapp.mobile",
    scheme: "frapp",
    name: "Frapp",
  }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname.value,
  useRouter: () => ({ push: routerPush, replace: routerReplace }),
  useSearchParams: () => new URLSearchParams(mockSearch.value),
}));
// Find's dialog has its own spec (`find-bar.spec.tsx`).
vi.mock("@/components/layout/find-dialog", () => ({
  FIND_PLACEHOLDER: "Search",
  COUNCIL_FIND_PLACEHOLDER: "Find channels",
  FindDialog: ({ open }: { open: boolean }) =>
    open ? <div role="dialog" aria-label="Find" /> : null,
}));
// Chat's panel has its own specs (`chat-shell.spec.tsx`); here it is a stub
// that reports what the shell hands it.
vi.mock("@/components/chat/chat-page", () => ({
  ChatPage: ({
    toolBeside,
    onClose,
    view,
    onViewChange,
    onPick,
    shown,
  }: {
    toolBeside?: boolean;
    onClose?: () => void;
    view?: string;
    onViewChange?: (view: "channels" | "direct") => void;
    onPick?: (view: "channels" | "direct", channelId: string) => void;
    shown?: boolean;
  }) => (
    <>
      <p data-testid="chat-stub">{toolBeside ? "beside a tool" : "alone"}</p>
      <p data-testid="chat-view">{view}</p>
      <p data-testid="chat-shown">{shown ? "shown" : "out of sight"}</p>
      <button type="button" onClick={() => onViewChange?.("direct")}>
        Open a DM link
      </button>
      <button type="button" onClick={() => onViewChange?.("channels")}>
        Open a channel link
      </button>
      <button type="button" onClick={() => onPick?.("channels", "c-general")}>
        Pick a channel
      </button>
      {onClose ? (
        <button type="button" onClick={onClose}>
          Close chat
        </button>
      ) : null}
    </>
  ),
}));

// Desktop-only, with its own spec; here only that the shell mounts it.
vi.mock("@/components/layout/desktop-runtime", () => ({
  DesktopRuntime: () => <span data-testid="desktop-runtime" />,
}));

vi.mock("@repo/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@repo/hooks")>();
  return {
    // The real rules for which counts mean "unread" and which get past a mute.
    sidebarUnreadCounts: actual.sidebarUnreadCounts,
    countsAddressMember: actual.countsAddressMember,
    useChannelUnreadCounts: () => {
      unreadReads.count += 1;
      return { data: mockUnread.value, isError: false };
    },
    useChannelNotificationPreferences: () => ({
      data: mockLevels.value,
      isError: false,
    }),
    useMyPermissions: () => ({
      data: mockPermissions.value
        ? { permissions: mockPermissions.value }
        : undefined,
      isPending: mockPermissions.value === undefined,
      fetchStatus: mockPermissions.value === undefined ? "fetching" : "idle",
    }),
    useHiddenUnsetFeatures: () => new Set(),
    // Activity's count (#5946): the real rule over a stubbed read.
    activityCountChip: actual.activityCountChip,
    useActivity: () => ({ data: mockActivity.value }),
    // A server with no AI, the default. Ask's entry is in the chat composer
    // (`ask/ask-host.tsx`), and the bar never carries one (#4702).
    aiAvailableFrom: actual.aiAvailableFrom,
    useAiConsent: () => ({ data: null, isError: false }),
    useAiChapterSettings: () => ({ data: undefined, isPending: true }),
    useNotifications: () => ({ data: [] }),
    // What an ordinary member's config read looks like: `GET /chapters/:id/config`
    // needs `chapter-config:view`, so it errors and never yields data.
    useOrgConfig: () => ({ data: undefined, isError: true }),
    useAccessibleChapters: () => ({ data: [], isSuccess: true }),
    useCurrentChapter: () => ({ data: mockChapter.value, isError: false }),
    useCurrentUser: () => ({ data: { display_name: "Paul Carlson" } }),
    // The What's new host (#4043): the account hasn't answered.
    useAccountWhatsNewSeen: () => ({ settled: false, seen: undefined }),
    useRecordWhatsNewSeen: () => ({ mutate: () => {} }),
    useMemberDisplayNames: () => ({ avatarTintFor: () => null }),
    useSearch: () => ({ data: undefined, isFetching: false }),
    useChannels: () => ({ data: mockChannels.value }),
    SEARCH_MIN_QUERY_LENGTH: 3,
  };
});

// ONLINE unless a test says otherwise, as the real provider defaults.
const network = vi.hoisted(() => ({
  state: "ONLINE" as "ONLINE" | "DEGRADED" | "OFFLINE",
}));
vi.mock("@/lib/providers/network-provider", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useNetwork: () => ({
    state: network.state,
    isOnline: network.state === "ONLINE",
    isDegraded: network.state === "DEGRADED",
    isOffline: network.state === "OFFLINE",
    linkOnline: network.state !== "OFFLINE",
    probeOnce: async () => {},
  }),
}));
// The account menu's own status (#3845) reads the settings query; its rows
// are `account-menu.spec.tsx`'s subject, not the shell's.
vi.mock("@/lib/realtime/use-own-status", () => ({
  useOwnStatus: () => null,
  useSaveOwnStatus: () => ({ save: vi.fn(), isSaving: false }),
}));
vi.mock("@/lib/auth/use-frapp-user", () => ({
  useFrappUser: () => ({ userId: "me" }),
}));
vi.mock("@/lib/auth/select-chapter", () => ({
  useSelectChapter: () => vi.fn(),
}));
vi.mock("@/lib/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));
vi.mock("@/lib/hooks/use-chapter-theme", () => ({ useChapterTheme: () => {} }));
vi.mock("@/lib/stores/chapter-store", () => ({
  useChapterStore: (
    selector: (s: { activeChapterId: string | null }) => unknown,
  ) => selector({ activeChapterId: "chap-1" }),
}));
// Onboarding and Terms gates render their own dialogs off their own queries;
// none is part of the shell's chrome contract.
vi.mock("@/components/onboarding/chapter-wizard-gate", () => ({
  ChapterWizardGate: () => null,
}));
vi.mock("@/components/auth/terms-prompt", () => ({
  TermsPromptGate: () => null,
}));
// The welcome gate (#5627) has its own spec.
vi.mock("@/components/onboarding/welcome-gate", () => ({
  WelcomeGate: () => null,
}));
// Whether this member has Ask (`ask-host.tsx`); null, as for one without it,
// unless a test says otherwise.
const askEntry = vi.hoisted(() => ({
  current: null as { open: boolean; openAsk: () => void } | null,
}));
vi.mock("@/components/ask/ask-host", () => ({
  useAskEntry: () => askEntry.current,
  useAskPending: () => false,
}));
const notificationsLive = vi.hoisted(() => ({ calls: 0 }));
vi.mock("@/components/layout/notifications-popover", () => ({
  NotificationsPopover: ({ children }: { children: unknown }) => children,
  useNotificationsLive: () => {
    notificationsLive.calls += 1;
  },
}));
// The binding has its own spec (`use-chat-realtime-binding.spec.tsx`); this
// one pins only that the shell mounts it, on every route (#3745).
const realtimeBinding = vi.hoisted(() => ({ calls: 0 }));
vi.mock("@/lib/chat/use-chat-realtime-binding", () => ({
  useChatRealtimeBinding: () => {
    realtimeBinding.calls += 1;
  },
}));

import { DashboardShell } from "./dashboard-shell";
import {
  CONNECTION_PILL_ATTR,
  DASHBOARD_SHELL_ATTR,
} from "@/components/shared/connection-pill-focus";

afterEach(() => {
  askEntry.current = null;
  mockPathname.value = "/events";
  mockPermissions.value = [];
  mockUnread.value = [];
  mockLevels.value = [];
  mockChannels.value = [];
  mockChapter.value = undefined;
  mockActivity.value = undefined;
  unreadReads.count = 0;
  network.state = "ONLINE";
  routerPush.mockClear();
  routerReplace.mockClear();
  mockSearch.value = "";
  setWindowWidth(null);
  document.cookie = "frapp_chat_open=; Max-Age=0; Path=/";
  document.cookie = "frapp_chat_width=; Max-Age=0; Path=/";
});

/**
 * jsdom has no `matchMedia`, which the shell reads as "width not known yet"
 * (the server and hydration case). A number answers every `min-width` query
 * as a window of that width would.
 */
function setWindowWidth(px: number | null) {
  if (px === null) {
    // @ts-expect-error -- jsdom ships none; restore that.
    delete window.matchMedia;
    return;
  }
  window.matchMedia = ((query: string) => ({
    matches: px >= Number(/min-width:\s*(\d+)px/.exec(query)?.[1] ?? 0),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

const shell = (children: React.ReactNode = <p>route content</p>, props = {}) =>
  render(<DashboardShell {...props}>{children}</DashboardShell>);
const sidebar = (container: HTMLElement) =>
  container.querySelector("[data-sidebar]") as HTMLElement;
const primary = () => screen.getByRole("navigation", { name: "Primary" });
const chatPanel = (container: HTMLElement) =>
  container.querySelector("[data-chat-panel]") as HTMLElement | null;

describe("DashboardShell", () => {
  it("mounts the desktop app's runtime, which decides for itself where it runs (#4842)", () => {
    shell();
    expect(screen.getByTestId("desktop-runtime")).toBeInTheDocument();
  });

  it("renders the route inside one main landmark that never scrolls its header away", () => {
    // The floor gate measures `main`, so its presence is a contract. A
    // `hidden` box is a scroll container: a jump deep in long minutes
    // scrolled `main` and hid the page's title and X (2026-11-20).
    shell();
    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "main-content");
    expect(main.className).toContain("overflow-clip");
    expect(screen.getByText("route content")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /skip to main content/i }),
    ).toHaveAttribute("href", "#main-content");
  });

  it("takes the full viewport and marks itself for the connection pill", () => {
    const { container } = shell();
    const root = container.firstElementChild;
    expect(root).toHaveClass("h-dvh");
    expect(root).toHaveAttribute(DASHBOARD_SHELL_ATTR);
  });

  it("points a phone at the app above main, and nothing else at it (#4002)", () => {
    device.phone = "ios";
    try {
      shell();
      expect(
        screen.getByRole("region", { name: "Frapp works best in the app" }),
      ).toBeInTheDocument();
    } finally {
      device.phone = null;
      window.localStorage.removeItem("frapp.web.get-the-app-dismissed");
    }
  });

  it("seats a page's views beside its title in the header, never in the body (Paul, 2026-11-24)", () => {
    mockPathname.value = "/events";
    for (const width of [1440, 800]) {
      setWindowWidth(width);
      const { container, unmount } = render(
        <DashboardShell>
          <PageViews>
            <ViewLabels
              label="Whose events"
              options={[
                { value: "mine", label: "Mine" },
                { value: "all", label: "Everyone's" },
              ]}
              value="mine"
              onChange={() => {}}
            />
          </PageViews>
          <p>list</p>
        </DashboardShell>,
      );
      const header = container.querySelector(
        "[data-tool-page-header]",
      ) as HTMLElement;
      const views = header.querySelector(
        "[data-tool-page-views]",
      ) as HTMLElement;
      const page = container.querySelector("[data-tool-page]") as HTMLElement;
      expect(
        within(views).getByRole("tablist", { name: "Whose events" }),
      ).toBeInTheDocument();
      expect(within(page).queryByRole("tablist")).toBeNull();
      // Before the actions slot, so the words sit beside the title.
      const actions = header.querySelector("[data-tool-page-actions]")!;
      expect(
        views.compareDocumentPosition(actions) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      // Below the side-by-side width the header shows while it holds views,
      // even with no actions.
      expect(header.className).toContain(
        "has-[[data-tool-page-views]:not(:empty)]:flex",
      );
      // The group NewButton reads to give way sooner beside views.
      expect(header.className).toContain("group/page-header");
      unmount();
    }
  });

  it("binds chat's inbox and notifications' live reads on every route, once (#3745)", () => {
    realtimeBinding.calls = 0;
    notificationsLive.calls = 0;
    shell();
    expect(realtimeBinding.calls).toBeGreaterThan(0);
    expect(notificationsLive.calls).toBeGreaterThan(0);
  });

  it("does not answer Cmd+K, and advertises no ⌘K", () => {
    shell();
    const event = new KeyboardEvent("keydown", {
      key: "k",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      window.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(false);
    expect(screen.queryByText(/⌘K/)).toBeNull();
  });

  describe("the sidebar (#5946)", () => {
    it("holds New, Search, then the five homes and More, the same for every role", () => {
      mockPermissions.value = ["*"];
      setWindowWidth(1440);
      shell();
      const rows = Array.from(primary().querySelectorAll("a, button")).map(
        (el) => el.getAttribute("aria-label") ?? el.textContent?.trim(),
      );
      expect(rows).toEqual([
        "New",
        "Search",
        "Activity",
        "Messages",
        "Calendar",
        "Resources",
        "Directory",
        "More",
      ]);
    });

    it("is 264px wide, or the 56px rail by the member's own preference", () => {
      setWindowWidth(1440);
      const { container, unmount } = shell();
      expect(sidebar(container)).toHaveClass("w-[264px]");
      unmount();
      const rail = shell(undefined, { defaultNavCollapsed: true });
      expect(sidebar(rail.container)).toHaveClass("w-14");
      expect(
        screen.getByRole("button", { name: /expand sidebar/i }),
      ).toBeInTheDocument();
      // The rail keeps the channels a click away.
      expect(
        screen.getByRole("button", { name: /^Channels/ }),
      ).toBeInTheDocument();
    });

    it("opens the channel list beside the rail's Channels button", () => {
      setWindowWidth(1440);
      shell(undefined, { defaultNavCollapsed: true });
      fireEvent.click(screen.getByRole("button", { name: /^Channels/ }));
      const popover = screen.getByRole("dialog", { name: "Channels" });
      expect(popover.querySelector("[data-channel-list-slot]")).not.toBeNull();
    });

    it("leaves no gap where a gated row will go while permissions are read (#6121)", () => {
      setWindowWidth(1440);
      mockPermissions.value = undefined;
      shell();
      expect(
        within(primary()).queryByRole("link", { name: "Directory" }),
      ).toBeNull();
      expect(primary().querySelector("[data-nav-placeholder]")).toBeNull();
      expect(primary().querySelector(".skeleton-shimmer")).toBeNull();
    });

    it("draws the chapter as a label at the head, with the bell and the collapse control, and no chapter menu", () => {
      setWindowWidth(1440);
      mockChapter.value = { name: "Beta Theta Omega", enabled_modules: {} };
      const { container } = shell();
      const bar = sidebar(container);
      expect(within(bar).getByText("Beta Theta Omega")).toBeInTheDocument();
      expect(
        within(bar).queryByRole("button", { name: /chapter menu/i }),
      ).toBeNull();
      expect(
        within(bar).getByRole("button", { name: "Notifications" }),
      ).toBeInTheDocument();
      expect(
        within(bar).getByRole("button", { name: "Collapse sidebar" }),
      ).toBeInTheDocument();
    });

    it("puts the member at the foot, with the one menu", () => {
      setWindowWidth(1440);
      const { container } = shell();
      expect(
        within(sidebar(container)).getByRole("button", {
          name: /account menu for Paul Carlson/i,
        }),
      ).toBeInTheDocument();
    });

    it("carries the connection pill in its head when there is a problem, the one indicator", () => {
      setWindowWidth(1440);
      network.state = "OFFLINE";
      const { container } = shell();
      const pills = container.querySelectorAll(`[${CONNECTION_PILL_ATTR}]`);
      // The top bar's copy is not drawn from `lg` up (`lg:hidden`).
      const inSidebar = Array.from(pills).filter((pill) =>
        sidebar(container).contains(pill),
      );
      expect(inSidebar).toHaveLength(1);
    });

    it("lights a row on its page and makes it close the page there", () => {
      setWindowWidth(1440);
      mockPathname.value = "/events";
      shell();
      const row = within(primary()).getByRole("button", {
        name: "Calendar",
      });
      expect(row).toHaveAttribute("aria-current", "page");
      fireEvent.click(row);
      expect(routerPush).toHaveBeenCalledWith("/chat");
    });

    it("lights More on a page it still holds (#5943 folds them later)", () => {
      setWindowWidth(1440);
      mockPathname.value = "/tasks";
      shell();
      expect(
        within(primary()).getByRole("button", { name: /More/ }),
      ).toHaveAttribute("aria-current", "true");
    });

    it("lights New on New's page", () => {
      setWindowWidth(1440);
      mockPathname.value = "/ask";
      shell();
      expect(
        within(primary()).getByRole("link", { name: "New" }),
      ).toHaveAttribute("aria-current", "page");
    });

    it("counts conversations with anything unread on Messages, and stops at 99+", () => {
      setWindowWidth(1440);
      mockChannels.value = [
        { id: "dm-1", type: "DM" },
        { id: "dm-2", type: "GROUP_DM" },
      ];
      mockUnread.value = [
        { channel_id: "dm-1", unread_count: 2, mention_count: 0 },
        { channel_id: "dm-2", unread_count: 1, mention_count: 0 },
      ];
      shell();
      const row = within(primary()).getByRole("link", { name: /Messages/ });
      expect(row).toHaveTextContent("2");
      expect(row).toHaveAccessibleName(/2 unread conversations/);
    });

    it("counts what is waiting on the member on Activity, as the phone's tab does", () => {
      setWindowWidth(1440);
      mockActivity.value = { needs_you_count: 140, unavailable: [] };
      shell();
      const row = within(primary()).getByRole("link", { name: /Activity/ });
      expect(row).toHaveTextContent("99+");
    });

    it("opens Find from the Search row", () => {
      setWindowWidth(1440);
      shell();
      fireEvent.click(
        within(primary()).getByRole("button", { name: "Search" }),
      );
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("hides a switched-off module's row from a member who cannot read chapter config (#1982)", () => {
      mockPermissions.value = ["members:view", "backwork:upload"];
      mockChapter.value = {
        name: "Alpha Beta Gamma",
        enabled_modules: { events: false },
      };
      setWindowWidth(1440);
      shell();
      expect(
        within(primary()).queryByRole("link", { name: "Calendar" }),
      ).toBeNull();
      expect(
        within(primary()).getByRole("link", { name: "Activity" }),
      ).toBeInTheDocument();
    });

    it("opens Backwork from Resources in a chapter with only Backwork on (#5949)", () => {
      mockPermissions.value = ["members:view", "backwork:upload"];
      mockChapter.value = {
        name: "Alpha Beta Gamma",
        enabled_modules: { documents: false, meetings: false },
      };
      setWindowWidth(1440);
      shell();
      expect(
        within(primary()).getByRole("link", { name: "Resources" }),
      ).toHaveAttribute("href", "/backwork");
    });

    it("keeps a council's sidebar to what its routes serve (#5933)", () => {
      mockChapter.value = {
        name: "Westfield IFC",
        kind: "council",
        council_type: "ifc",
        enabled_modules: {},
      };
      mockPermissions.value = ["*"];
      setWindowWidth(1440);
      shell();
      const nav = primary();
      expect(
        within(nav).getByRole("link", { name: "New" }),
      ).toBeInTheDocument();
      expect(
        within(nav).getByRole("button", { name: "Search" }),
      ).toBeInTheDocument();
      expect(
        within(nav).getByRole("link", { name: /^Messages/ }),
      ).toBeInTheDocument();
      expect(
        within(nav).getByRole("link", { name: "Directory" }),
      ).toBeInTheDocument();
      for (const name of [/^Activity/, "Calendar", "Resources"]) {
        expect(within(nav).queryByRole("link", { name })).toBeNull();
      }
      // Every row More holds is a chapter's, so a council has no More.
      expect(within(nav).queryByRole("button", { name: "More" })).toBeNull();
    });
  });

  describe("no top bar from lg (#5946)", () => {
    it("draws the bar only below lg", () => {
      const { container } = shell();
      expect(container.querySelector("[data-top-bar]")).toHaveClass(
        "lg:hidden",
      );
    });

    it("titles a page in its own header from lg up, as the route's only h1", () => {
      setWindowWidth(1440);
      mockPathname.value = "/documents";
      const { container } = shell();
      const headings = screen.getAllByRole("heading", { level: 1 });
      expect(headings).toHaveLength(1);
      expect(headings[0]).toHaveTextContent("Resources");
      expect(
        container.querySelector("[data-tool-page-header]"),
      ).toContainElement(headings[0]!);
    });

    it("titles the conversation alone for a screen reader, as the route's only h1", () => {
      setWindowWidth(1440);
      mockPathname.value = "/chat";
      shell();
      const headings = screen.getAllByRole("heading", { level: 1 });
      expect(headings).toHaveLength(1);
      expect(headings[0]).toHaveTextContent("Chat");
      expect(headings[0]).toHaveClass("sr-only");
    });

    it("titles the page in the top bar below lg, as its only h1", () => {
      setWindowWidth(800);
      mockPathname.value = "/documents";
      const { container } = shell();
      const headings = screen.getAllByRole("heading", { level: 1 });
      expect(headings).toHaveLength(1);
      expect(container.querySelector("[data-top-bar]")).toContainElement(
        headings[0]!,
      );
    });

    it("gives a page under a row its parent as a link back", () => {
      setWindowWidth(1440);
      mockPermissions.value = ["*"];
      mockPathname.value = "/backwork/upload";
      const { container } = shell();
      const header = container.querySelector(
        "[data-tool-page-header]",
      ) as HTMLElement;
      // Bulk upload is under Resources and goes back to Backwork, the view
      // it was opened from (#5949).
      expect(
        within(header).getByRole("link", { name: "Resources" }),
      ).toHaveAttribute("href", "/backwork");
    });

    it("offers no crumb to Backwork to a member who can't open Backwork", () => {
      // The Resources row showing for Documents doesn't make Backwork a door
      // this member can open.
      setWindowWidth(1440);
      mockPermissions.value = ["members:view"];
      mockPathname.value = "/backwork/upload";
      const { container } = shell();
      const header = container.querySelector(
        "[data-tool-page-header]",
      ) as HTMLElement;
      expect(
        within(header).queryByRole("link", { name: "Resources" }),
      ).toBeNull();
    });

    it("offers no crumb to Backwork while permissions are still loading (#3854)", () => {
      setWindowWidth(1440);
      mockPermissions.value = undefined;
      mockPathname.value = "/backwork/upload";
      const { container } = shell();
      const header = container.querySelector(
        "[data-tool-page-header]",
      ) as HTMLElement;
      expect(
        within(header).queryByRole("link", { name: "Resources" }),
      ).toBeNull();
    });

    it("titles New for a member without Frapp Intelligence by what it is", () => {
      setWindowWidth(1440);
      mockPathname.value = "/ask";
      shell();
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        "New",
      );
      askEntry.current = { open: true, openAsk: () => {} };
      mockPathname.value = "/ask";
    });

    it("puts a page's actions in its own header beside the X, at every width (Paul, 2026-11-19)", () => {
      mockPathname.value = "/events";
      for (const width of [1440, 800]) {
        setWindowWidth(width);
        const { container, unmount } = shell(
          <>
            <PageActions>
              <NewButton thing="event" />
            </PageActions>
            <p>list</p>
          </>,
        );
        const header = container.querySelector(
          "[data-tool-page-header]",
        ) as HTMLElement;
        expect(
          within(header).getByRole("button", { name: "New event" }),
        ).toBeInTheDocument();
        unmount();
      }
    });
  });

  describe("the conversation beside a page (#3779, #5575, #5946)", () => {
    it("has the row to itself on /chat, with no home view, whatever the cookie says", () => {
      setWindowWidth(1440);
      mockPathname.value = "/chat";
      const { container } = shell(null, { defaultChatOpen: false });
      expect(chatPanel(container)).toHaveClass("flex-1");
      expect(screen.getByTestId("chat-stub")).toHaveTextContent("alone");
      expect(screen.getByTestId("chat-shown")).toHaveTextContent("shown");
      expect(container.querySelector("[data-chapter-home]")).toBeNull();
      expect(container.querySelector("[data-tool-page]")).toBeNull();
    });

    it("docks on the right of a page with the divider, at the member's width", () => {
      setWindowWidth(1440);
      mockPathname.value = "/tasks";
      const { container } = shell(<p>tasks</p>, { defaultChatWidth: 420 });
      const main = screen.getByRole("main");
      const tool = container.querySelector("[data-tool-column]")!;
      const panel = chatPanel(container)!;
      expect(Array.from(main.children).indexOf(tool)).toBe(0);
      expect(main.lastElementChild).toBe(panel);
      expect(panel.style.flex).toBe("0 1 420px");
      expect(panel.style.minWidth).toBe("375px");
      expect(screen.getByRole("separator")).toBeInTheDocument();
      expect(screen.getByTestId("chat-stub")).toHaveTextContent("beside");
    });

    it("closes with its X, and stays mounted out of sight for the sidebar's list", async () => {
      setWindowWidth(1440);
      mockPathname.value = "/tasks";
      const { container } = shell();
      fireEvent.click(screen.getByRole("button", { name: "Close chat" }));
      // Once its exit has played.
      await waitFor(() =>
        expect(screen.getByTestId("chat-shown")).toHaveTextContent(
          "out of sight",
        ),
      );
      expect(chatPanel(container)).not.toBeNull();
      expect(document.cookie).toContain("frapp_chat_open=0");
    });

    it("comes back when the member picks a channel from the sidebar", () => {
      setWindowWidth(1440);
      mockPathname.value = "/tasks";
      shell(undefined, { defaultChatOpen: false });
      expect(screen.getByTestId("chat-shown")).toHaveTextContent(
        "out of sight",
      );
      fireEvent.click(screen.getByRole("button", { name: "Pick a channel" }));
      expect(screen.getByTestId("chat-shown")).toHaveTextContent("shown");
    });

    it("hides beside Chapter settings, and a pick there goes to the conversation", () => {
      setWindowWidth(1440);
      mockPathname.value = "/settings";
      const { container } = shell();
      expect(chatPanel(container)).toHaveClass("hidden");
      expect(screen.getByTestId("chat-shown")).toHaveTextContent(
        "out of sight",
      );
      fireEvent.click(screen.getByRole("button", { name: "Pick a channel" }));
      expect(routerPush).toHaveBeenCalledWith("/chat?channel=c-general");
    });

    it("is not built beside a page below lg, where the shell is one page", () => {
      setWindowWidth(800);
      mockPathname.value = "/tasks";
      const { container } = shell();
      expect(chatPanel(container)).toBeNull();
    });
  });

  it("draws one sidebar on the server, the list's and the docked panel's places held, and no chat built yet", () => {
    mockPathname.value = "/events";
    const html = renderToString(<DashboardShell>events</DashboardShell>);
    expect(html.match(/data-sidebar=""/g)).toHaveLength(1);
    expect(html).toContain("data-channel-list-slot");
    // The docked panel holds its place, so the page paints at its final
    // width; chat itself waits for a known-wide window.
    expect(html).toContain("data-chat-panel");
    expect(html).not.toContain('data-testid="chat-stub"');
  });

  describe("the Messages page (#5946)", () => {
    it("is the panel with the member's conversations listed, and lights its row", () => {
      setWindowWidth(1440);
      mockPathname.value = "/messages";
      shell();
      expect(screen.getByTestId("chat-view")).toHaveTextContent("direct");
      expect(screen.getByTestId("chat-stub")).toHaveTextContent("alone");
      expect(
        within(primary()).getByRole("link", { name: /Messages/ }),
      ).toHaveAttribute("aria-current", "page");
    });

    it("moves a link into a DM from /chat to Messages, keeping its target", () => {
      setWindowWidth(1440);
      mockPathname.value = "/chat";
      mockSearch.value = "channel=dm-1";
      shell();
      expect(screen.getByTestId("chat-view")).toHaveTextContent("channels");
      fireEvent.click(screen.getByRole("button", { name: "Open a DM link" }));
      expect(routerReplace).toHaveBeenCalledWith("/messages?channel=dm-1");
    });

    it("moves a channel picked from the sidebar off Messages to that conversation, and nothing replaces the push", () => {
      setWindowWidth(1440);
      mockPathname.value = "/messages";
      mockSearch.value = "channel=dm-1";
      shell();
      fireEvent.click(screen.getByRole("button", { name: "Pick a channel" }));
      expect(routerPush).toHaveBeenCalledWith("/chat?channel=c-general");
      // The panel then reports a channel open on Messages, in the same click.
      fireEvent.click(
        screen.getByRole("button", { name: "Open a channel link" }),
      );
      expect(routerReplace).not.toHaveBeenCalled();
    });

    it("leaves a docked conversation alone beside a page, whichever kind it is", () => {
      setWindowWidth(1440);
      mockPathname.value = "/tasks";
      shell();
      fireEvent.click(screen.getByRole("button", { name: "Open a DM link" }));
      expect(routerReplace).not.toHaveBeenCalled();
    });
  });

  describe("below lg (#5946)", () => {
    it("opens the same sidebar in the drawer, with Channels as a row and the member at the foot", () => {
      setWindowWidth(800);
      shell();
      fireEvent.click(
        screen.getByRole("button", { name: /open navigation menu/i }),
      );
      const drawer = screen.getByRole("dialog");
      expect(
        within(drawer).getByRole("link", { name: "New" }),
      ).toBeInTheDocument();
      expect(
        within(drawer).getByRole("link", { name: "Channels" }),
      ).toHaveAttribute("href", "/chat");
      expect(
        within(drawer).getByRole("button", { name: /account menu/i }),
      ).toBeInTheDocument();
    });

    it("marks the drawer trigger while anything in chat is unread (#3900)", () => {
      setWindowWidth(800);
      mockChannels.value = [{ id: "c1", type: "TEXT" }];
      mockLevels.value = [{ channel_id: "c1", level: "all" }];
      mockUnread.value = [
        { channel_id: "c1", unread_count: 3, mention_count: 0 },
      ];
      shell();
      expect(
        screen.getByRole("button", {
          name: "Open navigation menu, unread messages",
        }),
      ).toBeInTheDocument();
    });
  });
});
