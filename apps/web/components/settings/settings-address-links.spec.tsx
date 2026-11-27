import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ADDRESS_FROM_KEY } from "@/lib/address/address";
import { SettingsAddressLinks } from "./settings-address-links";
import { SettingsBackLink } from "./settings-subpage";

function here(): string {
  return `${window.location.pathname}${window.location.search}`;
}

describe("SettingsAddressLinks (#6049)", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/settings?tab=roles");
  });
  afterEach(() => vi.restoreAllMocks());

  it("pushes a row's page, marked with the page it opened from", () => {
    render(
      <SettingsAddressLinks>
        <a href="/settings?tab=roles&role=r1">Treasurer</a>
      </SettingsAddressLinks>,
    );
    const push = vi.spyOn(window.history, "pushState");
    fireEvent.click(screen.getByRole("link", { name: "Treasurer" }));
    expect(push).toHaveBeenCalledTimes(1);
    expect(here()).toBe("/settings?tab=roles&role=r1");
    expect(window.history.state[ADDRESS_FROM_KEY]).toEqual([
      "/settings?tab=roles",
    ]);
  });

  it("goes Back from a page this tab opened, so Forward reopens it", () => {
    window.history.pushState(
      { [ADDRESS_FROM_KEY]: ["/settings?tab=roles"] },
      "",
      "/settings?tab=roles&role=r1",
    );
    render(
      <SettingsAddressLinks>
        <SettingsBackLink href="/settings?tab=roles" label="Roles and groups" />
      </SettingsAddressLinks>,
    );
    const go = vi.spyOn(window.history, "go").mockImplementation(() => {});
    fireEvent.click(screen.getByRole("link", { name: "Roles and groups" }));
    expect(go).toHaveBeenCalledWith(-1);
  });

  it("replaces a page that arrived from a link with its parent", () => {
    window.history.replaceState({}, "", "/settings?tab=roles&role=r1");
    render(
      <SettingsAddressLinks>
        <SettingsBackLink href="/settings?tab=roles" label="Roles and groups" />
      </SettingsAddressLinks>,
    );
    const push = vi.spyOn(window.history, "pushState");
    const go = vi.spyOn(window.history, "go");
    fireEvent.click(screen.getByRole("link", { name: "Roles and groups" }));
    expect(push).not.toHaveBeenCalled();
    expect(go).not.toHaveBeenCalled();
    expect(here()).toBe("/settings?tab=roles");
  });

  it("leaves a modified click, another page and an anchor to the browser", () => {
    render(
      <SettingsAddressLinks>
        <a href="/settings?tab=roles&role=r1">Treasurer</a>
        <a href="/chat?channel=c1">Exec</a>
        <a href="#zones">Zones</a>
      </SettingsAddressLinks>,
    );
    const push = vi.spyOn(window.history, "pushState");
    fireEvent.click(screen.getByRole("link", { name: "Treasurer" }), {
      metaKey: true,
    });
    fireEvent.click(screen.getByRole("link", { name: "Exec" }));
    fireEvent.click(screen.getByRole("link", { name: "Zones" }));
    expect(push).not.toHaveBeenCalled();
  });
});
