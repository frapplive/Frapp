import { app, Notification, type MenuItemConstructorOptions } from "electron";
import { autoUpdater } from "electron-updater";
import fs from "node:fs";
import path from "node:path";
import {
  FIRST_UPDATE_CHECK_MS,
  parseUpdateChannel,
  setUpdateChannel,
  UPDATE_CHECK_INTERVAL_MS,
  updateMenuItem,
  updatesSupported,
  type UpdateChannel,
  type UpdateState,
} from "../shared/update-policy";

const channelFile = (): string =>
  path.join(app.getPath("userData"), "update-channel");

function readChannel(): UpdateChannel {
  try {
    return parseUpdateChannel(fs.readFileSync(channelFile(), "utf8"));
  } catch {
    // Never chosen: what every member gets.
    return "latest";
  }
}

function writeChannel(channel: UpdateChannel): void {
  try {
    fs.mkdirSync(path.dirname(channelFile()), { recursive: true });
    fs.writeFileSync(channelFile(), channel);
  } catch {
    // The choice holds until the app quits; the next launch is the default.
  }
}

/** Only a build the `Desktop release` workflow made carries this file. */
const hasUpdateConfig = (): boolean =>
  fs.existsSync(path.join(process.resourcesPath, "app-update.yml"));

/**
 * The app updating itself (#4843), the way Discord and Slack do: it asks the
 * feed shortly after launch and a few times a day, downloads a newer version
 * in the background, and installs it the next time the app quits. Because the
 * app lives in the tray and may not quit for weeks, a downloaded update also
 * raises one notification and puts "Restart to Update" in the menus.
 *
 * `electron-updater` checks the download before installing it: on Windows
 * against the publisher name the installer was built with, on macOS through
 * the system's own code-signature check. Builds with no update address (every
 * unsigned one) don't run any of this (`updatesSupported`).
 *
 * Returns the menu rows, empty where the build doesn't update itself.
 * `onChange` redraws the menus; `beforeRestart` lets the window really close,
 * since closing it normally only hides it.
 */
export function startUpdater(options: {
  onChange: () => void;
  beforeRestart: () => void;
}): { menuItems: () => MenuItemConstructorOptions[] } {
  if (
    !updatesSupported({
      isPackaged: app.isPackaged,
      platform: process.platform,
      hasUpdateConfig: hasUpdateConfig(),
    })
  ) {
    return { menuItems: () => [] };
  }

  let state: UpdateState = { kind: "idle" };
  let channel = readChannel();
  // The channel the check or download in flight was started for.
  let askedChannel = channel;
  // A version this install downloaded and then could not accept.
  let refusedVersion: string | null = null;
  // Held here so the notification, and its click, outlive this function.
  let notice: Notification | null = null;

  const setState = (next: UpdateState): void => {
    state = next;
    options.onChange();
  };
  const restart = (): void => {
    if (state.kind !== "ready") return;
    options.beforeRestart();
    autoUpdater.quitAndInstall();
  };
  const check = (): void => {
    // A downloaded update is kept; asking again would only restart the row.
    if (state.kind !== "idle") return;
    askedChannel = channel;
    setState({ kind: "checking" });
    autoUpdater.checkForUpdates().catch(() => {
      // Reported through the `error` event below.
    });
  };
  /** The member changed channel while this answer was on its way: ask again. */
  const channelMoved = (): boolean => {
    if (askedChannel === channel) return false;
    setState({ kind: "idle" });
    check();
    return true;
  };

  // Downloads are started below, by hand: with `autoDownload` the library
  // starts one whose failure nothing can catch, and an unhandled rejection in
  // this process puts Electron's error dialog on a member's screen.
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  // Whole files only. A partial download asks for hundreds of byte ranges of
  // one file, each a trip through the API's redirect, to save part of a
  // download that happens every few weeks.
  autoUpdater.disableDifferentialDownload = true;
  setUpdateChannel(autoUpdater, channel);

  autoUpdater.on("update-available", (info) => {
    if (channelMoved()) return;
    if (info.version === refusedVersion) {
      setState({ kind: "idle" });
      return;
    }
    autoUpdater.autoInstallOnAppQuit = true;
    setState({ kind: "downloading", version: info.version });
    autoUpdater.downloadUpdate().catch(() => {
      // Reported through the `error` event below.
    });
  });
  autoUpdater.on("update-not-available", () => {
    if (channelMoved()) return;
    setState({ kind: "idle" });
  });
  autoUpdater.on("error", (error) => {
    // Offline, the feed unreachable, or a download that didn't verify:
    // nothing a member can act on. The next check tries again. On macOS the
    // system checks a download only after it is reported ready, so a refusal
    // arrives here with the row already saying "Restart": that version is
    // not offered again.
    if (state.kind === "ready") refusedVersion = state.version;
    console.warn(`Update check failed: ${error.message}`);
    setState({ kind: "idle" });
  });
  autoUpdater.on("update-downloaded", (info) => {
    if (askedChannel !== channel) {
      // Downloaded for a channel the member has since left: it must not
      // install itself on quit.
      autoUpdater.autoInstallOnAppQuit = false;
      setState({ kind: "idle" });
      check();
      return;
    }
    setState({ kind: "ready", version: info.version });
    if (!Notification.isSupported()) return;
    notice = new Notification({
      title: `Frapp ${info.version} is ready`,
      body: "Restart Frapp to update.",
    });
    notice.on("click", restart);
    notice.show();
  });

  setTimeout(check, FIRST_UPDATE_CHECK_MS);
  setInterval(check, UPDATE_CHECK_INTERVAL_MS);

  return {
    menuItems: () => {
      const row = updateMenuItem(state);
      return [
        {
          label: row.label,
          enabled: row.enabled,
          click: row.action === "restart" ? restart : check,
        },
        {
          label: "Get Updates Early (Beta)",
          type: "checkbox",
          checked: channel === "beta",
          click: (item) => {
            channel = item.checked ? "beta" : "latest";
            writeChannel(channel);
            setUpdateChannel(autoUpdater, channel);
            if (state.kind === "ready") {
              // What is waiting was downloaded for the other channel. It
              // stays on disk but no longer installs itself on quit; if the
              // new channel offers it too, the check below brings it back.
              // (On macOS the system may already hold it for the next quit.)
              autoUpdater.autoInstallOnAppQuit = false;
              state = { kind: "idle" };
            }
            options.onChange();
            check();
          },
        },
      ];
    },
  };
}
