import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SettingsAddRow } from "./settings-add-row";

function renderRow(onAdd: (name: string) => Promise<boolean>) {
  render(
    <ul>
      <SettingsAddRow
        label="Add role"
        inputLabel="New role name"
        maxLength={40}
        onAdd={onAdd}
      />
    </ul>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Add role" }));
  const field = screen.getByRole("textbox", { name: "New role name" });
  fireEvent.change(field, { target: { value: "  Treasurer " } });
  fireEvent.submit(field.closest("form")!);
}

describe("SettingsAddRow", () => {
  it("adds the trimmed name, then closes", async () => {
    const onAdd = vi.fn().mockResolvedValue(true);
    renderRow(onAdd);
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith("Treasurer"));
    await waitFor(() =>
      expect(
        screen.queryByRole("textbox", { name: "New role name" }),
      ).toBeNull(),
    );
  });

  it("keeps the field open with what was typed when the add is refused", async () => {
    const onAdd = vi.fn().mockResolvedValue(false);
    renderRow(onAdd);
    await waitFor(() => expect(onAdd).toHaveBeenCalled());
    const field = await screen.findByRole("textbox", { name: "New role name" });
    expect(field).toHaveValue("  Treasurer ");
  });

  it("dims the row and says why when the list is full", () => {
    render(
      <ul>
        <SettingsAddRow
          label="New group"
          inputLabel="New group name"
          maxLength={40}
          full="This chapter has 50 groups, the most it can hold."
          onAdd={vi.fn()}
        />
      </ul>,
    );
    expect(screen.getByRole("button", { name: /New group/ })).toBeDisabled();
    expect(screen.getByText(/the most it can hold/)).toBeInTheDocument();
  });
});
