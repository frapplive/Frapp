/** @vitest-environment jsdom */
import React from "react";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GOALS_FOOTNOTE,
  MODULE_TOOLS_ON_WEB,
  isBetaOffModule,
  WHO_CAN_FOOTNOTE,
} from "@repo/validation";
import { SETTINGS_INDEX } from "@repo/hooks";
import { FrappThemeProvider } from "@/lib/theme";
import { screenText } from "@/test/screen-text";

/**
 * The phone's module screens (#6030), rendered: the Modules group on Chapter
 * settings, a module's screen in web's order (switch, Rules, Goals, Who can,
 * the tools line), and the screens its rows push. The screens live under
 * `app/`, so their spec lives here (`lib/routes.spec.ts`).
 *
 * The chapter: two tiers, Exec board (rank 1) and Officers and chairs (rank
 * 2), and a Social chair role set apart from its tier with points:adjust.
 */
const h = vi.hoisted(() => ({
  permissions: [] as string[],
  chapter: {} as Record<string, unknown>,
  config: {} as Record<string, unknown>,
  goals: {} as Record<string, unknown>,
  tiers: [] as unknown[],
  roles: [] as unknown[],
  template: { sections: [] as string[] },
  pipeline: undefined as unknown,
  rushSettings: undefined as unknown,
  rushPipelineEnabled: [] as (boolean | undefined)[],
  patchConfig: vi.fn<(diff: unknown) => Promise<unknown>>(),
  updateTier: vi.fn<(body: unknown) => Promise<unknown>>(),
  updateRole: vi.fn<(body: unknown) => Promise<unknown>>(),
  setGoals: vi.fn<(body: unknown) => Promise<unknown>>(),
  setTemplate: vi.fn<(sections: unknown) => Promise<unknown>>(),
  saveStages: vi.fn(),
  removeTag: vi.fn(),
  sheets: new Map<
    string,
    {
      options: { value: string | null; label: string }[];
      onSelect: (value: string | null) => void;
    }
  >(),
}));

vi.mock("react-native", async () => {
  const { reactNativeStub } = await import("@/test/react-native-stub");
  return reactNativeStub;
});

const ok = (data: unknown) => ({
  data,
  isPending: data === undefined,
  isSuccess: data !== undefined,
  isError: false,
  isFetching: false,
  isRefetching: false,
  error: null,
  refetch: vi.fn(),
});

vi.mock("@repo/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/hooks")>()),
  usePermissionList: () => h.permissions,
  useMyPermissions: () => ok({ permissions: h.permissions }),
  useViewerUserId: () => "u-1",
  useMembers: () => ok([]),
  useCurrentChapter: () => ok(h.chapter),
  useOrgConfig: (options?: { enabled?: boolean }) =>
    ok(options?.enabled === false ? undefined : h.config),
  usePatchOrgConfig: () => ({
    mutate: vi.fn(),
    mutateAsync: h.patchConfig,
    isPending: false,
  }),
  useRoleTiers: () => ok(h.tiers),
  useRoles: () => ok(h.roles),
  useUpdateRoleTier: () => ({ mutateAsync: h.updateTier }),
  useUpdateRole: () => ({ mutateAsync: h.updateRole }),
  useChapterGoals: () => ok(h.goals),
  useSetChapterGoals: () => ({ mutateAsync: h.setGoals }),
  useMeetingTemplate: () => ok(h.template),
  useSetMeetingTemplate: () => ({
    mutateAsync: h.setTemplate,
    isPending: false,
  }),
  useRushPipeline: (options?: { enabled?: boolean }) => {
    h.rushPipelineEnabled.push(options?.enabled);
    return ok(options?.enabled === false ? undefined : h.pipeline);
  },
  useRushSettings: (options?: { enabled?: boolean }) =>
    ok(options?.enabled === false ? undefined : h.rushSettings),
  useSaveRushSettings: () => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  }),
  useSaveRushStages: () => ({ mutate: h.saveStages }),
  useCreateRushTag: () => ({ mutate: vi.fn() }),
  useRenameRushTag: () => ({ mutate: vi.fn() }),
  useDeleteRushTag: () => ({ mutate: h.removeTag }),
  useInterestFormSettings: (options?: { enabled?: boolean }) =>
    ok(options?.enabled === false ? undefined : { offered: false, form: null }),
  useGroups: () => ok([]),
  useChannels: () => ok([]),
  useGeofences: () => ok([{ id: "z1" }, { id: "z2" }]),
  useChapterChatBackground: () => ok(undefined),
  useUpdateChapter: () => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  }),
  useRequestChapterLogoUploadUrl: () => ({ mutateAsync: vi.fn() }),
  useConfirmChapterLogo: () => ({ mutateAsync: vi.fn() }),
  useRemoveChapterLogo: () => ({ mutate: vi.fn(), isPending: false }),
  useAiConsent: () => ({ data: null }),
  useAiChapterSettings: () => ok(undefined),
  useUpdateAiChapterSettings: () => ({ mutate: vi.fn(), isPending: false }),
  useCategories: () => ok([]),
  useChannelAccessOptions: () => ok([]),
}));

