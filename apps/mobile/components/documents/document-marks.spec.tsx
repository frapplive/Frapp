/** @vitest-environment jsdom */
import React from "react";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { DRIVE_MARK_PIECES } from "@repo/theme/nav-glyphs";
import { FrappThemeProvider } from "@/lib/theme";

vi.mock("@/lib/chapter-branding", () => ({
  useChapterBranding: () => ({ accent: "#7A3FC2" }),
}));

import { DocumentMarks } from "./document-marks";

function render(marks: {
  limited?: boolean;
  fromDrive?: boolean;
  pinned?: boolean;
  starred?: boolean;
}) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <FrappThemeProvider>
        <DocumentMarks
          limited={false}
          fromDrive={false}
          pinned={false}
          starred={false}
          {...marks}
        />
      </FrappThemeProvider>,
    );
  });
  return tree;
}

const drivePieces = (tree: ReactTestRenderer) =>
  tree.root.findAll(
    (node) =>
      (node.type as unknown as string) === "Path" &&
      DRIVE_MARK_PIECES.some((piece) => piece.d === node.props.d),
  );

describe("DocumentMarks (#6055)", () => {
  it("draws Drive's mark, in Drive's colours, on a Drive file", () => {
    const pieces = drivePieces(render({ fromDrive: true }));
    expect(pieces.map((node) => node.props.fill)).toEqual(
      DRIVE_MARK_PIECES.map((piece) => piece.fill),
    );
  });

  it("draws no Drive mark on an upload, and nothing at all with no marks", () => {
    expect(drivePieces(render({ starred: true }))).toHaveLength(0);
    expect(render({}).toJSON()).toBeNull();
  });
});
