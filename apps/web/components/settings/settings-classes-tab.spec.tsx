import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Settings → pledge classes in the settings-row shape (#6029): the list is
 * one group of rows (`?tab=classes`), each opening its class's page
 * (`?tab=classes&class=<id>`) with the name on top, a header ⋯, and the
 * member editor. The URL is the address, so a test "navigates" by setting
 * the search params and re-rendering.
 */

const h = vi.hoisted(() => ({
  params: "tab=classes",
  push: vi.fn(),
  close: vi.fn(),
  replace: vi.fn(),
}));

const mockClasses = vi.fn();
const mockMembers = vi.fn();
const mockCreate = vi.fn();
const mockRename = vi.fn();
const mockReorder = vi.fn();
const mockDelete = vi.fn();
const mockAssign = vi.fn();
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
  closeToAddress: (href: string) => h.close(href),
  replaceAddress: (changes: Record<string, string | null>) =>
    h.replace(
      `${LIST}${Object.entries(changes)
        .map(([name, value]) => `&${name}=${value}`)
        .join("")}`,
    ),
}));

vi.mock("@repo/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/hooks")>()),
  usePledgeClasses: () => mockClasses(),
  useMembers: () => mockMembers(),
  useCreatePledgeClass: () => ({ mutateAsync: mockCreate, isPending: false }),
  useRenamePledgeClass: () => ({ mutateAsync: mockRename, isPending: false }),
  useReorderPledgeClasses: () => ({
    mutateAsync: mockReorder,
    isPending: false,
  }),
  useDeletePledgeClass: () => ({ mutateAsync: mockDelete, isPending: false }),
  useAssignPledgeClasses: () => ({ mutateAsync: mockAssign, isPending: false }),
}));

vi.mock("@/lib/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock("@/lib/providers/network-provider", () => ({
  useNetwork: () => ({ isOffline: false }),
}));

import { SettingsClassesTab } from "./settings-classes-tab";

const pledgeClass = (id: string, name: string, position: number) => ({
  id,
  chapter_id: "c1",
  name,
  position,
  created_at: "",
  updated_at: "",
});

const member = (
  id: string,
  display_name: string,
  pledge_class_id: string | null,
  order_number: number | null,
) => ({ id, user_id: `u-${id}`, display_name, pledge_class_id, order_number });

const CLASSES = [
  pledgeClass("alpha", "Alpha", 0),
  pledgeClass("beta", "Beta", 1),
];
const MEMBERS = [
  member("m1", "Ada", "alpha", 2),
  member("m2", "Ben", "alpha", 1),
  member("m3", "Cal", "beta", 1),
  member("m4", "Dee", null, null),
];

const LIST = "/settings?tab=classes";

function tab(canManage = true) {
  return (
    <SettingsClassesTab
      canManage={canManage}
      classTerm="Pledge class"
      orderTerm="Fraternal order"
    />
  );
}

function renderTab(canManage = true, params = "tab=classes") {
  h.params = params;
  return render(tab(canManage));
}

/** Open `?tab=classes&class=<id>` from scratch. */
function renderClassPage(id: string, canManage = true) {
  return renderTab(canManage, `tab=classes&class=${id}`);
}

/** Move the rendered tab to another address, as a link or Back would. */
function go(view: ReturnType<typeof render>, params: string, canManage = true) {
  h.params = params;
  view.rerender(tab(canManage));
}

/** The class rows: the drag list's items (the group's add row is apart). */
function classRows(): HTMLElement[] {
  const list = screen
    .getAllByRole("list", { name: "Pledge class" })
    .find((element) => element.tagName === "OL");
  if (!list) throw new Error("No class list");
  return within(list).getAllByRole("listitem");
}

async function pick(menu: string, item: string) {
  await userEvent.click(screen.getByRole("button", { name: menu }));
  await userEvent.click(screen.getByRole("menuitem", { name: item }));
}

function resetMocks() {
  vi.clearAllMocks();
  h.params = "tab=classes";
  mockClasses.mockReturnValue({
    data: CLASSES,
    isPending: false,
    isLoading: false,
    isError: false,
    fetchStatus: "idle",
    refetch: vi.fn().mockResolvedValue(undefined),
  });
  mockMembers.mockReturnValue({
    data: MEMBERS,
    isError: false,
    refetch: vi.fn().mockResolvedValue({ data: MEMBERS }),
  });
  mockReorder.mockResolvedValue(undefined);
  mockAssign.mockResolvedValue(undefined);
  mockRename.mockResolvedValue(undefined);
  mockCreate.mockResolvedValue(undefined);
  mockDelete.mockResolvedValue(undefined);
}

