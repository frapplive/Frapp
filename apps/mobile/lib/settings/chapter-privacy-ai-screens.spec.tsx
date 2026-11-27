/** @vitest-environment jsdom */
import React from "react";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { useLocalSearchParams, useRouter } from "expo-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AI_SETTINGS_COPY, PRIVACY_SETTINGS_COPY } from "@repo/validation";
import { FrappThemeProvider } from "@/lib/theme";
import { screenText } from "@/test/screen-text";

/**
 * Chapter settings' Privacy and AI on the phone (#6028), rendered: the two
 * rows on Chapter settings (in web's rail order, and AI only where the server
 * has AI and the switches were read), the AI screen's switches and footnote,
 * and the Privacy screen's one switch. The screens live under `app/`, so
 * their spec lives here (`lib/routes.spec.ts`).
 */
type Sheet = {
  title: string;
  options: { value: string | null; label: string }[];
  onSelect: (value: string | null) => void;
};

const h = vi.hoisted(() => ({
  permissions: [] as string[],
  council: false,
  fields: [] as Record<string, unknown>[],
  classes: [] as { id: string; name: string; sort: number }[],
  members: [] as Record<string, unknown>[],
  updateField: vi.fn(),
  createField: vi.fn(),
  deleteField: vi.fn(),
  reorderClasses: vi.fn(),
  assignClasses: vi.fn(),
  renameClass: vi.fn(),
  sheets: new Map<string, Sheet>(),
  aiOn: true,
  consentFailed: false,
  retryConsent: vi.fn(),
  ai: null as Record<string, unknown> | null,
  optOut: false,
  patchConfig: vi.fn<(body: unknown) => Promise<unknown>>(),
  updateAi: vi.fn(),
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
  refetch: vi.fn(async () => ({ data })),
});
const mutation = (mutateAsync: (input: never) => Promise<unknown>) => ({
  mutate: vi.fn(),
  mutateAsync,
  isPending: false,
});

vi.mock("@repo/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/hooks")>()),
  usePermissionList: () => h.permissions,
  useCurrentChapter: () =>
    ok({ name: "Sigma Phi Epsilon", enabled_modules: {} }),
  useOrgConfig: (options?: { enabled?: boolean }) =>
    ok(
      options?.enabled === false
        ? undefined
        : { vocabulary: {}, analytics_opt_out: h.optOut },
    ),
  usePatchOrgConfig: () => mutation(h.patchConfig),
  useUpdateChapter: () => mutation(vi.fn()),
  useChannels: () => ok([]),
  useChapterChatBackground: () =>
    ok({ background: "midnight", photo_url: null }),
  useGeofences: () => ok([]),
  useAiConsent: () =>
    h.consentFailed
      ? {
          data: undefined,
          isError: true,
          isRefetching: false,
          refetch: h.retryConsent,
        }
      : { data: h.aiOn ? { answer: "yes" } : null },
  useAiChapterSettings: (options?: { enabled?: boolean }) =>
    ok(options?.enabled === false ? undefined : (h.ai ?? undefined)),
  useUpdateAiChapterSettings: () => ({
    mutate: h.updateAi,
    isPending: false,
  }),
  useCategories: () => ok([]),
  useRoles: () => ok([]),
  useChannelAccessOptions: () => ok([]),
  useRequestChapterLogoUploadUrl: () => ({ mutateAsync: vi.fn() }),
  useConfirmChapterLogo: () => ({ mutateAsync: vi.fn() }),
  useRemoveChapterLogo: () => ({ mutate: vi.fn(), isPending: false }),
  useCustomFields: () => ok(h.fields),
  useCreateCustomField: () => mutation(h.createField),
  useUpdateCustomField: () => mutation(h.updateField),
  useDeleteCustomField: () => mutation(h.deleteField),
  usePledgeClasses: () => ok(h.classes),
  useMembers: () => ok(h.members),
  useReorderPledgeClasses: () => mutation(h.reorderClasses),
  useDeletePledgeClass: () => mutation(vi.fn()),
  useCreatePledgeClass: () => mutation(vi.fn()),
  useRenamePledgeClass: () => mutation(h.renameClass),
  useAssignPledgeClasses: () => mutation(h.assignClasses),
}));

