/** @vitest-environment jsdom */
import React from "react";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Alert } from "react-native";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FrappThemeProvider } from "@/lib/theme";
import { screenText } from "@/test/screen-text";
import { memberViewVocabulary, vocab } from "@repo/org-archetypes";
import {
  GROUPS_FOOTNOTE,
  SELF_ASSIGNABLE_SECTION_CAPTION,
} from "@repo/validation";

/**
 * Chapter settings and its Roles screens on the phone (#4074), rendered. They
 * render `app/(app)/{chapter-settings,chapter-roles,role-tier,role}.tsx` but
 * live here: a spec under `app/` ships as a route module (`lib/routes.spec.ts`).
 *
 * The chapter: President (`*`), Officers (tier 1: Treasurer), Brothers (tier
 * 2: Brother), and Rush Chair outside the tiers. "me" holds Treasurer, so the
 * rank rules let them change Brothers and Brother but not Officers.
 */
const h = vi.hoisted(() => ({
  // What the screen hands the Add role sheet (#5736), so a test can finish it.
  pickableSheet: null as null | {
    onCreated: (roleId: string) => void;
    chapterRole?: {
      placements: { value: string | null; label: string }[];
      tierLabel: string;
    };
  },
  newRolePresent: vi.fn(),
  // What Chapter settings hands the New channel sheet (#5296).
  channelSheet: null as null | {
    mode: unknown;
    onSubmit: (values: unknown) => Promise<void>;
  },
  createChannel: vi.fn<(input: unknown) => Promise<object>>(async () => ({})),
  permissions: [] as string[],
  roles: [] as unknown[],
  rolesUpdatedAt: 0,
  tiers: [] as unknown[],
  members: [] as unknown[],
  groups: [] as unknown[],
  vocabulary: {} as Record<string, string>,
  updateRole: vi.fn<(input: unknown) => Promise<object>>(async () => ({})),
  updateGroup: vi.fn<(input: unknown) => Promise<object>>(async () => ({})),
  updateTier: vi.fn<(input: unknown) => Promise<object>>(async () => ({})),
  // #6029: the structure the phone now changes, as web does.
  createTier: vi.fn<(input: unknown) => Promise<object>>(async () => ({})),
  reorderTiers: vi.fn<(ids: unknown) => Promise<object>>(async () => ({})),
  deleteTier: vi.fn<(id: unknown) => Promise<object>>(async () => ({})),
  deleteRole: vi.fn<(id: unknown) => Promise<object>>(async () => ({})),
  createGroup: vi.fn<(input: unknown) => Promise<object>>(async () => ({
    id: "g-new",
  })),
  deleteGroup: vi.fn<(id: unknown) => Promise<object>>(async () => ({})),
  setGroupMembers: vi.fn<(input: unknown) => Promise<object>>(async () => ({})),
  transfer: vi.fn<(input: unknown) => Promise<object>>(async () => ({})),
  accentPresent: vi.fn(),
  backgroundPresent: vi.fn(),
  // `null` is a server without AI; an object is one that has it.
  aiConsent: null as object | null,
  // The chapter's AI switches (#4789), read only where the server has AI.
  aiSettings: null as Record<string, unknown> | null,
  updateAi: vi.fn(),
  aiSaving: false,
  // Chapter config (#5801): whether members may rename themselves.
  config: { members_can_change_name: false } as Record<string, unknown>,
  // The config PATCH's `mutateAsync`, which Chapter settings awaits (#6027).
  patchConfig: vi.fn<(diff: unknown) => Promise<object>>(async () => ({})),
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
    // A server without AI unless a test says so: the AI switches stay off.
    // The real rule (#4504), fed whether this server has AI from `h`.
    useAiConsent: () => ({ data: h.aiConsent }),
    useIsPermissionHidden: () => (permission: string) =>
      real.isPermissionHidden(permission, h.aiConsent !== null),
    usePermissionList: () => h.permissions,
    useMyPermissions: () => ok({ permissions: h.permissions }),
    useRoles: () => ({ ...ok(h.roles), dataUpdatedAt: h.rolesUpdatedAt }),
    useRoleTiers: () => ok(h.tiers),
    useMembers: () => ok(h.members),
    useGroups: () => ok(h.groups),
    usePledgeClasses: () => ok([{ id: "pc1", name: "Alpha" }]),
    useCustomFields: () => ok([]),
    useViewerUserId: () => "me",
    useCurrentChapter: () =>
      ok({ enabled_modules: { geofences: true }, vocabulary: h.vocabulary }),
    useGeofences: () => ok([{ id: "z1" }, { id: "z2" }]),
    useChapterChatBackground: () =>
      ok({ background: "midnight", photo_url: null }),
    useUpdateRole: () => ({ mutateAsync: h.updateRole, isPending: false }),
    useUpdateGroup: () => ({ mutateAsync: h.updateGroup, isPending: false }),
    useChapterRoleColors: () => [],
    useViewerDisplayName: () => "Marcus Ellison",
    useUpdateRoleTier: () => ({ mutateAsync: h.updateTier, isPending: false }),
    useCreateRoleTier: () => ({ mutateAsync: h.createTier, isPending: false }),
    useReorderRoleTiers: () => ({
      mutateAsync: h.reorderTiers,
      isPending: false,
    }),
    useDeleteRoleTier: () => ({ mutateAsync: h.deleteTier, isPending: false }),
    useDeleteRole: () => ({ mutateAsync: h.deleteRole, isPending: false }),
    useCreateGroup: () => ({ mutateAsync: h.createGroup, isPending: false }),
    useDeleteGroup: () => ({ mutateAsync: h.deleteGroup, isPending: false }),
    useSetGroupMembers: () => ({
      mutateAsync: h.setGroupMembers,
      isPending: false,
    }),
    useInvitableRoleIds: () => ok(undefined),
    useTransferPresidency: () => ({
      mutateAsync: h.transfer,
      isPending: false,
    }),
    useAiChapterSettings: (options?: { enabled?: boolean }) =>
      ok(options?.enabled === false ? undefined : h.aiSettings),
    useOrgConfig: (options?: { enabled?: boolean }) =>
      ok(options?.enabled === false ? undefined : h.config),
    usePatchOrgConfig: () => ({
      mutate: vi.fn(),
      mutateAsync: h.patchConfig,
      isPending: false,
    }),
    // The Chapter tab's profile and birthday posts (#6027).
    useUpdateChapter: () => ({ mutate: vi.fn(), isPending: false }),
    useChannels: () => ok([]),
    useCategories: () => ok([]),
    // The Recruitment module is off here, so the interest form stays hidden.
    useInterestFormSettings: () => ok(undefined),
    useUpdateInterestForm: () => ({ mutate: vi.fn(), isPending: false }),
    useChannelAccessOptions: () => ok([]),
    useCreateChannel: () => ({
      mutateAsync: h.createChannel,
      isPending: false,
    }),
    useUpdateAiChapterSettings: () => ({
      mutate: h.updateAi,
      isPending: h.aiSaving,
      isError: false,
    }),
  };
});

