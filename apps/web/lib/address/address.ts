/**
 * The web shell's addresses (#6034; `spec/ui/web-dashboard/README.md`
 * § Addresses owns the rules). The pure half: what an address becomes, and
 * the History API calls that move it. `use-address-params.ts` is the hook a
 * page reads them through.
 *
 * Next folds `pushState` and `replaceState` into its router, so
 * `useSearchParams` follows these calls with no navigation, no server read
 * and no scroll ("Native History API" in Next's linking guide). It does that
 * only for a state object without its own `__NA` mark: one carrying `__NA`
 * passes straight through and the router never hears of the new address.
 * So the state written here is ours, minus Next's marks, and Next copies its
 * own back on.
 */

/**
 * A change to the query: a value sets the parameter; `null`, `undefined` or
 * an empty string removes it.
 */
export type AddressChanges = Readonly<
  Record<string, string | null | undefined>
>;

/**
 * The state key that marks an entry this tab pushed to open something: the
 * addresses of the entries under it that this tab pushed it over, oldest
 * first, the last being the entry right under it. Closing to one of them goes
 * Back that many entries, so Forward reopens what was closed, even when two
 * layers close at once (an event with its editor open).
 */
export const ADDRESS_FROM_KEY = "frappAddressFrom";

/** The relative address (`/events?day=…`) of a URL. */
function relative(url: URL): string {
  return `${url.pathname}${url.search}${url.hash}`;
}

/** `href` with `changes` merged into its query; the other parameters stay. */
export function addressWith(href: string, changes: AddressChanges): string {
  const url = new URL(href, "http://frapp.invalid");
  for (const [name, value] of Object.entries(changes)) {
    if (value === null || value === undefined || value === "") {
      url.searchParams.delete(name);
    } else url.searchParams.set(name, value);
  }
  // Re-serialized even with no change, so two spellings compare equal.
  url.search = url.searchParams.toString();
  return relative(url);
}

/**
 * The current address, serialized the way `addressWith` writes one (`+` for a
 * space, `?flag=`), so the two compare equal.
 */
function currentAddress(): string {
  return addressWith(relative(new URL(window.location.href)), {});
}

/**
 * An address without its fragment: the chain records and compares these, so
 * a `#main-content` the skip link left on the address can't make a close
 * miss the entry it was opened over.
 */
function withoutHash(address: string): string {
  const at = address.indexOf("#");
  return at === -1 ? address : address.slice(0, at);
}

/** The addresses this tab pushed the current entry over (`ADDRESS_FROM_KEY`). */
function pushedOver(state: Record<string, unknown>): string[] {
  const chain = state[ADDRESS_FROM_KEY];
  return Array.isArray(chain)
    ? chain.filter((entry): entry is string => typeof entry === "string")
    : [];
}

/** The current entry's own state, without Next's marks (see the header). */
function ownState(): Record<string, unknown> {
  const state = window.history.state as Record<string, unknown> | null;
  const own: Record<string, unknown> = { ...state };
  delete own.__NA;
  delete own._N;
  delete own.__PRIVATE_NEXTJS_INTERNALS_TREE;
  return own;
}

/**
 * Opens something: merges `changes` into the address and pushes it, marked
 * with the address it was pushed from. Does nothing when nothing changes.
 */
export function pushAddress(changes: AddressChanges): void {
  const from = currentAddress();
  pushTo(from, addressWith(from, changes));
}

/** Pushes `to` over `from`, marked with `from`, unless they are the same. */
function pushTo(from: string, to: string): void {
  if (to === from) return;
  const state = ownState();
  window.history.pushState(
    { ...state, [ADDRESS_FROM_KEY]: [...pushedOver(state), withoutHash(from)] },
    "",
    to,
  );
}

/**
 * Moves through something in place (a day, a month, a sort, a one-shot mark
 * acted on, a dead id dropped): merges `changes` and replaces the entry,
 * keeping its mark. When that would make it the same address as the entry
 * this tab pushed it over (a dead record opened from its list), it goes
 * Back instead, so no
 * Back press lands on an identical address.
 */
export function replaceAddress(changes: AddressChanges): void {
  const from = currentAddress();
  const to = addressWith(from, changes);
  if (to === from) return;
  const state = ownState();
  if (pushedOver(state).at(-1) === withoutHash(to)) {
    window.history.back();
    return;
  }
  window.history.replaceState(state, "", to);
}

/**
 * Closes something (its back arrow, X or Escape): the address without
 * `names`. When this tab pushed the current entry over that address, one
 * entry down or more, it goes Back to it, so Forward reopens what was closed. Otherwise (it arrived
 * from a link, a notification or another tab) it replaces the entry with
 * that address, so Back leaves the page as it would have.
 */
export function closeAddress(names: readonly string[]): void {
  const from = currentAddress();
  closeTo(
    from,
    addressWith(from, Object.fromEntries(names.map((name) => [name, null]))),
  );
}

/**
 * Closes from `from` to `to`: Back to it when this tab pushed the current
 * entry over it, one entry down or more, else a replace with it.
 */
function closeTo(from: string, to: string): void {
  if (to === from) return;
  const state = ownState();
  const chain = pushedOver(state);
  const at = chain.lastIndexOf(withoutHash(to));
  if (at !== -1) {
    window.history.go(at - chain.length);
    return;
  }
  window.history.replaceState(state, "", to);
}

/**
 * Takes a one-shot mark (`?new=1`, `&message=`, `&excuse=1`, `?setting=`)
 * off the address once it has been acted on, in place. With `expected`, only
 * while the mark still holds that value, so a newer mark isn't lost.
 */
export function consumeAddressParam(name: string, expected?: string): void {
  const value = new URL(window.location.href).searchParams.get(name);
  if (value === null) return;
  if (expected !== undefined && value !== expected) return;
  replaceAddress({ [name]: null });
}

/**
 * Moves an entry this tab has just pushed as a copy of the one under it (the
 * chat pane's same-address step below `lg`, `chat-shell.tsx`) to `changes`,
 * marked as pushed over the address under it, so closing it goes Back as for
 * any `pushAddress` entry, and one press is one step.
 */
export function replacePushedCopy(changes: AddressChanges): void {
  const from = currentAddress();
  const to = addressWith(from, changes);
  if (to === from) return;
  const state = ownState();
  window.history.replaceState(
    { ...state, [ADDRESS_FROM_KEY]: [...pushedOver(state), withoutHash(from)] },
    "",
    to,
  );
}

/**
 * Opens a page of the same route addressed in full (`href`, a Chapter
 * settings row's link): pushes it, marked with the address it was pushed
 * from, as `pushAddress` does for a change. Does nothing when `href` is the
 * address already.
 */
export function pushAddressHref(href: string): void {
  pushTo(currentAddress(), addressWith(href, {}));
}

/**
 * Closes a page to its parent addressed in full (`href`, a back arrow's
 * link): Back to it when this tab pushed the current entry over it, one
 * entry down or more, so Forward reopens what was closed; otherwise a
 * replace with it, so Back leaves as it would have. Same route only.
 */
export function closeToAddress(href: string): void {
  closeTo(currentAddress(), addressWith(href, {}));
}
