import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ChapterCustomField } from "@repo/validation";

/**
 * Settings → Member fields in the settings-row shape (#6029): the list
 * (`?tab=fields`), a field's page (`&field=<id>`) where each row saves on its
 * own, and the new-field page (`&field=new`) that waits for "Add field".
 */

const h = vi.hoisted(() => ({
  params: "tab=fields",
  push: vi.fn(),
  replace: vi.fn(),
}));

// Mock the data hooks so the tab renders without a query client / network.
const mockUseCustomFields = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockToast = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: h.push, replace: h.replace }),
  usePathname: () => "/settings",
  useSearchParams: () => new URLSearchParams(h.params),
}));

// The page opens and closes its pages through the address (#6049).
vi.mock("@/lib/address/address", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/address/address")>()),
  pushAddressTo: (href: string) => h.push(href),
  closeToAddress: (href: string) => h.push(href),
  replaceAddress: (changes: Record<string, string | null>) =>
    h.replace(
      `${LIST}${Object.entries(changes)
        .map(([name, value]) => `&${name}=${value}`)
        .join("")}`,
    ),
}));

vi.mock("@repo/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/hooks")>()),
  useCustomFields: () => mockUseCustomFields(),
  useCreateCustomField: () => ({ mutateAsync: mockCreate, isPending: false }),
  useUpdateCustomField: () => ({ mutateAsync: mockUpdate, isPending: false }),
  useDeleteCustomField: () => ({ mutateAsync: mockDelete, isPending: false }),
}));

