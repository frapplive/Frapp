/** @vitest-environment jsdom */
import React from "react";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { useLocalSearchParams, useRouter } from "expo-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHANNEL_SETTINGS_COPY } from "@repo/validation";
import { FrappThemeProvider } from "@/lib/theme";
import { screenText } from "@/test/screen-text";

/**
 * A channel's settings on the phone (#6031): the shape and words of web's
 * channel page, each row saving on its own, Save channel only for the two
 * typed fields. The sheets it opens are stood in for, so a test reads what
 * the screen handed them.
 */
const h = vi.hoisted(() => ({
  permissions: ["channels:manage"] as string[],
  channels: [] as unknown[],
  categories: [] as unknown[],
  update: vi.fn<(input: unknown) => Promise<object>>(async () => ({})),
  sheets: {} as Record<string, Record<string, unknown>>,
}));

vi.mock("react-native", async () => {
  const { reactNativeStub } = await import("@/test/react-native-stub");
  return reactNativeStub;
});

const ok = (data: unknown) => ({
  data,
  isPending: false,
  isSuccess: true,
  isError: false,
  isFetching: false,
  error: null,
  refetch: vi.fn(),
});

vi.mock("@repo/hooks", async (importOriginal) => {
  const real = await importOriginal<typeof import("@repo/hooks")>();
  return {
    ...real,
    usePermissionList: () => h.permissions,
    useChannels: () => ok(h.channels),
    useCategories: () => ok(h.categories),
    useChannelAccessOptions: () => ok([]),
    usePinnedMessages: () => ok([{ id: "m1" }, { id: "m2" }]),
    useMemberDisplayNames: () => ({ nameFor: () => null }),
    useUpdateChannel: () => ({ mutateAsync: h.update, isPending: false }),
    useDeleteChannel: () => ({ mutateAsync: vi.fn(), isPending: false }),
  };
});

/** A sheet stood in for: its props are kept under `name`, `present` is a no-op. */
function stubSheet(name: string) {
  return async () => {
    const React = await import("react");
    return {
      [name]: React.forwardRef(function Stub(
        props: Record<string, unknown>,
        ref: React.Ref<{ present: () => void }>,
      ) {
        h.sheets[name] = props;
        React.useImperativeHandle(ref, () => ({ present: vi.fn() }));
        return null;
      }),
    };
  };
}
vi.mock("@/components/option-sheet", async () => {
  const React = await import("react");
  return {
    OptionSheet: React.forwardRef(function OptionSheet(
      props: Record<string, unknown>,
      ref: React.Ref<{ present: () => void }>,
    ) {
      h.sheets[`option:${String(props.title)}`] = props;
      React.useImperativeHandle(ref, () => ({ present: vi.fn() }));
      return null;
    }),
  };
});
vi.mock("@/components/chat/channel-access-sheet", stubSheet("ChannelAccessSheet"));
vi.mock("@/components/chat/message-list-sheet", stubSheet("MessageListSheet"));
vi.mock("@/components/chat/delete-channel-sheet", stubSheet("DeleteChannelSheet"));

vi.mock("@/lib/chapter-branding", () => ({
  useChapterBranding: () => ({
    accent: "#CB9FFF",
    accentPrimary: "#8E4EC6",
    accentOnPrimary: "#FFFFFF",
    logoUrl: null,
    chapterName: null,
  }),
}));

import ChannelSettingsScreen from "@/app/(app)/channel-settings";

const copy = CHANNEL_SETTINGS_COPY;
const channel = (over: Record<string, unknown> = {}) => ({
  id: "c1",
  name: "philanthropy",
  type: "PUBLIC",
  member_ids: [],
  category_id: "cat-1",
  description: "Spring 5K",
  who_can_see: null,
  who_can_post: null,
  ...over,
});
const CATEGORY = {
  id: "cat-1",
  name: "Committees",
  who_can_see: null,
  who_can_post: null,
};

const mounted: ReactTestRenderer[] = [];
function render(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <FrappThemeProvider>
        <ChannelSettingsScreen />
      </FrappThemeProvider>,
    );
  });
  mounted.push(tree);
  return tree;
}

const pressable = (tree: ReactTestRenderer, label: string) =>
  tree.root.find(
    (node) =>
      (node.type as unknown) === "Pressable" &&
      String(node.props.accessibilityLabel ?? "").startsWith(label),
  );
const switchFor = (tree: ReactTestRenderer, label: string) =>
  tree.root.find(
    (node) =>
      (node.type as unknown) === "Switch" &&
      node.props.accessibilityLabel === label,
  );
const inputs = (tree: ReactTestRenderer) =>
  tree.root.findAll((node) => (node.type as unknown) === "TextInput");

beforeEach(() => {
  h.permissions = ["channels:manage"];
  h.channels = [channel()];
  h.categories = [CATEGORY];
  h.sheets = {};
  h.update.mockClear();
  vi.mocked(useLocalSearchParams).mockReturnValue({ channelId: "c1" });
});

afterEach(() => {
  act(() => {
    for (const tree of mounted.splice(0)) tree.unmount();
  });
});

