import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ADDRESS_FROM_KEY,
  addressWith,
  closeAddress,
  closeToAddress,
  consumeAddressParam,
  pushAddress,
  pushAddressHref,
  replaceAddress,
} from "./address";

function here(): string {
  return `${window.location.pathname}${window.location.search}`;
}

describe("addressWith", () => {
  it("merges a parameter and keeps the rest", () => {
    expect(addressWith("/events?day=2026-11-30", { event: "e1" })).toBe(
      "/events?day=2026-11-30&event=e1",
    );
  });
  it("removes a parameter set to null or empty", () => {
    expect(addressWith("/events?day=d&event=e1", { event: null })).toBe(
      "/events?day=d",
    );
    expect(addressWith("/events?event=e1", { event: "" })).toBe("/events");
  });
});

describe("moving the address", () => {
  beforeEach(() => {
    window.history.replaceState({ __NA: true, kept: 1 }, "", "/events?day=d");
  });
  afterEach(() => vi.restoreAllMocks());

  it("opening merges the parameter and pushes, marked with where it came from", () => {
    const push = vi.spyOn(window.history, "pushState");
    pushAddress({ event: "e1" });
    expect(push).toHaveBeenCalledTimes(1);
    expect(here()).toBe("/events?day=d&event=e1");
    // Our own state, without Next's `__NA`, so Next's router hears of it.
    expect(window.history.state).toEqual({
      kept: 1,
      [ADDRESS_FROM_KEY]: ["/events?day=d"],
    });
  });

  it("opening what is already open pushes nothing", () => {
    const push = vi.spyOn(window.history, "pushState");
    pushAddress({ day: "d" });
    expect(push).not.toHaveBeenCalled();
  });

  it("closing an entry this tab pushed goes Back", () => {
    pushAddress({ event: "e1" });
    const go = vi.spyOn(window.history, "go").mockImplementation(() => {});
    const replace = vi.spyOn(window.history, "replaceState");
    closeAddress(["event"]);
    expect(go).toHaveBeenCalledWith(-1);
    expect(replace).not.toHaveBeenCalled();
  });

  it("closing two layers this tab pushed goes Back two entries", () => {
    pushAddress({ event: "e1" });
    pushAddress({ edit: "1" });
    const go = vi.spyOn(window.history, "go").mockImplementation(() => {});
    closeAddress(["event", "edit"]);
    expect(go).toHaveBeenCalledWith(-2);
  });

  it("compares addresses however the query was spelled", () => {
    window.history.replaceState({}, "", "/activity?x=a%20b");
    pushAddress({ task: "t1" });
    const go = vi.spyOn(window.history, "go").mockImplementation(() => {});
    closeAddress(["task"]);
    expect(go).toHaveBeenCalledWith(-1);
  });

  it("treats undefined as removing the parameter", () => {
    pushAddress({ day: undefined });
    expect(here()).toBe("/events");
  });

  it("closing an entry that came from a link replaces it with the parent", () => {
    window.history.replaceState({}, "", "/events?day=d&event=e1&edit=1");
    const back = vi.spyOn(window.history, "back");
    closeAddress(["event", "edit"]);
    expect(back).not.toHaveBeenCalled();
    expect(here()).toBe("/events?day=d");
  });

  it("closing a pushed entry to somewhere other than where it came from replaces", () => {
    pushAddress({ event: "e1" });
    replaceAddress({ day: "d2" });
    const back = vi.spyOn(window.history, "back");
    closeAddress(["event"]);
    expect(back).not.toHaveBeenCalled();
    expect(here()).toBe("/events?day=d2");
  });

  it("replace mode replaces, keeps the other parameters and the mark", () => {
    pushAddress({ event: "e1" });
    const push = vi.spyOn(window.history, "pushState");
    replaceAddress({ day: "d2" });
    expect(push).not.toHaveBeenCalled();
    expect(here()).toBe("/events?day=d2&event=e1");
    expect(window.history.state[ADDRESS_FROM_KEY]).toEqual(["/events?day=d"]);
    // Our own state, without Next's `__NA`, so Next's router hears of it.
    expect(window.history.state.__NA).toBeUndefined();
  });

  it("dropping a parameter back to the entry underneath goes Back", () => {
    pushAddress({ event: "gone" });
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const replace = vi.spyOn(window.history, "replaceState");
    replaceAddress({ event: null });
    expect(back).toHaveBeenCalledTimes(1);
    expect(replace).not.toHaveBeenCalled();
  });

  it("one-shot removal replaces and keeps the other parameters", () => {
    window.history.replaceState({ __NA: true }, "", "/events?day=d&new=1");
    const replace = vi.spyOn(window.history, "replaceState");
    const push = vi.spyOn(window.history, "pushState");
    consumeAddressParam("new");
    expect(replace).toHaveBeenCalledTimes(1);
    expect(window.history.state.__NA).toBeUndefined();
    expect(push).not.toHaveBeenCalled();
    expect(here()).toBe("/events?day=d");
  });

  it("one-shot removal leaves a newer mark alone", () => {
    window.history.replaceState({}, "", "/settings?setting=b");
    consumeAddressParam("setting", "a");
    expect(here()).toBe("/settings?setting=b");
  });
});

describe("a page addressed in full (Chapter settings)", () => {
  beforeEach(() => {
    window.history.replaceState({ __NA: true }, "", "/settings?tab=roles");
  });
  afterEach(() => vi.restoreAllMocks());

  it("opening pushes the whole address, marked with where it came from", () => {
    pushAddressHref("/settings?tab=roles&tier=t1");
    expect(here()).toBe("/settings?tab=roles&tier=t1");
    expect(window.history.state).toEqual({
      [ADDRESS_FROM_KEY]: ["/settings?tab=roles"],
    });
  });

  it("opening the address already shown pushes nothing", () => {
    const push = vi.spyOn(window.history, "pushState");
    pushAddressHref("/settings?tab=roles");
    expect(push).not.toHaveBeenCalled();
  });

  it("closing to an address this tab pushed over goes Back that many entries", () => {
    pushAddressHref("/settings?tab=roles&tier=t1");
    pushAddressHref("/settings?tab=roles&tier=t1&role=r1");
    const go = vi.spyOn(window.history, "go").mockImplementation(() => {});
    closeToAddress("/settings?tab=roles");
    expect(go).toHaveBeenCalledWith(-2);
    closeToAddress("/settings?tab=roles&tier=t1");
    expect(go).toHaveBeenLastCalledWith(-1);
  });

  it("records and matches addresses without a fragment the skip link left", () => {
    window.history.replaceState(null, "", "/settings?tab=org#main-content");
    pushAddressHref("/settings?tab=org&page=accent");
    expect(window.history.state).toEqual({
      [ADDRESS_FROM_KEY]: ["/settings?tab=org"],
    });
    const go = vi.spyOn(window.history, "go").mockImplementation(() => {});
    closeToAddress("/settings?tab=org");
    expect(go).toHaveBeenCalledWith(-1);
  });

  it("closing a page that arrived from a link replaces it with its parent", () => {
    window.history.replaceState(null, "", "/settings?tab=roles&role=r1");
    const go = vi.spyOn(window.history, "go");
    closeToAddress("/settings?tab=roles");
    expect(go).not.toHaveBeenCalled();
    expect(here()).toBe("/settings?tab=roles");
  });
});
