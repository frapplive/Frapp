import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemberFacingError, type EventType } from "@repo/hooks";
import { EventTypeRow } from "@/components/events/event-type-picker";

/*
 * The event form's Type row on the shared Type menu (`shared/type-menu.tsx`,
 * `spec/ui/design-system/components.md` § Type menu): picking, Create in
 * place, and each type's edit view (name, points, attendance, Delete type)
 * inside the menu, which replaced the "Edit types" popover (Paul 2026-11-22).
 */

const { mockCreate, mockUpdate, mockDelete, typesState } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn(),
  typesState: { data: [] as EventType[] },
}));

vi.mock("@repo/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/hooks")>()),
  useEventTypes: () => ({ data: typesState.data, isLoading: false }),
  useCreateEventType: () => ({ mutateAsync: mockCreate, isPending: false }),
  useUpdateEventType: () => ({ mutateAsync: mockUpdate, isPending: false }),
  useDeleteEventType: () => ({ mutateAsync: mockDelete, isPending: false }),
}));

function eventType(
  id: string,
  name: string,
  point_value: number,
  is_mandatory: boolean,
): EventType {
  return {
    id,
    chapter_id: "chap-1",
    name,
    point_value,
    is_mandatory,
    position: 1,
    created_at: "",
    updated_at: "",
  };
}

const TYPES = [
  eventType("t-1", "Chapter meeting", 10, true),
  eventType("t-2", "Social", 1, false),
];

const fromForm = (name: string) => ({
  name,
  point_value: 7,
  is_mandatory: false,
});

function renderRow({
  canManage = true,
  value = null as string | null,
  onPick = vi.fn(),
  onOuterSubmit = vi.fn((event: React.FormEvent) => event.preventDefault()),
} = {}) {
  render(
    <form onSubmit={onOuterSubmit}>
      <EventTypeRow
        value={value}
        onPick={onPick}
        canManage={canManage}
        showSets
        typeFromForm={fromForm}
      />
    </form>,
  );
  return { onPick, onOuterSubmit };
}

async function openMenu() {
  await userEvent.click(screen.getByRole("button", { name: /^Type: / }));
}

beforeEach(() => {
  mockCreate
    .mockReset()
    .mockResolvedValue(eventType("t-3", "Work party", 7, false));
  mockUpdate.mockReset().mockResolvedValue({});
  mockDelete.mockReset().mockResolvedValue({});
  typesState.data = TYPES;
});

describe("EventTypeRow on the shared Type menu", () => {
  it("has no separate Edit types control and no explainer header", async () => {
    renderRow();
    expect(screen.queryByRole("button", { name: /edit types/i })).toBeNull();
    await openMenu();
    expect(screen.queryByText("Event types")).toBeNull();
    expect(
      screen.getByRole("option", { name: /^No type/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /Chapter meeting.*10 points/ }),
    ).toBeInTheDocument();
  });

  it("picks a type and closes", async () => {
    const { onPick } = renderRow();
    await openMenu();
    await userEvent.click(screen.getByRole("option", { name: /^Social/ }));
    expect(onPick).toHaveBeenCalledWith(TYPES[1]);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("makes a typed type in place and holds it", async () => {
    const { onPick } = renderRow();
    await openMenu();
    await userEvent.type(
      screen.getByPlaceholderText("Find or add a type"),
      "  Work   party",
    );
    await userEvent.click(
      screen.getByRole("option", { name: "Create “Work party”" }),
    );
    expect(mockCreate).toHaveBeenCalledWith(fromForm("Work party"));
    await waitFor(() =>
      expect(onPick).toHaveBeenCalledWith(
        expect.objectContaining({ id: "t-3" }),
        true,
      ),
    );
  });

  it("offers no Create for a name a type already has", async () => {
    renderRow();
    await openMenu();
    await userEvent.type(
      screen.getByPlaceholderText("Find or add a type"),
      "social",
    );
    expect(screen.queryByRole("option", { name: /^Create/ })).toBeNull();
  });

  it("keeps a member to picking: no Create and no edit buttons", async () => {
    renderRow({ canManage: false });
    await openMenu();
    expect(screen.queryByPlaceholderText("Find or add a type")).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit Social" })).toBeNull();
  });

  it("edits a type in the menu and saves on Enter, without sending the form around it", async () => {
    const { onPick, onOuterSubmit } = renderRow();
    await openMenu();
    await userEvent.click(screen.getByRole("button", { name: "Edit Social" }));
    // The edit button opens the type; it does not pick it.
    expect(onPick).not.toHaveBeenCalled();

    const name = screen.getByLabelText("Name");
    await userEvent.clear(name);
    await userEvent.type(name, "Mixer");
    const points = screen.getByLabelText("Points");
    await userEvent.clear(points);
    await userEvent.type(points, "3");
    await userEvent.click(screen.getByRole("radio", { name: "Required" }));
    await userEvent.type(name, "{Enter}");

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith({
        id: "t-2",
        body: { name: "Mixer", point_value: 3, is_mandatory: true },
      }),
    );
    expect(onOuterSubmit).not.toHaveBeenCalled();
    // Back on the list.
    expect(
      await screen.findByRole("option", { name: /^No type/ }),
    ).toBeInTheDocument();
  });

  it("leaves an unchanged type without saving", async () => {
    renderRow();
    await openMenu();
    await userEvent.click(screen.getByRole("button", { name: "Edit Social" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Back to types" }),
    );
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(screen.getByRole("option", { name: /^Social/ })).toBeInTheDocument();
  });

  it("says a refused save in place and stays in the edit view", async () => {
    mockUpdate.mockRejectedValueOnce(
      new MemberFacingError("A type called Social already exists."),
    );
    renderRow();
    await openMenu();
    await userEvent.click(
      screen.getByRole("button", { name: "Edit Chapter meeting" }),
    );
    const name = screen.getByLabelText("Name");
    await userEvent.clear(name);
    await userEvent.type(name, "Social{Enter}");
    expect(
      await screen.findByText("A type called Social already exists."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it("refuses an empty name inline", async () => {
    renderRow();
    await openMenu();
    await userEvent.click(screen.getByRole("button", { name: "Edit Social" }));
    await userEvent.clear(screen.getByLabelText("Name"));
    await userEvent.type(screen.getByLabelText("Name"), "{Enter}");
    expect(
      await screen.findByText("Give the type a name."),
    ).toBeInTheDocument();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("deletes a type after a confirm in place", async () => {
    renderRow();
    await openMenu();
    await userEvent.click(screen.getByRole("button", { name: "Edit Social" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete type" }));
    expect(
      screen.getByText("Its events keep their points and lose the type."),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Keep" }));
    expect(mockDelete).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Delete type" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith("t-2"));
  });

  it("saves an open edit when the menu is closed", async () => {
    renderRow();
    await openMenu();
    await userEvent.click(screen.getByRole("button", { name: "Edit Social" }));
    await userEvent.type(screen.getByLabelText("Name"), "s");
    await userEvent.click(document.body);
    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith({
        id: "t-2",
        body: { name: "Socials", point_value: 1, is_mandatory: false },
      }),
    );
  });
});
