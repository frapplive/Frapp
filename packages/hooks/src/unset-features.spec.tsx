/** @vitest-environment jsdom */
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { reads, enabledCalls } = vi.hoisted(() => ({
  reads: { documents: [] as unknown[] | undefined },
  enabledCalls: {} as Record<string, boolean | undefined>,
}));

vi.mock("./use-documents", () => ({
  useDocuments: (options?: { enabled?: boolean }) => {
    enabledCalls.documents = options?.enabled;
    return { data: options?.enabled ? reads.documents : undefined };
  },
}));

import {
  activeZoneCount,
  selectHiddenUnsetFeatures,
  useHiddenUnsetFeatures,
} from "./unset-features";

const MEMBER = ["members:view", "backwork:upload", "service:log"];
const ALL_ON = () => true;

beforeEach(() => {
  reads.documents = [];
  for (const key of Object.keys(enabledCalls)) delete enabledCalls[key];
});

describe("selectHiddenUnsetFeatures", () => {
  it("hides Documents from a member while the chapter has none", () => {
    expect(
      selectHiddenUnsetFeatures({
        permissions: MEMBER,
        isModuleEnabled: ALL_ON,
        counts: { documents: 0 },
      }),
    ).toEqual(new Set(["documents"]));
  });

  it("shows it once the first document exists", () => {
    expect(
      selectHiddenUnsetFeatures({
        permissions: MEMBER,
        isModuleEnabled: ALL_ON,
        counts: { documents: 1 },
      }).size,
    ).toBe(0);
  });

  it("keeps Documents for whoever can upload, since the upload is on its page", () => {
    expect(
      selectHiddenUnsetFeatures({
        permissions: [...MEMBER, "chapter_docs:upload"],
        isModuleEnabled: ALL_ON,
        counts: { documents: 0 },
      }).size,
    ).toBe(0);
  });

  it("hides nothing until permissions, modules and the list have answered", () => {
    const counts = { documents: 0 };
    for (const input of [
      { permissions: undefined, isModuleEnabled: ALL_ON, counts },
      { permissions: null, isModuleEnabled: ALL_ON, counts },
      { permissions: MEMBER, isModuleEnabled: undefined, counts },
      { permissions: MEMBER, isModuleEnabled: ALL_ON, counts: {} },
    ]) {
      expect(selectHiddenUnsetFeatures(input).size).toBe(0);
    }
  });

  it("counts a feature whose module is off as empty", () => {
    expect(
      selectHiddenUnsetFeatures({
        permissions: MEMBER,
        isModuleEnabled: (key) => key !== "documents",
        counts: {},
      }),
    ).toEqual(new Set(["documents"]));
  });
});

describe("useHiddenUnsetFeatures", () => {
  // Study hours left both navs in #5950, so nothing reads the zone list here.
  it("reads no zone list, and the document list only for who can't upload", () => {
    renderHook(() => useHiddenUnsetFeatures(MEMBER, ALL_ON));
    expect(enabledCalls).toEqual({ documents: true });
    renderHook(() =>
      useHiddenUnsetFeatures([...MEMBER, "chapter_docs:upload"], ALL_ON),
    );
    expect(enabledCalls).toEqual({ documents: false });
  });

  it("reads no list whose module is off", () => {
    renderHook(() =>
      useHiddenUnsetFeatures(MEMBER, (key) => key !== "documents"),
    );
    expect(enabledCalls).toEqual({ documents: false });
  });

  it("reads nothing while permissions or modules load", () => {
    renderHook(() => useHiddenUnsetFeatures(undefined, ALL_ON));
    expect(enabledCalls).toEqual({ documents: false });
    renderHook(() => useHiddenUnsetFeatures(MEMBER, undefined));
    expect(enabledCalls).toEqual({ documents: false });
  });

  it("hides from the list's answer, and not from a read that hasn't one", () => {
    const { result, rerender } = renderHook(() =>
      useHiddenUnsetFeatures(MEMBER, ALL_ON),
    );
    expect(result.current).toEqual(new Set(["documents"]));
    reads.documents = undefined;
    rerender();
    expect(result.current.size).toBe(0);
  });
});

describe("activeZoneCount", () => {
  it("counts only active zones, the ones a member can study in", () => {
    expect(activeZoneCount([{ id: "z1", is_active: false }])).toBe(0);
    expect(
      activeZoneCount([
        { id: "z1", is_active: false },
        { id: "z2", is_active: true },
        { id: "z3" },
      ]),
    ).toBe(2);
    expect(activeZoneCount(undefined)).toBeUndefined();
  });
});
