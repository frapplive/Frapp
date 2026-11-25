import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { HeaderSearch } from "./header-search";

function Harness({ narrow }: { narrow: boolean }) {
  const [value, setValue] = useState("");
  return (
    <HeaderSearch
      narrow={narrow}
      value={value}
      onChange={setValue}
      placeholder="Search"
      label="Search prospects by name"
      glyphLabel="Search prospects"
    />
  );
}

describe("HeaderSearch", () => {
  it("is the field where the pane is wide", () => {
    render(<Harness narrow={false} />);
    expect(screen.getByRole("searchbox")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Search prospects" }),
    ).not.toBeInTheDocument();
  });

  it("opens from its glyph, clears then closes on Escape, and hands focus back", async () => {
    const user = userEvent.setup();
    render(<Harness narrow />);
    await user.click(screen.getByRole("button", { name: "Search prospects" }));
    const field = screen.getByRole("searchbox", {
      name: "Search prospects by name",
    });
    expect(field).toHaveFocus();
    await user.type(field, "ja");
    await user.keyboard("{Escape}");
    expect(field).toHaveValue("");
    expect(field).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Search prospects" }),
    ).toHaveFocus();
  });
});
