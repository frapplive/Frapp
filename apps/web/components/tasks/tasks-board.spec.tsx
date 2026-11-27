import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  act,
  within,
} from "@testing-library/react";
import { cardFilledContainers } from "@/tests/card-surfaces";
import userEvent from "@testing-library/user-event";
import { setAddress } from "@/tests/address-search-params";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { chapterSubscription } from "@/tests/chapter-subscription";
import { TASK_AUDIENCE_COPY } from "@repo/validation";
import {
  expectClearingEntriesEmpty,
  expectRefusedEntriesKeep,
} from "@/tests/numeric-input";

const {
  mockCurrentChapter,
  tasksRef,
  currentUserRef,
  createTaskMutate,
  permissionsRef,
  permissionsFailed,
  chapterScopeRef,
  tasksPending,
  suggestionsPending,
  suggestionsFailures,
  updateTaskMutate,
  updateStatusMutate,
  rejectTaskMutate,
  currentUserFailed,
  membersFailed,
  currentUserRefetch,
  membersRefetch,
  failedReadsKeepData,
  deleteTaskMutate,
  openTasksRef,
  createOpenTaskMutate,
  claimMutate,
  assignMutate,
  releaseMutate,
  toastSpy,

  routerReplace,
  tasksRefetch,
  tasksEnabled,
} = vi.hoisted(() => ({
  // Every `enabled` the board passed to `useTasks`: Mine reads only for a link.
  tasksEnabled: [] as boolean[],
  // The address's query (`?group=<id>`, `?task=<id>`, #5538).

  routerReplace: vi.fn(),
  // The tasks read taken again, before a linked task is called missing.
  tasksRefetch: vi.fn(() => Promise.resolve()),
  // Postings up for grabs, and the writes on them (2026-11-18).
  openTasksRef: { current: [] as unknown[] },
  createOpenTaskMutate: vi.fn(),
  claimMutate: vi.fn(),
  assignMutate: vi.fn(),
  releaseMutate: vi.fn(),
  toastSpy: vi.fn(),
  // The delete, by id or with a scope on a repeating task (#5119).
  deleteTaskMutate: vi.fn(),
  // `GET /v1/users/me` and `GET /v1/members` failed with nothing cached
  // (#1346, #1209).
  currentUserFailed: { current: false },
  membersFailed: { current: false },
  // A failed refetch over a good answer: TanStack keeps `data` with `isError`.
  failedReadsKeepData: { current: false },
  currentUserRefetch: vi.fn(),
  membersRefetch: vi.fn(),
  // The lifecycle writes Mark done and Send back make (#4635).
  updateStatusMutate: vi.fn(),
  rejectTaskMutate: vi.fn(),
  // The suggested-tasks read still in flight (#4313).
  suggestionsPending: { current: false },
  // Failed tries on that read so far (#4504).
  suggestionsFailures: { current: 0 },
  updateTaskMutate: vi.fn(),
  mockCurrentChapter: vi.fn(),
  createTaskMutate: vi.fn(),
  // Mutable so a test can swap the rows the board renders.
  tasksRef: { current: [] as unknown[] },
  // Mutable so a test can simulate `useCurrentUser` still in flight or errored,
  // which is when the Confirm gate has to fail closed.
  currentUserRef: { current: undefined as { id?: string } | undefined },
  // `undefined` is the permissions read still in flight.
  permissionsRef: { current: ["tasks:manage"] as string[] | undefined },
  // The permissions read failed (or can't run) rather than still loading.
  permissionsFailed: { current: false },
  // `useChapterScope` (#4094): `none` is a user the server can't scope, whose
  // `useTasks` read never goes out and so stays pending.
  chapterScopeRef: {
    current: "chapter" as "chapter" | "none" | "resolving",
  },
  tasksPending: { current: false },
}));

// Only the chapter payload is stubbed — `useSubscriptionWriteState` and
// `subscriptionWriteState` run for real, so this covers the whole path from
// the wire format to the disabled control.
const ME = "u-me";

const MEMBERS = [
  { user_id: ME, display_name: "Paul Carlson", role_ids: ["role-pres"] },
  { user_id: "u-other", display_name: "Cole Martin", role_ids: ["role-rush"] },
];

const TIERS = [{ id: "tier-exec", name: "Exec board", position: 1 }];
const ROLES = [
  {
    id: "role-everyone",
    name: "Member",
    system_key: "MEMBER",
    display_order: 9,
  },
  {
    id: "role-pres",
    name: "President",
    tier_id: "tier-exec",
    display_order: 1,
  },
  { id: "role-rush", name: "Recruitment Committee", display_order: 2 },
  { id: "role-house", name: "Housing Chair", display_order: 3 },
];

// One task the minutes suggest, so an officer's strip has a line to draw.
const SUGGESTIONS = [
  {
    id: "sug-1",
    kind: "task",
    task: { title: "Order the formal tickets" },
    source: { type: "meeting", id: "meeting-1" },
  },
];

const TASKS = [
  {
    id: "task-todo",
    chapter_id: "chap-1",
    title: "Sweep the chapter room",
    description: null,
    assignee_id: ME,
    created_by: "u-admin",
    due_date: "2026-09-01",
    status: "TODO" as const,
    point_reward: 5,
    points_awarded: false,
    completed_at: null,
    confirmed_at: null,
    created_at: "2026-08-01T00:00:00Z",
  },
  {
    id: "task-in-progress",
    chapter_id: "chap-1",
    title: "Draft the rush calendar",
    description: null,
    assignee_id: ME,
    created_by: "u-admin",
    due_date: "2026-09-02",
    status: "IN_PROGRESS" as const,
    point_reward: null,
    points_awarded: false,
    completed_at: null,
    confirmed_at: null,
    created_at: "2026-08-01T00:00:00Z",
  },
  {
    id: "task-completed",
    chapter_id: "chap-1",
    title: "Book the philanthropy venue",
    description: null,
    assignee_id: "u-other",
    created_by: "u-admin",
    due_date: "2026-09-03",
    status: "COMPLETED" as const,
    point_reward: 10,
    points_awarded: false,
    completed_at: "2026-08-10T00:00:00Z",
    confirmed_at: null,
    created_at: "2026-08-01T00:00:00Z",
  },
];

