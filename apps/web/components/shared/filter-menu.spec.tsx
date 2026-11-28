import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type FilterRow } from "@repo/hooks/filter-rows";
import { ActiveFilterChips, FilterMenu } from "./filter-menu";

/*
 * The one web filter bar (rulebook § 9): a Filter button with a count, one
 * row per filter, Clear all in the menu, and the filters that are on as
 * removable chips under the header.
 */

function Harness({
  manyRoles = false,
  roleList,
}: {
  manyRoles?: boolean;
  roleList?: { value: string; label: string }[];
}) {
  const [status, setStatus] = useState("any");
  const [role, setRole] = useState("any");
  const roles =
    roleList ??
    (manyRoles
      ? Array.from({ length: 12 }, (_, i) => ({
          value: `r${i}`,
          label: `Role ${i}`,
        }))
      : [{ value: "chair", label: "Chair" }]);
  const filters: FilterRow[] = [
    {
      key: "status",
      label: "Status",
      options: [
        { value: "any", label: "Any" },
        { value: "active", label: "Active" },
      ],
      value: status,
      anyValue: "any",
      onChange: setStatus,
    },
    {
      key: "role",
      label: "Role",
      options: [{ value: "any", label: "Any" }, ...roles],
      value: role,
      anyValue: "any",
      onChange: setRole,
    },
  ];
  return (
    <>
      <FilterMenu filters={filters} thing="members" />
      <ActiveFilterChips filters={filters} />
    </>
  );
}

async function pick(
  user: ReturnType<typeof userEvent.setup>,
  group: string,
  option: string,
) {
  if (!screen.queryByRole("menu")) {
    await user.click(screen.getByRole("button", { name: /^Filter members/ }));
  }
  screen.getByRole("menuitem", { name: new RegExp(`^${group}`) }).focus();
  await user.keyboard("{ArrowRight}");
  await user.click(await screen.findByRole("menuitemradio", { name: option }));
}

describe("FilterMenu", () => {
  it("counts the filters that are on and removes one from its chip", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await pick(user, "Status", "Active");
    await pick(user, "Role", "Chair");

    expect(
      screen.getByRole("button", { name: "Filter members, 2 on" }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Remove filter Status: Active" }),
    );
    expect(
      screen.getByRole("button", { name: "Filter members, 1 on" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Remove filter Status: Active" }),
    ).not.toBeInTheDocument();
    // Focus stays in the row instead of falling to the top of the page.
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(
      screen.getByRole("button", { name: "Remove filter Role: Chair" }),
    ).toHaveFocus();

    await user.click(
      screen.getByRole("button", { name: "Remove filter Role: Chair" }),
    );
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(
      screen.getByRole("button", { name: "Filter members" }),
    ).toHaveFocus();
  });

  it("clears every filter from the menu's Clear all", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await pick(user, "Status", "Active");

    await user.click(screen.getByRole("button", { name: /^Filter members/ }));
    await user.click(screen.getByRole("menuitem", { name: "Clear all" }));
    expect(
      screen.getByRole("button", { name: "Filter members" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Remove filter/ }),
    ).not.toBeInTheDocument();
  });

  it("offers a search field once a filter has many options", async () => {
    const user = userEvent.setup();
    render(<Harness manyRoles />);
    await user.click(screen.getByRole("button", { name: "Filter members" }));
    screen.getByRole("menuitem", { name: /^Role/ }).focus();
    await user.keyboard("{ArrowRight}");
    await user.type(await screen.findByLabelText("Search role"), "11");
    expect(
      screen.getByRole("menuitemradio", { name: "Role 11" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitemradio", { name: "Role 2" }),
    ).not.toBeInTheDocument();
  });

  const LONG_ROLES = [
    { value: "vp", label: "Vice President" },
    { value: "pres", label: "Président" },
    { value: "rush", label: "Rush/Recruitment Chair" },
    { value: "treas", label: "Treasurer" },
    ...Array.from({ length: 6 }, (_, i) => ({
      value: `c${i}`,
      label: `Committee ${i}`,
    })),
  ];

  async function openRoleSearch(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: /^Filter members/ }));
    screen.getByRole("menuitem", { name: /^Role/ }).focus();
    await user.keyboard("{ArrowRight}");
    return screen.findByLabelText("Search role");
  }

  const shownRoles = () =>
    screen.queryAllByRole("menuitemradio").map((item) => item.textContent);

  // As the filter chip searched, and the phone does (`matchesWordStarts`).
  it("matches word starts, ignoring accents and punctuation, never mid-word", async () => {
    const user = userEvent.setup();
    render(<Harness roleList={LONG_ROLES} />);
    const field = await openRoleSearch(user);

    await user.type(field, "vi pre");
    expect(shownRoles()).toEqual(["Vice President"]);
    await user.clear(field);
    // Accents ignored: "presi" finds the plain and the accented one.
    await user.type(field, "presi");
    expect(shownRoles()).toEqual(["Vice President", "Président"]);
    await user.clear(field);
    await user.type(field, "rush recr");
    expect(shownRoles()).toEqual(["Rush/Recruitment Chair"]);
    await user.clear(field);
    // "as" sits inside "Treasurer", so it is no match.
    await user.type(field, "as");
    expect(screen.queryAllByRole("menuitemradio")).toHaveLength(0);
    expect(screen.getByText("No matches")).toBeInTheDocument();
  });

  it("puts the any row aside while a query is typed, so a query can't clear the filter", async () => {
    const user = userEvent.setup();
    render(<Harness roleList={LONG_ROLES} />);
    const field = await openRoleSearch(user);
    expect(shownRoles()[0]).toBe("Any");

    // "a" starts "Any", and the row still steps aside.
    await user.type(field, "a");
    expect(shownRoles()).not.toContain("Any");
  });

  // Punctuation alone, on the way to "(Exec)", is no query yet: the list stays
  // whole with Any first, and Enter picks nothing (#5739, the phone's rule).
  it("treats punctuation alone as no query", async () => {
    const user = userEvent.setup();
    render(<Harness roleList={LONG_ROLES} />);
    const field = await openRoleSearch(user);
    await user.type(field, "(");
    expect(shownRoles()[0]).toBe("Any");
    expect(shownRoles()).toHaveLength(LONG_ROLES.length + 1);
    await user.keyboard("{Enter}");
    expect(
      screen.queryByRole("button", { name: /^Remove filter Role/ }),
    ).not.toBeInTheDocument();
  });

  it("counts only real options toward the search threshold", async () => {
    const user = userEvent.setup();
    // Eight roles plus Any is still a short list.
    render(<Harness roleList={LONG_ROLES.slice(0, 8)} />);
    await user.click(screen.getByRole("button", { name: /^Filter members/ }));
    screen.getByRole("menuitem", { name: /^Role/ }).focus();
    await user.keyboard("{ArrowRight}");
    await screen.findAllByRole("menuitemradio");
    expect(screen.queryByLabelText("Search role")).not.toBeInTheDocument();
  });

  it("picks the first match on Enter, and Escape clears a query before it closes", async () => {
    const user = userEvent.setup();
    render(<Harness roleList={LONG_ROLES} />);
    let field = await openRoleSearch(user);

    await user.type(field, "zzz");
    await user.keyboard("{Escape}");
    expect(field).toHaveValue("");
    expect(screen.getByLabelText("Search role")).toBeInTheDocument();
    await user.keyboard("{Escape}{Escape}");

    field = await openRoleSearch(user);
    await user.type(field, "trea");
    await user.keyboard("{Enter}");
    expect(
      screen.getByRole("button", { name: "Remove filter Role: Treasurer" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
