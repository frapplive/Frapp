import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { GoogleDriveStatus } from "@repo/hooks";
import { DriveFolderPanel, heldCopies } from "./drive-folder-panel";
import type { ChapterDocument } from "./document-types";
import { DrivePickerError } from "@/lib/google-drive-picker";

const EMAIL = "frapp-docs@signet-frapp.iam.gserviceaccount.com";
let status: GoogleDriveStatus | undefined;
const connect = vi.fn();
const connectPicked = vi.fn();
const pickDriveFolder = vi.fn();
const PICKER = {
  client_id: "661618060468-abc.apps.googleusercontent.com",
  api_key: "AIza-picker",
  app_id: "661618060468",
};
const syncNow = vi.fn();
const disconnect = vi.fn();
const toast = vi.fn();
const openUp = vi.fn();
const accessQuery = vi.hoisted(() => ({
  data: undefined as
    { options: unknown[]; always: string[] | null } | undefined,
  isSuccess: false,
  isError: false,
}));
const EXEC_OPTIONS = {
  options: [
    {
      entry: "tier:t-exec",
      kind: "tier",
      id: "t-exec",
      name: "Executive board",
      color: null,
      tier_id: null,
      user_ids: ["u-1"],
    },
  ],
  always: ["tier:t-exec"],
};

vi.mock("@repo/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/hooks")>()),
  useGoogleDriveStatus: () => ({ data: status }),
  useConnectGoogleDrive: () => ({ mutateAsync: connect, isPending: false }),
  useConnectPickedGoogleDrive: () => ({
    mutateAsync: connectPicked,
    isPending: false,
  }),
  useSyncGoogleDrive: () => ({ mutateAsync: syncNow, isPending: false }),
  useDisconnectGoogleDrive: () => ({
    mutateAsync: disconnect,
    isPending: false,
  }),
  useOpenUpDriveCopy: () => ({ mutateAsync: openUp, isPending: false }),
  useDocumentAccessOptions: () => accessQuery,
}));

vi.mock("@/lib/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/lib/google-drive-picker", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/google-drive-picker")>()),
  preloadDrivePicker: () => Promise.resolve(),
  pickDriveFolder: (...args: unknown[]) => pickDriveFolder(...args),
}));

const gate = {
  allowed: true,
  isOffline: false,
  noticeRef: { current: null },
  noticeId: "gate-notice",
  state: { allowed: true },
  controlProps: () => ({}),
} as unknown as Parameters<typeof DriveFolderPanel>[0]["gate"];

const connected = (
  over: Partial<NonNullable<GoogleDriveStatus["connection"]>> = {},
): GoogleDriveStatus => ({
  available: true,
  service_account_email: EMAIL,
  picker: null,
  connection: {
    folder_id: "folder-1",
    folder_name: "Chapter files",
    folder_url: "https://drive.google.com/drive/folders/folder-1",
    status: "active",
    last_synced_at: null,
    synced_count: 12,
    skipped_count: 2,
    folders_left_out: 0,
    syncing: false,
    who_can_see: null,
    ...over,
  },
});