vi.mock("@repo/hooks", async (importOriginal) => ({
  // `actionStatus` stays real; only the data hooks are stubbed.
  ...(await importOriginal<typeof import("@repo/hooks")>()),
  // Attached (Frapp links): no names to read, nothing offered.
  useFrappLinks: () => ({ resolved: new Map(), isLoading: false }),
  useFrappLinkCandidates: () => ({ candidates: [], isLoading: false }),
  // Task photos (#4565): no photo reads or uploads in these cases.
  useRequestTaskPhotoUploadUrl: () => ({ mutateAsync: vi.fn() }),
  useTaskPhotoUrl: () => ({ data: undefined }),
  useCurrentChapter: () => mockCurrentChapter(),
  useChapterScope: () => chapterScopeRef.current,
  useTasks: (options?: { enabled?: boolean }) => {
    const enabled = options?.enabled ?? true;
    tasksEnabled.push(enabled);
    return {
      data: tasksPending.current || !enabled ? undefined : tasksRef.current,
      isPending: tasksPending.current || !enabled,
      isFetching: false,
      isError: false,
      refetch: tasksRefetch,
    };
  },
  useMembers: () => ({
    data:
      membersFailed.current && !failedReadsKeepData.current
        ? undefined
        : MEMBERS,
    isError: membersFailed.current,
    refetch: membersRefetch,
  }),
  useAiSuggestions: (options?: { enabled?: boolean }) => ({
    data: suggestionsPending.current ? undefined : { items: SUGGESTIONS },
    isPending: suggestionsPending.current && (options?.enabled ?? true),
    fetchStatus:
      suggestionsPending.current && (options?.enabled ?? true)
        ? "fetching"
        : "idle",
    // Failed tries so far; the default retry repeats a failed read.
    failureCount: suggestionsFailures.current,
  }),
  useMyPermissions: () => ({
    data:
      permissionsRef.current === undefined
        ? undefined
        : { permissions: permissionsRef.current },
    fetchStatus:
      permissionsRef.current === undefined && !permissionsFailed.current
        ? "fetching"
        : "idle",
    isError: permissionsFailed.current,
  }),
  useCurrentUser: () => ({
    data:
      currentUserFailed.current && !failedReadsKeepData.current
        ? undefined
        : currentUserRef.current,
    isError: currentUserFailed.current,
    refetch: currentUserRefetch,
  }),
  // The List / Grid pick is kept under the viewer's id (`lib/list-layout.ts`).
  useViewerUserId: () => "viewer-1",
  useCreateTask: () => ({ mutateAsync: createTaskMutate, isPending: false }),
  useUpdateTaskStatus: () => ({
    mutateAsync: updateStatusMutate,
    isPending: false,
  }),
  useConfirmTask: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRejectTask: () => ({ mutateAsync: rejectTaskMutate, isPending: false }),
  useDeleteTask: () => ({ mutateAsync: deleteTaskMutate, isPending: false }),
  useUpdateTask: () => ({ mutateAsync: updateTaskMutate, isPending: false }),
  useRequestTaskExtension: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAddSubtask: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteSubtask: () => ({ mutate: vi.fn(), isPending: false }),
  useSetSubtaskDone: () => ({ mutate: vi.fn(), isPending: false }),
  // Faces read the roster; here every member has their initials.
  useMemberDisplayNames: () => ({
    avatarTintFor: () => null,
    nameFor: () => null,
    avatarFor: () => null,
  }),
  // The Who picker's lists (2026-11-18).
  useRoles: () => ({ data: ROLES }),
  useRoleTiers: () => ({ data: TIERS }),
  useGroups: () => ({ data: [] }),
  useMeetings: () => ({ data: [] }),
  // Up for grabs (2026-11-18).
  useOpenTasks: () => ({
    data: openTasksRef.current,
    isError: false,
    refetch: vi.fn(),
  }),
  useCreateOpenTask: () => ({
    mutateAsync: createOpenTaskMutate,
    isPending: false,
  }),
  useClaimOpenTask: () => ({ mutateAsync: claimMutate, isPending: false }),
  useAssignOpenTask: () => ({ mutateAsync: assignMutate, isPending: false }),
  useReleaseTask: () => ({ mutateAsync: releaseMutate, isPending: false }),
  useAddToTaskGroup: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateOpenTask: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteOpenTask: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("next/navigation", async () => ({
  useSearchParams: (await import("@/tests/address-search-params"))
    .useAddressSearchParams,
  useRouter: () => ({ replace: routerReplace }),
}));

// Everyone's marks suggested-task notifications seen while it shows them
// (#5948); which screens it names is pinned here, the read itself elsewhere.
const { markedScreens } = vi.hoisted(() => ({
  markedScreens: [] as (readonly string[])[],
}));
vi.mock("@/lib/notifications/mark-screens-seen", () => ({
  MarkScreensSeen: ({ screens }: { screens: readonly string[] }) => {
    markedScreens.push(screens);
    return null;
  },
}));
vi.mock("@/lib/hooks/use-chapter-module-gate", () => ({
  useChapterModuleGateState: () => ({
    status: "ready",
    isModuleEnabled: () => true,
    retry: vi.fn(),
    fetchStatus: "idle",
  }),
}));

vi.mock("@/lib/stores/chapter-store", () => ({
  useChapterStore: (selector: (s: { activeChapterId: string }) => unknown) =>
    selector({ activeChapterId: "chap-1" }),
}));

// `tasks:manage` is answered from `permissionsRef`, with a stand-in for the
// real gate's offline chip when the read failed, so the board's own branching
// is tested against the answer the gate would give. Every other gate on the
// page (the notice's billing link) passes through, as before.
// The list has its own spec; here only where the board puts it.
vi.mock("@/components/ai/suggested-tasks", () => ({
  SuggestedTasks: () => <div data-testid="suggested-tasks" />,
}));

vi.mock("@/components/shared/can", () => ({
  Can: ({
    children,
    permission,
  }: {
    children: React.ReactNode;
    permission: string;
  }) =>
    permission !== "tasks:manage" ? (
      <>{children}</>
    ) : permissionsFailed.current ? (
      <span>Permissions unavailable</span>
    ) : permissionsRef.current?.includes(permission) ? (
      <>{children}</>
    ) : null,
}));

vi.mock("@/lib/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastSpy }),
  toast: toastSpy,
}));

const { TasksBoard } = await import("./tasks-board");
const { resetListLayoutForTests } = await import("@/lib/list-layout");

const chapter = chapterSubscription(mockCurrentChapter);

// New task in the toolbar, and the quick-add line it opens (2026-11-18).
const trigger = () => screen.getByRole("button", { name: /^new task$/i });
/**
 * The quick-add line, which shows once New task is pressed (#5578): opened
 * here when a test reaches for it, as a person presses New task first.
 */
const addForm = () => {
  const open = screen.queryByRole("form", { name: /add a task/i });
  if (open) return open;
  fireEvent.click(trigger());
  return screen.getByRole("form", { name: /add a task/i });
};
const addSubmit = () => within(addForm()).getByRole("button", { name: "Add" });
const titleField = () =>
  within(addForm()).getByRole("textbox", { name: "Task title" });
/** Picks people in the add line's Who picker, then closes it. */
async function pickWho(...names: RegExp[]) {
  await userEvent.click(
    within(addForm()).getByRole("button", { name: /^who/i }),
  );
  for (const name of names) {
    await userEvent.click(await screen.findByRole("checkbox", { name }));
  }
  await userEvent.keyboard("{Escape}");
}
const startButton = () => screen.getByRole("button", { name: /^start$/i });
const completeButton = () => screen.getByRole("button", { name: /mark done/i });
const confirmButton = () => screen.getByRole("button", { name: /^confirm$/i });
// Reject reads "Send back" since #4635.
const sendBackButton = () =>
  screen.getByRole("button", { name: /^send back$/i });
// An icon on each tile, named for its task ("Delete Draft rush schedule").
const deleteButtons = () =>
  screen.getAllByRole("button", { name: /^delete /i });

beforeEach(() => {
  setAddress("/activity");
  tasksEnabled.length = 0;
  routerReplace.mockClear();
  tasksRefetch.mockReset();
  tasksRefetch.mockImplementation(() => Promise.resolve());
  window.localStorage.clear();
  resetListLayoutForTests();
  // Most cases below read a task's controls off its Grid tile; the List's
  // rows and the panel have their own cases, which pick List themselves.
  window.localStorage.setItem("frapp.tasks.layout.viewer-1", "grid");
  openTasksRef.current = [];
  toastSpy.mockClear();
  permissionsRef.current = ["tasks:manage"];
  permissionsFailed.current = false;
  currentUserFailed.current = false;
  membersFailed.current = false;
  failedReadsKeepData.current = false;
  currentUserRefetch.mockClear();
  membersRefetch.mockClear();
});

/**
 * The one status line with something in it. The board also mounts an empty
 * `StaleReadNotice` live region (#1346, #1209), which stays in the tree
 * while every read is current so its line is announced when it appears.
 */
function liveStatus(): HTMLElement | null {
  return (
    screen
      .queryAllByRole("status")
      .find((el) => (el.textContent ?? "").trim() !== "") ?? null
  );
}

/**
 * Picks in the toolbar's View menu (grouping and List / Grid), which closes
 * on the pick.
 */
/** The header's one Filter button (`FilterMenu`), named for its count. */
const filterButton = () =>
  screen.getByRole("button", { name: /^Filter tasks/ });

/** The Filter menu row a Group or Layout pick sits under. */
const rowOf = (name: string) =>
  name === "List" || name === "Grid" ? "Layout" : "Group";

/** Picks a Group or Layout value in the Filter menu, which closes on the pick. */
async function pickView(name: string) {
  await userEvent.click(filterButton());
  await userEvent.click(
    await screen.findByRole("menuitem", {
      name: new RegExp(`^${rowOf(name)}`),
    }),
  );
  await userEvent.click(await screen.findByRole("menuitemradio", { name }));
}

/** Whether a Group or Layout value is the current one; the menu closes again. */
async function viewChecked(name: string): Promise<boolean> {
  await userEvent.click(filterButton());
  await userEvent.click(
    await screen.findByRole("menuitem", {
      name: new RegExp(`^${rowOf(name)}`),
    }),
  );
  const item = await screen.findByRole("menuitemradio", { name });
  const checked = item.getAttribute("aria-checked") === "true";
  await userEvent.keyboard("{Escape}");
  return checked;
}

describe("TasksBoard suggested tasks (#4313)", () => {
  it("folds an officer's suggestions to one line over the board, and shows none to a member", async () => {
    chapter.active();
    const { unmount } = render(<TasksBoard part="everyone" />);
    const strip = screen.getByRole("region", { name: "Suggested tasks" });
    expect(strip).toHaveTextContent("1 suggested task from the minutes");
    // The list waits for Review, so it pushes nothing down (Paul, 2026-11-18).
    expect(screen.queryByTestId("suggested-tasks")).toBeNull();
    const review = within(strip).getByRole("button", { name: "Review" });
    expect(review).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(review);
    expect(screen.getByTestId("suggested-tasks")).toBeInTheDocument();
    await userEvent.click(within(strip).getByRole("button", { name: "Hide" }));
    expect(screen.queryByTestId("suggested-tasks")).toBeNull();
    // Where they are drawn, their notifications are read (#5948).
    expect(markedScreens).toContainEqual(["ai_suggestions"]);
    unmount();

    markedScreens.length = 0;
    permissionsRef.current = ["members:view"];
    tasksRef.current = TASKS;
    try {
      render(<TasksBoard part="everyone" />);
      expect(
        screen.queryByRole("region", { name: "Suggested tasks" }),
      ).toBeNull();
      expect(markedScreens).toEqual([]);
    } finally {
      tasksRef.current = [];
    }
  });

  it("waits for an officer's suggestions with the board, so the columns are drawn once", () => {
    chapter.active();
    suggestionsPending.current = true;
    try {
      render(<TasksBoard part="everyone" />);
      expect(
        screen.queryByRole("region", { name: "Suggested tasks" }),
      ).toBeNull();
      // The skeleton stands in for the whole board: no header actions, no
      // groups, until both reads have answered.
      expect(screen.queryByRole("button", { name: /^new task$/i })).toBeNull();
      expect(screen.queryByRole("region", { name: "To do" })).toBeNull();
    } finally {
      suggestionsPending.current = false;
    }
  });

  it("stops waiting once the suggestions read has failed, rather than sit out its retries (#4504)", async () => {
    chapter.active();
    suggestionsPending.current = true;
    suggestionsFailures.current = 1;
    try {
      render(<TasksBoard part="everyone" />);
      expect(addForm()).toBeInTheDocument();
    } finally {
      suggestionsPending.current = false;
      suggestionsFailures.current = 0;
    }
  });

  it("never holds a member's board for a read it doesn't make", () => {
    chapter.active();
    permissionsRef.current = ["members:view"];
    suggestionsPending.current = true;
    tasksRef.current = TASKS;
    try {
      render(<TasksBoard part="everyone" />);
      expect(screen.getAllByRole("listitem").length).toBeGreaterThan(0);
    } finally {
      suggestionsPending.current = false;
      tasksRef.current = [];
    }
  });
});

describe("TasksBoard with no chapter the server can scope (#4094)", () => {
  it("says so instead of a skeleton that never ends", () => {
    chapter.active();
    chapterScopeRef.current = "none";
    tasksPending.current = true;
    try {
      render(<TasksBoard part="everyone" />);
      expect(
        screen.getByText("Pick an active chapter to load its tasks."),
      ).toBeInTheDocument();
    } finally {
      chapterScopeRef.current = "chapter";
      tasksPending.current = false;
    }
  });
});

describe("TasksBoard subscription gating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tasksRef.current = TASKS;
    currentUserRef.current = { id: ME };
  });

  it("leaves every task write alone on an active chapter", async () => {
    chapter.active();
    render(<TasksBoard part="everyone" />);

    expect(trigger()).toBeEnabled();
    expect(startButton()).toBeEnabled();
    expect(completeButton()).toBeEnabled();
    expect(confirmButton()).toBeEnabled();
    expect(sendBackButton()).toBeEnabled();
    for (const button of deleteButtons()) expect(button).toBeEnabled();
    expect(liveStatus()).not.toBeInTheDocument();
  });

  it("hides Confirm and Send back on your own completed task, keeping Mark not done (#1056, #5917)", () => {
    // The API refuses a self-confirmation and a self-send-back, so offering
    // either would be a guaranteed 403. Mark not done takes your own "done"
    // back.
    chapter.active();
    tasksRef.current = [{ ...TASKS[2], id: "task-mine", assignee_id: ME }];
    render(<TasksBoard part="everyone" />);

    expect(
      screen.queryByRole("button", { name: /^confirm$/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^send back$/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^mark not done$/i }),
    ).toBeEnabled();
    // The missing control is explained on the tile it is missing from.
    expect(
      screen.getByText("You can't confirm your own task."),
    ).toBeInTheDocument();
  });

  it("moves a confirmed task out of the waiting column into Confirmed, with no controls", async () => {
    // "Waiting on an officer" is the officer's queue: a confirmed task there
    // would read as still owed. It sits in the Confirmed list instead, which
    // says what the old disabled "Confirmed" button said, and the API refuses
    // a reject once points are awarded, so it offers neither.
    chapter.active();
    tasksRef.current = [
      {
        ...TASKS[2],
        id: "task-mine-awarded",
        assignee_id: ME,
        points_awarded: true,
        confirmed_at: new Date().toISOString(),
      },
    ];
    render(<TasksBoard part="everyone" />);

    const waiting = screen.getByRole("region", {
      name: "Waiting on an officer",
    });
    expect(within(waiting).getByText("Nothing to confirm")).toBeInTheDocument();
    const confirmed = screen.getByRole("region", { name: "Confirmed" });
    expect(within(confirmed).getByText(TASKS[2]!.title)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /confirm/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /send back/i })).toBeNull();
  });

  it("lets the assignee take back their own unconfirmed completion", () => {
    chapter.active();
    tasksRef.current = [{ ...TASKS[2], id: "task-mine", assignee_id: ME }];
    render(<TasksBoard part="everyone" />);

    expect(
      screen.getByRole("button", { name: /mark not done/i }),
    ).toBeInTheDocument();
  });

  it("hides Confirm while the viewer is unknown, rather than failing open", async () => {
    // `myUserId` is "" until `useCurrentUser` resolves. If the gate keyed on
    // `isMine` alone, every row would read as someone else's during that window
    // and Confirm would come back on your own task.
    chapter.active();
    currentUserRef.current = undefined;
    tasksRef.current = [{ ...TASKS[2], id: "task-mine", assignee_id: ME }];
    render(<TasksBoard part="everyone" />);
    // Opens on My tasks, which waits on the account; the rows are on
    // Everyone's, where the gate has to hold.
    expect(screen.getByText(TASKS[2]!.title)).toBeInTheDocument();

    expect(
      screen.queryByRole("button", { name: /^confirm$/i }),
    ).not.toBeInTheDocument();
    // Unresolved viewer: "your own task" would be a guess (#1346).
    expect(screen.queryByText(/can't confirm your own task/i)).toBeNull();
  });

  it("says why Confirm is gone when your account can't be read, and retries it (#1346)", async () => {
    // Fails closed still: no Confirm on any row, even someone else's. What
    // changed is that the board now says so, so an officer doesn't read the
    // missing control as a revoked grant.
    chapter.active();
    currentUserFailed.current = true;
    tasksRef.current = [TASKS[2]];
    render(<TasksBoard part="everyone" />);
    // The chapter's board stays, with its rows, so the gate is tested on them.
    expect(screen.getByText(TASKS[2]!.title)).toBeInTheDocument();

    expect(
      screen.queryByRole("button", { name: /^confirm$/i }),
    ).not.toBeInTheDocument();
    expect(liveStatus()).toHaveTextContent(
      /couldn't confirm your account, so Confirm and the buttons on your own tasks are hidden/i,
    );
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(currentUserRefetch).toHaveBeenCalledOnce();
    expect(membersRefetch).not.toHaveBeenCalled();
  });

  it("tells a member why the buttons on their own tasks are gone (#1346)", () => {
    // Without the viewer, no row is theirs, so Start and Mark done go too.
    // A member has no Confirm, so the line doesn't mention it.
    chapter.active();
    permissionsRef.current = [];
    currentUserFailed.current = true;
    tasksRef.current = [{ ...TASKS[0] }];
    render(<TasksBoard part="everyone" />);

    expect(screen.queryByRole("button", { name: /start/i })).toBeNull();
    expect(liveStatus()).toHaveTextContent(
      /couldn't confirm your account, so the buttons on your tasks are hidden/i,
    );
    expect(liveStatus()).not.toHaveTextContent(/confirm and/i);
  });

  it("says nothing when a refetch failed over answers it already has", () => {
    chapter.active();
    permissionsRef.current = ["tasks:manage", "members:view"];
    currentUserRef.current = { id: ME };
    currentUserFailed.current = true;
    membersFailed.current = true;
    failedReadsKeepData.current = true;
    tasksRef.current = [TASKS[2]];
    render(<TasksBoard part="everyone" />);

    expect(liveStatus()).toBeNull();
    // The cached viewer still lets Confirm through on someone else's task.
    expect(confirmButton()).toBeEnabled();
  });

  it("keeps the board and says so when member names can't load (#1209)", async () => {
    chapter.active();
    permissionsRef.current = ["tasks:manage", "members:view"];
    membersFailed.current = true;
    tasksRef.current = [TASKS[2]];
    render(<TasksBoard part="everyone" />);

    // The rows still render, named by the fallback.
    expect(screen.getByText("Book the philanthropy venue")).toBeInTheDocument();
    expect(liveStatus()).toHaveTextContent(/couldn't load member names/i);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(membersRefetch).toHaveBeenCalledOnce();
  });

  it("does not offer a retry for a roster the viewer may not read", () => {
    // `GET /v1/members` needs `members:view`; a refusal is not a failure a
    // retry clears.
    chapter.active();
    membersFailed.current = true;
    tasksRef.current = [TASKS[2]];
    render(<TasksBoard part="everyone" />);

    expect(screen.queryByText(/couldn't load member names/i)).toBeNull();
  });

  it("says the names are missing while permissions are still unknown", () => {
    chapter.active();
    permissionsRef.current = undefined;
    permissionsFailed.current = true;
    membersFailed.current = true;
    tasksRef.current = [TASKS[2]];
    render(<TasksBoard part="everyone" />);

    expect(liveStatus()).toHaveTextContent(/couldn't load member names/i);
  });

  it("still offers Confirm on someone else's completed task", () => {
    // The gate keys on the assignee, not on "is an admin looking" — the
    // ordinary two-party path must stay open.
    chapter.active();
    tasksRef.current = [TASKS[2]];
    render(<TasksBoard part="everyone" />);

    expect(confirmButton()).toBeEnabled();
  });

  it("disables the trigger and names blocker plus recovery when incomplete", async () => {
    chapter.incomplete();
    render(<TasksBoard part="everyone" />);

    // §5 rule 1: gate the trigger, never the submit.
    expect(trigger()).toBeDisabled();
    expect(liveStatus()).toHaveTextContent(/subscription is not active/i);
    // §5 rule 2: name the next action, not just the blocker.
    expect(
      screen.getByRole("link", { name: /complete checkout/i }),
    ).toHaveAttribute("href", "/settings?tab=billing");
    expect(liveStatus()).toHaveTextContent(/to restore managing tasks/i);

    // §5 rule 4: disabled, not hidden — the board is still readable.
    expect(screen.getByText(/sweep the chapter room/i)).toBeInTheDocument();

    // And the add line, which only New task opens, stays put away.
    expect(screen.queryByRole("form", { name: /add a task/i })).toBeNull();
  });

  it("gates the other four task writes, not just Create", async () => {
    // Status, confirm, reject and delete all hit the same paid-ops controller,
    // so leaving them live would have the board claim writes are blocked while
    // still offering four of them.
    chapter.incomplete();
    render(<TasksBoard part="everyone" />);

    expect(startButton()).toBeDisabled();
    expect(completeButton()).toBeDisabled();
    expect(confirmButton()).toBeDisabled();
    expect(sendBackButton()).toBeDisabled();
    for (const button of deleteButtons()) expect(button).toBeDisabled();
  });

  it("ties every disabled control to the one explanation", () => {
    chapter.incomplete();
    render(<TasksBoard part="everyone" />);

    const describedBy = trigger().getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(startButton()).toHaveAttribute("aria-describedby", describedBy);
    expect(deleteButtons()[0]).toHaveAttribute("aria-describedby", describedBy);
    expect(document.getElementById(describedBy!)).toHaveTextContent(
      /subscription is not active/i,
    );
  });

  it("blocks paid-ops task writes immediately on past_due, grace or not", () => {
    chapter.pastDue();
    render(<TasksBoard part="everyone" />);

    expect(trigger()).toBeDisabled();
    expect(startButton()).toBeDisabled();
    // Scoped to the notice: an overdue tile's due line ("Overdue by …") sits
    // on the same board, and matching board text would pass with no gate.
    expect(liveStatus()).toHaveTextContent(/past due/i);
  });

  it("points a canceled chapter at the portal rather than checkout", () => {
    chapter.canceled();
    render(<TasksBoard part="everyone" />);

    expect(trigger()).toBeDisabled();
    expect(liveStatus()).toHaveTextContent(/read-only/i);
    expect(
      screen.getByRole("link", { name: /billing portal/i }),
    ).toBeInTheDocument();
  });

  it("holds the gate shut while the chapter is still loading", () => {
    // The window between mount and the chapter resolving is the most common
    // path to the very 403 this gate prevents: a trigger that paints enabled
    // for that round trip still lets a fast click reach a doomed form.
    chapter.loading();
    render(<TasksBoard part="everyone" />);

    expect(trigger()).toBeDisabled();
    expect(screen.getByText(/checking this chapter/i)).toBeInTheDocument();
    // No blocked explanation yet — nothing has established a reason.
    expect(
      screen.queryByText(/subscription is not active/i),
    ).not.toBeInTheDocument();
  });

  it("disables Add on a typed line when the subscription lapses under it", async () => {
    // A background refetch can revoke the write while a title is typed. The
    // line keeps what was typed, and its submit says why it can't run.
    chapter.active();
    const { rerender } = render(<TasksBoard part="everyone" />);
    await userEvent.type(titleField(), "Order the jerseys");
    expect(addSubmit()).toBeEnabled();

    chapter.incomplete();
    rerender(<TasksBoard part="everyone" />);

    expect(addSubmit()).toBeDisabled();
    expect(titleField()).toHaveValue("Order the jerseys");
  });

  it("leaves the reads and the board itself ungated", () => {
    // `enforceSubscription` returns early for GET, so a lapsed chapter still
    // reads everything it owns — only the write affordances change.
    chapter.incomplete();
    render(<TasksBoard part="everyone" />);

    expect(screen.getByText(/draft the rush calendar/i)).toBeInTheDocument();
    expect(screen.getByText(/waiting on an officer/i)).toBeInTheDocument();
  });

  it("fails open when the chapter record cannot be read", async () => {
    // A failed chapter fetch must not lock a paying chapter out of its board;
    // the server guard is still the enforcement.
    chapter.unreadable();
    render(<TasksBoard part="everyone" />);

    expect(trigger()).toBeEnabled();
    expect(startButton()).toBeEnabled();
    expect(confirmButton()).toBeEnabled();
    for (const button of deleteButtons()) expect(button).toBeEnabled();
    expect(liveStatus()).not.toBeInTheDocument();
  });

  it("keeps a task's own busy condition folded into the gate", async () => {
    // `points_awarded` already disabled Confirm before the gate existed;
    // spreading controlProps must not drop that.
    chapter.active();
    render(<TasksBoard part="everyone" />);

    expect(confirmButton()).toBeEnabled();
  });
});

/**
 * The board half of #1051. `OVERDUE` is derived and collapses a stored `TODO`
 * and a stored `IN_PROGRESS` into one rendered value, so affordances key off
 * `stored_status` while columns and badges keep using `status`.
 */
describe("TasksBoard overdue affordances", () => {
  function overdueTask(overrides: Record<string, unknown>) {
    return {
      id: "task-overdue",
      chapter_id: "chap-1",
      title: "Submit the ride-share list",
      description: null,
      assignee_id: ME,
      created_by: "u-admin",
      due_date: "2020-01-01",
      status: "OVERDUE" as const,
      point_reward: 5,
      points_awarded: false,
      completed_at: null,
      confirmed_at: null,
      created_at: "2019-12-01T00:00:00Z",
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    chapter.active();
  });

  it("offers Start when the stored status is TODO", () => {
    tasksRef.current = [overdueTask({ stored_status: "TODO" })];
    render(<TasksBoard part="everyone" />);

    expect(startButton()).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: /mark done/i }),
    ).not.toBeInTheDocument();
  });

  it("offers Mark done when the stored status is IN_PROGRESS", () => {
    tasksRef.current = [overdueTask({ stored_status: "IN_PROGRESS" })];
    render(<TasksBoard part="everyone" />);

    expect(completeButton()).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: /^start$/i }),
    ).not.toBeInTheDocument();
  });

  it("offers Start when the stored status is literally OVERDUE", () => {
    // The transition table accepts OVERDUE → IN_PROGRESS, which Start makes.
    tasksRef.current = [overdueTask({ stored_status: "OVERDUE" })];
    render(<TasksBoard part="everyone" />);

    expect(startButton()).toBeEnabled();
  });

  it("offers no lifecycle action when a pre-#1051 API sends no stored_status", () => {
    tasksRef.current = [overdueTask({})];
    render(<TasksBoard part="everyone" />);

    expect(
      screen.queryByRole("button", { name: /^start$/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /mark done/i }),
    ).not.toBeInTheDocument();
    // Still readable, and Delete still offered — only the ambiguous
    // lifecycle transition is withheld.
    expect(screen.getByText(/submit the ride-share list/i)).toBeInTheDocument();
  });
});

