import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  isPaintableRoleColor,
  pickRoleColor,
  ROLE_COLOR_SWATCHES,
} from "@repo/validation";

import { RoleColorPicker } from "./role-color-picker";

function Harness({
  initial,
  onChange,
  chapterColors,
}: {
  initial: string | null;
  onChange?: (next: string | null) => void;
  chapterColors?: readonly string[];
}) {
  const [value, setValue] = useState<string | null>(initial);
  return (
    <>
      <span id="color-label">Color</span>
      <RoleColorPicker
        labelId="color-label"
        value={value}
        onChange={(next) => {
          setValue(next);
          onChange?.(next);
        }}
        previewName="Social chair"
        memberName="Marcus Ellison"
        chapterColors={chapterColors}
      />
    </>
  );
}

function openCustom() {
  fireEvent.click(screen.getByRole("button", { name: /^Custom color/ }));
}

describe("RoleColorPicker", () => {
  it("offers all thirty swatches and No color, and picks and clears one", () => {
    const onChange = vi.fn();
    render(<Harness initial={null} onChange={onChange} />);
    for (const swatch of ROLE_COLOR_SWATCHES) {
      expect(
        screen.getByRole("button", { name: swatch.label }),
      ).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "No color" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "Bright sky" }));
    expect(onChange).toHaveBeenLastCalledWith("#00B2E0");
    expect(screen.getByRole("button", { name: "Bright sky" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "No color" }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("previews the color on a role chip and a name in chat", () => {
    render(<Harness initial="#3DD6C4" />);
    const preview = screen.getByRole("group", { name: "Preview" });
    expect(within(preview).getByText("Social chair")).toBeVisible();
    expect(within(preview).getByText("Marcus Ellison")).toHaveStyle({
      color: "#3DD6C4",
    });
  });

  it("offers the chapter's own colors", () => {
    const onChange = vi.fn();
    render(
      <Harness
        initial={null}
        onChange={onChange}
        chapterColors={["#10B981"]}
      />,
    );
    const row = screen.getByRole("group", { name: "In your chapter" });
    fireEvent.click(
      within(row).getByRole("button", { name: "Custom color #10B981" }),
    );
    expect(onChange).toHaveBeenLastCalledWith("#10B981");
  });

  it("saves a typed hex as it is when it already reads", () => {
    const onChange = vi.fn();
    render(<Harness initial={null} onChange={onChange} />);
    openCustom();
    const field = screen.getByLabelText("Hex");
    fireEvent.change(field, { target: { value: "10b981" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith("#10B981");
    expect(screen.queryByText(/Made lighter/)).toBeNull();
  });

  it("lightens a dark hex to the nearest readable shade and says so", () => {
    const onChange = vi.fn();
    render(<Harness initial={null} onChange={onChange} />);
    openCustom();
    const field = screen.getByLabelText("Hex");
    fireEvent.change(field, { target: { value: "#1E3A8A" } });
    fireEvent.blur(field);
    const saved = pickRoleColor("#1E3A8A")!.hex;
    expect(onChange).toHaveBeenLastCalledWith(saved);
    expect(isPaintableRoleColor(saved)).toBe(true);
    expect(
      screen.getByText("Made lighter so names stay readable."),
    ).toBeVisible();
  });

  it("moves red to the nearest allowed hue and says why", () => {
    const onChange = vi.fn();
    render(<Harness initial={null} onChange={onChange} />);
    openCustom();
    const field = screen.getByLabelText("Hex");
    fireEvent.change(field, { target: { value: "#FF0000" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith(pickRoleColor("#FF0000")!.hex);
    expect(
      screen.getByText(/Red is kept for alerts and mentions/),
    ).toBeVisible();
  });

  it("says a hex that isn't one is wrong, on Enter, and saves nothing", () => {
    const onChange = vi.fn();
    render(<Harness initial={null} onChange={onChange} />);
    openCustom();
    const field = screen.getByLabelText("Hex");
    fireEvent.change(field, { target: { value: "blue" } });
    expect(screen.queryByText(/Enter a hex color/)).toBeNull();
    fireEvent.keyDown(field, { key: "Enter" });
    expect(screen.getByText("Enter a hex color, like #4A90E2.")).toBeVisible();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("moves the hue and the square from the keyboard, saving readable colors", () => {
    const onChange = vi.fn();
    render(<Harness initial="#3DD6C4" onChange={onChange} />);
    openCustom();
    const hue = screen.getByRole("slider", { name: "Hue" });
    fireEvent.keyDown(hue, { key: "ArrowRight", shiftKey: true });
    const square = screen.getByRole("slider", {
      name: "Saturation and brightness",
    });
    fireEvent.keyDown(square, { key: "ArrowDown", shiftKey: true });
    expect(onChange).toHaveBeenCalledTimes(2);
    for (const [hex] of onChange.mock.calls) {
      expect(isPaintableRoleColor(hex)).toBe(true);
    }
    expect(
      screen.getByRole("button", { name: /^Custom color #/ }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("starts Custom on the stored color", () => {
    render(<Harness initial="#10B981" />);
    openCustom();
    expect(screen.getByLabelText("Hex")).toHaveValue("#10B981");
    const hue = screen.getByRole("slider", { name: "Hue" });
    expect(Number(hue.getAttribute("aria-valuenow"))).toBeGreaterThan(150);
    expect(Number(hue.getAttribute("aria-valuenow"))).toBeLessThan(165);
  });
});