vi.mock("@/lib/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

import { SettingsFieldsTab } from "./settings-fields-tab";

const LIST = "/settings?tab=fields";

function customField(
  over: Partial<ChapterCustomField> = {},
): ChapterCustomField {
  return {
    id: "f1",
    chapter_id: "c1",
    key: "major",
    label: "Major",
    type: "text",
    required: false,
    visibility: "chapter",
    sensitive: false,
    options: null,
    sort: 0,
    created_at: "",
    updated_at: "",
    ...over,
  };
}

const MAJOR = customField({ id: "f1", key: "major", label: "Major", sort: 0 });
const SHIRT = customField({
  id: "f2",
  key: "shirt",
  label: "Shirt size",
  type: "select",
  required: true,
  visibility: "exec",
  options: { choices: ["S", "M", "L"] },
  sort: 1,
});
const PHONE = customField({
  id: "f3",
  key: "parent_phone",
  label: "Parent phone",
  type: "phone",
  sensitive: true,
  visibility: "self",
  sort: 2,
});

function withFields(data: ChapterCustomField[]) {
  mockUseCustomFields.mockReturnValue({
    data,
    isPending: false,
    isError: false,
  });
}

function renderTab(params = "tab=fields", canManage = true) {
  h.params = params;
  return render(<SettingsFieldsTab canManage={canManage} />);
}

/** The field rows: the drag list's items (the add row is apart). */
function fieldRows(): HTMLElement[] {
  const list = screen
    .getAllByRole("list", { name: "Member fields" })
    .find((element) => element.tagName === "OL");
  if (!list) throw new Error("No field list");
  return within(list).getAllByRole("listitem");
}

async function pick(menu: string, item: string) {
  await userEvent.click(screen.getByRole("button", { name: menu }));
  await userEvent.click(screen.getByRole("menuitem", { name: item }));
}

async function choose(combobox: string, option: string) {
  await userEvent.click(screen.getByRole("combobox", { name: combobox }));
  await userEvent.click(
    within(screen.getByRole("listbox")).getByRole("option", { name: option }),
  );
}

function resetMocks() {
  vi.clearAllMocks();
  h.params = "tab=fields";
  withFields([]);
  mockUpdate.mockResolvedValue({});
  mockCreate.mockResolvedValue({ id: "new-id" });
  mockDelete.mockResolvedValue(undefined);
}

describe("SettingsFieldsTab: the list", () => {
  beforeEach(resetMocks);

  it("shows the empty state when the chapter has no fields", () => {
    renderTab();
    expect(screen.getByText(/no fields yet/i)).toBeInTheDocument();
  });

  it("lists each field with its type and flags, who sees it, and a link to its page", () => {
    withFields([MAJOR, SHIRT, PHONE]);
    renderTab();
    const rows = fieldRows();
    expect(rows.map((row) => row.textContent)).toEqual([
      "MajorTextWhole chapter",
      "Shirt sizePick one of 3 · RequiredExec",
      "Parent phonePhone · SensitiveSelf only",
    ]);
    expect(within(rows[1]!).getByRole("link")).toHaveAttribute(
      "href",
      `${LIST}&field=f2`,
    );
    expect(
      screen.getByText("Every change here is recorded in Logs."),
    ).toBeInTheDocument();
  });

  it("ends with an Add a field row that opens the new-field page", () => {
    renderTab();
    expect(screen.getByRole("link", { name: "Add a field" })).toHaveAttribute(
      "href",
      `${LIST}&field=new`,
    );
  });

  it("offers no editing to a viewer without chapter-config:manage", () => {
    withFields([MAJOR, SHIRT]);
    renderTab("tab=fields", false);
    expect(screen.queryByRole("button", { name: /reorder/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^More for/ })).toBeNull();
    expect(screen.queryByRole("link", { name: "Add a field" })).toBeNull();
    // The rows still open each field's page to read.
    expect(within(fieldRows()[0]!).getByRole("link")).toHaveAttribute(
      "href",
      `${LIST}&field=f1`,
    );
  });

  it("writes only the fields whose place changed when one is dragged", async () => {
    withFields([MAJOR, SHIRT, PHONE]);
    renderTab();
    fireEvent.keyDown(
      screen.getByRole("button", { name: "Reorder Parent phone" }),
      { key: "ArrowUp" },
    );
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(2));
    expect(mockUpdate.mock.calls.map(([call]) => call)).toEqual([
      { id: "f3", body: { sort: 1 } },
      { id: "f2", body: { sort: 2 } },
    ]);
  });

  it("spreads out equal sorts the first time anything moves", async () => {
    withFields([
      customField({ id: "a", label: "A", sort: 0 }),
      customField({ id: "b", label: "B", sort: 0 }),
      customField({ id: "c", label: "C", sort: 0 }),
    ]);
    renderTab();
    fireEvent.keyDown(screen.getByRole("button", { name: "Reorder A" }), {
      key: "ArrowDown",
    });
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(2));
    // B is now first and already at 0, so it isn't written.
    expect(mockUpdate.mock.calls.map(([call]) => call)).toEqual([
      { id: "a", body: { sort: 1 } },
      { id: "c", body: { sort: 2 } },
    ]);
  });

  it("moves a field from its row's ⋯, never past an end", async () => {
    withFields([MAJOR, SHIRT, PHONE]);
    renderTab();
    await userEvent.click(
      screen.getByRole("button", { name: "More for Major" }),
    );
    expect(screen.getByRole("menuitem", { name: "Move up" })).toHaveAttribute(
      "data-disabled",
    );
    await userEvent.click(screen.getByRole("menuitem", { name: "Move down" }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(2));
    expect(mockUpdate.mock.calls.map(([call]) => call)).toEqual([
      { id: "f2", body: { sort: 0 } },
      { id: "f1", body: { sort: 1 } },
    ]);
  });

  it("saves one order at a time: a move made while one saves is sent after it", async () => {
    let finish: () => void = () => {};
    mockUpdate.mockImplementationOnce(
      () => new Promise<void>((resolve) => (finish = resolve)),
    );
    withFields([MAJOR, SHIRT, PHONE]);
    renderTab();
    fireEvent.keyDown(screen.getByRole("button", { name: "Reorder Major" }), {
      key: "ArrowDown",
    });
    fireEvent.keyDown(
      screen.getByRole("button", { name: "Reorder Parent phone" }),
      { key: "ArrowUp" },
    );
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    finish();
    // The queued move is worked out against the sorts just written, so
    // Parent phone lands second and Major last.
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(4));
    expect(mockUpdate.mock.calls.map(([call]) => call)).toEqual([
      { id: "f2", body: { sort: 0 } },
      { id: "f1", body: { sort: 1 } },
      { id: "f3", body: { sort: 1 } },
      { id: "f1", body: { sort: 2 } },
    ]);
  });

  it("says the order was not saved when a write is refused, and shows the saved order", async () => {
    mockUpdate.mockRejectedValue({ statusCode: 409 });
    withFields([MAJOR, SHIRT]);
    renderTab();
    fireEvent.keyDown(screen.getByRole("button", { name: "Reorder Major" }), {
      key: "ArrowDown",
    });
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Couldn't save the order" }),
      ),
    );
    await waitFor(() =>
      expect(fieldRows().map((row) => row.textContent)).toEqual([
        "MajorTextWhole chapter",
        "Shirt sizePick one of 3 · RequiredExec",
      ]),
    );
  });

  it("asks before deleting from a row's ⋯", async () => {
    withFields([MAJOR, SHIRT]);
    renderTab();
    await pick("More for Major", "Delete field");
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Delete Major?")).toBeInTheDocument();
    expect(
      within(dialog).getByText(/members lose what they entered in it/i),
    ).toBeInTheDocument();
    expect(mockDelete).not.toHaveBeenCalled();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Delete field" }),
    );
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith("f1"));
    // From the list, nowhere to go back to.
    expect(h.push).not.toHaveBeenCalled();
  });
});