/**
 * List or Grid (#4175). The board of status columns was the page's only view,
 * so it is Grid and stays the default; List draws the same groups as rows,
 * with the same controls, Edit and Delete included.
 */
describe("TasksBoard List / Grid", () => {
  // A confirmed task, so the Confirmed list under the groups is drawn too.
  const CONFIRMED_TASK = {
    ...TASKS[2]!,
    id: "task-confirmed",
    title: "Order the composite frames",
    points_awarded: true,
    confirmed_at: "2026-08-12T00:00:00Z",
  };

  beforeEach(() => {
    chapter.active();
    currentUserRef.current = { id: "u-admin" };
    tasksRef.current = [...TASKS, CONFIRMED_TASK];
  });

  const todoRegion = () => screen.getByRole("region", { name: /to do/i });
  const confirmedList = () =>
    screen.getByRole("region", { name: /confirmed/i }).querySelector("ul");
  /** The task the specs read, by its title. */
  const sweepItem = () =>
    within(todoRegion()).getByText("Sweep the chapter room").closest("li");

  it("opens as a compact List until the person picks (Paul, 2026-11-18)", async () => {
    window.localStorage.clear();
    resetListLayoutForTests();
    const { container } = render(<TasksBoard part="everyone" />);
    expect(await viewChecked("List")).toBe(true);
    const todo = todoRegion();
    // Groups stacked, not lanes; each task a flush 40px row; Confirmed too.
    expect(todo.parentElement).not.toHaveClass("grid");
    expect(todo.querySelector("ul")).toHaveClass("divide-y");
    expect(sweepItem()).toHaveClass("min-h-10");
    expect(sweepItem()).not.toHaveClass("border");
    expect(confirmedList()).toHaveClass("divide-y");
    // A row says who, when and for how many points, and opens the task.
    expect(
      within(sweepItem()!).getAllByText("Paul Carlson").length,
    ).toBeGreaterThan(0);
    expect(within(sweepItem()!).getByText("+5 pts")).toBeInTheDocument();
    // An empty group draws nothing in List: no "Nothing overdue" heading.
    expect(screen.queryByRole("region", { name: "Overdue" })).toBeNull();
    expect(cardFilledContainers(container)).toEqual([]);
  });

  it("puts what's late first in List", () => {
    window.localStorage.clear();
    resetListLayoutForTests();
    tasksRef.current = [
      ...TASKS,
      {
        ...TASKS[0]!,
        id: "task-late",
        title: "Pay the house bill",
        status: "OVERDUE",
      },
    ];
    render(<TasksBoard part="everyone" />);
    const names = screen
      .getAllByRole("region")
      .map((region) => region.getAttribute("aria-labelledby"))
      .filter((id) => id?.startsWith("tasks-column-"));
    expect(names[0]).toBe("tasks-column-overdue");
    expect(names[1]).toBe("tasks-column-todo");
  });

  it("draws the same groups as framed tiles in Grid, whose Edit opens the panel, and remembers it", async () => {
    window.localStorage.clear();
    resetListLayoutForTests();
    const user = userEvent.setup();
    const { unmount } = render(<TasksBoard part="everyone" />);
    await pickView("Grid");

    expect(await viewChecked("Grid")).toBe(true);
    expect(todoRegion().parentElement).toHaveClass("@4xl:grid-cols-4");
    expect(sweepItem()).toHaveClass("rounded-[14px]", "border");
    expect(confirmedList()).toHaveClass("@4xl:grid-cols-4");
    // Grid keeps all four lanes, the empty one included.
    expect(screen.getByRole("region", { name: "Overdue" })).toBeInTheDocument();
    expect(window.localStorage.getItem("frapp.tasks.layout.viewer-1")).toBe(
      "grid",
    );

    await user.click(
      within(todoRegion()).getByRole("button", {
        name: /^edit sweep the chapter room$/i,
      }),
    );
    expect(
      await screen.findByRole("dialog", { name: "Sweep the chapter room" }),
    ).toBeInTheDocument();

    unmount();
    // A fresh visit, not a reload of the open panel's address.
    setAddress("/activity");
    render(<TasksBoard part="everyone" />);
    expect(await viewChecked("Grid")).toBe(true);
  });
});