describe("Channel settings on the phone (#6031)", () => {
  it("draws the name and description, then Access, Defaults, Moderation and Delete channel", () => {
    const tree = render();
    const text = screenText(tree);
    expect(text).toContain("#philanthropy");
    for (const words of [
      copy.access,
      copy.category,
      copy.whoCanSee,
      copy.whoCanPost,
      copy.defaults,
      copy.defaultNotifications,
      copy.defaultChannel,
      copy.leaveOutOfActivity,
      copy.moderation,
      copy.pinnedMessages,
      "Delete channel",
    ]) {
      expect(text).toContain(words);
    }
    expect(text).toContain("Committees");
    expect(text).toContain("Matches Committees. Changes to it reach this channel too.");
    // No report queue on the phone yet.
    expect(text).not.toContain(copy.reports);
    // Save channel waits for a typed change.
    expect(text).not.toContain(copy.save);
  });

  it("saves a switch the moment it flips, and only that field", async () => {
    const tree = render();
    await act(async () =>
      switchFor(tree, copy.defaultChannel).props.onValueChange(true),
    );
    expect(h.update).toHaveBeenCalledWith({
      id: "c1",
      body: { is_default: true },
    });
    await act(async () =>
      switchFor(tree, copy.leaveOutOfActivity).props.onValueChange(true),
    );
    expect(h.update).toHaveBeenLastCalledWith({
      id: "c1",
      body: { activity_excluded: true },
    });
  });

  it("saves a category or a default level when picked", async () => {
    render();
    await act(async () =>
      (h.sheets[`option:${copy.category}`]!.onSelect as (v: unknown) => void)(
        null,
      ),
    );
    expect(h.update).toHaveBeenCalledWith({
      id: "c1",
      body: { category_id: null },
    });
    await act(async () =>
      (
        h.sheets[`option:${copy.defaultNotifications}`]!.onSelect as (
          v: unknown,
        ) => void
      )("mentions"),
    );
    expect(h.update).toHaveBeenLastCalledWith({
      id: "c1",
      body: { default_notification_level: "mentions" },
    });
  });

  it("saves a who-can list when its sheet closes, and keeps an empty chosen list to fix", async () => {
    const tree = render();
    act(() => pressable(tree, copy.whoCanSee).props.onPress());
    const access = () => h.sheets.ChannelAccessSheet!;
    act(() => (access().onChange as (v: unknown) => void)([]));
    await act(async () => (access().onDismiss as () => Promise<void>)());
    expect(h.update).not.toHaveBeenCalled();
    expect(screenText(tree)).toContain(copy.accessIncomplete);

    act(() => (access().onChange as (v: unknown) => void)(["tier:exec"]));
    await act(async () => (access().onDismiss as () => Promise<void>)());
    expect(h.update).toHaveBeenCalledWith({
      id: "c1",
      body: { who_can_see: ["tier:exec"] },
    });
  });

  it("offers Match when the channel differs from its category, and sends the match", async () => {
    h.channels = [channel({ who_can_post: ["role:r1"] })];
    const tree = render();
    expect(screenText(tree)).toContain("Set differently from Committees.");
    await act(async () => pressable(tree, "Match Committees").props.onPress());
    expect(h.update).toHaveBeenCalledWith({
      id: "c1",
      body: { match_category_access: true },
    });
  });

  it("shows Save channel only once a typed field changes, and sends only what changed", async () => {
    const tree = render();
    act(() => inputs(tree)[0]!.props.onChangeText("philanthropy-5k"));
    expect(screenText(tree)).toContain(copy.save);
    await act(async () => pressable(tree, copy.save).props.onPress());
    expect(h.update).toHaveBeenCalledWith({
      id: "c1",
      body: { name: "philanthropy-5k" },
    });
  });

  it("says a private channel's members decide, with nothing to pick", () => {
    h.channels = [channel({ type: "PRIVATE" })];
    const tree = render();
    const text = screenText(tree);
    expect(text).toContain(copy.privateSee);
    expect(text).toContain(copy.privatePost);
    expect(h.sheets.ChannelAccessSheet).toBeUndefined();
  });

  it("locks the audit log's name and offers no delete", () => {
    h.channels = [channel({ is_audit_log: true, type: "PUBLIC" })];
    const tree = render();
    expect(inputs(tree)[0]!.props.editable).toBe(false);
    expect(screenText(tree)).not.toContain("Delete channel");
    expect(h.sheets.DeleteChannelSheet).toBeUndefined();
  });

  it("says a channel that's gone is gone", () => {
    h.channels = [];
    expect(screenText(render())).toContain(
      "This channel isn't here anymore. It may have been deleted.",
    );
  });

  it("tells a role without channels:manage it can't, and draws no rows", () => {
    h.permissions = [];
    const text = screenText(render());
    expect(text).toContain("Your role can't manage channels.");
    expect(text).not.toContain(copy.access);
  });

  it("opens a pinned message in its channel", () => {
    render();
    const router = vi.mocked(useRouter)();
    act(() =>
      (h.sheets.MessageListSheet!.onOpen as (t: unknown) => void)({
        channelId: "c1",
        messageId: "m1",
      }),
    );
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/chat-thread",
      params: { channelId: "c1", focusMessageId: "m1" },
    });
  });
});
