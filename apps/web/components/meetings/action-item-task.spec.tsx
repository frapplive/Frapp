import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { chapterSubscription } from "@/tests/chapter-subscription";

const mocks = vi.hoisted(() => ({
  items: { current: [] as unknown[] },
  accept: vi.fn(),
  toast: vi.fn(),
  suggestionsEnabled: [] as boolean[],
  currentChapter: vi.fn(),
}));

vi.mock("@repo/hooks", () => ({
  useRequestTaskPhotoUploadUrl: () => ({ mutateAsync: vi.fn() }),
  useTaskPhotoUrl: () => ({ data: undefined }),
  // The Who picker reads roles, tiers and groups.
  useRoles: () => ({ data: [] }),
  useRoleTiers: () => ({ data: [] }),
  useGroups: () => ({ data: [] }),
  useCurrentUser: () => ({ data: undefined }),
  useMemberDisplayNames: () => ({ avatarTintFor: () => null }),
  useMyPermissions: () => ({ data: { permissions: [] } }),
  useCurrentChapter: () => mocks.currentChapter(),
  // The server lists a suggestion only to someone who could create it.
  useAiSuggestions: (options: { enabled?: boolean }) => {
    mocks.suggestionsEnabled.push(options.enabled ?? true);
    return { data: { items: mocks.items.current } };
  },
  useAcceptAiSuggestion: () => ({
    mutateAsync: mocks.accept,
    isPending: false,
  }),
  useMembers: () => ({
    data: [
      { user_id: "u-jake", display_name: "Jake Ross" },
      { user_id: "u-sam", display_name: "Sam Lee" },
    ],
  }),
}));