describe("SettingsFieldsTab: a field's page", () => {
  beforeEach(() => {
    resetMocks();
    withFields([MAJOR, SHIRT, PHONE]);
  });

  it("opens from the address with its name on top and the way back", () => {
    renderTab("tab=fields&field=f1");
    expect(
      screen.getByRole("heading", { name: "Major", level: 2 }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Member fields" })).toHaveAttribute(
      "href",
      LIST,
    );
    expect(screen.getByLabelText("Name")).toHaveValue("Major");
    // The type is fixed once made: shown, not a picker.
    expect(screen.getByText("Text")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Type" })).toBeNull();
  });

  it("renames the field from its name field", async () => {
    renderTab("tab=fields&field=f1");
    const field = screen.getByLabelText("Name");
    await userEvent.clear(field);
    await userEvent.type(field, "Major(s){Enter}");
    expect(mockUpdate).toHaveBeenCalledWith({
      id: "f1",
      body: { label: "Major(s)" },
    });
  });

  it("says a refused rename failed", async () => {
    mockUpdate.mockRejectedValue(new Error("nope"));
    renderTab("tab=fields&field=f1");
    const field = screen.getByLabelText("Name");
    await userEvent.clear(field);
    await userEvent.type(field, "Majors{Enter}");
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Couldn't rename Major" }),
      ),
    );
  });

  it("toggling Required patches it", async () => {
    renderTab("tab=fields&field=f1");
    await userEvent.click(screen.getByRole("switch", { name: "Required" }));
    expect(mockUpdate).toHaveBeenCalledWith({
      id: "f1",
      body: { required: true },
    });
  });

  it("toggling Sensitive patches it", async () => {
    renderTab("tab=fields&field=f3");
    await userEvent.click(screen.getByRole("switch", { name: "Sensitive" }));
    expect(mockUpdate).toHaveBeenCalledWith({
      id: "f3",
      body: { sensitive: false },
    });
  });

  it("changes who sees it from Visible to", async () => {
    renderTab("tab=fields&field=f1");
    await choose("Visible to", "Exec");
    expect(mockUpdate).toHaveBeenCalledWith({
      id: "f1",
      body: { visibility: "exec" },
    });
  });

  it("saves a text field's longest answer on Enter, and No limit when cleared", async () => {
    withFields([customField({ options: { max_length: 30 } })]);
    renderTab("tab=fields&field=f1");
    const max = screen.getByLabelText("Longest answer");
    expect(max).toHaveValue("30");
    await userEvent.clear(max);
    await userEvent.type(max, "40{Enter}");
    expect(mockUpdate).toHaveBeenLastCalledWith({
      id: "f1",
      body: { options: { max_length: 40 } },
    });
    await userEvent.clear(max);
    await userEvent.tab();
    expect(mockUpdate).toHaveBeenLastCalledWith({
      id: "f1",
      body: { options: null },
    });
  });

  it("puts the saved longest answer back for a 0, and sends nothing", async () => {
    withFields([customField({ options: { max_length: 30 } })]);
    renderTab("tab=fields&field=f1");
    const max = screen.getByLabelText("Longest answer");
    await userEvent.clear(max);
    await userEvent.type(max, "0{Enter}");
    expect(max).toHaveValue("30");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("asks a longest answer only of a text field", () => {
    renderTab("tab=fields&field=f3");
    expect(screen.queryByLabelText("Longest answer")).toBeNull();
    expect(screen.queryByRole("list", { name: "Options" })).toBeNull();
  });

  describe("a pick-one field's options", () => {
    const options = () =>
      within(
        screen
          .getAllByRole("list", { name: "Options" })
          .find((element) => element.tagName === "OL")!,
      )
        .getAllByRole("listitem")
        .map((item) => item.textContent);

    it("lists them in order", () => {
      renderTab("tab=fields&field=f2");
      expect(options()).toEqual(["S", "M", "L"]);
    });

    it("removes one, saving the whole list", async () => {
      renderTab("tab=fields&field=f2");
      await userEvent.click(screen.getByRole("button", { name: "Remove M" }));
      expect(mockUpdate).toHaveBeenCalledWith({
        id: "f2",
        body: { options: { choices: ["S", "L"] } },
      });
    });

    it("adds one at the end", async () => {
      renderTab("tab=fields&field=f2");
      await userEvent.click(
        screen.getByRole("button", { name: "Add an option" }),
      );
      await userEvent.type(screen.getByLabelText("New option"), "XL");
      await userEvent.click(screen.getByRole("button", { name: "Add" }));
      expect(mockUpdate).toHaveBeenCalledWith({
        id: "f2",
        body: { options: { choices: ["S", "M", "L", "XL"] } },
      });
    });

    it("reorders them", async () => {
      renderTab("tab=fields&field=f2");
      fireEvent.keyDown(screen.getByRole("button", { name: "Reorder L" }), {
        key: "ArrowUp",
      });
      await waitFor(() =>
        expect(mockUpdate).toHaveBeenCalledWith({
          id: "f2",
          body: { options: { choices: ["S", "L", "M"] } },
        }),
      );
    });

    it("says a refused change failed", async () => {
      mockUpdate.mockRejectedValue(new Error("nope"));
      renderTab("tab=fields&field=f2");
      await userEvent.click(screen.getByRole("button", { name: "Remove M" }));
      await waitFor(() =>
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Couldn't change the options" }),
        ),
      );
    });

    it("won't remove the last option", () => {
      withFields([
        customField({
          id: "f2",
          label: "Shirt size",
          type: "select",
          options: { choices: ["One size"] },
        }),
      ]);
      renderTab("tab=fields&field=f2");
      expect(
        screen.getByRole("button", { name: "Remove One size" }),
      ).toBeDisabled();
    });
  });

  it("moves the field from the header's ⋯", async () => {
    renderTab("tab=fields&field=f3");
    await userEvent.click(
      screen.getByRole("button", { name: "More for Parent phone" }),
    );
    expect(screen.getByRole("menuitem", { name: "Move down" })).toHaveAttribute(
      "data-disabled",
    );
    await userEvent.click(screen.getByRole("menuitem", { name: "Move up" }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(2));
    expect(mockUpdate.mock.calls.map(([call]) => call)).toEqual([
      { id: "f3", body: { sort: 1 } },
      { id: "f2", body: { sort: 2 } },
    ]);
  });

  it("deletes the field from the header's ⋯ and goes back to the list", async () => {
    renderTab("tab=fields&field=f1");
    await pick("More for Major", "Delete field");
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Delete field",
      }),
    );
    await waitFor(() => expect(h.push).toHaveBeenCalledWith(LIST));
    expect(mockDelete).toHaveBeenCalledWith("f1");
  });

  it("stays on the page when the delete is cancelled", async () => {
    renderTab("tab=fields&field=f1");
    await pick("More for Major", "Delete field");
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Cancel",
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mockDelete).not.toHaveBeenCalled();
    expect(h.push).not.toHaveBeenCalled();
  });

  it("says a field someone deleted is gone", () => {
    renderTab("tab=fields&field=gone");
    expect(screen.getByText(/this field is gone/i)).toBeInTheDocument();
  });

  it("shows a viewer without chapter-config:manage the page read-only", () => {
    renderTab("tab=fields&field=f2", false);
    expect(screen.getByLabelText("Name")).toBeDisabled();
    expect(screen.getByRole("switch", { name: "Required" })).toBeDisabled();
    expect(screen.getByRole("switch", { name: "Sensitive" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Visible to" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /^More for/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Remove / })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add an option" })).toBeNull();
  });
});