describe("SettingsClassesTab", () => {
  beforeEach(resetMocks);

  it("lists the chapter's classes oldest first, each with its member count and a link to its page", () => {
    renderTab();
    const rows = classRows();
    expect(rows.map((row) => row.textContent)).toEqual([
      "Alpha2 members",
      "Beta1 member",
    ]);
    expect(within(rows[0]!).getByRole("link")).toHaveAttribute(
      "href",
      `${LIST}&class=alpha`,
    );
    expect(screen.getByText("Oldest first.")).toBeInTheDocument();
  });

  it("says so when the chapter has none, in the chapter's word", () => {
    mockClasses.mockReturnValue({
      data: [],
      isPending: false,
      isLoading: false,
      isError: false,
      fetchStatus: "idle",
      refetch: vi.fn(),
    });
    render(
      <SettingsClassesTab canManage classTerm="Line" orderTerm="Line number" />,
    );
    expect(screen.getByText(/nothing here yet/i)).toBeInTheDocument();
    // The chapter's word, as typed: never "Lines" or "line".
    expect(screen.getByText("Line", { exact: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Line" })).toBeEnabled();
  });

  it("adds a class by name from the last row", async () => {
    renderTab();
    await userEvent.click(
      screen.getByRole("button", { name: "Add Pledge class" }),
    );
    await userEvent.type(
      screen.getByLabelText("New Pledge class name"),
      "  Gamma ",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Add Pledge class" }),
    );
    expect(mockCreate).toHaveBeenCalledWith("Gamma");
    // Added: the field closes back to the row.
    await waitFor(() =>
      expect(screen.queryByLabelText("New Pledge class name")).toBeNull(),
    );
  });

  it("opens the class's page from a row's Rename", async () => {
    renderTab();
    await pick("More for Alpha", "Rename");
    expect(h.push).toHaveBeenCalledWith(`${LIST}&class=alpha`);
  });

  it("saves the whole list when a class is moved", async () => {
    renderTab();
    fireEvent.keyDown(screen.getByRole("button", { name: "Reorder Alpha" }), {
      key: "ArrowDown",
    });
    await waitFor(() =>
      expect(mockReorder).toHaveBeenCalledWith(["beta", "alpha"]),
    );
  });

  it("moves a class up or down from its row's ⋯, never past an end", async () => {
    renderTab();
    await userEvent.click(
      screen.getByRole("button", { name: "More for Alpha" }),
    );
    expect(screen.getByRole("menuitem", { name: "Move up" })).toHaveAttribute(
      "data-disabled",
    );
    await userEvent.click(screen.getByRole("menuitem", { name: "Move down" }));
    await waitFor(() =>
      expect(mockReorder).toHaveBeenCalledWith(["beta", "alpha"]),
    );

    // The save settled on the saved order again (the mock's list is fixed),
    // so Beta is last: it can go up, not down.
    await waitFor(() =>
      expect(classRows().map((row) => row.textContent)).toEqual([
        "Alpha2 members",
        "Beta1 member",
      ]),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "More for Beta" }),
    );
    expect(screen.getByRole("menuitem", { name: "Move down" })).toHaveAttribute(
      "data-disabled",
    );
    expect(
      screen.getByRole("menuitem", { name: "Move up" }),
    ).not.toHaveAttribute("data-disabled");
  });

  it("says the order was not saved when the API refuses it", async () => {
    mockReorder.mockRejectedValue({ statusCode: 409 });
    renderTab();
    fireEvent.keyDown(screen.getByRole("button", { name: "Reorder Alpha" }), {
      key: "ArrowDown",
    });
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Couldn't save the order" }),
      ),
    );
  });

  it("asks before deleting, and says the members keep their number", async () => {
    renderTab();
    await pick("More for Alpha", "Delete Alpha");
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(/its 2 members are left without one/i),
    ).toBeInTheDocument();
    expect(mockDelete).not.toHaveBeenCalled();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Delete Alpha" }),
    );
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith("alpha"));
  });

  it("deletes nothing when the confirm is cancelled", async () => {
    renderTab();
    await pick("More for Alpha", "Delete Alpha");
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Cancel" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("keeps the handles while a save is in flight, and sends moves made meanwhile as one more save", async () => {
    let finishFirst: () => void = () => {};
    mockReorder.mockImplementationOnce(
      () => new Promise<void>((resolve) => (finishFirst = resolve)),
    );
    renderTab();
    fireEvent.keyDown(screen.getByRole("button", { name: "Reorder Alpha" }), {
      key: "ArrowDown",
    });
    // Still there, and still usable, while the first save is out.
    fireEvent.keyDown(screen.getByRole("button", { name: "Reorder Alpha" }), {
      key: "ArrowUp",
    });
    expect(mockReorder).toHaveBeenCalledTimes(1);
    finishFirst();
    await waitFor(() => expect(mockReorder).toHaveBeenCalledTimes(2));
    expect(mockReorder).toHaveBeenLastCalledWith(["alpha", "beta"]);
  });

  it("puts the saved order back on screen when the API refuses a move", async () => {
    mockReorder.mockRejectedValue({ statusCode: 409 });
    renderTab();
    fireEvent.keyDown(screen.getByRole("button", { name: "Reorder Alpha" }), {
      key: "ArrowDown",
    });
    await waitFor(() => expect(mockToast).toHaveBeenCalled());
    await waitFor(() =>
      expect(classRows().map((row) => row.textContent)).toEqual([
        "Alpha2 members",
        "Beta1 member",
      ]),
    );
  });

  describe("before the roster read answers", () => {
    beforeEach(() => {
      mockMembers.mockReturnValue({
        data: undefined,
        isError: false,
        refetch: vi.fn(),
      });
    });

    it("shows no count rather than a zero", () => {
      renderTab();
      expect(classRows().map((row) => row.textContent)).toEqual([
        "Alpha",
        "Beta",
      ]);
    });

    it("won't open the member editor on the class's page, which would start from an empty class", () => {
      renderClassPage("alpha");
      expect(screen.getByText("Loading members")).toBeInTheDocument();
      expect(screen.queryByLabelText("Add a member")).toBeNull();
      expect(
        screen.queryByRole("list", { name: "Members of Alpha" }),
      ).toBeNull();
    });

    it("doesn't claim a class is empty when deleting it", async () => {
      renderTab();
      await pick("More for Alpha", "Delete Alpha");
      const dialog = await screen.findByRole("dialog");
      expect(within(dialog).queryByText("No members are in it.")).toBeNull();
      expect(
        within(dialog).getByText(/any members in it are left without one/i),
      ).toBeInTheDocument();
    });

    it("says the roster failed and offers the read again", async () => {
      const refetch = vi.fn();
      mockMembers.mockReturnValue({ data: undefined, isError: true, refetch });
      renderTab();
      await userEvent.click(screen.getByRole("button", { name: "Retry" }));
      expect(refetch).toHaveBeenCalled();
    });

    it("says so on the class's page too, and offers the read again", async () => {
      const refetch = vi.fn();
      mockMembers.mockReturnValue({ data: undefined, isError: true, refetch });
      renderClassPage("alpha");
      expect(
        screen.getByText(/couldn't load the chapter's members/i),
      ).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Retry" }));
      expect(refetch).toHaveBeenCalled();
    });
  });

  it("offers no editing to a viewer without roles:manage", () => {
    renderTab(false);
    expect(screen.queryByRole("button", { name: /reorder/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^More for/ })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Add Pledge class" }),
    ).toBeNull();
    expect(
      screen.getByText("Only officers who manage roles can change this list."),
    ).toBeInTheDocument();
    // The rows still open each class's page to read.
    expect(within(classRows()[0]!).getByRole("link")).toHaveAttribute(
      "href",
      `${LIST}&class=alpha`,
    );
  });

  it("shows a viewer without roles:manage a class's page read-only", () => {
    renderClassPage("alpha", false);
    expect(screen.getByLabelText("Name")).toBeDisabled();
    expect(screen.queryByRole("button", { name: /^More for/ })).toBeNull();
    expect(screen.queryByLabelText("Add a member")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Remove / })).toBeNull();
    expect(screen.queryByRole("button", { name: /reorder/i })).toBeNull();
    expect(
      within(screen.getByRole("list", { name: "Members of Alpha" }))
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["1Ben", "2Ada"]);
  });

  it("says a class someone deleted is gone, with the way back", () => {
    renderClassPage("gone");
    expect(screen.getByText(/isn't in the list any more/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pledge class" })).toHaveAttribute(
      "href",
      LIST,
    );
  });

  describe("a class's page (?class=)", () => {
    function openAlpha() {
      renderClassPage("alpha");
      return screen.getByRole("list", { name: "Members of Alpha" });
    }

    it("opens from the address, titled with the class, with the way back to the list", () => {
      openAlpha();
      expect(
        screen.getByRole("heading", { name: "Alpha", level: 2 }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Pledge class" }),
      ).toHaveAttribute("href", LIST);
      expect(screen.getByLabelText("Name")).toHaveValue("Alpha");
    });

    it("renames the class from its name field on Enter", async () => {
      openAlpha();
      const field = screen.getByLabelText("Name");
      await userEvent.clear(field);
      await userEvent.type(field, "Alpha 2019{Enter}");
      expect(mockRename).toHaveBeenCalledWith({
        id: "alpha",
        name: "Alpha 2019",
      });
      expect(await screen.findByText("Saved")).toBeInTheDocument();
    });

    it("renames on leaving the field, and never sends a blank name", async () => {
      openAlpha();
      const field = screen.getByLabelText("Name");
      await userEvent.clear(field);
      await userEvent.tab();
      expect(mockRename).not.toHaveBeenCalled();
      expect(field).toHaveValue("Alpha");

      await userEvent.clear(field);
      await userEvent.type(field, "Alphas");
      await userEvent.tab();
      expect(mockRename).toHaveBeenCalledWith({ id: "alpha", name: "Alphas" });
    });

    it("says the rename failed and keeps what was typed", async () => {
      mockRename.mockRejectedValue(new Error("nope"));
      openAlpha();
      const field = screen.getByLabelText("Name");
      await userEvent.clear(field);
      await userEvent.type(field, "Beta{Enter}");
      await waitFor(() =>
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Couldn't rename Alpha" }),
        ),
      );
      expect(field).toHaveValue("Beta");
    });

    it("moves the class from the header's ⋯", async () => {
      renderClassPage("beta");
      await userEvent.click(
        screen.getByRole("button", { name: "More for Beta" }),
      );
      expect(
        screen.getByRole("menuitem", { name: "Move down" }),
      ).toHaveAttribute("data-disabled");
      await userEvent.click(screen.getByRole("menuitem", { name: "Move up" }));
      await waitFor(() =>
        expect(mockReorder).toHaveBeenCalledWith(["beta", "alpha"]),
      );
    });

    it("deletes the class from the header's ⋯ and goes back to the list", async () => {
      openAlpha();
      await pick("More for Alpha", "Delete Alpha");
      const dialog = await screen.findByRole("dialog");
      expect(
        within(dialog).getByText(/its 2 members are left without one/i),
      ).toBeInTheDocument();
      await userEvent.click(
        within(dialog).getByRole("button", { name: "Delete Alpha" }),
      );
      await waitFor(() => expect(h.close).toHaveBeenCalledWith(LIST));
      expect(mockDelete).toHaveBeenCalledWith("alpha");
    });

    it("stays on the page when the delete fails", async () => {
      mockDelete.mockRejectedValue(new Error("nope"));
      openAlpha();
      await pick("More for Alpha", "Delete Alpha");
      await userEvent.click(
        within(await screen.findByRole("dialog")).getByRole("button", {
          name: "Delete Alpha",
        }),
      );
      await waitFor(() =>
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Couldn't delete Alpha" }),
        ),
      );
      expect(h.push).not.toHaveBeenCalled();
      expect(h.close).not.toHaveBeenCalled();
    });

    it("lists the class's members in fraternal order, numbered by the list", () => {
      const list = openAlpha();
      expect(
        within(list)
          .getAllByRole("listitem")
          .map((item) => item.textContent),
      ).toEqual([
        expect.stringMatching(/^1Ben/),
        expect.stringMatching(/^2Ada/),
      ]);
      // The order is set by moving rows, never by typing a number (#5738).
      expect(within(list).queryByRole("textbox")).toBeNull();
    });

    it("has nothing to save until something changes", () => {
      openAlpha();
      expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
    });

    it("renumbers on a move and saves only what changed, in one request", async () => {
      openAlpha();
      fireEvent.keyDown(screen.getByRole("button", { name: "Reorder Ben" }), {
        key: "ArrowDown",
      });
      await userEvent.click(screen.getByRole("button", { name: "Save" }));
      expect(mockAssign).toHaveBeenCalledWith([
        { member_id: "m1", pledge_class_id: "alpha", order_number: 1 },
        { member_id: "m2", pledge_class_id: "alpha", order_number: 2 },
      ]);
      await waitFor(() =>
        expect(mockToast).toHaveBeenCalledWith({ title: "Alpha saved" }),
      );
    });

    it("works the next change out against the roster as saved", async () => {
      // What the server holds after the first Save: Ada out of Alpha.
      const saved = MEMBERS.map((member) =>
        member.id === "m1"
          ? { ...member, pledge_class_id: null, order_number: null }
          : member,
      );
      mockMembers.mockReturnValue({
        data: MEMBERS,
        isError: false,
        refetch: vi.fn().mockResolvedValue({ data: saved }),
      });
      openAlpha();
      await userEvent.click(
        screen.getByRole("button", { name: "Remove Ada from Alpha" }),
      );
      await userEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() =>
        expect(mockToast).toHaveBeenCalledWith({ title: "Alpha saved" }),
      );
      // Nothing left to save: the page now reads the saved roster.
      expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    });

    it("says the save failed and keeps the change on screen", async () => {
      mockAssign.mockRejectedValue(new Error("nope"));
      openAlpha();
      await userEvent.click(
        screen.getByRole("button", { name: "Remove Ada from Alpha" }),
      );
      await userEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() =>
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Couldn't save Alpha" }),
        ),
      );
      expect(
        screen.queryByRole("button", { name: "Remove Ada from Alpha" }),
      ).toBeNull();
      expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    });

    it("lists everyone who can be added as soon as the search is clicked (#5738)", async () => {
      openAlpha();
      await userEvent.click(screen.getByLabelText("Add a member"));
      const options = screen
        .getAllByRole("option")
        .map((option) => option.textContent);
      // Members in no class first, then members of another class.
      expect(options).toEqual(["Dee", "CalMoves from Beta"]);
    });

    it("narrows the list as you type, and keeps it open to add the next one", async () => {
      openAlpha();
      await userEvent.type(screen.getByLabelText("Add a member"), "de");
      expect(
        screen.getAllByRole("option").map((option) => option.textContent),
      ).toEqual(["Dee"]);
      await userEvent.keyboard("{Enter}");
      expect(screen.getByLabelText("Add a member")).toHaveValue("");
      expect(
        screen.getAllByRole("option").map((option) => option.textContent),
      ).toEqual(["CalMoves from Beta"]);
    });

    it("clears a search on Escape, then closes the list until an arrow key", async () => {
      openAlpha();
      const field = screen.getByLabelText("Add a member");
      await userEvent.type(field, "de");
      await userEvent.keyboard("{Escape}");
      expect(field).toHaveValue("");
      expect(screen.getAllByRole("option")).toHaveLength(2);
      await userEvent.keyboard("{Escape}");
      expect(screen.queryAllByRole("option")).toHaveLength(0);
      // Only the arrows (or typing) bring it back.
      await userEvent.keyboard("{Shift}");
      expect(screen.queryAllByRole("option")).toHaveLength(0);
      await userEvent.keyboard("{ArrowDown}");
      expect(screen.getAllByRole("option")).toHaveLength(2);
    });

    it("says so when nobody matches", async () => {
      openAlpha();
      await userEvent.type(screen.getByLabelText("Add a member"), "zed");
      expect(screen.getByText("Nothing matches “zed”.")).toBeInTheDocument();
    });

    it("adds a member from another class and says where they move from", async () => {
      openAlpha();
      await userEvent.type(screen.getByLabelText("Add a member"), "ca");
      expect(screen.getByText("Moves from Beta")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("option", { name: /Cal/ }));
      await userEvent.click(screen.getByRole("button", { name: "Save" }));
      expect(mockAssign).toHaveBeenCalledWith([
        { member_id: "m3", pledge_class_id: "alpha", order_number: 3 },
      ]);
    });

    it("takes a member out of the class and keeps their number", async () => {
      openAlpha();
      await userEvent.click(
        screen.getByRole("button", { name: "Remove Ada from Alpha" }),
      );
      await userEvent.click(screen.getByRole("button", { name: "Save" }));
      expect(mockAssign).toHaveBeenCalledWith([
        { member_id: "m1", pledge_class_id: null, order_number: 2 },
      ]);
    });

    it("puts the roster back on Cancel, and stays on the page", async () => {
      openAlpha();
      await userEvent.click(
        screen.getByRole("button", { name: "Remove Ada from Alpha" }),
      );
      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(
        screen.getByRole("button", { name: "Remove Ada from Alpha" }),
      ).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
      expect(screen.getByRole("list", { name: "Members of Alpha" }));
      expect(h.push).not.toHaveBeenCalled();
      expect(h.close).not.toHaveBeenCalled();
      expect(mockAssign).not.toHaveBeenCalled();
    });

    it("leaves alone a member another officer added while the page was open", async () => {
      const view = renderClassPage("alpha");
      // A background re-read brings in Dee, now in Alpha.
      mockMembers.mockReturnValue({
        data: [...MEMBERS.slice(0, 3), member("m4", "Dee", "alpha", 3)],
        isError: false,
      });
      view.rerender(tab());
      expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
      await userEvent.click(
        screen.getByRole("button", { name: "Remove Ada from Alpha" }),
      );
      await userEvent.click(screen.getByRole("button", { name: "Save" }));
      expect(mockAssign).toHaveBeenCalledWith([
        { member_id: "m1", pledge_class_id: null, order_number: 2 },
      ]);
    });
  });
});