vi.mock("@/components/settings/accent-sheet", async () => {
  const React = await import("react");
  return {
    AccentSheet: React.forwardRef(function AccentSheet(
      _props: object,
      ref: React.Ref<{ present: () => void }>,
    ) {
      React.useImperativeHandle(ref, () => ({ present: h.accentPresent }));
      return null;
    }),
  };
});
vi.mock("@/components/settings/chat-background-sheet", async () => {
  const React = await import("react");
  return {
    ChatBackgroundSheet: React.forwardRef(function ChatBackgroundSheet(
      _props: object,
      ref: React.Ref<{ present: () => void }>,
    ) {
      React.useImperativeHandle(ref, () => ({ present: h.backgroundPresent }));
      return null;
    }),
  };
});

vi.mock("@/components/roles/new-role-sheet", async () => {
  const React = await import("react");
  return {
    NewRoleSheet: React.forwardRef(function NewRoleSheet(
      props: NonNullable<typeof h.pickableSheet>,
      ref: React.Ref<{ present: () => void }>,
    ) {
      h.pickableSheet = props;
      React.useImperativeHandle(ref, () => ({ present: h.newRolePresent }));
      return null;
    }),
  };
});

vi.mock("@/components/chat/channel-form-sheet", async () => {
  const React = await import("react");
  return {
    ChannelFormSheet: React.forwardRef(function ChannelFormSheet(
      props: NonNullable<typeof h.channelSheet>,
      ref: React.Ref<{ present: () => void }>,
    ) {
      h.channelSheet = props;
      React.useImperativeHandle(ref, () => ({ present: vi.fn() }));
      return null;
    }),
  };
});

vi.mock("@/lib/chapter-branding", () => ({
  useChapterBranding: () => ({
    accent: "#CB9FFF",
    accentPrimary: "#8E4EC6",
    accentOnPrimary: "#FFFFFF",
    logoUrl: null,
    chapterName: null,
  }),
}));

import ChapterSettingsScreen from "@/app/(app)/chapter-settings";
import ChapterAiScreen from "@/app/(app)/chapter-ai";
import ChapterRolesScreen from "@/app/(app)/chapter-roles";
import RoleTierScreen from "@/app/(app)/role-tier";
import RoleScreen from "@/app/(app)/role";
import { OverrideSheet } from "@/components/roles/override-sheet";
import {
  currentItemMenu,
  dismissItemMenu,
  pickItemMenuAction,
} from "@/components/item-actions-menu";

const role = (over: Record<string, unknown>) => ({
  color: null,
  permissions: [],
  is_system: false,
  system_key: null,
  display_order: 0,
  mentionable: true,
  tier_id: null,
  permission_overrides: {},
  self_assignable: false,
  ...over,
});

const mounted: ReactTestRenderer[] = [];
function render(element: React.ReactElement): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<FrappThemeProvider>{element}</FrappThemeProvider>);
  });
  mounted.push(tree);
  return tree;
}

const switchFor = (tree: ReactTestRenderer, label: string) =>
  tree.root.find(
    (node) =>
      (node.type as unknown) === "Switch" &&
      String(node.props.accessibilityLabel).startsWith(`${label} for`),
  );

const pressable = (tree: ReactTestRenderer, label: string) =>
  tree.root.find(
    (node) =>
      (node.type as unknown) === "Pressable" &&
      node.props.accessibilityLabel === label,
  );

beforeEach(() => {
  h.permissions = ["*"];
  h.vocabulary = {};
  h.tiers = [
    {
      id: "t-off",
      name: "Officers",
      position: 1,
      permissions: ["events:create", "members:invite"],
    },
    {
      id: "t-bro",
      name: "Brothers",
      position: 2,
      permissions: ["members:view"],
    },
  ];
  h.roles = [
    role({
      id: "r-pres",
      name: "President",
      permissions: ["*"],
      is_system: true,
      system_key: "PRESIDENT",
    }),
    role({
      id: "r-tres",
      name: "Treasurer",
      tier_id: "t-off",
      permissions: ["events:create", "members:invite"],
    }),
    role({
      id: "r-bro",
      name: "Brother",
      tier_id: "t-bro",
      permissions: ["members:view"],
    }),
    role({ id: "r-rush", name: "Rush Chair", permissions: ["members:view"] }),
  ];
  h.members = [
    { user_id: "me", role_ids: ["r-tres"] },
    { user_id: "u2", role_ids: ["r-bro"] },
    { user_id: "u3", role_ids: ["r-bro"] },
  ];
  h.updateRole.mockClear().mockResolvedValue({});
  h.updateTier.mockClear().mockResolvedValue({});
  h.updateGroup.mockClear().mockResolvedValue({});
  h.aiConsent = null;
  h.rolesUpdatedAt = 0;
  h.groups = [
    {
      id: "g-house",
      name: "In house",
      kind: "manual",
      color: null,
      member_ids: ["me", "u2"],
    },
    {
      id: "g-class",
      name: "Fall 2025",
      kind: "pledge_class",
      color: null,
      member_ids: ["me"],
    },
  ];
  vi.mocked(useLocalSearchParams).mockReturnValue({});
});

afterEach(() => {
  act(() => {
    for (const tree of mounted.splice(0)) tree.unmount();
  });
});

