import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Read receipts has its own spec (`read-receipts-section.spec.tsx`).
vi.mock("@/components/personal-settings/read-receipts-section", () => ({
  ReadReceiptsSection: () => <p>read receipts section</p>,
}));

import { ChatSection } from "./chat-section";

/** Settings → Chat (#6032; "Appearance and chat" until then). */
describe("ChatSection", () => {
  it("offers the densities under Density, then Read receipts (#2252)", () => {
    const { container } = render(<ChatSection />);

    expect(
      screen.getByRole("heading", { name: "Density" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Cozy/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Compact/ })).toBeInTheDocument();
    expect(screen.getByText("Applies on this browser.")).toBeInTheDocument();
    expect(screen.getByText("read receipts section")).toBeInTheDocument();
    // Settings search lands on the density group (`chat-density`).
    expect(container.querySelector("#chat-density")).not.toBeNull();
  });
});
