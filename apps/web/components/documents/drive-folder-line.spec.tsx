import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { GoogleDriveStatus } from "@repo/hooks";
import { DriveFolderLine } from "./drive-folder-line";
import type { ChapterDocument, FolderRow } from "./document-types";

const EMAIL = "frapp-docs@signet-frapp.iam.gserviceaccount.com";
let status: GoogleDriveStatus | undefined;
const syncNow = vi.fn();
const disconnect = vi.fn();
const openUp = vi.fn();
const toast = vi.fn();

vi.mock("@repo/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/hooks")>()),
  useGoogleDriveStatus: () => ({ data: status }),
  useSyncGoogleDrive: () => ({ mutateAsync: syncNow, isPending: false }),
  useDisconnectGoogleDrive: () => ({
    mutateAsync: disconnect,
    isPending: false,
  }),
  useOpenUpDriveCopy: () => ({ mutateAsync: openUp, isPending: false }),
}));
vi.mock("@/lib/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

const gate = {
  allowed: true,
  isOffline: false,
  noticeRef: { current: null },
  noticeId: "gate-notice",
  state: { allowed: true },
  controlProps: () => ({}),
} as unknown as Parameters<typeof DriveFolderLine>[0]["gate"];

const connected = (
  over: Partial<NonNullable<GoogleDriveStatus["connection"]>> = {},
): GoogleDriveStatus => ({
  available: true,
  service_account_email: EMAIL,
  picker: null,
  connection: {
    folder_id: "drive-top",
    folder_name: "Chapter files",
    folder_url: "https://drive.google.com/drive/folders/drive-top",
    status: "active",
    last_synced_at: null,
    synced_count: 494,
    skipped_count: 753,
    folders_left_out: 209,
    syncing: false,
    who_can_see: null,
    ...over,
  },
});

const top: FolderRow = {
  id: "top",
  name: "Chapter files",
  sort_order: 0,
  drive_folder_id: "drive-top",
} as FolderRow;
const exec: FolderRow = {
  id: "exec",
  name: "Chapter files / Exec",
  sort_order: 1,
  drive_folder_id: "drive-exec",
} as FolderRow;
const own: FolderRow = {
  id: "own",
  name: "Bylaws",
  sort_order: 2,
} as FolderRow;

function renderLine(folder: FolderRow, documents: ChapterDocument[] = []) {
  return render(
    <DriveFolderLine
      folder={folder}
      gate={gate}
      documents={documents}
      folders={[top, exec, own]}
    />,
  );
}

describe("DriveFolderLine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    status = connected();
  });

  it("says nothing over a folder sync didn't make", () => {
    const { container } = renderLine(own);
    expect(container).toBeEmptyDOMElement();
  });

  it("says nothing while no folder is connected", () => {
    status = { ...connected(), connection: null };
    const { container } = renderLine(top);
    expect(container).toBeEmptyDOMElement();
  });

  // Coordinator, 2026-11-25: show what a pass left out, don't hide it.
  it("states the connected folder's sync and what it left out", () => {
    renderLine(top);
    expect(
      screen.getByText(
        "Google Drive · Not synced yet · 494 files · 753 left out · 209 folders not read",
      ),
    ).toBeInTheDocument();
  });

  it("syncs now and opens the folder in Drive from its menu", async () => {
    syncNow.mockResolvedValue(connected({ syncing: true }));
    const user = userEvent.setup();
    renderLine(top);

    await user.click(
      screen.getByRole("button", { name: "More for Chapter files" }),
    );
    expect(
      screen.getByRole("menuitem", { name: /Open in Google Drive/ }),
    ).toHaveAttribute(
      "href",
      "https://drive.google.com/drive/folders/drive-top",
    );
    await user.click(screen.getByRole("menuitem", { name: /Sync now/ }));
    expect(syncNow).toHaveBeenCalled();
  });

  it("disconnects only after confirming", async () => {
    disconnect.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderLine(top);

    await user.click(
      screen.getByRole("button", { name: "More for Chapter files" }),
    );
    await user.click(screen.getByRole("menuitem", { name: /Disconnect/ }));
    expect(disconnect).not.toHaveBeenCalled();
    expect(
      await screen.findByText("Disconnect Chapter files?"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    await waitFor(() => expect(disconnect).toHaveBeenCalled());
  });

  it("opens a subfolder in Drive, and disconnects only from the connected folder", async () => {
    const user = userEvent.setup();
    renderLine(exec);
    expect(screen.getByText("In Google Drive")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "More for Chapter files / Exec" }),
    );
    expect(
      screen.getByRole("menuitem", { name: /Open in Google Drive/ }),
    ).toHaveAttribute(
      "href",
      "https://drive.google.com/drive/folders/drive-exec",
    );
    expect(screen.queryByRole("menuitem", { name: /Disconnect/ })).toBeNull();
  });

  // Google won't let a picker sign-in share a folder with files in it, so a
  // lost folder is shared again by hand (2026-11-25).
  it("says Frapp lost the folder, with the address to share it with again", () => {
    status = connected({ status: "no_access" });
    renderLine(top);
    expect(
      screen.getByText("Google Drive · Frapp can't see it in Google Drive"),
    ).toBeInTheDocument();
    expect(screen.getByText(EMAIL)).toBeInTheDocument();
  });

  it("opens a held copy up only after confirming where it goes (#5220)", async () => {
    openUp.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderLine(top, [
      {
        id: "doc-1",
        title: "Budget",
        folder: "Chapter files / Exec",
        drive_file_id: "f1",
        drive_held_folder_id: "top",
      } as ChapterDocument,
    ]);

    const section = screen.getByRole("region", { name: "Held back" });
    expect(
      within(section).getByText(
        "In Chapter files / Exec, moved to Chapter files in Drive",
      ),
    ).toBeInTheDocument();
    await user.click(
      within(section).getByRole("button", { name: "Open it up" }),
    );
    expect(openUp).not.toHaveBeenCalled();
    expect(
      await screen.findByText("Move Budget to Chapter files?"),
    ).toBeInTheDocument();
    const buttons = screen.getAllByRole("button", { name: "Open it up" });
    await user.click(buttons[buttons.length - 1]!);
    await waitFor(() => expect(openUp).toHaveBeenCalledWith("doc-1"));
  });
});
