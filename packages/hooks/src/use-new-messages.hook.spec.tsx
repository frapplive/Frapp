import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  NEW_MESSAGES_SEEK_MAX_PAGES,
  type NewMessagesMark,
  type NewMessagesRow,
} from "./new-messages";
import { useNewMessages } from "./use-new-messages";

const READ_AT = "2026-11-25T10:00:00.000Z";
const MARK: NewMessagesMark = { lastReadAt: READ_AT, count: 3 };

const row = (id: string, minute: number, own = false): NewMessagesRow => ({
  id,
  createdAt: `2026-11-25T10:${String(minute).padStart(2, "0")}:00.000Z`,
  own,
  silent: false,
});
/** Read up to 10:00, then three new: the divider goes above `b` (index 2). */
const READ = [row("r1", 0), row("r2", 0)];
const ROWS = [...READ, row("b", 1), row("c", 2), row("d", 3)];

interface Props {
  rows: readonly NewMessagesRow[];
  mark: NewMessagesMark | null;
  hasOlder?: boolean;
  isLoadingOlder?: boolean;
  holdLanding?: boolean;
  channelKey?: string;
}

function setup(initial: Props) {
  const scrollToRow = vi.fn();
  const loadOlder = vi.fn();
  const onMarkRead = vi.fn();
  const hook = renderHook(
    (props: Props) =>
      useNewMessages({
        channelKey: props.channelKey ?? "chan-1",
        mark: props.mark,
        rows: props.rows,
        hasOlder: props.hasOlder ?? true,
        isLoadingOlder: props.isLoadingOlder ?? false,
        olderError: false,
        scrollToRow,
        loadOlder,
        onMarkRead,
        holdLanding: props.holdLanding,
      }),
    { initialProps: initial },
  );
  const show = (first: number, last: number) =>
    act(() => hook.result.current.reportRange(first, last));
  return { ...hook, scrollToRow, loadOlder, onMarkRead, show };
}

describe("useNewMessages opening (#6052)", () => {
  it("opens on the divider when the rows draw", () => {
    const { scrollToRow, result } = setup({ rows: ROWS, mark: MARK });
    expect(result.current.dividerIndex).toBe(2);
    expect(scrollToRow).toHaveBeenCalledExactlyOnceWith(2);
  });

  it("opens on it when the counts answer after the rows drew", () => {
    const view = setup({ rows: ROWS, mark: null });
    view.show(3, 4);
    expect(view.scrollToRow).not.toHaveBeenCalled();

    view.rerender({ rows: ROWS, mark: MARK });
    expect(view.scrollToRow).toHaveBeenCalledExactlyOnceWith(2);
  });

  it("opens on it when the unread rows arrive after a cached page", () => {
    // A cached page from before the cursor, then the backfill.
    const view = setup({ rows: READ, mark: MARK });
    view.show(0, 1);
    expect(view.scrollToRow).not.toHaveBeenCalled();

    view.rerender({ rows: ROWS, mark: MARK });
    expect(view.scrollToRow).toHaveBeenCalledExactlyOnceWith(2);
  });

  it("leaves a member who already scrolled away where they are", () => {
    const view = setup({ rows: ROWS, mark: null });
    view.show(0, 1);
    view.rerender({ rows: ROWS, mark: MARK });
    expect(view.scrollToRow).not.toHaveBeenCalled();
  });

  it("leaves the open to a jump to one message", () => {
    const view = setup({ rows: ROWS, mark: MARK, holdLanding: true });
    expect(view.scrollToRow).not.toHaveBeenCalled();
    expect(view.result.current.dividerKey).toBe("b");
  });

  it("opens only once a visit", () => {
    const view = setup({ rows: ROWS, mark: MARK });
    view.rerender({ rows: [...ROWS, row("e", 9)], mark: MARK });
    expect(view.scrollToRow).toHaveBeenCalledTimes(1);
  });

  it("pages back for a divider older than the loaded rows, then opens on it", () => {
    const newest = ROWS.slice(2);
    const view = setup({ rows: newest, mark: MARK });
    expect(view.loadOlder).toHaveBeenCalledTimes(1);
    expect(view.scrollToRow).not.toHaveBeenCalled();

    view.rerender({ rows: newest, mark: MARK, isLoadingOlder: true });
    view.rerender({ rows: ROWS, mark: MARK, isLoadingOlder: false });
    expect(view.scrollToRow).toHaveBeenCalledExactlyOnceWith(2);
    expect(view.loadOlder).toHaveBeenCalledTimes(1);
  });

  it("calls the open's paging off when the member scrolls meanwhile", () => {
    const newest = ROWS.slice(2);
    const view = setup({ rows: newest, mark: MARK, isLoadingOlder: false });
    view.show(0, 1);
    view.rerender({ rows: newest, mark: MARK, isLoadingOlder: true });
    view.rerender({ rows: ROWS, mark: MARK, isLoadingOlder: false });
    expect(view.scrollToRow).not.toHaveBeenCalled();
  });
});

describe("useNewMessages pill (#6052)", () => {
  it("points up once the member reads down past the divider", () => {
    const view = setup({ rows: ROWS, mark: MARK });
    view.show(2, 3);
    expect(view.result.current.direction).toBeNull();
    view.show(3, 3);
    expect(view.result.current.direction).toBe("up");
  });

  it("does not retire on a divider seen short of the newest message", () => {
    // The divider on screen, the newest row below: not read through.
    const view = setup({ rows: ROWS, mark: MARK });
    view.show(1, 3);
    view.show(4, 4);
    // Now at the newest, having seen it: retired.
    expect(view.result.current.direction).toBeNull();

    const other = setup({ rows: ROWS, mark: MARK });
    other.show(1, 3);
    other.show(3, 3);
    expect(other.result.current.direction).toBe("up");
  });

  it("shows at once for a mark that lands on a list already on screen", () => {
    const view = setup({ rows: ROWS, mark: null });
    view.show(4, 4);
    view.rerender({ rows: ROWS, mark: MARK });
    // It opened on the divider, but until the list reports again the screen
    // last reported is what holds: the divider above it.
    expect(view.result.current.direction).toBe("up");
  });

  it("pages back on a tap up to its budget, then stops", () => {
    let rows: NewMessagesRow[] = [row("x0", 30), row("x1", 31)];
    const view = setup({ rows, mark: MARK, holdLanding: true });
    act(() => view.result.current.jump());
    for (let page = 1; page <= NEW_MESSAGES_SEEK_MAX_PAGES + 3; page++) {
      view.rerender({
        rows,
        mark: MARK,
        holdLanding: true,
        isLoadingOlder: true,
      });
      rows = [row(`p${page}`, 20), ...rows];
      view.rerender({ rows, mark: MARK, holdLanding: true });
    }
    expect(view.loadOlder).toHaveBeenCalledTimes(NEW_MESSAGES_SEEK_MAX_PAGES);
    expect(view.scrollToRow).not.toHaveBeenCalled();
  });

  it("Mark as read takes the divider away and says so", () => {
    const view = setup({ rows: ROWS, mark: MARK });
    act(() => view.result.current.markRead());
    expect(view.result.current.dividerKey).toBeNull();
    expect(view.onMarkRead).toHaveBeenCalledTimes(1);
  });

  it("starts afresh in another channel", () => {
    const view = setup({ rows: ROWS, mark: MARK });
    view.show(4, 4);
    act(() => view.result.current.markRead());
    view.rerender({ rows: ROWS, mark: { ...MARK }, channelKey: "chan-2" });
    expect(view.result.current.dividerKey).toBe("b");
    expect(view.scrollToRow).toHaveBeenCalledTimes(2);
  });
});
