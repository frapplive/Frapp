import { useMemo, useSyncExternalStore } from "react";

/**
 * `useSearchParams` for a spec's `next/navigation` mock that follows the
 * History API the way Next's does (`lib/address/address.ts`), so a page whose
 * open folder, record or view is its address (spec § Addresses) moves as it
 * would in the app:
 *
 *   vi.mock("next/navigation", async () => ({
 *     useSearchParams: (await import("@/tests/address-search-params"))
 *       .useAddressSearchParams,
 *     …
 *   }));
 *
 * Reset the address between tests with `setAddress`.
 */
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
let patched = false;

function subscribe(listener: () => void) {
  if (!patched) {
    patched = true;
    for (const key of ["pushState", "replaceState"] as const) {
      const original = window.history[key].bind(window.history);
      window.history[key] = (...args: Parameters<History["pushState"]>) => {
        original(...args);
        notify();
      };
    }
    window.addEventListener("popstate", notify);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useAddressSearchParams(): URLSearchParams {
  const search = useSyncExternalStore(subscribe, () => window.location.search);
  return useMemo(() => new URLSearchParams(search), [search]);
}

/** Puts the page on `href` (`/activity?view=everyone`) without a navigation. */
export function setAddress(href: string): void {
  window.history.replaceState(null, "", href);
  notify();
}