vi.mock("@/lib/tenant-kind", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tenant-kind")>()),
  useIsCouncil: () => h.council,
  useServesChapterFeatures: () => !h.council,
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
      props: Sheet,
      ref: React.Ref<{ present: () => void }>,
    ) {
      h.sheets.set(props.title, props);
      React.useImperativeHandle(ref, () => ({ present: vi.fn() }));
      return null;
    }),
  };
});
vi.mock("@/components/roles/name-sheet", async () => {
  const React = await import("react");
  return {
    NameSheet: React.forwardRef(function NameSheet() {
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
import ChapterPrivacyScreen from "@/app/(app)/chapter-privacy";

const OFFICER = [
  "chapter-config:view",
  "chapter-config:manage",
  "chapter:audit",
  "members:view",
];

const mounted: ReactTestRenderer[] = [];
function render(element: React.ReactElement): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<FrappThemeProvider>{element}</FrappThemeProvider>);
  });
  mounted.push(tree);
  return tree;
}

const byLabel = (tree: ReactTestRenderer, kind: string, label: string) =>
  tree.root.findAll(
    (node) =>
      (node.type as unknown) === kind &&
      node.props.accessibilityLabel === label,
  );
const toggle = (tree: ReactTestRenderer, label: string) =>
  byLabel(tree, "Switch", label)[0]!;

const aiSettings = (over: Record<string, unknown> = {}) => ({
  meeting_notes: true,
  ask: true,
  chat_source: false,
  nudges: true,
  updated_at: null,
  can_change: true,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  h.permissions = OFFICER;
  h.council = false;
  h.aiOn = true;
  h.consentFailed = false;
  h.ai = aiSettings();
  h.optOut = false;
  h.patchConfig.mockReset().mockResolvedValue({});
  h.sheets.clear();
  vi.mocked(useLocalSearchParams).mockReturnValue({});
});

afterEach(() => {
  act(() => {
    for (const tree of mounted.splice(0)) tree.unmount();
  });
});

describe("Chapter settings → Privacy and AI rows (#6028)", () => {
  it("draws Privacy and AI with their values, in web's rail order before Logs", () => {
    const text = screenText(render(<ChapterSettingsScreen />));
    const privacy = text.indexOf(PRIVACY_SETTINGS_COPY.title);
    const ai = text.indexOf("\n" + AI_SETTINGS_COPY.title + "\n");
    const logs = text.indexOf("\nLogs\n");
    expect(privacy).toBeGreaterThan(-1);
    expect(ai).toBeGreaterThan(privacy);
    expect(logs).toBeGreaterThan(ai);
    expect(text).toContain("3 on");
    // The switches left the middle of Chapter settings for their own screen.
    expect(text).not.toContain("Minutes from notes");
  });

  it("opens each one's screen", () => {
    const tree = render(<ChapterSettingsScreen />);
    act(() =>
      byLabel(
        tree,
        "Pressable",
        PRIVACY_SETTINGS_COPY.title,
      )[0]!.props.onPress(),
    );
    act(() =>
      byLabel(tree, "Pressable", AI_SETTINGS_COPY.title)[0]!.props.onPress(),
    );
    const push = vi.mocked(useRouter().push);
    expect(push).toHaveBeenCalledWith("/chapter-privacy");
    expect(push).toHaveBeenCalledWith("/chapter-ai");
  });

  it("says Off on Privacy when the chapter opted out", () => {
    h.optOut = true;
    const text = screenText(render(<ChapterSettingsScreen />));
    expect(text).toMatch(/Privacy\nOff/);
  });

  it("draws no AI row where the server has no AI, or before the switches are read", () => {
    h.aiOn = false;
    let tree = render(<ChapterSettingsScreen />);
    expect(byLabel(tree, "Pressable", AI_SETTINGS_COPY.title)).toHaveLength(0);
    h.aiOn = true;
    h.ai = null;
    tree = render(<ChapterSettingsScreen />);
    expect(byLabel(tree, "Pressable", AI_SETTINGS_COPY.title)).toHaveLength(0);
  });
});

describe("the AI screen (#6028)", () => {
  it("draws web's rows and footnote, one line each", () => {
    h.ai = aiSettings({ updated_at: "2026-11-20T15:00:00Z" });
    const text = screenText(render(<ChapterAiScreen />));
    expect(text).toContain("Minutes from notes");
    expect(text).toContain(
      "A first draft of the minutes from an officer's notes. Never for Standards.",
    );
    expect(text).toMatch(
      /Each member also chooses for themselves whether Frapp Intelligence is on\. Last changed November 20/,
    );
    expect(text).not.toContain(AI_SETTINGS_COPY.presidentOnly);
  });

  it("is read-only for anyone but the president, and says so", () => {
    h.ai = aiSettings({ can_change: false });
    const tree = render(<ChapterAiScreen />);
    expect(toggle(tree, "Minutes from notes").props.disabled).toBe(true);
    expect(screenText(tree)).toContain(AI_SETTINGS_COPY.presidentOnly);
  });

  it("saves a switch the moment it flips, and shows a refusal on its row", () => {
    const tree = render(<ChapterAiScreen />);
    act(() => toggle(tree, "Nudges on Activity").props.onValueChange(false));
    expect(h.updateAi).toHaveBeenCalledWith(
      { nudges: false },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
    act(() => h.updateAi.mock.calls[0]![1].onError());
    expect(screenText(tree)).toContain(
      `${AI_SETTINGS_COPY.saveFailed}. Try again.`,
    );
  });

  it("keeps channel messages waiting until Questions and requests is on", () => {
    h.ai = aiSettings({ ask: false, chat_source: false });
    const tree = render(<ChapterAiScreen />);
    expect(toggle(tree, "Include channel messages").props.disabled).toBe(true);
    expect(screenText(tree)).toContain(AI_SETTINGS_COPY.dependsOnAsk);
  });

  it("offers Retry when the AI read failed, rather than loading forever", () => {
    h.consentFailed = true;
    const tree = render(<ChapterAiScreen />);
    expect(screenText(tree)).toContain("Couldn't load chapter settings");
    expect(byLabel(tree, "Switch", "Minutes from notes")).toHaveLength(0);
  });

  it("shows no switches where the server has no AI", () => {
    h.aiOn = false;
    const tree = render(<ChapterAiScreen />);
    expect(byLabel(tree, "Switch", "Minutes from notes")).toHaveLength(0);
    expect(screenText(tree)).toContain(AI_SETTINGS_COPY.unavailable);
  });
});

describe("the Privacy screen (#6028)", () => {
  it("draws the one switch, on, with web's line and footnote", () => {
    const tree = render(<ChapterPrivacyScreen />);
    expect(toggle(tree, PRIVACY_SETTINGS_COPY.label).props.value).toBe(true);
    const text = screenText(tree);
    expect(text).toContain(PRIVACY_SETTINGS_COPY.line);
    expect(text).toContain(PRIVACY_SETTINGS_COPY.footnote);
    expect(text).not.toContain(PRIVACY_SETTINGS_COPY.readOnly);
  });

  it("turning it off opts the chapter out, at once", () => {
    const tree = render(<ChapterPrivacyScreen />);
    act(() =>
      toggle(tree, PRIVACY_SETTINGS_COPY.label).props.onValueChange(false),
    );
    expect(h.patchConfig).toHaveBeenCalledWith({ analytics_opt_out: true });
  });

  it("says why it can't be changed for a viewer without chapter-config:manage", () => {
    h.permissions = ["chapter-config:view"];
    const tree = render(<ChapterPrivacyScreen />);
    expect(toggle(tree, PRIVACY_SETTINGS_COPY.label).props.disabled).toBe(true);
    expect(screenText(tree)).toContain(PRIVACY_SETTINGS_COPY.readOnly);
  });

  it("says so to a viewer it doesn't open to, rather than loading forever", () => {
    h.permissions = ["members:view"];
    const tree = render(<ChapterPrivacyScreen />);
    expect(byLabel(tree, "Switch", PRIVACY_SETTINGS_COPY.label)).toHaveLength(
      0,
    );
    expect(screenText(tree)).toContain(PRIVACY_SETTINGS_COPY.unavailable);
  });

  it("shows a refused save on the row", async () => {
    h.patchConfig.mockRejectedValueOnce(new Error("nope"));
    const tree = render(<ChapterPrivacyScreen />);
    await act(async () => {
      toggle(tree, PRIVACY_SETTINGS_COPY.label).props.onValueChange(false);
    });
    expect(screenText(tree)).toContain(
      `${PRIVACY_SETTINGS_COPY.saveFailed}. Try again.`,
    );
  });
});
