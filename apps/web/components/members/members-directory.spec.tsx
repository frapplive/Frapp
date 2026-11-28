import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, it, expect, beforeEach, vi } from "vitest";
import { setAddress } from "@/tests/address-search-params";
import { networkMock } from "@/tests/network";

/**
 * The greenfield Directory lane's acceptance, pinned.
 *
 * `members-directory.tsx` had **no** test file before this one, which is the
 * same gap lane 2 closed for the shell (`dashboard-shell.spec.tsx`) when it
 * rewrote it. The cases below are deliberately about the things
 * [`spec/ui/web-dashboard/README.md`](../../../../spec/ui/web-dashboard/README.md)
 * § Page grammar and § Directory claim — a card that is gone, a table that is
 * gone, a row that is now the control, and one empty state that became three —
 * rather than about the
 * layout in general. A suite that asserted the whole render would go red on
 * every future restyle without telling anyone which rule broke.
 */

const { mockOffline, mutateRoles } = vi.hoisted(() => ({
  mockOffline: { value: false },
  mutateRoles: vi.fn(),
}));

type Read = {
  data: unknown;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
};

function read(data: unknown = []): Read {
  return { data, isLoading: false, isError: false, refetch: vi.fn() };
}

const MEMBERS = [
  {
    id: "m-1",
    user_id: "u-1",
    chapter_id: "chap-1",
    role_ids: ["r-1"],
    has_completed_onboarding: true,
    created_at: "2024-08-14T00:00:00.000Z",
    updated_at: "2024-08-14T00:00:00.000Z",
    display_name: "Ada Lovelace",
    avatar_url: null,
    bio: null,
    graduation_year: 2026,
    current_city: null,
    current_company: null,
    email: "ada@example.test",
  },
  {
    // No role and an unparseable join date: the two fields that used to render
    // an em dash. They must now be absent from the meta line, not dashed.
    id: "m-2",
    user_id: "u-2",
    chapter_id: "chap-1",
    role_ids: [],
    has_completed_onboarding: false,
    created_at: "not-a-date",
    updated_at: "not-a-date",
    display_name: "Grace Hopper",
    avatar_url: null,
    bio: null,
    graduation_year: 2027,
    current_city: null,
    current_company: null,
    email: "grace@example.test",
  },
];

/** Opens a toolbar chip by its accessible name and picks one of its rows. */
type User = ReturnType<typeof userEvent.setup>;

/** The toolbar's one Filter button (#5739). */
const filterButton = () =>
  screen.getByRole("button", { name: /^Filter members/ });

/** A row of the open Filter menu: its label, then its current value. */
const filterRow = (row: string) =>
  screen.queryByRole("menuitem", { name: new RegExp(`^${row}`) });

async function openFilterMenu(user: User) {
  if (screen.queryAllByRole("menu").length === 0) {
    await user.click(filterButton());
  }
}

async function closeFilterMenu(user: User) {
  for (let i = 0; i < 3 && screen.queryAllByRole("menu").length > 0; i++) {
    await user.keyboard("{Escape}");
  }
}

/** Opens a row's options in the Filter menu. */
async function openFilterRow(user: User, row: string) {
  await openFilterMenu(user);
  const item = filterRow(row);
  if (!item) throw new Error(`No "${row}" row in the Filter menu`);
  // The keyboard path: a pointer that leaves the row for its side list can
  // close the list first in jsdom.
  item.focus();
  await user.keyboard("{ArrowRight}");
}

/** Picks one of a Filter menu row's options; picking closes the menu. */
async function pick(user: User, row: string, option: string) {
  await openFilterRow(user, row);
  await user.click(await screen.findByRole("menuitemradio", { name: option }));
  await closeFilterMenu(user);
}

/** Picks from the bulk bar's Assign role chip. */
async function pickChip(user: User, chip: string, option: string) {
  await user.click(screen.getByRole("button", { name: chip }));
  await user.click(await screen.findByRole("menuitem", { name: option }));
}

/** A row's options, in order; the menu closes again. */
async function rowOptions(user: User, row: string): Promise<string[]> {
  await openFilterRow(user, row);
  const options = (await screen.findAllByRole("menuitemradio")).map(
    (item) => item.textContent ?? "",
  );
  await closeFilterMenu(user);
  return options;
}

/** Whether the Filter menu has this row; the menu closes again. */
async function hasFilterRow(user: User, row: string): Promise<boolean> {
  await openFilterMenu(user);
  const has = filterRow(row) !== null;
  await closeFilterMenu(user);
  return has;
}

/** The value a row shows beside its label; the menu closes again. */
async function rowValue(user: User, row: string): Promise<string> {
  await openFilterMenu(user);
  const item = filterRow(row);
  const value = item?.querySelectorAll("span")[1]?.textContent ?? "";
  await closeFilterMenu(user);
  return value;
}

const membersRead = read(MEMBERS);
const searchRead = read([]);
const rolesRead = read([
  { id: "r-1", name: "Treasurer", is_system: false, permissions: [] },
]);
const leaderboardRead = read([{ user_id: "u-1", total: 42 }]);

const classesRead = read([]);

/** The member view's tenant: a chapter unless a test makes it a council (#5933). */
const tenant = vi.hoisted(() => ({ council: false }));

/** What `useMemberPhoneReach` answers: `null` until a test sets it. */
const phoneReachRead = vi.hoisted(() => ({
  value: null as null | {
    scope: "chapter" | "self";
    byUserId: Map<string, unknown>;
  },
}));

import { useChapterStore } from "@/lib/stores/chapter-store";

// The live-meeting card has its own spec (#5219).
vi.mock("@/components/meetings/live-meeting-card", () => ({
  LiveMeetingCard: () => null,
}));

const tiersRead = vi.hoisted(() => ({
  data: [] as Array<{ id: string; position: number }> | undefined,
  isError: false,
}));

/** The viewer's permissions: none until a test gives them `roles:manage`. */
const permissionsRead = vi.hoisted(() => ({
  data: { permissions: [] as string[] },
}));

const groupsRead = vi.hoisted(() => ({
  data: [
    { id: "g-house", name: "In house", kind: "manual", member_ids: ["u-1"] },
    { id: "g-empty", name: "Nobody yet", kind: "manual", member_ids: [] },
  ] as Array<{ id: string; name: string; kind: string; member_ids: string[] }>,
}));

