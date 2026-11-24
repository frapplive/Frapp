import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PointsGlyph } from "@/components/layout/nav-glyphs";
import type { NavItem } from "./nav-config";

// next/link needs a router context that jsdom lacks; render a plain anchor.
vi.mock("next/link", () => ({
  default: ({
    children,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a {...props}>{children}</a>,
}));

// Imported after the mock so the component picks up the stubbed next/link.
const { ProtectedNavItem } = await import("./protected-nav-item");

const moduleItem: NavItem = {
  id: "events",
  label: "Events",
  icon: PointsGlyph,
  href: "/events",
  module: "events",
};

const coreItem: NavItem = {
  id: "chat",
  label: "Chat",
  icon: PointsGlyph,
  href: "/chat",
};

function renderItem(item: NavItem, isModuleEnabled?: (key: string) => boolean) {
  return render(
    <ProtectedNavItem
      item={item}
      permissions={["*"]}
      iconClassName="h-4 w-4"
      focusClassName=""
      isModuleEnabled={isModuleEnabled}
    />,
  );
}

describe("ProtectedNavItem module gating", () => {
  it("hides an item whose module is disabled", () => {
    renderItem(moduleItem, (key) => key !== "events");
    expect(screen.queryByText("Events")).not.toBeInTheDocument();
  });

  it("shows an item whose module is enabled", () => {
    renderItem(moduleItem, () => true);
    expect(screen.getByText("Events")).toBeInTheDocument();
  });

  it("shows the item while config is loading (no predicate yet)", () => {
    renderItem(moduleItem, undefined);
    expect(screen.getByText("Events")).toBeInTheDocument();
  });

  it("never module-gates a core item that declares no module", () => {
    renderItem(coreItem, () => false);
    expect(screen.getByText("Chat")).toBeInTheDocument();
  });

  it("still hides on a missing permission even when the module is enabled", () => {
    render(
      <ProtectedNavItem
        item={{ ...moduleItem, requirePermission: "events:manage" }}
        permissions={["members:view"]}
        iconClassName="h-4 w-4"
        focusClassName=""
        isModuleEnabled={() => true}
      />,
    );
    expect(screen.queryByText("Events")).not.toBeInTheDocument();
  });
});

// `isNavItemVisible` is the predicate the sidebar and the mobile drawer share.
// It is exported specifically so a *section* can ask the same question its
// items do — a heading that outlived its rows would announce a group the
// viewer cannot open.
describe("isNavItemVisible", () => {
  const permissionItem: NavItem = {
    id: "roles",
    label: "Roles",
    icon: PointsGlyph,
    href: "/settings?tab=roles",
    requirePermission: "roles:manage",
  };

  it("hides an item whose permission the caller lacks", async () => {
    const { isNavItemVisible } = await import("./protected-nav-item");
    expect(isNavItemVisible(permissionItem, ["members:view"])).toBe(false);
  });

  it("shows it to a holder of that permission", async () => {
    const { isNavItemVisible } = await import("./protected-nav-item");
    expect(isNavItemVisible(permissionItem, ["roles:manage"])).toBe(true);
  });

  it("treats the owner wildcard as holding everything", async () => {
    const { isNavItemVisible } = await import("./protected-nav-item");
    // A bare `permissions.includes()` would hide admin rows from the very
    // people they exist for, since an owner's grant is `*` and nothing else.
    expect(isNavItemVisible(permissionItem, ["*"])).toBe(true);
  });

  it("fails closed for a gated row while the permission set is unresolved (#3854)", async () => {
    const { isNavItemVisible } = await import("./protected-nav-item");
    expect(isNavItemVisible(permissionItem, undefined)).toBe(false);
    const anyOfItem: NavItem = {
      ...moduleItem,
      requireAnyOf: ["backwork:upload", "backwork:admin"],
    };
    expect(isNavItemVisible(anyOfItem, undefined, () => true)).toBe(false);
  });

  it("shows a gated row when the offline dashboard can't ask (null)", async () => {
    const { isNavItemVisible } = await import("./protected-nav-item");
    expect(isNavItemVisible(permissionItem, null)).toBe(true);
    // The module gate still applies.
    expect(
      isNavItemVisible(
        { ...moduleItem, requirePermission: "x" },
        null,
        () => false,
      ),
    ).toBe(false);
  });

  it("keeps a row with no permission rule while permissions are unresolved", async () => {
    const { isNavItemVisible } = await import("./protected-nav-item");
    expect(isNavItemVisible(coreItem, undefined)).toBe(true);
    expect(isNavItemVisible(moduleItem, undefined, undefined)).toBe(true);
  });

  it("hides the real Directory row until permissions resolve", async () => {
    const { isNavItemVisible } = await import("./protected-nav-item");
    const { DASHBOARD_NAV_ITEMS } = await import("./nav-config");
    for (const id of ["members"]) {
      const row = DASHBOARD_NAV_ITEMS.find((item) => item.id === id);
      expect(row, id).toBeDefined();
      expect(
        isNavItemVisible(row!, undefined, () => true),
        id,
      ).toBe(false);
      expect(
        isNavItemVisible(row!, ["*"], () => true),
        id,
      ).toBe(true);
    }
  });

  // #2956: a row over several views shows while the viewer can open one,
  // and opens the first they can.
  it("shows a row with views while the viewer can open one, and opens the first they can", async () => {
    const { isNavItemVisible, navItemTarget } = await import(
      "./protected-nav-item"
    );
    const item = {
      ...coreItem,
      href: "/documents",
      views: [
        { href: "/documents", anyModule: ["documents", "meetings"] },
        {
          href: "/backwork",
          anyModule: ["backwork"],
          requireAnyOf: ["backwork:upload", "backwork:admin"],
        },
      ],
    };
    const onlyBackwork = (key: string) => key === "backwork";
    // Only Backwork on: shown to a member who can browse it, and it opens
    // Backwork; hidden from one who can't.
    expect(isNavItemVisible(item, ["backwork:upload"], onlyBackwork)).toBe(
      true,
    );
    expect(navItemTarget(item, ["backwork:upload"], onlyBackwork)).toBe(
      "/backwork",
    );
    expect(isNavItemVisible(item, [], onlyBackwork)).toBe(false);
    // Nothing on: hidden.
    expect(isNavItemVisible(item, ["*"], () => false)).toBe(false);
    // Documents on: shown to everyone, and it opens Documents.
    expect(isNavItemVisible(item, [], () => true)).toBe(true);
    expect(navItemTarget(item, [], () => true)).toBe("/documents");
    // A module gate not answered yet hides nothing ungated; a gated view
    // waits for permissions.
    expect(isNavItemVisible(item, [], undefined)).toBe(true);
    expect(navItemTarget(item, undefined, onlyBackwork)).toBe("/documents");
  });

  it("renders nothing, so nothing is clickable, while permissions are unresolved", () => {
    const { container } = render(
      <ProtectedNavItem
        item={{ ...coreItem, requirePermission: "members:view" }}
        permissions={undefined}
        iconClassName="h-4 w-4"
        focusClassName=""
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("hides an item whose module the chapter disabled", async () => {
    const { isNavItemVisible } = await import("./protected-nav-item");
    expect(isNavItemVisible(moduleItem, ["*"], () => false)).toBe(false);
  });

  it("fails open while the module predicate is unresolved", async () => {
    const { isNavItemVisible } = await import("./protected-nav-item");
    expect(isNavItemVisible(moduleItem, ["*"], undefined)).toBe(true);
  });

  it("applies both gates, not whichever one is declared first", async () => {
    const { isNavItemVisible } = await import("./protected-nav-item");
    const bothGates: NavItem = {
      ...moduleItem,
      requirePermission: "reports:export",
    };
    // Permission held, module off.
    expect(isNavItemVisible(bothGates, ["reports:export"], () => false)).toBe(
      false,
    );
    // Module on, permission missing.
    expect(isNavItemVisible(bothGates, ["members:view"], () => true)).toBe(
      false,
    );
    expect(isNavItemVisible(bothGates, ["reports:export"], () => true)).toBe(
      true,
    );
  });
});

// The restructure's whole point is that a member sees a short list of things
// they can actually open. These pin the shape rather than the wording.
describe("DASHBOARD_NAV structure", () => {
  it("has no officer-only section, and no Chapter settings row: it opens from the chapter menu", async () => {
    const { DASHBOARD_NAV } = await import("./nav-config");
    const { isNavItemVisible } = await import("./protected-nav-item");
    const { SETTINGS_TOOLS } =
      await import("@/components/settings/settings-access");

    // The six-row Admin group is what pushed a President's nav past a 768px
    // window (#2946). A section whose every row is officer-gated is that group
    // coming back.
    for (const section of DASHBOARD_NAV) {
      const memberRows = section.items.filter((item) =>
        isNavItemVisible(item, ["members:view"]),
      );
      expect(memberRows.length, section.id).toBeGreaterThan(0);
    }

    const items = DASHBOARD_NAV.flatMap((section) => section.items);
    // One door into Chapter settings, the chapter menu (Paul, 2026-11-19).
    expect(items.some((item) => item.href.startsWith("/settings"))).toBe(false);
    // Every officer tool opens inside Chapter settings (#3837), and none of
    // them is a row of its own.
    for (const tool of SETTINGS_TOOLS) {
      expect(tool.href.startsWith("/settings?"), tool.id).toBe(true);
      expect(items.some((item) => item.href === tool.href)).toBe(false);
    }
  });

  it("leads with Chat, then Direct messages, as an anchor that renders no heading (#3774)", async () => {
    const { DASHBOARD_NAV } = await import("./nav-config");
    expect(DASHBOARD_NAV[0]?.anchor).toBe(true);
    expect(DASHBOARD_NAV[0]?.items.map((i) => i.href)).toEqual([
      "/chat",
      "/chat?view=direct",
    ]);
  });

  it("keeps Profile out of the chapter nav — it lives in the account menu", async () => {
    const { DASHBOARD_NAV_ITEMS } = await import("./nav-config");
    const hrefs = DASHBOARD_NAV_ITEMS.map((item) => item.href);
    expect(hrefs).not.toContain("/profile");
  });

  it("routes the directory to one entry rather than members and alumni", async () => {
    const { DASHBOARD_NAV_ITEMS } = await import("./nav-config");
    const hrefs = DASHBOARD_NAV_ITEMS.map((item) => item.href);
    expect(hrefs).toContain("/members");
    // /alumni still resolves as a route, but it redirects into the Alumni tab
    // and must not reappear as its own nav row.
    expect(hrefs).not.toContain("/alumni");
  });
});

// The recruitment row (#5924) needs both keys its routes check.
describe("isNavItemVisible with requireAllOf", () => {
  const rush: NavItem = {
    id: "rush",
    label: "Rush",
    icon: PointsGlyph,
    href: "/rush",
    module: "rush",
    requireAllOf: ["members:view", "rush:view"],
  };

  it("shows only when every key is held", async () => {
    const { isNavItemVisible } = await import("./protected-nav-item");
    expect(isNavItemVisible(rush, ["members:view", "rush:view"])).toBe(true);
    expect(isNavItemVisible(rush, ["rush:view"])).toBe(false);
    expect(isNavItemVisible(rush, ["members:view"])).toBe(false);
    expect(isNavItemVisible(rush, ["*"])).toBe(true);
  });

  it("stays hidden while permissions load, and with the module off", async () => {
    const { isNavItemVisible } = await import("./protected-nav-item");
    expect(isNavItemVisible(rush, undefined)).toBe(false);
    expect(isNavItemVisible(rush, ["*"], (key) => key !== "rush")).toBe(false);
  });
});
