/** @vitest-environment jsdom */
import React from "react";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { useLocalSearchParams, useRouter } from "expo-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dropAllKeptDrafts } from "@repo/hooks/kept-drafts";
import {
  createFieldBody,
  MEMBER_FIELDS_COPY,
  PLEDGE_CLASS_SETTINGS_COPY,
} from "@repo/validation";
import { FrappThemeProvider } from "@/lib/theme";
import { screenText } from "@/test/screen-text";

/**
 * Chapter settings → People's Pledge class and Member fields pages on the
 * phone (#6029), rendered: the rows' council gate, the member field page's
 * saves, a new field's Add, the class list's long press and a class's
 * member changes, each saved at once (#6033).
 * The screens live under `app/`, so their spec lives here
 * (`lib/routes.spec.ts`).
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
  updateField: vi.fn<(input: unknown) => Promise<unknown>>(),
  createField: vi.fn<(body: unknown) => Promise<unknown>>(),
  deleteField: vi.fn<(id: string) => Promise<unknown>>(),
  reorderClasses: vi.fn<(ids: string[]) => Promise<unknown>>(),
  assignClasses: vi.fn<(body: unknown) => Promise<unknown>>(),
  renameClass: vi.fn<(body: unknown) => Promise<unknown>>(),
  sheets: new Map<string, Sheet>(),
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
    ok(options?.enabled === false ? undefined : { vocabulary: {} }),
  usePatchOrgConfig: () => mutation(vi.fn()),
  useUpdateChapter: () => mutation(vi.fn()),
  useChannels: () => ok([]),
  useChapterChatBackground: () =>
    ok({ background: "midnight", photo_url: null }),
  useGeofences: () => ok([]),
  useAiConsent: () => ({ data: null }),
  useAiChapterSettings: () => ok(undefined),
  useUpdateAiChapterSettings: () => ({ mutate: vi.fn(), isPending: false }),
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
import MemberFieldScreen from "@/app/(app)/member-field";
import MemberFieldsScreen from "@/app/(app)/member-fields";
import PledgeClassScreen from "@/app/(app)/pledge-class";
import PledgeClassesScreen from "@/app/(app)/pledge-classes";
import { SavedTextField } from "@/components/settings/saved-text-field";
import {
  currentItemMenu,
  dismissItemMenu,
  ItemActionsMenu,
  pickItemMenuAction,
} from "@/components/item-actions-menu";

const OFFICER = [
  "chapter-config:view",
  "chapter-config:manage",
  "roles:manage",
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
const pressable = (tree: ReactTestRenderer, label: string) =>
  byLabel(tree, "Pressable", label)[0]!;
const field = (tree: ReactTestRenderer, label: string) =>
  byLabel(tree, "TextInput", label)[0]!;
const toggle = (tree: ReactTestRenderer, label: string) =>
  byLabel(tree, "Switch", label)[0]!;

const textField = (over: Record<string, unknown> = {}) => ({
  id: "f-shirt",
  key: "shirt_size",
  label: "Shirt size",
  type: "text",
  required: false,
  sensitive: false,
  visibility: "chapter",
  sort: 0,
  options: { max_length: 40 },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  h.permissions = OFFICER;
  h.council = false;
  h.fields = [
    textField(),
    textField({
      id: "f-major",
      key: "major",
      label: "Major",
      sort: 1,
      options: null,
    }),
  ];
  h.classes = [
    { id: "c-alpha", name: "Alpha", sort: 0 },
    { id: "c-beta", name: "Beta", sort: 1 },
  ];
  h.members = [
    {
      id: "m-ann",
      user_id: "u-ann",
      display_name: "Ann Lee",
      pledge_class_id: "c-alpha",
      order_number: 1,
    },
    {
      id: "m-bo",
      user_id: "u-bo",
      display_name: "Bo Diaz",
      pledge_class_id: "c-alpha",
      order_number: 2,
    },
  ];
  h.updateField.mockReset().mockResolvedValue({});
  h.createField.mockReset().mockResolvedValue({ id: "f-new" });
  h.reorderClasses.mockReset().mockResolvedValue({});
  h.assignClasses.mockReset().mockResolvedValue({});
  h.renameClass.mockReset().mockResolvedValue({});
  h.sheets.clear();
  vi.mocked(useLocalSearchParams).mockReturnValue({});
});

afterEach(() => {
  act(() => {
    for (const tree of mounted.splice(0)) tree.unmount();
    dismissItemMenu();
  });
  dropAllKeptDrafts();
});

describe("Chapter settings → People rows (#6029)", () => {
  it("shows Pledge class and Member fields to an officer of a chapter", () => {
    const text = screenText(render(<ChapterSettingsScreen />));
    expect(text).toContain("Member fields");
    expect(text).toContain("Pledge class");
  });

  // Both routes refuse a council (ChapterGuard).
  it("doesn't show either to a council viewer", () => {
    expect(
      byLabel(render(<ChapterSettingsScreen />), "Pressable", "Pledge class"),
    ).toHaveLength(1);
    h.council = true;
    const tree = render(<ChapterSettingsScreen />);
    expect(byLabel(tree, "Pressable", "Member fields")).toHaveLength(0);
    expect(byLabel(tree, "Pressable", "Pledge class")).toHaveLength(0);
  });
});

describe("a member field's page (#6029)", () => {
  beforeEach(() => {
    vi.mocked(useLocalSearchParams).mockReturnValue({ id: "f-shirt" });
  });

  it("draws web's rows in web's order", () => {
    const text = screenText(render(<MemberFieldScreen />));
    const order = [
      "Name",
      "Type",
      "Longest answer",
      "Visible to",
      "Required",
      "Sensitive",
    ].map((word) => text.indexOf(word));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("saves Required and Visible to the moment they change", async () => {
    const tree = render(<MemberFieldScreen />);
    await act(async () =>
      toggle(tree, MEMBER_FIELDS_COPY.required).props.onValueChange(true),
    );
    expect(h.updateField).toHaveBeenLastCalledWith({
      id: "f-shirt",
      body: { required: true },
    });
    await act(async () =>
      h.sheets.get(MEMBER_FIELDS_COPY.visibleTo)!.onSelect("officers"),
    );
    expect(h.updateField).toHaveBeenLastCalledWith({
      id: "f-shirt",
      body: { visibility: "officers" },
    });
  });

  it("saves a cleared Longest answer as no limit", async () => {
    const tree = render(<MemberFieldScreen />);
    const input = () => field(tree, MEMBER_FIELDS_COPY.maxLength);
    act(() => input().props.onChangeText(""));
    await act(async () => input().props.onBlur());
    expect(h.updateField).toHaveBeenCalledWith({
      id: "f-shirt",
      // The field's options without a longest answer: none left.
      body: { options: null },
    });
  });

  it("says a failed switch once, not under the name", async () => {
    h.updateField.mockRejectedValue(new Error("nope"));
    const tree = render(<MemberFieldScreen />);
    await act(async () =>
      toggle(tree, MEMBER_FIELDS_COPY.sensitive).props.onValueChange(true),
    );
    const text = screenText(tree);
    expect(text.split("Couldn't change Shirt size").length - 1).toBe(1);
    expect(field(tree, MEMBER_FIELDS_COPY.name).props.error).toBeFalsy();
  });

  it("offers Move up, Move down and Delete field in the header, in order", async () => {
    vi.mocked(useLocalSearchParams).mockReturnValue({ id: "f-major" });
    const tree = render(<MemberFieldScreen />);
    act(() => pressable(tree, "More for Major").props.onPress());
    expect(currentItemMenu()!.actions.map((action) => action.label)).toEqual([
      "Move up",
      MEMBER_FIELDS_COPY.deleteField,
    ]);
    await act(async () => pickItemMenuAction("Move up"));
    expect(h.updateField).toHaveBeenCalledWith({
      id: "f-major",
      body: { sort: 0 },
    });
  });

  it("says web's words when the field is gone", () => {
    vi.mocked(useLocalSearchParams).mockReturnValue({ id: "f-gone" });
    const text = screenText(render(<MemberFieldScreen />));
    expect(text).toContain(MEMBER_FIELDS_COPY.gone);
    expect(text).toContain(MEMBER_FIELDS_COPY.goneDetail);
  });
});

describe("a new member field (#6029)", () => {
  beforeEach(() => {
    vi.mocked(useLocalSearchParams).mockReturnValue({ new: "1" });
  });

  it("holds Add with its reason, then sends the draft and opens the new page", async () => {
    const tree = render(<MemberFieldScreen />);
    const add = () => pressable(tree, MEMBER_FIELDS_COPY.needsName);
    expect(add().props.disabled).toBe(true);
    act(() =>
      field(tree, MEMBER_FIELDS_COPY.name).props.onChangeText("Hometown"),
    );
    const go = pressable(tree, MEMBER_FIELDS_COPY.createField);
    expect(go.props.disabled).toBe(false);
    await act(async () => go.props.onPress());
    expect(h.createField).toHaveBeenCalledWith(
      createFieldBody(
        {
          label: "Hometown",
          type: "text",
          choices: [],
          maxLength: "",
          visibility: "chapter",
          required: false,
          sensitive: false,
        },
        h.fields as never,
      ),
    );
    expect(h.createField.mock.calls[0]![0]).not.toHaveProperty("sort");
    expect(vi.mocked(useRouter)().replace).toHaveBeenCalledWith({
      pathname: "/member-field",
      params: { id: "f-new" },
    });
  });

  it("asks a pick-one field for an option first", () => {
    const tree = render(<MemberFieldScreen />);
    act(() => field(tree, MEMBER_FIELDS_COPY.name).props.onChangeText("Shirt"));
    act(() => h.sheets.get(MEMBER_FIELDS_COPY.type)!.onSelect("select"));
    expect(pressable(tree, MEMBER_FIELDS_COPY.needsOption).props.disabled).toBe(
      true,
    );
  });
});

describe("Member fields' list (#6029)", () => {
  it("draws each field and opens it", () => {
    const tree = render(<MemberFieldsScreen />);
    act(() => pressable(tree, "Major").props.onPress());
    expect(vi.mocked(useRouter)().push).toHaveBeenCalledWith({
      pathname: "/member-field",
      params: { id: "f-major" },
    });
  });
});

describe("the pledge class list (#6029)", () => {
  it("moves a class up from its long press", async () => {
    const tree = render(<PledgeClassesScreen />);
    act(() => pressable(tree, "Beta").props.onLongPress());
    // A row's long press opens the screen's own menu (`useItemMenu`).
    const menu = tree.root.findByType(ItemActionsMenu).props.target as {
      actions: { label: string; run: () => void }[];
    };
    expect(menu.actions.map((action) => action.label)).toEqual([
      "Move up",
      "Delete Beta",
    ]);
    await act(async () => menu.actions[0]!.run());
    expect(h.reorderClasses).toHaveBeenCalledWith(["c-beta", "c-alpha"]);
  });
});

describe("a pledge class's page (#6029)", () => {
  beforeEach(() => {
    vi.mocked(useLocalSearchParams).mockReturnValue({ id: "c-alpha" });
  });

  it("sends a removal at once, only that member, then shows the roster as read", async () => {
    // The re-read after the save: Bo is out of Alpha now.
    h.assignClasses.mockImplementation(async () => {
      const bo = h.members.find((member) => member.id === "m-bo")!;
      bo.pledge_class_id = null;
      return {};
    });
    const tree = render(<PledgeClassScreen />);
    await act(async () =>
      pressable(tree, "Remove Bo Diaz from Alpha").props.onPress(),
    );
    expect(h.assignClasses).toHaveBeenCalledTimes(1);
    expect(h.assignClasses).toHaveBeenCalledWith([
      expect.objectContaining({ member_id: "m-bo", pledge_class_id: null }),
    ]);
    expect(
      byLabel(tree, "Pressable", "Remove Bo Diaz from Alpha"),
    ).toHaveLength(0);
    // No Save to press: the change is in.
    expect(byLabel(tree, "Pressable", "Save")).toHaveLength(0);
  });

  it("adds a member from the roster sheet at once", async () => {
    h.members.push({
      id: "m-cy",
      user_id: "u-cy",
      display_name: "Cy Park",
      pledge_class_id: null,
      order_number: null,
    });
    render(<PledgeClassScreen />);
    const sheet = h.sheets.get(PLEDGE_CLASS_SETTINGS_COPY.addMember)!;
    await act(async () => sheet.onSelect("m-cy"));
    expect(h.assignClasses).toHaveBeenCalledWith([
      expect.objectContaining({
        member_id: "m-cy",
        pledge_class_id: "c-alpha",
      }),
    ]);
  });

  it("puts a refused member change back and says it under the members", async () => {
    h.assignClasses.mockRejectedValue(new Error("nope"));
    const tree = render(<PledgeClassScreen />);
    await act(async () =>
      pressable(tree, "Remove Bo Diaz from Alpha").props.onPress(),
    );
    expect(
      byLabel(tree, "Pressable", "Remove Bo Diaz from Alpha"),
    ).toHaveLength(1);
    expect(screenText(tree)).toContain("Couldn't save Alpha");
    expect(field(tree, "Name").props.error).toBeFalsy();
  });

  it("says a failed rename under the name and a failed move once, below", async () => {
    h.reorderClasses.mockRejectedValue(new Error("nope"));
    const tree = render(<PledgeClassScreen />);
    act(() => pressable(tree, "More for Alpha").props.onPress());
    await act(async () => pickItemMenuAction("Move down"));
    const text = screenText(tree);
    expect(text.split("Couldn't change Alpha").length - 1).toBe(1);
    expect(field(tree, "Name").props.error).toBeFalsy();
  });

  it("says web's words when the class is gone", () => {
    vi.mocked(useLocalSearchParams).mockReturnValue({ id: "c-gone" });
    const text = screenText(render(<PledgeClassScreen />));
    expect(text).toContain(PLEDGE_CLASS_SETTINGS_COPY.gone);
  });
});

describe("SavedTextField (#6029)", () => {
  function draw(
    onSave: (next: string) => Promise<boolean>,
    allowBlank = false,
  ) {
    return render(
      <SavedTextField
        label="Name"
        value="Alpha"
        editable
        failure={null}
        allowBlank={allowBlank}
        onSave={onSave}
      />,
    );
  }

  it("saves a change on leaving the field, trimmed, and says Saved", async () => {
    const onSave = vi.fn(async () => true);
    const tree = draw(onSave);
    act(() => field(tree, "Name").props.onChangeText(" Alpha Beta "));
    await act(async () => field(tree, "Name").props.onBlur());
    expect(onSave).toHaveBeenCalledWith("Alpha Beta");
    expect(screenText(tree)).toContain("Saved");
  });

  it("puts the saved text back for a blank, unless blank is allowed", async () => {
    const onSave = vi.fn(async () => true);
    const tree = draw(onSave);
    act(() => field(tree, "Name").props.onChangeText("  "));
    await act(async () => field(tree, "Name").props.onBlur());
    expect(onSave).not.toHaveBeenCalled();
    expect(field(tree, "Name").props.value).toBe("Alpha");

    const blank = vi.fn(async () => true);
    const other = draw(blank, true);
    act(() => field(other, "Name").props.onChangeText(""));
    await act(async () => field(other, "Name").props.onBlur());
    expect(blank).toHaveBeenCalledWith("");
  });

  it("keeps the typed text after a failed save", async () => {
    const tree = draw(async () => false);
    act(() => field(tree, "Name").props.onChangeText("Gamma"));
    await act(async () => field(tree, "Name").props.onBlur());
    expect(field(tree, "Name").props.value).toBe("Gamma");
  });
});
