import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Dialog, DialogContent, DialogTitle } from "./dialog";
import { SuggestField } from "./suggest-field";
import { TimeField } from "./time-field";

/**
 * The keys `ComboboxField` owns for both fields (#5795): arrows move the
 * highlight, Enter takes it, Escape closes the list and not the dialog the
 * field sits in.
 */

function InDialog({
  onDialogChange,
  children,
}: {
  onDialogChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <Dialog open onOpenChange={onDialogChange}>
      <DialogContent aria-describedby={undefined}>
        <DialogTitle>Form</DialogTitle>
        {children}
      </DialogContent>
    </Dialog>
  );
}

function TimeHarness({ onDialogChange = () => {} }) {
  const [value, setValue] = useState("19:00");
  return (
    <InDialog onDialogChange={onDialogChange}>
      <label htmlFor="t">Starts</label>
      <TimeField id="t" value={value} onChange={setValue} />
      <output>{value || "none"}</output>
    </InDialog>
  );
}

const MAJORS = ["Biology", "Chemistry", "Economics"];

function SuggestHarness({ onDialogChange = () => {}, onSubmit = vi.fn() }) {
  const [value, setValue] = useState("");
  return (
    <InDialog onDialogChange={onDialogChange}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <label htmlFor="m">Major</label>
        <SuggestField
          id="m"
          value={value}
          onChange={setValue}
          suggestions={MAJORS}
          suggestionsLabel="Majors"
        />
      </form>
      <output>{value || "none"}</output>
    </InDialog>
  );
}

const activeText = (field: HTMLElement) => {
  const id = field.getAttribute("aria-activedescendant");
  return id ? document.getElementById(id)?.textContent : null;
};

describe("TimeField keys", () => {
  it("arrows move the highlight and Enter takes it", () => {
    render(<TimeHarness />);
    const field = screen.getByLabelText("Starts");
    fireEvent.keyDown(field, { key: "ArrowDown" });
    expect(field).toHaveAttribute("aria-expanded", "true");
    expect(activeText(field)).toBe("7:15 PM");
    fireEvent.keyDown(field, { key: "ArrowDown" });
    fireEvent.keyDown(field, { key: "ArrowUp" });
    expect(activeText(field)).toBe("7:15 PM");
    fireEvent.keyDown(field, { key: "Enter" });
    expect(screen.getByRole("status")).toHaveTextContent("19:15");
    expect(field).toHaveAttribute("aria-expanded", "false");
  });

  it("Escape closes the list and leaves the dialog open", () => {
    const onDialogChange = vi.fn();
    render(<TimeHarness onDialogChange={onDialogChange} />);
    const field = screen.getByLabelText("Starts");
    fireEvent.pointerDown(field);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    fireEvent.keyDown(field, { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onDialogChange).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("SuggestField keys", () => {
  it("arrows move the highlight and Enter takes it", () => {
    render(<SuggestHarness />);
    const field = screen.getByLabelText("Major");
    fireEvent.focus(field);
    expect(field).toHaveAttribute("aria-expanded", "true");
    expect(field).not.toHaveAttribute("aria-activedescendant");
    fireEvent.keyDown(field, { key: "ArrowDown" });
    expect(activeText(field)).toBe("Biology");
    fireEvent.keyDown(field, { key: "ArrowUp" });
    expect(activeText(field)).toBe("Economics");
    fireEvent.keyDown(field, { key: "Enter" });
    expect(screen.getByRole("status")).toHaveTextContent("Economics");
    expect(field).toHaveAttribute("aria-expanded", "false");
  });

  it("Enter with nothing highlighted is left to the form", () => {
    const onSubmit = vi.fn();
    render(<SuggestHarness onSubmit={onSubmit} />);
    const field = screen.getByLabelText("Major");
    fireEvent.focus(field);
    const enter = fireEvent.keyDown(field, { key: "Enter" });
    // Not prevented: the browser's implicit submit still happens.
    expect(enter).toBe(true);
  });

  it("Escape closes the list and leaves the dialog open", () => {
    const onDialogChange = vi.fn();
    render(<SuggestHarness onDialogChange={onDialogChange} />);
    const field = screen.getByLabelText("Major");
    fireEvent.focus(field);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    fireEvent.keyDown(field, { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onDialogChange).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
