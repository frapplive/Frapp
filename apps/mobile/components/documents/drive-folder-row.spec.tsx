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
vi.mock("expo-clipboard", () => ({ setStringAsync: vi.fn() }));

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