describe("TasksBoard assignee label", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chapter.active();
  });

  it("names an assignee missing from the roster with the shared member label", () => {
    // #2422: a departed member keeps their tasks. They read `Member <first
    // six of id>` here, the label the leaderboard and chat give them too.
    tasksRef.current = [
      {
        ...TASKS[2],
        id: "task-departed",
        assignee_id: "2f4a1c9d-0000-4000-8000-000000000000",
      },
    ];
    render(<TasksBoard part="everyone" />);

    expect(screen.getByText(/Member 2f4a1c\b/)).toBeInTheDocument();
    expect(screen.queryByText(/2f4a1c9d-0000/)).toBeNull();
  });
});

describe("TasksBoard point reward guard (#2206)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tasksRef.current = TASKS;
    currentUserRef.current = { id: ME };
    chapter.active();
  });

  // The row needs a title, an assignee and a due date before it submits.
  async function openCreate() {
    render(<TasksBoard part="everyone" />);
    fireEvent.change(titleField(), {
      target: { value: "Order the composites" },
    });
    await pickWho(/Cole Martin/);
    fireEvent.change(screen.getByLabelText("Due date"), {
      target: { value: "2026-12-01" },
    });
    return screen.getByLabelText(/^points \(optional\)$/i);
  }

  it("keeps the last whole number through a negative or a decimal", async () => {
    const input = await openCreate();
    expectRefusedEntriesKeep(input, "7");
  });

  it("reads an emptied or unparseable field as no reward", async () => {
    const input = await openCreate();
    expectClearingEntriesEmpty(input, "7");
  });

  it("sends the kept whole number, never NaN or Infinity", async () => {
    const input = await openCreate();
    fireEvent.change(input, { target: { value: "7" } });
    fireEvent.change(input, { target: { value: "1.5" } });
    fireEvent.submit(addForm());

    await waitFor(() => expect(createTaskMutate).toHaveBeenCalledTimes(1));
    expect(createTaskMutate.mock.calls[0]![0].point_reward).toBe(7);
  });

  it("omits the reward when the field is left empty", async () => {
    const input = await openCreate();
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.submit(addForm());

    await waitFor(() => expect(createTaskMutate).toHaveBeenCalledTimes(1));
    expect(createTaskMutate.mock.calls[0]![0].point_reward).toBeUndefined();
  });
});

describe("TasksBoard flush layout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tasksRef.current = TASKS;
    currentUserRef.current = { id: ME };
    chapter.active();
  });

  it("draws each column as a labelled section on the page surface", async () => {
    const { container } = render(<TasksBoard part="everyone" />);

    for (const [name, count] of [
      ["To do", "1"],
      ["In progress", "1"],
      ["Waiting on an officer", "1"],
      ["Overdue", "0"],
    ] as const) {
      const section = screen.getByRole("region", { name });
      expect(within(section).getByText(count)).toBeInTheDocument();
    }
    expect(
      within(screen.getByRole("region", { name: "Overdue" })).getByText(
        "Nothing overdue",
      ),
    ).toBeInTheDocument();
    expect(cardFilledContainers(container)).toEqual([]);
  });

  it("drops the narration the board used to carry", () => {
    render(<TasksBoard part="everyone" />);

    expect(screen.queryByText(/admins create and confirm/i)).toBeNull();
    expect(screen.queryByText(/assignee is working on it/i)).toBeNull();
    expect(screen.queryByText(/another admin has to/i)).toBeNull();
  });

  it("prints the due date in the house shape, never a numeric date", () => {
    tasksRef.current = [
      { ...TASKS[0], due_date: "2020-01-01", status: "OVERDUE" as const },
    ];
    render(<TasksBoard part="everyone" />);

    const due = screen.getByText(/^Overdue by \d+ days$/);
    expect(due).toHaveClass("text-destructive-text");
    expect(screen.queryByText(/\d+\/\d+\/\d{4}/)).toBeNull();
  });

  it("keeps the Grid columns at zero for an officer, on the page surface", async () => {
    tasksRef.current = [];
    const { container } = render(<TasksBoard part="everyone" />);

    for (const name of [
      "To do",
      "In progress",
      "Waiting on an officer",
      "Overdue",
    ]) {
      expect(screen.getByRole("region", { name })).toBeInTheDocument();
    }
    // The add line heads the board, ahead of the first lane.
    const todo = screen.getByRole("region", { name: "To do" });
    expect(
      addForm().compareDocumentPosition(todo) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /no tasks yet/i })).toBeNull();
    expect(cardFilledContainers(container)).toEqual([]);
  });
});

