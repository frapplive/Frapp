import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  chapterId: "chap-1" as string | null,
  offline: false,
  kept: null as { permissions?: unknown } | null,
  preview: false,
  read: {
    data: undefined,
    isPending: true,
    fetchStatus: "fetching",
    isError: false,
  } as {
    data: { permissions: string[] } | undefined;
    isPending: boolean;
    fetchStatus: "fetching" | "paused" | "idle";
    isError: boolean;
    isLoading?: boolean;
  },
}));

vi.mock("@repo/hooks", () => ({
  useMyPermissions: () => state.read,
}));
vi.mock("@/lib/shell-cache/shell-cache-sync", () => ({
  useShellCached: () => state.kept,
}));
vi.mock("@/lib/stores/role-preview-store", () => ({
  activePreview: (preview: unknown) => preview,
  useRolePreviewStore: (selector: (s: { preview: unknown }) => unknown) =>
    selector({ preview: state.preview ? { roleId: "r-1" } : null }),
}));
vi.mock("@/lib/providers/network-provider", () => ({
  useNetwork: () => ({ isOffline: state.offline }),
}));
vi.mock("@/lib/stores/chapter-store", () => ({
  useChapterStore: (selector: (s: { activeChapterId: string | null }) => unknown) =>
    selector({ activeChapterId: state.chapterId }),
}));

const { useNavPermissions } = await import("./use-nav-permissions");

describe("useNavPermissions (#3854)", () => {
  beforeEach(() => {
    state.chapterId = "chap-1";
    state.offline = false;
    state.kept = null;
    state.preview = false;
    state.read = { data: undefined, isPending: true, fetchStatus: "fetching", isError: false };
  });

  it("is undefined while the read is in flight, so gated rows wait", () => {
    expect(renderHook(() => useNavPermissions()).result.current).toBeUndefined();
  });

  it("is undefined after an online failure, as <Can> hides", () => {
    state.read = { data: undefined, isPending: false, fetchStatus: "idle", isError: true };
    expect(renderHook(() => useNavPermissions()).result.current).toBeUndefined();
  });

  it("is null when the read is paused offline with nothing cached", () => {
    state.read = { data: undefined, isPending: true, fetchStatus: "paused", isError: false };
    expect(renderHook(() => useNavPermissions()).result.current).toBeNull();
  });

  it("is null when the dashboard is offline and the read has no answer", () => {
    state.offline = true;
    expect(renderHook(() => useNavPermissions()).result.current).toBeNull();
  });

  it("is the answer once there is one, offline or not", () => {
    state.offline = true;
    state.read = {
      data: { permissions: ["members:view"] },
      isPending: false,
      fetchStatus: "idle",
      isError: false,
    };
    expect(renderHook(() => useNavPermissions()).result.current).toEqual(["members:view"]);
  });

  it("is undefined with no active chapter", () => {
    state.chapterId = null;
    state.offline = true;
    expect(renderHook(() => useNavPermissions()).result.current).toBeUndefined();
  });

  describe("fromShellCache (#5049)", () => {
    const loading = () => ({ ...state.read, isLoading: true });

    it("draws the kept permissions while the read is in flight", () => {
      state.kept = { permissions: ["members:view"] };
      state.read = loading();
      expect(
        renderHook(() => useNavPermissions({ fromShellCache: true })).result
          .current,
      ).toEqual(["members:view"]);
    });

    it("never stands in without the option", () => {
      state.kept = { permissions: ["members:view"] };
      state.read = loading();
      expect(renderHook(() => useNavPermissions()).result.current).toBeUndefined();
    });

    it("never stands in during a role preview", () => {
      state.kept = { permissions: ["members:view"] };
      state.preview = true;
      state.read = loading();
      expect(
        renderHook(() => useNavPermissions({ fromShellCache: true })).result
          .current,
      ).toBeUndefined();
    });

    it("never stands in once the read has failed", () => {
      state.kept = { permissions: ["members:view"] };
      state.read = { data: undefined, isPending: false, fetchStatus: "idle", isError: true };
      expect(
        renderHook(() => useNavPermissions({ fromShellCache: true })).result
          .current,
      ).toBeUndefined();
    });
  });
});
