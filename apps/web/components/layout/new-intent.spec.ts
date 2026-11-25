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
    // A page that is a panel carries its own query (#5950).
    expect(newIntentHref("/profile?open=service")).toBe(
      "/profile?open=service&new=1",
    );
  });

  it("opens the form once the page is ready, once, and clears the mark", () => {
    window.history.replaceState(null, "", "/events?new=1&view=week");
    const open = vi.fn();
    const { rerender } = renderHook(({ ready }) => useNewIntent(open, ready), {
      initialProps: { ready: false },
    });
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

  // #5949: Documents holds two forms, Upload (`1`) and New minutes.
  it("opens only the form the mark names, where a page holds two", () => {
    expect(newIntentHref("/documents?type=minutes", "minutes")).toBe(
      "/documents?type=minutes&new=minutes",
    );
    window.history.replaceState(
      null,
      "",
      "/documents?type=minutes&new=minutes",
    );
    const upload = vi.fn();
    const minutes = vi.fn();
    renderHook(() => {
      useNewIntent(upload, true);
      useNewIntent(minutes, true, undefined, "minutes");
    });
    expect(upload).not.toHaveBeenCalled();
    expect(minutes).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe("?type=minutes");
  });
});
