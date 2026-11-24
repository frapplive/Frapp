/** @vitest-environment jsdom */
import React, { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TASK_AUDIENCE_COPY, type TaskWho } from "@repo/validation";

const spies = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  presented: 0,
}));

vi.mock("@repo/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/hooks")>()),
  useAddToTaskGroup: () => ({ mutateAsync: spies.mutateAsync }),
}));

vi.mock("@/lib/tasks/use-who-directory", async () => {
  const { buildWhoDirectory: build } =
    await import("@repo/hooks/task-who-picker");
  const directory = build({
    members: [
      { user_id: "u-me", display_name: "Paul Carlson", role_ids: [] },
      { user_id: "u-sam", display_name: "Sam Lee", role_ids: [] },
      { user_id: "u-alex", display_name: "Alex Kim", role_ids: [] },
    ],
    viewerUserId: "u-me",
  });
  return {
    useWhoDirectory: () => ({ directory, people: "ready", sets: "ready" }),
  };
});

// The sheet has its own spec; here it is a stand-in that records its props
// and that it was presented.
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
          spies.presented += 1;
        },
      }));
      return createElement("WhoPickerSheet", props);
    }),
  };
});

import { AddPeopleSheet } from "./add-people-sheet";

type SheetProps = {
  value: TaskWho | null;
  onChange: (next: TaskWho | null) => void;
  onDismiss: () => void;
  add: {
    marked: ReadonlySet<string>;
    label: (count: number) => string;
    onAdd: () => void;
  };
};

function mount(onResult = vi.fn(), onSending = vi.fn(), onClose = vi.fn()) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <AddPeopleSheet
        taskId="t-1"
        holders={["u-me"]}
        onSending={onSending}
        onResult={onResult}
        onClose={onClose}
      />,
    );
  });
  const sheet = () =>
    tree.root.find((node) => (node.type as unknown) === "WhoPickerSheet")
      .props as SheetProps;
  return { tree, sheet, onResult, onSending, onClose };
}

describe("AddPeopleSheet (#5905)", () => {
  beforeEach(() => {
    spies.mutateAsync.mockReset();
    spies.presented = 0;
  });

  it("opens itself, with who has it marked", () => {
    const { sheet } = mount();
    expect(spies.presented).toBe(1);
    expect([...sheet().add.marked]).toEqual(["u-me"]);
  });

  it("adds only the people picked who don't have it, and says how many got it", async () => {
    spies.mutateAsync.mockResolvedValue({
      added: ["u-sam", "u-alex"],
      group: { id: "g1", audience: "people", total: 3, done: 0, confirmed: 0 },
    });
    const { sheet, onResult, onSending } = mount();
    act(() =>
      sheet().onChange({
        kind: "each",
        target: { kind: "people", userIds: ["u-me", "u-sam", "u-alex"] },
      }),
    );
    await act(async () => sheet().add.onAdd());

    expect(spies.mutateAsync).toHaveBeenCalledWith({
      id: "t-1",
      assigneeIds: ["u-sam", "u-alex"],
    });
    expect(onSending).toHaveBeenCalledTimes(1);
    expect(onResult).toHaveBeenCalledWith("Added 2 people to this task.");
  });

  it("sends nothing when everyone picked already has it, and says so", async () => {
    const { sheet, onResult, onSending } = mount();
    act(() => sheet().onChange({ kind: "person", userId: "u-me" }));
    await act(async () => sheet().add.onAdd());

    expect(spies.mutateAsync).not.toHaveBeenCalled();
    expect(onSending).not.toHaveBeenCalled();
    expect(onResult).toHaveBeenCalledWith(TASK_AUDIENCE_COPY.addedLine(0));
  });

  it("says a refusal in plain words", async () => {
    spies.mutateAsync.mockRejectedValue({ statusCode: 500 });
    const { sheet, onResult } = mount();
    act(() => sheet().onChange({ kind: "person", userId: "u-sam" }));
    await act(async () => sheet().add.onAdd());

    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult.mock.calls[0]![0]).not.toMatch(/^Added/);
  });

  it("closes through onClose, however the sheet closed", () => {
    const { sheet, onClose } = mount();
    act(() => sheet().onDismiss());
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
