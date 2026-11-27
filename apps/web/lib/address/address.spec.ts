import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ADDRESS_FROM_KEY,
  addressWith,
  closeAddress,
  consumeAddressParam,
  pushAddress,
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
      [ADDRESS_FROM_KEY]: "/events?day=d",
    });
  });

  it("opening what is already open pushes nothing", () => {
    const push = vi.spyOn(window.history, "pushState");
    pushAddress({ day: "d" });
    expect(push).not.toHaveBeenCalled();
  });

  it("closing an entry this tab pushed goes Back", () => {
    pushAddress({ event: "e1" });
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const replace = vi.spyOn(window.history, "replaceState");
    closeAddress(["event"]);
    expect(back).toHaveBeenCalledTimes(1);
    expect(replace).not.toHaveBeenCalled();
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
    expect(window.history.state[ADDRESS_FROM_KEY]).toBeUndefined();
  });

  it("replace mode replaces, keeps the other parameters and the mark", () => {
    pushAddress({ event: "e1" });
    const push = vi.spyOn(window.history, "pushState");
    replaceAddress({ day: "d2" });
    expect(push).not.toHaveBeenCalled();
    expect(here()).toBe("/events?day=d2&event=e1");
    expect(window.history.state[ADDRESS_FROM_KEY]).toBe("/events?day=d");
  });

  it("one-shot removal replaces and keeps the other parameters", () => {
    window.history.replaceState({}, "", "/events?day=d&new=1");
    const replace = vi.spyOn(window.history, "replaceState");
    const push = vi.spyOn(window.history, "pushState");
    consumeAddressParam("new");
    expect(replace).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
    expect(here()).toBe("/events?day=d");
  });

  it("one-shot removal leaves a newer mark alone", () => {
    window.history.replaceState({}, "", "/settings?setting=b");
    consumeAddressParam("setting", "a");
    expect(here()).toBe("/settings?setting=b");
  });
});