vi.mock("@repo/hooks", async (importOriginal) => {
  // The fraternal-order sort is the real one: it is what this screen promises.
  const actual = await importOriginal<typeof import("@repo/hooks")>();
  return {
    fraternalOrderComparator: actual.fraternalOrderComparator,
    usesFraternalOrder: actual.usesFraternalOrder,
    matchesRoleFilter: actual.matchesRoleFilter,
    NO_BASE_ROLE_FILTER: actual.NO_BASE_ROLE_FILTER,
    NO_BASE_ROLE_LABEL: actual.NO_BASE_ROLE_LABEL,
    useMyPermissions: () => permissionsRead,
    usePledgeClasses: () => classesRead,
    useMemberDisplayNames: () => ({ avatarTintFor: () => null }),
    // The List/Grid pick is kept per viewer (#4175).
    useViewerUserId: () => "viewer-1",
    useMembers: () => membersRead,
    // A member= the roster lacks is looked for among the alumni (#6046).
    useAlumni: () => ({ data: [], isFetching: false }),
    useMemberSearch: (q: string) => (q ? searchRead : membersRead),
    useRoles: () => rolesRead,
    useRoleTiers: () => tiersRead,
    useGroups: () => groupsRead,
    useLeaderboard: () => leaderboardRead,
    DEFAULT_STANDINGS_WINDOW: "semester",
    // The standings model has its own spec (`standings.spec.ts`); here it
    // answers from the period's board the test sets.
    useStandings: (metric: string | null, window: string) => {
      standings.asked.push([metric, window]);
      const board = metric ? (standings.boards[metric] ?? {}) : {};
      const totals = Object.values(board);
      return {
        windowOptions: [
          { value: "semester", label: "This semester" },
          { value: "month", label: "This month" },
          { value: "all", label: "All time" },
        ],
        window,
        totalOf: (id: string) => board[id] ?? 0,
        rankOf: (id: string) =>
          (board[id] ?? 0) > 0
            ? totals.filter((total) => total > (board[id] ?? 0)).length + 1
            : null,
        figure: (total: number) =>
          metric === "service" ? `${total / 60} hours` : `${total} points`,
        isLoading: false,
        isError: standings.isError,
        refetch: standings.refetch,
      };
    },
    useMemberPhoneReach: () => ({ reach: phoneReachRead.value }),
    // The member view, which every member can read. The config read refuses
    // every seeded role below President (#2957), so the directory must not
    // depend on it; it reports that refusal here rather than being left out.
    useCurrentChapter: () => ({
      data: tenant.council
        ? {
            org_archetype: "council",
            kind: "council",
            council_type: "ifc",
            enabled_modules: { points: false, members: true },
            vocabulary: {},
          }
        : {
            org_archetype: "ifc",
            vocabulary: { class: "Line", order: "Roll number" },
          },
    }),
    useOrgConfig: () => ({ data: undefined, isError: true }),
    useUpdateMemberRoles: () => ({
      mutateAsync: mutateRoles,
      isPending: false,
    }),
  };
});

vi.mock("@/lib/providers/network-provider", () => networkMock(mockOffline));

const standings = vi.hoisted(() => ({
  boards: {} as Record<string, Record<string, number>>,
  asked: [] as [string | null, string][],
  isError: false,
  refetch: vi.fn(),
}));
const modules = vi.hoisted(() => ({ off: new Set<string>() }));
vi.mock("@/lib/hooks/use-chapter-module-gate", () => ({
  useChapterModuleGateState: () => ({
    status: "ready",
    isModuleEnabled: (key: string) => !modules.off.has(key),
  }),
}));
vi.mock("next/navigation", async () => ({
  useSearchParams: (await import("@/tests/address-search-params"))
    .useAddressSearchParams,
}));

const customLines = vi.hoisted(() => ({ value: {} as Record<string, string> }));
vi.mock("@/lib/providers/chapter-presence-provider", () => ({
  useChapterPresenceContext: () => ({
    isReady: true,
    statusOf: () => "online",
    lineOf: (id: string) => customLines.value[id] ?? null,
  }),
}));

