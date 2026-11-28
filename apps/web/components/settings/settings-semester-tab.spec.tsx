import { act, fireEvent, render, screen } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SemesterArchive } from "@repo/hooks";
import type { SubscriptionGate } from "@/components/shared/subscription-gate";

/**
 * Chapter settings → Semester and its new-semester page (#6028): what the
 * page states from the archives, the row only a `semester:rollover` holder
 * gets, the month's limit before anything is pressed, a failed read that
 * guesses nothing, and where the address goes when a rollover finishes.
 */
const h = vi.hoisted(() => ({
  allowed: new Set<string>(),
  toast: vi.fn(),
}));

// The gate as a permission set, so a viewer without the key gets the denied
// fallback the page passes.
vi.mock("@/components/shared/can", () => ({
  Can: ({
    permission,
    children,
    deniedFallback = null,
  }: {
    permission: string;
    children: React.ReactNode;
    deniedFallback?: React.ReactNode;
  }) => <>{h.allowed.has(permission) ? children : deniedFallback}</>,
}));
vi.mock("@/components/shared/subscription-gate", () => ({
  SubscriptionNotice: () => null,
}));
vi.mock("@/lib/hooks/use-toast", () => ({
  useToast: () => ({ toast: h.toast }),
}));

const { SettingsSemesterTab, useRolloverForm } =
  await import("./settings-semester-tab");

const gate: SubscriptionGate = {
  allowed: true,
  controlProps: (busy?: boolean) => ({
    disabled: busy === true,
    title: undefined,
    "aria-describedby": undefined,
  }),
} as unknown as SubscriptionGate;

const spring: SemesterArchive = {
  id: "s-spring",
  label: "Spring 2026",
  start_date: "2026-01-12",
  end_date: "2026-05-08",
  created_at: "2026-05-09T14:00:00Z",
};

function setup(
  over: Partial<{
    page: string | null;
    semesters: SemesterArchive[];
    pending: boolean;
    failed: boolean;
    mutateAsync: (body: unknown) => Promise<unknown>;
  }> = {},
) {
  const form = renderHook(() => useRolloverForm());
  const mutateAsync = vi.fn(over.mutateAsync ?? (async () => ({})));
  const props = () => ({
    form: form.result.current,
    pledgeTerm: "New Member",
    confirm: vi.fn(async () => true) as never,
    rollover: { mutateAsync, isPending: false } as never,
    rolloverGate: gate,
    semesters: over.semesters ?? [spring],
    semestersPending: over.pending ?? false,
    semestersFailed: over.failed ?? false,
    onRetrySemesters: vi.fn(),
    page: over.page === undefined ? null : over.page,
  });
  const view = render(<SettingsSemesterTab {...props()} />);
  const rerender = () => view.rerender(<SettingsSemesterTab {...props()} />);
  return { view, rerender, form, mutateAsync };
}

beforeEach(() => {
  h.allowed = new Set(["semester:rollover", "roles:manage"]);
  h.toast.mockReset();
  window.history.replaceState(null, "", "/settings?tab=semester");
});
afterEach(() => vi.useRealTimers());

describe("the Semester page (#6028)", () => {
  it("says when this semester started and lists the archives as rows", () => {
    setup();
    expect(screen.getByText("Since May 9")).toBeInTheDocument();
    expect(screen.getByText("Spring 2026")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /start a new semester/i }),
    ).toHaveAttribute("href", "/settings?tab=semester&page=new");
  });

  it("says None yet before any semester has ended", () => {
    setup({ semesters: [] });
    expect(screen.getByText("Since the chapter joined")).toBeInTheDocument();
    expect(screen.getByText("None yet")).toBeInTheDocument();
  });

  it("offers a new semester only to a semester:rollover holder", () => {
    h.allowed = new Set();
    setup();
    expect(
      screen.queryByRole("link", { name: /start a new semester/i }),
    ).toBeNull();
  });

  it("shows the month's limit on the row, before anything is pressed", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-05-20T12:00:00Z"));
    setup();
    expect(
      screen.getByRole("link", { name: /start a new semester.*from june 1/i }),
    ).toBeInTheDocument();
  });

  it("guesses nothing when the archives couldn't be read", () => {
    setup({ semesters: [], failed: true });
    expect(screen.queryByText("Since the chapter joined")).toBeNull();
    expect(screen.queryByText("None yet")).toBeNull();
    expect(
      screen.getByText("Couldn't load past semesters"),
    ).toBeInTheDocument();
  });
});

describe("the new-semester page (#6028)", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/settings?tab=semester&page=new");
  });

  const nameIt = (
    rerender: () => void,
    form: { result: { current: { setLabel: (v: string) => void } } },
  ) => {
    act(() => form.result.current.setLabel("Fall 2026"));
    rerender();
  };

  it("fills First day from the last archive and waits for a name", () => {
    const { rerender, form } = setup({ page: "new" });
    expect(
      (screen.getByLabelText(/first day/i) as HTMLInputElement).value,
    ).toMatch(/^May 9/);
    expect(
      screen.getByRole("button", { name: "Name the semester first" }),
    ).toBeDisabled();
    nameIt(rerender, form);
    expect(
      screen.getByRole("button", { name: "Start new semester" }),
    ).toBeEnabled();
  });

  it("dims the button with the month's limit and never sends", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-05-20T12:00:00Z"));
    const { rerender, form, mutateAsync } = setup({ page: "new" });
    nameIt(rerender, form);
    const button = screen.getByRole("button", { name: "From June 1" });
    expect(button).toBeDisabled();
    fireEvent.submit(button.closest("form")!);
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("waits while the archives are unread or failed", () => {
    const a = setup({ page: "new", pending: true, semesters: [] });
    nameIt(a.rerender, a.form);
    expect(
      screen.getByRole("button", { name: "Loading past semesters" }),
    ).toBeDisabled();
    a.view.unmount();
    const b = setup({ page: "new", failed: true, semesters: [] });
    nameIt(b.rerender, b.form);
    expect(
      screen.getByRole("button", { name: "Couldn't load past semesters" }),
    ).toBeDisabled();
  });

  it("goes back to Semester and names the archive once it's done", async () => {
    const { rerender, form, mutateAsync } = setup({ page: "new" });
    nameIt(rerender, form);
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Start new semester" }),
      );
    });
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ label: "Fall 2026", start_date: "2026-05-09" }),
    );
    expect(h.toast).toHaveBeenCalledWith({
      title: "New semester started",
      description: "Fall 2026 is archived.",
    });
    expect(window.location.search).toBe("?tab=semester");
  });

  it("leaves the address alone when the officer moved on before it finished", async () => {
    let finish!: () => void;
    const { rerender, form } = setup({
      page: "new",
      mutateAsync: () => new Promise<void>((resolve) => (finish = resolve)),
    });
    nameIt(rerender, form);
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Start new semester" }),
      );
    });
    // Another row's own page, which carries a `page=` of its own.
    window.history.replaceState(null, "", "/settings?tab=chat&page=chat-admin");
    await act(async () => finish());
    expect(window.location.search).toBe("?tab=chat&page=chat-admin");
  });
});