describe("TasksBoard quick add (2026-11-18)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tasksRef.current = [];
    currentUserRef.current = { id: ME };
    chapter.active();
    createTaskMutate.mockResolvedValue({});
    createOpenTaskMutate.mockResolvedValue({});
  });

  it("shows only once New task is pressed, with its More open, and puts itself away (#5578)", async () => {
    render(<TasksBoard part="everyone" />);

    // At rest the first task is the first thing under the header.
    expect(screen.queryByRole("form", { name: /add a task/i })).toBeNull();
    await userEvent.click(trigger());
    const form = screen.getByRole("form", { name: /add a task/i });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      within(form).getByRole("button", { name: /^more$/i }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(within(form).getByLabelText("Notes (optional)")).toBeInTheDocument();
    expect(titleField()).toHaveFocus();

    // Escape on an empty line puts it away, and focus goes back to New task.
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("form", { name: /add a task/i })).toBeNull();
    await waitFor(() => expect(trigger()).toHaveFocus());

    // Its close keeps a half-typed task for the next New task.
    await userEvent.click(trigger());
    await userEvent.type(titleField(), "Order pizza");
    await userEvent.click(
      within(addForm()).getByRole("button", { name: "Close" }),
    );
    expect(screen.queryByRole("form", { name: /add a task/i })).toBeNull();
    await userEvent.click(trigger());
    expect(titleField()).toHaveValue("Order pizza");
  });

  it("flags who on Enter, and sends nothing", async () => {
    render(<TasksBoard part="everyone" />);

    await userEvent.type(titleField(), "Order pizza{Enter}");

    expect(createTaskMutate).not.toHaveBeenCalled();
    const alert = within(addForm()).getByRole("alert");
    expect(alert).toHaveTextContent("Pick who it's for.");
    // A task can have no due date (#5761).
    expect(alert).not.toHaveTextContent(/due date/i);
    expect(
      within(addForm()).getByRole("button", { name: /^who/i }),
    ).toHaveFocus();
  });

  it("flags nothing while typing", async () => {
    render(<TasksBoard part="everyone" />);

    await userEvent.type(titleField(), "Order pizza");

    expect(within(addForm()).queryByRole("alert")).toBeNull();
  });

  it("creates for one person on Enter, then clears for the next one", async () => {
    render(<TasksBoard part="everyone" />);
    await pickWho(/Cole Martin/);
    expect(
      within(addForm()).getByRole("button", { name: "Who: Cole Martin" }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Due date"), {
      target: { value: "2026-12-01" },
    });

    await userEvent.type(titleField(), "  Order pizza  {Enter}");

    await waitFor(() => expect(createTaskMutate).toHaveBeenCalledTimes(1));
    expect(createTaskMutate.mock.calls[0]![0]).toEqual({
      title: "Order pizza",
      description: undefined,
      assignee_id: "u-other",
      due_date: "2026-12-01",
      point_reward: undefined,
    });
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Task created" }),
    );
    await waitFor(() => expect(titleField()).toHaveValue(""));
    expect(titleField()).toHaveFocus();
    expect(screen.getByLabelText("Due date")).toHaveValue("");
  });

  it("offers Everyone's from the toast when a task made on Mine is someone else's (#5578, #5948)", async () => {
    tasksRef.current = [{ ...TASKS[0], id: "own", assignee_id: ME }];
    const showEveryone = vi.fn();
    render(<TasksBoard part="mine" onShowEveryone={showEveryone} />);
    await userEvent.click(screen.getByRole("button", { name: /^new task$/i }));
    await pickWho(/Cole Martin/);
    fireEvent.change(screen.getByLabelText("Due date"), {
      target: { value: "2026-12-01" },
    });
    await userEvent.type(titleField(), "Order pizza{Enter}");
    await waitFor(() => expect(createTaskMutate).toHaveBeenCalledTimes(1));
    const created = toastSpy.mock.calls.find(
      ([arg]) => (arg as { title?: string }).title === "Task created",
    )![0] as { action?: React.ReactElement<{ onClick: () => void }> };
    // It went where Mine doesn't show, so the toast offers Everyone's.
    expect(created.action).toBeDefined();
    act(() => created.action!.props.onClick());
    expect(showEveryone).toHaveBeenCalledTimes(1);
  });

  it("offers nothing from the toast for a task the viewer gave themselves", async () => {
    tasksRef.current = [{ ...TASKS[0], id: "own", assignee_id: ME }];
    render(<TasksBoard part="everyone" />);
    await pickWho(/Paul Carlson/);
    fireEvent.change(screen.getByLabelText("Due date"), {
      target: { value: "2026-12-01" },
    });
    await userEvent.type(titleField(), "Order pizza{Enter}");
    await waitFor(() => expect(createTaskMutate).toHaveBeenCalledTimes(1));
    const created = toastSpy.mock.calls.find(
      ([arg]) => (arg as { title?: string }).title === "Task created",
    )![0] as { action?: unknown };
    expect(created.action).toBeUndefined();
  });

  it("gives a role's members a copy each through the tasks endpoint", async () => {
    render(<TasksBoard part="everyone" />);
    await userEvent.click(
      within(addForm()).getByRole("button", { name: /^who/i }),
    );
    await userEvent.click(
      await screen.findByRole("tab", { name: "Roles and groups" }),
    );
    // A chapter with a dozen roles or fewer opens every tier.
    await userEvent.click(
      await screen.findByRole("checkbox", { name: /Recruitment Committee/ }),
    );
    await userEvent.keyboard("{Escape}");
    fireEvent.change(screen.getByLabelText("Due date"), {
      target: { value: "2026-12-01" },
    });
    await userEvent.type(titleField(), "Rush flyers{Enter}");

    await waitFor(() => expect(createTaskMutate).toHaveBeenCalledTimes(1));
    expect(createTaskMutate.mock.calls[0]![0]).toMatchObject({
      title: "Rush flyers",
      audience: "everyone",
      audience_role_id: "role-rush",
    });
    expect(createOpenTaskMutate).not.toHaveBeenCalled();
  });

  it("posts One claims it to Up for grabs", async () => {
    render(<TasksBoard part="everyone" />);
    await userEvent.click(
      within(addForm()).getByRole("button", { name: /^who/i }),
    );
    await userEvent.click(
      await screen.findByRole("checkbox", { name: /Paul Carlson/ }),
    );
    await userEvent.click(
      await screen.findByRole("checkbox", { name: /Cole Martin/ }),
    );
    await userEvent.click(
      await screen.findByRole("radio", { name: "One claims it" }),
    );
    await userEvent.keyboard("{Escape}");
    fireEvent.change(screen.getByLabelText("Due date"), {
      target: { value: "2026-12-01" },
    });
    await userEvent.type(titleField(), "Drive to the airport{Enter}");

    await waitFor(() => expect(createOpenTaskMutate).toHaveBeenCalledTimes(1));
    // Both members are the whole chapter: anyone may claim it.
    const sent = createOpenTaskMutate.mock.calls[0]![0] as Record<
      string,
      unknown
    >;
    expect(sent).toMatchObject({ title: "Drive to the airport" });
    expect(sent.user_ids).toBeUndefined();
    expect(createTaskMutate).not.toHaveBeenCalled();
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Posted to Up for grabs" }),
    );
  });

  it("takes the due date as a typed month and day, with no year to set (#3928)", async () => {
    render(<TasksBoard part="everyone" />);
    await pickWho(/Cole Martin/);
    const due = screen.getByLabelText("Due date");
    // Not the browser's date input, which shows and asks for MM/DD/YYYY.
    expect(due).toHaveAttribute("type", "text");
    await userEvent.type(due, "12/31");
    await userEvent.type(titleField(), "Order pizza{Enter}");

    await waitFor(() => expect(createTaskMutate).toHaveBeenCalledTimes(1));
    const sent = createTaskMutate.mock.calls[0]![0] as { due_date: string };
    // The next December 31st: this year's, whatever year the suite runs in.
    expect(sent.due_date).toBe(`${new Date().getFullYear()}-12-31`);
  });

  it("creates a task with no due date when Due is left empty (#5761)", async () => {
    render(<TasksBoard part="everyone" />);
    await pickWho(/Cole Martin/);
    await userEvent.type(titleField(), "Order pizza{Enter}");

    await waitFor(() => expect(createTaskMutate).toHaveBeenCalledTimes(1));
    expect(createTaskMutate.mock.calls[0]![0]).toEqual({
      title: "Order pizza",
      description: undefined,
      assignee_id: "u-other",
      point_reward: undefined,
    });
    expect(within(addForm()).queryByRole("alert")).toBeNull();
  });

  it("keeps what was typed when the create fails", async () => {
    createTaskMutate.mockRejectedValueOnce(new Error("nope"));
    await fillLine();
    fireEvent.submit(addForm());

    await waitFor(() => expect(createTaskMutate).toHaveBeenCalledTimes(1));
    expect(titleField()).toHaveValue("Order pizza");
  });

  it("puts focus back on a blank title instead of sending it", async () => {
    await fillLine();
    fireEvent.change(titleField(), { target: { value: "   " } });
    fireEvent.submit(addForm());

    expect(createTaskMutate).not.toHaveBeenCalled();
    expect(titleField()).toHaveFocus();
  });

  it("closes only the picker on Escape inside it", async () => {
    render(<TasksBoard part="everyone" />);
    await userEvent.type(titleField(), "Order pizza");
    await userEvent.click(
      within(addForm()).getByRole("button", { name: /^who/i }),
    );
    expect(
      await screen.findByRole("checkbox", { name: /Cole Martin/ }),
    ).toBeVisible();

    await userEvent.keyboard("{Escape}");

    await waitFor(() =>
      expect(
        screen.queryByRole("checkbox", { name: /Cole Martin/ }),
      ).toBeNull(),
    );
    expect(titleField()).toHaveValue("Order pizza");
  });

  it("clears the line on Escape", async () => {
    render(<TasksBoard part="everyone" />);
    await userEvent.type(titleField(), "Order{Escape}");

    expect(titleField()).toHaveValue("");
    expect(addForm()).toBeInTheDocument();
  });

  it("sits above the first lane once the board has tasks", async () => {
    tasksRef.current = TASKS;
    render(<TasksBoard part="everyone" />);

    const tile = screen.getByText("Sweep the chapter room");
    expect(
      addForm().compareDocumentPosition(tile) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("isn't offered without tasks:manage", () => {
    permissionsRef.current = ["members:view"];
    tasksRef.current = TASKS.slice(0, 2);
    render(<TasksBoard part="everyone" />);

    expect(screen.queryByRole("form", { name: /add a task/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^new task$/i })).toBeNull();
  });

  it("puts New task and its line on Mine, with none of the board (#5948)", async () => {
    tasksRef.current = TASKS.slice(0, 2);
    render(<TasksBoard part="mine" />);

    expect(screen.queryByRole("region", { name: "To do" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Filter tasks/ })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /^new task$/i }));
    expect(addForm()).toBeVisible();
  });

  async function fillLine() {
    render(<TasksBoard part="everyone" />);
    fireEvent.change(titleField(), { target: { value: "Order pizza" } });
    await pickWho(/Cole Martin/);
    fireEvent.change(screen.getByLabelText("Due date"), {
      target: { value: "2026-12-01" },
    });
  }
});

describe("TasksBoard while permissions are unknown", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tasksRef.current = [];
    currentUserRef.current = { id: ME };
    permissionsRef.current = ["members:view"];
    chapter.active();
  });

  it("keeps the columns, and says why, when the permissions read failed", () => {
    // Not the loading window: nothing would ever answer it, so a blank page
    // here would stay blank (#1211's pattern).
    permissionsRef.current = undefined;
    permissionsFailed.current = true;
    render(<TasksBoard part="everyone" />);

    expect(screen.getByRole("region", { name: "To do" })).toBeInTheDocument();
    // Where the add line would be.
    expect(screen.getByText("Permissions unavailable")).toBeInTheDocument();
  });

  it("draws nothing while permissions load, rather than a board that jumps", () => {
    permissionsRef.current = undefined;
    render(<TasksBoard part="everyone" />);

    expect(screen.queryByText(/no tasks yet/i)).toBeNull();
    expect(screen.queryByRole("region", { name: "To do" })).toBeNull();
  });
});

