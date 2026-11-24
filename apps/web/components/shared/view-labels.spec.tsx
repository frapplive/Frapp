import * as React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  PageHeaderSlotProvider,
  PageViews,
} from "@/components/layout/page-actions";
import { ViewLabels } from "@/components/shared/view-labels";

const VIEWS = [
  { value: "mine", label: "My tasks" },
  { value: "all", label: "Everyone's" },
  { value: "open", label: "Up for grabs" },
] as const;
type View = (typeof VIEWS)[number]["value"];

function Views({
  start = "mine",
  activation,
  onChange,
}: {
  start?: View;
  activation?: "auto" | "manual";
  onChange?: (next: View) => void;
}) {
  const [view, setView] = React.useState<View>(start);
  return (
    <ViewLabels
      label="Whose tasks"
      options={VIEWS}
      value={view}
      activation={activation}
      onChange={(next) => {
        onChange?.(next);
        setView(next);
      }}
    />
  );
}

const tab = (name: string) => screen.getByRole("tab", { name });

describe("ViewLabels", () => {
  it("is a tab list that says which view is held, by more than colour", () => {
    render(<Views />);
    expect(screen.getByRole("tablist", { name: "Whose tasks" })).toBeVisible();
    expect(tab("My tasks")).toHaveAttribute("aria-selected", "true");
    expect(tab("Everyone's")).toHaveAttribute("aria-selected", "false");
    // Weight carries the pick as well as colour (P4.6, WCAG 1.4.1).
    expect(tab("My tasks").className).toContain("font-semibold");
    expect(tab("Everyone's").className).toContain("font-normal");
  });

  it("draws no box, fill, accent or underline (Paul, 2026-11-24)", () => {
    render(<Views />);
    for (const name of ["My tasks", "Everyone's"]) {
      const resting = tab(name)
        .className.split(" ")
        .filter((cls) => !cls.includes(":"));
      expect(resting.filter((cls) => cls.startsWith("bg-"))).toEqual([]);
      expect(resting.some((cls) => cls.includes("accent"))).toBe(false);
      expect(resting.some((cls) => cls.includes("primary"))).toBe(false);
      expect(resting.some((cls) => cls.startsWith("underline"))).toBe(false);
      // The one border is the transparent one focus turns solid.
      expect(resting.filter((cls) => cls.startsWith("border-"))).toEqual([
        "border-transparent",
      ]);
    }
  });

  it("puts 16px between words: 6 of padding and 1 of border either side of a 2px gap", () => {
    render(<Views />);
    expect(screen.getByRole("tablist").className).toContain("gap-0.5");
    expect(tab("My tasks").className).toContain("px-1.5");
  });

  it("holds each word's semibold width, so picking one moves nothing", () => {
    render(<Views />);
    for (const name of ["My tasks", "Everyone's"]) {
      const hidden = tab(name).querySelector("[aria-hidden='true']");
      expect(hidden).toHaveTextContent(name);
      expect(hidden?.className).toContain("font-semibold");
      expect(hidden?.className).toContain("invisible");
    }
  });

  it("draws nothing for a member with one view", () => {
    const { container } = render(
      <ViewLabels
        label="Whose tasks"
        options={[{ value: "mine", label: "My tasks" }]}
        value="mine"
        onChange={() => {}}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("picks on click, and not again on the held view", () => {
    const onChange = vi.fn();
    render(<Views onChange={onChange} />);
    fireEvent.click(tab("My tasks"));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(tab("Everyone's"));
    expect(onChange).toHaveBeenCalledExactlyOnceWith("all");
    expect(tab("Everyone's")).toHaveAttribute("aria-selected", "true");
  });

  it("is one tab stop, on the held view", () => {
    render(<Views start="all" />);
    expect(tab("Everyone's")).toHaveAttribute("tabindex", "0");
    expect(tab("My tasks")).toHaveAttribute("tabindex", "-1");
    expect(tab("Up for grabs")).toHaveAttribute("tabindex", "-1");
  });

  it("moves and picks with the arrow keys, wrapping, and jumps with Home and End", () => {
    render(<Views />);
    tab("My tasks").focus();
    fireEvent.keyDown(tab("My tasks"), { key: "ArrowRight" });
    expect(tab("Everyone's")).toHaveFocus();
    expect(tab("Everyone's")).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(tab("Everyone's"), { key: "End" });
    expect(tab("Up for grabs")).toHaveFocus();
    fireEvent.keyDown(tab("Up for grabs"), { key: "ArrowRight" });
    expect(tab("My tasks")).toHaveFocus();
    fireEvent.keyDown(tab("My tasks"), { key: "ArrowLeft" });
    expect(tab("Up for grabs")).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(tab("Up for grabs"), { key: "Home" });
    expect(tab("My tasks")).toHaveAttribute("aria-selected", "true");
  });

  it("leaves a shortcut alone", () => {
    const onChange = vi.fn();
    render(<Views onChange={onChange} />);
    tab("My tasks").focus();
    fireEvent.keyDown(tab("My tasks"), { key: "ArrowRight", metaKey: true });
    expect(onChange).not.toHaveBeenCalled();
    expect(tab("My tasks")).toHaveFocus();
  });

  it("keeps the tab stop on the held view under manual activation, as the ARIA tabs pattern does", () => {
    render(<Views activation="manual" />);
    tab("My tasks").focus();
    fireEvent.keyDown(tab("My tasks"), { key: "ArrowRight" });
    expect(tab("Everyone's")).toHaveFocus();
    // Tabbing out and back in lands on the held view.
    expect(tab("My tasks")).toHaveAttribute("tabindex", "0");
    expect(tab("Everyone's")).toHaveAttribute("tabindex", "-1");
  });

  it("with manual activation, arrows move focus and the press picks", () => {
    const onChange = vi.fn();
    render(<Views activation="manual" onChange={onChange} />);
    tab("My tasks").focus();
    fireEvent.keyDown(tab("My tasks"), { key: "ArrowRight" });
    expect(tab("Everyone's")).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();
    // Enter and Space reach a button as its click.
    fireEvent.click(tab("Everyone's"));
    expect(onChange).toHaveBeenCalledExactlyOnceWith("all");
  });

  it("names the region it changes when the page marks one", () => {
    render(
      <ViewLabels
        label="Show"
        options={VIEWS}
        value="mine"
        onChange={() => {}}
        panelId="task-list"
      />,
    );
    expect(tab("My tasks")).toHaveAttribute("aria-controls", "task-list");
  });
});

/** The shell's wiring: the header's two slots, and the page under them. */
function Shell({ children }: { children: React.ReactNode }) {
  const [slot, setSlot] = React.useState<HTMLDivElement | null>(null);
  const [viewSlot, setViewSlot] = React.useState<HTMLDivElement | null>(null);
  return (
    <>
      <div data-testid="header">
        <div ref={setViewSlot} data-testid="views" />
        <div ref={setSlot} />
      </div>
      <div data-testid="page">
        <PageHeaderSlotProvider slot={slot} viewSlot={viewSlot}>
          {children}
        </PageHeaderSlotProvider>
      </div>
    </>
  );
}

describe("PageViews", () => {
  it("seats a page's views in the header's view slot, beside the title", () => {
    render(
      <Shell>
        <PageViews>
          <Views />
        </PageViews>
      </Shell>,
    );
    expect(
      within(screen.getByTestId("views")).getByRole("tablist"),
    ).toBeVisible();
    expect(
      within(screen.getByTestId("page")).queryByRole("tablist"),
    ).not.toBeInTheDocument();
  });

  it("leaves the slot empty for one view, so the header draws no rule", () => {
    render(
      <Shell>
        <PageViews>
          <ViewLabels
            label="Whose tasks"
            options={[]}
            value="mine"
            onChange={() => {}}
          />
        </PageViews>
      </Shell>,
    );
    expect(screen.getByTestId("views")).toBeEmptyDOMElement();
  });

  it("renders nothing inside the shell until the slot mounts", () => {
    render(
      <PageHeaderSlotProvider slot={null} viewSlot={null}>
        <div data-testid="page">
          <PageViews>
            <Views />
          </PageViews>
        </div>
      </PageHeaderSlotProvider>,
    );
    expect(screen.getByTestId("page")).toBeEmptyDOMElement();
  });

  it("renders inline outside the shell", () => {
    render(
      <PageViews>
        <Views />
      </PageViews>,
    );
    expect(screen.getByRole("tablist")).toBeVisible();
  });
});
