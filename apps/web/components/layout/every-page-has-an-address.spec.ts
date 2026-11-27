import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { WEB_ADDRESSES, webAddressRow } from "@repo/validation";
import { dashboardRoutes } from "@/components/layout/dashboard-routes";

/**
 * Everything that draws its own back arrow or X has an address, and Back does
 * what that arrow does (rulebook § 8, Paul 2026-11-25, #6034). Walks every
 * route under `app/(dashboard)` against the address table in
 * `@repo/validation` (`web-addresses.ts`, which the phone maps links from),
 * and that table against the spec's § Addresses, so a new page fails here
 * until both name it, and a parameter the table lists fails until the
 * spec's Address cell names it. It doesn't read page code: a family's PR
 * lists the parameters its pages read in the table.
 */

const SPEC = readFileSync(
  path.resolve(__dirname, "../../../../spec/ui/web-dashboard/README.md"),
  "utf8",
);

/** The spec's § Addresses table: each row's paths and its Address cell. */
function specTable(): Map<string, string> {
  const start = SPEC.indexOf("\n## Addresses\n");
  const end = SPEC.indexOf("\n## ", start + 1);
  const rows = new Map<string, string>();
  for (const line of SPEC.slice(start, end).split("\n")) {
    // The first cell's paths: `/events?day=&…`, or several in one row.
    const cell = /^\| (`\/[^|]*)\|/.exec(line)?.[1] ?? "";
    for (const match of cell.matchAll(/`(\/[^`?]*)/g)) {
      rows.set((match[1] ?? "").replace(/<(\w+)>/g, "[$1]"), cell);
    }
  }
  return rows;
}

const ROUTES = dashboardRoutes();
const TABLE = specTable();

describe("every dashboard page has an address", () => {
  it("finds the routes and the spec's table", () => {
    expect(ROUTES.length).toBeGreaterThan(10);
    expect(TABLE.size).toBeGreaterThan(10);
  });

  it.each(ROUTES)("%s has a row in the address table", (route) => {
    expect(webAddressRow(route)?.path).toBe(route);
  });

  it.each(WEB_ADDRESSES.map((row) => row.path))(
    "%s in the address table is a page",
    (row) => {
      expect(ROUTES).toContain(row);
    },
  );

  it.each(WEB_ADDRESSES.map((row) => [row.path, row.params] as const))(
    "%s is in the spec's § Addresses with each of its parameters",
    (route, params) => {
      const cell = TABLE.get(route);
      expect(cell, `no row for ${route}`).toBeDefined();
      for (const name of params) {
        expect(cell, `${route} ${name}`).toMatch(new RegExp(`[?&]${name}=`));
      }
    },
  );
});
