import { Alert } from "react-native";
import * as Linking from "expo-linking";
import * as Clipboard from "expo-clipboard";
import {
  driveFolderLine,
  driveFolderUrl,
  useDisconnectGoogleDrive,
  useGoogleDriveStatus,
  useSyncGoogleDrive,
} from "@repo/hooks";
import { ListRow, ListSection } from "@/components/list-section";
import { MoreGlyph } from "@/components/control-glyphs";
import { openItemMenu, pressAt } from "@/components/item-actions-menu";
import { alertFailure } from "@/lib/failure-alert";
import { useFrappTheme } from "@/lib/theme";

/**
 * The Google Drive folder on the phone, managed where it shows, as on web
 * (`apps/web/components/documents/drive-folder-line.tsx`; Paul's
 * Drive-as-a-folder pick, 2026-11-25). Over a folder sync made, an officer
 * with Manage documents sees one row with the same state line ("Synced
 * today at 8:40 PM · 494 files · 753 left out") whose press opens the same
 * menu: Open in Google Drive, Sync now and, on the connected folder,
 * Disconnect. When Frapp lost the folder it offers the address to share it
 * with again. Connecting stays on web, where Google's picker runs.
 */
export function DriveFolderRow({
  folder,
}: {
  /** The folder on screen; nothing shows unless sync made it. */
  folder: { name: string; drive_folder_id?: string | null } | undefined;
}) {
  const { tokens } = useFrappTheme();
  const status = useGoogleDriveStatus();
  const sync = useSyncGoogleDrive();
  const disconnect = useDisconnectGoogleDrive();
  const data = status.data;
  const connection = data?.connection;
  const driveId = folder?.drive_folder_id;
  if (!folder || !connection || !driveId) return null;
  const root = driveId === connection.folder_id;
  const lost = connection.status === "no_access";
  const syncing = connection.syncing || sync.isPending;
  const line = root ? driveFolderLine(connection) : null;
  const email = data.service_account_email;

  const syncNow = () => {
    sync
      .mutateAsync()
      .catch((error: unknown) =>
        alertFailure({ title: "Couldn't start a sync", error, retry: syncNow }),
      );
  };

  const confirmDisconnect = () => {
    Alert.alert(
      `Disconnect ${connection.folder_name}?`,
      "Its files leave Documents within a minute. Nothing in Google Drive changes, and you can connect it again later.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: () => {
            disconnect
              .mutateAsync()
              .catch((error: unknown) =>
                alertFailure({ title: "Couldn't disconnect", error }),
              );
          },
        },
      ],
      { cancelable: true },
    );
  };

  return (
    <ListSection>
      <ListRow
        label={root ? "Google Drive" : "In Google Drive"}
        description={line}
        descriptionTone={lost ? "destructive" : "default"}
        accessibilityHint="Opens Google Drive's actions."
        trailing={
          <MoreGlyph color={tokens.color.text.mutedForeground} size={16} />
        }
        onPress={(event) =>
          openItemMenu(
            {
              title: folder.name,
              ...(line ? { message: line } : {}),
              actions: [
                {
                  key: "open",
                  label: "Open in Google Drive",
                  run: () => void Linking.openURL(driveFolderUrl(driveId)),
                },
                ...(root && lost && email
                  ? [
                      {
                        key: "copy",
                        label: "Copy Frapp's address",
                        run: () => void Clipboard.setStringAsync(email),
                      },
                    ]
                  : []),
                ...(!syncing && !lost
                  ? [{ key: "sync", label: "Sync now", run: syncNow }]
                  : []),
                ...(root
                  ? [
                      {
                        key: "disconnect",
                        label: "Disconnect",
                        destructive: true,
                        run: confirmDisconnect,
                      },
                    ]
                  : []),
              ],
            },
            pressAt(event),
          )
        }
      />
    </ListSection>
  );
}
