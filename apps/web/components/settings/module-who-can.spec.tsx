import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { markupLines } from "@/tests/stable-markup";

const state = vi.hoisted(() => ({ toggle: vi.fn() }));

const tier = (id: string, name: string, position: number) => ({
  id,
  name,
  position,
  permissions: [] as string[],
  mentionable: true,
});
const role = (
  id: string,
  name: string,
  color: string | null,
  order: number,
) => ({
  id,
  name,
  color,
  permissions: [] as string[],
  is_system: false,
  system_key: null,
  display_order: order,
  mentionable: true,
  tier_id: null,
  permission_overrides: {},
});

vi.mock("@/components/roles/use-roles-data", () => ({
  useRolesData: () => ({
    rolesQuery: { isPending: false, isError: false },
    tiersQuery: { isPending: false, isError: false },
    roles: [
      role("r-social", "Social Chair", "#ff0000", 1),
      role("r-new", "New Member", null, 2),
    ],
    tiers: [tier("t-exec", "Exec board", 1), tier("t-chairs", "Chairs", 2)],
    reach: { wildcard: true, known: true, rank: 0, held: new Set<string>() },
    words: {
      Singular: "Board",
      Plural: "Boards",
      singular: "board",
      plural: "boards",
    },
  }),
}));

vi.mock("@/components/roles/use-role-permission-toggle", () => {
  const toggle = () => ({
    permissionsOf: (holder: { permissions: string[] }) => holder.permissions,
    pending: null,
    toggle: state.toggle,
  });
  return { useRolePermissionToggle: toggle, useTierPermissionToggle: toggle };
});

vi.mock("@repo/hooks/module-settings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/hooks/module-settings")>()),
  modulePermissions: () => [
    {
      permission: "events:create",
      label: "Create events",
      description: "Put an event on the calendar.",
    },
  ],
}));

const { WhoCanPermissionPage } = await import("./module-who-can");

async function openAdd() {
  const user = userEvent.setup();
  render(<WhoCanPermissionPage permission="events:create" canEdit />);
  await user.click(screen.getByRole("button", { name: "Add a role" }));
  return user;
}

/**
 * Chapter settings → Events → Who can → Create events (#4073, #6030): the
 * tiers as switches under the chapter's own word for them, and an officer
 * setting a role apart from its tier from the "Add a role" picker, which
 * shares its shell with Goals' "Different goal for a role" (#4608).
 */