describe("Chapter settings (#4074)", () => {
  it("holds the accent, chat background, Roles and the modules for an officer", () => {
    const text = screenText(render(<ChapterSettingsScreen />));
    expect(text).toContain("Chapter accent");
    expect(text).toContain("Chat background");
    expect(text).toContain("Midnight");
    // Study zones is a module row now (#6030); its zone count moved to its
    // screen.
    expect(text).toContain("Modules");
    expect(text).toContain("Study zones");
    expect(text).not.toContain("Managed on the web dashboard.");
    expect(text).toContain("Roles");
    expect(text).not.toContain("Set by an officer");
  });

  it("lets an officer with chapter-config:manage turn member renames on (#5801)", () => {
    h.patchConfig.mockClear();
    h.permissions = ["*"];
    const tree = render(<ChapterSettingsScreen />);
    expect(screenText(tree)).toContain(
      "Members can change their own name\nWhen off, officers who manage roles change names.",
    );
    const toggle = tree.root.find(
      (node) =>
        node.props.accessibilityLabel === "Members can change their own name" &&
        typeof node.props.onValueChange === "function",
    );
    expect(toggle.props.value).toBe(false);
    act(() => toggle.props.onValueChange(true));
    expect(h.patchConfig).toHaveBeenCalledWith({
      members_can_change_name: true,
    });
  });

  it("shows the member-names switch read-only to a viewer without :manage (#5801)", () => {
    h.patchConfig.mockClear();
    h.permissions = ["chapter-config:view"];
    const tree = render(<ChapterSettingsScreen />);
    const toggle = tree.root.find(
      (node) =>
        node.props.accessibilityLabel === "Members can change their own name" &&
        typeof node.props.onValueChange === "function",
    );
    expect(toggle.props.disabled).toBe(true);
  });

  it("opens the accent and background sheets for an editor", () => {
    h.accentPresent.mockClear();
    h.backgroundPresent.mockClear();
    const tree = render(<ChapterSettingsScreen />);
    act(() => pressable(tree, "Chapter accent").props.onPress());
    act(() => pressable(tree, "Chat background").props.onPress());
    expect(h.accentPresent).toHaveBeenCalled();
    expect(h.backgroundPresent).toHaveBeenCalled();
  });

  it("tells a member who can't edit the chapter who can, with no way into the sheets", () => {
    h.permissions = ["chapter-config:view"];
    const tree = render(<ChapterSettingsScreen />);
    expect(screenText(tree)).toContain(
      "Set by an officer with chapter settings access.",
    );
    expect(
      tree.root.findAll(
        (node) =>
          (node.type as unknown) === "Pressable" &&
          (node.props.accessibilityLabel === "Chapter accent" ||
            node.props.accessibilityLabel === "Chat background"),
      ),
    ).toHaveLength(0);
  });

  // #5296 (Shawn, 2026-11-22): the phone makes channels and roles, simply.
  it("offers New channel to whoever can make one, opening the channel it made", async () => {
    h.permissions = ["channels:create", "channels:manage"];
    h.channelSheet = null;
    h.createChannel.mockClear().mockResolvedValue({ id: "c-new" });
    const tree = render(<ChapterSettingsScreen />);
    expect(h.channelSheet).toBeNull();
    act(() => pressable(tree, "New channel").props.onPress());
    expect(h.channelSheet!.mode).toEqual({ kind: "create", categoryId: null });
    const push = vi.mocked(useRouter().push);
    push.mockClear();
    await act(async () => {
      await h.channelSheet!.onSubmit({
        name: "rush-2027",
        description: "",
        categoryId: null,
        isPrivate: false,
        access: {},
      });
    });
    expect(h.createChannel).toHaveBeenCalledWith({
      name: "rush-2027",
      description: undefined,
      type: "PUBLIC",
      category_id: undefined,
    });
    expect(push).toHaveBeenCalledWith({
      pathname: "/chat-thread",
      params: { channelId: "c-new" },
    });
  });

  it("says a refused New channel in the sheet's words, and opens nothing", async () => {
    h.permissions = ["channels:create", "channels:manage"];
    h.channelSheet = null;
    h.createChannel
      .mockClear()
      .mockRejectedValue({ statusCode: 500, message: "boom" });
    const tree = render(<ChapterSettingsScreen />);
    act(() => pressable(tree, "New channel").props.onPress());
    const push = vi.mocked(useRouter().push);
    push.mockClear();
    let caught: unknown;
    await act(async () => {
      await h
        .channelSheet!.onSubmit({
          name: "rush-2027",
          description: "",
          categoryId: null,
          isPrivate: false,
          access: {},
        })
        .catch((error: unknown) => {
          caught = error;
        });
    });
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).not.toBe("boom");
    expect((caught as Error).message.length).toBeGreaterThan(0);
    expect(push).not.toHaveBeenCalled();
  });

  // #6029: People holds web's three pages, each with its count; a role is
  // added in its tier on Roles and groups, so New role is no longer a row.
  it("lists Roles and groups, Pledge class and Member fields under People", () => {
    h.permissions = ["roles:manage", "members:view", "chapter-config:view"];
    const tree = render(<ChapterSettingsScreen />);
    const text = screenText(tree);
    const classTerm = vocab(
      "class",
      memberViewVocabulary({ vocabulary: h.vocabulary }),
    );
    expect(text).toContain("Roles and groups");
    expect(text).toContain(classTerm);
    expect(text).toContain("Member fields");
    expect(text).toContain("No fields");
    expect(text).not.toContain("New role");
    const push = vi.mocked(useRouter().push);
    push.mockClear();
    act(() => pressable(tree, classTerm).props.onPress());
    act(() => pressable(tree, "Member fields").props.onPress());
    expect(push.mock.calls).toEqual([["/pledge-classes"], ["/member-fields"]]);
  });

  it("offers no New channel without both channel permissions", () => {
    h.permissions = ["chapter-config:view", "channels:create"];
    const text = screenText(render(<ChapterSettingsScreen />));
    expect(text).not.toContain("New channel");
  });

  it("shows Pledge class only to a roles manager, and Member fields only to a config viewer", () => {
    h.permissions = ["roles:manage", "members:view"];
    expect(screenText(render(<ChapterSettingsScreen />))).not.toContain(
      "Member fields",
    );
    h.permissions = ["chapter-config:view"];
    const text = screenText(render(<ChapterSettingsScreen />));
    expect(text).toContain("Member fields");
    expect(text).not.toContain(
      vocab("class", memberViewVocabulary({ vocabulary: h.vocabulary })),
    );
  });

  it("offers no New role without roles:manage, and ends on the web line", () => {
    h.permissions = ["chapter-config:view"];
    const text = screenText(render(<ChapterSettingsScreen />));
    expect(text).toContain("Roles and groups");
    expect(text).not.toContain("New role");
    expect(text).toContain("More settings are on the web dashboard.");
  });

  it("shows a roles manager only Roles and groups, which opens that screen", () => {
    h.permissions = ["roles:manage", "members:view"];
    const tree = render(<ChapterSettingsScreen />);
    expect(screenText(tree)).not.toContain("Chapter accent");
    const push = vi.mocked(useRouter().push);
    push.mockClear();
    act(() => pressable(tree, "Roles and groups").props.onPress());
    expect(push).toHaveBeenCalledWith("/chapter-roles");
  });
});

