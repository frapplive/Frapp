import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { AUDIT_LOG_SETTINGS_NOTE } from "@repo/chat-core/audit-log-copy";
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  CHANNEL_SETTINGS_COPY,
  CHAT_REPORT_QUEUE_PERMISSIONS,
} from "@repo/validation";
import { cardFilledContainers } from "@/tests/card-surfaces";
import { networkMock } from "@/tests/network";
import type { ChannelSettingsPage as Page } from "@/components/settings/settings-paths";

/*
 * One channel's own settings (#6031), drawn in place of Chapter settings'
 * Chat page at `?tab=chat&channel=<id>`: the name and description with Save
 * channel, then Access, Defaults and Moderation rows that each save on their
 * own, then Delete channel; and the pages its rows open (`&page=`).
 *
 * The report queue has its own spec (`chat-reports-card.spec.tsx`) and is
 * stubbed here; so is the screen-level `<Can>`, whose fallbacks
 * `can-fallback.spec.tsx` pins.
 */

const {
  mockOffline,
  reads,
  permissions,
  updateChannel,
  mockUnpin,
  mockDeleteChannel,
  mockChatReports,
  mockPins,
  toast,
  router,
  search,
} = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn() },
  search: { current: new URLSearchParams() },
  toast: vi.fn(),
  mockOffline: { value: false },
  permissions: { current: [] as string[] },
  mockUnpin: vi.fn(),
  mockDeleteChannel: vi.fn(),
  mockChatReports: vi.fn(),
  mockPins: vi.fn(),
  updateChannel: {
    mutateAsync: (() => Promise.resolve()) as (
      ...args: unknown[]
    ) => Promise<unknown>,
  },
  reads: {
    channels: {} as Record<string, unknown>,
    categories: {} as Record<string, unknown>,
    pins: {} as Record<string, unknown>,
    accessOptions: {} as Record<string, unknown>,
    reports: {} as Record<string, unknown>,
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => search.current,
}));

