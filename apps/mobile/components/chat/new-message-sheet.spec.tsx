/** @vitest-environment jsdom */
import React, { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WhoDirectory } from "@repo/hooks/task-who-picker";
import type { TaskWho } from "@repo/validation";

const state = vi.hoisted(() => ({
  presented: 0,
  roster: [] as
    | { user_id: string; display_name: string; is_alumni?: boolean }[]
    | undefined,
  rosterFailed: false,
  rosterPaused: false,
  rosterRefetch: vi.fn(),
  blockRetry: vi.fn(),
  blockList: {
    ids: new Set<string>() as ReadonlySet<string>,
    status: "ready" as "ready" | "loading" | "unavailable",
    isRetrying: false,
    isPaused: false,
    retry: () => {},
  },
}));

vi.mock("@repo/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/hooks")>()),
  useViewerUserId: () => "u-me",
  useChapterRoster: () => ({
    data: state.roster,
    isError: state.rosterFailed,
    isFetching: false,
    fetchStatus: state.rosterPaused ? "paused" : "idle",
    refetch: state.rosterRefetch,
  }),
  useBlockedUserIds: () => state.blockList,
}));

// The picker has its own spec; here it records its props and its present.
vi.mock("@/components/tasks/who-picker-sheet", async () => {
  const { forwardRef, createElement, useImperativeHandle } =
    await import("react");
  return {
    WhoPickerSheet: forwardRef(function WhoPickerSheet(
      props: object,
      ref: React.Ref<{ present: () => void }>,
    ) {
      useImperativeHandle(ref, () => ({
        present: () => {
          state.presented += 1;
        },
      }));
      return createElement("WhoPickerSheet", props);
    }),
  };
});

import { NewMessageSheet } from "./new-message-sheet";

type SheetProps = {
  title: string;
  value: TaskWho | null;
  onChange: (next: TaskWho | null) => void;
  onDismiss: () => void;
  directory: WhoDirectory;
  people: "loading" | "ready" | "error";
  peopleNote?: { text: string; action?: { label: string; onPress: () => void } };
  add: {
    label: (count: number) => string;
    limit: number;
    onAdd: () => void;
  };
};

function mount() {
  const onStart = vi.fn();
  const onClose = vi.fn();
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<NewMessageSheet onStart={onStart} onClose={onClose} />);
  });
  const sheet = () =>
    tree.root.find((node) => (node.type as unknown) === "WhoPickerSheet")
      .props as SheetProps;
  return { sheet, onStart, onClose };
}

const ROSTER = [
  { user_id: "u-me", display_name: "Shawn Klein" },
  { user_id: "u-sam", display_name: "Sam Lee" },
  { user_id: "u-alex", display_name: "Alex Kim" },
  { user_id: "u-blocked", display_name: "Blocked Person" },
];

describe("NewMessageSheet (#6190)", () => {
  beforeEach(() => {
    state.presented = 0;
    state.roster = ROSTER;
    state.rosterFailed = false;
    state.rosterPaused = false;
    state.rosterRefetch.mockReset();
    state.blockRetry.mockReset();
    state.blockList = {
      ids: new Set(["u-blocked"]),
      status: "ready",
      isRetrying: false,
      isPaused: false,
      retry: state.blockRetry,
    };
  });

  it("opens itself as New message, offering everyone but you and who you blocked", () => {
    const { sheet } = mount();
    expect(state.presented).toBe(1);
    expect(sheet().title).toBe("New message");
    expect(sheet().people).toBe("ready");
    expect(sheet().directory.people.map((person) => person.name)).toEqual([
      "Alex Kim",
      "Sam Lee",
    ]);
  });

  it("offers alumni, whom a DM may reach though a task never does", () => {
    state.roster = [
      ...ROSTER,
      { user_id: "u-alum", display_name: "Alum Ni", is_alumni: true },
    ];
    expect(
      mount()
        .sheet()
        .directory.people.map((person) => person.userId),
    ).toContain("u-alum");
  });

  it("offers nobody until the block list is read, and says it is checking", () => {
    state.blockList = { ...state.blockList, status: "loading" };
    const { sheet } = mount();
    expect(sheet().people).toBe("loading");
    expect(sheet().directory.people).toEqual([]);
    expect(sheet().peopleNote?.text).toBe(
      "Checking your block list before listing other members.",
    );
  });

  it("blames the block list, not the members, when that read failed, with Try again", () => {
    state.blockList = { ...state.blockList, status: "unavailable" };
    const { sheet } = mount();
    expect(sheet().people).toBe("error");
    expect(sheet().peopleNote?.text).toBe(
      "Couldn't check your block list, so other members aren't listed.",
    );
    act(() => sheet().peopleNote!.action!.onPress());
    expect(state.blockRetry).toHaveBeenCalledTimes(1);
  });

  it("says the members couldn't load when the roster failed, with Try again", () => {
    state.roster = undefined;
    state.rosterFailed = true;
    const { sheet } = mount();
    expect(sheet().people).toBe("error");
    expect(sheet().peopleNote?.text).toBe(
      "Couldn't load your chapter's members.",
    );
    act(() => sheet().peopleNote!.action!.onPress());
    expect(state.rosterRefetch).toHaveBeenCalledTimes(1);
  });

  it("says it is waiting for the network while the roster read is paused", () => {
    state.roster = undefined;
    state.rosterPaused = true;
    const { sheet } = mount();
    expect(sheet().people).toBe("loading");
    expect(sheet().peopleNote?.text).toBe(
      "Your chapter's members will load when you're back online.",
    );
  });

  it("starts nobody past a group DM's size", () => {
    state.roster = [
      { user_id: "u-me", display_name: "Shawn Klein" },
      ...Array.from({ length: 10 }, (_, i) => ({
        user_id: `u-${i}`,
        display_name: `Person ${i}`,
      })),
    ];
    const { sheet, onStart } = mount();
    act(() =>
      sheet().onChange({
        kind: "each",
        target: {
          kind: "people",
          userIds: Array.from({ length: 10 }, (_, i) => `u-${i}`),
        },
      }),
    );
    act(() => sheet().add.onAdd());
    expect(onStart).not.toHaveBeenCalled();
  });

  it("starts with the one person picked", () => {
    const { sheet, onStart } = mount();
    act(() => sheet().onChange({ kind: "person", userId: "u-sam" }));
    act(() => sheet().add.onAdd());
    expect(onStart).toHaveBeenCalledWith([
      { user_id: "u-sam", display_name: "Sam Lee" },
    ]);
  });

  it("starts a group with everyone picked", () => {
    const { sheet, onStart } = mount();
    act(() =>
      sheet().onChange({
        kind: "each",
        target: { kind: "people", userIds: ["u-sam", "u-alex"] },
      }),
    );
    act(() => sheet().add.onAdd());
    expect(onStart).toHaveBeenCalledWith([
      { user_id: "u-sam", display_name: "Sam Lee" },
      { user_id: "u-alex", display_name: "Alex Kim" },
    ]);
  });

  it("names its button by the count, and stops at a group DM's size", () => {
    const { sheet } = mount();
    expect(sheet().add.label(1)).toBe("Message");
    expect(sheet().add.label(3)).toBe("Message 3 people");
    expect(sheet().add.limit).toBe(9);
    expect(sheet().add.label(10)).toBe("Up to 9 people");
  });

  it("closes through onClose, however the sheet closed", () => {
    const { sheet, onClose } = mount();
    act(() => sheet().onDismiss());
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