vi.mock("@/lib/hooks/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

const { ActionChecklist } = await import("./minutes-read");
const { useActionItemTaskRow } = await import("./action-item-task");

const chapter = chapterSubscription(mocks.currentChapter);

type Items = Parameters<typeof ActionChecklist>[0]["items"];
type Tasks = Parameters<typeof ActionChecklist>[0]["tasks"];

const names: Record<string, string> = {
  "u-jake": "Jake Ross",
  "u-sam": "Sam Lee",
  "u-alex": "Alex Kim",
};

function Checklist({
  items,
  tasks = new Map(),
  enabled = true,
}: {
  items: Items;
  tasks?: Tasks;
  enabled?: boolean;
}) {
  const taskRow = useActionItemTaskRow({
    meetingId: "m-1",
    items,
    meetingStart: "2026-11-09T19:00:00",
    enabled,
  });
  return (
    <ActionChecklist
      items={items}
      nameFor={(id) => names[id] ?? null}
      viewerId={null}
      tasks={tasks}
      taskRow={taskRow}
    />
  );
}

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

const rowOf = (text: string) => screen.getByText(text).closest("li")!;

describe("Create task from an action item's row (#6051)", () => {
  beforeEach(() => {
    mocks.items.current = [];
    mocks.accept.mockReset().mockResolvedValue({});
    mocks.toast.mockReset();
    mocks.suggestionsEnabled.length = 0;
    chapter.active();
  });

  it("creates an item's task from its row with the minutes' owner already picked, accepting its suggestion", async () => {
    const items = [item("Book the bus", "u-jake"), item("Order shirts")];
    mocks.items.current = [
      suggestion("s-bus", "Book the bus", { assignee_id: "u-jake" }),
      suggestion("s-shirts", "Order shirts"),
    ];
    render(<Checklist items={items} />);

    fireEvent.click(
      within(rowOf("Book the bus")).getByRole("button", {
        name: "Create task: Book the bus",
      }),
    );
    const form = await screen.findByRole("form", {
      name: "Create task: Book the bus",
    });
    // Who the minutes named is picked, and no due day is asked for.
    expect(
      within(form).getByRole("button", { name: /^Assignee for Book the bus/ })
        .textContent,
    ).toContain("Jake Ross");
    fireEvent.click(within(form).getByRole("button", { name: "Create task" }));

    // The same accept the card makes, so the card stops offering it. Who
    // the minutes said is sent as it stands; only the guessed day differs.
    await waitFor(() => expect(mocks.accept).toHaveBeenCalledTimes(1));
    expect(mocks.accept.mock.calls[0]![0]).toMatchObject({ id: "s-bus" });
    expect(mocks.accept.mock.calls[0]![0].task?.assignee_id).toBeUndefined();
    expect(mocks.toast).toHaveBeenCalledWith({
      title: "Task created",
      description: "Book the bus",
    });
  });

  it("asks who when the minutes named nobody and the words name no member, and creates nothing", async () => {
    mocks.items.current = [suggestion("s-shirts", "Order shirts")];
    render(<Checklist items={[item("Order shirts")]} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Create task: Order shirts" }),
    );
    const form = await screen.findByRole("form", {
      name: "Create task: Order shirts",
    });
    fireEvent.submit(form);

    expect(await screen.findByText("Pick who this is for.")).toBeTruthy();
    expect(mocks.accept).not.toHaveBeenCalled();
  });

  it("fills in the member the item's words name, dashed as a suggestion", async () => {
    mocks.items.current = [suggestion("s-bus", "Sam to book the bus")];
    render(<Checklist items={[item("Sam to book the bus")]} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Create task: Sam to book the bus" }),
    );
    const form = await screen.findByRole("form");
    expect(
      within(form).getByRole("button", {
        name: /^Assignee for Sam to book the bus, suggested from the minutes/,
      }),
    ).toBeTruthy();
    fireEvent.submit(form);
    await waitFor(() =>
      expect(mocks.accept.mock.calls[0]![0].task).toMatchObject({
        assignee_id: "u-sam",
      }),
    );
  });

  it("offers Create task in the row's menu too, and Change before creating opens the task form under the row", async () => {
    mocks.items.current = [suggestion("s-shirts", "Order shirts")];
    render(<Checklist items={[item("Order shirts")]} />);

    fireEvent.keyDown(
      screen.getByRole("button", { name: "More for Order shirts" }),
      { key: "Enter" },
    );
    expect(screen.getByRole("menuitem", { name: "Create task" })).toBeTruthy();
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Change before creating" }),
    );

    // The board's own form, opened on the suggestion, inside the row.
    const row = screen.getAllByRole("listitem")[0]!;
    expect(await within(row).findByDisplayValue("Order shirts")).toBeTruthy();
  });

  it("offers Open task, and says who the task went to, once an item is a task", () => {
    const tasks: Tasks = new Map([
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
    // A suggestion still listed for it is left alone: the task wins.
    mocks.items.current = [suggestion("s-shirts", "Order shirts")];
    render(<Checklist items={[item("Order shirts")]} tasks={tasks} />);

    const row = rowOf("Order shirts");
    expect(
      within(row).getByRole("link", { name: "Open task" }).getAttribute("href"),
    ).toBe("/tasks?task=t-shirts");
    expect(
      within(row).queryByRole("button", { name: /Create task/ }),
    ).toBeNull();
    // The minutes named nobody; the task's people stand in for "Nobody named yet".
    expect(within(row).getByText(/Sam Lee and Alex Kim/)).toBeTruthy();
  });

  it("offers nothing on a row with no suggestion waiting and no task the reader may open", () => {
    // A member who can't manage tasks is listed no suggestions and told no
    // task, so their rows read as before.
    const tasks: Tasks = new Map([
      [0, { index: 0, done: true, group: null, task: null }],
    ]);
    render(
      <Checklist
        items={[item("Order shirts"), item("Call the DJ")]}
        tasks={tasks}
      />,
    );
    expect(screen.queryByRole("button", { name: /Create task/ })).toBeNull();
    expect(screen.queryByRole("link", { name: "Open task" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^More for/ })).toBeNull();
    expect(
      within(rowOf("Call the DJ")).getByText("Nobody named yet"),
    ).toBeTruthy();
  });

  it("gives the create to the first of two items that read the same", () => {
    mocks.items.current = [suggestion("s-shirts", "Order shirts")];
    render(<Checklist items={[item("Order shirts"), item("order shirts.")]} />);
    expect(
      screen.getAllByRole("button", { name: /^Create task: /i }),
    ).toHaveLength(1);
  });

  it("reads no suggestions for a draft or the editor", () => {
    render(<Checklist items={[item("Order shirts")]} enabled={false} />);
    expect(mocks.suggestionsEnabled).toEqual([false]);
    expect(screen.queryByRole("button", { name: /Create task/ })).toBeNull();
  });
});
