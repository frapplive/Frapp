import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The router's search params, kept in step with the History API as Next does.
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

import { useAddressParams, useDeadAddressParam } from "./use-address-params";

describe("useAddressParams", () => {
  beforeEach(() => window.history.replaceState({}, "", "/tasks?view=mine"));
  afterEach(() => vi.restoreAllMocks());

  it("reads its parameters from the address", () => {
    const { result } = renderHook(() => useAddressParams(["view", "task"]));
    expect(result.current.values).toEqual({ view: "mine", task: null });
  });

  it("opens by pushing and closes by going Back", () => {
    const { result } = renderHook(() => useAddressParams(["view", "task"]));
    const push = vi.spyOn(window.history, "pushState");
    act(() => result.current.open({ task: "t1" }));
    expect(push).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe("?view=mine&task=t1");
    const go = vi.spyOn(window.history, "go").mockImplementation(() => {});
    act(() => result.current.close(["task"]));
    expect(go).toHaveBeenCalledWith(-1);
  });

  it("opens in place in replace mode", () => {
    const { result } = renderHook(() => useAddressParams(["view"]));
    const push = vi.spyOn(window.history, "pushState");
    act(() => result.current.open({ view: "all" }, { replace: true }));
    expect(push).not.toHaveBeenCalled();
    expect(window.location.search).toBe("?view=all");
  });
});

describe("useDeadAddressParam", () => {
  it("replaces a dead id away and keeps its note", () => {
    window.history.replaceState({}, "", "/events?day=d&event=gone");
    const { result, rerender } = renderHook(
      ({ value, dead }) => useDeadAddressParam("event", value, dead),
      { initialProps: { value: "gone" as string | null, dead: false } },
    );
    expect(result.current).toBeNull();
    rerender({ value: "gone", dead: true });
    expect(result.current).toBe("gone");
    expect(window.location.search).toBe("?day=d");
    rerender({ value: null, dead: false });
    expect(result.current).toBe("gone");
    rerender({ value: "e2", dead: false });
    expect(result.current).toBeNull();
  });
});