vi.mock("@/components/settings/accent-sheet", async () => {
  const React = await import("react");
  return {
    AccentSheet: React.forwardRef(function AccentSheet() {
      return null;
    }),
  };
});
vi.mock("@/components/settings/chat-background-sheet", async () => {
  const React = await import("react");
  return {
    ChatBackgroundSheet: React.forwardRef(function ChatBackgroundSheet() {
      return null;
    }),
  };
});
vi.mock("@/components/option-sheet", async () => {
  const React = await import("react");
  return {
    OptionSheet: React.forwardRef(function OptionSheet(
      props: { title: string } & Parameters<typeof h.sheets.set>[1],
      ref: React.Ref<{ present: () => void }>,
    ) {
      h.sheets.set(props.title, props);
      React.useImperativeHandle(ref, () => ({ present: vi.fn() }));
      return null;
    }),
  };
});
vi.mock("react-native-qrcode-svg", () => ({ default: () => null }));
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
import ModuleSettingsScreen from "@/app/(app)/module-settings";

const PRESIDENT = ["*"];
const READER = ["chapter-config:view", "members:view"];

const mounted: ReactTestRenderer[] = [];
function render(element: React.ReactElement): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<FrappThemeProvider>{element}</FrappThemeProvider>);
  });
  mounted.push(tree);
  return tree;
}
function screen(module: string, page?: string): ReactTestRenderer {
  vi.mocked(useLocalSearchParams).mockReturnValue(
    page ? { module, page } : { module },
  );
  return render(<ModuleSettingsScreen />);
}

const pressable = (tree: ReactTestRenderer, label: string) =>
  tree.root.find(
    (node) =>
      (node.type as unknown) === "Pressable" &&
      node.props.accessibilityLabel === label,
  );
const toggle = (tree: ReactTestRenderer, label: string) =>
  tree.root.find(
    (node) =>
      node.props.accessibilityLabel === label &&
      typeof node.props.onValueChange === "function",
  );
const field = (tree: ReactTestRenderer, label: string) =>
  tree.root.find(
    (node) =>
      (node.type as unknown) === "TextInput" &&
      node.props.accessibilityLabel === label,
  );
const at = (text: string, needle: string) => {
  const index = text.indexOf(needle);
  expect(index, needle).toBeGreaterThanOrEqual(0);
  return index;
};

/** The shared `expo-router` mock's push (`vitest.setup.ts`). */
const push = () => vi.mocked(useRouter)().push;

beforeEach(() => {
  vi.clearAllMocks();
  h.patchConfig.mockReset().mockResolvedValue({});
  h.updateTier.mockReset().mockResolvedValue({});
  h.updateRole.mockReset().mockResolvedValue({});
  h.setGoals.mockReset().mockResolvedValue({});
  h.setTemplate.mockReset().mockResolvedValue({});
  h.permissions = PRESIDENT;
  h.chapter = { name: "Sig Ep", enabled_modules: { rush: false } };
  h.config = {
    org_archetype: "ifc",
    vocabulary: {},
    branding: {},
    enabled_modules: { rush: false, events: true },
    points: { adjustment_rate_limit_per_hour: 20, anomaly_threshold: 100 },
    service: { minutes_per_point: 30 },
    workflows: [{ key: "wf_hours_receipt", enabled: true }],
  };
  h.goals = {
    points: { everyone: 120, roles: [] },
    service: { everyone: 1200, roles: [{ role_id: "r-social", target: 600 }] },
    study: { everyone: null, roles: [] },
  };
  h.tiers = [
    {
      id: "t-exec",
      name: "Exec board",
      position: 1,
      permissions: ["points:adjust"],
    },
    {
      id: "t-officers",
      name: "Officers and chairs",
      position: 2,
      permissions: [],
    },
  ];
  h.roles = [
    { id: "r-pres", name: "President", permissions: ["*"], tier_id: "t-exec" },
    {
      id: "r-social",
      name: "Social chair",
      permissions: ["points:adjust"],
      tier_id: "t-officers",
      color: "#3E63DD",
    },
    { id: "r-member", name: "Member", permissions: [], tier_id: null },
  ];
  h.template = { sections: ["tldr", "attendees", "summary", "decisions"] };
  h.pipeline = undefined;
  h.rushSettings = undefined;
  h.rushPipelineEnabled = [];
  h.sheets.clear();
});

