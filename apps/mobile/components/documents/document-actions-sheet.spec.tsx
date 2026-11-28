/** @vitest-environment jsdom */
import React from "react";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { FrappThemeProvider } from "@/lib/theme";
import { screenText } from "@/test/screen-text";

vi.mock("@/lib/chapter-branding", () => ({
  useChapterBranding: () => ({ accent: "#7A3FC2" }),
}));

import {
  DocumentActionsSheet,
  type DocumentActionsTarget,
} from "./document-actions-sheet";

/**
 * s12's long-press sheet (#3934): Star for everyone; Pin for the chapter and
 * a file's Delete for `chapter_docs:manage` only; an action menu's chrome,
 * with no title, no Cancel and no explaining lines; and a row that runs once
 * the sheet has closed.
 */
const FILE: DocumentActionsTarget = {
  kind: "document",
  id: "d-1",
  name: "Chapter bylaws",
  pinned: false,
  starred: false,
};
const FOLDER: DocumentActionsTarget = {
  kind: "folder",
  id: "f-1",
  name: "Rush",
  pinned: true,
  starred: true,
};

const dismiss = vi.fn();

function render(target: DocumentActionsTarget, canManage: boolean) {
  const onToggleStar = vi.fn();
  const onTogglePin = vi.fn();
  const onDelete = vi.fn();
  const onOpenInDrive = vi.fn();
  const onUploadVersion = vi.fn();
  const onRename = vi.fn();
  const onMove = vi.fn();
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <FrappThemeProvider>
        <DocumentActionsSheet
          ref={React.createRef<never>()}
          target={target}
          canManage={canManage}
          onToggleStar={onToggleStar}
          onTogglePin={onTogglePin}
          onDelete={onDelete}
          onOpenInDrive={onOpenInDrive}
          onUploadVersion={onUploadVersion}
          onRename={onRename}
          onMove={onMove}
        />
      </FrappThemeProvider>,
      {
        createNodeMock: (element) =>
          (element.type as unknown) === "BottomSheetModal"
            ? { dismiss, present: vi.fn() }
            : null,
      },
    );
  });
  return {
    tree,
    onToggleStar,
    onTogglePin,
    onDelete,
    onOpenInDrive,
    onUploadVersion,
    onRename,
    onMove,
  };
}

const rowLabels = (tree: ReactTestRenderer) =>
  tree.root
    .findAll(
      (node) =>
        node.type === ("Pressable" as never) &&
        node.props.accessibilityRole === "button",
    )
    .map((node) => node.props.accessibilityLabel as string);

const row = (tree: ReactTestRenderer, label: string) =>
  tree.root.find(
    (node) =>
      node.type === ("Pressable" as never) &&
      node.props.accessibilityLabel === label,
  );

const finishClosing = (tree: ReactTestRenderer) =>
  act(() =>
    tree.root
      .find((node) => node.type === ("BottomSheetModal" as never))
      .props.onDismiss(),
  );

