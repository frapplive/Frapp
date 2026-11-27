import type { MouseEvent } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ADDRESS_FROM_KEY } from "@/lib/address/address";
import { openStandingDoor } from "./open-standing-door";

function click(init: Partial<MouseEvent<HTMLAnchorElement>> = {}) {
  const preventDefault = vi.fn();
  const event = {
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    button: 0,
    preventDefault,
    ...init,
  } as unknown as MouseEvent<HTMLAnchorElement>;
  return { event, preventDefault };
}

describe("openStandingDoor (#6048)", () => {
  afterEach(() => window.history.replaceState(null, "", "/"));

  it("pushes the door on the profile, marked so its close goes Back", () => {
    window.history.replaceState(null, "", "/profile");
    const { event, preventDefault } = click();
    openStandingDoor(event, "points");
    expect(preventDefault).toHaveBeenCalled();
    expect(window.location.search).toBe("?open=points");
    expect(window.history.state[ADDRESS_FROM_KEY]).toEqual(["/profile"]);
  });

  it("leaves the link alone off the profile and for a new-tab click", () => {
    window.history.replaceState(null, "", "/activity");
    const away = click();
    openStandingDoor(away.event, "service");
    expect(away.preventDefault).not.toHaveBeenCalled();

    window.history.replaceState(null, "", "/profile");
    const newTab = click({ metaKey: true });
    openStandingDoor(newTab.event, "service");
    expect(newTab.preventDefault).not.toHaveBeenCalled();
    expect(window.location.search).toBe("");
  });
});