// The switches are their own screen since #6028; Chapter settings keeps a row.
describe("Chapter settings → AI (#4789, #6028)", () => {
  const aiSwitch = (tree: ReturnType<typeof render>, label: string) =>
    tree.root.find(
      (node) =>
        node.props.accessibilityLabel === label &&
        typeof node.props.onValueChange === "function",
    );
  const settings = (over: Record<string, unknown> = {}) => ({
    ask: true,
    meeting_notes: false,
    chat_source: false,
    can_change: true,
    updated_at: null,
    ...over,
  });
  afterEach(() => {
    h.aiConsent = null;
    h.aiSettings = null;
    h.aiSaving = false;
  });

  it("isn't drawn where the server has no AI", () => {
    h.aiSettings = settings();
    expect(screenText(render(<ChapterSettingsScreen />))).not.toContain(
      "Questions and requests",
    );
  });

  it("lets the president turn a switch on, and names no AI company", () => {
    h.aiConsent = { answer: "yes" };
    h.aiSettings = settings();
    h.updateAi.mockClear();
    const tree = render(<ChapterAiScreen />);
    expect(aiSwitch(tree, "Questions and requests").props.value).toBe(true);
    act(() => aiSwitch(tree, "Minutes from notes").props.onValueChange(true));
    expect(h.updateAi).toHaveBeenCalledWith(
      { meeting_notes: true },
      expect.anything(),
    );
    expect(screenText(tree)).not.toMatch(/Anthropic|Google|AssemblyAI/);
  });

  it("holds Include channel messages off until Ask is on, but lets it go off", () => {
    h.aiConsent = { answer: "yes" };
    h.aiSettings = settings({ ask: false });
    const off = render(<ChapterAiScreen />);
    expect(aiSwitch(off, "Include channel messages").props.disabled).toBe(true);
    expect(screenText(off)).toContain("Turn on Questions and requests first.");

    h.aiSettings = settings({ ask: false, chat_source: true });
    const on = render(<ChapterAiScreen />);
    expect(aiSwitch(on, "Include channel messages").props.disabled).toBe(false);
  });

  it("draws Include channel messages nested under Ask, muted while Ask is off", () => {
    h.aiConsent = { answer: "yes" };
    h.aiSettings = settings({ ask: false });
    const tree = render(<ChapterAiScreen />);
    const row = tree.root.find(
      (node) =>
        node.props.label === "Include channel messages" &&
        node.props.trailing !== undefined,
    );
    expect(row.props.nested).toBe(true);
    expect(row.props.muted).toBe(true);
  });

  it("holds every switch while one saves", () => {
    h.aiConsent = { answer: "yes" };
    h.aiSettings = settings();
    h.aiSaving = true;
    const tree = render(<ChapterAiScreen />);
    expect(aiSwitch(tree, "Questions and requests").props.disabled).toBe(true);
    expect(aiSwitch(tree, "Minutes from notes").props.disabled).toBe(true);
  });

  it("says on the switch's own row when its save failed", () => {
    h.aiConsent = { answer: "yes" };
    h.aiSettings = settings();
    h.updateAi.mockReset();
    h.updateAi.mockImplementation(
      (_body: unknown, options?: { onError?: () => void }) =>
        options?.onError?.(),
    );
    const tree = render(<ChapterAiScreen />);
    act(() => aiSwitch(tree, "Minutes from notes").props.onValueChange(true));
    const row = tree.root.find(
      (node) =>
        node.props.label === "Minutes from notes" &&
        node.props.trailing !== undefined,
    );
    expect(row.props.description).toBe(
      "Couldn't change the AI setting. Try again.",
    );
    expect(row.props.descriptionTone).toBe("destructive");
    h.updateAi.mockReset();
  });

  it("leaves the switches to chapter-config:view, as web's AI tab", () => {
    h.aiConsent = { answer: "yes" };
    h.aiSettings = settings();
    h.permissions = ["roles:manage", "members:view"];
    const text = screenText(render(<ChapterSettingsScreen />));
    expect(text).toContain("Roles");
    expect(text).not.toContain("Questions and requests");
  });

  it("shows an officer the switches read-only, saying only the president changes them", () => {
    h.aiConsent = { answer: "yes" };
    h.aiSettings = settings({ can_change: false });
    const tree = render(<ChapterAiScreen />);
    expect(aiSwitch(tree, "Questions and requests").props.disabled).toBe(true);
    expect(screenText(tree)).toContain(
      "Only the chapter president can turn these on or off.",
    );
  });
});

describe("Roles (#4074)", () => {
  it("lists the chapter's own groups after the roles, the kept ones behind one row", () => {
    const tree = render(<ChapterRolesScreen />);
    const text = screenText(tree);
    expect(text).toContain("Groups");
    expect(text).toContain(GROUPS_FOOTNOTE);
    expect(text.indexOf("In house")).toBeGreaterThan(
      text.indexOf("Rush Chair"),
    );
    expect(text).toContain("2 members");
    // Pledge classes, class years and majors are one row, as on web.
    expect(
      text.indexOf("Pledge classes, class years and majors"),
    ).toBeGreaterThan(text.indexOf("In house"));
    expect(text).not.toContain("Fall 2025");
    const push = vi.mocked(useRouter().push);
    push.mockClear();
    act(() =>
      pressable(tree, "Pledge classes, class years and majors").props.onPress(),
    );
    expect(push).toHaveBeenCalledWith({
      pathname: "/chapter-roles",
      params: { groups: "automatic" },
    });
    act(() => pressable(tree, "In house").props.onPress());
    expect(push).toHaveBeenCalledWith({
      pathname: "/chapter-roles",
      params: { group: "g-house" },
    });
  });

  it("lists the kept groups on their own page, with what each follows", () => {
    vi.mocked(useLocalSearchParams).mockReturnValue({ groups: "automatic" });
    const text = screenText(render(<ChapterRolesScreen />));
    expect(text).toContain("Fall 2025");
    expect(text).toContain("Follows pledge class");
    expect(text).toContain("1 member");
    expect(text).not.toContain("In house");
  });

  it("shows a groups manager without roles:manage only the groups", () => {
    h.permissions = ["groups:manage", "members:view"];
    const tree = render(<ChapterRolesScreen />);
    const text = screenText(tree);
    expect(text).toContain("In house");
    expect(text).not.toContain("Treasurer");
  });

  it("lists the tiers in rank order with their roles, then the roles outside", () => {
    const text = screenText(render(<ChapterRolesScreen />));
    expect(text).toContain("4 roles in 2 tiers");
    const order = [
      "Officers",
      "Treasurer",
      "Brothers",
      "Brother",
      "Outside the tiers",
      "President",
      "Rush Chair",
    ];
    let last = -1;
    for (const word of order) {
      const at = text.indexOf(word, last + 1);
      expect(at, word).toBeGreaterThan(last);
      last = at;
    }
  });

  it("notes the President's and Everyone's roles as web's list does", () => {
    h.roles = [
      ...h.roles,
      role({
        id: "r-all",
        name: "Everyone",
        tier_id: null,
        permissions: ["members:view"],
        is_system: true,
        system_key: "EVERYONE",
      }),
    ];
    const text = screenText(render(<ChapterRolesScreen />));
    expect(text).toContain("Can do everything");
    expect(text).toContain("Pinged as @everyone");
  });

  it("names tiers in the chapter's own word", () => {
    h.vocabulary = { tier: "Level" };
    const text = screenText(render(<ChapterRolesScreen />));
    expect(text).toContain("4 roles in 2 levels");
    expect(text).toContain("Outside the levels");
  });

  it("opens a tier's permissions and a role's page", () => {
    const tree = render(<ChapterRolesScreen />);
    const push = vi.mocked(useRouter().push);
    push.mockClear();
    const permissionsRow = tree.root.find(
      (node) =>
        (node.type as unknown) === "Pressable" &&
        node.props.accessibilityHint ===
          "Opens Brothers: what every role in it can do.",
    );
    act(() => permissionsRow.props.onPress());
    expect(push).toHaveBeenCalledWith({
      pathname: "/role-tier",
      params: { tierId: "t-bro" },
    });
    // The role's row; the Default invite role sheet lists it too.
    const rushRow = tree.root.find(
      (node) =>
        (node.type as unknown) === "Pressable" &&
        node.props.accessibilityLabel === "Rush Chair" &&
        node.props.accessibilityHint === "Opens what this role can do.",
    );
    act(() => rushRow.props.onPress());
    expect(push).toHaveBeenCalledWith({
      pathname: "/role",
      params: { roleId: "r-rush" },
    });
  });

  it("names a class year by its standing, and finds it by that (#5786)", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-20T12:00:00Z"));
    try {
      h.groups = [
        ...h.groups,
        {
          id: "g-29",
          name: "Class of 2029",
          kind: "class_year",
          class_year: 2029,
          color: null,
          member_ids: ["u2"],
        },
      ];
      h.roles = [
        ...h.roles,
        ...Array.from({ length: 10 }, (_, index) =>
          role({
            id: `r-x${index}`,
            name: `Committee ${index}`,
            tier_id: "t-bro",
          }),
        ),
      ];
      const tree = render(<ChapterRolesScreen />);
      const search = tree.root.find(
        (node) =>
          (node.type as unknown) === "TextInput" &&
          node.props.accessibilityLabel === "Find a role or group",
      );
      act(() => search.props.onChangeText("soph"));
      const text = screenText(tree);
      expect(text).toContain("Sophomores · Class of 2029");
      expect(text).not.toContain("In house");
    } finally {
      vi.useRealTimers();
    }
  });

  it("finds a role or group by name once the list is long", () => {
    h.roles = [
      ...h.roles,
      ...Array.from({ length: 10 }, (_, index) =>
        role({
          id: `r-x${index}`,
          name: `Committee ${index}`,
          tier_id: "t-bro",
        }),
      ),
    ];
    const tree = render(<ChapterRolesScreen />);
    const search = tree.root.find(
      (node) =>
        (node.type as unknown) === "TextInput" &&
        node.props.accessibilityLabel === "Find a role or group",
    );
    act(() => search.props.onChangeText("rush"));
    const text = screenText(tree);
    expect(text).toContain("Rush Chair");
    expect(text).not.toContain("Committee 3");
    expect(text).not.toContain("Treasurer");
    expect(text).not.toContain("In house");
    act(() => search.props.onChangeText("house"));
    expect(screenText(tree)).toContain("In house");
  });
});

