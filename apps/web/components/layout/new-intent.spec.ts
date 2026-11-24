import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { newIntentHref, useNewIntent } from "./new-intent";

/*
 * New's actions land on a page with `?new=1`, and the page opens its own form
 * once the member may use it, then takes the mark off the address (#5946).
 */
describe("useNewIntent", () => {
  afterEach(() => window.history.replaceState(null, "", "/"));

  it("builds the address for a page's form", () => {
    expect(newIntentHref("/events")).toBe("/events?new=1");
  });

  it("opens the form once the page is ready, once, and clears the mark", () => {
    window.history.replaceState(null, "", "/events?new=1&view=week");
    const open = vi.fn();
    const { rerender } = renderHook(
      ({ ready }) => useNewIntent(open, ready),
      { initialProps: { ready: false } },
    );
    expect(open).not.toHaveBeenCalled();
    rerender({ ready: true });
    expect(open).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe("?view=week");
    rerender({ ready: true });
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("does nothing on a page reached without the mark", () => {
    window.history.replaceState(null, "", "/events");
    const open = vi.fn();
    renderHook(() => useNewIntent(open, true));
    expect(open).not.toHaveBeenCalled();
  });

  it("follows a mounted panel's own read of the address", () => {
    window.history.replaceState(null, "", "/messages");
    const open = vi.fn();
    const { rerender } = renderHook(
      ({ asked }) => useNewIntent(open, true, asked),
      { initialProps: { asked: false } },
    );
    rerender({ asked: true });
    expect(open).toHaveBeenCalledTimes(1);
  });
});
