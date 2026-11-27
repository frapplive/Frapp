/** @vitest-environment jsdom */
import React from "react";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivityRow } from "@repo/hooks";
import { TASK_EXTENSION_COPY } from "@repo/validation";
import { FrappThemeProvider } from "@/lib/theme";

const state = vi.hoisted(() => ({
  approve: vi.fn(),
  decline: vi.fn(),
}));

vi.mock("@repo/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/hooks")>()),
  useApproveTaskExtension: () => ({
    mutateAsync: state.approve,
    isPending: false,
  }),
  useDeclineTaskExtension: () => ({
    mutateAsync: state.decline,
    isPending: false,
  }),
}));

vi.mock("@/lib/connection/use-connection", () => ({
  useConnection: () => ({ writeBlockedReason: null }),
}));

vi.mock("@/lib/chapter-branding", () => ({
  useChapterBranding: () => ({
    accent: "#DDB844",
    accentPrimary: "#DDB844",
    accentOnPrimary: "#000000",
  }),
}));

import { DeclineExtensionSheet } from "@/components/tasks/decline-extension-sheet";
import { ExtensionDecision } from "./extension-decision";

/**
 * An officer's decision on a request for more time (#6096): what it shows,
 * Approve, Decline through its reason sheet, and a 409 said and re-read.
 */

type ExtensionRow = Extract<ActivityRow, { kind: "extension" }>;

function row(overrides: Partial<ExtensionRow["extension"]> = {}): ExtensionRow {
  const extension = {
    id: "x1",
    task: { id: "t1", title: "Sweep the porch", assignee_id: "sam" },
    requester_name: "Sam Lee",
    reason: "Shift ran late",
    from_due_date: "2026-11-20",
    from_due_at: null,
    to_due_date: "2026-11-23",
    to_due_at: null,
    needs_officer: "over_a_day",
    ai_verdict: "invalid",
    ai_note: "Doesn't say why it needs three days.",
    created_at: "2026-11-18T09:00:00.000Z",
    ...overrides,
  } as unknown as ExtensionRow["extension"];
  return {
    kind: "extension",
    key: "needs:extension:x1",
    extension,
    title: "Sam Lee asks for more time",
    detail: "",
    soon: null,
    faceId: "sam",
    badge: { label: "Decide", variant: "warning" },
    glyph: "task",
    dateBlock: null,
    unread: false,
    readRef: null,
    progress: null,
  };
}

function render(element: React.ReactElement): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<FrappThemeProvider>{element}</FrappThemeProvider>, {
      createNodeMock: (element) =>
        element.type === "BottomSheetModal" ? { present: vi.fn() } : null,
    });
  });
  return tree;
}

const texts = (tree: ReactTestRenderer) =>
  tree.root
    .findAll((node) => typeof node.props.children === "string")
    .map((node) => node.props.children as string);

const button = (tree: ReactTestRenderer, label: string) =>
  tree.root.find(
    (node) =>
      node.props.label === label && typeof node.props.onPress === "function",
  );

describe("ExtensionDecision (#6096)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the reason, why it waits, and AI's note on an invalid reason", () => {
    const tree = render(<ExtensionDecision row={row()} onActed={vi.fn()} />);
    const shown = texts(tree);
    expect(shown).toContain("Sam Lee asks for more time");
    expect(shown).toContain("Shift ran late");
    expect(shown).toContain("More than a day");
    expect(shown).toContain("Doesn't say why it needs three days.");
    act(() => tree.unmount());
  });

  it("leaves AI's note off when it judged the reason valid", () => {
    const tree = render(
      <ExtensionDecision
        row={row({ ai_verdict: "valid", needs_officer: "second_request" })}
        onActed={vi.fn()}
      />,
    );
    expect(texts(tree)).not.toContain("Doesn't say why it needs three days.");
    act(() => tree.unmount());
  });

  it("approves, says so where the buttons were, and re-reads", async () => {
    state.approve.mockResolvedValue({});
    const onActed = vi.fn();
    const tree = render(<ExtensionDecision row={row()} onActed={onActed} />);
    await act(async () => {
      button(tree, TASK_EXTENSION_COPY.approve).props.onPress();
    });
    expect(state.approve).toHaveBeenCalledWith({
      taskId: "t1",
      requestId: "x1",
    });
    expect(onActed).toHaveBeenCalled();
    expect(
      tree.root.findAll(
        (node) => node.props.label === TASK_EXTENSION_COPY.approve,
      ),
    ).toHaveLength(0);
    act(() => tree.unmount());
  });

  it("says a 409 in the server's words and re-reads", async () => {
    state.approve.mockRejectedValue({
      status: 409,
      message: "Someone already answered this request.",
    });
    const onActed = vi.fn();
    const tree = render(<ExtensionDecision row={row()} onActed={onActed} />);
    await act(async () => {
      button(tree, TASK_EXTENSION_COPY.approve).props.onPress();
    });
    expect(onActed).toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it("opens Decline's reason sheet, which sends the reason", async () => {
    state.decline.mockResolvedValue({});
    const tree = render(<ExtensionDecision row={row()} onActed={vi.fn()} />);
    act(() => button(tree, TASK_EXTENSION_COPY.decline).props.onPress());
    const sheet = tree.root.findByType(DeclineExtensionSheet);
    await act(async () => {
      await sheet.props.onSubmit("The event is Friday");
    });
    expect(state.decline).toHaveBeenCalledWith({
      taskId: "t1",
      requestId: "x1",
      reason: "The event is Friday",
    });
    expect(texts(tree)).toContain(
      `${TASK_EXTENSION_COPY.declined}: The event is Friday`,
    );
    act(() => tree.unmount());
  });
});