describe("A tier's permissions (#4074)", () => {
  it("saves a switch as the tier's whole list", async () => {
    vi.mocked(useLocalSearchParams).mockReturnValue({ tierId: "t-bro" });
    const tree = render(<RoleTierScreen />);
    expect(screenText(tree)).toContain("Brothers");
    await act(async () => {
      switchFor(tree, "Create events").props.onValueChange(true);
    });
    expect(h.updateTier).toHaveBeenCalledWith({
      id: "t-bro",
      body: { permissions: ["members:view", "events:create"] },
    });
  });

  it("locks a tier at or above the officer's own, and says why once", () => {
    h.permissions = ["events:create", "members:invite", "roles:manage"];
    vi.mocked(useLocalSearchParams).mockReturnValue({ tierId: "t-off" });
    const tree = render(<RoleTierScreen />);
    expect(screenText(tree)).toContain(
      "This tier ranks at or above yours, so your role can't change it.",
    );
    expect(switchFor(tree, "Invite members").props.disabled).toBe(true);
  });

  it("won't let an officer give what their role lacks, and says so on the row", () => {
    h.permissions = ["events:create", "members:invite", "roles:manage"];
    vi.mocked(useLocalSearchParams).mockReturnValue({ tierId: "t-bro" });
    const tree = render(<RoleTierScreen />);
    expect(switchFor(tree, "Create events").props.disabled).toBe(false);
    expect(switchFor(tree, "Remove members").props.disabled).toBe(true);
    expect(screenText(tree)).toContain(
      "You can't give this, because your role doesn't have it.",
    );
  });

  it("puts a failed save on its row, and the switch back", async () => {
    vi.mocked(useLocalSearchParams).mockReturnValue({ tierId: "t-bro" });
    h.updateTier.mockRejectedValueOnce(new Error("boom"));
    const tree = render(<RoleTierScreen />);
    await act(async () => {
      switchFor(tree, "Create events").props.onValueChange(true);
    });
    expect(screenText(tree)).toContain("Couldn't update Brothers.");
    expect(switchFor(tree, "Create events").props.value).toBe(false);
  });
});

describe("A role's permissions (#4074)", () => {
  it("shows each answer and where it comes from, and saves one override key", async () => {
    vi.mocked(useLocalSearchParams).mockReturnValue({ roleId: "r-bro" });
    const tree = render(<RoleScreen />);
    const text = screenText(tree);
    expect(text).toContain("Starts from Brothers.");
    // Following the tier is the quiet default: no line under the row.
    expect(text).not.toContain("Same as Brothers");

    act(() => pressable(tree, "Create events").props.onPress());
    const sheet = tree.root.findByType(OverrideSheet);
    expect(sheet.props.target).toMatchObject({
      permission: "events:create",
      tierHas: false,
      current: null,
    });
    await act(async () => {
      sheet.props.onPick("events:create", true);
    });
    expect(screenText(tree)).toContain(
      "Create events\nSet for this role. Brothers has it off.",
    );
    expect(h.updateRole).toHaveBeenCalledWith({
      id: "r-bro",
      body: { permission_overrides: { "events:create": true } },
    });
  });

  it("gives a role outside the tiers plain switches", async () => {
    vi.mocked(useLocalSearchParams).mockReturnValue({ roleId: "r-rush" });
    const tree = render(<RoleScreen />);
    expect(screenText(tree)).toContain(
      "Outside the tiers, so its permissions are its own.",
    );
    await act(async () => {
      switchFor(tree, "Create events").props.onValueChange(true);
    });
    expect(h.updateRole).toHaveBeenCalledWith({
      id: "r-rush",
      body: { permissions: ["members:view", "events:create"] },
    });
  });

  it("keeps the President's role still", () => {
    vi.mocked(useLocalSearchParams).mockReturnValue({ roleId: "r-pres" });
    const tree = render(<RoleScreen />);
    expect(screenText(tree)).toContain(
      "This role can do everything. That only moves through Transfer presidency.",
    );
    expect(switchFor(tree, "Invite members").props.disabled).toBe(true);
    expect(switchFor(tree, "Invite members").props.value).toBe(true);
  });
});

