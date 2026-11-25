/** @vitest-environment jsdom */
import React from "react";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dropAllKeptDrafts } from "@repo/hooks/kept-drafts";
import {
  CHAPTER_TAB_COPY,
  chapterArchetypeSwitchPatch,
} from "@repo/hooks/chapter-tab";
import { CHAPTER_PROFILE_PERMISSIONS } from "@repo/validation";
import { ARCHETYPES } from "@repo/org-archetypes";
import { SETTINGS_INDEX } from "@repo/hooks";
import { SettingAnchor } from "@/components/settings/setting-anchor";
import { FrappThemeProvider } from "@/lib/theme";
import { screenText } from "@/test/screen-text";

/**
 * The phone's Chapter settings → Chapter part (#6027), rendered: the profile
 * on top, the Look, About the chapter and Chapter groups in web's order, and
 * the Chapter mark, Identity & founding, Organization type and Vocabulary
 * pages their rows push. The screens live under `app/`, so their spec lives
 * here (`lib/routes.spec.ts`).
 *
 * The chapter: Sigma Phi Epsilon California Eta, IFC, short name "Sig Ep",
 * birthday posts in #general.
 */
const h = vi.hoisted(() => ({
  permissions: [] as string[],
  chapter: {} as Record<string, unknown>,
  config: {} as Record<string, unknown>,
  channels: [] as unknown[],
  // The config PATCH's and the profile PATCH's `mutateAsync`: every Chapter
  // form awaits its save, so a failure after leaving still keeps the draft.
  patchConfig: vi.fn<(diff: unknown) => Promise<unknown>>(),
  updateChapter: vi.fn<(body: unknown) => Promise<unknown>>(),
  removeLogo: vi.fn(),
  birthdaySheet: null as null | {
    options: { value: string | null; label: string }[];
    onSelect: (value: string | null) => void;
  },
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
  useCurrentChapter: () => ok(h.chapter),
  useOrgConfig: (options?: { enabled?: boolean }) =>
    ok(options?.enabled === false ? undefined : h.config),
  usePatchOrgConfig: () => ({
    mutate: vi.fn(),
    mutateAsync: h.patchConfig,
    isPending: false,
  }),
  useUpdateChapter: () => ({
    mutate: vi.fn(),
    mutateAsync: h.updateChapter,
    isPending: false,
  }),
  useChannels: () => ok(h.channels),
  useChapterChatBackground: () =>
    ok({ background: "midnight", photo_url: null }),
  useGeofences: () => ok([]),
  useAiConsent: () => ({ data: null }),
  useAiChapterSettings: () => ok(undefined),
  useUpdateAiChapterSettings: () => ({ mutate: vi.fn(), isPending: false }),
  useCategories: () => ok([]),
  useChannelAccessOptions: () => ok([]),
  useRequestChapterLogoUploadUrl: () => ({ mutateAsync: vi.fn() }),
  useConfirmChapterLogo: () => ({ mutateAsync: vi.fn() }),
  useRemoveChapterLogo: () => ({ mutate: h.removeLogo, isPending: false }),
  // The Recruitment module is off here, so #6039's interest form stays hidden.
  useInterestFormSettings: () => ok(undefined),
  useUpdateInterestForm: () => ({ mutate: vi.fn(), isPending: false }),
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
      props: NonNullable<typeof h.birthdaySheet>,
      ref: React.Ref<{ present: () => void }>,
    ) {
      h.birthdaySheet = props;
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
import ChapterMarkScreen from "@/app/(app)/chapter-mark";
import ChapterIdentityScreen from "@/app/(app)/chapter-identity";
import ChapterTypeScreen from "@/app/(app)/chapter-type";
import ChapterVocabularyScreen from "@/app/(app)/chapter-vocabulary";

const OFFICER = [
  "chapter-config:view",
  "chapter-config:manage",
  ...CHAPTER_PROFILE_PERMISSIONS,
];
const READER = ["chapter-config:view"];

const mounted: ReactTestRenderer[] = [];
function render(element: React.ReactElement): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<FrappThemeProvider>{element}</FrappThemeProvider>);
  });
  mounted.push(tree);
  return tree;
}