afterEach(() => {
  act(() => {
    for (const tree of mounted.splice(0)) tree.unmount();
  });
});

describe("Chapter settings → Modules (#6030)", () => {
  it("lists web's modules in web's order after People, saying Off where off", () => {
    // An officer without the chat and roles grants, so only this group's
    // reads are drawn.
    h.permissions = ["chapter-config:view", "chapter-config:manage"];
    vi.mocked(useLocalSearchParams).mockReturnValue({});
    const tree = render(<ChapterSettingsScreen />);
    const text = screenText(tree);
    // Read from the group's heading on, past Chat background and the like.
    const modules = text.slice(at(text, "\nModules"));
    const order = [
      "\nChat",
      "\nAnnouncements",
      "\nEvents",
      "\nPoints",
      "\nService hours",
      "\nStudy zones",
      "\nTasks",
      "\nPolls",
      "\nMeetings",
      "\nDocuments",
      "\nBackwork",
      "\nReports",
      "\nRecruitment",
    ].map((needle) => at(modules, needle));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(text).toContain("Recruitment\nOff");
    expect(text).not.toContain("Dues");
    act(() => pressable(tree, "Points").props.onPress());
    expect(push()).toHaveBeenCalledWith({
      pathname: "/module-settings",
      params: { module: "points" },
    });
  });
});

describe("a module's screen (#6030)", () => {
  it("draws Points in web's order: switch, Rules, Goals, Who can, the ledger line", () => {
    const text = screenText(screen("points"));
    const order = [
      "Points",
      "Rules",
      "Adjustments per officer each hour",
      "Flag adjustments of",
      "Goals",
      "Points goal\n120 points",
      "Who can",
      MODULE_TOOLS_ON_WEB.points!.line,
    ].map((needle) => at(text, needle));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(text).toContain("Chapter Pro");
    expect(text).toContain(GOALS_FOOTNOTE);
    expect(text).toContain(WHO_CAN_FOOTNOTE);
    // Tiers first, then the role set apart; a permission nobody holds.
    expect(text).toContain("Add or remove points\nExec board, Social chair");
  });

  it("switches the module through the audited config PATCH", () => {
    const tree = screen("events");
    act(() => toggle(tree, "Events").props.onValueChange(false));
    expect(h.patchConfig).toHaveBeenCalledWith({
      enabled_modules: { events: false },
    });
  });

  it("reads everything but changes nothing for a viewer without :manage", () => {
    h.permissions = READER;
    const tree = screen("events");
    expect(screenText(tree)).toContain(
      "Your role can't switch modules on or off.",
    );
    expect(toggle(tree, "Events").props.disabled).toBe(true);
  });

  it("says Always on for Chat and Announcements, with no switch", () => {
    const text = screenText(screen("chat"));
    expect(text).toContain("Chat\nAlways on");
  });

  it("checks a typed limit on leaving the field and saves it on its own", () => {
    const tree = screen("points");
    const rate = () =>
      field(tree, "Adjustments per officer each hour, an hour");
    act(() => rate().props.onFocus());
    act(() => rate().props.onChangeText("0"));
    act(() => rate().props.onBlur());
    expect(screenText(tree)).toContain("Use a whole number from 1.");
    expect(h.patchConfig).not.toHaveBeenCalled();
    act(() => rate().props.onFocus());
    act(() => rate().props.onChangeText("25"));
    act(() => rate().props.onBlur());
    expect(h.patchConfig).toHaveBeenCalledWith({
      points: { adjustment_rate_limit_per_hour: 25, anomaly_threshold: 100 },
    });
  });

  it("pushes a permission's screen from its Who can row", () => {
    const tree = screen("points");
    act(() => pressable(tree, "Add or remove points").props.onPress());
    expect(push()).toHaveBeenCalledWith({
      pathname: "/module-settings",
      params: { module: "points", page: "can-points:adjust" },
    });
  });

  it("shows a page it doesn't know as the module itself", () => {
    expect(screenText(screen("points", "nowhere"))).toContain("Who can");
  });

  it("says a module it doesn't know is gone", () => {
    expect(screenText(screen("dues"))).toContain("This page is gone");
  });
});

