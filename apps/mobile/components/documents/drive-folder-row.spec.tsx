/** @vitest-environment jsdom */
import React from "react";
import { act } from "react";
import { Alert } from "react-native";
import * as Linking from "expo-linking";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GoogleDriveStatus } from "@repo/hooks";
import { FrappThemeProvider } from "@/lib/theme";
import { screenText } from "@/test/screen-text";
import { DriveFolderRow } from "./drive-folder-row";

/**
 * The phone's Drive folder row says what web's line says, and its press
 * opens the same actions (Paul's Drive-as-a-folder pick, 2026-11-25).
 */

const state = vi.hoisted(() => ({
  status: undefined as GoogleDriveStatus | undefined,
  syncNow: vi.fn(),
  disconnect: vi.fn(),
  menus: [] as {
    title: string;
    message?: string;
    actions: { key: string; label: string; run: () => void }[];
  }[],
}));

vi.mock("@repo/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/hooks")>()),
  useGoogleDriveStatus: () => ({ data: state.status }),
  useSyncGoogleDrive: () => ({ mutateAsync: state.syncNow, isPending: false }),
  useDisconnectGoogleDrive: () => ({
    mutateAsync: state.disconnect,
    isPending: false,
  }),
}));
vi.mock("@/components/item-actions-menu", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/item-actions-menu")>()),
  openItemMenu: (menu: (typeof state.menus)[number]) => {
    state.menus.push(menu);
  },
}));
vi.mock("expo-clipboard", () => ({
  setStringAsync: vi.fn().mockResolvedValue(true),
}));

const connected = (
  over: Partial<NonNullable<GoogleDriveStatus["connection"]>> = {},
): GoogleDriveStatus => ({
  available: true,
  service_account_email: "frapp-docs@example.iam.gserviceaccount.com",
  picker: null,
  connection: {
    folder_id: "drive-top",
    folder_name: "Chapter files",
    folder_url: "https://drive.google.com/drive/folders/drive-top",
    status: "active",
    last_synced_at: null,
    synced_count: 494,
    skipped_count: 753,
    folders_left_out: 0,
    syncing: false,
    who_can_see: null,
    ...over,
  },
});

function renderRow(folder: { name: string; drive_folder_id?: string }) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <FrappThemeProvider>
        <DriveFolderRow folder={folder} />
      </FrappThemeProvider>,
    );
  });
  return tree;
}

function press(tree: ReactTestRenderer) {
  const row = tree.root.findAll(
    (node) => node.props.accessibilityHint === "Opens Google Drive's actions.",
  )[0]!;
  act(() => row.props.onPress());
  return state.menus[state.menus.length - 1]!;
}

describe("DriveFolderRow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.menus = [];
    state.status = connected();
  });

  it("shows nothing over a folder sync didn't make", () => {
    const tree = renderRow({ name: "Bylaws" });
    expect(tree.toJSON()).toBeNull();
  });

  it("says the connected folder's state in web's words, left out included", () => {
    const tree = renderRow({
      name: "Chapter files",
      drive_folder_id: "drive-top",
    });
    expect(screenText(tree)).toContain(
      "Not synced yet · 494 files · 753 left out",
    );
  });

  it("opens the folder in Drive, syncs, and disconnects only after confirming", () => {
    const openURL = vi.mocked(Linking.openURL);
    const alert = vi.spyOn(Alert, "alert").mockImplementation(() => {});
    state.syncNow.mockResolvedValue(connected({ syncing: true }));
    const tree = renderRow({
      name: "Chapter files",
      drive_folder_id: "drive-top",
    });
    const menu = press(tree);
    expect(menu.actions.map((action) => action.label)).toEqual([
      "Open in Google Drive",
      "Sync now",
      "Disconnect",
    ]);
    menu.actions[0]!.run();
    expect(openURL).toHaveBeenCalledWith(
      "https://drive.google.com/drive/folders/drive-top",
    );
    menu.actions[1]!.run();
    expect(state.syncNow).toHaveBeenCalled();
    menu.actions[2]!.run();
    expect(state.disconnect).not.toHaveBeenCalled();
    expect(alert.mock.calls[0]![0]).toBe("Disconnect Chapter files?");
    // Confirming disconnects.
    state.disconnect.mockResolvedValue(undefined);
    const buttons = alert.mock.calls[0]![2] as {
      text: string;
      onPress?: () => void;
    }[];
    buttons.find((button) => button.text === "Disconnect")!.onPress!();
    expect(state.disconnect).toHaveBeenCalledTimes(1);
  });

  it("says why files were left out under the menu's caption", () => {
    const tree = renderRow({
      name: "Chapter files",
      drive_folder_id: "drive-top",
    });
    expect(press(tree).message).toMatch(
      /753 left out\. Left out: Forms and shortcuts/,
    );
  });

  it("opens a folder below the connected one straight in Drive, with no menu", () => {
    const openURL = vi.mocked(Linking.openURL);
    const tree = renderRow({
      name: "Chapter files / Rush",
      drive_folder_id: "drive-rush",
    });
    expect(screenText(tree)).toContain("In Google Drive");
    const row = tree.root.findAll(
      (node) =>
        node.props.accessibilityHint === "Opens this folder in Google Drive.",
    )[0]!;
    act(() => row.props.onPress());
    expect(openURL).toHaveBeenCalledWith(
      "https://drive.google.com/drive/folders/drive-rush",
    );
    expect(state.menus).toEqual([]);
  });

  it("says who sorts out a refused sync, with no retry", async () => {
    const alert = vi.spyOn(Alert, "alert").mockImplementation(() => {});
    state.syncNow.mockRejectedValue({
      statusCode: 403,
      error: "Forbidden",
      message:
        "Chapter subscription is not active; complete checkout to use this feature.",
    });
    const tree = renderRow({
      name: "Chapter files",
      drive_folder_id: "drive-top",
    });
    press(tree)
      .actions.find((action) => action.key === "sync")!
      .run();
    await vi.waitFor(() => expect(alert).toHaveBeenCalled());
    expect(alert.mock.calls[0]![1]).toMatch(/subscription isn't active/);
  });

  it("offers the address to share a lost folder with again", () => {
    state.status = connected({ status: "no_access" });
    const tree = renderRow({
      name: "Chapter files",
      drive_folder_id: "drive-top",
    });
    expect(screenText(tree)).toContain("Frapp can't see it in Google Drive");
    expect(press(tree).actions.map((action) => action.label)).toEqual([
      "Open in Google Drive",
      "Copy Frapp's address",
      "Disconnect",
    ]);
  });
});