describe("a permission's Who can page", () => {
  beforeEach(() => state.toggle.mockReset());

  it("draws the tiers as switches under the chapter's word for them", () => {
    render(<WhoCanPermissionPage permission="events:create" canEdit />);
    // The chapter calls its tiers "boards", not the default "tiers", so a
    // heading that ignored the chapter's word would show here.
    const boards = screen.getByRole("list", { name: "Boards" });
    expect(
      within(boards)
        .getAllByRole("switch")
        .map((control) => control.getAttribute("aria-checked")),
    ).toEqual(["false", "false"]);
    expect(within(boards).getByText("Exec board")).toBeInTheDocument();
    expect(within(boards).getByText("Chairs")).toBeInTheDocument();
  });

  it("grants a tier from its switch", async () => {
    const user = userEvent.setup();
    render(<WhoCanPermissionPage permission="events:create" canEdit />);
    await user.click(screen.getByRole("switch", { name: "Chairs" }));
    expect(state.toggle).toHaveBeenCalledWith(
      expect.objectContaining({ id: "t-chairs" }),
      "events:create",
      false,
    );
  });

  it("lists only roles under Add a role, since tiers are the switches", async () => {
    await openAdd();
    expect(screen.getByRole("combobox")).toHaveAttribute(
      "placeholder",
      "Find a role",
    );
    expect(
      screen.getAllByRole("option").map((option) => option.textContent),
    ).toEqual(["Social Chair", "New Member"]);
  });

  it("filters by the start of a word", async () => {
    const user = await openAdd();
    await user.type(screen.getByPlaceholderText("Find a role"), "cha");
    expect(
      screen.getAllByRole("option").map((option) => option.textContent),
    ).toEqual(["Social Chair"]);
  });

  it("doesn't match the middle of a word", async () => {
    const user = await openAdd();
    await user.type(screen.getByPlaceholderText("Find a role"), "air");
    expect(screen.queryByRole("option")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Nothing matches “air”.",
    );
  });

  it("says when nothing matches", async () => {
    const user = await openAdd();
    await user.type(screen.getByPlaceholderText("Find a role"), "zz ");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Nothing matches “zz”.",
    );
    expect(markupLines(screen.getByRole("status"))).toMatchInlineSnapshot(`
      [
        "<p class="px-2 py-3 text-sm text-muted" role="status">Nothing matches “zz”.",
      ]
    `);
  });

  it("clears the search on Escape before it closes", async () => {
    const user = await openAdd();
    const input = screen.getByPlaceholderText("Find a role");
    await user.type(input, "social");
    await user.keyboard("{Escape}");
    expect(input).toHaveValue("");
    expect(
      screen.getByRole("option", { name: "New Member" }),
    ).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("grants the pick and closes", async () => {
    const user = await openAdd();
    await user.click(screen.getByRole("option", { name: "Social Chair" }));
    expect(state.toggle).toHaveBeenCalledWith(
      expect.objectContaining({ id: "r-social" }),
      "events:create",
      false,
    );
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("draws the picker exactly as before", async () => {
    await openAdd();
    expect(markupLines(screen.getByRole("button", { name: "Add a role" })))
      .toMatchInlineSnapshot(`
      [
        "<button aria-expanded="true" aria-haspopup="dialog" class="flex min-h-11 w-full items-center gap-4 px-4 py-2.5 text-left text-sm text-muted-foreground transition hover:bg-card-hover hover:text-foreground group-first:rounded-t-[13px] group-last:rounded-b-[13px] focus-visible:outline-none focus-visible:border-accent-text focus-visible:ring-[3px] focus-visible:ring-ring/25" data-radix-popper-align="start" data-radix-popper-side="bottom" data-state="open" type="button">Add a role",
        "  <svg aria-hidden="true" class="lucide lucide-plus h-[18px] w-[18px] shrink-0">",
      ]
    `);
    expect(markupLines(screen.getByRole("dialog"))).toMatchInlineSnapshot(`
      [
        "<div class="z-50 rounded-md border border-border bg-popover text-popover-foreground outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-(--radix-popover-content-transform-origin) w-max min-w-[14rem] max-w-[min(22rem,calc(100vw-2rem))] p-0" data-align="start" data-side="bottom" data-state="open" role="dialog" style="--radix-popover-content-transform-origin: var(--radix-popper-transform-origin); --radix-popover-content-available-width: var(--radix-popper-available-width); --radix-popover-content-available-height: var(--radix-popper-available-height); --radix-popover-trigger-width: var(--radix-popper-anchor-width); --radix-popover-trigger-height: var(--radix-popper-anchor-height);" tabindex="-1">",
        "  <div class="flex h-full w-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground outline-none" cmdk-root="" tabindex="-1">",
        "    <label cmdk-label="" style="position: absolute; width: 1px; height: 1px; padding: 0px; margin: -1px; overflow: hidden; clip: rect(0px, 0px, 0px, 0px); white-space: nowrap; border-width: 0px;">Role to add",
        "    <div class="flex items-center border-b border-border px-3" cmdk-input-wrapper="">",
        "      <svg aria-hidden="true" class="lucide lucide-search mr-2 h-4 w-4 shrink-0 text-muted">",
        "      <input aria-autocomplete="list" aria-expanded="true" autocomplete="off" autocorrect="off" class="flex w-full rounded-md bg-transparent text-foreground caret-primary outline-none placeholder:text-muted disabled:cursor-not-allowed disabled:text-disabled h-control-small py-2 text-sm pointer-coarse:h-11 pointer-coarse:text-base" cmdk-input="" placeholder="Find a role" role="combobox" spellcheck="false" type="text" value="">",
        "    <div aria-label="Suggestions" class="overflow-y-auto overflow-x-hidden max-h-72 p-1" cmdk-list="" role="listbox" tabindex="-1">",
        "      <div cmdk-list-sizer="">",
        "        <div aria-disabled="false" aria-selected="true" class="relative flex cursor-default select-none items-center rounded-xs px-2 py-1 outline-none transition-colors data-[disabled=true]:pointer-events-none data-[selected=true]:bg-card-hover data-[selected=true]:text-foreground data-[disabled=true]:text-disabled [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 min-h-control-row gap-2 text-sm pointer-coarse:min-h-11 pointer-coarse:text-base" cmdk-item="" data-disabled="false" data-selected="true" data-value="r-social" role="option">",
        "          <span aria-hidden="true" class="h-2 w-2 shrink-0 rounded-full bg-muted-foreground" style="background-color: rgb(255, 0, 0);">",
        "          <span class="min-w-0 flex-1 break-words">Social Chair",
        "        <div aria-disabled="false" aria-selected="false" class="relative flex cursor-default select-none items-center rounded-xs px-2 py-1 outline-none transition-colors data-[disabled=true]:pointer-events-none data-[selected=true]:bg-card-hover data-[selected=true]:text-foreground data-[disabled=true]:text-disabled [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 min-h-control-row gap-2 text-sm pointer-coarse:min-h-11 pointer-coarse:text-base" cmdk-item="" data-disabled="false" data-selected="false" data-value="r-new" role="option">",
        "          <span aria-hidden="true" class="h-2 w-2 shrink-0 rounded-full bg-muted-foreground">",
        "          <span class="min-w-0 flex-1 break-words">New Member",
      ]
    `);
  });
});