describe("a permission's screen (#6030)", () => {
  it("draws the tiers as switches, then Roles set apart and Add a role", () => {
    const tree = screen("points", "can-points:adjust");
    const text = screenText(tree);
    expect(text).toContain("Roles set apart");
    expect(text).toContain("Social chair");
    expect(toggle(tree, "Exec board").props.value).toBe(true);
    expect(toggle(tree, "Officers and chairs").props.value).toBe(false);

    act(() => toggle(tree, "Officers and chairs").props.onValueChange(true));
    expect(h.updateTier).toHaveBeenCalledWith({
      id: "t-officers",
      body: { permissions: ["points:adjust"] },
    });

    const add = h.sheets.get("Add a role")!;
    expect(add.options.map((option) => option.label)).toEqual(["Member"]);
    act(() => add.onSelect("r-member"));
    expect(h.updateRole).toHaveBeenCalledWith({
      id: "r-member",
      body: { permissions: ["points:adjust"] },
    });
  });

  it("takes it away from a role set apart", () => {
    const tree = screen("points", "can-points:adjust");
    act(() =>
      pressable(tree, "Take it away from Social chair").props.onPress(),
    );
    expect(h.updateRole).toHaveBeenCalledWith({
      id: "r-social",
      body: { permissions: [] },
    });
  });

  it("is read-only, said once, for a viewer without roles:manage", () => {
    h.permissions = READER;
    const tree = screen("points", "can-points:adjust");
    expect(toggle(tree, "Exec board").props.disabled).toBe(true);
    expect(screenText(tree)).toContain("Your role can't change these.");
    expect(h.sheets.has("Add a role")).toBe(false);
  });
});

describe("a goal's screen (#6030)", () => {
  it("types hours and saves minutes, keeping the roles set apart", () => {
    const tree = screen("hours", "goal-service");
    const everyone = () => field(tree, "Service hours goal, hours");
    expect(everyone().props.value).toBe("20");
    act(() => everyone().props.onFocus());
    act(() => everyone().props.onChangeText("25"));
    act(() => everyone().props.onBlur());
    expect(h.setGoals).toHaveBeenCalledWith({
      everyone: 1500,
      roles: [{ role_id: "r-social", target: 600 }],
    });
  });

  it("takes a role's own goal off", () => {
    const tree = screen("hours", "goal-service");
    act(() =>
      pressable(
        tree,
        "Remove Social chair's own service hours goal",
      ).props.onPress(),
    );
    expect(h.setGoals).toHaveBeenCalledWith({ everyone: 1200, roles: [] });
  });

  it("refuses a goal page of another module's measure", () => {
    expect(screenText(screen("points", "goal-service"))).toContain("Who can");
  });
});

describe("Meetings → Sections in the minutes (#6030)", () => {
  it("says Always on for the sections every minutes has, and switches the rest", () => {
    const tree = screen("meetings", "sections");
    const text = screenText(tree);
    expect(text).toContain("TL;DR");
    expect(text).toContain("Always on");
    act(() => toggle(tree, "Decisions").props.onValueChange(false));
    expect(h.setTemplate).toHaveBeenCalled();
    const sent = h.setTemplate.mock.calls[0]![0] as string[];
    expect(sent).not.toContain("decisions");
  });
});