const pressable = (tree: ReactTestRenderer, label: string) =>
  tree.root.find(
    (node) =>
      (node.type as unknown) === "Pressable" &&
      node.props.accessibilityLabel === label,
  );
const hasPressable = (tree: ReactTestRenderer, label: string) =>
  tree.root.findAll(
    (node) =>
      (node.type as unknown) === "Pressable" &&
      node.props.accessibilityLabel === label,
  ).length > 0;
const field = (tree: ReactTestRenderer, label: string) =>
  tree.root.find(
    (node) =>
      (node.type as unknown) === "TextInput" &&
      node.props.accessibilityLabel === label,
  );
const type = (tree: ReactTestRenderer, label: string, text: string) =>
  act(() => field(tree, label).props.onChangeText(text));

/** The text's position in the screen, failing when it isn't there. */
const at = (text: string, needle: string) => {
  const index = text.indexOf(needle);
  expect(index, needle).toBeGreaterThanOrEqual(0);
  return index;
};

beforeEach(() => {
  vi.clearAllMocks();
  h.patchConfig.mockReset().mockResolvedValue({});
  h.updateChapter.mockReset().mockResolvedValue({});
  vi.mocked(useLocalSearchParams).mockReturnValue({});
  h.permissions = OFFICER;
  h.chapter = {
    name: "Sigma Phi Epsilon California Eta",
    university: "UCLA",
    donation_url: "",
    logo_url: null,
    enabled_modules: {},
  };
  h.config = {
    org_archetype: "ifc",
    vocabulary: {},
    branding: {
      short_name: "Sig Ep",
      greek_letters: "ΣΦΕ",
      designation: "California Eta",
      founded_at: 1901,
    },
    birthday_channel_id: "c-general",
    members_can_change_name: false,
  };
  h.channels = [
    { id: "c-general", name: "general", type: "PUBLIC", archived_at: null },
    { id: "c-exec", name: "exec", type: "PRIVATE", archived_at: null },
  ];
  h.birthdaySheet = null;
});

afterEach(() => {
  act(() => {
    for (const tree of mounted.splice(0)) tree.unmount();
  });
  dropAllKeptDrafts();
});

