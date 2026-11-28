import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SubscriptionGate } from "@/components/shared/subscription-gate";

// The router's search params follow the History API, as Next's do.
vi.mock("next/navigation", async () => ({
  useSearchParams: (await import("@/tests/address-search-params"))
    .useAddressSearchParams,
}));

import { useAddressArrival, useAddressedDialog } from "./use-addressed-dialog";

function gate(allowed: boolean): SubscriptionGate {
  return {
    allowed,
    isPending: false,
    isOffline: false,
    state: { allowed } as SubscriptionGate["state"],
    noticeId: "notice",
    noticeRef: { current: null },
    controlProps: () => ({}),
  } as unknown as SubscriptionGate;
}

function render(allowed = true, onArrive = vi.fn()) {
  const hook = renderHook(
    ({ open }) => {
      const dialog = useAddressedDialog(gate(open), "panel", "upload");
      useAddressArrival(dialog, onArrive);
      return dialog;
    },
    { initialProps: { open: allowed } },
  );
  return { ...hook, onArrive };
}

describe("useAddressedDialog (#6157)", () => {
  beforeEach(() => window.history.replaceState(null, "", "/documents"));
  afterEach(() => vi.restoreAllMocks());

  it("opens by pushing ?panel=, and closing goes Back", () => {
    const { result, onArrive } = render();
    expect(result.current.open).toBe(false);
    const push = vi.spyOn(window.history, "pushState");
    act(() => result.current.setOpen(true));
    expect(push).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe("?panel=upload");
    expect(result.current.dialogProps.open).toBe(true);
    // Our own open isn't an arrival: the opener prepared the panel itself.
    expect(onArrive).not.toHaveBeenCalled();
    const go = vi.spyOn(window.history, "go").mockImplementation(() => {});
    act(() => result.current.dialogProps.onOpenChange(false));
    expect(go).toHaveBeenCalledWith(-1);
  });

  it("opens in place when asked to, as New's ?new=1 is acted on", () => {
    window.history.replaceState(null, "", "/documents?new=1");
    const { result } = render();
    const push = vi.spyOn(window.history, "pushState");
    act(() => result.current.setOpen(true, { replace: true }));
    expect(push).not.toHaveBeenCalled();
    expect(window.location.search).toBe("?new=1&panel=upload");
  });

  it("arrives open from the address (a reload, Forward) and says so once", () => {
    window.history.replaceState(null, "", "/documents?panel=upload");
    const { result, onArrive, rerender } = render();
    expect(result.current.open).toBe(true);
    expect(onArrive).toHaveBeenCalledTimes(1);
    rerender({ open: true });
    expect(onArrive).toHaveBeenCalledTimes(1);
  });

  it("is shut by another panel's value", () => {
    window.history.replaceState(null, "", "/documents?panel=import");
    const { result, onArrive } = render();
    expect(result.current.open).toBe(false);
    expect(onArrive).not.toHaveBeenCalled();
  });

  it("closes only its own panel", () => {
    const { result } = render();
    act(() => result.current.setOpen(true));
    // Back, then another panel opened over the page.
    act(() => {
      window.history.replaceState(null, "", "/documents?panel=import");
    });
    const go = vi.spyOn(window.history, "go");
    act(() => result.current.setOpen(false));
    expect(go).not.toHaveBeenCalled();
    expect(window.location.search).toBe("?panel=import");
  });

  it("refuses to open while the gate blocks, and closes one the address opened", () => {
    const { result } = render(false);
    act(() => result.current.setOpen(true));
    expect(window.location.search).toBe("");

    window.history.replaceState(null, "", "/documents?panel=upload");
    render(false);
    // Arrived from the address, so the close replaces rather than goes Back.
    expect(window.location.search).toBe("");
  });
});