describe("Recruitment (#6030)", () => {
  it("sends no refused read with the module off, and opens none of its screens", () => {
    const text = screenText(screen("rush"));
    expect(h.rushPipelineEnabled.every((enabled) => enabled === false)).toBe(
      true,
    );
    expect(text).not.toContain("Interest form");
    // The stages screen falls back to the module itself.
    expect(screenText(screen("rush", "stages"))).toContain("Recruitment");
    expect(h.rushPipelineEnabled.every((enabled) => enabled === false)).toBe(
      true,
    );
  });

  it("draws its rows in web's order with the module on", () => {
    h.config = { ...h.config, enabled_modules: { rush: true } };
    h.pipeline = {
      stale_days: 7,
      stages: [
        {
          id: "s1",
          label: "Met",
          category: "contacted",
          hidden: false,
          position: 0,
        },
        { id: "s2", label: "Bid", category: "bid", hidden: true, position: 0 },
      ],
      tags: [{ id: "g1", label: "legacy" }],
    };
    h.rushSettings = {
      bid_expiry_days: 3,
      new_member_role_id: null,
      default_new_member_role_id: "r-member",
      contacts_group_id: null,
      contacts_group_skipped: [],
      card_channel_id: null,
    };
    const text = screenText(screen("rush"));
    const order = [
      "Interest form",
      "Rules",
      "Needs follow-up after",
      "Bids expire after",
      "Stages\n1 stage",
      "Tags\n1 tag",
      "Joining",
      "New member role\nMember (default)",
      "Sign-ups",
      "Recruitment contacts",
      "No Group",
      "Card channel",
      "No card",
      "Who can",
    ].map((needle) => at(text, needle));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("saves a renamed stage as the whole list", () => {
    h.config = { ...h.config, enabled_modules: { rush: true } };
    h.pipeline = {
      stale_days: 7,
      stages: [
        { id: "s0", label: "New", category: "new", hidden: false, position: 0 },
        {
          id: "s1",
          label: "Met",
          category: "contacted",
          hidden: false,
          position: 0,
        },
        {
          id: "s9",
          label: "Closed",
          category: "closed",
          hidden: false,
          position: 0,
        },
      ],
      tags: [],
    };
    const tree = screen("rush", "stages");
    const name = field(tree, "Name of Met");
    act(() => name.props.onChangeText("Coffee"));
    act(() => field(tree, "Name of Met").props.onBlur());
    expect(h.saveStages).toHaveBeenCalledWith(
      [
        { id: "s0", label: "New", category: "new", hidden: false },
        { id: "s1", label: "Coffee", category: "contacted", hidden: false },
        { id: "s9", label: "Closed", category: "closed", hidden: false },
      ],
      expect.anything(),
    );
  });

  it("confirms before deleting a tag", async () => {
    h.config = { ...h.config, enabled_modules: { rush: true } };
    h.pipeline = {
      stale_days: 7,
      stages: [],
      tags: [{ id: "g1", label: "legacy" }],
    };
    const alert = vi
      .spyOn(Alert, "alert")
      .mockImplementation((_title, _body, buttons) =>
        buttons?.[1]?.onPress?.(),
      );
    const tree = screen("rush", "tags");
    await act(async () => pressable(tree, "Delete legacy").props.onPress());
    expect(alert).toHaveBeenCalled();
    expect(h.removeTag).toHaveBeenCalledWith("g1", expect.anything());
  });
});

describe("Settings search (#6030)", () => {
  it("opens every module entry on its module's screen, never the gone page", () => {
    // A module off for every chapter in the beta (Dues) is never listed.
    const entries = SETTINGS_INDEX.filter(
      (entry) =>
        entry.phone?.screen === "/module-settings" &&
        !isBetaOffModule(entry.betaModule ?? ""),
    );
    expect(entries.length).toBeGreaterThan(10);
    for (const entry of entries) {
      const { module, page } = entry.phone!.params as {
        module: string;
        page?: string;
      };
      h.config = { ...h.config, enabled_modules: { [module]: true } };
      const text = screenText(screen(module, page));
      expect(text, entry.id).not.toContain("This page is gone");
      expect(text, entry.id).toContain(entry.label.split(" ")[0]!);
    }
  });
});

describe("Study zones (#6030)", () => {
  it("counts the zones read-only and says they're drawn on the web", () => {
    h.config = { ...h.config, enabled_modules: { geofences: true } };
    const text = screenText(screen("geofences"));
    expect(text).toContain("Zones\n2 zones");
    expect(text).toContain(MODULE_TOOLS_ON_WEB.geofences!.line);
  });
});