describe("Non-chapter business on the phone (#4958)", () => {
  const pickSwitch = (tree: ReactTestRenderer) =>
    tree.root.findAll(
      (node) =>
        (node.type as unknown) === "Switch" &&
        String(node.props.accessibilityLabel).startsWith(
          "Non-chapter business for",
        ),
    );

  it("marks a safe role with Save role, as web's page does", async () => {
    h.roles = [...h.roles, role({ id: "r-ims", name: "Intramurals" })];
    vi.mocked(useLocalSearchParams).mockReturnValue({ roleId: "r-ims" });
    const tree = render(<RoleScreen />);
    const [toggle] = pickSwitch(tree);
    expect(toggle!.props.disabled).toBe(false);
    act(() => toggle!.props.onValueChange(true));
    expect(h.updateRole).not.toHaveBeenCalled();
    expect(pickSwitch(tree)[0]!.props.value).toBe(true);
    await act(async () => {
      pressable(tree, "Save role").props.onPress();
    });
    expect(h.updateRole).toHaveBeenCalledWith({
      id: "r-ims",
      body: { self_assignable: true },
    });
    expect(screenText(tree)).toContain("Saved");
  });

  it("says why a role in a tier or with permissions can't be, and offers only off", () => {
    vi.mocked(useLocalSearchParams).mockReturnValue({ roleId: "r-bro" });
    let tree = render(<RoleScreen />);
    expect(screenText(tree)).toContain(
      "Roles members pick themselves sit outside the tiers, since a tier carries rank. Move it out, or turn off Non-chapter business.",
    );
    expect(pickSwitch(tree)[0]!.props.disabled).toBe(true);

    vi.mocked(useLocalSearchParams).mockReturnValue({ roleId: "r-rush" });
    tree = render(<RoleScreen />);
    expect(screenText(tree)).toContain(
      "Roles members pick themselves can't carry permissions",
    );
    expect(pickSwitch(tree)[0]!.props.disabled).toBe(true);
  });

  it("lets a marked role that became unsafe be turned off", () => {
    h.roles = [
      ...h.roles,
      role({
        id: "r-ims",
        name: "Intramurals",
        tier_id: "t-bro",
        self_assignable: true,
      }),
    ];
    vi.mocked(useLocalSearchParams).mockReturnValue({ roleId: "r-ims" });
    const [toggle] = pickSwitch(render(<RoleScreen />));
    expect(toggle!.props.value).toBe(true);
    expect(toggle!.props.disabled).toBe(false);
  });

  it("judges it against the drafted tier, and moves the role with Save role", async () => {
    h.roles = [
      ...h.roles,
      role({ id: "r-ims", name: "Intramurals", tier_id: "t-bro" }),
    ];
    vi.mocked(useLocalSearchParams).mockReturnValue({ roleId: "r-ims" });
    const tree = render(<RoleScreen />);
    expect(pickSwitch(tree)[0]!.props.disabled).toBe(true);
    // The Tier row's sheet: the tiers, then outside the tiers.
    const tierSheet = tree.root.find(
      (node) =>
        node.props.title === "Tier" && Array.isArray(node.props.options),
    );
    expect(
      tierSheet.props.options.map((option: { label: string }) => option.label),
    ).toEqual(["Officers", "Brothers", "Outside the tiers"]);
    act(() => tierSheet.props.onSelect("__outside__"));
    expect(pickSwitch(tree)[0]!.props.disabled).toBe(false);
    act(() => pickSwitch(tree)[0]!.props.onValueChange(true));
    await act(async () => {
      pressable(tree, "Save role").props.onPress();
    });
    expect(h.updateRole).toHaveBeenCalledWith({
      id: "r-ims",
      body: { tier_id: null, self_assignable: true },
    });
  });

  it("has no switch on a built-in role", () => {
    vi.mocked(useLocalSearchParams).mockReturnValue({ roleId: "r-pres" });
    expect(pickSwitch(render(<RoleScreen />))).toHaveLength(0);
  });

  it("says a failed Save role beside the button, and keeps the draft", async () => {
    h.roles = [...h.roles, role({ id: "r-ims", name: "Intramurals" })];
    h.updateRole.mockRejectedValueOnce(new Error("boom"));
    vi.mocked(useLocalSearchParams).mockReturnValue({ roleId: "r-ims" });
    const tree = render(<RoleScreen />);
    act(() => pickSwitch(tree)[0]!.props.onValueChange(true));
    await act(async () => {
      pressable(tree, "Save role").props.onPress();
    });
    expect(screenText(tree)).toContain("Your change wasn't saved.");
    expect(pickSwitch(tree)[0]!.props.value).toBe(true);
  });

  it("lists marked roles apart on the Roles screen", () => {
    h.roles = [
      ...h.roles,
      role({ id: "r-ims", name: "Intramurals", self_assignable: true }),
    ];
    const text = screenText(render(<ChapterRolesScreen />));
    const outside = text.indexOf("Outside the tiers");
    const business = text.indexOf("Non-chapter business");
    expect(business).toBeGreaterThan(outside);
    expect(text.indexOf("Rush Chair")).toBeLessThan(business);
    expect(text.indexOf("Intramurals")).toBeGreaterThan(business);
  });

  it("shows no empty Non-chapter business to a member who can't fill it", () => {
    h.permissions = ["members:view"];
    expect(screenText(render(<ChapterRolesScreen />))).not.toContain(
      "Non-chapter business",
    );
  });

  it("offers a roles manager Add role in Non-chapter business (#5736)", () => {
    const text = screenText(render(<ChapterRolesScreen />));
    const business = text.indexOf("Non-chapter business");
    expect(text).toContain(SELF_ASSIGNABLE_SECTION_CAPTION);
    expect(text).not.toContain("Turn it on from");
    expect(text.indexOf("Add role", business)).toBeGreaterThan(business);
  });

  it("keeps Add role once Non-chapter business has roles", () => {
    h.roles = [
      ...h.roles,
      role({ id: "r-ims", name: "Intramurals", self_assignable: true }),
    ];
    const text = screenText(render(<ChapterRolesScreen />));
    expect(text.lastIndexOf("Add role")).toBeGreaterThan(
      text.indexOf("Intramurals"),
    );
  });

  it("opens the new role's page once the sheet creates it", () => {
    render(<ChapterRolesScreen />);
    const push = vi.mocked(useRouter().push);
    push.mockClear();
    act(() => h.pickableSheet!.onCreated("r-new"));
    expect(push).toHaveBeenCalledWith({
      pathname: "/role",
      params: { roleId: "r-new" },
    });
  });

  it("offers no Add role to a roles manager who sits outside the tiers", () => {
    h.permissions = ["roles:manage", "members:view"];
    h.members = [{ user_id: "me", role_ids: ["r-rush"] }];
    const text = screenText(render(<ChapterRolesScreen />));
    expect(text).toContain("Non-chapter business");
    expect(text).not.toContain("Add role");
  });
});

/**
 * The switches for features this server doesn't offer stay off both screens
 * (#4504). Both screens draw through `useIsPermissionHidden`; the rule itself
 * (AI until the server has AI, Meetings while held off for the beta) is
 * pinned once, in `@repo/hooks`' own spec.
 */
describe("Switches for features not offered here (#4504)", () => {
  const AI_LABELS = ["Use AI", "Let AI take actions"];

  for (const [screen, params, Screen] of [
    ["tier", { tierId: "t-bro" }, RoleTierScreen],
    ["role", { roleId: "r-bro" }, RoleScreen],
  ] as const) {
    it(`leaves the AI switches off the ${screen} screen while the server has AI off`, () => {
      vi.mocked(useLocalSearchParams).mockReturnValue(params);
      const text = screenText(render(<Screen />));
      // A switch this screen always draws, so an empty screen can't pass.
      expect(text).toContain("Create events");
      for (const label of AI_LABELS) expect(text).not.toContain(label);
    });

    it(`offers the AI switches on the ${screen} screen once the server has AI`, () => {
      h.aiConsent = {};
      vi.mocked(useLocalSearchParams).mockReturnValue(params);
      const text = screenText(render(<Screen />));
      for (const label of AI_LABELS) expect(text).toContain(label);
    });
  }
});

