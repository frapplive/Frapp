/** @vitest-environment jsdom */
import React from "react";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { useRouter } from "expo-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FrappThemeProvider } from "@/lib/theme";
import { screenText } from "@/test/screen-text";

/**
 * A council's Activity tab is its home (#5933): it reads none of Activity's
 * routes, which refuse a council, and draws the council, its state, and the
 * first steps the viewer can take. Rendered through the tab's route file,
 * which lives under `app/` and so can't hold its own spec.
 */

const tenant = vi.hoisted(() => ({ council: true }));
vi.mock("@/lib/tenant-kind", () => ({
  useTenantKind: () => (tenant.council ? "council" : "chapter"),
  useIsCouncil: () => tenant.council,
  useServesChapterFeatures: () => !tenant.council,
}));

const reads = vi.hoisted(() => ({
  council: {
    data: undefined as unknown,
    isPending: false,
    isFetching: false,
    error: null as unknown,
  },
  permissions: undefined as string[] | undefined,
  activity: vi.fn(),
}));

vi.mock("@repo/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/hooks")>()),
  useActiveChapterId: () => "council-1",
  useCouncil: () => ({ ...reads.council, refetch: vi.fn() }),
  useMyPermissions: () => ({
    data: reads.permissions ? { permissions: reads.permissions } : undefined,
    isSuccess: reads.permissions !== undefined,
    refetch: vi.fn(),
  }),
  useCurrentChapter: () => ({ data: { kind: "council", name: "RPI IFC" } }),
  useActivity: (...args: unknown[]) => {
    reads.activity(...args);
    return { data: undefined };
  },
}));

import ActivityTab from "@/app/(app)/(tabs)/activity";
import { COUNCIL_HOME_COPY } from "./home";

const IFC = {
  id: "council-1",
  name: "RPI IFC",
  council_type: "ifc",
  recruitment_model: "open_bidding",
  verified: false,
  school: {
    id: "s",
    name: "Rensselaer Polytechnic Institute",
    short_name: "RPI",
  },
};

const mounted: ReactTestRenderer[] = [];

function render(): ReactTestRenderer {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <QueryClientProvider client={queryClient}>
        <FrappThemeProvider>
          <ActivityTab />
        </FrappThemeProvider>
      </QueryClientProvider>,
    );
  });
  mounted.push(tree);
  return tree;
}

function pressable(tree: ReactTestRenderer, label: string) {
  return tree.root
    .findAll(
      (node) =>
        typeof node.props.onPress === "function" &&
        screenTextOf(node).includes(label),
    )
    .at(-1);
}

function screenTextOf(node: ReactTestRenderer["root"]): string {
  return node
    .findAll((child) => (child.type as unknown) === "Text")
    .map((child) => JSON.stringify(child.props.children ?? ""))
    .join(" ");
}

beforeEach(() => {
  vi.clearAllMocks();
  tenant.council = true;
  reads.council = {
    data: IFC,
    isPending: false,
    isFetching: false,
    error: null,
  };
  reads.permissions = ["*"];
});

afterEach(() => {
  act(() => {
    for (const tree of mounted.splice(0)) tree.unmount();
  });
});

describe("a council's Activity tab", () => {
  it("draws the council with its state first, and reads nothing of Activity's", () => {
    const text = screenText(render());
    expect(text).toContain("RPI IFC");
    expect(text).toContain("Interfraternity Council · RPI");
    expect(text).toContain(COUNCIL_HOME_COPY.notVerified);
    expect(reads.activity).not.toHaveBeenCalled();
  });

  it("says Verified once staff have verified it", () => {
    reads.council = { ...reads.council, data: { ...IFC, verified: true } };
    const text = screenText(render());
    expect(text).toContain(COUNCIL_HOME_COPY.verified);
    expect(text).not.toContain(COUNCIL_HOME_COPY.notVerified);
  });

  it("offers the Council admin both first steps, each to its screen", () => {
    const tree = render();
    expect(screenText(tree)).toContain(COUNCIL_HOME_COPY.getStarted);
    act(() => pressable(tree, COUNCIL_HOME_COPY.invite)!.props.onPress());
    expect(vi.mocked(useRouter)().push).toHaveBeenCalledWith("/invite");
    act(() => pressable(tree, COUNCIL_HOME_COPY.titles)!.props.onPress());
    expect(vi.mocked(useRouter)().push).toHaveBeenCalledWith("/chapter-roles");
  });

  it("gives a delegate Activity's empty line where the steps would be", () => {
    reads.permissions = ["members:view"];
    const text = screenText(render());
    expect(text).not.toContain(COUNCIL_HOME_COPY.getStarted);
    expect(text).not.toContain(COUNCIL_HOME_COPY.invite);
    expect(text).toContain("Nothing to do right now.");
  });

  it("draws neither steps nor the empty line until permissions answer", () => {
    reads.permissions = undefined;
    const text = screenText(render());
    expect(text).not.toContain(COUNCIL_HOME_COPY.getStarted);
    expect(text).not.toContain("Nothing to do right now.");
  });

  it("says a failed read in plain words, never as an empty council", () => {
    reads.council = {
      data: undefined,
      isPending: false,
      isFetching: false,
      error: new TypeError("Network request failed"),
    };
    const text = screenText(render());
    expect(text).toContain(COUNCIL_HOME_COPY.failed);
    expect(text).not.toContain(COUNCIL_HOME_COPY.notVerified);
  });
});