describe("DriveFolderPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    status = undefined;
    // Read, for a member outside the tiers: no list to set, folder comes in open.
    accessQuery.data = { options: [], always: null };
    accessQuery.isSuccess = true;
    accessQuery.isError = false;
  });

  it("renders nothing while the server offers no Google Drive", () => {
    status = {
      available: false,
      service_account_email: null,
      picker: null,
      connection: null,
    };
    const { container } = render(<DriveFolderPanel gate={gate} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("walks an officer through sharing and pasting the link", async () => {
    status = {
      available: true,
      service_account_email: EMAIL,
      picker: null,
      connection: null,
    };
    connect.mockResolvedValue(connected());
    const user = userEvent.setup();
    render(<DriveFolderPanel gate={gate} />);

    await user.click(
      screen.getByRole("button", { name: "Connect Google Drive" }),
    );
    expect(screen.getByText(EMAIL)).toBeInTheDocument();
    const connectButton = screen.getByRole("button", { name: "Connect" });
    expect(connectButton).toBeDisabled();

    await user.type(
      screen.getByLabelText("2. Paste the folder's link"),
      "https://drive.google.com/drive/folders/abcdefghijk",
    );
    await user.click(connectButton);

    // Outside every tier: no list to set, so no step 3.
    expect(screen.queryByText("3. Choose who sees it")).toBeNull();
    expect(connect).toHaveBeenCalledWith({
      folderLink: "https://drive.google.com/drive/folders/abcdefghijk",
      whoCanSee: null,
    });
  });

  // #5220: what the folder brings in starts behind the list picked here.
  it("connects with the roles the officer chose to see it", async () => {
    status = {
      available: true,
      service_account_email: EMAIL,
      picker: null,
      connection: null,
    };
    accessQuery.data = EXEC_OPTIONS;
    accessQuery.isSuccess = true;
    connect.mockResolvedValue(connected());
    const user = userEvent.setup();
    render(<DriveFolderPanel gate={gate} />);

    await user.click(
      screen.getByRole("button", { name: "Connect Google Drive" }),
    );
    await user.type(
      screen.getByLabelText("2. Paste the folder's link"),
      "abcdefghijk",
    );
    await user.click(screen.getByRole("radio", { name: "Chosen roles" }));
    const connectButton = screen.getByRole("button", { name: "Connect" });
    await waitFor(() => expect(connectButton).toBeEnabled());
    await user.click(connectButton);

    expect(connect).toHaveBeenCalledWith({
      folderLink: "abcdefghijk",
      whoCanSee: ["tier:t-exec"],
    });
  });

  it("waits to connect until it knows who may be chosen", async () => {
    status = {
      available: true,
      service_account_email: EMAIL,
      picker: null,
      connection: null,
    };
    accessQuery.data = undefined;
    accessQuery.isSuccess = false;
    const user = userEvent.setup();
    render(<DriveFolderPanel gate={gate} />);

    await user.click(
      screen.getByRole("button", { name: "Connect Google Drive" }),
    );
    await user.type(
      screen.getByLabelText("2. Paste the folder's link"),
      "abcdefghijk",
    );
    expect(screen.getByText("3. Choose who sees it")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect" })).toBeDisabled();
  });

  it("shows the server's reason a folder was refused, beside the link", async () => {
    status = {
      available: true,
      service_account_email: EMAIL,
      picker: null,
      connection: null,
    };
    connect.mockRejectedValue({
      statusCode: 400,
      message: `Frapp can’t see that folder yet. Share it with ${EMAIL}.`,
    });
    const user = userEvent.setup();
    render(<DriveFolderPanel gate={gate} />);

    await user.click(
      screen.getByRole("button", { name: "Connect Google Drive" }),
    );
    await user.type(
      screen.getByLabelText("2. Paste the folder's link"),
      "abcdefghijk",
    );
    await user.click(screen.getByRole("button", { name: "Connect" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Frapp can’t see that folder yet",
    );
  });

  // Once connected, the folder is managed where it shows in Documents
  // (`drive-folder-line.tsx`).
  it("renders nothing once a folder is connected", () => {
    status = connected();
    const { container } = render(<DriveFolderPanel gate={gate} />);
    expect(container).toBeEmptyDOMElement();
  });

  describe("held back (#5220)", () => {
    const doc = (over: Partial<ChapterDocument>): ChapterDocument =>
      ({
        id: "doc-1",
        title: "Budget",
        folder: "Chapter files / Exec",
        drive_file_id: "f1",
        drive_held_folder_id: null,
        ...over,
      }) as ChapterDocument;
    const folders = [
      { id: "top", name: "Chapter files", sort_order: 0 },
      { id: "exec", name: "Chapter files / Exec", sort_order: 1 },
    ];

    it("lists only copies held for a folder the officer can see", () => {
      expect(
        heldCopies(
          [
            doc({ drive_held_folder_id: "top" }),
            doc({ id: "doc-2", drive_held_folder_id: null }),
            doc({ id: "doc-3", drive_held_folder_id: "hidden" }),
          ],
          folders,
        ).map((copy) => [copy.doc.id, copy.movedTo]),
      ).toEqual([["doc-1", "Chapter files"]]);
    });
  });

  // #5583: where the server offers Google's picker, the officer signs in and
  // picks the folder; nothing to share by hand, no link, no code.
  describe("with Google's folder picker", () => {
    const pickerStatus = (): GoogleDriveStatus => ({
      available: true,
      service_account_email: EMAIL,
      picker: PICKER,
      connection: null,
    });

    it("opens Google's picker first, then connects the folder with the sign-in's token", async () => {
      status = pickerStatus();
      pickDriveFolder.mockResolvedValue({
        id: "folder-9",
        name: "Chapter Drive",
        accessToken: "member-token",
      });
      connectPicked.mockResolvedValue(connected());
      const user = userEvent.setup();
      render(<DriveFolderPanel gate={gate} />);

      await user.click(
        screen.getByRole("button", { name: "Connect Google Drive" }),
      );
      expect(pickDriveFolder).toHaveBeenCalledWith(PICKER);
      const dialog = await screen.findByRole("dialog");
      // Nothing about sharing by hand.
      expect(within(dialog).queryByText(EMAIL)).toBeNull();
      expect(
        within(dialog).queryByPlaceholderText(/drive\.google\.com/),
      ).toBeNull();
      expect(
        within(dialog).getByRole("button", { name: "Chapter Drive" }),
      ).toBeInTheDocument();

      await user.click(within(dialog).getByRole("button", { name: "Connect" }));
      expect(connectPicked).toHaveBeenCalledWith({
        folderId: "folder-9",
        accessToken: "member-token",
        whoCanSee: null,
      });
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });

    it("stays put when the officer closes Google's window", async () => {
      status = pickerStatus();
      pickDriveFolder.mockResolvedValue(null);
      const user = userEvent.setup();
      render(<DriveFolderPanel gate={gate} />);
      await user.click(
        screen.getByRole("button", { name: "Connect Google Drive" }),
      );
      // No dialog over the page for a pick that didn't happen.
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("says why the picker stopped when it couldn't display", async () => {
      status = pickerStatus();
      pickDriveFolder.mockRejectedValue(
        new DrivePickerError(
          "Google's folder picker didn't display properly. Reload the page and try again.",
        ),
      );
      const user = userEvent.setup();
      render(<DriveFolderPanel gate={gate} />);
      await user.click(
        screen.getByRole("button", { name: "Connect Google Drive" }),
      );
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Google's folder picker didn't display properly. Reload the page and try again.",
      );
      expect(screen.getByRole("button", { name: "Connect" })).toBeDisabled();
    });

    it("shows the server's reason a picked folder was refused", async () => {
      status = pickerStatus();
      pickDriveFolder.mockResolvedValue({
        id: "folder-9",
        name: "Chapter Drive",
        accessToken: "member-token",
      });
      connectPicked.mockRejectedValue({
        statusCode: 403,
        message:
          "Only someone who can edit the folder in Google Drive can connect it.",
      });
      const user = userEvent.setup();
      render(<DriveFolderPanel gate={gate} />);
      await user.click(
        screen.getByRole("button", { name: "Connect Google Drive" }),
      );
      await user.click(screen.getByRole("button", { name: "Connect" }));
      expect(await screen.findByRole("alert")).toHaveTextContent(
        /can edit the folder/,
      );
    });

    // Google lets the picker's sign-in share only an empty folder (staging,
    // 2026-11-25): for any other, the officer shares it, and the panel
    // connects once Frapp can see it.
    it("shows the address to share with, then connects once it's shared", async () => {
      status = pickerStatus();
      pickDriveFolder.mockResolvedValue({
        id: "folder-9",
        name: "Chapter Drive",
        accessToken: "member-token",
      });
      connectPicked.mockRejectedValueOnce({
        statusCode: 409,
        code: "google_drive.share_by_hand",
        message: "Share it.",
      });
      const user = userEvent.setup();
      render(<DriveFolderPanel gate={gate} />);
      await user.click(
        screen.getByRole("button", { name: "Connect Google Drive" }),
      );
      await user.click(screen.getByRole("button", { name: "Connect" }));

      expect(await screen.findByText(EMAIL)).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: /Open in Google Drive/ }),
      ).toHaveAttribute(
        "href",
        "https://drive.google.com/drive/folders/folder-9",
      );
      expect(screen.getByRole("status")).toHaveTextContent(
        "Waiting for the share",
      );
      expect(screen.queryByRole("alert")).toBeNull();
      // The folder and its sign-in are kept for the next check.
      expect(
        screen.getByRole("button", { name: "Chapter Drive" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Connect" })).toBeDisabled();

      // Back from Drive: checked at once, with the same sign-in.
      connectPicked.mockResolvedValueOnce(connected());
      window.dispatchEvent(new Event("focus"));
      await waitFor(() => expect(connectPicked).toHaveBeenCalledTimes(2));
      expect(connectPicked).toHaveBeenLastCalledWith({
        folderId: "folder-9",
        accessToken: "member-token",
        whoCanSee: null,
      });
      await waitFor(() =>
        expect(toast).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Chapter Drive connected" }),
        ),
      );
    });

    it("keeps waiting while the folder still isn't shared", async () => {
      status = pickerStatus();
      pickDriveFolder.mockResolvedValue({
        id: "folder-9",
        name: "Chapter Drive",
        accessToken: "member-token",
      });
      connectPicked.mockRejectedValue({
        statusCode: 409,
        code: "google_drive.share_by_hand",
        message: "Share it.",
      });
      const user = userEvent.setup();
      render(<DriveFolderPanel gate={gate} />);
      await user.click(
        screen.getByRole("button", { name: "Connect Google Drive" }),
      );
      await user.click(screen.getByRole("button", { name: "Connect" }));
      await screen.findByText(EMAIL);
      window.dispatchEvent(new Event("focus"));
      await waitFor(() => expect(connectPicked).toHaveBeenCalledTimes(2));
      expect(screen.getByRole("status")).toHaveTextContent(
        "Waiting for the share",
      );
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("checks by itself every 10 seconds, rides out a failed check, and stops after 10 minutes", async () => {
      status = pickerStatus();
      pickDriveFolder.mockResolvedValue({
        id: "folder-9",
        name: "Chapter Drive",
        accessToken: "member-token",
      });
      const notShared = {
        statusCode: 409,
        code: "google_drive.share_by_hand",
        message: "Share it.",
      };
      connectPicked.mockRejectedValue(notShared);
      const user = userEvent.setup();
      render(<DriveFolderPanel gate={gate} />);
      await user.click(
        screen.getByRole("button", { name: "Connect Google Drive" }),
      );
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        await user.click(screen.getByRole("button", { name: "Connect" }));
        await screen.findByText(EMAIL);
        expect(connectPicked).toHaveBeenCalledTimes(1);

        // A check the server couldn't answer doesn't end the wait.
        connectPicked.mockRejectedValueOnce({ statusCode: 503 });
        await vi.advanceTimersByTimeAsync(10_000);
        expect(connectPicked).toHaveBeenCalledTimes(2);
        expect(screen.getByRole("status")).toHaveTextContent(
          "Waiting for the share",
        );
        expect(screen.queryByRole("alert")).toBeNull();

        await vi.advanceTimersByTimeAsync(10_000);
        expect(connectPicked).toHaveBeenCalledTimes(3);

        // Past 10 minutes it stops; the step stays, and Connect checks again.
        await vi.advanceTimersByTimeAsync(10 * 60_000);
        const calls = connectPicked.mock.calls.length;
        expect(calls).toBeLessThanOrEqual(63);
        expect(screen.getByRole("status")).toHaveTextContent("Not shared yet");
        expect(screen.getByText(EMAIL)).toBeInTheDocument();
        await vi.advanceTimersByTimeAsync(60_000);
        expect(connectPicked).toHaveBeenCalledTimes(calls);
        expect(screen.getByRole("button", { name: "Connect" })).toBeEnabled();
      } finally {
        vi.useRealTimers();
      }
    });

    it("keeps the link flow one press away", async () => {
      status = pickerStatus();
      pickDriveFolder.mockResolvedValue({
        id: "folder-9",
        name: "Chapter Drive",
        accessToken: "member-token",
      });
      const user = userEvent.setup();
      render(<DriveFolderPanel gate={gate} />);
      await user.click(
        screen.getByRole("button", { name: "Connect Google Drive" }),
      );
      await user.click(
        screen.getByRole("button", { name: "Use a folder link instead" }),
      );
      expect(
        screen.getByLabelText("2. Paste the folder's link"),
      ).toBeInTheDocument();
      expect(screen.getByText(EMAIL)).toBeInTheDocument();
    });

    it("drops the picked folder after a refusal, so the next pick starts fresh", async () => {
      status = pickerStatus();
      pickDriveFolder.mockResolvedValue({
        id: "folder-9",
        name: "Chapter Drive",
        accessToken: "member-token",
      });
      connectPicked.mockRejectedValue({
        statusCode: 400,
        message:
          "Your Google sign-in didn’t go through. Pick the folder again.",
      });
      const user = userEvent.setup();
      render(<DriveFolderPanel gate={gate} />);
      await user.click(
        screen.getByRole("button", { name: "Connect Google Drive" }),
      );
      await user.click(screen.getByRole("button", { name: "Connect" }));
      expect(await screen.findByRole("alert")).toHaveTextContent(
        /Pick the folder again/,
      );
      expect(
        screen.getByRole("button", { name: /Choose a folder in Google Drive/ }),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Connect" })).toBeDisabled();
    });
  });
});