vi.mock("@/lib/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

/**
 * Stubbed because it fires six invite hooks this file's `@repo/hooks` mock has
 * no business knowing about. What matters here is only that the trigger sits in
 * the toolbar row, above the list *and* above every empty state — which is what
 * lets those states carry no CTA of their own.
 */
vi.mock("@/components/members/invite-member-dialog", () => ({
  InviteMemberDialog: ({ trigger }: { trigger: React.ReactNode }) => (
    <div data-testid="invite-trigger">{trigger}</div>
  ),
}));

// The row opens the member's card (Paul, 2026-11-19), which has its own
// spec; here it only has to open for the right member and hand on View
// profile.
vi.mock("@/components/chat/member-popout", () => ({
  anchorFor: (element: HTMLElement) => ({
    contextElement: element,
    getBoundingClientRect: () => element.getBoundingClientRect(),
  }),
  MemberPopout: ({
    open,
    userId,
    identity,
    onViewProfile,
    side,
  }: {
    open: boolean;
    userId: string | null;
    identity: { name: string | null } | null;
    onViewProfile: (userId: string) => void;
    side?: string;
  }) =>
    open && userId ? (
      <div
        data-testid="member-card"
        data-user-id={userId}
        data-side={side ?? "right"}
      >
        {identity?.name}
        <button type="button" onClick={() => onViewProfile(userId)}>
          View profile
        </button>
      </div>
    ) : null,
}));

vi.mock("@/components/members/member-detail-sheet", () => ({
  MemberDetailSheet: ({
    open,
    userId,
    initialMember,
  }: {
    open: boolean;
    userId: string | null;
    initialMember?: { display_name?: string } | null;
  }) =>
    open ? (
      <div data-testid="detail-sheet" data-user-id={userId ?? ""}>
        {initialMember?.display_name ?? "none"}
      </div>
    ) : null,
}));

import { MembersDirectory } from "@/components/members/members-directory";
import { cardFilledContainers } from "@/tests/card-surfaces";

beforeEach(() => {
  vi.clearAllMocks();
  mockOffline.value = false;
  Object.assign(membersRead, read(MEMBERS));
  Object.assign(searchRead, read([]));
  Object.assign(
    rolesRead,
    read([{ id: "r-1", name: "Treasurer", is_system: false, permissions: [] }]),
  );
  Object.assign(leaderboardRead, read([{ user_id: "u-1", total: 42 }]));
  standings.boards = {};
  standings.asked = [];
  standings.isError = false;
  standings.refetch.mockClear();
  modules.off = new Set();
  setAddress("/members");
  phoneReachRead.value = null;
  tenant.council = false;
  permissionsRead.data = { permissions: [] };
  Object.assign(tiersRead, { data: [], isError: false });
});

describe("Directory on the greenfield shell", () => {
  it("renders the roster as a flush list, with no table and no wrapper card", () => {
    const { container } = render(<MembersDirectory />);

    // The `<Table>` is gone, not hidden: no grid roles survive anywhere.
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryAllByRole("columnheader")).toHaveLength(0);

    // The list carries the shared divider recipe and nothing else — no card
    // fill, no hairline box, no zebra.
    const list = container.querySelector("ul");
    expect(list).not.toBeNull();
    expect(list?.className).toContain("divide-y");
    expect(list?.className).toContain("border-t");
    expect(list?.querySelectorAll("li")).toHaveLength(MEMBERS.length);
    expect(cardFilledContainers(container)).toHaveLength(0);

    // The card titles the wrappers carried are gone with them. The top bar
    // owns the route's only heading (`top-bar.tsx`).
    expect(screen.queryByText("Members Directory")).toBeNull();
    expect(screen.queryByText("Member Records")).toBeNull();
    expect(
      screen.queryByText(/Search and review chapter membership records/),
    ).toBeNull();
  });

  it("keeps the row at the List row step on a pointer and 44px on touch", () => {
    const { container } = render(<MembersDirectory />);
    const row = container.querySelector("li");
    expect(row?.className).toContain("min-h-control-list-row");
    // §2's touch floor, via the carve-out `compactControlClassName` uses.
    expect(row?.className).toContain("pointer-coarse:min-h-11");
  });

  // #3845: the custom line sits under the name, and the row's name carries it
  // just before the status, which stays last.
  it("shows a member's custom status under their name", () => {
    customLines.value = { "u-1": "At practice till 6" };
    try {
      render(<MembersDirectory />);
      const row = screen.getByRole("button", { name: /^Ada Lovelace,/ });
      expect(row).toHaveTextContent("At practice till 6");
      expect(row.getAttribute("aria-label")).toMatch(
        /, At practice till 6, Online$/,
      );
    } finally {
      customLines.value = {};
    }
  });

  it("filters by group, offering only groups with someone in them (2026-11-19)", async () => {
    const user = userEvent.setup();
    render(<MembersDirectory />);
    expect(await rowOptions(user, "Group")).toEqual(["Any group", "In house"]);
    await pick(user, "Group", "In house");
    expect(
      screen.getByRole("button", { name: /^Ada Lovelace,/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Grace Hopper,/ })).toBeNull();
  });

  it("makes the row itself the control that opens a member", async () => {
    const user = userEvent.setup();
    render(<MembersDirectory />);

    // The trailing "View details" button is deleted; the row is named for the
    // member and everything the row shows.
    expect(screen.queryByRole("button", { name: /view details/i })).toBeNull();

    // A row opens the member's card beside it, not the profile over the
    // Directory (Paul, 2026-11-19); View profile opens the full record.
    await user.click(screen.getByRole("button", { name: /^Ada Lovelace,/ }));
    expect(screen.getByTestId("member-card")).toHaveTextContent("Ada Lovelace");
    // A row is as wide as the Directory, so its card opens below it; beside
    // it there is no room and the card ran off the window's left edge (#5749).
    expect(screen.getByTestId("member-card")).toHaveAttribute(
      "data-side",
      "bottom",
    );
    expect(screen.queryByTestId("detail-sheet")).toBeNull();
    await user.click(screen.getByRole("button", { name: "View profile" }));
    expect(screen.getByTestId("detail-sheet")).toHaveTextContent(
      "Ada Lovelace",
    );
    // The sheet reads the profile by user id itself (#3726).
    expect(screen.getByTestId("detail-sheet")).toHaveAttribute(
      "data-user-id",
      "u-1",
    );
  });

  it("puts the open member in the address with View profile's push (#6046)", async () => {
    const user = userEvent.setup();
    render(<MembersDirectory />);
    await user.click(screen.getByRole("button", { name: /^Ada Lovelace,/ }));
    const push = vi.spyOn(window.history, "pushState");
    await user.click(screen.getByRole("button", { name: "View profile" }));
    expect(push).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe("?member=u-1");
    push.mockRestore();
  });

  it("opens the member a link names, and says one who isn't here is gone (#6046)", async () => {
    setAddress("/members?member=u-1");
    const { unmount } = render(<MembersDirectory />);
    expect(screen.getByTestId("detail-sheet")).toHaveAttribute(
      "data-user-id",
      "u-1",
    );
    unmount();

    membersRead.refetch = vi.fn(() => Promise.resolve());
    setAddress("/members?member=nobody");
    render(<MembersDirectory />);
    expect(
      await screen.findByText(/That member isn't in the directory/),
    ).toBeInTheDocument();
    // Read again once before it is called gone.
    expect(membersRead.refetch).toHaveBeenCalledTimes(1);
    // The id is replaced away in an effect after the note draws.
    await waitFor(() => expect(window.location.search).toBe(""));
  });

  it("drops an absent field from the meta line instead of rendering an em dash", () => {
    const { container } = render(<MembersDirectory />);

    // Grace has no role and an unparseable join date. Neither may appear as a
    // placeholder glyph, and no rendered text on the route may contain one.
    expect(container.textContent).not.toContain("—");
    // Ada is the positive control: without it, a matcher that silently never
    // matches would make the negative assertion below pass for free.
    expect(
      screen.getByRole("button", { name: /^Ada Lovelace,/ }),
    ).toHaveAccessibleName(/joined/i);
    const grace = screen.getByRole("button", { name: /^Grace Hopper,/ });
    expect(grace).not.toHaveAccessibleName(/joined/i);
    expect(grace).not.toHaveAccessibleName(/Treasurer/);
  });

  it("titles a member by their highest-ranked role, tier before list order (2026-11-20)", () => {
    // Staging's bug: an imported floor role at display_order 0 outranked the
    // office, so Gabe read "First Floor" and Paul "Web Development".
    Object.assign(
      membersRead,
      read([{ ...MEMBERS[0], role_ids: ["r-floor", "r-1"] }]),
    );
    Object.assign(
      rolesRead,
      read([
        {
          id: "r-floor",
          name: "First Floor",
          is_system: false,
          permissions: [],
          display_order: 0,
          tier_id: null,
        },
        {
          id: "r-1",
          name: "Treasurer",
          is_system: false,
          permissions: [],
          display_order: 3,
          tier_id: "t-cabinet",
        },
      ]),
    );
    Object.assign(tiersRead, { data: [{ id: "t-cabinet", position: 1 }] });
    render(<MembersDirectory />);

    const ada = screen.getByRole("button", { name: /^Ada Lovelace,/ });
    expect(ada).toHaveAccessibleName(/Treasurer/);
    expect(ada).not.toHaveAccessibleName(/First Floor/);
  });

  it("labels a member whose name is only whitespace with the shared fallback", () => {
    // `display_name` is NOT NULL DEFAULT '', and spaces are as unset as ''.
    // The label is the one the leaderboard and chat use for this member
    // (`Member <first six of id>`, #2422), so an officer comparing surfaces
    // sees one person, not two.
    Object.assign(
      membersRead,
      read([
        MEMBERS[0],
        {
          ...MEMBERS[1],
          id: "m-3",
          user_id: "2f4a1c9d-0000-4000-8000-000000000000",
          display_name: "   ",
        },
      ]),
    );
    render(<MembersDirectory />);

    expect(
      screen.getByRole("button", { name: /^Member 2f4a1c,/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Member 2f4a1c9d/)).toBeNull();
  });

  it("answers an empty roster, a filtered miss and a search miss differently", async () => {
    const user = userEvent.setup();

    Object.assign(membersRead, read([]));
    const { unmount } = render(<MembersDirectory />);
    expect(screen.getByText("No actives yet.")).toBeInTheDocument();
    // The line carries no CTA because the toolbar row above it still does.
    expect(screen.getByTestId("invite-trigger")).toBeInTheDocument();
    expect(
      within(
        screen.getByRole("heading", { name: "Actives" }).closest("section")!,
      ).queryByRole("button", { name: /invite/i }),
    ).not.toBeNull();
    unmount();

    // A filter that matches nothing is not a claim about the roster.
    Object.assign(membersRead, read(MEMBERS));
    render(<MembersDirectory />);
    await pick(user, "Status", "Pending");
    await pick(user, "Role", "Treasurer");
    expect(
      screen.getByText(/No actives match these filters\./),
    ).toBeInTheDocument();

    // The line offers the way back, and the way back is every filter.
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.queryByText(/No actives match/)).toBeNull();
    // No filter is on: no applied chips, and Filter counts nothing.
    expect(screen.queryByRole("group", { name: "Filters on" })).toBeNull();
    expect(filterButton()).toHaveAccessibleName("Filter members");
  });

  it("offers the Phone app filter only when the server sends the whole chapter's reach", async () => {
    phoneReachRead.value = {
      scope: "self",
      byUserId: new Map([
        [
          "u-1",
          {
            user_id: "u-1",
            state: "on",
            platform: "ios",
            last_opened_at: null,
          },
        ],
      ]),
    };
    const user = userEvent.setup();
    const { unmount } = render(<MembersDirectory />);
    expect(await hasFilterRow(user, "Phone app")).toBe(false);
    unmount();

    phoneReachRead.value = { scope: "chapter", byUserId: new Map() };
    render(<MembersDirectory />);
    expect(await hasFilterRow(user, "Phone app")).toBe(true);
  });

  it("narrows to members notifications can't reach, says how many, and names each one's state", async () => {
    const user = userEvent.setup();
    phoneReachRead.value = {
      scope: "chapter",
      byUserId: new Map([
        [
          "u-1",
          {
            user_id: "u-1",
            state: "on",
            platform: "ios",
            last_opened_at: "2026-11-18T12:00:00.000Z",
          },
        ],
        [
          "u-2",
          {
            user_id: "u-2",
            state: "web_only",
            platform: null,
            last_opened_at: null,
          },
        ],
      ]),
    };
    render(<MembersDirectory />);
    // No state on the rows until the filter is set.
    expect(screen.queryByText("Web only")).toBeNull();

    await pick(user, "Phone app", "Not reachable");

    expect(screen.queryByText("Ada Lovelace")).toBeNull();
    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
    expect(screen.getByText("Web only")).toBeInTheDocument();
    expect(
      screen.getByText("1 of 2 members can't get notifications"),
    ).toBeInTheDocument();
  });

  // #5739: the rows stand in the order the chips did, and an "Any" row or a
  // removed chip puts the whole list back.
  it("lists its filter rows in the chips' order, and Any or a removed chip unsets one", async () => {
    const user = userEvent.setup();
    phoneReachRead.value = {
      scope: "chapter",
      byUserId: new Map([
        [
          "u-2",
          {
            user_id: "u-2",
            state: "web_only",
            platform: null,
            last_opened_at: null,
          },
        ],
      ]),
    };
    render(<MembersDirectory />);
    await openFilterMenu(user);
    const rows = screen
      .getAllByRole("menuitem")
      .map((item) => item.querySelector("span")?.textContent);
    await closeFilterMenu(user);
    expect(rows).toEqual([
      "Role",
      "Group",
      "Graduation year",
      "Status",
      "Phone app",
      "Sort",
    ]);

    await pick(user, "Phone app", "Not reachable");
    expect(screen.queryByText("Ada Lovelace")).toBeNull();
    await pick(user, "Phone app", "Any");
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
    expect(filterButton()).toHaveAccessibleName("Filter members");

    await pick(user, "Status", "Pending");
    await user.click(
      screen.getByRole("button", { name: "Remove filter Status: Pending" }),
    );
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
    expect(filterButton()).toHaveAccessibleName("Filter members");
  });

  // #3941: the options are graduation years, so the chapter's `class` word
  // ("Line" here) must not label them; one pledge class spans several years.
  it("labels the graduation-year filter as graduation year, not the chapter's class word", async () => {
    const user = userEvent.setup();
    render(<MembersDirectory />);
    expect(await hasFilterRow(user, "Line")).toBe(false);
    const years = await rowOptions(user, "Graduation year");
    expect(years[0]).toBe("Any year");
    expect(years).toContain("2027");
  });

  // #3970: the toolbar's controls are the shared chips, not native selects.
  it("draws its filters and sort with no native select left", async () => {
    const user = userEvent.setup();
    const { container } = render(<MembersDirectory />);
    expect(container.querySelector("select")).toBeNull();
    await user.click(
      screen.getByRole("checkbox", {
        name: /select all members on this page/i,
      }),
    );
    expect(container.querySelector("select")).toBeNull();
  });

  // #3970: a long role list opens whole, with a field that narrows it.
  it("lets a member type to find a role in a long list, or scroll it", async () => {
    const user = userEvent.setup();
    Object.assign(
      rolesRead,
      read([
        { id: "r-1", name: "Treasurer", is_system: false, permissions: [] },
        ...Array.from({ length: 30 }, (_, i) => ({
          id: `r-x${i}`,
          name: `Committee ${i + 1}`,
          is_system: false,
          permissions: [],
        })),
      ]),
    );
    render(<MembersDirectory />);

    await openFilterRow(user, "Role");
    // Every option is there before anything is typed: Any role, then 31.
    expect(await screen.findAllByRole("menuitemradio")).toHaveLength(32);

    await user.type(
      screen.getByRole("textbox", { name: "Search role" }),
      "trea",
    );
    expect(screen.getAllByRole("menuitemradio")).toHaveLength(1);
    await user.click(screen.getByRole("menuitemradio", { name: "Treasurer" }));
    await closeFilterMenu(user);

    // The filter that is on shows under the toolbar, and Filter counts it.
    expect(
      screen.getByRole("button", { name: "Remove filter Role: Treasurer" }),
    ).toBeInTheDocument();
    expect(filterButton()).toHaveAccessibleName("Filter members, 1 on");
    expect(screen.getByText("1 member")).toBeInTheDocument();
  });

  it("offers No base role to whoever can give roles, and narrows to them (#5802)", async () => {
    const user = userEvent.setup();
    Object.assign(
      rolesRead,
      read([
        { id: "r-1", name: "Treasurer", is_system: false, permissions: [] },
        {
          id: "r-act",
          name: "Actives",
          is_system: true,
          system_key: "MEMBER",
          permissions: [],
        },
      ]),
    );
    const { unmount } = render(<MembersDirectory />);
    expect(await rowOptions(user, "Role")).not.toContain("No base role");
    unmount();

    // A chapter with no base roles has nothing to be missing.
    permissionsRead.data = { permissions: ["roles:manage"] };
    Object.assign(
      rolesRead,
      read([
        { id: "r-1", name: "Treasurer", is_system: false, permissions: [] },
      ]),
    );
    const second = render(<MembersDirectory />);
    expect(await rowOptions(user, "Role")).not.toContain("No base role");
    second.unmount();

    Object.assign(
      rolesRead,
      read([
        { id: "r-1", name: "Treasurer", is_system: false, permissions: [] },
        {
          id: "r-act",
          name: "Actives",
          is_system: true,
          system_key: "MEMBER",
          permissions: [],
        },
      ]),
    );
    Object.assign(
      membersRead,
      read([{ ...MEMBERS[0], role_ids: ["r-act"] }, MEMBERS[1]]),
    );
    render(<MembersDirectory />);
    await pick(user, "Role", "No base role");
    // Ada is an active; Grace holds nothing yet.
    expect(screen.getByText("1 member")).toBeInTheDocument();
    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
    expect(screen.queryByText("Ada Lovelace")).not.toBeInTheDocument();
  });

  it("names the query when a search matches nothing", async () => {
    const user = userEvent.setup();
    render(<MembersDirectory />);

    await user.type(screen.getByLabelText("Search members"), "pigg");

    // The board's no-results state names what was asked for, rather than
    // reusing the empty state's claim about the roster.
    expect(
      await screen.findByText(/Nobody matches “pigg”\./),
    ).toBeInTheDocument();
    expect(screen.queryByText("No actives yet.")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(screen.getByLabelText("Search members")).toHaveValue("");
  });

  it("lets an async state replace the sheet rather than strand it on a missing member", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<MembersDirectory />);

    await user.click(screen.getByRole("button", { name: /^Ada Lovelace,/ }));
    await user.click(screen.getByRole("button", { name: "View profile" }));
    expect(screen.getByTestId("detail-sheet")).toHaveTextContent(
      "Ada Lovelace",
    );

    // A background refetch fails while the sheet is open. The sheet goes with
    // the body, which is the shape every other `useConfirmDialog` caller has:
    // `ConfirmDialogHost` settles a pending confirmation to `null` on unmount
    // (`confirm-dialog.spec.tsx`, "resolves null when the caller stops
    // rendering the dialog"), so there is no promise left hanging. Keeping it
    // mounted is what would hurt — the list it was opened from is not on
    // screen in exactly these branches, so the sheet would outlive the body it
    // belongs to, with a Save the member can no longer see the result of.
    Object.assign(leaderboardRead, read([]), { isError: true });
    rerender(<MembersDirectory />);

    expect(
      screen.getByText("Couldn't load roles and points"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("detail-sheet")).toBeNull();
  });

  it("sorts members with no role last in both directions", async () => {
    const user = userEvent.setup();
    render(<MembersDirectory />);
    const rows = () =>
      screen
        .getAllByRole("button", { name: /Lovelace|Hopper/ })
        .map((el) => el.getAttribute("aria-label")?.split(",")[0]);

    // Grace has no role. A sentinel string inside the comparator would put her
    // last ascending and FIRST descending; the partition keeps her last in both.
    await pick(user, "Sort", "Role A to Z");
    expect(rows()).toEqual(["Ada Lovelace", "Grace Hopper"]);
    await pick(user, "Sort", "Role Z to A");
    expect(rows()).toEqual(["Ada Lovelace", "Grace Hopper"]);
  });

  describe("pledge class and order number (#3939)", () => {
    const CLASSES = [
      { id: "c-beta", name: "Beta", position: 0 },
      { id: "c-alpha", name: "Alpha", position: 1 },
    ];
    const withOrder = (
      index: number,
      pledge_class_id: string | null,
      order_number: number | null,
    ) => ({ ...MEMBERS[index]!, pledge_class_id, order_number });
    const names = () =>
      screen
        .getAllByRole("button", { name: /Lovelace|Hopper/ })
        .map((el) => el.getAttribute("aria-label")?.split(",")[0]);

    afterEach(() => {
      Object.assign(membersRead, read(MEMBERS));
      Object.assign(classesRead, read([]));
    });

    it("no longer sorts by when a member joined Frapp", async () => {
      const user = userEvent.setup();
      render(<MembersDirectory />);
      const sorts = await rowOptions(user, "Sort");
      expect(sorts).not.toContain("Newest first");
      expect(sorts).not.toContain("Oldest first");
    });

    it("shows no pledge class or order control to a chapter that uses neither", async () => {
      const user = userEvent.setup();
      render(<MembersDirectory />);
      expect(await hasFilterRow(user, "Line")).toBe(false);
      expect(await rowOptions(user, "Sort")).not.toContain("Roll number");
    });

    it("sorts by the chapter's class order, then number, under the chapter's word", async () => {
      // Beta is the older class here although Alpha sorts first by name.
      Object.assign(classesRead, read(CLASSES));
      Object.assign(
        membersRead,
        read([withOrder(0, "c-alpha", 1), withOrder(1, "c-beta", 9)]),
      );
      const user = userEvent.setup();
      render(<MembersDirectory />);
      expect(names()).toEqual(["Ada Lovelace", "Grace Hopper"]);
      await pick(user, "Sort", "Roll number");
      expect(names()).toEqual(["Grace Hopper", "Ada Lovelace"]);
    });

    it("offers the sort to a chapter that keeps only a chapter-wide number", async () => {
      Object.assign(
        membersRead,
        read([withOrder(0, null, 12), withOrder(1, null, 3)]),
      );
      const user = userEvent.setup();
      render(<MembersDirectory />);
      // No classes, so no class filter; the number alone earns the sort.
      expect(await hasFilterRow(user, "Line")).toBe(false);
      await pick(user, "Sort", "Roll number");
      expect(names()).toEqual(["Grace Hopper", "Ada Lovelace"]);
    });

    it("filters by pledge class, under the chapter's word and in the chapter's order", async () => {
      Object.assign(classesRead, read(CLASSES));
      Object.assign(
        membersRead,
        read([withOrder(0, "c-alpha", 1), withOrder(1, "c-beta", 1)]),
      );
      const user = userEvent.setup();
      render(<MembersDirectory />);
      // The mocked chapter calls a class a "Line".
      expect(await rowOptions(user, "Line")).toEqual(["Any", "Beta", "Alpha"]);
      await pick(user, "Line", "Alpha");
      expect(names()).toEqual(["Ada Lovelace"]);
      // Graduation year stays its own filter beside it.
      expect(await hasFilterRow(user, "Graduation year")).toBe(true);
    });

    it("clears the class filter with the others, and says a class with nobody in it matched nothing", async () => {
      Object.assign(classesRead, read(CLASSES));
      Object.assign(
        membersRead,
        read([withOrder(0, "c-alpha", 1), withOrder(1, null, null)]),
      );
      const user = userEvent.setup();
      render(<MembersDirectory />);
      await pick(user, "Line", "Beta");
      // An empty class is a filter that matched nothing, not an empty roster.
      await user.click(screen.getByRole("button", { name: "Clear filters" }));
      expect(names()).toEqual(["Ada Lovelace", "Grace Hopper"]);
    });

    it("drops the sort, the filter and the class on rows when the class list can't be read", async () => {
      // Members point at classes, but the list itself failed to load. Sorting
      // without it would rank everyone as class-less and look right.
      Object.assign(classesRead, { data: undefined, isError: true });
      Object.assign(
        membersRead,
        read([withOrder(0, "c-alpha", 1), withOrder(1, "c-beta", 9)]),
      );
      const user = userEvent.setup();
      render(<MembersDirectory />);
      expect(await hasFilterRow(user, "Line")).toBe(false);
      expect(await rowOptions(user, "Sort")).not.toContain("Roll number");
    });

    it("falls back to the default sort and no class filter when the chapter's last class goes", async () => {
      Object.assign(classesRead, read(CLASSES));
      Object.assign(
        membersRead,
        read([withOrder(0, "c-alpha", 1), withOrder(1, "c-beta", 9)]),
      );
      const user = userEvent.setup();
      const view = render(<MembersDirectory />);
      await pick(user, "Sort", "Roll number");
      await pick(user, "Line", "Alpha");
      expect(names()).toEqual(["Ada Lovelace"]);
      // Another officer deletes every class; the members lose theirs.
      Object.assign(classesRead, read([]));
      Object.assign(membersRead, read(MEMBERS));
      view.rerender(<MembersDirectory />);
      expect(names()).toEqual(["Ada Lovelace", "Grace Hopper"]);
      expect(await rowValue(user, "Sort")).toBe("Name A to Z");
    });

    it("names a member's class on their row, and in the row's label", () => {
      Object.assign(classesRead, read(CLASSES));
      Object.assign(
        membersRead,
        read([withOrder(0, "c-alpha", 1), withOrder(1, null, null)]),
      );
      render(<MembersDirectory />);
      expect(
        screen.getByRole("button", { name: /^Ada Lovelace,/ }),
      ).toHaveAccessibleName(/Treasurer, Alpha, 42 points/);
      expect(screen.getByText(/Treasurer · Alpha ·/)).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /^Grace Hopper,/ }),
      ).not.toHaveAccessibleName(/Alpha|Beta/);
    });
  });

  it("draws its async states without repainting the card the lane deleted", () => {
    Object.assign(membersRead, read([]), { isError: true });
    const { container } = render(<MembersDirectory />);

    expect(screen.getByText("Couldn't load the directory")).toBeInTheDocument();
    // `NestedError`, not `ErrorState`: the whole-screen family paints
    // `--card` on its box, which would put back the wrapper this lane just
    // removed. The Retry button inside it may still be Secondary.
    expect(cardFilledContainers(container)).toHaveLength(0);
  });

  it("replaces the four sortable column headers with one sort control", async () => {
    const user = userEvent.setup();
    render(<MembersDirectory />);
    expect(await rowValue(user, "Sort")).toBe("Name A to Z");
    // Name and role in both directions, then the standings (#5950): most and
    // fewest points, most service hours. The join-date pair went with
    // #3939; the fraternal-order sort joins only a chapter that keeps one.
    expect(await rowOptions(user, "Sort")).toHaveLength(7);
    expect(screen.queryByRole("button", { name: /sort by name/i })).toBeNull();
  });

  it("keeps bulk selection reachable without a checkbox column", async () => {
    const user = userEvent.setup();
    render(<MembersDirectory />);

    const selectAll = () =>
      screen.getByRole("checkbox", {
        name: /select all members on this page/i,
      });

    // Select-all is rendered from zero, not conditioned on its own output. The
    // bulk bar is what appears on selection; the control that drives it must
    // not live inside the thing it can unmount.
    expect(selectAll()).toBeInTheDocument();
    expect(screen.queryByText(/selected$/)).toBeNull();

    await user.click(selectAll());
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Assign role" }),
    ).toBeInTheDocument();

    // Unticking it empties the selection — and the control survives, so focus
    // is not dropped to <body> mid-interaction.
    await user.click(selectAll());
    expect(screen.queryByText(/selected$/)).toBeNull();
    expect(selectAll()).toBeInTheDocument();
  });
});