describe("SettingsFieldsTab: a new field (?field=new)", () => {
  beforeEach(() => {
    resetMocks();
    withFields([MAJOR]);
  });

  const addButton = () =>
    within(screen.getByRole("banner")).getByRole("button");

  it("says what's missing on its button until it can be pressed", async () => {
    renderTab("tab=fields&field=new");
    expect(addButton()).toHaveTextContent("Add a name first");
    expect(addButton()).toBeDisabled();

    await userEvent.type(screen.getByLabelText("Name"), "Shirt size");
    expect(addButton()).toHaveTextContent("Add field");
    expect(addButton()).toBeEnabled();

    await choose("Type", "Pick one");
    expect(addButton()).toHaveTextContent("Add an option first");
    expect(addButton()).toBeDisabled();

    await userEvent.click(
      screen.getByRole("button", { name: "Add an option" }),
    );
    await userEvent.type(screen.getByLabelText("New option"), "M");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(addButton()).toHaveTextContent("Add field");
    expect(addButton()).toBeEnabled();
  });

  it("creates a text field from its name (the key is derived) and longest answer, then opens its page", async () => {
    renderTab("tab=fields&field=new");
    expect(screen.queryByLabelText("Key")).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Name"), "Graduation year");
    // Default type is text, so the longest answer is asked.
    await userEvent.type(screen.getByLabelText("Longest answer"), "4");
    await userEvent.click(screen.getByRole("button", { name: "Add field" }));

    expect(mockCreate).toHaveBeenCalledWith({
      key: "graduation_year",
      label: "Graduation year",
      type: "text",
      required: false,
      sensitive: false,
      visibility: "chapter",
      options: { max_length: 4 },
    });
    await waitFor(() =>
      expect(h.replace).toHaveBeenCalledWith(`${LIST}&field=new-id`),
    );
  });

  it("derives a key the chapter doesn't use yet", async () => {
    renderTab("tab=fields&field=new");
    await userEvent.type(screen.getByLabelText("Name"), "Major{Enter}");
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ key: "major_2", label: "Major" }),
    );
  });

  it("creates a pick-one field with its options, flags and who sees it", async () => {
    renderTab("tab=fields&field=new");
    await userEvent.type(screen.getByLabelText("Name"), "Shirt size");
    await choose("Type", "Pick one");
    expect(screen.queryByLabelText("Longest answer")).toBeNull();
    for (const choice of ["S", "M"]) {
      await userEvent.click(
        screen.getByRole("button", { name: "Add an option" }),
      );
      await userEvent.type(screen.getByLabelText("New option"), choice);
      await userEvent.click(screen.getByRole("button", { name: "Add" }));
    }
    await choose("Visible to", "Exec");
    await userEvent.click(screen.getByRole("switch", { name: "Required" }));
    await userEvent.click(screen.getByRole("switch", { name: "Sensitive" }));
    await userEvent.click(screen.getByRole("button", { name: "Add field" }));

    expect(mockCreate).toHaveBeenCalledWith({
      key: "shirt_size",
      label: "Shirt size",
      type: "select",
      required: true,
      sensitive: true,
      visibility: "exec",
      options: { choices: ["S", "M"] },
    });
  });

  it("drops what only the old type used when the type changes", async () => {
    renderTab("tab=fields&field=new");
    await userEvent.type(screen.getByLabelText("Name"), "Size");
    await userEvent.type(screen.getByLabelText("Longest answer"), "9");
    await choose("Type", "Phone");
    await choose("Type", "Text");
    expect(screen.getByLabelText("Longest answer")).toHaveValue("");
  });

  it("stays on the page when the create is refused", async () => {
    mockCreate.mockRejectedValue(new Error("nope"));
    renderTab("tab=fields&field=new");
    await userEvent.type(screen.getByLabelText("Name"), "Hometown{Enter}");
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Couldn't add the field" }),
      ),
    );
    expect(h.replace).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Name")).toHaveValue("Hometown");
  });

  it("isn't offered to a viewer without chapter-config:manage", () => {
    renderTab("tab=fields&field=new", false);
    expect(screen.queryByRole("button", { name: /add field/i })).toBeNull();
    expect(screen.queryByLabelText("Name")).toBeNull();
  });
});

