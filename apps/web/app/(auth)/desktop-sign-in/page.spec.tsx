// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

let search = "";
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(search),
}));

import DesktopSignInPage from "./page";

const assign = vi.fn();
vi.stubGlobal("location", { ...window.location, assign });

afterEach(() => {
  cleanup();
  assign.mockReset();
});

describe("/desktop-sign-in", () => {
  it("opens the desktop app with the code, and offers the same link to press", () => {
    search = "next=%2Fchat&intent=sign-in&code=abc-123";
    render(<DesktopSignInPage />);

    const link = "frapp-desktop://auth/callback?code=abc-123&next=%2Fchat&intent=sign-in";
    expect(assign).toHaveBeenCalledWith(link);
    expect(screen.getByRole("heading", { name: "Opening Frapp" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open Frapp" }).getAttribute("href")).toBe(link);
  });

  it("says the sign-in didn't finish when the provider returned no code", () => {
    search = "error=access_denied&next=%2Fchat";
    render(<DesktopSignInPage />);

    expect(assign).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Sign-in didn't finish" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Open Frapp" })).toBeNull();
  });
});
