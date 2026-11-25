import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const params = vi.hoisted(() => ({ current: new URLSearchParams() }));

vi.mock("next/navigation", () => ({
  useSearchParams: () => params.current,
}));
vi.mock("@/components/points/points-ledger", () => ({
  PointsLedger: (props: { initialMember: string | null }) => (
    <p>{`ledger on ${props.initialMember ?? "everyone"}`}</p>
  ),
}));
vi.mock("@/components/service/service-history", () => ({
  ServiceHistory: () => <p>service history</p>,
}));
vi.mock("@/components/geofences/study-zones-manager", () => ({
  StudyZonesManager: () => <p>zone list</p>,
}));
vi.mock("@/components/chat-admin/chat-admin-page", () => ({
  ChatAdminPage: () => <p>chat admin</p>,
}));
vi.mock("@/components/reports/reports-page", () => ({
  ReportsPage: () => <p>report form</p>,
}));
vi.mock("@/components/discord-import/discord-import-page", () => ({
  DiscordImportPage: () => <p>discord import</p>,
}));
vi.mock("@/lib/notifications/mark-screens-seen", () => ({
  MarkScreensSeen: () => null,
}));

const { SettingsToolPage } = await import("./settings-tool-views");
const { SETTINGS_TOOLS } = await import("./settings-access");

/**
 * The page a module page's tool row opens (`?page=<tool id>`, #6030): every
 * tool but Discord import, which keeps `?tool=`, draws its own body there, so
 * a ledger link from a member card or a report notification lands on it.
 */
describe("an officer tool's page", () => {
  it("draws each tool's body under its own id", () => {
    const bodies: Record<string, string> = {
      "chat-admin": "chat admin",
      "points-ledger": "ledger on everyone",
      "service-history": "service history",
      "study-zones": "zone list",
      reports: "report form",
    };
    for (const tool of SETTINGS_TOOLS) {
      if (tool.id === "discord-import") continue;
      const { unmount } = render(<SettingsToolPage toolId={tool.id} />);
      expect(screen.getByText(bodies[tool.id]!)).toBeInTheDocument();
      unmount();
    }
  });

  it("opens the ledger on the member a card's link names", () => {
    params.current = new URLSearchParams(
      "tab=points&page=points-ledger&member=u1",
    );
    render(<SettingsToolPage toolId="points-ledger" />);
    expect(screen.getByText("ledger on u1")).toBeInTheDocument();
    params.current = new URLSearchParams();
  });

  it("gives every tool but Discord import an address on its own page", () => {
    for (const tool of SETTINGS_TOOLS) {
      if (tool.id === "discord-import") {
        expect(tool.href).toContain("tool=discord-import");
      } else {
        expect(tool.href).toContain(`page=${tool.id}`);
      }
    }
  });
});