describe("SettingsFieldsTab new field's longest answer guard (#2206)", () => {
  beforeEach(() => {
    resetMocks();
    withFields([]);
  });

  const maxLength = () => screen.getByLabelText("Longest answer");

  function draftField() {
    renderTab("tab=fields&field=new");
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Graduation year" },
    });
  }

  const submit = () =>
    fireEvent.click(screen.getByRole("button", { name: "Add field" }));

  it("keeps the last whole number through a negative, a decimal or letters", () => {
    draftField();
    fireEvent.change(maxLength(), { target: { value: "120" } });
    for (const entry of ["-3", "1.5", "abc", "1e999"]) {
      fireEvent.change(maxLength(), { target: { value: entry } });
      expect(maxLength(), `after typing ${entry}`).toHaveValue("120");
    }
  });

  it("reads an emptied field as no limit, and stays empty", () => {
    draftField();
    fireEvent.change(maxLength(), { target: { value: "120" } });
    fireEvent.change(maxLength(), { target: { value: "" } });
    expect(maxLength()).toHaveValue("");
  });

  it("keeps the 0 left by deleting a leading digit, and won't add it", async () => {
    draftField();
    fireEvent.change(maxLength(), { target: { value: "100" } });
    fireEvent.change(maxLength(), { target: { value: "00" } });
    expect(maxLength()).toHaveValue("00");
    // The header's button says why it can't be pressed (#2206's refusal).
    const button = screen.getByRole("button", {
      name: "Longest answer starts at 1",
    });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("creates with the kept whole number", async () => {
    draftField();
    fireEvent.change(maxLength(), { target: { value: "120" } });
    fireEvent.change(maxLength(), { target: { value: "1.5" } });
    submit();
    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
    expect(mockCreate.mock.calls[0]![0].options).toEqual({ max_length: 120 });
  });

  it("creates with no limit when the field is left empty", async () => {
    draftField();
    fireEvent.change(maxLength(), { target: { value: "" } });
    submit();
    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
    expect(mockCreate.mock.calls[0]![0]).not.toHaveProperty("options");
  });
});
