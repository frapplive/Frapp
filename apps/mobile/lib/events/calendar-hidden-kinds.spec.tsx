/** @vitest-environment jsdom */
import React, { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CalendarKind } from "@repo/hooks/calendar-tasks";
import {
  resetHiddenCalendarKindsForTests,
  useHiddenCalendarKinds,
} from "./calendar-hidden-kinds";

/** A deferred `getItem`, so a spec decides when the stored read lands. */
function deferRead() {
  let land!: (raw: string | null) => void;
  vi.mocked(AsyncStorage.getItem).mockImplementationOnce(
    () =>
      new Promise<string | null>((resolve) => {
        land = resolve;
      }),
  );
  return async (raw: string | null) => {
    await act(async () => {
      land(raw);
      await Promise.resolve();
    });
  };
}

const mounted: ReactTestRenderer[] = [];

function renderKinds(userId: string | null) {
  const latest: {
    hidden: ReadonlySet<CalendarKind>;
    toggle: (kind: CalendarKind) => void;
  } = { hidden: new Set(), toggle: () => {} };
  function Probe() {
    Object.assign(latest, useHiddenCalendarKinds(userId));
    return null;
  }
  act(() => {
    mounted.push(create(<Probe />));
  });
  return latest;
}

beforeEach(() => {
  resetHiddenCalendarKindsForTests();
  vi.mocked(AsyncStorage.getItem).mockClear();
  vi.mocked(AsyncStorage.setItem).mockClear();
});

afterEach(() => {
  act(() => {
    for (const tree of mounted.splice(0)) tree.unmount();
  });
});

describe("the Calendar key's stored choice (#5948)", () => {
  it("starts with tasks off, then reads the member's own choice back", async () => {
    const land = deferRead();
    const kinds = renderKinds("u1");
    expect([...kinds.hidden]).toEqual(["tasks"]);
    expect(AsyncStorage.getItem).toHaveBeenCalledWith(
      "frapp.calendar.hidden-kinds.u1",
    );
    await land(JSON.stringify({ hidden: [] }));
    expect([...kinds.hidden]).toEqual([]);
  });

  it("keeps each member's choice apart", async () => {
    const landFirst = deferRead();
    const first = renderKinds("u1");
    await landFirst(JSON.stringify({ hidden: [] }));
    const landSecond = deferRead();
    const second = renderKinds("u2");
    await landSecond(null);
    expect([...first.hidden]).toEqual([]);
    expect([...second.hidden]).toEqual(["tasks"]);
    expect(AsyncStorage.getItem).toHaveBeenLastCalledWith(
      "frapp.calendar.hidden-kinds.u2",
    );
  });

  it("switches only the kind tapped when the tap beats the stored read", async () => {
    const land = deferRead();
    const kinds = renderKinds("u1");
    act(() => kinds.toggle("birthdays"));
    // Nothing is written against the defaults while the read is out.
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    await land(JSON.stringify({ hidden: [] }));
    expect([...kinds.hidden]).toEqual(["birthdays"]);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      "frapp.calendar.hidden-kinds.u1",
      JSON.stringify({ hidden: ["birthdays"] }),
    );
  });

  it("switches from the defaults when the stored read fails", async () => {
    vi.mocked(AsyncStorage.getItem).mockRejectedValueOnce(new Error("io"));
    const kinds = renderKinds("u1");
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    act(() => kinds.toggle("tasks"));
    await act(async () => {
      await Promise.resolve();
    });
    expect([...kinds.hidden]).toEqual([]);
  });

  it("writes nothing with no member yet", () => {
    const kinds = renderKinds(null);
    act(() => kinds.toggle("tasks"));
    expect([...kinds.hidden]).toEqual(["tasks"]);
    expect(AsyncStorage.getItem).not.toHaveBeenCalled();
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });
});