vi.mock("@repo/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@repo/hooks")>();
  return {
    ...actual,
    useChannels: () => reads.channels,
    useCategories: () => reads.categories,
    usePinnedMessages: (...args: unknown[]) => {
      mockPins(...args);
      return reads.pins;
    },
    useChannelAccessOptions: () => reads.accessOptions,
    useChatReports: (...args: unknown[]) => {
      mockChatReports(...args);
      return reads.reports;
    },
    usePermissionList: () => permissions.current,
    useMemberDisplayNames: () => ({ nameFor: () => null }),
    useUpdateChannel: () => ({
      mutateAsync: (...args: unknown[]) => updateChannel.mutateAsync(...args),
      isPending: false,
    }),
    useDeleteChannel: () => ({
      mutateAsync: mockDeleteChannel,
      isPending: false,
    }),
    useUnpinMessage: () => ({ mutateAsync: mockUnpin, isPending: false }),
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

vi.mock("@/lib/providers/network-provider", () => networkMock(mockOffline));

vi.mock("@/lib/hooks/use-toast", () => ({
  useToast: () => ({ toast }),
}));

const { ChannelSettingsPage } = await import("./channel-settings-page");

const EXEC_TIER = "tier:00000000-0000-4000-8000-000000000001";
const BROTHER_ROLE = "role:00000000-0000-4000-8000-000000000002";
const channel = (
  id: string,
  name: string,
  type: "PUBLIC" | "PRIVATE" | "ROLE_GATED",
) => ({
  id,
  name,
  description: null as string | null,
  type,
  who_can_see: null as string[] | null,
  who_can_post: null as string[] | null,
  category_id: "cat-1" as string | null,
  is_read_only: false,
  default_notification_level: null as string | null,
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
  {
    entry: BROTHER_ROLE,
    kind: "role",
    id: "00000000-0000-4000-8000-000000000002",
    name: "Brother",
    color: "#336699",
    tier_id: null,
    user_ids: ["u-2", "u-3", "u-4"],
  },
];
const CATEGORIES = [
  { id: "cat-1", name: "Chapter", display_order: 0 },
  { id: "cat-2", name: "Social", display_order: 1 },
];
const PIN = {
  id: "m-1",
  content: "Dues are due Friday",
  sender_id: null,
  author_name: "Treasurer",
  created_at: "2026-09-30T12:00:00Z",
  pinned_at: "2026-09-30T12:00:00Z",
};

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

/** The channel list with #general (ch-1) changed. */
function withGeneral(changes: Record<string, unknown>) {
  return settled([{ ...CHANNELS[0], ...changes }, ...CHANNELS.slice(1)]);
}

const PINS_STALE =
  "Couldn't refresh the pins. These are the last ones that loaded.";
const CHANNEL_STALE =
  "Couldn't refresh the channel. This is the last that loaded.";

const page = (channelId: string, sub: Page | null = null) => (
  <ChannelSettingsPage channelId={channelId} page={sub} />
);

type Call = [{ id: string; body: Record<string, unknown> }];
function saveSpy() {
  const spy = vi.fn<(...args: unknown[]) => Promise<unknown>>(() =>
    Promise.resolve(),
  );
  updateChannel.mutateAsync = spy;
  return spy;
}
const callOf = (spy: ReturnType<typeof saveSpy>, index = 0) =>
  (spy.mock.calls[index] as unknown as Call)[0];
const bodyOf = (spy: ReturnType<typeof saveSpy>, index = 0) =>
  callOf(spy, index).body;

const nameField = () => screen.getByLabelText("Name");
const descriptionField = () => screen.getByLabelText("Description");
const saveButton = () => screen.getByRole("button", { name: "Save channel" });

beforeEach(() => {
  vi.clearAllMocks();
  search.current = new URLSearchParams();
  mockOffline.value = false;
  permissions.current = [];
  updateChannel.mutateAsync = () => Promise.resolve();
  reads.channels = settled(CHANNELS);
  reads.categories = settled(CATEGORIES);
  reads.pins = settled([]);
  reads.accessOptions = settled(ACCESS_OPTIONS);
  reads.reports = settled([]);
});

describe("ChannelSettingsPage — the page", () => {
  it("heads the page with the channel's name and a way back to Chat, on the page surface", () => {
    const { container } = render(page("ch-1"));

    expect(
      screen.getByRole("heading", { level: 2, name: "#general" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Chat" })).toHaveAttribute(
      "href",
      "/settings?tab=chat",
    );
    // The settings groups' own lists are the only surfaces.
    for (const el of cardFilledContainers(container)) {
      expect(el.tagName).toBe("UL");
    }
    // Only this channel: no tree, no New channel.
    expect(screen.queryByRole("button", { name: "New channel" })).toBeNull();
    expect(screen.queryByRole("button", { name: "New category" })).toBeNull();
  });

  it("draws the fields, then Access, Defaults and Moderation, then Delete channel last", () => {
    render(page("ch-1"));
    const order = [
      nameField(),
      screen.getByRole("list", { name: "Access" }),
      screen.getByRole("list", { name: "Defaults" }),
      screen.getByRole("list", { name: "Moderation" }),
      screen.getByRole("button", { name: "Delete channel" }),
    ];
    for (let i = 1; i < order.length; i += 1) {
      expect(
        order[i - 1]!.compareDocumentPosition(order[i]!) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  it("says the channel is gone when it was deleted under the page, and links back", () => {
    const { rerender } = render(page("ch-2"));

    reads.channels = settled(CHANNELS.filter((c) => c.id !== "ch-2"));
    rerender(page("ch-2"));

    expect(
      screen.getByText(
        "This channel isn't here anymore. It may have been deleted.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Name")).toBeNull();
    expect(screen.getByRole("link", { name: "Chat" })).toHaveAttribute(
      "href",
      "/settings?tab=chat",
    );
  });

  it("says so for a channel id it doesn't know", () => {
    render(page("nope"));
    expect(screen.getByText(/isn.t here anymore/)).toBeInTheDocument();
  });

  it("waits for the channel list when opened cold, then draws the channel", () => {
    reads.channels = empty({
      isPending: true,
      isLoading: true,
      fetchStatus: "fetching",
    });
    const { rerender } = render(page("ch-2"));
    expect(screen.getByText("Loading channels")).toBeInTheDocument();
    expect(screen.queryByText(/isn.t here anymore/)).toBeNull();

    reads.channels = settled(CHANNELS);
    rerender(page("ch-2"));
    expect(screen.getByRole("heading", { name: "#exec" })).toBeInTheDocument();
  });

  it("keeps the loaded channel through a failed background read, and says it is the last that loaded", () => {
    reads.channels = { ...settled(CHANNELS), isError: true };
    render(page("ch-1"));

    expect(
      screen.getByRole("heading", { name: "#general" }),
    ).toBeInTheDocument();
    expect(screen.getByText(CHANNEL_STALE)).toBeInTheDocument();
  });

  it("says what failed when the first read fails, in the nested family", () => {
    reads.channels = empty({ isError: true });
    const { container } = render(page("ch-1"));

    expect(
      screen.getByRole("heading", { name: "Couldn't load the channel" }),
    ).toBeInTheDocument();
    expect(cardFilledContainers(container)).toEqual([]);
  });

  it("says the channels are unavailable offline when none are cached", () => {
    mockOffline.value = true;
    reads.channels = empty({ isPending: true, fetchStatus: "paused" });
    render(page("ch-1"));

    expect(
      screen.getByRole("heading", { name: "Channels unavailable offline" }),
    ).toBeInTheDocument();
  });
});

describe("ChannelSettingsPage — the name and description", () => {
  it("focuses Description when a channel start's Add a description opened it", () => {
    search.current = new URLSearchParams(
      "tab=chat&channel=ch-1&focus=description",
    );
    render(page("ch-1"));
    expect(descriptionField()).toHaveFocus();
  });

  it("focuses nothing when opened any other way", () => {
    render(page("ch-1"));
    expect(descriptionField()).not.toHaveFocus();
    expect(nameField()).not.toHaveFocus();
  });

  it("keeps Save channel off until a field changes, and Revert only while one has", () => {
    render(page("ch-1"));
    expect(saveButton()).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Revert changes" })).toBeNull();

    fireEvent.change(nameField(), { target: { value: "town-hall" } });
    expect(saveButton()).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Revert changes" }));

    expect(nameField()).toHaveValue("general");
    expect(saveButton()).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Revert changes" })).toBeNull();
  });

  it("won't save a blank name", () => {
    render(page("ch-1"));
    fireEvent.change(nameField(), { target: { value: "   " } });
    expect(saveButton()).toBeDisabled();
  });

  it("sends only the name when only the name changed, leaving a never-set description alone", async () => {
    const spy = saveSpy();
    render(page("ch-1"));

    fireEvent.change(nameField(), { target: { value: " town-hall " } });
    fireEvent.click(saveButton());

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(callOf(spy)).toEqual({ id: "ch-1", body: { name: "town-hall" } });
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({ description: "#town-hall saved." }),
    );
  });

  it("sends the description once the officer has typed one, and not the name", async () => {
    const spy = saveSpy();
    render(page("ch-1"));

    fireEvent.change(descriptionField(), {
      target: { value: "  The whole chapter.  " },
    });
    fireEvent.click(saveButton());

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(bodyOf(spy)).toEqual({ description: "The whole chapter." });
  });

  it("sends an empty description when the officer clears one", async () => {
    const spy = saveSpy();
    reads.channels = withGeneral({ description: "Old words." });
    render(page("ch-1"));

    fireEvent.change(descriptionField(), { target: { value: "   " } });
    fireEvent.click(saveButton());

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(bodyOf(spy)).toEqual({ description: "" });
  });

  it("counts only blank space typed into a never-set description as no change", () => {
    render(page("ch-1"));
    fireEvent.change(descriptionField(), { target: { value: "   " } });
    expect(saveButton()).toBeDisabled();
  });

  it("shows a description that arrived on refetch and doesn't send the untouched draft over it", async () => {
    const spy = saveSpy();
    const { rerender } = render(page("ch-1"));

    reads.channels = withGeneral({ description: "The whole chapter." });
    rerender(page("ch-1"));
    expect(descriptionField()).toHaveValue("The whole chapter.");
    expect(saveButton()).toBeDisabled();

    fireEvent.change(nameField(), { target: { value: "town-hall" } });
    fireEvent.click(saveButton());

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(bodyOf(spy)).not.toHaveProperty("description");
  });

  it("follows a rename made elsewhere under an untouched name, and doesn't send the old name back", async () => {
    const spy = saveSpy();
    const { rerender } = render(page("ch-1"));

    reads.channels = withGeneral({ name: "everyone" });
    rerender(page("ch-1"));
    expect(nameField()).toHaveValue("everyone");
    expect(
      screen.getByRole("heading", { level: 2, name: "#everyone" }),
    ).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();

    fireEvent.change(descriptionField(), {
      target: { value: "The whole chapter." },
    });
    fireEvent.click(saveButton());

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(bodyOf(spy)).not.toHaveProperty("name");
  });

  it("sends the old name when the officer types it back after a rename elsewhere", async () => {
    const spy = saveSpy();
    const { rerender } = render(page("ch-1"));

    fireEvent.change(nameField(), { target: { value: "gen" } });
    reads.channels = withGeneral({ name: "everyone" });
    rerender(page("ch-1"));
    fireEvent.change(nameField(), { target: { value: "general" } });
    fireEvent.click(saveButton());

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(bodyOf(spy)).toEqual({ name: "general" });
  });

  it("keeps the officer's own edit of the name when the live name moves too", async () => {
    const spy = saveSpy();
    const { rerender } = render(page("ch-1"));

    fireEvent.change(nameField(), { target: { value: "town-hall" } });
    reads.channels = withGeneral({ name: "everyone" });
    rerender(page("ch-1"));
    expect(nameField()).toHaveValue("town-hall");

    fireEvent.click(saveButton());

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(bodyOf(spy)).toEqual({ name: "town-hall" });
  });

  it("doesn't send its own saved name back over a later rename elsewhere", async () => {
    const spy = saveSpy();
    const { rerender } = render(page("ch-1"));

    fireEvent.change(nameField(), { target: { value: "town-hall" } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(bodyOf(spy)).toEqual({ name: "town-hall" });

    // The save's refetch, then a rename in the chat header and its refetch.
    reads.channels = withGeneral({ name: "town-hall" });
    rerender(page("ch-1"));
    reads.channels = withGeneral({ name: "plaza" });
    rerender(page("ch-1"));
    expect(nameField()).toHaveValue("plaza");

    fireEvent.change(descriptionField(), {
      target: { value: "The whole chapter." },
    });
    fireEvent.click(saveButton());

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    expect(bodyOf(spy, 1)).toEqual({ description: "The whole chapter." });
  });

  it("says why a save failed", async () => {
    updateChannel.mutateAsync = () => Promise.reject(new Error("boom"));
    render(page("ch-1"));
    fireEvent.change(nameField(), { target: { value: "town-hall" } });
    fireEvent.click(saveButton());

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive" }),
      ),
    );
  });

  it("sends none of the rows' fields with Save channel", async () => {
    const spy = saveSpy();
    reads.channels = withGeneral({
      is_default: true,
      activity_excluded: true,
      default_notification_level: "all",
    });
    render(page("ch-1"));

    fireEvent.change(descriptionField(), { target: { value: "Hi." } });
    fireEvent.click(saveButton());

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    const body = bodyOf(spy);
    for (const key of [
      "name",
      "category_id",
      "default_notification_level",
      "is_default",
      "activity_excluded",
      "who_can_see",
      "who_can_post",
      "match_category_access",
    ]) {
      expect(body).not.toHaveProperty(key);
    }
  });
});

describe("ChannelSettingsPage — rows that save on their own", () => {
  it("moves the channel to the category picked, the moment it is picked", async () => {
    const spy = saveSpy();
    render(page("ch-1"));

    const category = screen.getByRole("combobox", { name: "Category" });
    expect(category).toHaveTextContent("Chapter");
    fireEvent.click(category);
    fireEvent.click(await screen.findByRole("option", { name: "Social" }));

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(callOf(spy)).toEqual({ id: "ch-1", body: { category_id: "cat-2" } });
  });

  it("takes the channel out of its category with No category", async () => {
    const spy = saveSpy();
    render(page("ch-1"));

    fireEvent.click(screen.getByRole("combobox", { name: "Category" }));
    fireEvent.click(await screen.findByRole("option", { name: "No category" }));

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(bodyOf(spy)).toEqual({ category_id: null });
  });

  it("shows the channel's new category when it was dragged to another one elsewhere", () => {
    const { rerender } = render(page("ch-1"));
    reads.channels = withGeneral({ category_id: "cat-2" });
    rerender(page("ch-1"));
    expect(
      screen.getByRole("combobox", { name: "Category" }),
    ).toHaveTextContent("Social");
  });

  it("sets the default notifications the moment a level is picked", async () => {
    const spy = saveSpy();
    render(page("ch-1"));

    const level = screen.getByRole("combobox", {
      name: "Default notifications",
    });
    // #general's built-in level is every message.
    expect(level).toHaveTextContent("Standard (Every message)");
    fireEvent.click(level);
    fireEvent.click(await screen.findByRole("option", { name: "Mute" }));

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(bodyOf(spy)).toEqual({ default_notification_level: "off" });
  });

  it("puts the channel back on its built-in level with Standard", async () => {
    const spy = saveSpy();
    reads.channels = settled([
      CHANNELS[0],
      CHANNELS[1],
      { ...CHANNELS[2], default_notification_level: "all" },
    ]);
    render(page("ch-3"));

    const level = screen.getByRole("combobox", {
      name: "Default notifications",
    });
    expect(level).toHaveTextContent("Every message");
    fireEvent.click(level);
    fireEvent.click(
      await screen.findByRole("option", { name: "Standard (Only @mentions)" }),
    );

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(bodyOf(spy)).toEqual({ default_notification_level: null });
  });

  it("makes the channel the chapter default the moment its switch flips", async () => {
    const spy = saveSpy();
    render(page("ch-1"));

    const toggle = screen.getByRole("switch", {
      name: "Chapter default channel",
    });
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(callOf(spy)).toEqual({ id: "ch-1", body: { is_default: true } });
  });

  it("shows the current default switched on", () => {
    reads.channels = withGeneral({ is_default: true });
    render(page("ch-1"));
    expect(
      screen.getByRole("switch", { name: "Chapter default channel" }),
    ).toBeChecked();
  });

  it("shows Leave out of Activity and sends it the moment it flips (#3897)", async () => {
    const spy = saveSpy();
    reads.channels = withGeneral({ activity_excluded: true });
    render(page("ch-1"));

    const toggle = screen.getByRole("switch", {
      name: "Leave out of Activity",
    });
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(bodyOf(spy)).toEqual({ activity_excluded: false });
  });

  it("shows the new answer while a row saves, and takes no second change meanwhile", async () => {
    let finish: () => void = () => {};
    updateChannel.mutateAsync = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    render(page("ch-1"));

    const defaultSwitch = screen.getByRole("switch", {
      name: "Chapter default channel",
    });
    fireEvent.click(defaultSwitch);

    await waitFor(() => expect(defaultSwitch).toBeChecked());
    expect(
      screen.getByRole("switch", { name: "Leave out of Activity" }),
    ).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Category" })).toBeDisabled();

    await act(async () => finish());
    expect(
      screen.getByRole("switch", { name: "Leave out of Activity" }),
    ).toBeEnabled();
  });

  it("keeps a saved answer showing until the channel list agrees, rather than flipping back", async () => {
    const spy = saveSpy();
    const { rerender } = render(page("ch-1"));
    const defaultSwitch = () =>
      screen.getByRole("switch", { name: "Chapter default channel" });
    fireEvent.click(defaultSwitch());
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));

    // The save landed but the list hasn't refetched: still on, still enabled.
    await waitFor(() =>
      expect(
        screen.getByRole("switch", { name: "Leave out of Activity" }),
      ).toBeEnabled(),
    );
    expect(defaultSwitch()).toBeChecked();

    // The refetch agrees, then a change made elsewhere shows as it arrives.
    reads.channels = withGeneral({ is_default: true });
    rerender(page("ch-1"));
    expect(defaultSwitch()).toBeChecked();
    reads.channels = withGeneral({ is_default: false });
    rerender(page("ch-1"));
    expect(defaultSwitch()).not.toBeChecked();
  });

  it("says why a row's save failed", async () => {
    updateChannel.mutateAsync = () => Promise.reject(new Error("boom"));
    render(page("ch-1"));
    fireEvent.click(
      screen.getByRole("switch", { name: "Chapter default channel" }),
    );

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive" }),
      ),
    );
  });
});

// #3722: who can see and post, two lists, and a channel follows its category
// until changed.
describe("ChannelSettingsPage — access", () => {
  it("says who can see and post in rows that open their own pages", () => {
    render(page("ch-3"));

    const access = screen.getByRole("list", { name: "Access" });
    const see = within(access).getByRole("link", { name: /^Who can see/ });
    expect(see).toHaveAttribute(
      "href",
      "/settings?tab=chat&channel=ch-3&page=see",
    );
    expect(see).toHaveTextContent("Executive board");
    expect(
      within(access).getByRole("link", { name: /^Who can post/ }),
    ).toHaveAttribute("href", "/settings?tab=chat&channel=ch-3&page=post");
  });

  it("says a channel matching its category matches it, with no Match row", () => {
    render(page("ch-1"));
    expect(
      screen.getByText(
        "Matches Chapter. Changes to it reach this channel too.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Match Chapter" })).toBeNull();
  });

  it("matches the category again with Match <category>, sending only that", async () => {
    const spy = saveSpy();
    render(page("ch-3"));

    expect(
      screen.getByText("Set differently from Chapter."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Match Chapter" }));

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(callOf(spy)).toEqual({
      id: "ch-3",
      body: { match_category_access: true },
    });
  });

  it("offers no Match row and no footnote for a channel in no category", () => {
    reads.channels = settled([
      CHANNELS[0],
      CHANNELS[1],
      { ...CHANNELS[2], category_id: null },
    ]);
    render(page("ch-3"));
    expect(screen.queryByRole("button", { name: /^Match/ })).toBeNull();
    expect(screen.queryByText(/Set differently from/)).toBeNull();
    expect(
      screen.getByRole("combobox", { name: "Category" }),
    ).toHaveTextContent("No category");
  });

  it("says a private channel's members decide, with no lists to open", () => {
    render(page("ch-2"));
    const access = screen.getByRole("list", { name: "Access" });

    expect(within(access).getByText("Only people added")).toBeInTheDocument();
    expect(within(access).getByText("Everyone in it")).toBeInTheDocument();
    expect(within(access).queryByRole("link")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Let everyone in it post" }),
    ).toBeNull();
    expect(screen.queryByText(/Matches Chapter/)).toBeNull();
  });

  it("opens a read-only private channel to everyone in it", async () => {
    reads.channels = settled([
      channel("ch-1", "general", "PUBLIC"),
      {
        ...channel("ch-2", "exec", "PRIVATE"),
        who_can_post: [EXEC_TIER],
        is_read_only: true,
      },
    ]);
    const spy = saveSpy();
    render(page("ch-2"));

    expect(
      within(screen.getByRole("list", { name: "Access" })).getByText(
        "Executive board",
      ),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Let everyone in it post" }),
    );

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(bodyOf(spy)).toEqual({ who_can_post: null });
  });

  it("draws the channel's own page for a private channel's access address", () => {
    render(page("ch-2", "see"));
    expect(
      screen.getByRole("heading", { level: 2, name: "#exec" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Who can see" })).toBeNull();
  });
});

describe("ChannelSettingsPage — the who can see and who can post pages", () => {
  it("opens Who can see with a way back to the channel, and Save off until the list changes", () => {
    render(page("ch-1", "see"));

    expect(
      screen.getByRole("heading", { level: 2, name: "Who can see" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "#general" })).toHaveAttribute(
      "href",
      "/settings?tab=chat&channel=ch-1",
    );
    expect(screen.getByRole("group", { name: "Who can see" })).toBeVisible();
    expect(screen.queryByRole("group", { name: "Who can post" })).toBeNull();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    // Only the one question: no name field here.
    expect(screen.queryByLabelText("Name")).toBeNull();
  });

  it("saves only the list on its page, then goes back to the channel", async () => {
    const spy = saveSpy();
    render(page("ch-1", "post"));

    const post = screen.getByRole("group", { name: "Who can post" });
    fireEvent.click(within(post).getByRole("radio", { name: "Chosen roles" }));
    fireEvent.click(
      within(post).getByRole("button", { name: "Add to who can post" }),
    );
    fireEvent.click(await screen.findByRole("option", { name: /Brother/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(callOf(spy)).toEqual({
      id: "ch-1",
      body: { who_can_post: [BROTHER_ROLE] },
    });
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith(
        "/settings?tab=chat&channel=ch-1",
      ),
    );
  });

  it("saves who can see on its page", async () => {
    const spy = saveSpy();
    render(page("ch-1", "see"));

    const see = screen.getByRole("group", { name: "Who can see" });
    fireEvent.click(within(see).getByRole("radio", { name: "Chosen roles" }));
    fireEvent.click(
      within(see).getByRole("button", { name: "Add to who can see" }),
    );
    fireEvent.click(
      await screen.findByRole("option", { name: /Executive board/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(bodyOf(spy)).toEqual({ who_can_see: [EXEC_TIER] });
  });

  it("refuses an empty chosen list and stays on the page", async () => {
    const spy = saveSpy();
    render(page("ch-1", "see"));

    const see = screen.getByRole("group", { name: "Who can see" });
    fireEvent.click(within(see).getByRole("radio", { name: "Chosen roles" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({
        variant: "destructive",
        description: CHANNEL_SETTINGS_COPY.accessIncomplete,
      }),
    );
    expect(spy).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("stays on the page when the save fails", async () => {
    updateChannel.mutateAsync = () => Promise.reject(new Error("boom"));
    render(page("ch-3", "see"));

    const see = screen.getByRole("group", { name: "Who can see" });
    fireEvent.click(within(see).getByRole("radio", { name: "Everyone" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive" }),
      ),
    );
    expect(router.push).not.toHaveBeenCalled();
  });

  it("keeps a chosen list's names through a failed options refresh", () => {
    reads.accessOptions = { ...settled(ACCESS_OPTIONS), isError: true };
    render(page("ch-3", "see"));

    const see = screen.getByRole("group", { name: "Who can see" });
    expect(within(see).getByText("Executive board")).toBeInTheDocument();
    expect(within(see).getByText(/Reaches 2 people/)).toBeInTheDocument();
  });

  it("still shows a chosen list when the options never loaded", () => {
    reads.accessOptions = empty({ isError: true });
    render(page("ch-3", "see"));

    const see = screen.getByRole("group", { name: "Who can see" });
    expect(within(see).getByText("Unavailable")).toBeInTheDocument();
  });
});

// #3909: only Frapp posts in the audit log, and the server refuses renaming
// or deleting it.
describe("ChannelSettingsPage — the audit log", () => {
  beforeEach(() => {
    reads.channels = settled([
      ...CHANNELS,
      {
        ...channel("ch-4", "chapter-audit", "PUBLIC"),
        category_id: null,
        is_read_only: true,
        is_audit_log: true,
      },
    ]);
  });

  it("locks its name, says why, and offers no access rows and no Delete", () => {
    render(page("ch-4"));

    expect(nameField()).toBeDisabled();
    expect(screen.getByText(AUDIT_LOG_SETTINGS_NOTE)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Who can see/ })).toBeNull();
    expect(screen.queryByText("Who can see")).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete channel" })).toBeNull();
    // Its description still saves.
    expect(descriptionField()).toBeEnabled();
  });

  it("keeps the name open and offers Delete on an ordinary channel", () => {
    render(page("ch-1"));

    expect(nameField()).toBeEnabled();
    expect(screen.queryByText(AUDIT_LOG_SETTINGS_NOTE)).toBeNull();
    expect(
      screen.getByRole("button", { name: "Delete channel" }),
    ).toBeInTheDocument();
  });
});

describe("ChannelSettingsPage — Delete channel", () => {
  it("deletes the channel once its name is typed, then goes back to Chat", async () => {
    mockDeleteChannel.mockResolvedValue({});
    render(page("ch-1"));

    fireEvent.click(screen.getByRole("button", { name: "Delete channel" }));
    const dialog = await screen.findByRole("dialog");
    const confirm = within(dialog).getByRole("button", {
      name: "Delete channel",
    });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Type general to confirm"), {
      target: { value: "general" },
    });
    fireEvent.click(confirm);

    await waitFor(() => expect(mockDeleteChannel).toHaveBeenCalledWith("ch-1"));
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith("/settings?tab=chat"),
    );
  });
});

describe("ChannelSettingsPage — Moderation", () => {
  it("counts the pins in a row that opens the pins page", () => {
    reads.pins = settled([PIN]);
    render(page("ch-2"));

    const row = screen.getByRole("link", { name: /^Pinned messages/ });
    expect(row).toHaveAttribute(
      "href",
      "/settings?tab=chat&channel=ch-2&page=pins",
    );
    expect(row).toHaveTextContent("1");
    expect(mockPins).toHaveBeenCalledWith("ch-2");
  });

  it("draws no pin count when there is no list to count", () => {
    reads.pins = empty({ isError: true });
    render(page("ch-2"));
    expect(
      screen.getByRole("link", { name: /^Pinned messages/ }),
    ).toHaveTextContent(/^Pinned messages$/);
  });

  it("hides Reports from a viewer who doesn't review reports", () => {
    render(page("ch-2"));
    expect(screen.queryByRole("link", { name: /^Reports/ })).toBeNull();
  });

  it("shows this channel's open reports to a reviewer, in a row that opens them", () => {
    permissions.current = [...CHAT_REPORT_QUEUE_PERMISSIONS];
    reads.reports = settled([{ id: "r-1" }]);
    render(page("ch-2"));

    const row = screen.getByRole("link", { name: /^Reports/ });
    expect(row).toHaveAttribute(
      "href",
      "/settings?tab=chat&channel=ch-2&page=reports",
    );
    expect(row).toHaveTextContent("1 open");
    expect(mockChatReports).toHaveBeenCalledWith("open", "ch-2", true);
  });

  it("says none are open", () => {
    permissions.current = [...CHAT_REPORT_QUEUE_PERMISSIONS];
    render(page("ch-2"));
    expect(screen.getByRole("link", { name: /^Reports/ })).toHaveTextContent(
      "None open",
    );
  });
});

describe("ChannelSettingsPage — the reports page", () => {
  it("draws this channel's reports, with a way back to the channel", () => {
    render(page("ch-2", "reports"));

    expect(
      screen.getByRole("heading", { level: 2, name: "Reports" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "#exec" })).toHaveAttribute(
      "href",
      "/settings?tab=chat&channel=ch-2",
    );
    expect(screen.getByTestId("report-queue")).toHaveAttribute(
      "data-channel",
      "ch-2",
    );
    expect(screen.queryByLabelText("Name")).toBeNull();
  });
});

describe("ChannelSettingsPage — the pins page", () => {
  const pins = () => page("ch-2", "pins");

  it("draws the pins with a way back to the channel", () => {
    reads.pins = settled([PIN]);
    render(pins());

    expect(
      screen.getByRole("heading", { level: 2, name: "Pinned messages" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "#exec" })).toHaveAttribute(
      "href",
      "/settings?tab=chat&channel=ch-2",
    );
    expect(screen.getByText("Dues are due Friday")).toBeInTheDocument();
    expect(screen.getByText("Treasurer")).toBeInTheDocument();
  });

  it("unpins a message", async () => {
    mockUnpin.mockResolvedValue({});
    reads.pins = settled([PIN]);
    render(pins());

    fireEvent.click(screen.getByRole("button", { name: "Unpin message" }));

    await waitFor(() => expect(mockUnpin).toHaveBeenCalledWith("m-1"));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({ description: "Message unpinned." }),
    );
  });

  it("says a failed read failed, rather than that nothing is pinned", () => {
    reads.pins = empty({ isError: true });
    const { container } = render(pins());
    expect(cardFilledContainers(container)).toEqual([]);

    expect(screen.getByText("Couldn't load pins")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryByText(/^Nothing pinned/)).toBeNull();
  });

  it("says the pins are loading, on the page surface", () => {
    reads.pins = empty({
      isPending: true,
      isLoading: true,
      fetchStatus: "fetching",
    });
    const { container } = render(pins());

    expect(screen.getByText("Loading pins...")).toBeInTheDocument();
    expect(screen.queryByText(/^Nothing pinned/)).toBeNull();
    expect(cardFilledContainers(container)).toEqual([]);
  });

  it("says the pins are unavailable offline when the read failed offline", () => {
    // The API unreachable, or a page restored offline: the read fails rather
    // than pausing, and must say offline, not show a load error.
    mockOffline.value = true;
    reads.pins = empty({ isError: true });
    render(pins());

    expect(screen.getByText("Pins unavailable offline")).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load pins")).toBeNull();
  });

  it("says the pins are unavailable offline when the read is paused", () => {
    reads.pins = empty({ isPending: true, fetchStatus: "paused" });
    const { container } = render(pins());
    expect(cardFilledContainers(container)).toEqual([]);

    expect(screen.getByText("Pins unavailable offline")).toBeInTheDocument();
    expect(screen.queryByText(/^Nothing pinned/)).toBeNull();
  });

  it("keeps the loaded pins through a failed background read", () => {
    reads.pins = { ...settled([PIN]), isError: true };
    render(pins());

    expect(screen.getByText("Dues are due Friday")).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load pins")).toBeNull();
    expect(screen.getByText(PINS_STALE)).toBeInTheDocument();
  });

  it("has the pins notice's live region mounted before a refresh fails", () => {
    reads.pins = settled([PIN]);
    const { container, rerender } = render(pins());
    const regions = [...container.querySelectorAll('[role="status"]')];

    reads.pins = { ...settled([PIN]), isError: true };
    rerender(pins());

    expect(regions).toContain(
      screen.getByText(PINS_STALE).closest('[role="status"]'),
    );
  });

  it("says nothing is pinned when the read succeeded empty", () => {
    const { container } = render(pins());
    expect(cardFilledContainers(container)).toEqual([]);

    expect(
      screen.getByText("Nothing pinned. Pin a message from the channel."),
    ).toBeInTheDocument();
  });
});
