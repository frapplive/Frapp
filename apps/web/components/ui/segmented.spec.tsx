import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SegmentedChoice } from "@/components/ui/segmented";

const OPTIONS = [
  { value: "none", label: "None" },
  { value: "photo", label: "Photo" },
  { value: "link", label: "Link" },
] as const;

const radio = (name: string) => screen.getByRole("radio", { name });

describe("SegmentedChoice: neutral since 2026-11-24 (#5947)", () => {
  it("raises the held answer on a card step, never the accent", () => {
    render(
      <SegmentedChoice
        label="Proof to mark it done"
        options={OPTIONS}
        value="photo"
        onChange={() => {}}
      />,
    );
    const held = radio("Photo").className;
    expect(held).toContain("bg-card");
    expect(held).toContain("border-border");
    expect(held).toContain("text-foreground");
    for (const name of ["None", "Photo", "Link"]) {
      expect(radio(name).className).not.toMatch(/accent-subtle|accent-text\b(?!.*focus)/);
      expect(radio(name).className).not.toContain("bg-accent");
      expect(radio(name).className).not.toContain("bg-primary");
    }
    // The rest are muted words with no edge of their own.
    expect(radio("None").className).toContain("text-muted");
    expect(radio("None").className).toContain("border-transparent");
  });

  it("holds a quiet answer with the edge alone, so the raised rows are the ones set apart", () => {
    render(
      <SegmentedChoice
        quiet
        label="Attendance for Alumni"
        options={OPTIONS}
        value="none"
        onChange={() => {}}
      />,
    );
    const held = radio("None").className;
    expect(held).toContain("border-border");
    expect(held).toContain("text-foreground");
    expect(held).not.toContain("bg-card ");
  });

  it("keeps the control's edge, and stays a radio group", () => {
    render(
      <SegmentedChoice
        label="Repeat"
        options={OPTIONS}
        value="none"
        onChange={() => {}}
      />,
    );
    const group = screen.getByRole("radiogroup", { name: "Repeat" });
    expect(group.className).toContain("border-control-edge");
    expect(radio("None")).toHaveAttribute("aria-checked", "true");
  });
});
