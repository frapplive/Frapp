/** @vitest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PLEDGE_CLASS_ASSIGNMENTS_MAX,
  PLEDGE_CLASS_SETTINGS_COPY,
} from "@repo/validation";
import { addRow, renumberRows } from "./pledge-class-editor";
import { useClassMembersEditor } from "./use-class-members-editor";
import { useMembers } from "./use-members";
import { createHookWrapper, createTestQueryClient } from "./test-utils";

/**
 * The pledge class member editor both apps share (#6033): one save at a
 * time, the roster read back once, a failed read back keeping the change, a
 * refused save putting the rows back.
 */

type Member = {
  id: string;
  user_id: string;
  display_name: string;
  pledge_class_id: string | null;
  order_number: number | null;
};
type Assignment = {
  member_id: string;
  pledge_class_id: string | null;
  order_number: number | null;
};

const member = (
  id: string,
  display_name: string,
  pledge_class_id: string | null,
  order_number: number | null,
): Member => ({
  id,
  user_id: `u-${id}`,
  display_name,
  pledge_class_id,
  order_number,
});

const CLASSES = [{ id: "alpha" }, { id: "beta" }];
const ROSTER = [
  member("m1", "Ada", "alpha", 1),
  member("m2", "Ben", "alpha", 2),
  member("m3", "Cy", null, null),
];

let server: Member[];
let readFails: boolean;
let putGate: (() => Promise<void>) | null;
let putRefusal: unknown;
const onFailure = vi.fn();

function apply(changes: Assignment[]) {
  server = server.map((row) => {
    const change = changes.find((entry) => entry.member_id === row.id);
    return change ? { ...row, ...change, id: row.id } : row;
  });
}

const client = {
  GET: vi.fn(async () =>
    readFails
      ? { data: undefined, error: { statusCode: 503 } }
      : { data: server, error: undefined },
  ),
  PUT: vi.fn(
    async (
      _path: string,
      { body }: { body: { assignments: Assignment[] } },
    ) => {
      if (putGate) await putGate();
      if (putRefusal) return { data: undefined, error: putRefusal };
      apply(body.assignments);
      return { data: body.assignments, error: undefined };
    },
  ),
};

function sent(): Assignment[][] {
  return client.PUT.mock.calls.map(([, { body }]) => body.assignments);
}

/**
 * The editor mounted on a roster already read, as both pages mount it, with
 * the roster query watched beside it, so a save's re-read runs.
 */
function renderLoadedEditorWithRoster(roster: Member[] = ROSTER) {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(["members", "c1"], roster);
  return renderHook(
    () => {
      const query = useMembers();
      const editor = useClassMembersEditor({
        classId: "alpha",
        classes: CLASSES,
        members: query.data ?? [],
        onFailure,
      });
      return { query, editor };
    },
    {
      wrapper: createHookWrapper({ client, queryClient, chapterId: "c1" }),
    },
  );
}

const names = (rows: { name: string; number: string }[]) =>
  rows.map((row) => `${row.number} ${row.name}`);

