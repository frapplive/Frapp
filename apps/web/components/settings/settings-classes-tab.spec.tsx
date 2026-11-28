import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FrappClientProvider } from "@repo/hooks";
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
}));

// The member editor (`useClassMembersEditor`) saves through the hooks
// package's own import, so the save is stubbed where it lives.
vi.mock("@repo/hooks/use-pledge-classes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/hooks/use-pledge-classes")>()),
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

/**
 * The query cache the member editor reads the roster back from: a save's
 * re-read (`useAssignPledgeClasses`' invalidation) lands here.
 */
let queryClient: QueryClient;

function Providers({ children }: { children: ReactNode }) {
  return (
    <FrappClientProvider client={{} as never} chapterId="c1">
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </FrappClientProvider>
  );
}

function renderTab(canManage = true, params = "tab=classes") {
  h.params = params;
  return render(tab(canManage), { wrapper: Providers });
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

type Member = ReturnType<typeof member>;
type Assignment = {
  member_id: string;
  pledge_class_id: string | null;
  order_number: number | null;
};

/** What the server holds: the assign mock writes it, a re-read returns it. */
let server: Member[] = MEMBERS;
/** Whether a save's re-read of the roster works. */
let rereadWorks = true;
/** Another officer's write, landing while a save is in flight. */
let meanwhile: (() => void) | null = null;

function applyAssignments(changes: Assignment[]) {
  server = server.map((row) => {
    const change = changes.find((entry) => entry.member_id === row.id);
    return change
      ? {
          ...row,
          pledge_class_id: change.pledge_class_id,
          order_number: change.order_number,
        }
      : row;
  });
}

function resetMocks() {
  vi.clearAllMocks();
  server = MEMBERS;
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
    refetch: vi.fn(async () => ({ data: server })),
  });
  mockReorder.mockResolvedValue(undefined);
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  rereadWorks = true;
  meanwhile = null;
  mockAssign.mockImplementation(async (changes: Assignment[]) => {
    applyAssignments(changes);
    meanwhile?.();
    // As the real save does, it settles once the roster is read again.
    if (rereadWorks) queryClient.setQueryData(["members", "c1"], server);
  });
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
      await waitFor(() => expect(h.push).toHaveBeenCalledWith(LIST));
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

    it("has no Save or Cancel: each change saves on its own", () => {
      openAlpha();
      expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
    });

    it("renumbers on a move and saves only what changed at once, in one request", async () => {
      openAlpha();
      fireEvent.keyDown(screen.getByRole("button", { name: "Reorder Ben" }), {
        key: "ArrowDown",
      });
      await waitFor(() =>
        expect(mockAssign).toHaveBeenCalledWith([
          { member_id: "m1", pledge_class_id: "alpha", order_number: 1 },
          { member_id: "m2", pledge_class_id: "alpha", order_number: 2 },
        ]),
      );
      expect(mockAssign).toHaveBeenCalledTimes(1);
      // Saving says nothing when it works (rulebook § 9).
      expect(mockToast).not.toHaveBeenCalled();
      await waitFor(() =>
        expect(
          within(screen.getByRole("list", { name: "Members of Alpha" }))
            .getAllByRole("listitem")
            .map((item) => item.textContent),
        ).toEqual([
          expect.stringMatching(/^1Ada/),
          expect.stringMatching(/^2Ben/),
        ]),
      );
    });

    it("works the next change out against the roster as re-read", async () => {
      openAlpha();
      await userEvent.type(screen.getByLabelText("Add a member"), "de");
      await userEvent.keyboard("{Enter}");
      await waitFor(() =>
        expect(mockAssign).toHaveBeenCalledWith([
          { member_id: "m4", pledge_class_id: "alpha", order_number: 3 },
        ]),
      );
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "Remove Dee from Alpha" }),
        ).toBeEnabled(),
      );
      // Taking out the member just added writes their removal, and only it:
      // nothing of the first change is sent again.
      await userEvent.click(
        screen.getByRole("button", { name: "Remove Dee from Alpha" }),
      );
      await waitFor(() => expect(mockAssign).toHaveBeenCalledTimes(2));
      expect(mockAssign).toHaveBeenLastCalledWith([
        { member_id: "m4", pledge_class_id: null, order_number: 3 },
      ]);
    });

    it("shows the roster as the save read it back, with no read of its own", async () => {
      openAlpha();
      // Another officer adds Dee to Alpha while the removal saves.
      meanwhile = () => {
        server = server.map((row) =>
          row.id === "m4"
            ? { ...row, pledge_class_id: "alpha", order_number: 3 }
            : row,
        );
      };
      await userEvent.click(
        screen.getByRole("button", { name: "Remove Ada from Alpha" }),
      );
      await waitFor(() => expect(mockAssign).toHaveBeenCalledTimes(1));
      expect(
        await screen.findByRole("button", { name: "Remove Dee from Alpha" }),
      ).toBeInTheDocument();
      expect(
        within(screen.getByRole("list", { name: "Members of Alpha" }))
          .getAllByRole("listitem")
          .map((item) => item.textContent),
      ).toEqual([
        expect.stringMatching(/^1Ben/),
        expect.stringMatching(/^3Dee/),
      ]);
      // The save's own re-read is the one read: none is fired after it.
      const refetch = mockMembers.mock.results.at(-1)!.value.refetch;
      expect(refetch).not.toHaveBeenCalled();
    });

    it("keeps the grip usable while a move saves, and saves the next move after it", async () => {
      let release!: () => void;
      mockAssign.mockImplementationOnce(async (changes: Assignment[]) => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        applyAssignments(changes);
        queryClient.setQueryData(["members", "c1"], server);
      });
      openAlpha();
      const grip = screen.getByRole("button", { name: "Reorder Ben" });
      grip.focus();
      fireEvent.keyDown(grip, { key: "ArrowDown" });
      await waitFor(() => expect(mockAssign).toHaveBeenCalledTimes(1));
      // Still focused and enabled mid-save, so the arrows keep working.
      const moved = screen.getByRole("button", { name: "Reorder Ben" });
      expect(moved).toBeEnabled();
      expect(moved).toHaveFocus();
      fireEvent.keyDown(moved, { key: "ArrowUp" });
      expect(
        within(screen.getByRole("list", { name: "Members of Alpha" }))
          .getAllByRole("listitem")
          .map((item) => item.textContent),
      ).toEqual([
        expect.stringMatching(/^1Ben/),
        expect.stringMatching(/^2Ada/),
      ]);
      // Not sent until the first save has settled…
      expect(mockAssign).toHaveBeenCalledTimes(1);
      release();
      await waitFor(() => expect(mockAssign).toHaveBeenCalledTimes(2));
      // …then worked out against the roster as saved: Ada 1, Ben 2.
      expect(mockAssign).toHaveBeenLastCalledWith([
        { member_id: "m2", pledge_class_id: "alpha", order_number: 1 },
        { member_id: "m1", pledge_class_id: "alpha", order_number: 2 },
      ]);
    });

    it("says a refused change failed and puts the rows back", async () => {
      mockAssign.mockRejectedValue(new Error("nope"));
      openAlpha();
      await userEvent.click(
        screen.getByRole("button", { name: "Remove Ada from Alpha" }),
      );
      await waitFor(() =>
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Couldn't save Alpha",
            description: "Nothing was changed. Try again in a moment.",
            variant: "destructive",
          }),
        ),
      );
      expect(
        await screen.findByRole("button", { name: "Remove Ada from Alpha" }),
      ).toBeInTheDocument();
    });

    it("puts the rows back on a refusal even when the roster can't be read again", async () => {
      mockAssign.mockRejectedValue(new Error("nope"));
      rereadWorks = false;
      openAlpha();
      await userEvent.click(
        screen.getByRole("button", { name: "Remove Ada from Alpha" }),
      );
      await waitFor(() =>
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Couldn't save Alpha" }),
        ),
      );
      expect(
        await screen.findByRole("button", { name: "Remove Ada from Alpha" }),
      ).toBeInTheDocument();
    });

    it("keeps a saved change on screen when the roster can't be read again", async () => {
      rereadWorks = false;
      openAlpha();
      await userEvent.click(
        screen.getByRole("button", { name: "Remove Ada from Alpha" }),
      );
      await waitFor(() => expect(mockAssign).toHaveBeenCalledTimes(1));
      expect(
        screen.queryByRole("button", { name: "Remove Ada from Alpha" }),
      ).toBeNull();
      expect(mockToast).not.toHaveBeenCalled();
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
      await waitFor(() =>
        expect(mockAssign).toHaveBeenCalledWith([
          { member_id: "m3", pledge_class_id: "alpha", order_number: 3 },
        ]),
      );
    });

    it("takes a member out of the class at once and keeps their number", async () => {
      openAlpha();
      await userEvent.click(
        screen.getByRole("button", { name: "Remove Ada from Alpha" }),
      );
      await waitFor(() =>
        expect(mockAssign).toHaveBeenCalledWith([
          { member_id: "m1", pledge_class_id: null, order_number: 2 },
        ]),
      );
      expect(h.push).not.toHaveBeenCalled();
    });

    it("leaves alone a member another officer added while the page was open", async () => {
      const view = renderClassPage("alpha");
      // A background re-read brings in Dee, now in Alpha.
      server = [...MEMBERS.slice(0, 3), member("m4", "Dee", "alpha", 3)];
      mockMembers.mockReturnValue({
        data: server,
        isError: false,
        refetch: vi.fn(async () => ({ data: server })),
      });
      view.rerender(tab());
      expect(mockAssign).not.toHaveBeenCalled();
      await userEvent.click(
        screen.getByRole("button", { name: "Remove Ada from Alpha" }),
      );
      await waitFor(() =>
        expect(mockAssign).toHaveBeenCalledWith([
          { member_id: "m1", pledge_class_id: null, order_number: 2 },
        ]),
      );
      // The re-read after the save brings Dee onto the page.
      expect(
        await screen.findByRole("button", { name: "Remove Dee from Alpha" }),
      ).toBeInTheDocument();
    });
  });
});