describe("Role and group colors on the phone (#5966, #5791)", () => {
  /** The color sheet's prop-holding node: the one with `previewName`. */
  const colorSheet = (tree: ReturnType<typeof render>) =>
    tree.root.find(
      (node) =>
        typeof node.props.previewName === "string" &&
        typeof node.props.onChange === "function",
    );

  it("drafts a role's color on its page and saves it with Save role", async () => {
    vi.mocked(useLocalSearchParams).mockReturnValue({ roleId: "r-tres" });
    const tree = render(<RoleScreen />);
    expect(screenText(tree)).toContain("No color");
    act(() => colorSheet(tree).props.onChange("#00B2E0"));
    expect(screenText(tree)).toContain("Bright sky");
    expect(h.updateRole).not.toHaveBeenCalled();
    await act(async () => {
      pressable(tree, "Save role").props.onPress();
    });
    expect(h.updateRole).toHaveBeenLastCalledWith({
      id: "r-tres",
      body: { color: "#00B2E0" },
    });
  });

  it("leaves a role's color read-only to someone who can't edit roles", () => {
    h.permissions = ["chapter-config:view"];
    vi.mocked(useLocalSearchParams).mockReturnValue({ roleId: "r-tres" });
    const tree = render(<RoleScreen />);
    const row = tree.root.find(
      (node) => node.props.label === "Color" && node.props.value === "No color",
    );
    expect(row.props.onPress).toBeUndefined();
  });

  it("leaves the color of a role at or above the officer's own rank read-only", () => {
    // `me` holds Treasurer (Officers): a roles manager edits only roles
    // ranked below their own.
    h.permissions = ["roles:manage", "members:view", "chapter-config:view"];
    const colorRow = (roleId: string) => {
      vi.mocked(useLocalSearchParams).mockReturnValue({ roleId });
      const tree = render(<RoleScreen />);
      return tree.root.find(
        (node) =>
          node.props.label === "Color" && node.props.value === "No color",
      );
    };
    expect(colorRow("r-tres").props.onPress).toBeUndefined();
    expect(colorRow("r-bro").props.onPress).toBeTypeOf("function");
  });

  it("drafts a group's color, ping switch and members on its page, saved together", async () => {
    h.permissions = ["groups:manage", "members:view"];
    h.members = [
      ...h.members,
      { id: "m4", user_id: "u4", display_name: "Dana Ortiz", role_ids: [] },
    ];
    vi.mocked(useLocalSearchParams).mockReturnValue({ group: "g-house" });
    const tree = render(<ChapterRolesScreen />);
    expect(screenText(tree)).toContain("Anyone can @mention this group");
    expect(colorSheet(tree).props.previewName).toBe("In house");
    act(() => colorSheet(tree).props.onChange("#3DD6C4"));
    const addSheet = tree.root.find(
      (node) =>
        node.props.title === "Add a member" &&
        Array.isArray(node.props.options),
    );
    act(() => addSheet.props.onSelect("u4"));
    expect(h.updateGroup).not.toHaveBeenCalled();
    await act(async () => {
      pressable(tree, "Save").props.onPress();
    });
    expect(h.updateGroup).toHaveBeenLastCalledWith({
      id: "g-house",
      body: { color: "#3DD6C4" },
    });
    expect(h.setGroupMembers).toHaveBeenCalledWith({
      id: "g-house",
      memberIds: ["me", "u2", "u4"],
    });
  });

  it("says a failed group save beside Save", async () => {
    h.permissions = ["groups:manage", "members:view"];
    h.updateGroup.mockRejectedValueOnce(new Error("boom"));
    vi.mocked(useLocalSearchParams).mockReturnValue({ group: "g-house" });
    const tree = render(<ChapterRolesScreen />);
    act(() => colorSheet(tree).props.onChange("#3DD6C4"));
    await act(async () => {
      pressable(tree, "Save").props.onPress();
    });
    expect(screenText(tree)).toContain("Nothing more was changed.");
  });

  it("gives no color control or Save on a group to someone without groups:manage", () => {
    h.permissions = ["members:view", "chapter-config:view"];
    vi.mocked(useLocalSearchParams).mockReturnValue({ group: "g-house" });
    const tree = render(<ChapterRolesScreen />);
    const row = tree.root.find(
      (node) => node.props.label === "Color" && node.props.value === "No color",
    );
    expect(row.props.onPress).toBeUndefined();
    expect(screenText(tree)).not.toContain("Save");
  });
});

/** Answers the platform alert `confirmAlert` raised with its confirm button. */
async function confirmLastAlert(title: string) {
  const alert = vi.mocked(Alert.alert);
  const [shown, , buttons] = alert.mock.calls.at(-1)!;
  expect(shown).toBe(title);
  const confirm = (buttons as { text: string; onPress?: () => void }[]).at(-1)!;
  await act(async () => {
    confirm.onPress?.();
  });
}

