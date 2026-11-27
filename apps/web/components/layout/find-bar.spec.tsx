import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  assertContentFreeProperties,
  type AnalyticsProperties,
} from "@repo/validation";
import { AnalyticsContext } from "@/lib/providers/analytics-provider";

const {
  push,
  searchQuery,
  channelsQuery,
  departmentsQuery,
  departmentsOptions,
  moduleGate,
  permissionList,
  debounced,
  jumpState,
} = vi.hoisted(() => ({
  push: vi.fn(),
  searchQuery: {
    current: {
      data: undefined as unknown,
      isFetching: false,
      isError: false,
      dataUpdatedAt: 1,
    },
  },
  channelsQuery: { current: { data: [] as unknown[] } },
  departmentsQuery: { current: { data: [] as unknown[] } },
  departmentsOptions: {
    current: undefined as { enabled?: boolean } | undefined,
  },
  moduleGate: {
    current: undefined as ((key: string) => boolean) | undefined,
  },
  permissionList: { current: [] as string[] },
  // `null` passes the live value through; a string pins the debounced one.
  debounced: { current: null as string | null },
  // Jump to a channel's lists (#6053); empty unless a case fills them.
  jumpState: {
    current: {
      channels: [] as { id: string; name: string; type: string }[],
      unread: [] as { id: string; name: string; type: string }[],
      recent: [] as { id: string; name: string; type: string }[],
      countsFor: (() => undefined) as (
        id: string,
      ) => { unreadCount: number; mentionCount: number } | undefined,
      looksUnread: (() => false) as (id: string) => boolean,
      categoryOf: (() => undefined) as (channel: unknown) => string | undefined,
    },
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

// The active tenant is a chapter here; councils have their own cases (#5933).
vi.mock("@/lib/hooks/use-tenant-kind", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/hooks/use-tenant-kind")>()),
  useTenantKind: () => "chapter",
  useIsCouncil: () => false,
  useTenantIdentity: () => ({ kind: "chapter", councilType: null }),
}));

vi.mock("@repo/hooks", async () => ({
  // The jump rules run for real (#6053); only their data is stubbed.
  ...(await vi.importActual<typeof import("@repo/hooks/channel-jump")>(
    "@repo/hooks/channel-jump",
  )),
  ...(await vi.importActual<typeof import("@repo/hooks/channel-badge")>(
    "@repo/hooks/channel-badge",
  )),
  // The search's Channels group reads `findChannels`: the channels a case
  // put in the jump state, else the channel read's rows.
  useChannelJump: () => ({
    countsKnown: true,
    isMuted: () => false,
    ...jumpState.current,
    findChannels: (jumpState.current.channels.length > 0
      ? jumpState.current.channels
      : (channelsQuery.current.data as { id: string; name: string }[])
    ).map((channel) => ({ ...channel, category: undefined })),
  }),
  useActiveChapterId: () => "chapter-1",
  useSearch: () => searchQuery.current,
  useChannels: () => channelsQuery.current,
  useDepartments: (options?: { enabled?: boolean }) => {
    departmentsOptions.current = options;
    return departmentsQuery.current;
  },
  usePermissionList: () => permissionList.current,
  useAiConsent: () => ({ data: null }),
  aiAvailableFrom: () => false,
  SEARCH_MIN_QUERY_LENGTH: 3,
  SEARCH_COMPLETED_EVENT: "search-completed",
}));

vi.mock("@/lib/chat/viewer-id", () => ({
  useChatViewerId: () => "viewer-1",
}));

vi.mock("@/lib/hooks/use-chapter-module-gate", () => ({
  useChapterModuleGate: () => moduleGate.current,
}));

// The debounce is real elsewhere; here it would only make every assertion
// wait. A test that needs the list to trail the text pins `debounced`.
vi.mock("@/lib/hooks/use-debounced-value", () => ({
  useDebouncedValue: (value: unknown) => debounced.current ?? value,
}));

import { FindField, FindProvider, useFind } from "./find-bar";
import { FIND_PLACEHOLDER } from "./find-dialog";

/** Find as the top bar draws it below `lg`: the field, inside the provider. */
function FindBar() {
  return (
    <FindProvider>
      <FindField />
    </FindProvider>
  );
}

// Offsetless instants on purpose: they parse as local time, so the calendar
// days the assertions name hold in every runner timezone.
function searchPayload() {
  return {
    payload: {
      members: [
        { user_id: "u1", display_name: "Ada Lovelace", email: "ada@x.co" },
      ],
      messages: [
        {
          id: "m1",
          content: "announce the thing",
          channel_id: "c1",
          created_at: "2026-10-28T19:08:00",
        },
      ],
      events: [
        { id: "e1", name: "announce party", start_time: "2026-11-09T19:00:00" },
      ],
      backwork: [
        {
          id: "b1",
          title: "announcements 101",
          department_id: "d1",
          course_number: "101",
          semester: "Fall",
          year: 2025,
          created_at: "2025-09-14T12:00:00",
        },
      ],
    },
    timedOut: false,
    timedOutSources: [],
  };
}

/** The shape `useSearch` returns, with sane defaults. */
function searchState(
  over: Partial<{
    data: unknown;
    isFetching: boolean;
    isError: boolean;
    dataUpdatedAt: number;
  }> = {},
) {
  return {
    data: undefined as unknown,
    isFetching: false,
    isError: false,
    dataUpdatedAt: 1,
    ...over,
  };
}

function chord(over: Partial<KeyboardEventInit> = {}) {
  const event = new KeyboardEvent("keydown", {
    key: "f",
    metaKey: true,
    bubbles: true,
    cancelable: true,
    ...over,
  });
  act(() => {
    window.dispatchEvent(event);
  });
  return event;
}

function trigger() {
  return screen.getByRole("button", { name: FIND_PLACEHOLDER });
}

/** Opens the dialog from the top-bar field and types a query into it. */
async function openAndType(
  user: ReturnType<typeof userEvent.setup>,
  text: string,
) {
  await user.click(trigger());
  const input = await screen.findByRole("combobox");
  await user.type(input, text);
  return input;
}

function renderWithTrack(
  track: (name: string, properties?: AnalyticsProperties) => void,
) {
  return render(
    <AnalyticsContext.Provider value={track}>
      <FindBar />
    </AnalyticsContext.Provider>,
  );
}

describe("FindBar", () => {
  beforeEach(() => {
    push.mockClear();
    searchQuery.current = searchState();
    channelsQuery.current = { data: [] };
    departmentsQuery.current = { data: [{ id: "d1", code: "COGS" }] };
    departmentsOptions.current = undefined;
    moduleGate.current = () => true;
    permissionList.current = ["members:view", "backwork:upload"];
    debounced.current = null;
    jumpState.current = {
      channels: [],
      unread: [],
      recent: [],
      countsFor: () => undefined,
      looksUnread: () => false,
      categoryOf: () => undefined,
    };
  });

  it("carries no keyboard hint, closed or open", async () => {
    // The ⌘F / esc keycap was removed (2026-11-05); the binding still works,
    // it just is not advertised. The palette before it advertised ⌘K, which
    // nothing binds (components.md §7).
    const user = userEvent.setup();
    render(<FindBar />);
    expect(screen.queryByText("⌘F")).not.toBeInTheDocument();
    expect(screen.queryByText(/⌘K/)).not.toBeInTheDocument();
    await user.click(trigger());
    await screen.findByRole("dialog");
    expect(screen.queryByText("esc")).not.toBeInTheDocument();
    expect(screen.queryByText("⌘F")).not.toBeInTheDocument();
  });

  it("opens the dialog on Cmd+F instead of the browser's own find", async () => {
    render(<FindBar />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    const event = chord();

    expect(event.defaultPrevented).toBe(true);
    const input = await screen.findByRole("combobox");
    await waitFor(() => expect(input).toHaveFocus());
  });

  it("binds Ctrl+F too, for anyone not on a Mac", async () => {
    render(<FindBar />);
    chord({ metaKey: false, ctrlKey: true });
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("does not re-fire while the chord is held down", () => {
    render(<FindBar />);
    const event = chord({ repeat: true });
    expect(event.defaultPrevented).toBe(false);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("leaves the chord alone while someone is typing elsewhere", () => {
    render(
      <>
        <textarea aria-label="Composer" />
        <FindBar />
      </>,
    );
    screen.getByLabelText("Composer").focus();
    const event = chord();
    expect(event.defaultPrevented).toBe(false);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("stands down inside another modal layer rather than killing native find", () => {
    render(<FindBar />);
    const guard = document.createElement("span");
    guard.setAttribute("data-radix-focus-guard", "");
    document.body.appendChild(guard);

    const event = chord();

    expect(event.defaultPrevented).toBe(false);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    guard.remove();
  });

  it("sends Cmd+F back to the search text when the dialog is already open", async () => {
    const user = userEvent.setup();
    render(<FindBar />);
    const input = await openAndType(user, "abc");
    // Move focus off the input, inside the dialog, then press the chord.
    screen.getByRole("button", { name: "All" }).focus();
    const event = chord();
    expect(event.defaultPrevented).toBe(true);
    expect(input).toHaveFocus();
  });

  it("ranks channels, members, messages, events, then backwork", async () => {
    channelsQuery.current = {
      data: [{ id: "c1", name: "announcements", category: "General" }],
    };
    searchQuery.current = searchState({ data: searchPayload() });

    const user = userEvent.setup();
    render(<FindBar />);
    await openAndType(user, "announce");

    const listbox = within(screen.getByRole("listbox"));
    const headings = listbox
      .getAllByText(/^(Channels|Members|Messages|Events|Backwork)$/)
      .map((el) => el.textContent);
    expect(headings).toEqual([
      "Channels",
      "Members",
      "Messages",
      "Events",
      "Backwork",
    ]);
  });

  it("dates every dated result and names a backwork file's course and term", async () => {
    channelsQuery.current = { data: [{ id: "c1", name: "announcements" }] };
    searchQuery.current = searchState({ data: searchPayload() });

    const user = userEvent.setup();
    render(<FindBar />);
    await openAndType(user, "announce");

    const backwork = screen.getByRole("option", { name: /announcements 101/ });
    expect(backwork).toHaveTextContent(
      /COGS 101 · Fall 2025 · added September 14/,
    );
    const message = screen.getByRole("option", { name: /announce the thing/ });
    expect(message).toHaveTextContent(/#announcements · October 28/);
    const event = screen.getByRole("option", { name: /announce party/ });
    expect(event).toHaveTextContent(/November 9/);
  });

  it("hides a group whose module the chapter switched off", async () => {
    moduleGate.current = (key) => key !== "backwork";
    searchQuery.current = searchState({ data: searchPayload() });

    const user = userEvent.setup();
    render(<FindBar />);
    await openAndType(user, "announce");

    expect(screen.queryByText("announcements 101")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Backwork" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("announce party")).toBeInTheDocument();
  });

  it("hides Events when the events module is off", async () => {
    moduleGate.current = (key) => key !== "events";
    searchQuery.current = searchState({ data: searchPayload() });

    const user = userEvent.setup();
    render(<FindBar />);
    await openAndType(user, "announce");

    expect(screen.queryByText("announce party")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Events" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("announcements 101")).toBeInTheDocument();
  });

  it("keeps the module groups out until the module gate has loaded", async () => {
    // Right after a chapter switch the gate is still loading; the rows are
    // data a switched-off module would not show, so they wait for it.
    moduleGate.current = undefined;
    searchQuery.current = searchState({ data: searchPayload() });

    const user = userEvent.setup();
    render(<FindBar />);
    await openAndType(user, "announce");

    expect(screen.queryByText("announce party")).not.toBeInTheDocument();
    expect(screen.queryByText("announcements 101")).not.toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
  });

  it("hides Backwork, and skips the department read, for a member the library refuses", async () => {
    permissionList.current = ["members:view", "alumni:post"];
    searchQuery.current = searchState({ data: searchPayload() });

    const user = userEvent.setup();
    render(<FindBar />);
    await openAndType(user, "announce");

    expect(screen.queryByText("announcements 101")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Backwork" }),
    ).not.toBeInTheDocument();
    expect(departmentsOptions.current).toEqual({ enabled: false });
  });

  it("reads departments for a member who may browse backwork", async () => {
    const user = userEvent.setup();
    render(<FindBar />);
    await openAndType(user, "announce");
    expect(departmentsOptions.current).toEqual({ enabled: true });
  });

  it("narrows to one group with a chip", async () => {
    channelsQuery.current = { data: [{ id: "c1", name: "announcements" }] };
    searchQuery.current = searchState({ data: searchPayload() });

    const user = userEvent.setup();
    render(<FindBar />);
    await openAndType(user, "announce");
    await user.click(screen.getByRole("button", { name: "Events" }));

    expect(screen.getByRole("button", { name: "Events" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent("announce party");
    expect(options[0]).toHaveAttribute("aria-selected", "true");
  });

  it("preselects the first hit and opens it on Enter", async () => {
    channelsQuery.current = { data: [{ id: "c1", name: "announcements" }] };
    searchQuery.current = searchState({ data: searchPayload() });

    const user = userEvent.setup();
    render(<FindBar />);
    const input = await openAndType(user, "announce");

    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/chat?channel=c1"));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("moves the selection with the arrow keys", async () => {
    channelsQuery.current = { data: [{ id: "c1", name: "announcements" }] };
    searchQuery.current = searchState({ data: searchPayload() });

    const user = userEvent.setup();
    render(<FindBar />);
    const input = await openAndType(user, "announce");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    const options = screen.getAllByRole("option");
    expect(options[1]).toHaveAttribute("aria-selected", "true");
    expect(input).toHaveAttribute("aria-activedescendant", options[1]!.id);
  });

  it("ignores Enter while the list still belongs to the previous text", async () => {
    channelsQuery.current = { data: [{ id: "c1", name: "announcements" }] };
    searchQuery.current = searchState({ data: searchPayload() });

    const user = userEvent.setup();
    render(<FindBar />);
    const input = await openAndType(user, "announce");
    // The member types on; the debounced query (and so the list) lags.
    debounced.current = "announce";
    await user.type(input, "x");

    fireEvent.keyDown(input, { key: "Enter" });
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("leaves an IME's Enter to the IME", async () => {
    channelsQuery.current = { data: [{ id: "c1", name: "announcements" }] };
    searchQuery.current = searchState({ data: searchPayload() });

    const user = userEvent.setup();
    render(<FindBar />);
    const input = await openAndType(user, "announce");

    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    expect(push).not.toHaveBeenCalled();
  });

  it("draws result rows on the Row step: 28 on a mouse, 44 on touch", async () => {
    // foundations.md §9 (#3515). The row is hand-rolled, so the primitives'
    // touch-floor spec does not cover it.
    channelsQuery.current = { data: [{ id: "c1", name: "announcements" }] };
    searchQuery.current = searchState({ data: searchPayload() });

    const user = userEvent.setup();
    render(<FindBar />);
    await openAndType(user, "announce");

    for (const option of screen.getAllByRole("option")) {
      const classes = option.className.split(/\s+/);
      expect(classes).toEqual(
        expect.arrayContaining([
          "min-h-control-row",
          "text-sm",
          "pointer-coarse:min-h-11",
          "pointer-coarse:text-base",
        ]),
      );
      // Only heights split by pointer; padding never does (§9).
      expect(
        classes.filter((c) => /^pointer-coarse:p[xytrbl]?-/.test(c)),
      ).toEqual([]);
    }
  });

  it("lists the settings the member can change, after Channels", async () => {
    channelsQuery.current = { data: [] };
    searchQuery.current = searchState({ data: searchPayload() });
    const user = userEvent.setup();
    render(<FindBar />);
    await openAndType(user, "quiet hours");
    const option = await screen.findByRole("option", { name: /Quiet hours/ });
    expect(option).toHaveTextContent("Settings · Notifications");
    expect(
      screen.getByRole("button", { name: "Settings", pressed: false }),
    ).toBeInTheDocument();
    await user.click(option);
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(
        "/preferences?section=notifications&setting=quiet-hours",
      ),
    );
  });

  // #6053: Jump to a channel. Below a search's minimum, Find lists the
  // channels that match, at once, and runs no search.
  describe("Jump to a channel (#6053)", () => {
    const rush = { id: "c-rush", name: "rush-events", type: "PUBLIC" };
    const brunch = { id: "c-brunch", name: "brunch", type: "PUBLIC" };
    const general = { id: "c-gen", name: "general", type: "PUBLIC" };
    const exec = { id: "c-exec", name: "exec", type: "PRIVATE" };

    it("lists the channels two letters match, best first, with no chips", async () => {
      jumpState.current = {
        ...jumpState.current,
        channels: [brunch, rush, general],
        categoryOf: (channel) =>
          (channel as { id: string }).id === "c-rush"
            ? "Recruitment"
            : undefined,
      };
      const user = userEvent.setup();
      render(<FindBar />);
      await openAndType(user, "ru");
      const options = screen.getAllByRole("option");
      expect(options.map((o) => o.textContent)).toEqual([
        "rush-eventsRecruitment",
        "brunch",
      ]);
      expect(screen.getByRole("combobox")).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      expect(screen.queryByRole("group", { name: "Show" })).toBeNull();
      expect(
        screen.getByText("Messages, events and more from 3 letters."),
      ).toBeInTheDocument();
    });

    it("opens a channel on Enter without waiting for the search's debounce", async () => {
      jumpState.current = { ...jumpState.current, channels: [rush] };
      // The debounced text trails: a search would ignore Enter here.
      debounced.current = "";
      const user = userEvent.setup();
      render(<FindBar />);
      await openAndType(user, "ru");
      await user.keyboard("{Enter}");
      expect(push).toHaveBeenCalledWith(
        expect.stringContaining("channel=c-rush"),
      );
    });

    it("says so when no channel matches", async () => {
      jumpState.current = { ...jumpState.current, channels: [general] };
      const user = userEvent.setup();
      render(<FindBar />);
      await openAndType(user, "zz");
      expect(screen.queryAllByRole("option")).toHaveLength(0);
      expect(screen.getByText("No channels match.")).toBeInTheDocument();
    });

    it("opens on Unread then Recently opened, unread bold, a mention counted", async () => {
      jumpState.current = {
        ...jumpState.current,
        channels: [exec, rush, general],
        unread: [exec, rush],
        recent: [general],
        countsFor: (id) =>
          id === "c-exec"
            ? { unreadCount: 3, mentionCount: 1 }
            : id === "c-rush"
              ? { unreadCount: 4, mentionCount: 0 }
              : undefined,
        looksUnread: (id) => id !== "c-gen",
      };
      const user = userEvent.setup();
      render(<FindBar />);
      await user.click(trigger());
      await screen.findByRole("combobox");
      expect(screen.getByRole("group", { name: "Unread" })).toBeInTheDocument();
      expect(
        screen.getByRole("group", { name: "Recently opened" }),
      ).toBeInTheDocument();
      const [first, second, third] = screen.getAllByRole("option");
      // A mention carries its count; a plain unread carries none (§5).
      // A screen reader hears the channel list's words for each.
      expect(first).toHaveTextContent("exec@ 1, 1 mention, 3 unread");
      expect(within(first!).getByText("@ 1")).toHaveAttribute(
        "aria-hidden",
        "true",
      );
      expect(second).toHaveTextContent(/^rush-events, 4 unread messages$/);
      expect(third).toHaveTextContent(/^general$/);
      expect(within(second!).getByText("rush-events")).toHaveClass("font-bold");
      expect(within(third!).getByText("general")).not.toHaveClass("font-bold");
      await user.keyboard("{Enter}");
      expect(push).toHaveBeenCalledWith(
        expect.stringContaining("channel=c-exec"),
      );
    });

    it("opens Find on Cmd+K and Ctrl+K", async () => {
      render(<FindBar />);
      const event = chord({ key: "k" });
      expect(event.defaultPrevented).toBe(true);
      expect(await screen.findByRole("dialog")).toBeInTheDocument();
    });

    it("opens on Cmd+K from a text field, where Cmd+F stays the browser's", async () => {
      // The composer is the usual place to press it. jsdom has no
      // `isContentEditable`, so a text area stands in for the composer.
      render(
        <>
          <FindBar />
          <textarea aria-label="Message" />
        </>,
      );
      act(() => screen.getByRole("textbox", { name: "Message" }).focus());
      const find = chord();
      expect(find.defaultPrevented).toBe(false);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      chord({ key: "k", metaKey: false, ctrlKey: true });
      expect(await screen.findByRole("dialog")).toBeInTheDocument();
    });

    it("leaves a Mac's Ctrl+K to a text field, where only Cmd+K opens Find", async () => {
      const platform = Object.getOwnPropertyDescriptor(
        window.navigator,
        "platform",
      );
      Object.defineProperty(window.navigator, "platform", {
        value: "MacIntel",
        configurable: true,
      });
      try {
        render(
          <>
            <FindBar />
            <textarea aria-label="Message" />
          </>,
        );
        act(() => screen.getByRole("textbox", { name: "Message" }).focus());
        // Ctrl+K deletes to the end of the line there.
        const kill = chord({ key: "k", metaKey: false, ctrlKey: true });
        expect(kill.defaultPrevented).toBe(false);
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        chord({ key: "k" });
        expect(await screen.findByRole("dialog")).toBeInTheDocument();
      } finally {
        if (platform) {
          Object.defineProperty(window.navigator, "platform", platform);
        } else {
          delete (window.navigator as { platform?: string }).platform;
        }
      }
    });

    it("opens empty on Cmd+K, on the lists, though Find kept a search", async () => {
      channelsQuery.current = { data: [{ id: "c1", name: "announcements" }] };
      searchQuery.current = searchState({ data: searchPayload() });
      jumpState.current = { ...jumpState.current, unread: [general] };
      const user = userEvent.setup();
      render(<FindBar />);
      await openAndType(user, "announce");
      await user.keyboard("{Escape}");
      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
      chord({ key: "k" });
      expect(await screen.findByRole("combobox")).toHaveValue("");
      expect(screen.getByRole("group", { name: "Unread" })).toBeInTheDocument();
    });

    it("treats a lone # as nothing typed, and matches by the letters after it", async () => {
      jumpState.current = {
        ...jumpState.current,
        channels: [rush, general],
        unread: [rush],
      };
      const user = userEvent.setup();
      render(<FindBar />);
      const input = await openAndType(user, "#");
      expect(screen.getByRole("group", { name: "Unread" })).toBeInTheDocument();
      expect(screen.queryByText("No channels match.")).toBeNull();
      await user.type(input, "ge");
      expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
        "general",
      ]);
    });

    it("says how to jump when nothing is unread or recently opened", async () => {
      const user = userEvent.setup();
      render(<FindBar />);
      await user.click(trigger());
      await screen.findByRole("combobox");
      expect(
        screen.getByText(
          "Nothing unread. Type a channel's name to jump to it.",
        ),
      ).toBeInTheDocument();
      // The "from 3 letters" line belongs under letters, not here.
      expect(screen.queryByText(/from 3 letters/)).toBeNull();
    });

    it("draws no search status over the channel matches while the search catches up", async () => {
      jumpState.current = { ...jumpState.current, channels: [rush] };
      // The debounced text still holds an earlier search's words.
      debounced.current = "rush party";
      searchQuery.current = searchState({ isFetching: true });
      const user = userEvent.setup();
      render(<FindBar />);
      await openAndType(user, "ru");
      expect(screen.queryByText("Searching...")).toBeNull();
      expect(screen.getByRole("status")).toHaveTextContent("1 channel.");
      expect(screen.getAllByRole("option")).toHaveLength(1);
    });
  });

  it("closes on Escape, hands focus back, and keeps the query for next time", async () => {
    channelsQuery.current = { data: [{ id: "c1", name: "announcements" }] };
    searchQuery.current = searchState({ data: searchPayload() });

    const user = userEvent.setup();
    render(<FindBar />);
    await openAndType(user, "announce");

    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(trigger()).toHaveFocus());
    expect(trigger()).toHaveTextContent("announce");

    await user.click(trigger());
    expect(await screen.findByRole("combobox")).toHaveValue("announce");
  });

  it("hands focus back to where the shortcut was pressed from", async () => {
    render(
      <>
        <button type="button">Elsewhere</button>
        <FindBar />
      </>,
    );
    const elsewhere = screen.getByRole("button", { name: "Elsewhere" });
    elsewhere.focus();
    chord();
    await screen.findByRole("dialog");

    const user = userEvent.setup();
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(elsewhere).toHaveFocus());
  });

  it("opens with the key typed on the field as the query", async () => {
    const user = userEvent.setup();
    render(<FindBar />);
    trigger().focus();
    await user.keyboard("r");

    const input = await screen.findByRole("combobox");
    expect(input).toHaveValue("r");
    await waitFor(() => expect(input).toHaveFocus());
    // Not selected, so the next key appends rather than replacing it.
    await user.keyboard("ush");
    expect(input).toHaveValue("rush");
  });

  it("tells a timeout apart from an empty result", async () => {
    searchQuery.current = searchState({
      data: { payload: {}, timedOut: true, timedOutSources: ["messages"] },
    });
    const user = userEvent.setup();
    render(<FindBar />);
    await openAndType(user, "announce");

    // Rendered twice by design: visibly in the list, and in the sr-only live
    // region. Scope to the list.
    const list = within(screen.getByRole("listbox"));
    expect(list.getByText(/took too long/i)).toBeInTheDocument();
    expect(list.queryByText("No matches.")).not.toBeInTheDocument();
  });

  it("says it stopped looking even when it has results to show", async () => {
    channelsQuery.current = { data: [{ id: "c1", name: "announcements" }] };
    searchQuery.current = searchState({
      data: {
        ...searchPayload(),
        timedOut: true,
        timedOutSources: ["messages"],
      },
      dataUpdatedAt: 6000,
    });
    const user = userEvent.setup();
    render(<FindBar />);
    await openAndType(user, "announce");

    expect(screen.getAllByRole("option").length).toBeGreaterThan(0);
    expect(
      within(screen.getByRole("listbox")).getByText(
        /stopped looking in messages/i,
      ),
    ).toBeInTheDocument();
  });

  it("does not blame a timeout in a group the chip leaves out", async () => {
    // Channels are matched here and never time out, so under the Channels chip
    // a slow message scan is not "Search took too long".
    searchQuery.current = searchState({
      data: { payload: {}, timedOut: true, timedOutSources: ["messages"] },
    });
    const user = userEvent.setup();
    render(<FindBar />);
    await openAndType(user, "announce");
    await user.click(screen.getByRole("button", { name: "Channels" }));

    const list = within(screen.getByRole("listbox"));
    expect(list.getByText("No matches.")).toBeInTheDocument();
    expect(list.queryByText(/took too long/i)).not.toBeInTheDocument();
  });

  it("distinguishes a failed search from an empty one", async () => {
    searchQuery.current = searchState({ isError: true, dataUpdatedAt: 0 });
    const user = userEvent.setup();
    render(<FindBar />);
    await openAndType(user, "announce");

    const list = within(screen.getByRole("listbox"));
    expect(list.getByText(/unavailable right now/i)).toBeInTheDocument();
    expect(list.queryByText("No matches.")).not.toBeInTheDocument();
  });

  it("emits search-completed with the find-bar surface", async () => {
    // `spec/behavior/observability.md` § Search Telemetry.
    const events: Array<{ name: string; properties?: AnalyticsProperties }> =
      [];
    searchQuery.current = searchState({
      data: searchPayload(),
      dataUpdatedAt: 4000,
    });
    const user = userEvent.setup();
    renderWithTrack((name, properties) => events.push({ name, properties }));
    await openAndType(user, "announce");

    await waitFor(() => expect(events.length).toBeGreaterThan(0));
    const event = events.find((e) => e.name === "search-completed");
    expect(event).toBeDefined();
    expect(event!.properties).toMatchObject({
      surface: "find-bar",
      members_count: 1,
      messages_count: 1,
      events_count: 1,
      backwork_count: 1,
      zero_result: false,
      timed_out: false,
    });
    // Shape, not value: the dedupe key is held constant, so the event fires
    // once at whatever length first cleared the minimum.
    expect(typeof event!.properties!.query_length).toBe("number");
  });

  it("never carries the raw query text or another forbidden property", async () => {
    // `observability.md` cites this as the proof that the raw query is never
    // sent: `"query"` is not a forbidden key, so the shared gate alone would
    // let a property holding the raw text through.
    const events: Array<{ name: string; properties?: AnalyticsProperties }> =
      [];
    searchQuery.current = searchState({
      data: searchPayload(),
      dataUpdatedAt: 5000,
    });
    const user = userEvent.setup();
    renderWithTrack((name, properties) => events.push({ name, properties }));
    await openAndType(user, "announce");

    await waitFor(() => expect(events.length).toBeGreaterThan(0));
    for (const event of events) {
      expect(() =>
        assertContentFreeProperties({
          name: event.name,
          distinctId: "test",
          properties: event.properties ?? {},
        }),
      ).not.toThrow();
      // Every key is known, and the only string sent is the surface: a
      // property carrying the text (or any prefix of it) fails here.
      expect(Object.keys(event.properties ?? {}).sort()).toEqual(
        [
          "backwork_count",
          "events_count",
          "latency_ms",
          "members_count",
          "messages_count",
          "query_length",
          "query_word_count",
          "surface",
          "timed_out",
          "total_count",
          "zero_result",
        ].sort(),
      );
      for (const [key, value] of Object.entries(event.properties ?? {})) {
        if (typeof value === "string") expect(key).toBe("surface");
      }
    }
  });

  it("counts a search once, not again when the dialog reopens on it", async () => {
    const events: Array<{ name: string; properties?: AnalyticsProperties }> =
      [];
    searchQuery.current = searchState({
      data: searchPayload(),
      dataUpdatedAt: 7000,
    });
    const user = userEvent.setup();
    renderWithTrack((name, properties) => events.push({ name, properties }));
    // Pinned so the one event is for the whole text, as a real debounce gives.
    debounced.current = "announce";
    await openAndType(user, "announce");
    await waitFor(() => expect(events).toHaveLength(1));
    debounced.current = null;
    const before = events.length;

    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    // The reopen refetches the kept query.
    searchQuery.current = searchState({
      data: searchPayload(),
      dataUpdatedAt: 8000,
    });
    await user.click(trigger());
    await screen.findByRole("combobox");

    expect(events.length).toBe(before);
  });

  it("measures the trimmed query", async () => {
    const events: Array<{ name: string; properties?: AnalyticsProperties }> =
      [];
    searchQuery.current = searchState({
      data: searchPayload(),
      dataUpdatedAt: 9000,
    });
    const user = userEvent.setup();
    renderWithTrack((name, properties) => events.push({ name, properties }));
    // Pinned so the one event fires for the whole text, padding included.
    debounced.current = "  rush  ";
    await openAndType(user, "  rush  ");

    await waitFor(() => expect(events.length).toBeGreaterThan(0));
    expect(events.at(-1)!.properties).toMatchObject({
      query_length: 4,
      query_word_count: 1,
    });
  });
});

/**
 * Find only finds (#5476, Paul, 2026-11-18). From #4904 its first row asked
 * Frapp; Frapp Intelligence has its own page now, which New opens.
 */
describe("FindBar and Ask (#5476)", () => {
  beforeEach(() => {
    push.mockClear();
    debounced.current = null;
    moduleGate.current = () => true;
    channelsQuery.current = { data: [{ id: "c1", name: "announcements" }] };
    searchQuery.current = searchState({ data: searchPayload() });
  });

  it("offers no Ask row, even for words that read as a question", async () => {
    const user = userEvent.setup();
    render(<FindBar />);
    const input = await openAndType(user, "when is the announce party?");
    expect(input).toHaveAttribute("placeholder", FIND_PLACEHOLDER);
    expect(
      screen.queryByRole("option", { name: /Frapp Intelligence/ }),
    ).toBeNull();
  });
});

/**
 * From `lg` up the way in is the sidebar's Search row (#5946): any control
 * inside the provider opens the same dialog, and focus goes back to it.
 */
describe("Find from the sidebar's Search row (#5946)", () => {
  function SearchRow() {
    const find = useFind();
    return (
      <button
        type="button"
        onClick={(event) => find.openFind({ returnTo: event.currentTarget })}
      >
        Search
      </button>
    );
  }

  beforeEach(() => {
    channelsQuery.current = { data: [] };
    searchQuery.current = searchState();
    debounced.current = null;
  });

  it("opens the one dialog from a row, and hands focus back to the row on close", async () => {
    const user = userEvent.setup();
    render(
      <FindProvider>
        <SearchRow />
      </FindProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Search" })).toHaveFocus(),
    );
  });

  it("still opens on Cmd+F with no field on screen", async () => {
    render(
      <FindProvider>
        <SearchRow />
      </FindProvider>,
    );
    chord();
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
});
