/** @vitest-environment jsdom */
import React, { forwardRef } from "react";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MeetingActionItemTask, MeetingMinutes } from "@repo/hooks";
import { EMPTY_MEETING_CONTENT } from "@repo/validation";
import type { ItemMenu, ItemMenuHandle } from "@/components/item-actions-menu";
import { FrappThemeProvider } from "@/lib/theme";
import { drawnText } from "@/test/screen-text";

const mocks = vi.hoisted(() => ({
  accept: vi.fn(),
  push: vi.fn(),
  sheet: { current: null as null | Record<string, unknown> },
}));

vi.mock("@/lib/chapter-branding", () => ({
  useChapterBranding: () => ({ accent: "#F4CB63" }),
}));
vi.mock("expo-router", () => ({
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock("@repo/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/hooks")>()),
  useAcceptAiSuggestion: () => ({ mutateAsync: mocks.accept }),
}));
// The task form has its own specs; here only what it is opened on.
vi.mock("@/components/tasks/new-task-sheet", () => ({
  NewTaskSheet: forwardRef(function NewTaskSheet(
    props: Record<string, unknown>,
  ) {
    mocks.sheet.current = props;
    return null;
  }),
}));

import { MinutesBody } from "./minutes-body";
import { useActionItemTaskMenu } from "./action-item-task";

const meeting = {
  sections: ["action_items"],
  attendees: null,
} as unknown as MeetingMinutes;

const item = (text: string, owner: string | null = null) => ({
  text,
  owner_user_id: owner,
  due_date: null,
});

function suggestion(id: string, quote: string, task: object = {}) {
  return {
    id,
    kind: "task",
    status: "pending",
    source: { type: "meeting", id: "m-1" },
    batch_id: "b-1",
    task: {
      title: quote,
      description: null,
      assignee_id: null,
      due_date: null,
      due_at: null,
      subtasks: [],
      ...task,
    },
    quote,
    edited: false,
    result_id: null,
    created_at: "2026-11-10T00:00:00.000Z",
    expires_at: "2026-11-24T00:00:00.000Z",
  };
}

/** The menus the rows asked for, each opened by hand. */
const opened: ItemMenu[] = [];
const handleFor = (menu: ItemMenu | null): ItemMenuHandle | null =>
  menu && menu.actions.length > 0
    ? { ...menu, open: () => void opened.push(menu) }
    : null;

function Screen({
  items,
  suggestions,
  tasks = new Map(),
}: {
  items: ReturnType<typeof item>[];
  suggestions: unknown[];
  tasks?: Map<number, MeetingActionItemTask>;
}) {
  const { menuFor, sheet } = useActionItemTaskMenu({
    items,
    suggestions: suggestions as never,
    handleFor,
  });
  return (
    <>
      <MinutesBody
        meeting={meeting}
        content={{ ...EMPTY_MEETING_CONTENT, action_items: items }}
        nameFor={(id) =>
          ({ "u-sam": "Sam Lee", "u-alex": "Alex Kim" })[id] ?? null
        }
        tasks={tasks}
        actionItemMenu={menuFor}
      />
      {sheet}
    </>
  );
}

function render(props: React.ComponentProps<typeof Screen>) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <FrappThemeProvider>
        <Screen {...props} />
      </FrappThemeProvider>,
    );
  });
  return tree;
}

/**
 * The rows that answer a long press, once each (a row and the press it
 * wraps carry the same props), by what a screen reader hears.
 */
const longPressRows = (tree: ReactTestRenderer) => {
  const seen = new Set<string>();
  return tree.root.findAll((node) => {
    const label = node.props.accessibilityLabel;
    if (typeof node.props.onLongPress !== "function") return false;
    if (typeof label !== "string" || seen.has(label)) return false;
    seen.add(label);
    return true;
  });
};

function longPress(tree: ReactTestRenderer, text: string) {
  const row = longPressRows(tree).find((node) =>
    String(node.props.accessibilityLabel).includes(text),
  )!;
  act(() => row.props.onLongPress());
  return opened.at(-1)!;
}

describe("an action item's long-press on the phone (#6051)", () => {
  beforeEach(() => {
    opened.length = 0;
    mocks.accept.mockReset().mockResolvedValue({});
    mocks.push.mockReset();
    mocks.sheet.current = null;
  });

  it("offers Create task, which opens the task form on the item's suggestion and accepts it", async () => {
    const tree = render({
      items: [item("Book the bus"), item("Order shirts")],
      suggestions: [suggestion("s-shirts", "Order shirts")],
    });
    // Only the item with a suggestion waiting answers a long press.
    expect(longPressRows(tree)).toHaveLength(1);

    const menu = longPress(tree, "Order shirts");
    expect(menu.title).toBe("Order shirts");
    expect(menu.actions.map((action) => action.label)).toEqual(["Create task"]);
    act(() => menu.actions[0]!.run());

    const seed = mocks.sheet.current?.suggestion as {
      title: string;
      who: unknown;
      accept: (form: unknown) => Promise<void>;
    };
    expect(seed.title).toBe("Order shirts");
    expect(seed.who).toBeNull();
    await act(() =>
      seed.accept({
        title: "Order shirts",
        who: { kind: "person", userId: "u-sam" },
        subtasks: [],
      }),
    );
    // The card's own accept, so the suggestion is resolved with the task.
    expect(mocks.accept).toHaveBeenCalledWith({
      id: "s-shirts",
      task: expect.objectContaining({ assignee_id: "u-sam" }),
    });
  });

  it("offers Open task once the item is a task, and names who it went to", () => {
    const tasks = new Map<number, MeetingActionItemTask>([
      [
        0,
        {
          index: 0,
          done: false,
          group: { done: 0, total: 2 },
          task: {
            id: "t-shirts",
            who: {
              audience: "people",
              audience_name: null,
              assignee_ids: ["u-sam", "u-alex"],
            },
          },
        },
      ],
    ]);
    const tree = render({
      items: [item("Order shirts")],
      suggestions: [suggestion("s-shirts", "Order shirts")],
      tasks,
    });
    expect(drawnText(tree.root)).toContain("Sam Lee and Alex Kim");

    const menu = longPress(tree, "Order shirts");
    expect(menu.actions.map((action) => action.label)).toEqual(["Open task"]);
    act(() => menu.actions[0]!.run());
    expect(mocks.push).toHaveBeenCalledWith({
      pathname: "/task-details",
      params: { id: "t-shirts" },
    });
  });

  it("gives a member's rows no menu: no suggestion is listed to them and no task named", () => {
    const tasks = new Map<number, MeetingActionItemTask>([
      [0, { index: 0, done: true, group: null, task: null }],
    ]);
    const tree = render({
      items: [item("Order shirts"), item("Call the DJ")],
      suggestions: [],
      tasks,
    });
    expect(longPressRows(tree)).toHaveLength(0);
    expect(drawnText(tree.root)).toContain("Nobody named yet");
  });
});