describe("Roles and groups' structure on the phone (#6029)", () => {
  afterEach(() => {
    act(() => dismissItemMenu());
  });

  const longPress = (tree: ReactTestRenderer, name: string) => {
    const row = tree.root.find(
      (node) =>
        (node.type as unknown) === "Pressable" &&
        node.props.accessibilityLabel === name &&
        node.props.accessibilityHint === "Opens what this role can do.",
    );
    act(() => row.props.onLongPress());
  };

  it("draws web's groups in web's order and words", () => {
    const text = screenText(render(<ChapterRolesScreen />));
    const order = [
      "Officers",
      "Permissions",
      "Treasurer",
      "Add role",
      "Brothers",
      "Add tier",
      "Outside the tiers",
      "Rank below every tier, like alumni or advisors.",
      "Non-chapter business",
      "None yet",
      "Groups",
      "New group",
      "Invites and presidency",
      "Default invite role",
      "Transfer presidency",
    ];
    let last = -1;
    for (const word of order) {
      const at = text.indexOf(word, last + 1);
      expect(at, word).toBeGreaterThan(last);
      last = at;
    }
    expect(text).toContain("2 on");
    expect(text).toContain("2 members");
    expect(text).not.toContain("web dashboard");
  });

  it("moves a role down its tier from its long press", async () => {
    h.roles = [
      ...h.roles,
      role({
        id: "r-sec",
        name: "Secretary",
        tier_id: "t-off",
        display_order: 1,
      }),
    ];
    const tree = render(<ChapterRolesScreen />);
    longPress(tree, "Treasurer");
    const labels = currentItemMenu()!.actions.map((action) => action.label);
    expect(labels).toEqual([
      "Move down",
      "Move to Brothers",
      "Move to Outside the tiers",
      "Delete role",
    ]);
    await act(async () => pickItemMenuAction("Move down"));
    expect(h.updateRole).toHaveBeenCalledWith({
      id: "r-tres",
      body: { display_order: 1 },
    });
    expect(h.updateRole).toHaveBeenCalledWith({
      id: "r-sec",
      body: { display_order: 0 },
    });
  });

  it("moves a role to another tier, and deletes one after asking", async () => {
    const tree = render(<ChapterRolesScreen />);
    longPress(tree, "Rush Chair");
    await act(async () => pickItemMenuAction("Move to Brothers"));
    expect(h.updateRole).toHaveBeenCalledWith({
      id: "r-rush",
      body: { tier_id: "t-bro" },
    });
    longPress(tree, "Rush Chair");
    act(() => pickItemMenuAction("Delete role"));
    await confirmLastAlert("Delete Rush Chair?");
    expect(h.deleteRole).toHaveBeenCalledWith("r-rush");
  });

  it("offers no menu on a role the officer can't change", () => {
    h.permissions = ["chapter-config:view"];
    const tree = render(<ChapterRolesScreen />);
    const row = tree.root.find(
      (node) =>
        (node.type as unknown) === "Pressable" &&
        node.props.accessibilityLabel === "Rush Chair" &&
        node.props.accessibilityHint === "Opens what this role can do.",
    );
    expect(row.props.onLongPress).toBeUndefined();
    expect(screenText(tree)).not.toContain("Add role");
  });

  it("adds a tier from its name sheet", async () => {
    const tree = render(<ChapterRolesScreen />);
    const sheet = tree.root.find(
      (node) =>
        node.props.title === "Add tier" &&
        typeof node.props.onSubmit === "function",
    );
    let result: unknown;
    await act(async () => {
      result = await sheet.props.onSubmit("Committee chairs");
    });
    expect(result).toBeNull();
    expect(h.createTier).toHaveBeenCalledWith({
      name: "Committee chairs",
      permissions: [],
    });
  });

  it("adds a group and opens its page", async () => {
    const tree = render(<ChapterRolesScreen />);
    const push = vi.mocked(useRouter().push);
    push.mockClear();
    const sheet = tree.root.find(
      (node) =>
        node.props.title === "New group" &&
        typeof node.props.onSubmit === "function",
    );
    await act(async () => {
      await sheet.props.onSubmit("Third floor");
    });
    expect(h.createGroup).toHaveBeenCalledWith({ name: "Third floor" });
    expect(push).toHaveBeenCalledWith({
      pathname: "/chapter-roles",
      params: { group: "g-new" },
    });
  });

  it("saves the default invite role on the pick", async () => {
    const tree = render(<ChapterRolesScreen />);
    const sheet = tree.root.find(
      (node) =>
        node.props.title === "Default invite role" &&
        Array.isArray(node.props.options),
    );
    expect(sheet.props.options[0].label).toBe("No role");
    await act(async () => sheet.props.onSelect("r-bro"));
    expect(h.patchConfig).toHaveBeenCalledWith({
      default_invite_role_id: "r-bro",
    });
  });

  it("transfers presidency after a confirm that names who gets it", async () => {
    h.members = [
      ...h.members,
      { id: "m9", user_id: "u9", display_name: "Jordan Reyes", role_ids: [] },
    ];
    const tree = render(<ChapterRolesScreen />);
    const sheet = tree.root.find(
      (node) =>
        node.props.title === "Pick the new President" &&
        Array.isArray(node.props.options),
    );
    act(() => sheet.props.onSelect("m9"));
    await confirmLastAlert("Transfer presidency to Jordan Reyes?");
    expect(h.transfer).toHaveBeenCalledWith({ target_member_id: "m9" });
    expect(screenText(tree)).toContain("Jordan Reyes is now President.");
  });

  it("shows Transfer presidency only to the President", () => {
    h.permissions = ["roles:manage", "chapter-config:view"];
    expect(screenText(render(<ChapterRolesScreen />))).not.toContain(
      "Transfer presidency",
    );
  });

  it("renames, pings, reorders and deletes a tier from its page", async () => {
    h.tiers = [
      ...h.tiers,
      { id: "t-new", name: "Pledges", position: 3, permissions: [] },
    ];
    vi.mocked(useLocalSearchParams).mockReturnValue({ tierId: "t-new" });
    const tree = render(<RoleTierScreen />);
    const text = screenText(tree);
    expect(text).toContain("Anyone can @mention this tier");
    expect(text).toContain(
      "What every role in Pledges can do. A role can be set apart on its own page.",
    );
    const name = tree.root.find(
      (node) =>
        (node.type as unknown) === "TextInput" &&
        node.props.value === "Pledges",
    );
    act(() => name.props.onChangeText("New members"));
    await act(async () => {
      name.props.onBlur();
    });
    expect(h.updateTier).toHaveBeenCalledWith({
      id: "t-new",
      body: { name: "New members" },
    });
    act(() => pressable(tree, "More for Pledges").props.onPress());
    expect(currentItemMenu()!.actions.map((action) => action.label)).toEqual([
      "Move up",
      "Delete tier",
    ]);
    await act(async () => pickItemMenuAction("Move up"));
    expect(h.reorderTiers).toHaveBeenCalledWith(["t-off", "t-new", "t-bro"]);
    act(() => pressable(tree, "More for Pledges").props.onPress());
    act(() => pickItemMenuAction("Delete tier"));
    await confirmLastAlert("Delete Pledges?");
    expect(h.deleteTier).toHaveBeenCalledWith("t-new");
  });

  it("offers a tier with roles no Delete, and says why", () => {
    vi.mocked(useLocalSearchParams).mockReturnValue({ tierId: "t-bro" });
    const tree = render(<RoleTierScreen />);
    act(() => pressable(tree, "More for Brothers").props.onPress());
    const menu = currentItemMenu()!;
    expect(menu.actions.map((action) => action.label)).toEqual(["Move up"]);
    expect(menu.message).toBe("Delete tier (move its roles out first)");
    expect(screenText(tree)).toContain("Roles in it");
  });

  it("renames a role with Save role, and moves it from the page's ⋯", async () => {
    h.roles = [
      ...h.roles,
      role({
        id: "r-sec",
        name: "Secretary",
        tier_id: "t-off",
        display_order: 1,
      }),
    ];
    vi.mocked(useLocalSearchParams).mockReturnValue({ roleId: "r-sec" });
    const tree = render(<RoleScreen />);
    expect(screenText(tree)).toContain(
      "Starts from Officers. Rows set apart from it say so.",
    );
    const name = tree.root.find(
      (node) =>
        (node.type as unknown) === "TextInput" &&
        node.props.value === "Secretary",
    );
    act(() => name.props.onChangeText("Scribe"));
    await act(async () => {
      pressable(tree, "Save role").props.onPress();
    });
    expect(h.updateRole).toHaveBeenCalledWith({
      id: "r-sec",
      body: { name: "Scribe" },
    });
    act(() => pressable(tree, "More for Secretary").props.onPress());
    expect(currentItemMenu()!.actions.map((action) => action.label)).toEqual([
      "Move up",
      "Delete role",
    ]);
    await act(async () => pickItemMenuAction("Move up"));
    expect(h.updateRole).toHaveBeenCalledWith({
      id: "r-sec",
      body: { display_order: 0 },
    });
  });

  it("deletes a group from its page's ⋯ after asking", async () => {
    h.permissions = ["groups:manage", "members:view"];
    vi.mocked(useLocalSearchParams).mockReturnValue({ group: "g-house" });
    const tree = render(<ChapterRolesScreen />);
    act(() => pressable(tree, "More for In house").props.onPress());
    act(() => pickItemMenuAction("Delete group"));
    await confirmLastAlert("Delete In house?");
    expect(h.deleteGroup).toHaveBeenCalledWith("g-house");
  });
});