describe("Chapter settings → Chapter (#6027)", () => {
  it("draws web's Chapter tab in web's order, each row with its value", () => {
    h.permissions = [...OFFICER, "members:view"];
    h.chapter = { ...h.chapter, enabled_modules: { geofences: true } };
    const text = screenText(render(<ChapterSettingsScreen />));
    const order = [
      "Chapter name",
      "University",
      "Donation link (optional)",
      "Look",
      "Chapter mark",
      "Chapter accent",
      "Chat background",
      "About the chapter",
      "Identity & founding",
      "Organization type",
      "Vocabulary",
      "Birthday posts",
      "Members can change their own name",
      "Study zones",
      // The row, not the About footnote's mention of it.
      "\nLogs",
    ].map((needle) => at(text, needle));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(text).toContain("Chapter mark\nSig Ep");
    expect(text).toContain("Identity & founding\nCalifornia Eta");
    expect(text).toContain("Organization type\nIFC");
    expect(text).toContain("Vocabulary\nDefaults");
    expect(text).toContain("Birthday posts\n#general");
  });

  it("opens each row's page", () => {
    const tree = render(<ChapterSettingsScreen />);
    const push = vi.mocked(useRouter)().push;
    for (const [label, route] of [
      ["Chapter mark", "/chapter-mark"],
      ["Identity & founding", "/chapter-identity"],
      ["Organization type", "/chapter-type"],
      ["Vocabulary", "/chapter-vocabulary"],
    ] as const) {
      act(() => pressable(tree, label).props.onPress());
      expect(push).toHaveBeenLastCalledWith(route);
    }
  });

  it("waits for an edit, then saves only the changed field, trimmed", () => {
    const tree = render(<ChapterSettingsScreen />);
    expect(pressable(tree, "Save profile").props.disabled).toBe(true);
    type(tree, "University", " Rensselaer ");
    const save = pressable(tree, "Save profile");
    expect(save.props.disabled).toBe(false);
    act(() => save.props.onPress());
    expect(h.updateChapter).toHaveBeenCalledWith({ university: "Rensselaer" });
  });

  it("says Saved once the profile lands", async () => {
    const tree = render(<ChapterSettingsScreen />);
    type(tree, "Chapter name", "Sigma Phi Epsilon Cal Eta");
    await act(async () => pressable(tree, "Save profile").props.onPress());
    expect(screenText(tree)).toContain("Saved");
  });

  it("shows a member who can't edit every value, and opens no sheet for them", () => {
    h.permissions = READER;
    const tree = render(<ChapterSettingsScreen />);
    const text = screenText(tree);
    expect(field(tree, "Chapter name").props.editable).toBe(false);
    expect(field(tree, "Chapter name").props.value).toBe(
      "Sigma Phi Epsilon California Eta",
    );
    expect(text).toContain(CHAPTER_TAB_COPY.readOnly);
    expect(hasPressable(tree, "Save profile")).toBe(false);
    expect(text).toContain(
      `Birthday posts\n${CHAPTER_TAB_COPY.rowReadOnly}\n#general`,
    );
    expect(hasPressable(tree, "Birthday posts")).toBe(false);
    // A page row still opens, read-only, so its values can be read.
    act(() => pressable(tree, "Identity & founding").props.onPress());
    expect(vi.mocked(useRouter)().push).toHaveBeenCalledWith(
      "/chapter-identity",
    );
  });

  it("saves the birthday channel the moment it's picked", () => {
    render(<ChapterSettingsScreen />);
    expect(h.birthdaySheet?.options.map((o) => o.label)).toEqual([
      "Off",
      "#general",
    ]);
    act(() => h.birthdaySheet?.onSelect(null));
    expect(h.patchConfig).toHaveBeenCalledWith({ birthday_channel_id: null });
  });

  it("never calls a saved channel removed before the list loads", () => {
    h.channels = undefined as unknown as unknown[];
    const text = screenText(render(<ChapterSettingsScreen />));
    expect(text).not.toContain("A removed channel");
  });

  it("reads a channel that can't take the posts as paused", () => {
    h.config = { ...h.config, birthday_channel_id: "c-exec" };
    const text = screenText(render(<ChapterSettingsScreen />));
    expect(text).toContain("#exec (paused)");
    expect(text).toContain("Paused: that channel can't take them now.");
  });
});

describe("Chapter settings → Identity & founding (#6027)", () => {
  it("saves the four fields once one changes", () => {
    const tree = render(<ChapterIdentityScreen />);
    expect(pressable(tree, "Save identity").props.disabled).toBe(true);
    type(tree, "School (short)", "UCLA");
    act(() => pressable(tree, "Save identity").props.onPress());
    expect(h.patchConfig).toHaveBeenCalledWith({
      branding: {
        greek_letters: "ΣΦΕ",
        designation: "California Eta",
        school_short: "UCLA",
        founded_at: 1901,
      },
    });
  });

  it("won't remove a saved founded year, and says why", () => {
    const tree = render(<ChapterIdentityScreen />);
    type(tree, "Founded year", "");
    act(() => pressable(tree, "Save identity").props.onPress());
    expect(h.patchConfig).not.toHaveBeenCalled();
    expect(screenText(tree)).toContain(
      "A founded year can't be removed once saved.",
    );
  });

  it("never draws FIJI's letters", () => {
    h.chapter = { ...h.chapter, name: "Phi Gamma Delta Tau Nu" };
    const text = screenText(render(<ChapterIdentityScreen />));
    expect(text).not.toContain("Greek letters");
    expect(text).toContain("Chapter designation");
  });

  it("is read-only for a member who can't save it", () => {
    h.permissions = READER;
    const tree = render(<ChapterIdentityScreen />);
    expect(field(tree, "Chapter designation").props.editable).toBe(false);
    expect(hasPressable(tree, "Save identity")).toBe(false);
    expect(screenText(tree)).toContain(CHAPTER_TAB_COPY.readOnly);
  });
});

