/** @vitest-environment jsdom */
import React from "react";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { FrappThemeProvider } from "@/lib/theme";

vi.mock("@/lib/chapter-branding", async () => {
  const { chapterBrandingMock, MUTED_GOLD_BRANDING } =
    await import("@/test/chapter-branding");
  return chapterBrandingMock(MUTED_GOLD_BRANDING);
});

import { endAtTime, endsAnotherDay, WhenFields, WhenTimes } from "./when-times";

const local = (day: number, hour: number, minute = 0) =>
  new Date(2026, 10, day, hour, minute);
const NOW = local(5, 14);

describe("endsAnotherDay", () => {
  it("is false on one day and just past midnight", () => {
    expect(endsAnotherDay(local(5, 19), local(5, 20))).toBe(false);
    // A 10 PM to 1 AM social is one night, not two days.
    expect(endsAnotherDay(local(5, 22), local(6, 1))).toBe(false);
  });

  it("is true for a meeting that runs into the next day's afternoon or on", () => {
    expect(endsAnotherDay(local(5, 9), local(6, 17))).toBe(true);
    expect(endsAnotherDay(local(5, 22), local(7, 1))).toBe(true);
  });
});

describe("endAtTime", () => {
  it("puts an end after the start on the start's day", () => {
    expect(endAtTime(local(5, 19), local(9, 21, 30))).toEqual(local(5, 21, 30));
  });

  it("puts an end at or before the start on the next day", () => {
    expect(endAtTime(local(5, 22), local(9, 1))).toEqual(local(6, 1));
    expect(endAtTime(local(5, 22), local(9, 22))).toEqual(local(6, 22));
  });
});

describe("WhenTimes on Android", () => {
  it("opens the time dialog and runs an earlier end past midnight", () => {
    const open = vi.mocked(DateTimePickerAndroid.open);
    open.mockClear();
    const onEnd = vi.fn();
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(
        <FrappThemeProvider>
          <WhenTimes
            start={local(5, 22)}
            end={local(5, 23)}
            now={NOW}
            minimumDate={NOW}
            disabled={false}
            onStart={vi.fn()}
            onEnd={onEnd}
            platform="android"
          />
        </FrappThemeProvider>,
      );
    });
    const [pill] = tree.root.findAll(
      (node) =>
        String(node.props.accessibilityLabel).startsWith("Ends time") &&
        typeof node.props.onPress === "function",
    );
    act(() => pill!.props.onPress());
    const options = open.mock.calls[0]![0];
    expect(options.mode).toBe("time");
    act(() =>
      options.onValueChange?.(
        { nativeEvent: { timestamp: 0, utcOffset: 0 } } as never,
        local(1, 1, 30),
      ),
    );
    expect(onEnd).toHaveBeenLastCalledWith(local(6, 1, 30));
    act(() => tree.unmount());
  });
});

describe("WhenFields (#6098)", () => {
  function renderFields(
    timing: "timed" | "all_day" | "time_tbd",
    lastDay: string | null,
    handlers: {
      onTiming?: (next: "timed" | "all_day" | "time_tbd") => void;
      onLastDay?: (next: string | null) => void;
      onTentative?: (next: boolean) => void;
    } = {},
  ) {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(
        <FrappThemeProvider>
          <WhenFields
            timing={timing}
            start={local(9, 19)}
            end={local(9, 20)}
            lastDay={lastDay}
            tentative={false}
            now={NOW}
            minimumDate={NOW}
            disabled={false}
            onTiming={handlers.onTiming ?? vi.fn()}
            onStart={vi.fn()}
            onEnd={vi.fn()}
            onLastDay={handlers.onLastDay ?? vi.fn()}
            onTentative={handlers.onTentative ?? vi.fn()}
            platform="ios"
          />
        </FrappThemeProvider>,
      );
    });
    return tree;
  }
  const labels = (tree: ReactTestRenderer) =>
    tree.root
      .findAll((node) => typeof node.props.accessibilityLabel === "string")
      .map((node) => node.props.accessibilityLabel as string);

  it("offers the three shapes in web's words", () => {
    const onTiming = vi.fn();
    const tree = renderFields("timed", null, { onTiming });
    const radios = tree.root
      .findAll((node) => node.props.accessibilityRole === "radio")
      .map((node) => node.props.accessibilityLabel);
    expect(radios).toEqual(
      expect.arrayContaining(["Set time", "All day", "Time TBD"]),
    );
    const [allDay] = tree.root.findAll(
      (node) =>
        node.props.accessibilityLabel === "All day" &&
        typeof node.props.onPress === "function",
    );
    act(() => allDay!.props.onPress());
    expect(onTiming).toHaveBeenCalledWith("all_day");
    act(() => tree.unmount());
  });

  it("draws an all-day event's day and, once asked, its last day, with no times", () => {
    const onLastDay = vi.fn();
    const tree = renderFields("all_day", null, { onLastDay });
    expect(labels(tree).some((label) => label.startsWith("Starts time"))).toBe(
      false,
    );
    const [ends] = tree.root.findAll(
      (node) =>
        typeof node.props.onPress === "function" &&
        node.findAll((child) => child.props.children === "Ends another day")
          .length > 0,
    );
    act(() => ends!.props.onPress());
    expect(onLastDay).toHaveBeenCalledWith("2026-11-10");
    act(() => tree.unmount());

    const spanning = renderFields("all_day", "2026-11-12", { onLastDay });
    expect(labels(spanning).some((label) => label.startsWith("Last day"))).toBe(
      true,
    );
    act(() => spanning.unmount());
  });

  it("draws a time-TBD event's day alone, and a Tentative switch", () => {
    const onTentative = vi.fn();
    const tree = renderFields("time_tbd", null, { onTentative });
    expect(labels(tree).some((label) => label.startsWith("Day,"))).toBe(true);
    expect(labels(tree).some((label) => label.startsWith("Last day"))).toBe(
      false,
    );
    const toggle = tree.root.find(
      (node) =>
        typeof node.props.onValueChange === "function" &&
        String(node.props.accessibilityLabel).startsWith("Tentative"),
    );
    act(() => toggle.props.onValueChange(true));
    expect(onTentative).toHaveBeenCalledWith(true);
    act(() => tree.unmount());
  });
});