describe("DocumentActionsSheet (#3934)", () => {
  it("offers a member Star alone", () => {
    const { tree } = render(FILE, false);
    expect(rowLabels(tree)).toEqual(["Star"]);
  });

  it("offers whoever manages documents Pin, and Delete on a file", () => {
    expect(rowLabels(render(FILE, true).tree)).toEqual([
      "Star",
      "Pin for the chapter",
      "Delete document",
    ]);
    // A copy of a Drive file is removed in Drive (#5157).
    expect(rowLabels(render({ ...FILE, fromDrive: true }, true).tree)).toEqual([
      "Star",
      "Pin for the chapter",
    ]);
    // A meeting's minutes are deleted as minutes, on their own screen (#5949).
    expect(rowLabels(render({ ...FILE, minutes: true }, true).tree)).toEqual([
      "Star",
      "Pin for the chapter",
    ]);
    // A folder is deleted on web, from its Edit controls.
    expect(rowLabels(render(FOLDER, true).tree)).toEqual([
      "Unstar",
      "Unpin for the chapter",
    ]);
  });

  it("heads the menu with the item's name, and draws no Cancel and no explainers", () => {
    const { tree } = render(FILE, true);
    const text = screenText(tree);
    expect(text).toContain("Chapter bylaws");
    expect(text).not.toContain("Cancel");
    expect(text).not.toContain("Only you see");
    expect(text).not.toContain("Everyone sees");
  });

  it("runs a row only once the sheet has closed, and only once", () => {
    dismiss.mockClear();
    const { tree, onToggleStar, onTogglePin, onDelete } = render(FILE, true);

    act(() => row(tree, "Star").props.onPress());
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(onToggleStar).not.toHaveBeenCalled();
    finishClosing(tree);
    expect(onToggleStar).toHaveBeenCalledWith(FILE);
    finishClosing(tree);
    expect(onToggleStar).toHaveBeenCalledTimes(1);

    act(() => row(tree, "Pin for the chapter").props.onPress());
    finishClosing(tree);
    expect(onTogglePin).toHaveBeenCalledWith(FILE);

    act(() => row(tree, "Delete document").props.onPress());
    finishClosing(tree);
    expect(onDelete).toHaveBeenCalledWith(FILE);
  });

  it("offers a Drive file Open in Google Drive, and opens its page (#6055)", () => {
    const drive = {
      ...FILE,
      fromDrive: true,
      driveUrl: "https://drive.google.com/file/d/abc/view",
    };
    const { tree, onOpenInDrive } = render(drive, false);
    // Renamed in Drive (#5563): said in Rename's place, and opens it there.
    expect(rowLabels(tree)).toEqual([
      "Star",
      "Rename in Google Drive",
      "Open in Google Drive",
    ]);
    act(() => row(tree, "Open in Google Drive").props.onPress());
    finishClosing(tree);
    expect(onOpenInDrive).toHaveBeenCalledWith(drive.driveUrl);
    // An upload has no Drive page.
    expect(rowLabels(render(FILE, false).tree)).toEqual(["Star"]);
  });

  // #6055: the screen decides who may (`mayUploadNewVersion`); the sheet
  // offers the row only then, and runs it once it has closed.
  it("offers Upload a new version only on a file the member may replace", () => {
    const mine = { ...FILE, canUploadVersion: true };
    const { tree, onUploadVersion } = render(mine, false);
    expect(rowLabels(tree)).toEqual(["Star", "Upload a new version"]);

    act(() => row(tree, "Upload a new version").props.onPress());
    expect(onUploadVersion).not.toHaveBeenCalled();
    finishClosing(tree);
    expect(onUploadVersion).toHaveBeenCalledWith(mine);

    expect(rowLabels(render(FILE, true).tree)).not.toContain(
      "Upload a new version",
    );
    expect(
      rowLabels(render({ ...FOLDER, canUploadVersion: true }, true).tree),
    ).not.toContain("Upload a new version");
  });

  // #5563: the screen decides who may (`mayRenameDocument`,
  // `mayRefileDocument`); the sheet offers each row only then.
  it("offers Rename and Move to folder on a file the member may change", () => {
    const mine = { ...FILE, canRename: true, canMove: true };
    const { tree, onRename, onMove } = render(mine, false);
    expect(rowLabels(tree)).toEqual(["Star", "Rename", "Move to folder"]);

    act(() => row(tree, "Rename").props.onPress());
    expect(onRename).not.toHaveBeenCalled();
    finishClosing(tree);
    expect(onRename).toHaveBeenCalledWith(mine);

    act(() => row(tree, "Move to folder").props.onPress());
    finishClosing(tree);
    expect(onMove).toHaveBeenCalledWith(mine);

    // A linked Drive file moves, but is renamed in Drive.
    expect(
      rowLabels(
        render(
          {
            ...FILE,
            canMove: true,
            driveUrl: "https://drive.google.com/file/d/abc/view",
          },
          false,
        ).tree,
      ),
    ).toEqual([
      "Star",
      "Rename in Google Drive",
      "Move to folder",
      "Open in Google Drive",
    ]);
    expect(rowLabels(render(FILE, true).tree)).not.toContain("Rename");
    expect(
      rowLabels(
        render({ ...FOLDER, canRename: true, canMove: true }, true).tree,
      ),
    ).toEqual(["Unstar", "Unpin for the chapter"]);
  });
});
