import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usePendingSetting } from "./use-pending-setting";

/** A save the test settles by hand. */
function deferred() {
  let settle!: (ok: boolean) => void;
  const promise = new Promise<boolean>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
}

describe("usePendingSetting", () => {
  it("shows the pick while it saves, then the stored value", async () => {
    const save = deferred();
    const { result, rerender } = renderHook(
      ({ stored }) => usePendingSetting(stored, () => save.promise),
      { initialProps: { stored: false } },
    );
    let done!: Promise<boolean>;
    act(() => {
      done = result.current[1](true);
    });
    expect(result.current[0]).toBe(true);
    expect(result.current[2]).toBe(true);
    // The re-read lands before the save resolves (its mutation returns it).
    rerender({ stored: true });
    await act(async () => {
      save.settle(true);
      await done;
    });
    expect(result.current[0]).toBe(true);
    expect(result.current[2]).toBe(false);
  });

  it("falls back to the stored value when the save is refused", async () => {
    const save = deferred();
    const { result } = renderHook(() =>
      usePendingSetting("red", () => save.promise),
    );
    let done!: Promise<boolean>;
    act(() => {
      done = result.current[1]("blue");
    });
    expect(result.current[0]).toBe("blue");
    await act(async () => {
      save.settle(false);
      expect(await done).toBe(false);
    });
    expect(result.current[0]).toBe("red");
  });

  it("keeps the latest pick while an earlier one's reply comes in", async () => {
    const first = deferred();
    const second = deferred();
    const saves = [first, second];
    const { result } = renderHook(() =>
      usePendingSetting(0, () => saves.shift()!.promise),
    );
    let one!: Promise<boolean>;
    let two!: Promise<boolean>;
    act(() => {
      one = result.current[1](1);
    });
    act(() => {
      two = result.current[1](2);
    });
    await act(async () => {
      first.settle(true);
      await one;
    });
    expect(result.current[0]).toBe(2);
    await act(async () => {
      second.settle(false);
      await two;
    });
    expect(result.current[0]).toBe(0);
  });
});

describe("usePendingSetting's order (#6033)", () => {
  it("sends a second pick only once the first has settled", async () => {
    const first = deferred();
    const second = deferred();
    const saves = [first, second];
    const send = vi.fn(() => saves.shift()!.promise);
    const { result } = renderHook(() => usePendingSetting(false, send));
    let one!: Promise<boolean>;
    let two!: Promise<boolean>;
    act(() => {
      one = result.current[1](true);
    });
    act(() => {
      two = result.current[1](false);
    });
    // The second flip waits, so the server can't apply it before the first.
    expect(send.mock.calls).toEqual([[true]]);
    expect(result.current[0]).toBe(false);
    await act(async () => {
      first.settle(true);
      await one;
    });
    expect(send.mock.calls).toEqual([[true], [false]]);
    await act(async () => {
      second.settle(true);
      expect(await two).toBe(true);
    });
  });

  it("skips a pick a newer one replaced before its turn, and answers it with the newer one's result", async () => {
    const first = deferred();
    const third = deferred();
    const saves = [first, third];
    const send = vi.fn(() => saves.shift()!.promise);
    const { result } = renderHook(() => usePendingSetting("red", send));
    const picks: Promise<boolean>[] = [];
    act(() => {
      picks.push(result.current[1]("blue"));
    });
    act(() => {
      picks.push(result.current[1]("green"));
    });
    act(() => {
      picks.push(result.current[1]("gold"));
    });
    // The latest pick shows while the first is still saving.
    expect(result.current[0]).toBe("gold");
    await act(async () => {
      first.settle(true);
      await picks[0];
    });
    expect(send.mock.calls).toEqual([["blue"], ["gold"]]);
    await act(async () => {
      third.settle(false);
      expect(await picks[1]).toBe(false);
      expect(await picks[2]).toBe(false);
    });
    expect(result.current[0]).toBe("red");
  });

  it("keeps going after a send that throws", async () => {
    const send = vi
      .fn<(next: number) => Promise<boolean>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(true);
    const { result } = renderHook(() => usePendingSetting<number>(0, send));
    let one!: Promise<boolean>;
    let two!: Promise<boolean>;
    act(() => {
      one = result.current[1](1);
      two = result.current[1](2);
    });
    await act(async () => {
      await expect(one).rejects.toThrow("offline");
      expect(await two).toBe(true);
    });
    expect(send.mock.calls).toEqual([[1], [2]]);
  });
});
