import { AccessibilityInfo, Alert } from "react-native";
import * as Linking from "expo-linking";
import * as Clipboard from "expo-clipboard";
import {
  driveFolderActions,
  driveFolderLine,
  driveFolderUrl,
  driveShortfallNote,
  useDisconnectGoogleDrive,
  useGoogleDriveStatus,
  useSyncGoogleDrive,
} from "@repo/hooks";
import { ListRow, ListSection } from "@/components/list-section";
import { MoreGlyph } from "@/components/control-glyphs";
import {
  openItemMenu,
  pressAt,
  type ItemMenuAction,
} from "@/components/item-actions-menu";
import { alertFailure } from "@/lib/failure-alert";
import { selectionHaptic } from "@/lib/haptics";
import {
  SUBSCRIPTION_REFUSAL_COPY,
  subscriptionRefusalOf,
} from "@/lib/subscription-refusal";
import { useFrappTheme } from "@/lib/theme";

/**
 * The Google Drive folder on the phone, managed where it shows, as on web
 * (`apps/web/components/documents/drive-folder-line.tsx`; Paul's
 * Drive-as-a-folder pick, 2026-11-25). On the connected folder an officer
 * with Manage documents sees one row with the same state line ("Synced
 * today at 8:40 PM · 494 files · 753 left out") whose press opens the same
 * menu: Open in Google Drive, Sync now and Disconnect, with why any files
 * were left out under its caption. When Frapp lost the folder it offers the
 * address to share it with again. A folder sync made below it has one
 * action, so its row's press opens it in Google Drive. Connecting stays on
 * web, where Google's picker runs.
 */
export function DriveFolderRow({
  folder,
}: {
  /**
   * The folder on screen; nothing shows unless sync made it. At the top of
   * Documents, the connected folder itself when the officer can't open it.
   */
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
  const { root, lost, canSync } = driveFolderActions(
    connection,
    driveId,
    sync.isPending,
  );
  const email = data.service_account_email;

  const openInDrive = () => {
    Linking.openURL(driveFolderUrl(driveId)).catch(() =>
      Alert.alert("Couldn't open Google Drive", "Try again in a moment."),
    );
  };

  if (!root) {
    return (
      <ListSection>
        <ListRow
          label="In Google Drive"
          accessibilityHint="Opens this folder in Google Drive."
          onPress={openInDrive}
        />
      </ListSection>
    );
  }

  const line = driveFolderLine(connection);
  const note = driveShortfallNote(connection);

  const syncNow = () => {
    sync.mutateAsync().catch((error: unknown) => {
      // The gate can't be retried into success: say who sorts it out.
      if (subscriptionRefusalOf(error)) {
        Alert.alert("Couldn't start a sync", SUBSCRIPTION_REFUSAL_COPY.drive);
        return;
      }
      alertFailure({ title: "Couldn't start a sync", error, retry: syncNow });
    });
  };

  const copyAddress = (address: string) => {
    Clipboard.setStringAsync(address)
      .then(() => {
        selectionHaptic();
        AccessibilityInfo.announceForAccessibility("Address copied.");
      })
      .catch(() => Alert.alert("Couldn't copy", "Try again in a moment."));
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

  const actions: ItemMenuAction[] = [
    { key: "open", label: "Open in Google Drive", run: openInDrive },
  ];
  if (lost && email) {
    actions.push({
      key: "copy",
      label: "Copy Frapp's address",
      run: () => copyAddress(email),
    });
  }
  // The phone's menu has no dimmed row, so Sync now leaves it while it
  // can't run, where web dims it.
  if (canSync) actions.push({ key: "sync", label: "Sync now", run: syncNow });
  actions.push({
    key: "disconnect",
    label: "Disconnect",
    destructive: true,
    run: confirmDisconnect,
  });

  return (
    <ListSection>
      <ListRow
        label="Google Drive"
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
              message: note ? `${line}. ${note}` : line,
              actions,
            },
            pressAt(event),
          )
        }
      />
    </ListSection>
  );
}