describe("TasksBoard editing a task (#4296)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chapter.active();
    tasksRef.current = TASKS;
    currentUserRef.current = { id: ME };
    updateTaskMutate.mockResolvedValue(undefined);
  });

  /** Opens a task's panel from its Grid tile's Edit. */
  async function openPanel(
    user: ReturnType<typeof userEvent.setup>,
    title: string,
  ) {
    await user.click(screen.getByRole("button", { name: `Edit ${title}` }));
    return screen.findByRole("dialog", { name: title });
  }

  it("opens the panel and saves only the field that changed, with no Save button", async () => {
    const user = userEvent.setup();
    render(<TasksBoard part="everyone" />);

    const panel = await openPanel(user, "Sweep the chapter room");
    expect(within(panel).queryByRole("button", { name: "Save" })).toBeNull();
    expect(
      within(panel).getByText("Changes save as you make them."),
    ).toBeInTheDocument();
    await user.click(
      within(panel).getByRole("button", {
        name: "Title: Sweep the chapter room",
      }),
    );
    const title = within(panel).getByLabelText("Title");
    expect(title).toHaveFocus();
    await user.clear(title);
    await user.type(title, "Sweep and mop the chapter room{Enter}");

    await waitFor(() =>
      expect(updateTaskMutate).toHaveBeenCalledWith({
        id: "task-todo",
        body: { title: "Sweep and mop the chapter room" },
      }),
    );
    expect(within(panel).queryByLabelText("Title")).toBeNull();
  });

  it("takes the due date off when the Due field is emptied (#5761)", async () => {
    const user = userEvent.setup();
    render(<TasksBoard part="everyone" />);

    const panel = await openPanel(user, "Sweep the chapter room");
    await user.click(within(panel).getByRole("button", { name: /^Due: / }));
    const due = within(panel).getByLabelText("Due date");
    expect(due).toHaveAttribute("placeholder", "No due date");
    await user.clear(due);
    await user.click(within(panel).getByText("Changes save as you make them."));

    await waitFor(() =>
      expect(updateTaskMutate).toHaveBeenCalledWith({
        id: "task-todo",
        body: { due_date: null, due_at: null },
      }),
    );
  });

  it("saves Fixed deadline the moment it is switched (#6096)", async () => {
    const user = userEvent.setup();
    render(<TasksBoard part="everyone" />);

    const panel = await openPanel(user, "Sweep the chapter room");
    await user.click(
      within(panel).getByRole("switch", { name: "Fixed deadline" }),
    );
    await waitFor(() =>
      expect(updateTaskMutate).toHaveBeenCalledWith({
        id: "task-todo",
        body: { fixed_deadline: true },
      }),
    );
    // An officer moves the due themselves: no Ask for more time.
    expect(
      within(panel).queryByRole("button", { name: "Ask for more time" }),
    ).toBeNull();
  });

  it("offers its assignee Ask for more time, and a fixed deadline in red in its place (#6096)", async () => {
    const user = userEvent.setup();
    permissionsRef.current = ["members:view"];
    tasksRef.current = TASKS.map((row) =>
      row.id === "task-in-progress" ? { ...row, fixed_deadline: true } : row,
    );
    render(<TasksBoard part="everyone" />);

    await user.click(screen.getAllByText("Sweep the chapter room")[0]!);
    let panel = await screen.findByRole("dialog", {
      name: "Sweep the chapter room",
    });
    expect(
      within(panel).getByRole("button", { name: "Ask for more time" }),
    ).toBeInTheDocument();
    expect(
      within(panel).queryByRole("switch", { name: "Fixed deadline" }),
    ).toBeNull();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await user.click(screen.getAllByText("Draft the rush calendar")[0]!);
    panel = await screen.findByRole("dialog", {
      name: "Draft the rush calendar",
    });
    expect(
      within(panel).queryByRole("button", { name: "Ask for more time" }),
    ).toBeNull();
    expect(
      within(panel).getByText("Fixed deadline · no extensions"),
    ).toHaveClass("text-destructive-text");
  });

  it("saves points on their own when the field loses focus", async () => {
    const user = userEvent.setup();
    render(<TasksBoard part="everyone" />);

    const panel = await openPanel(user, "Sweep the chapter room");
    await user.click(within(panel).getByRole("button", { name: "Points: 5" }));
    const points = within(panel).getByLabelText("Points");
    await user.clear(points);
    await user.type(points, "12");
    await user.click(within(panel).getByText("Changes save as you make them."));

    await waitFor(() =>
      expect(updateTaskMutate).toHaveBeenCalledWith({
        id: "task-todo",
        body: { point_reward: 12 },
      }),
    );
    expect(updateTaskMutate).toHaveBeenCalledTimes(1);
  });

  it("sends nothing when nothing changed", async () => {
    const user = userEvent.setup();
    render(<TasksBoard part="everyone" />);

    const panel = await openPanel(user, "Sweep the chapter room");
    await user.click(
      within(panel).getByRole("button", {
        name: "Title: Sweep the chapter room",
      }),
    );
    await user.keyboard("{Enter}");

    expect(updateTaskMutate).not.toHaveBeenCalled();
    expect(within(panel).queryByLabelText("Title")).toBeNull();
  });

  it("keeps what was typed when the save fails", async () => {
    updateTaskMutate.mockRejectedValue(new Error("down"));
    const user = userEvent.setup();
    render(<TasksBoard part="everyone" />);

    const panel = await openPanel(user, "Sweep the chapter room");
    await user.click(
      within(panel).getByRole("button", {
        name: "Title: Sweep the chapter room",
      }),
    );
    await user.type(within(panel).getByLabelText("Title"), "!{Enter}");

    await waitFor(() => expect(updateTaskMutate).toHaveBeenCalled());
    expect(await within(panel).findByLabelText("Title")).toHaveValue(
      "Sweep the chapter room!",
    );
  });

  it("puts the value back on Escape without saving, and keeps the panel open", async () => {
    const user = userEvent.setup();
    render(<TasksBoard part="everyone" />);

    const panel = await openPanel(user, "Draft the rush calendar");
    await user.click(
      within(panel).getByRole("button", {
        name: "Title: Draft the rush calendar",
      }),
    );
    await user.type(within(panel).getByLabelText("Title"), " now{Escape}");

    expect(updateTaskMutate).not.toHaveBeenCalled();
    expect(within(panel).queryByLabelText("Title")).toBeNull();
    expect(
      screen.getByRole("dialog", { name: "Draft the rush calendar" }),
    ).toBeInTheDocument();
  });

  it("opens the same panel from a List row's title", async () => {
    window.localStorage.setItem("frapp.tasks.layout.viewer-1", "list");
    resetListLayoutForTests();
    const user = userEvent.setup();
    render(<TasksBoard part="everyone" />);

    const row = screen
      .getAllByRole("listitem")
      .find((item) => item.getAttribute("data-task-row") === "task-todo")!;
    await user.click(
      within(row).getByRole("button", { name: "Sweep the chapter room" }),
    );
    expect(
      await screen.findByRole("dialog", { name: "Sweep the chapter room" }),
    ).toBeInTheDocument();
    expect(row).toHaveAttribute("aria-current", "true");
    // The open task is the address, pushed (#6044); its close goes Back.
    expect(window.location.search).toBe("?task=task-todo");
  });

  it("closes the panel through the address when its task leaves the read (#6044)", async () => {
    window.localStorage.setItem("frapp.tasks.layout.viewer-1", "list");
    resetListLayoutForTests();
    const user = userEvent.setup();
    const { rerender } = render(<TasksBoard part="everyone" />);
    const row = screen
      .getAllByRole("listitem")
      .find((item) => item.getAttribute("data-task-row") === "task-todo")!;
    await user.click(
      within(row).getByRole("button", { name: "Sweep the chapter room" }),
    );
    await screen.findByRole("dialog", { name: "Sweep the chapter room" });
    // Deleted (here, or by someone else): the read no longer holds it.
    tasksRef.current = tasksRef.current.filter(
      (task) => task.id !== "task-todo",
    );
    rerender(<TasksBoard part="everyone" />);
    await waitFor(() => expect(window.location.search).not.toContain("task="));
  });

  it("offers no Edit without tasks:manage, or on a confirmed task", () => {
    tasksRef.current = [
      ...TASKS,
      {
        ...TASKS[2],
        id: "task-confirmed",
        title: "Order the composites",
        points_awarded: true,
        confirmed_at: "2026-08-11T00:00:00Z",
      },
    ];
    const { unmount } = render(<TasksBoard part="everyone" />);
    expect(
      screen.queryByRole("button", { name: "Edit Order the composites" }),
    ).not.toBeInTheDocument();
    unmount();

    permissionsRef.current = [];
    render(<TasksBoard part="everyone" />);
    expect(
      screen.queryByRole("button", { name: /^edit /i }),
    ).not.toBeInTheDocument();
  });
});

/**
 * Proof kinds, send-back and decision C (#4635): Send back asks for a reason,
 * Mark done asks for what the task needs, and a task with no points and no
 * proof is Done as marked, with nothing for an officer to confirm.
 */
