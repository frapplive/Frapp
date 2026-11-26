/** @vitest-environment jsdom */
import React from "react";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { FrappThemeProvider } from "@/lib/theme";
import { screenText } from "@/test/screen-text";
import type { EventRow } from "@/lib/events/select";

vi.mock("@repo/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/hooks")>()),
  useRequiredOfViewer: () => () => false,
}));

import { EventRowFlat } from "./event-rows";

const NOW = new Date(2026, 10, 5, 14, 0);

const BASE: EventRow = {
  id: "evt-1",
  name: "Formal",
  location: null,
  start_time: new Date(2026, 10, 9, 19).toISOString(),
  end_time: new Date(2026, 10, 9, 21).toISOString(),
  point_value: null,
  check_in_opens_minutes: 10,
  attendance: { others_invited: true },
  recurrence_rule: null,
  parent_event_id: null,
  timing: "timed",
};

function renderRow(event: EventRow): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <FrappThemeProvider>
        <EventRowFlat
          event={event}
          cadence={null}
          now={NOW}
          isFirst
          onPress={() => undefined}
        />
      </FrappThemeProvider>,
    );
  });
  return tree;
}

describe("an event's row under its day (#6098)", () => {
  it("says an all-day event is all day, never its stored midnight", () => {
    const tree = renderRow({
      ...BASE,
      // The saver's midnights, five hours west of UTC.
      start_time: "2026-11-09T05:00:00.000Z",
      end_time: "2026-11-10T05:00:00.000Z",
      timing: "all_day",
      start_date: "2026-11-09",
      end_date: null,
    });
    expect(screenText(tree)).toContain("All day");
    expect(screenText(tree)).not.toContain("12:00");
    act(() => tree.unmount());
  });

  it("says a time-TBD event's time is TBD", () => {
    const tree = renderRow({
      ...BASE,
      timing: "time_tbd",
      start_date: "2026-11-09",
      end_date: null,
    });
    expect(screenText(tree)).toContain("Time TBD");
    act(() => tree.unmount());
  });

  it("carries a Tentative chip, and says it to a screen reader", () => {
    const tree = renderRow({ ...BASE, is_tentative: true });
    expect(screenText(tree)).toContain("Tentative");
    expect(
      tree.root.findAll(
        (node) => node.props.accessibilityLabel === "Open Formal, tentative",
      ),
    ).not.toHaveLength(0);
    act(() => tree.unmount());
  });

  it("reads a timed event start to end, with no chip", () => {
    const tree = renderRow(BASE);
    expect(screenText(tree)).not.toContain("Tentative");
    expect(screenText(tree)).toMatch(/7:00/);
    act(() => tree.unmount());
  });
});
