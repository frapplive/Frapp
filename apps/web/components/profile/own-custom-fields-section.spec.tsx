import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: {
    data: undefined as unknown,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
  mutateAsync: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@repo/hooks", () => ({
  useOwnCustomFields: () => mocks.query,
  useUpdateOwnCustomFields: () => ({
    mutateAsync: mocks.mutateAsync,
    isPending: false,
  }),
}));
vi.mock("@/lib/hooks/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

import { OwnCustomFieldsSection } from "./own-custom-fields-section";

const field = (over: Record<string, unknown>) => ({
  key: "k",
  visibility: "chapter",
  required: false,
  choices: null,
  max_length: null,
  value: null,
  ...over,
});

const FIELDS = [
  field({
    field_id: "shirt",
    label: "T-shirt size",
    type: "select",
    choices: ["S", "M"],
    value: "S",
  }),
  field({
    field_id: "allergy",
    label: "Allergies",
    type: "text",
    visibility: "exec",
    value: "Peanuts",
  }),
  field({
    field_id: "ec",
    label: "Emergency contact (phone)",
    type: "phone",
    visibility: "exec",
    required: true,
  }),
  field({
    field_id: "gpa",
    label: "Cumulative GPA",
    type: "decimal",
    visibility: "president",
  }),
  field({
    field_id: "drive",
    label: "Can drive",
    type: "boolean",
    visibility: "self",
    value: "false",
  }),
];

beforeEach(() => {
  mocks.query.data = FIELDS;
  mocks.query.isLoading = false;
  mocks.query.isError = false;
  mocks.mutateAsync.mockReset().mockResolvedValue(FIELDS);
  mocks.toast.mockReset();
});

describe("OwnCustomFieldsSection (#581)", () => {
  it("draws every field, sensitive ones included, with who sees each", () => {
    render(<OwnCustomFieldsSection enabled />);

    expect(screen.getByLabelText("Allergies")).toHaveValue("Peanuts");
    expect(
      screen.getByText("Officers see this", {
        selector: "#custom-field-allergy-line",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Your president sees this")).toBeInTheDocument();
    expect(screen.getByText("Only you see this")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Can drive" })).not.toBeChecked();
    expect(
      screen.getByRole("combobox", { name: "T-shirt size" }),
    ).toHaveTextContent("S");
  });

  it("saves only what changed", async () => {
    render(<OwnCustomFieldsSection enabled />);

    fireEvent.change(screen.getByLabelText("Cumulative GPA"), {
      target: { value: "3.40" },
    });
    fireEvent.click(screen.getByRole("switch", { name: "Can drive" }));
    fireEvent.click(screen.getByRole("button", { name: "Save details" }));

    await waitFor(() =>
      expect(mocks.mutateAsync).toHaveBeenCalledWith([
        { field_id: "gpa", value: "3.4" },
        { field_id: "drive", value: "true" },
      ]),
    );
    expect(mocks.toast).toHaveBeenCalledWith({ title: "Details saved" });
  });

  it("refuses a bad value on Save, under its field, and sends nothing", () => {
    render(<OwnCustomFieldsSection enabled />);

    fireEvent.change(screen.getByLabelText("Emergency contact (phone)"), {
      target: { value: "call my mom" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save details" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/Enter a phone number/);
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
  });

  it("draws nothing for a chapter with no fields, or a viewer outside the directory", () => {
    mocks.query.data = [];
    const { container, rerender } = render(<OwnCustomFieldsSection enabled />);
    expect(container).toBeEmptyDOMElement();

    mocks.query.data = FIELDS;
    rerender(<OwnCustomFieldsSection enabled={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});
