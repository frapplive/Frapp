import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
