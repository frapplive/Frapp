import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  COUNCIL_SETTINGS_TABS,
  CouncilNameField,
  isCouncilSettingsTabVisible,
} from "./council-settings-page";

/** Council settings (#5933): a council's few rows, saved on their own. */
describe("isCouncilSettingsTabVisible", () => {
  const visible = (permissions: string[] | undefined) =>
    COUNCIL_SETTINGS_TABS.filter((tab) =>
      isCouncilSettingsTabVisible(tab.value, permissions),
    ).map((tab) => tab.value);

  it("gives the Council admin every row", () => {
    expect(visible(["*"])).toEqual(["council", "logs", "roles"]);
  });

  it("gives a delegate none, and nothing while permissions load", () => {
    expect(visible(["members:view"])).toEqual([]);
    expect(visible(undefined)).toEqual([]);
  });

  it("gives a roles manager Roles and groups alone", () => {
    expect(visible(["members:view", "roles:manage"])).toEqual(["roles"]);
  });
});

describe("CouncilNameField", () => {
  it("saves on Enter and says Saved", async () => {
    const onSave = vi.fn(async () => {});
    render(
      <CouncilNameField stored="RPI IFC" disabled={false} onSave={onSave} />,
    );
    const field = screen.getByRole("textbox", { name: "Name" });
    fireEvent.change(field, {
      target: { value: "RPI Interfraternity Council" },
    });
    fireEvent.keyDown(field, { key: "Enter" });
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith("RPI Interfraternity Council"),
    );
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });

  it("puts the old name back on Escape and sends nothing", () => {
    const onSave = vi.fn(async () => {});
    render(
      <CouncilNameField stored="RPI IFC" disabled={false} onSave={onSave} />,
    );
    const field = screen.getByRole("textbox", { name: "Name" });
    fireEvent.change(field, { target: { value: "Typo" } });
    fireEvent.keyDown(field, { key: "Escape" });
    expect(field).toHaveValue("RPI IFC");
    fireEvent.blur(field);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("refuses an empty name, and saves nothing unchanged on leaving", () => {
    const onSave = vi.fn(async () => {});
    render(
      <CouncilNameField stored="RPI IFC" disabled={false} onSave={onSave} />,
    );
    const field = screen.getByRole("textbox", { name: "Name" });
    fireEvent.blur(field);
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.change(field, { target: { value: "  " } });
    fireEvent.blur(field);
    expect(screen.getByText("Name the council.")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });
});