describe("TasksBoard proof and send back (#4635)", () => {
  const base = {
    chapter_id: "chap-1",
    description: null,
    created_by: "u-admin",
    due_date: "2026-09-03",
    completed_at: null,
    confirmed_at: null,
    created_at: "2026-08-01T00:00:00Z",
  };
  const inProgress = (overrides: Record<string, unknown>) => ({
    ...base,
    id: "task-proof",
    title: "Clean the kitchen",
    assignee_id: ME,
    status: "IN_PROGRESS" as const,
    stored_status: "IN_PROGRESS" as const,
    point_reward: null,
    points_awarded: false,
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    chapter.active();
    currentUserRef.current = { id: ME };
    updateStatusMutate.mockResolvedValue({});
    rejectTaskMutate.mockResolvedValue({});
  });

  it("sends back only with a reason, and posts it with Ask for a photo", async () => {
    tasksRef.current = [TASKS[2]];
    render(<TasksBoard part="everyone" />);

    fireEvent.click(sendBackButton());
    const dialog = await screen.findByRole("dialog", { name: "Send back" });
    // A blank reason is refused, and nothing is written.
    fireEvent.click(within(dialog).getByRole("button", { name: "Send back" }));
    expect(
      await within(dialog).findByText("Say what needs to change."),
    ).toBeInTheDocument();
    expect(rejectTaskMutate).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByLabelText("What needs to change"), {
      target: { value: "  The floor is still sticky  " },
    });
    fireEvent.click(
      within(dialog).getByRole("switch", { name: "Ask for a photo next time" }),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Send back" }));
    await waitFor(() =>
      expect(rejectTaskMutate).toHaveBeenCalledWith({
        id: "task-completed",
        body: {
          comment: "The floor is still sticky",
          require_photo: true,
        },
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Send back" })).toBeNull(),
    );
  });

  it("leaves require_photo off when the switch is not turned on", async () => {
    tasksRef.current = [TASKS[2]];
    render(<TasksBoard part="everyone" />);

    fireEvent.click(sendBackButton());
    const dialog = await screen.findByRole("dialog", { name: "Send back" });
    fireEvent.change(within(dialog).getByLabelText("What needs to change"), {
      target: { value: "Wrong venue" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Send back" }));
    await waitFor(() =>
      expect(rejectTaskMutate).toHaveBeenCalledWith({
        id: "task-completed",
        body: { comment: "Wrong venue" },
      }),
    );
  });

  it("opens Mark done's sheet on a Photo task and refuses it without a photo", async () => {
    tasksRef.current = [inProgress({ proof_kind: "photo" })];
    render(<TasksBoard part="everyone" />);

    fireEvent.click(
      screen.getByRole("button", { name: "Mark done with a photo" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Mark done" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Mark done" }));
    expect(
      await within(dialog).findByText(
        "Add at least one photo of the finished job.",
      ),
    ).toBeInTheDocument();
    expect(updateStatusMutate).not.toHaveBeenCalled();
  });

  it("refuses a sent-back None task with nothing new, and posts the reply", async () => {
    tasksRef.current = [
      inProgress({
        proof_kind: "none",
        sent_back_at: "2026-08-12T00:00:00Z",
        sent_back_reason: "The floor is still sticky",
      }),
    ];
    render(<TasksBoard part="everyone" />);

    // Needs changes, with the officer's reason on the tile.
    expect(screen.getByText("Needs changes")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mark done" }));
    const dialog = await screen.findByRole("dialog", { name: "Mark done" });
    expect(
      within(dialog).getByText("The floor is still sticky"),
    ).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Mark done" }));
    expect(
      await within(dialog).findByText(
        "Add proof or reply to the officer before marking it done.",
      ),
    ).toBeInTheDocument();
    expect(updateStatusMutate).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByLabelText("Reply to the officer"), {
      target: { value: "  Mopped it twice  " },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Mark done" }));
    await waitFor(() =>
      expect(updateStatusMutate).toHaveBeenCalledWith({
        id: "task-proof",
        body: { status: "COMPLETED", completion_note: "Mopped it twice" },
      }),
    );
  });

  it("marks a None task done at once, with no sheet", async () => {
    tasksRef.current = [inProgress({ proof_kind: "none" })];
    render(<TasksBoard part="everyone" />);

    fireEvent.click(screen.getByRole("button", { name: "Mark done" }));
    await waitFor(() =>
      expect(updateStatusMutate).toHaveBeenCalledWith({
        id: "task-proof",
        body: { status: "COMPLETED" },
      }),
    );
    expect(screen.queryByRole("dialog", { name: "Mark done" })).toBeNull();
  });

  it("shows a no-points, no-proof completion as Done, with only Send back to an officer", () => {
    tasksRef.current = [
      {
        ...TASKS[2],
        id: "task-done",
        point_reward: null,
        proof_kind: "none",
        // The server confirmed it as it was marked done (decision C).
        points_awarded: true,
        confirmed_at: "2026-08-10T00:00:00Z",
      },
    ];
    render(<TasksBoard part="everyone" />);

    expect(screen.getByText("Done")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^confirm/i })).toBeNull();
    expect(sendBackButton()).toBeEnabled();
  });
});

describe("TasksBoard views and filters (#4295 step 5, #3617)", () => {
  /** A local `YYYY-MM-DD` this many days from today. */
  const dayFromToday = (days: number) => {
    const at = new Date();
    at.setDate(at.getDate() + days);
    const mm = String(at.getMonth() + 1).padStart(2, "0");
    const dd = String(at.getDate()).padStart(2, "0");
    return `${at.getFullYear()}-${mm}-${dd}`;
  };
  const task = (
    id: string,
    title: string,
    assignee: string,
    days: number,
    status: "TODO" | "IN_PROGRESS" | "COMPLETED" | "OVERDUE" = "TODO",
    extra: Record<string, unknown> = {},
  ) => ({
    ...TASKS[0]!,
    id,
    title,
    assignee_id: assignee,
    due_date: dayFromToday(days),
    status,
    ...extra,
  });
  const ROWS = [
    task("late", "Return the projector", ME, -2, "OVERDUE"),
    task("today", "Sweep the chapter room", ME, 0),
    task("week", "Draft the rush calendar", ME, 3, "IN_PROGRESS"),
    task("later", "Plan formal", ME, 20),
    task("waiting", "Book the venue", ME, 1, "COMPLETED", {
      completed_at: "2026-08-10T00:00:00Z",
    }),
    task("cole", "Order shirts", "u-other", 2),
  ];
  const region = (name: string) => screen.getByRole("region", { name });
  const titlesIn = (name: string) =>
    within(region(name))
      .queryAllByRole("listitem")
      .map((item) => item.querySelector("p")?.textContent);

  beforeEach(() => {
    vi.clearAllMocks();
    chapter.active();
    currentUserRef.current = { id: ME };
    tasksRef.current = ROWS;
  });

  /** Picks a filter's value in the Filter menu (#5578). */
  async function pickFilter(label: string, value: string) {
    await userEvent.click(filterButton());
    await userEvent.click(
      await screen.findByRole("menuitem", { name: new RegExp(`^${label}`) }),
    );
    await userEvent.click(
      await screen.findByRole("menuitemradio", { name: value }),
    );
  }

  /** The values a filter's side list offers; the menu closes again. */
  async function filterValues(label: string): Promise<string[]> {
    await userEvent.click(filterButton());
    await userEvent.click(
      await screen.findByRole("menuitem", { name: new RegExp(`^${label}`) }),
    );
    const values = (await screen.findAllByRole("menuitemradio")).map(
      (item) => item.textContent ?? "",
    );
    await userEvent.keyboard("{Escape}{Escape}");
    return values;
  }

  it("filters the chapter's board by assignee, status and due date from Filter, and clears them", async () => {
    const user = userEvent.setup();
    render(<TasksBoard part="everyone" />);

    await pickFilter("Assignee", "Cole Martin");
    expect(titlesIn("To do")).toEqual(["Order shirts"]);
    expect(screen.queryByText("Sweep the chapter room")).toBeNull();
    // A filter that is on shows as a removable chip, and Filter counts it.
    expect(filterButton()).toHaveAccessibleName("Filter tasks, 1 on");
    const filters = screen.getByRole("group", { name: "Filters on" });
    await user.click(
      within(filters).getByRole("button", {
        name: "Remove filter Assignee: Cole Martin",
      }),
    );
    expect(screen.getByText("Sweep the chapter room")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Filters on" })).toBeNull();

    await pickFilter("Status", "In progress");
    // A status keeps its own lane alone.
    expect(screen.queryByRole("region", { name: "To do" })).toBeNull();
    expect(titlesIn("In progress")).toEqual(["Draft the rush calendar"]);

    // Clear all is in the Filter menu too.
    await user.click(filterButton());
    await user.click(
      await screen.findByRole("menuitem", { name: "Clear all" }),
    );
    await pickFilter("Due", "Due today");
    expect(titlesIn("To do")).toEqual(["Sweep the chapter room"]);
    expect(titlesIn("Overdue")).toEqual([]);
  });

  it("offers only values some task has", async () => {
    tasksRef.current = [ROWS[1]!];
    render(<TasksBoard part="everyone" />);
    expect(await filterValues("Status")).not.toContain("Overdue");
    expect(await filterValues("Due")).not.toContain("Due later");
  });

  it("says when no task matches", async () => {
    render(<TasksBoard part="everyone" />);
    await pickFilter("Assignee", "Cole Martin");
    await pickFilter("Due", "Overdue");
    expect(
      screen.getByText("No tasks match these filters."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "To do" })).toBeNull();
  });

  it("keeps a picked value named after its last task leaves", async () => {
    const { rerender } = render(<TasksBoard part="everyone" />);
    await pickFilter("Status", "Overdue");
    tasksRef.current = ROWS.filter((row) => row.status !== "OVERDUE");
    rerender(<TasksBoard part="everyone" />);
    expect(
      screen.getByRole("button", { name: "Remove filter Status: Overdue" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No tasks match these filters."),
    ).toBeInTheDocument();
  });

  it("lists a confirmed task once, under Confirmed, not under Waiting on an officer", () => {
    permissionsRef.current = ["members:view"];
    tasksRef.current = [
      ...ROWS.filter((row) => row.assignee_id === ME),
      task("done", "Fold the flyers", ME, -1, "COMPLETED", {
        points_awarded: true,
        completed_at: "2026-08-10T00:00:00Z",
        confirmed_at: "2026-08-11T00:00:00Z",
      }),
    ];
    render(<TasksBoard part="everyone" />);
    expect(titlesIn("Waiting on an officer")).toEqual(["Book the venue"]);
    expect(screen.getAllByText("Fold the flyers")).toHaveLength(1);
  });

  it("groups the chapter's board by person, with each tile's status", async () => {
    render(<TasksBoard part="everyone" />);
    await pickView("By person");

    expect(titlesIn("Cole Martin")).toEqual(["Order shirts"]);
    // By name, whatever order the read listed them in.
    const labels = screen
      .getAllByRole("region")
      .map((section) => section.getAttribute("aria-labelledby"))
      .filter(
        (id): id is string => id?.startsWith("tasks-column-person-") ?? false,
      )
      .map((id) => document.getElementById(id)?.textContent ?? "");
    expect(labels.map((label) => label.replace(/\d+$/, "").trim())).toEqual([
      "Cole Martin",
      "Paul Carlson (you)",
    ]);
    expect(titlesIn("Paul Carlson (you)")).toEqual([
      "Return the projector",
      "Sweep the chapter room",
      "Book the venue",
      "Draft the rush calendar",
      "Plan formal",
    ]);
    const mine = region("Paul Carlson (you)");
    expect(within(mine).getByText("Waiting on an officer")).toBeVisible();
    expect(within(mine).getByText("In progress")).toBeVisible();
  });
});

describe("TasksBoard repeating tasks (#5119)", () => {
  const REPEATING = {
    ...TASKS[0],
    // A Monday copy far ahead, so it reads as still to come.
    due_date: "2099-11-16",
    series: {
      recurrence_rule: "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO;TZID=America/New_York",
      next_due_date: "2099-11-23",
      ended: false,
    },
  };

  beforeEach(() => {
    chapter.active();
    deleteTaskMutate.mockReset().mockResolvedValue(undefined);
    tasksRef.current = [REPEATING];
  });

  it("says on the tile how it repeats and when it comes next", () => {
    render(<TasksBoard part="everyone" />);
    expect(
      screen.getByText("Every Monday · next November 23"),
    ).toBeInTheDocument();
  });

  it("says nothing once the series has ended", () => {
    tasksRef.current = [
      { ...REPEATING, series: { ...REPEATING.series, ended: true } },
    ];
    render(<TasksBoard part="everyone" />);
    expect(screen.queryByText(/Every Monday/)).toBeNull();
  });

  it("asks whether to delete this task or stop it repeating", async () => {
    render(<TasksBoard part="everyone" />);
    fireEvent.click(deleteButtons()[0]!);
    expect(
      await screen.findByText("Delete a repeating task"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "All upcoming tasks" }));
    await waitFor(() =>
      expect(deleteTaskMutate).toHaveBeenCalledWith({
        id: "task-todo",
        scope: "series",
      }),
    );
  });

  it("deletes the one copy with This task only", async () => {
    render(<TasksBoard part="everyone" />);
    fireEvent.click(deleteButtons()[0]!);
    fireEvent.click(
      await screen.findByRole("button", { name: "This task only" }),
    );
    await waitFor(() =>
      expect(deleteTaskMutate).toHaveBeenCalledWith("task-todo"),
    );
  });
});

describe("TasksBoard tasks for everyone (#4295 step 3)", () => {
  const copy = (
    id: string,
    assignee: string,
    over: Record<string, unknown> = {},
  ) => ({
    ...TASKS[0],
    id,
    title: "Fill out the tabling form",
    assignee_id: assignee,
    due_date: "2099-11-20",
    group_id: "group-1",
    ...over,
  });
  const GROUP = [
    copy("copy-me", ME),
    copy("copy-other", "u-other", { status: "IN_PROGRESS" }),
    copy("copy-third", "u-third", {
      status: "COMPLETED",
      completed_at: "2026-08-10T00:00:00Z",
    }),
  ];

  beforeEach(() => {
    chapter.active();
    currentUserRef.current = { id: ME };
    deleteTaskMutate.mockReset().mockResolvedValue(undefined);
    tasksRef.current = GROUP;
  });

  it("draws the open copies as one tile with how many are done", async () => {
    render(<TasksBoard part="everyone" />);
    const tile = screen.getByRole("listitem", {
      name: "Fill out the tabling form, for everyone",
    });
    expect(within(tile).getByText("1 of 3 done")).toBeInTheDocument();
    // Not a tile per open copy; the one marked done waits on an officer.
    expect(
      screen.getAllByText("Fill out the tabling form", { selector: "button" }),
    ).toHaveLength(2);
    expect(
      within(tile).getByRole("progressbar", { name: /1 of 3 done/ }),
    ).toHaveAttribute("aria-valuenow", "1");
  });

  it("lists who's left and where each stands", async () => {
    render(<TasksBoard part="everyone" />);
    const tile = screen.getByRole("listitem", {
      name: "Fill out the tabling form, for everyone",
    });
    fireEvent.click(
      within(tile).getByRole("button", { name: /who's left \(2\)/i }),
    );
    expect(within(tile).getByText("You")).toBeInTheDocument();
    expect(within(tile).getByText("Cole Martin")).toBeInTheDocument();
    expect(within(tile).getByText("In progress")).toBeInTheDocument();
  });

  it("deletes everyone's copy after asking", async () => {
    render(<TasksBoard part="everyone" />);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Delete Fill out the tabling form for everyone",
      }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Delete for everyone" }),
    );
    await waitFor(() =>
      expect(deleteTaskMutate).toHaveBeenCalledWith({
        id: "copy-me",
        scope: "group",
      }),
    );
  });

  it("edits everyone's copy in the panel, sending the change with the group scope", async () => {
    updateTaskMutate.mockReset().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<TasksBoard part="everyone" />);
    await user.click(
      screen.getByRole("button", {
        name: "Edit Fill out the tabling form for everyone",
      }),
    );
    const panel = await screen.findByRole("dialog", {
      name: "Fill out the tabling form",
    });
    // Who's done is in the panel; repeat and photos aren't offered.
    expect(
      within(panel).getByRole("region", { name: "Who's done" }),
    ).toBeInTheDocument();
    expect(
      within(panel).getByText(TASK_AUDIENCE_COPY.noRepeat),
    ).toBeInTheDocument();
    await user.click(
      within(panel).getByRole("button", {
        name: "Title: Fill out the tabling form",
      }),
    );
    const title = within(panel).getByLabelText("Title");
    await user.clear(title);
    await user.type(title, "Fill out the new form{Enter}");

    await waitFor(() =>
      expect(updateTaskMutate).toHaveBeenCalledWith({
        id: "copy-me",
        body: { title: "Fill out the new form", scope: "group" },
      }),
    );
  });

  it("draws the group as one List row with its progress, which opens the panel", async () => {
    window.localStorage.setItem("frapp.tasks.layout.viewer-1", "list");
    resetListLayoutForTests();
    const user = userEvent.setup();
    render(<TasksBoard part="everyone" />);
    const row = screen.getByRole("listitem", {
      name: "Fill out the tabling form, for everyone",
    });
    expect(within(row).getByText("1 of 3")).toBeInTheDocument();
    await user.click(
      within(row).getByRole("button", { name: "Fill out the tabling form" }),
    );
    const panel = await screen.findByRole("dialog", {
      name: "Fill out the tabling form",
    });
    // The group's Who offers Add people to an officer (#5905).
    expect(
      within(panel).getByRole("button", { name: "Add people" }),
    ).toBeInTheDocument();
  });

  it("offers no Add people on a copy without tasks:manage (#5905)", async () => {
    window.localStorage.setItem("frapp.tasks.layout.viewer-1", "list");
    resetListLayoutForTests();
    permissionsRef.current = [];
    tasksRef.current = GROUP.map((task) => ({
      ...task,
      group: { audience: "everyone", total: 20, done: 14, confirmed: 9 },
    }));
    // A member's read holds their own copy; its link (a notification's)
    // opens the group, whose Who row an officer adds people from.
    setAddress(`/activity?task=${GROUP[0]!.id}`);
    render(<TasksBoard part="everyone" />);
    const panel = await screen.findByRole("dialog", {
      name: "Fill out the tabling form",
    });
    expect(
      within(panel).queryByRole("button", { name: "Add people" }),
    ).toBeNull();
  });

  it("keeps each copy's person on Everyone's By person, where the group heading names them (#5699)", async () => {
    window.localStorage.setItem("frapp.tasks.layout.viewer-1", "list");
    resetListLayoutForTests();
    tasksRef.current = GROUP.map((task) => ({
      ...task,
      group: { audience: "everyone", total: 20, done: 14, confirmed: 9 },
    }));
    render(<TasksBoard part="everyone" />);
    await pickView("By person");
    const cole = screen.getByRole("region", { name: "Cole Martin" });
    expect(within(cole).getAllByText("Cole Martin").length).toBeGreaterThan(1);
    expect(within(cole).queryByText("Everyone")).toBeNull();
  });

  it("counts the group as the API does, copies on other pages included", async () => {
    tasksRef.current = GROUP.map((task) => ({
      ...task,
      group: { total: 20, done: 14, confirmed: 9 },
    }));
    render(<TasksBoard part="everyone" />);
    const tile = screen.getByRole("listitem", {
      name: "Fill out the tabling form, for everyone",
    });
    expect(within(tile).getByText("14 of 20 done")).toBeInTheDocument();
  });

  it("shows each copy on its own once a filter asks about members", async () => {
    render(<TasksBoard part="everyone" />);
    await pickView("By person");
    expect(
      screen.queryByRole("listitem", {
        name: "Fill out the tabling form, for everyone",
      }),
    ).toBeNull();
  });

  describe("the links, /tasks?group=<id> and ?task=<id> (#5538)", () => {
    const dropsParam = () => {
      const spy = vi.spyOn(window.history, "replaceState");
      spy.mockClear();
      return spy;
    };

    it("opens the group in the task panel and keeps it in the address", async () => {
      setAddress("/activity?group=group-1");
      const replaceState = dropsParam();
      render(<TasksBoard part="everyone" />);
      const panel = await screen.findByRole("dialog", {
        name: "Fill out the tabling form",
      });
      // The group's panel, not one member's copy.
      expect(
        within(panel).getByRole("region", { name: "Who's done" }),
      ).toBeInTheDocument();
      expect(replaceState).not.toHaveBeenCalled();
      expect(window.location.search).toBe("?group=group-1");
      expect(tasksRefetch).not.toHaveBeenCalled();
      expect(toastSpy).not.toHaveBeenCalled();
    });

    it("opens a link on Mine too, reading the tasks only once one asks (#5948)", async () => {
      render(<TasksBoard part="mine" />);
      // No link: Mine draws no board, so it reads none.
      expect(tasksEnabled.at(-1)).toBe(false);
      cleanup();

      setAddress("/activity?view=everyone&group=group-1");
      const replaceState = dropsParam();
      render(<TasksBoard part="mine" />);
      expect(
        await screen.findByRole("dialog", {
          name: "Fill out the tabling form",
        }),
      ).toBeInTheDocument();
      expect(tasksEnabled.at(-1)).toBe(true);
      // The link stays in the address while its panel is open (#6044).
      expect(replaceState).not.toHaveBeenCalled();
      expect(window.location.search).toBe("?view=everyone&group=group-1");
      window.history.pushState(null, "", "/");
    });

    it("opens a copy's link as its group", async () => {
      setAddress("/activity?task=copy-other");
      render(<TasksBoard part="everyone" />);
      const panel = await screen.findByRole("dialog", {
        name: "Fill out the tabling form",
      });
      expect(
        within(panel).getByRole("region", { name: "Who's done" }),
      ).toBeInTheDocument();
    });

    it("reads again before calling a group missing: a cached read can predate it", async () => {
      setAddress("/activity?group=group-new");
      let land!: () => void;
      tasksRefetch.mockImplementation(
        () => new Promise<void>((resolve) => (land = resolve)),
      );
      const { rerender } = render(<TasksBoard part="everyone" />);
      await waitFor(() => expect(tasksRefetch).toHaveBeenCalledTimes(1));
      expect(toastSpy).not.toHaveBeenCalled();

      // The re-read lands with the group in it.
      tasksRef.current = GROUP.map((task) => ({
        ...task,
        group_id: "group-new",
      }));
      rerender(<TasksBoard part="everyone" />);
      await act(async () => land());
      expect(
        await screen.findByRole("dialog", {
          name: "Fill out the tabling form",
        }),
      ).toBeInTheDocument();
      expect(toastSpy).not.toHaveBeenCalled();
    });

    it("says a group the re-read doesn't hold is gone, and leaves the board", async () => {
      setAddress("/activity?group=gone");
      const replaceState = dropsParam();
      render(<TasksBoard part="everyone" />);
      await waitFor(() =>
        expect(toastSpy).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Couldn't find that task" }),
        ),
      );
      expect(tasksRefetch).toHaveBeenCalledTimes(1);
      expect(replaceState).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });
});

describe("TasksBoard up for grabs (2026-11-18)", () => {
  const POSTING = {
    id: "posting-1",
    chapter_id: "chap-1",
    created_by: "u-admin",
    title: "Drive the speaker from the airport",
    description: null,
    due_date: "2099-11-21",
    due_at: null,
    point_reward: 15,
    proof_kind: "none",
    subtask_titles: [],
    scope: "role",
    scope_id: "role-rush",
    scope_name: "Recruitment Committee",
    scope_user_ids: null,
    status: "open",
    claimed_task_id: null,
    claimed_by: null,
    claimed_at: null,
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
    eligible_count: 4,
    viewer_can_claim: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    chapter.active();
    currentUserRef.current = { id: ME };
    tasksRef.current = TASKS;
    openTasksRef.current = [POSTING];
  });

  const section = () => screen.getByRole("region", { name: /up for grabs/i });

  it("shows a member who may claim it, with points, and nothing an officer has", () => {
    permissionsRef.current = ["members:view"];
    render(<TasksBoard part="mine" />);

    const row = within(section()).getByText(POSTING.title).closest("li")!;
    // Who may claim it and when, under the title.
    expect(
      within(row).getByText(/^Someone in Recruitment Committee · Due /),
    ).toBeInTheDocument();
    expect(within(row).getByText("+15 pts")).toBeInTheDocument();
    expect(
      within(row).getByRole("button", { name: `Claim: ${POSTING.title}` }),
    ).toBeEnabled();
    expect(within(row).queryByRole("button", { name: /^assign/i })).toBeNull();
    // The title is not a button for a member: there is no panel to open.
    expect(
      within(row).queryByRole("button", { name: POSTING.title }),
    ).toBeNull();
  });

  it("shows on Mine for a member with nothing of their own", () => {
    permissionsRef.current = ["members:view"];
    tasksRef.current = [];
    render(<TasksBoard part="mine" />);
    expect(section()).toBeInTheDocument();
  });

  it("says it's yours, and when it's due, with Give it back", async () => {
    claimMutate.mockResolvedValue({ id: "task-claimed" });
    render(<TasksBoard part="mine" />);

    await userEvent.click(
      within(section()).getByRole("button", {
        name: `Claim: ${POSTING.title}`,
      }),
    );

    await waitFor(() => expect(claimMutate).toHaveBeenCalledWith("posting-1"));
    const shown = toastSpy.mock.calls.at(-1)![0] as {
      title: string;
      action?: React.ReactElement;
    };
    expect(shown.title).toMatch(/^It's yours\. Due /);
    expect(shown.action).toBeDefined();
  });

  it("says someone got there first on a 409", async () => {
    claimMutate.mockRejectedValue({ status: 409 });
    render(<TasksBoard part="mine" />);

    await userEvent.click(
      within(section()).getByRole("button", {
        name: `Claim: ${POSTING.title}`,
      }),
    );

    await waitFor(() =>
      expect(toastSpy).toHaveBeenCalledWith(
        expect.objectContaining({ title: TASK_AUDIENCE_COPY.alreadyClaimed }),
      ),
    );
  });

  it("lets an officer assign it to one person", async () => {
    assignMutate.mockResolvedValue({});
    render(<TasksBoard part="mine" />);

    await userEvent.click(
      within(section()).getByRole("button", {
        name: `Assign ${POSTING.title}`,
      }),
    );
    // A person only: no roles tab, no mode switch.
    expect(screen.queryByRole("tab", { name: "Roles and groups" })).toBeNull();
    await userEvent.click(
      await screen.findByRole("radio", { name: /Cole Martin/ }),
    );

    await waitFor(() =>
      expect(assignMutate).toHaveBeenCalledWith({
        id: "posting-1",
        assigneeId: "u-other",
      }),
    );
  });

  it("opens the posting in a panel for an officer", async () => {
    render(<TasksBoard part="mine" />);
    await userEvent.click(
      within(section()).getByRole("button", { name: POSTING.title }),
    );
    const panel = await screen.findByRole("dialog", { name: POSTING.title });
    expect(
      within(panel).getByRole("button", { name: /^due:/i }),
    ).toBeInTheDocument();
  });

  it("offers Give it back on a task claimed from it", async () => {
    releaseMutate.mockResolvedValue({});
    tasksRef.current = [{ ...TASKS[0]!, open_task_id: "posting-1" }];
    openTasksRef.current = [];
    const user = userEvent.setup();
    render(<TasksBoard part="everyone" />);

    await user.click(
      screen.getByRole("button", { name: "Edit Sweep the chapter room" }),
    );
    const panel = await screen.findByRole("dialog", {
      name: "Sweep the chapter room",
    });
    await user.click(
      within(panel).getByRole("button", { name: TASK_AUDIENCE_COPY.release }),
    );
    await waitFor(() =>
      expect(releaseMutate).toHaveBeenCalledWith("task-todo"),
    );
  });

  it("offers no Give it back once the task is done, or on someone else's", async () => {
    tasksRef.current = [
      {
        ...TASKS[0]!,
        id: "task-done",
        title: "Wash the van",
        status: "COMPLETED" as const,
        completed_at: "2026-08-10T00:00:00Z",
        open_task_id: "posting-1",
      },
      { ...TASKS[2]!, status: "TODO" as const, open_task_id: "posting-2" },
    ];
    openTasksRef.current = [];
    const user = userEvent.setup();
    render(<TasksBoard part="everyone" />);

    await user.click(screen.getByRole("button", { name: "Edit Wash the van" }));
    const done = await screen.findByRole("dialog", { name: "Wash the van" });
    expect(
      within(done).queryByRole("button", { name: TASK_AUDIENCE_COPY.release }),
    ).toBeNull();
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Wash the van" })).toBeNull(),
    );

    await user.click(
      screen.getByRole("button", { name: "Edit Book the philanthropy venue" }),
    );
    const theirs = await screen.findByRole("dialog", {
      name: "Book the philanthropy venue",
    });
    expect(
      within(theirs).queryByRole("button", {
        name: TASK_AUDIENCE_COPY.release,
      }),
    ).toBeNull();
  });
});
