import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const nav = vi.hoisted(() => ({ pathname: "/documents", push: vi.fn() }));
const perms = vi.hoisted(() => ({ value: [] as string[] | undefined }));
const modules = vi.hoisted(() => ({ off: new Set<string>() }));

vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: nav.push }),
}));
vi.mock("@repo/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/hooks")>()),
  useMyPermissions: () => ({
    data: perms.value ? { permissions: perms.value } : undefined,
  }),
}));
vi.mock("@/lib/hooks/use-chapter-module-gate", () => ({
  useChapterModuleGate: () => (key: string) => !modules.off.has(key),
}));

const { ResourcesViews } = await import("./resources-views");

// #5949, #2956: Documents and Backwork are the two views of Resources.
describe("ResourcesViews", () => {
  beforeEach(() => {
    nav.pathname = "/documents";
    nav.push.mockClear();
    perms.value = ["members:view", "backwork:upload"];
    modules.off = new Set();
  });

  it("names Documents and Backwork as plain view labels, the current one selected", () => {
    render(<ResourcesViews />);
    expect(screen.getByRole("tablist", { name: "Resources" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Documents" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Backwork" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("selects Backwork on Backwork and its Bulk upload", () => {
    nav.pathname = "/backwork/upload";
    render(<ResourcesViews />);
    expect(screen.getByRole("tab", { name: "Backwork" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("opens the other view's own route", async () => {
    const user = userEvent.setup();
    render(<ResourcesViews />);
    await user.click(screen.getByRole("tab", { name: "Backwork" }));
    expect(nav.push).toHaveBeenCalledWith("/backwork");
    await user.click(screen.getByRole("tab", { name: "Documents" }));
    expect(nav.push).toHaveBeenCalledTimes(1);
  });

  it("draws no labels for a member who can open only Documents", () => {
    perms.value = ["members:view"];
    const { container, unmount } = render(<ResourcesViews />);
    expect(container).toBeEmptyDOMElement();
    unmount();
    perms.value = ["members:view", "backwork:admin"];
    modules.off = new Set(["backwork"]);
    expect(render(<ResourcesViews />).container).toBeEmptyDOMElement();
  });

  it("draws no labels while permissions are unknown: Backwork is a gated door", () => {
    perms.value = undefined;
    expect(render(<ResourcesViews />).container).toBeEmptyDOMElement();
  });

  it("keeps Documents while only Meetings is on, since minutes are filed there", () => {
    modules.off = new Set(["documents"]);
    render(<ResourcesViews />);
    expect(screen.getByRole("tab", { name: "Documents" })).toBeInTheDocument();
  });

  it("offers no Documents view, and so no labels, in a chapter with only Backwork on", () => {
    // The nav row opens Backwork there (`navItemTarget`); a Documents label
    // would lead to a module that is off.
    nav.pathname = "/backwork";
    modules.off = new Set(["documents", "meetings"]);
    render(<ResourcesViews />);
    expect(screen.queryByRole("tab", { name: "Documents" })).toBeNull();
    expect(screen.queryByRole("tablist")).toBeNull();
  });
});