describe("Chapter settings → Organization type (#6027)", () => {
  it("asks before switching, then resets to the type's defaults", async () => {
    const tree = render(<ChapterTypeScreen />);
    act(() => pressable(tree, "NPHC / Divine Nine").props.onPress());
    const [title, , buttons] = vi.mocked(Alert.alert).mock.calls[0]!;
    expect(title).toBe("Switch to NPHC / Divine Nine?");
    const confirm = (buttons as { text: string; onPress: () => void }[]).find(
      (b) => b.text === CHAPTER_TAB_COPY.typeConfirmAction,
    );
    expect(h.patchConfig).not.toHaveBeenCalled();
    await act(async () => confirm!.onPress());
    expect(h.patchConfig).toHaveBeenCalledWith(
      chapterArchetypeSwitchPatch("nphc"),
    );
  });

  it("lists all eight types, the current one marked", () => {
    const tree = render(<ChapterTypeScreen />);
    const text = screenText(tree);
    const labels = Object.values(ARCHETYPES).map((a) => a.label);
    expect(labels).toHaveLength(8);
    for (const label of labels) expect(text).toContain(label);
    const current = tree.root.find(
      (node) =>
        node.props.accessibilityValue === "Current" &&
        node.props.label === "IFC Fraternity",
    );
    expect(current).toBeTruthy();
  });

  it("lists the eight types read-only for a member who can't switch", () => {
    h.permissions = READER;
    const tree = render(<ChapterTypeScreen />);
    const text = screenText(tree);
    expect(text).toContain(CHAPTER_TAB_COPY.rowReadOnly);
    // A row that opens nothing is drawn without a press at all.
    expect(hasPressable(tree, "NPHC / Divine Nine")).toBe(false);
    expect(text).toContain("NPHC / Divine Nine");
  });
});

describe("Chapter settings → Vocabulary (#6027)", () => {
  it("shows the type's word where a word is blank, and saves every word", () => {
    const tree = render(<ChapterVocabularyScreen />);
    expect(field(tree, "New member term").props.placeholder).toBe("New member");
    type(tree, "Role tier", " Board ");
    act(() => pressable(tree, "Save vocabulary").props.onPress());
    expect(h.patchConfig).toHaveBeenCalledWith({
      vocabulary: {
        recruitment: "",
        pledge: "",
        class: "",
        order: "",
        tier: "Board",
      },
    });
  });

  it("keeps an unsaved word when the officer goes back and returns", () => {
    const first = render(<ChapterVocabularyScreen />);
    type(first, "Cohort label", "Line");
    act(() => first.unmount());
    mounted.splice(mounted.indexOf(first), 1);
    const again = render(<ChapterVocabularyScreen />);
    expect(field(again, "Cohort label").props.value).toBe("Line");
  });
});

describe("Chapter settings → Chapter mark (#6027)", () => {
  it("saves the short name and the letters switch together", () => {
    const tree = render(<ChapterMarkScreen />);
    expect(pressable(tree, "Save mark").props.disabled).toBe(true);
    type(tree, "Short name", "SigEp");
    act(() => pressable(tree, "Save mark").props.onPress());
    expect(h.patchConfig).toHaveBeenCalledWith({
      branding: { show_greek_letters: true, short_name: "SigEp" },
    });
  });

  it("gives FIJI no letters switch", () => {
    h.chapter = { ...h.chapter, name: "Phi Gamma Delta Tau Nu" };
    const text = screenText(render(<ChapterMarkScreen />));
    expect(text).not.toContain("Show Greek letters");
    expect(text).toContain("Short name");
  });

  it("asks before removing the logo", () => {
    h.chapter = { ...h.chapter, logo_url: "https://x/logo.png" };
    const tree = render(<ChapterMarkScreen />);
    act(() => pressable(tree, "Remove logo").props.onPress());
    expect(vi.mocked(Alert.alert).mock.calls[0]![0]).toBe("Remove the logo?");
    expect(h.removeLogo).not.toHaveBeenCalled();
  });

  it("tells a member without the profile permissions who sets the logo", () => {
    h.permissions = READER;
    const tree = render(<ChapterMarkScreen />);
    expect(screenText(tree)).toContain(
      `Logo\n${CHAPTER_TAB_COPY.rowReadOnly}\nNone`,
    );
    expect(hasPressable(tree, "Upload logo")).toBe(false);
  });
});

