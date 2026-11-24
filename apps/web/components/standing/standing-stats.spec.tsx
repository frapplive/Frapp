import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Stable references: the component reads these on every render.
const mocks = vi.hoisted(() => ({
  stats: {
    points: 1240 as number | null,
    serviceHours: "18.5" as string | null,
    serviceMinutes: 1110 as number | null,
    hasChapter: true,
    visible: true,
    pointsFailed: false,
    serviceFailed: false,
  },
  wanted: [] as { points?: boolean; service?: boolean }[],
  sessions: [] as unknown[],
  sessionsEnabled: [] as (boolean | undefined)[],
  modules: { status: "ready" as string, off: new Set<string>() },
}));

vi.mock("@repo/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@repo/hooks")>();
  return {
    formatServiceHours: actual.formatServiceHours,
    profileStatsErrorNote: actual.profileStatsErrorNote,
    useMyProfileStats: (wanted: { points?: boolean; service?: boolean }) => {
      mocks.wanted.push(wanted);
      return mocks.stats;
    },
    useStudySessions: (options?: { enabled?: boolean }) => {
      mocks.sessionsEnabled.push(options?.enabled);
      return { data: mocks.sessions, isPending: false, isError: false };
    },
  };
});

vi.mock("@/lib/hooks/use-chapter-module-gate", () => ({
  useChapterModuleGateState: () => ({
    status: mocks.modules.status,
    isModuleEnabled: (key: string) => !mocks.modules.off.has(key),
  }),
}));

import { StandingStats } from "./standing-stats";

const session = (minutes: number) => ({
  id: `s-${minutes}`,
  geofence_id: "z-1",
  status: "COMPLETED",
  start_time: "2026-11-20T18:00:00Z",
  end_time: "2026-11-20T19:00:00Z",
  total_foreground_minutes: minutes,
  points_awarded: true,
});

describe("StandingStats: your numbers on your Profile, each a door (#5950)", () => {
  beforeEach(() => {
    mocks.stats.points = 1240;
    mocks.stats.serviceHours = "18.5";
    mocks.stats.hasChapter = true;
    mocks.stats.visible = true;
    mocks.stats.pointsFailed = false;
    mocks.stats.serviceFailed = false;
    mocks.wanted = [];
    mocks.sessions = [];
    mocks.sessionsEnabled = [];
    mocks.modules.status = "ready";
    mocks.modules.off = new Set();
  });

  it("opens each number's panel on the Profile", () => {
    mocks.sessions = [session(90), session(54)];
    render(<StandingStats />);
    expect(screen.getByTestId("profile-standing-points")).toHaveAttribute(
      "href",
      "/profile?open=points",
    );
    expect(screen.getByTestId("profile-standing-points")).toHaveTextContent(
      "1,240",
    );
    expect(screen.getByTestId("profile-standing-service")).toHaveAttribute(
      "href",
      "/profile?open=service",
    );
    expect(screen.getByTestId("profile-standing-study")).toHaveAttribute(
      "href",
      "/profile?open=study",
    );
    // 144 minutes of study, as hours.
    expect(screen.getByTestId("profile-standing-study")).toHaveTextContent(
      "2.4",
    );
  });

  it("names what each door opens for a screen reader", () => {
    render(<StandingStats />);
    expect(
      screen.getByRole("link", {
        name: "Points: 1,240. Opens your point history.",
      }),
    ).toBeInTheDocument();
  });

  it("hides a number whose module is off and never asks for it (P5.8)", () => {
    mocks.modules.off = new Set(["points"]);
    render(<StandingStats />);
    expect(screen.queryByTestId("profile-standing-points")).toBeNull();
    expect(screen.getByTestId("profile-standing-service")).toBeInTheDocument();
    expect(mocks.wanted.at(-1)).toEqual({ points: false, service: true });
  });

  it("draws nothing at all with Points and Hours both off", () => {
    mocks.modules.off = new Set(["points", "hours"]);
    const { container } = render(<StandingStats />);
    expect(container).toBeEmptyDOMElement();
    expect(mocks.sessionsEnabled.at(-1)).toBe(false);
  });

  it("keeps Service hours at zero, where the first hours are logged", () => {
    mocks.stats.serviceHours = "0";
    render(<StandingStats />);
    expect(screen.getByTestId("profile-standing-service")).toHaveTextContent(
      "0",
    );
  });

  it("leaves Study out until there is a session, since one starts on the phone", () => {
    render(<StandingStats />);
    expect(screen.queryByTestId("profile-standing-study")).toBeNull();
  });

  it("draws a dash, not a zero, for a number that failed, and says which", () => {
    mocks.stats.points = null;
    mocks.stats.pointsFailed = true;
    render(<StandingStats />);
    expect(screen.getByTestId("profile-standing-points")).toHaveTextContent(
      "–",
    );
    expect(
      screen.getByText("Points couldn't load just now."),
    ).toBeInTheDocument();
  });

  it("says to choose a chapter when there is none to read points in", () => {
    mocks.stats.hasChapter = false;
    mocks.stats.points = null;
    mocks.stats.serviceHours = null;
    render(<StandingStats />);
    expect(
      screen.getByText("Choose a chapter to see your points."),
    ).toBeInTheDocument();
  });

  it("leaves the numbers out for a role that can't read them", () => {
    mocks.stats.visible = false;
    const { container } = render(<StandingStats />);
    expect(container).toBeEmptyDOMElement();
  });
});