/**
 * #4175 — the Grid layout, picked in the Directory's tab row and kept per
 * viewer. #2146 deleted the old card grid for showing less than the row and
 * for stranding selection; a tile answers both.
 */
describe("Directory in a council (#5933)", () => {
  afterEach(() => useChapterStore.setState({ activeChapterId: null }));

  it("draws no points, sorts by none, and never waits on the refused points read", async () => {
    tenant.council = true;
    useChapterStore.setState({ activeChapterId: "council-1" });
    // A council's routes refuse the leaderboard; that must not fail the list.
    Object.assign(leaderboardRead, read(undefined), { isError: true });
    const user = userEvent.setup();
    render(<MembersDirectory />);
    expect(screen.queryByText("Couldn't load roles and points")).toBeNull();
    expect(
      screen.getByRole("button", { name: /^Ada Lovelace,/ }),
    ).not.toHaveAccessibleName(/points/);
    expect(screen.getByText("Members")).toBeInTheDocument();
    expect(await rowValue(user, "Sort")).toBe("Name A to Z");
    const sorts = await rowOptions(user, "Sort");
    expect(sorts.some((label) => /points/i.test(label))).toBe(false);
  });
});

describe("Directory as a grid (#4175)", () => {
  beforeEach(() => {
    window.localStorage.setItem("frapp.directory.layout.viewer-1", "grid");
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it("lays the members out as tiles, not the divided list", () => {
    const { container } = render(<MembersDirectory />);
    const list = container.querySelector("ul");
    expect(list?.className).toContain("grid");
    expect(list?.className).not.toContain("divide-y");
    expect(list?.querySelectorAll("li")).toHaveLength(MEMBERS.length);
    // A hairline tile on the page surface, not the wrapper card #2146 removed.
    expect(cardFilledContainers(container)).toHaveLength(0);
  });

  // #4647: as many tiles as fit at a capped width, not a fixed column count
  // stretched across a wide page; two at the 375px floor.
  it("caps a tile's width rather than stretching a fixed count of columns", () => {
    const { container } = render(<MembersDirectory />);
    const list = container.querySelector("ul");
    expect(list?.className).toContain(
      "@md:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]",
    );
    expect(list?.className).toContain("grid-cols-2");
    expect(list?.className).not.toMatch(/@\dxl:grid-cols-\d/);
  });

  it("names a tile for everything the row shows, and opens the member", async () => {
    const user = userEvent.setup();
    render(<MembersDirectory />);

    const tile = screen.getByRole("button", { name: /^Ada Lovelace,/ });
    expect(tile.getAttribute("aria-label")).toContain("Treasurer");
    expect(tile.getAttribute("aria-label")).toContain("42 points");
    expect(tile.getAttribute("aria-label")).toContain("ada@example.test");

    await user.click(tile);
    expect(screen.getByTestId("member-card")).toHaveAttribute(
      "data-user-id",
      "u-1",
    );
    // A tile is narrow, so its card opens beside it (#5749).
    expect(screen.getByTestId("member-card")).toHaveAttribute(
      "data-side",
      "right",
    );
    await user.click(screen.getByRole("button", { name: "View profile" }));
    expect(screen.getByTestId("detail-sheet")).toHaveAttribute(
      "data-user-id",
      "u-1",
    );
  });

  // #2146 deleted the old grid for showing less than the row: the tile must
  // show the facts on screen, not only in its accessible name.
  it("shows the row's facts on the tile itself", () => {
    render(<MembersDirectory />);
    const tile = screen.getByRole("button", { name: /^Ada Lovelace,/ });
    expect(tile).toHaveTextContent("Ada Lovelace");
    expect(tile).toHaveTextContent("Treasurer");
    expect(tile).toHaveTextContent("ada@example.test");
    expect(tile).toHaveTextContent("42 points");
    expect(tile).toHaveTextContent(/joined/);
  });

  it("keeps every tile selectable, and select-all with it", async () => {
    const user = userEvent.setup();
    render(<MembersDirectory />);

    await user.click(
      screen.getByRole("checkbox", { name: "Select Ada Lovelace" }),
    );
    expect(screen.getByText("1 selected")).toBeInTheDocument();

    await user.click(
      screen.getByRole("checkbox", {
        name: /select all members on this page/i,
      }),
    );
    expect(screen.getByText("2 selected")).toBeInTheDocument();
  });
});

/**
 * #2484 — a chapter with alumni. `GET /v1/members` and its search return the
 * whole chapter; alumni are the Alumni tab's, so the Actives list, its count
 * and its cohort filter leave them out.
 */
describe("Actives on a chapter with alumni", () => {
  const ALUMNUS = {
    ...MEMBERS[0],
    id: "m-3",
    user_id: "u-3",
    role_ids: ["r-alumni"],
    display_name: "Charles Whitmore III",
    graduation_year: 2019,
    email: "charles@example.test",
    is_alumni: true,
  };
  const CHAPTER = [
    { ...MEMBERS[0], is_alumni: false },
    { ...MEMBERS[1], is_alumni: false },
    ALUMNUS,
  ];

  it("lists and counts only the members who are not alumni", () => {
    Object.assign(membersRead, read(CHAPTER));
    const { container } = render(<MembersDirectory />);

    expect(container.querySelectorAll("ul > li")).toHaveLength(2);
    expect(screen.queryByText("Charles Whitmore III")).toBeNull();
    expect(screen.getByText("2 members")).toBeInTheDocument();
    // The alumnus's class year is not an Actives cohort.
    expect(screen.queryByRole("option", { name: /2019/ })).toBeNull();
  });

  it("searches both tabs, since it is the web directory's only name search", async () => {
    const user = userEvent.setup();
    Object.assign(membersRead, read(CHAPTER));
    Object.assign(
      searchRead,
      read([ALUMNUS, { ...MEMBERS[0], is_alumni: false }]),
    );
    render(<MembersDirectory />);

    await user.type(screen.getByRole("searchbox"), "a");

    expect(await screen.findByText(/2 members matching/)).toBeInTheDocument();
    expect(screen.getByText("Charles Whitmore III")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Actives and alumni" }),
    ).toBeInTheDocument();
  });

  it("offers the Alumni role to assign, not to filter a list it can't match", async () => {
    const user = userEvent.setup();
    Object.assign(membersRead, read(CHAPTER));
    Object.assign(
      rolesRead,
      read([
        { id: "r-1", name: "Treasurer", is_system: false, permissions: [] },
        {
          id: "r-alumni",
          name: "Alumni",
          system_key: "ALUMNI",
          is_system: true,
          permissions: [],
        },
      ]),
    );
    render(<MembersDirectory />);

    const roles = await rowOptions(user, "Role");
    expect(roles).toContain("Treasurer");
    expect(roles).not.toContain("Alumni");

    await user.click(
      screen.getByRole("checkbox", {
        name: /select all members on this page/i,
      }),
    );
    await user.click(screen.getByRole("button", { name: "Assign role" }));
    expect(
      await screen.findByRole("menuitem", { name: "Alumni" }),
    ).toBeInTheDocument();
  });

  it("offers no role holding * to assign, President or legacy, but filters by it (#4164)", async () => {
    const user = userEvent.setup();
    Object.assign(membersRead, read(CHAPTER));
    Object.assign(
      rolesRead,
      read([
        { id: "r-1", name: "Treasurer", is_system: false, permissions: [] },
        {
          id: "r-pres",
          name: "President",
          system_key: "PRESIDENT",
          is_system: true,
          permissions: ["*"],
        },
        // A pre-validation custom role: the API refuses it on bulk assign too.
        {
          id: "r-legacy",
          name: "Old Admin",
          is_system: false,
          permissions: ["*", "events:create"],
        },
      ]),
    );
    render(<MembersDirectory />);

    const roles = await rowOptions(user, "Role");
    expect(roles).toContain("President");
    expect(roles).toContain("Old Admin");

    await user.click(
      screen.getByRole("checkbox", {
        name: /select all members on this page/i,
      }),
    );
    await user.click(screen.getByRole("button", { name: "Assign role" }));
    expect(
      await screen.findByRole("menuitem", { name: "Treasurer" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "President" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Old Admin" })).toBeNull();
  });

  it("offers no role to assign that carries a permission the viewer lacks (#5730)", async () => {
    const user = userEvent.setup();
    Object.assign(membersRead, read(CHAPTER));
    permissionsRead.data = { permissions: ["roles:manage", "members:view"] };
    Object.assign(
      rolesRead,
      read([
        { id: "r-1", name: "Treasurer", is_system: false, permissions: [] },
        {
          id: "r-new",
          name: "New Member",
          system_key: "NEW_MEMBER",
          is_system: true,
          permissions: ["members:view", "ai:use"],
        },
        // Everyone's permissions are exempt: every member has them.
        {
          id: "r-everyone",
          name: "Everyone",
          system_key: "EVERYONE",
          is_system: true,
          permissions: ["members:view", "rush:view"],
        },
        {
          id: "r-rush",
          name: "Rush helper",
          is_system: false,
          permissions: ["rush:view"],
        },
      ]),
    );
    render(<MembersDirectory />);

    await user.click(
      screen.getByRole("checkbox", {
        name: /select all members on this page/i,
      }),
    );
    await user.click(screen.getByRole("button", { name: "Assign role" }));
    expect(
      await screen.findByRole("menuitem", { name: "Treasurer" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Rush helper" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "New Member" })).toBeNull();
  });

  it("reads a bulk role as unpicked once that role is deleted, and can un-pick one", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<MembersDirectory />);
    await user.click(
      screen.getByRole("checkbox", {
        name: /select all members on this page/i,
      }),
    );
    await pickChip(user, "Assign role", "Treasurer");
    expect(screen.getByRole("button", { name: "Apply" })).toBeEnabled();

    // Un-picking keeps the selection, which Clear would not.
    await pickChip(user, "Assign role: Treasurer", "No role");
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
    expect(screen.getByText("2 selected")).toBeInTheDocument();

    await pickChip(user, "Assign role", "Treasurer");
    Object.assign(rolesRead, read([]));
    rerender(<MembersDirectory />);
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Assign role" }),
    ).toBeInTheDocument();
  });

  it("narrows the selection to the failures after a partly failed bulk assign", async () => {
    const user = userEvent.setup();
    Object.assign(membersRead, read(CHAPTER));
    mutateRoles.mockReset();
    mutateRoles.mockImplementation(({ id }: { id: string }) =>
      id === "m-2" ? Promise.reject(new Error("nope")) : Promise.resolve({}),
    );
    const { rerender } = render(<MembersDirectory />);

    await user.click(
      screen.getByRole("checkbox", {
        name: /select all members on this page/i,
      }),
    );
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    await pickChip(user, "Assign role", "Treasurer");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    // Only Grace's assignment failed, so only Grace is left to retry.
    expect(await screen.findByText("1 selected")).toBeInTheDocument();

    // Had the role been Alumni, Ada's refetch would move her off this tab;
    // she must not linger in the count once she is gone.
    Object.assign(
      membersRead,
      read([{ ...MEMBERS[0], is_alumni: true }, CHAPTER[1], ALUMNUS]),
    );
    rerender(<MembersDirectory />);
    expect(screen.getByText("1 selected")).toBeInTheDocument();
  });

  it("drops a selected member from the count once a refetch moves them to Alumni", async () => {
    const user = userEvent.setup();
    Object.assign(membersRead, read(CHAPTER));
    const { rerender } = render(<MembersDirectory />);

    await user.click(
      screen.getByRole("checkbox", {
        name: /select all members on this page/i,
      }),
    );
    expect(screen.getByText("2 selected")).toBeInTheDocument();

    // Ada is given Alumni some other way than the bulk bar (her own sheet,
    // another officer): the refetch takes her row away.
    Object.assign(
      membersRead,
      read([{ ...MEMBERS[0], is_alumni: true }, CHAPTER[1], ALUMNUS]),
    );
    rerender(<MembersDirectory />);

    expect(screen.getByText("1 selected")).toBeInTheDocument();
  });

  it("offers the Alumni role and alumni class years to filter a search, which lists alumni", async () => {
    const user = userEvent.setup();
    Object.assign(membersRead, read(CHAPTER));
    Object.assign(
      searchRead,
      read([ALUMNUS, { ...MEMBERS[0], is_alumni: false }]),
    );
    Object.assign(
      rolesRead,
      read([
        { id: "r-1", name: "Treasurer", is_system: false, permissions: [] },
        {
          id: "r-alumni",
          name: "Alumni",
          system_key: "ALUMNI",
          is_system: true,
          permissions: [],
        },
      ]),
    );
    render(<MembersDirectory />);

    await user.type(screen.getByRole("searchbox"), "a");
    await screen.findByText(/2 members matching/);

    await pick(user, "Role", "Alumni");
    expect(screen.getByText(/1 member matching/)).toBeInTheDocument();
    expect(screen.getByText("Charles Whitmore III")).toBeInTheDocument();
    expect(await rowOptions(user, "Graduation year")).toContain("2019");

    // Clearing the search takes the Alumni option away; the filter falls back
    // to all rather than silently filtering on an option no longer shown.
    await user.clear(screen.getByRole("searchbox"));
    expect(await rowValue(user, "Role")).toBe("Any role");
    expect(screen.queryByRole("group", { name: "Filters on" })).toBeNull();
    expect(screen.getByText("2 members")).toBeInTheDocument();
  });

  it("keeps an open sheet on a member who has just been made an alumnus", async () => {
    const user = userEvent.setup();
    Object.assign(membersRead, read(CHAPTER));
    const { rerender } = render(<MembersDirectory />);

    await user.click(screen.getByRole("button", { name: /^Ada Lovelace,/ }));
    await user.click(screen.getByRole("button", { name: "View profile" }));
    expect(screen.getByTestId("detail-sheet")).toHaveTextContent(
      "Ada Lovelace",
    );

    // The officer saved the Alumni role; the refetch flags Ada, so she leaves
    // this tab's list. Her sheet is still the thing on screen.
    Object.assign(
      membersRead,
      read([{ ...MEMBERS[0], is_alumni: true }, CHAPTER[1], ALUMNUS]),
    );
    rerender(<MembersDirectory />);

    expect(screen.queryByRole("button", { name: /^Ada Lovelace,/ })).toBeNull();
    expect(screen.getByTestId("detail-sheet")).toHaveTextContent(
      "Ada Lovelace",
    );
  });
});

describe("MembersDirectory standings (#5950)", () => {
  it("ranks the chapter by points this semester, leading each row with its place", async () => {
    const user = userEvent.setup();
    standings.boards.points = { "u-2": 30, "u-1": 12 };
    render(<MembersDirectory />);
    await pick(user, "Sort", "Most points");

    expect(standings.asked.at(-1)).toEqual(["points", "semester"]);
    // The standing and its period stay in sight on the count line.
    expect(
      screen.getByText("2 members · Most points · This semester"),
    ).toBeInTheDocument();
    const rows = screen.getAllByRole("button", { name: /^ranked / });
    expect(rows[0]).toHaveAccessibleName(/^ranked 1, Grace Hopper/);
    expect(rows[0]).toHaveTextContent("#1");
    expect(rows[0]).toHaveTextContent("30 points");
    expect(rows[1]).toHaveAccessibleName(/^ranked 2, Ada Lovelace/);
  });

  it("changes the period from the same menu", async () => {
    const user = userEvent.setup();
    standings.boards.points = { "u-1": 5 };
    render(<MembersDirectory />);
    // No Period row until a standing is the sort.
    expect(await hasFilterRow(user, "Period")).toBe(false);
    await pick(user, "Sort", "Most points");
    await pick(user, "Period", "All time");
    expect(standings.asked.at(-1)).toEqual(["points", "all"]);
    // Sort and Period are orders, not filters: nothing is counted or chipped.
    expect(filterButton()).toHaveAccessibleName("Filter members");
    expect(screen.queryByRole("group", { name: "Filters on" })).toBeNull();
  });

  it("ranks by approved service hours too", async () => {
    const user = userEvent.setup();
    standings.boards.service = { "u-1": 150 };
    render(<MembersDirectory />);
    await pick(user, "Sort", "Most service hours");
    const rows = screen.getAllByRole("button", { name: /^ranked / });
    expect(rows[0]).toHaveAccessibleName(/^ranked 1, Ada Lovelace/);
    expect(rows[0]).toHaveTextContent("2.5 hours");
  });

  it("opens on the standing a link names", async () => {
    const user = userEvent.setup();
    setAddress("/members?sort=points");
    render(<MembersDirectory />);
    expect(await rowValue(user, "Sort")).toBe("Most points");
    expect(await rowValue(user, "Period")).toBe("This semester");
  });

  it("offers no standing, and no points on rows, while its module is off", async () => {
    const user = userEvent.setup();
    modules.off = new Set(["points", "hours"]);
    setAddress("/members?sort=points");
    render(<MembersDirectory />);
    // A link to a standing whose module is off opens on the name instead.
    expect(await rowValue(user, "Sort")).toBe("Name A to Z");
    const items = await rowOptions(user, "Sort");
    expect(items).not.toContain("Most points");
    expect(items).not.toContain("Most service hours");
    expect(screen.queryByText(/42 points/)).toBeNull();
  });

  it("leaves a member with nothing in the period unnumbered, after the ranked ones", async () => {
    const user = userEvent.setup();
    standings.boards.points = { "u-2": 30 };
    render(<MembersDirectory />);
    await pick(user, "Sort", "Most points");
    expect(screen.getAllByRole("button", { name: /^ranked / })).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: /^Ada Lovelace, you|^Ada Lovelace/ }),
    ).toHaveTextContent("0 points");
  });

  it("lists the unnumbered after the ranked under Fewest points too", async () => {
    const user = userEvent.setup();
    standings.boards.points = { "u-2": 30 };
    render(<MembersDirectory />);
    await pick(user, "Sort", "Fewest points");
    const rows = screen.getAllByRole("button", {
      name: /^(ranked \d+, )?(Ada Lovelace|Grace Hopper)/,
    });
    expect(rows[0]).toHaveAccessibleName(/^ranked 1, Grace Hopper/);
    expect(rows[1]).toHaveAccessibleName(/^Ada Lovelace/);
  });

  it("follows a later link's sort, since the page stays mounted", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<MembersDirectory />);
    expect(await rowValue(user, "Sort")).toBe("Name A to Z");
    setAddress("/members?sort=points");
    rerender(<MembersDirectory />);
    expect(await rowValue(user, "Sort")).toBe("Most points");
    // The sidebar's plain Directory link drops the param, and the sort with it.
    setAddress("/members");
    rerender(<MembersDirectory />);
    expect(await rowValue(user, "Sort")).toBe("Name A to Z");
  });

  it("says the standings didn't load rather than ranking everyone at 0", async () => {
    const user = userEvent.setup();
    standings.isError = true;
    render(<MembersDirectory />);
    await pick(user, "Sort", "Most points");
    expect(screen.getByText("Couldn't load the standings")).toBeInTheDocument();
    expect(screen.queryAllByRole("button", { name: /^ranked / })).toHaveLength(
      0,
    );
  });
});
