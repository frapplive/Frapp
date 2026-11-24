import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  sessions: {
    data: [] as unknown[] | undefined,
    isPending: false,
    isError: false,
    error: null as unknown,
    refetch: vi.fn(),
  },
  zones: [{ id: "z-1", name: "Library, 3rd floor" }] as unknown[],
  zonesEnabled: [] as (boolean | undefined)[],
  permissions: ["members:view"] as string[],
}));

vi.mock("@repo/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/hooks")>()),
  useStudySessions: () => mocks.sessions,
  useGeofences: (options?: { enabled?: boolean }) => {
    mocks.zonesEnabled.push(options?.enabled);
    return { data: options?.enabled ? mocks.zones : undefined };
  },
  usePermissionList: () => mocks.permissions,
}));

vi.mock("@/lib/hooks/use-chapter-module-gate", () => ({
  useChapterModuleGateState: () => ({
    status: "ready",
    isModuleEnabled: () => true,
  }),
}));

// The panel's shell is `Panel`'s; here it only has to draw its parts.
vi.mock("./standing-panel-frame", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./standing-panel-frame")>()),
  StandingPanelFrame: ({
    title,
    children,
  }: {
    title: string;
    children: React.ReactNode;
  }) => <section aria-label={title}>{children}</section>,
}));

import { MyStudyPanel } from "./my-study-panel";

const session = (
  id: string,
  minutes: number,
  status = "COMPLETED",
  start = "2026-11-20T18:00:00Z",
) => ({
  id,
  geofence_id: "z-1",
  status,
  start_time: start,
  end_time: status === "ACTIVE" ? null : "2026-11-20T19:30:00Z",
  total_foreground_minutes: minutes,
  points_awarded: status === "COMPLETED",
});

describe("MyStudyPanel: your study sessions on your Profile (#5950)", () => {
  beforeEach(() => {
    mocks.sessions.data = [];
    mocks.sessions.isPending = false;
    mocks.sessions.isError = false;
    mocks.zonesEnabled = [];
    mocks.permissions = ["members:view"];
  });

  it("lists each session by its zone, newest first, under the hours they add up to", () => {
    mocks.sessions.data = [
      session("s-old", 60, "COMPLETED", "2026-11-10T18:00:00Z"),
      session("s-new", 90, "COMPLETED", "2026-11-20T18:00:00Z"),
    ];
    render(<MyStudyPanel onClose={() => {}} />);
    expect(screen.getByText("2.5")).toBeInTheDocument();
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Library, 3rd floor");
    expect(rows[0]).toHaveTextContent("1h 30m");
    expect(rows[0]).toHaveTextContent("Points awarded");
  });

  it("leaves a running session out of the total until it ends", () => {
    mocks.sessions.data = [session("s-1", 60), session("s-2", 30, "ACTIVE")];
    render(<MyStudyPanel onClose={() => {}} />);
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("names a session plainly for a role that can't read the zones", () => {
    mocks.permissions = [];
    mocks.sessions.data = [session("s-1", 60)];
    render(<MyStudyPanel onClose={() => {}} />);
    expect(mocks.zonesEnabled.at(-1)).toBe(false);
    expect(screen.getByText("Study session")).toBeInTheDocument();
  });

  it("starts nothing: there is no Start on web", () => {
    mocks.sessions.data = [session("s-1", 60)];
    render(<MyStudyPanel onClose={() => {}} />);
    expect(screen.queryByRole("button", { name: /start/i })).toBeNull();
  });

  it("says so in one line when there are no sessions", () => {
    render(<MyStudyPanel onClose={() => {}} />);
    expect(screen.getByText("No study sessions yet.")).toBeInTheDocument();
  });

  it("says the read failed rather than showing a zero", () => {
    mocks.sessions.data = undefined;
    mocks.sessions.isError = true;
    mocks.sessions.error = new Error("boom");
    render(<MyStudyPanel onClose={() => {}} />);
    expect(
      screen.getByText("Couldn't load your study sessions"),
    ).toBeInTheDocument();
    expect(screen.getByText("–")).toBeInTheDocument();
  });
});
