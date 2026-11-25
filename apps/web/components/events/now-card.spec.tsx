import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EventNowPill, NowCard } from "./now-card";

const eventsNow = vi.hoisted(() => ({
  value: { events: [] as unknown[], now: Date.now() },
  options: [] as unknown[],
}));
vi.mock("@repo/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@repo/hooks")>();
  return {
    ...actual,
    useEventsOnNow: (options: unknown) => {
      eventsNow.options.push(options);
      return eventsNow.value;
    },
  };
});

const gate = vi.hoisted(() => ({
  value: ((key: string) => key === "events") as
    ((key: string) => boolean) | undefined,
}));
vi.mock("@/lib/hooks/use-chapter-module-gate", () => ({
  useChapterModuleGate: () => gate.value,
}));

const live = (overrides: Record<string, unknown> = {}) => ({
  id: "recruitment",
  name: "Recruitment Meetings",
  location: "Chapter room",
  start_time: new Date(Date.now() - 40 * 60_000).toISOString(),
  end_time: new Date(Date.now() + 20 * 60_000).toISOString(),
  check_in_opens_minutes: 10,
  check_in_open: true,
  checked_in: true,
  ...overrides,
});

afterEach(() => {
  eventsNow.value = { events: [], now: Date.now() };
  eventsNow.options = [];
  gate.value = (key: string) => key === "events";
});

describe("NowCard (#5777)", () => {
  it("reads only with Events known to be on, so a council never asks (#5933)", () => {
    render(<NowCard />);
    expect(eventsNow.options.at(-1)).toEqual({ enabled: true });
    gate.value = () => false;
    render(<NowCard />);
    expect(eventsNow.options.at(-1)).toEqual({ enabled: false });
    gate.value = undefined;
    render(<NowCard />);
    expect(eventsNow.options.at(-1)).toEqual({ enabled: false });
  });

  it("renders nothing with nothing on", () => {
    const { container } = render(<NowCard />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the event on now, checked in or not, and opens its sheet", () => {
    eventsNow.value = { events: [live()], now: Date.now() };
    render(<NowCard />);
    expect(screen.getByText(/^Now · until /)).toBeInTheDocument();
    expect(screen.getByText("Recruitment Meetings")).toBeInTheDocument();
    expect(screen.getByText("Checked in · Chapter room")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/events?event=recruitment",
    );
  });

  it("counts a second event on now under the first", () => {
    eventsNow.value = {
      events: [live(), live({ id: "other", name: "Exec", checked_in: false })],
      now: Date.now(),
    };
    render(<NowCard />);
    expect(screen.getByText("+1 more on now")).toBeInTheDocument();
    expect(screen.queryByText("Exec")).not.toBeInTheDocument();
  });
});

describe("EventNowPill", () => {
  it("says Now while on and nothing well before it", () => {
    const { rerender } = render(
      <EventNowPill event={live()} now={Date.now()} />,
    );
    expect(screen.getByTestId("event-now-pill")).toHaveTextContent(
      /^Now · until /,
    );
    rerender(<EventNowPill event={live()} now={Date.now() - 3 * 3_600_000} />);
    expect(screen.queryByTestId("event-now-pill")).not.toBeInTheDocument();
  });
});