describe("Chapter settings drafts (#6027)", () => {
  const rerender = (tree: ReactTestRenderer, element: React.ReactElement) =>
    act(() => tree.update(<FrappThemeProvider>{element}</FrappThemeProvider>));

  it("keeps the edit when a save fails, through the optimistic write and its rollback", async () => {
    const tree = render(<ChapterIdentityScreen />);
    type(tree, "School (short)", "UCLA");
    h.patchConfig.mockImplementation(async (diff) => {
      const before = h.config;
      // usePatchOrgConfig writes the merged config before the server answers
      // and puts the old one back when it refuses.
      h.config = {
        ...before,
        branding: {
          ...(before.branding as object),
          ...(diff as { branding: object }).branding,
        },
      };
      rerender(tree, <ChapterIdentityScreen />);
      h.config = before;
      rerender(tree, <ChapterIdentityScreen />);
      throw new Error("offline");
    });
    await act(async () => pressable(tree, "Save identity").props.onPress());
    expect(field(tree, "School (short)").props.value).toBe("UCLA");
    expect(pressable(tree, "Save identity").props.disabled).toBe(false);
  });

  it("keeps the edit when the save fails after the officer has left", async () => {
    let fail!: (error: Error) => void;
    h.patchConfig.mockImplementation(
      () => new Promise((_resolve, reject) => (fail = reject)),
    );
    const first = render(<ChapterVocabularyScreen />);
    type(first, "Cohort label", "Line");
    act(() => pressable(first, "Save vocabulary").props.onPress());
    act(() => first.unmount());
    mounted.splice(mounted.indexOf(first), 1);
    await act(async () => fail(new Error("offline")));
    const again = render(<ChapterVocabularyScreen />);
    expect(field(again, "Cohort label").props.value).toBe("Line");
  });

  it("keeps a draft made before the settings load, once they arrive", () => {
    const first = render(<ChapterVocabularyScreen />);
    type(first, "Cohort label", "Line");
    act(() => first.unmount());
    mounted.splice(mounted.indexOf(first), 1);
    const config = h.config;
    h.config = undefined as unknown as Record<string, unknown>;
    const again = render(<ChapterVocabularyScreen />);
    h.config = config;
    rerender(again, <ChapterVocabularyScreen />);
    expect(field(again, "Cohort label").props.value).toBe("Line");
  });

  it("lays a kept draft over another officer's later save, never reverting it", () => {
    const first = render(<ChapterVocabularyScreen />);
    type(first, "New member term", "Associate");
    act(() => first.unmount());
    mounted.splice(mounted.indexOf(first), 1);
    // Another officer sets the tier word on web meanwhile.
    h.config = { ...h.config, vocabulary: { tier: "Council" } };
    const again = render(<ChapterVocabularyScreen />);
    expect(field(again, "New member term").props.value).toBe("Associate");
    expect(field(again, "Role tier").props.value).toBe("Council");
    act(() => pressable(again, "Save vocabulary").props.onPress());
    expect(h.patchConfig).toHaveBeenCalledWith({
      vocabulary: {
        recruitment: "",
        pledge: "Associate",
        class: "",
        order: "",
        tier: "Council",
      },
    });
  });
});

describe("Settings search lands on the Chapter tab's rows (#6027)", () => {
  const SCREENS = {
    "/chapter-settings": ChapterSettingsScreen,
    "/chapter-mark": ChapterMarkScreen,
    "/chapter-identity": ChapterIdentityScreen,
    "/chapter-vocabulary": ChapterVocabularyScreen,
  } as const;

  it("finds every chapter-only entry's anchor on its screen", () => {
    const entries = SETTINGS_INDEX.filter((e) => e.phone?.chapterOnly);
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      const Screen = SCREENS[entry.phone!.screen as keyof typeof SCREENS];
      expect(Screen, entry.id).toBeDefined();
      const tree = render(<Screen />);
      const anchors = tree.root
        .findAllByType(SettingAnchor)
        .map((node) => node.props.id);
      expect(anchors, entry.id).toContain(entry.phone!.anchor);
    }
  });
});