/**
 * Each member change saves the moment it is made (#6033), so there is no
 * draft to keep (#4593's kept drafts are gone): leaving the page and coming
 * back shows the roster as the server holds it.
 */
describe("SettingsClassesTab saves member changes on their own (#6033)", () => {
  beforeEach(resetMocks);

  const removeAda = () =>
    userEvent.click(
      screen.getByRole("button", { name: "Remove Ada from Alpha" }),
    );

  it("opens on the roster as saved after going back to the list, with no draft note", async () => {
    const view = renderClassPage("alpha");
    await removeAda();
    await waitFor(() => expect(mockAssign).toHaveBeenCalledTimes(1));
    // The list re-reads the roster the save wrote.
    mockMembers.mockReturnValue({
      data: server,
      isError: false,
      refetch: vi.fn(async () => ({ data: server })),
    });
    go(view, "tab=classes");
    expect(screen.queryByRole("list", { name: "Members of Alpha" })).toBeNull();
    go(view, "tab=classes&class=alpha");
    expect(
      screen.queryByRole("button", { name: "Remove Ada from Alpha" }),
    ).toBeNull();
    expect(screen.queryByText("Draft restored")).toBeNull();
    expect(screen.queryByRole("button", { name: "Discard" })).toBeNull();
  });

  it("keeps nothing for a change the server refused", async () => {
    mockAssign.mockRejectedValue(new Error("nope"));
    const first = renderClassPage("alpha");
    await removeAda();
    await waitFor(() => expect(mockToast).toHaveBeenCalled());
    first.unmount();

    renderClassPage("alpha");
    expect(
      screen.getByRole("button", { name: "Remove Ada from Alpha" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Draft restored")).toBeNull();
  });

  it("keeps each class's roster apart", async () => {
    const view = renderClassPage("alpha");
    await removeAda();
    await waitFor(() => expect(mockAssign).toHaveBeenCalledTimes(1));
    go(view, "tab=classes&class=beta");
    expect(
      screen.getByRole("button", { name: "Remove Cal from Beta" }),
    ).toBeInTheDocument();
  });

  it("shows a viewer without roles:manage the class as saved, with nothing to change", () => {
    renderClassPage("alpha", false);
    expect(screen.queryByLabelText("Add a member")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Remove Ada from Alpha" }),
    ).toBeNull();
    expect(
      within(screen.getByRole("list", { name: "Members of Alpha" }))
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["1Ben", "2Ada"]);
  });
});
