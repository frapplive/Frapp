import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  items: { current: [] as unknown[] },
  accept: vi.fn(),
  dismiss: vi.fn(),
  toast: vi.fn(),
  get: vi.fn(),
}));

vi.mock("@repo/hooks", () => ({
  useAiSuggestions: () => ({ data: { items: mocks.items.current } }),
  useAcceptAiSuggestion: () => ({ mutateAsync: mocks.accept }),
  useDismissAiSuggestion: () => ({ mutateAsync: mocks.dismiss }),
  useFrappClient: () => ({ GET: mocks.get }),
  useActiveChapterId: () => "chap-1",
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    fetchQuery: ({ queryFn }: { queryFn: () => Promise<unknown> }) => queryFn(),
  }),
}));

vi.mock("@/lib/hooks/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

// The Tasks board's list has its own spec; only its refusal wording is used.
vi.mock("@/components/ai/suggested-tasks", () => ({
  suggestionRefusalLine: () => "Another officer already decided this one.",
}));

// Report this has its own spec (#4315).
vi.mock("@/components/ai/report-ai", () => ({
  ReportAiButton: () => null,
}));

vi.mock("@/components/events/local-input", () => ({
  isoToLocalInput: (value: string) => `local:${value}`,
}));

const { SuggestedEvents, planFromLastYear, useRecordPlannedEvent } =
  await import("./suggested-events");

function suggestion(id: string, event: Record<string, unknown> = {}) {
  return {
    id,
    kind: "event",
    status: "pending",
    source: { type: "event", id: `last-${id}` },
    batch_id: `b-${id}`,
    task: null,
    event: {
      name: "Philanthropy Week",
      last_year_at: "2026-04-13T16:00:00.000Z",
      times: 1,
      ...event,
    },
    quote: "Philanthropy Week",
    edited: false,
    result_id: null,
    created_at: "2027-03-08T15:00:00.000Z",
    expires_at: "2027-03-22T15:00:00.000Z",
  };
}

const LAST_YEAR_EVENT = {
  id: "last-1",
  name: "Philanthropy Week",
  location: "Quad",
  start_time: "2026-04-13T16:00:00.000Z",
  end_time: "2026-04-13T18:00:00.000Z",
  point_value: 15,
};

describe("SuggestedEvents (#3930)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.dismiss.mockResolvedValue({});
    mocks.accept.mockResolvedValue({});
    mocks.get.mockResolvedValue({ data: LAST_YEAR_EVENT });
  });

  it("draws nothing at all when nothing is waiting", () => {
    mocks.items.current = [];
    const { container } = render(
      <SuggestedEvents headingId="h" onPlan={vi.fn()} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("ignores suggested tasks: those are the Tasks board's", () => {
    mocks.items.current = [
      { ...suggestion("1"), kind: "task", event: null, task: { title: "x" } },
    ];
    const { container } = render(
      <SuggestedEvents headingId="h" onPlan={vi.fn()} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("says what happened last year, that it isn't on the calendar, and asks to be corrected", () => {
    mocks.items.current = [suggestion("1")];
    render(<SuggestedEvents headingId="h" onPlan={vi.fn()} />);
    expect(
      screen.getByRole("heading", { name: "This time last year" }),
    ).toBeTruthy();
    expect(screen.getByText(/Correct me if I’m wrong\./)).toBeTruthy();
    expect(screen.getByText("Philanthropy Week")).toBeTruthy();
    // The date in full, with its year, never abbreviated.
    expect(
      screen.getByText(
        "Held on April 13, 2026. I don’t see it on this year’s calendar.",
      ),
    ).toBeTruthy();
  });

  it("says how many times a series was held", () => {
    mocks.items.current = [suggestion("1", { name: "Study Night", times: 6 })];
    render(<SuggestedEvents headingId="h" onPlan={vi.fn()} />);
    expect(
      screen.getByText(
        "Held 6 times around now last year, starting April 13, 2026. I don’t see it on this year’s calendar.",
      ),
    ).toBeTruthy();
  });

  // #6148. The instant here is a day off from its date in every zone, so
  // the row can only say the 22nd by reading the event's own day.
  it("says a dated event's own day, never its stored midnight", () => {
    mocks.items.current = [
      suggestion("1", {
        name: "Retreat",
        last_year_at: "2025-11-20T12:00:00.000Z",
        last_year_date: "2025-11-22",
      }),
    ];
    render(<SuggestedEvents headingId="h" onPlan={vi.fn()} />);
    expect(
      screen.getByText(
        "Held on November 22, 2025. I don’t see it on this year’s calendar.",
      ),
    ).toBeTruthy();
  });

  it("answers Already planned in one tap, saying why", async () => {
    mocks.items.current = [suggestion("1")];
    render(<SuggestedEvents headingId="h" onPlan={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Already planned" }));
    await waitFor(() =>
      expect(mocks.dismiss).toHaveBeenCalledWith({
        id: "1",
        reason: "already_doing",
      }),
    );
  });

  it("dismisses with Not this year, giving no reason", async () => {
    mocks.items.current = [suggestion("1")];
    render(<SuggestedEvents headingId="h" onPlan={vi.fn()} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Not this year: Philanthropy Week" }),
    );
    await waitFor(() =>
      expect(mocks.dismiss).toHaveBeenCalledWith({
        id: "1",
        reason: undefined,
      }),
    );
  });

  it("opens the event form as a copy of last year's event, on the same weekday this year", async () => {
    mocks.items.current = [suggestion("1")];
    const onPlan = vi.fn();
    render(<SuggestedEvents headingId="h" onPlan={onPlan} />);
    fireEvent.click(screen.getByRole("button", { name: "Add to calendar" }));

    await waitFor(() => expect(onPlan).toHaveBeenCalledTimes(1));
    expect(mocks.get).toHaveBeenCalledWith("/v1/events/{id}", {
      params: { path: { id: "last-1" } },
    });
    const plan = onPlan.mock.calls[0]![0] as {
      suggestionId: string;
      template: unknown;
      startAt: string;
      endAt: string;
    };
    expect(plan.suggestionId).toBe("1");
    expect(plan.template).toEqual(LAST_YEAR_EVENT);
    // 52 weeks on: Monday April 13, 2026 is Monday April 12, 2027.
    const start = new Date(plan.startAt.replace("local:", ""));
    expect(start.getDay()).toBe(new Date(LAST_YEAR_EVENT.start_time).getDay());
    expect(
      Math.round(
        (start.getTime() - Date.parse(LAST_YEAR_EVENT.start_time)) / 86_400_000,
      ),
    ).toBe(364);
    // Nothing is decided until the officer saves the form.
    expect(mocks.accept).not.toHaveBeenCalled();
    expect(mocks.dismiss).not.toHaveBeenCalled();
  });

  it("says so when last year's event can't be opened, and opens no form", async () => {
    mocks.items.current = [suggestion("1")];
    mocks.get.mockResolvedValue({ error: { statusCode: 404 } });
    const onPlan = vi.fn();
    render(<SuggestedEvents headingId="h" onPlan={onPlan} />);
    fireEvent.click(screen.getByRole("button", { name: "Add to calendar" }));
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Couldn't open last year's event" }),
      ),
    );
    expect(onPlan).not.toHaveBeenCalled();
  });

  it("keeps Add to calendar off while the chapter can't add events, and the two answers on", () => {
    mocks.items.current = [suggestion("1")];
    render(<SuggestedEvents headingId="h" onPlan={vi.fn()} disabled />);
    expect(
      screen.getByRole("button", { name: "Add to calendar" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Already planned" }),
    ).not.toBeDisabled();
  });
});

describe("useRecordPlannedEvent (#3930)", () => {
  function Probe({ onReady }: { onReady: (fn: unknown) => void }) {
    onReady(useRecordPlannedEvent());
    return null;
  }

  it("accepts the suggestion with the event the officer added, and never throws", async () => {
    let record: (s: string, e: string) => Promise<void> = async () => undefined;
    render(<Probe onReady={(fn) => (record = fn as typeof record)} />);
    await record("1", "new-event");
    expect(mocks.accept).toHaveBeenCalledWith({
      id: "1",
      eventId: "new-event",
    });

    mocks.accept.mockRejectedValueOnce(new Error("offline"));
    await expect(record("1", "new-event")).resolves.toBeUndefined();
  });
});

describe("planFromLastYear for a dated event (#6144)", () => {
  // Stored as the saver's midnights; the plan reads the days.
  const RETREAT = {
    id: "last-r",
    name: "Retreat 2025",
    timing: "all_day",
    start_date: "2025-11-22",
    end_date: "2025-11-23",
    is_tentative: true,
    start_time: "2025-11-22T05:00:00.000Z",
    end_time: "2025-11-24T05:00:00.000Z",
  };
  const now = new Date(2026, 10, 12, 15);

  it("keeps it all-day on the same weekdays this year, as the phone does", () => {
    const plan = planFromLastYear("s", RETREAT, now);
    expect(plan.dated).toEqual({
      timing: "all_day",
      startDate: "2026-11-21",
      endDate: "2026-11-22",
      tentative: true,
    });
    // No clock from the stored midnight.
    expect([plan.startAt, plan.endAt]).toEqual(["", ""]);
    expect(plan.template.name).toBe("Retreat 2026");
  });

  it("keeps a time-TBD event on one day", () => {
    const plan = planFromLastYear(
      "s",
      { ...RETREAT, timing: "time_tbd", end_date: "2025-11-22" },
      now,
    );
    expect(plan.dated).toMatchObject({
      timing: "time_tbd",
      startDate: "2026-11-21",
      endDate: "",
    });
  });

  it("leaves a timed event timed", () => {
    expect(planFromLastYear("s", LAST_YEAR_EVENT, now).dated).toBe(null);
  });
});