describe("useClassMembersEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    server = ROSTER;
    readFails = false;
    putGate = null;
    putRefusal = null;
  });

  it("sends only the change and reads the roster back once, from the save's own re-read", async () => {
    const { result } = renderLoadedEditorWithRoster();
    const cy = { memberId: "m3", name: "Cy" };
    await act(async () => {
      await result.current.editor.commit(
        addRow(result.current.editor.rows, cy),
      );
    });
    expect(sent()).toEqual([
      [{ member_id: "m3", pledge_class_id: "alpha", order_number: 3 }],
    ]);
    // Read once, by the save's own invalidation: no second read of its own.
    expect(client.GET).toHaveBeenCalledTimes(1);
    expect(names(result.current.editor.rows)).toEqual([
      "1 Ada",
      "2 Ben",
      "3 Cy",
    ]);
    expect(onFailure).toHaveBeenLastCalledWith(null);
  });

  it("saves a change made while one is saving after it, worked out against the roster read back", async () => {
    const { result } = renderLoadedEditorWithRoster();
    let release!: () => void;
    putGate = () =>
      new Promise<void>((resolve) => {
        release = resolve;
      });
    let first!: Promise<void>;
    act(() => {
      first = result.current.editor.commit(
        addRow(result.current.editor.rows, { memberId: "m3", name: "Cy" }),
      );
    });
    await act(async () => {
      await vi.waitFor(() => expect(client.PUT).toHaveBeenCalledTimes(1));
    });
    // Cy is taken out again before the add has saved: on screen at once…
    let second!: Promise<void>;
    act(() => {
      second = result.current.editor.commit(
        result.current.editor.rows.filter((row) => row.memberId !== "m3"),
      );
    });
    expect(names(result.current.editor.rows)).toEqual(["1 Ada", "2 Ben"]);
    // …and not sent while the add is in flight.
    await act(async () => {
      await Promise.resolve();
    });
    expect(client.PUT).toHaveBeenCalledTimes(1);
    putGate = null;
    await act(async () => {
      release();
      await first;
      await second;
    });
    // Against the roster read back, Cy is in the class, so the removal is sent.
    expect(sent()).toEqual([
      [{ member_id: "m3", pledge_class_id: "alpha", order_number: 3 }],
      [{ member_id: "m3", pledge_class_id: null, order_number: 3 }],
    ]);
    expect(names(result.current.editor.rows)).toEqual(["1 Ada", "2 Ben"]);
    expect(onFailure).not.toHaveBeenCalledWith(expect.anything());
  });

  it("keeps a saved change on screen when the roster can't be read back, and works the next one out from what was sent", async () => {
    const { result } = renderLoadedEditorWithRoster();
    readFails = true;
    await act(async () => {
      await result.current.editor.commit(
        addRow(result.current.editor.rows, { memberId: "m3", name: "Cy" }),
      );
    });
    expect(names(result.current.editor.rows)).toEqual([
      "1 Ada",
      "2 Ben",
      "3 Cy",
    ]);
    // The failed read isn't tried again on its own.
    expect(client.GET).toHaveBeenCalledTimes(1);
    // Cy counts as in the class now, so taking Cy out sends the removal.
    await act(async () => {
      await result.current.editor.commit(
        result.current.editor.rows.filter((row) => row.memberId !== "m3"),
      );
    });
    expect(sent()[1]).toEqual([
      { member_id: "m3", pledge_class_id: null, order_number: 3 },
    ]);
    expect(onFailure).not.toHaveBeenCalledWith(expect.anything());
  });

  it("puts the rows back when the save is refused, and says why", async () => {
    const { result } = renderLoadedEditorWithRoster();
    putRefusal = { statusCode: 409 };
    await act(async () => {
      await result.current.editor.commit(
        renumberRows([...result.current.editor.rows].reverse()),
      );
    });
    expect(names(result.current.editor.rows)).toEqual(["1 Ada", "2 Ben"]);
    expect(onFailure).toHaveBeenLastCalledWith({
      kind: "refused",
      error: { statusCode: 409 },
    });
  });

  it("keeps the batch cap as a guard, sending nothing past it", async () => {
    const many = Array.from(
      { length: PLEDGE_CLASS_ASSIGNMENTS_MAX + 1 },
      (_, index) => member(`x${index}`, `X${index}`, null, null),
    );
    server = many;
    const { result } = renderLoadedEditorWithRoster(many);
    await act(async () => {
      await result.current.editor.commit(
        many.reduce(
          (rows, entry) =>
            addRow(rows, { memberId: entry.id, name: entry.display_name }),
          result.current.editor.rows,
        ),
      );
    });
    expect(client.PUT).not.toHaveBeenCalled();
    expect(result.current.editor.rows).toEqual([]);
    expect(onFailure).toHaveBeenLastCalledWith({
      kind: "notSent",
      message: PLEDGE_CLASS_SETTINGS_COPY.tooManyAtOnce(
        PLEDGE_CLASS_ASSIGNMENTS_MAX,
      ),
    });
  });
});