/**
 * Leaving a class's page keeps its member draft (#4593): no "are you sure",
 * and the page opens on it next time, from the list or from the address.
 * Cancel and Save give it up.
 */
describe("SettingsClassesTab keeps a class page's draft (#4593)", () => {
  beforeEach(resetMocks);

  const removeAda = () =>
    userEvent.click(
      screen.getByRole("button", { name: "Remove Ada from Alpha" }),
    );

  it("opens on the draft after going back to the list, and says so", async () => {
    const view = renderClassPage("alpha");
    expect(screen.queryByText("Draft restored")).toBeNull();
    await removeAda();
    go(view, "tab=classes");
    expect(screen.queryByRole("list", { name: "Members of Alpha" })).toBeNull();
    go(view, "tab=classes&class=alpha");

    expect(
      screen.queryByRole("button", { name: "Remove Ada from Alpha" }),
    ).toBeNull();
    expect(screen.getByText("Draft restored")).toBeInTheDocument();
    // Still worked out against the roster it opened on.
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(mockAssign).toHaveBeenCalledWith([
      { member_id: "m1", pledge_class_id: null, order_number: 2 },
    ]);
  });

  it("opens the class page on its draft from ?class= after Settings was left", async () => {
    const first = renderClassPage("alpha");
    await removeAda();
    first.unmount();

    renderClassPage("alpha");
    expect(await screen.findByText("Draft restored")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Remove Ada from Alpha" }),
    ).toBeNull();
  });

  it("keeps each class's draft apart", async () => {
    const view = renderClassPage("alpha");
    await removeAda();
    go(view, "tab=classes&class=beta");
    expect(screen.queryByText("Draft restored")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Remove Cal from Beta" }),
    ).toBeInTheDocument();
  });

  it("offers no draft to an officer who can no longer manage classes", async () => {
    const first = renderClassPage("alpha");
    await removeAda();
    first.unmount();

    renderClassPage("alpha", false);
    expect(screen.queryByText("Draft restored")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    // They see the class as saved, not another officer's unsaved draft.
    expect(
      within(screen.getByRole("list", { name: "Members of Alpha" }))
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["1Ben", "2Ada"]);
  });

  it("keeps nothing on Cancel, or for a page left untouched", async () => {
    const view = renderClassPage("alpha");
    go(view, "tab=classes");
    go(view, "tab=classes&class=alpha");
    expect(screen.queryByText("Draft restored")).toBeNull();

    await removeAda();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    go(view, "tab=classes");
    go(view, "tab=classes&class=alpha");
    expect(
      screen.getByRole("button", { name: "Remove Ada from Alpha" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Draft restored")).toBeNull();
  });

  it("keeps nothing once saved", async () => {
    const view = renderClassPage("alpha");
    await removeAda();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith({ title: "Alpha saved" }),
    );
    go(view, "tab=classes");
    go(view, "tab=classes&class=alpha");
    expect(screen.queryByText("Draft restored")).toBeNull();
  });

  it("starts over from the roster on Discard", async () => {
    const view = renderClassPage("alpha");
    await removeAda();
    go(view, "tab=classes");
    go(view, "tab=classes&class=alpha");
    await userEvent.click(screen.getByRole("button", { name: "Discard" }));

    expect(
      screen.getByRole("button", { name: "Remove Ada from Alpha" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Draft restored")).toBeNull();
  });
});
