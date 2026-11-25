import { app, Notification, type MenuItemConstructorOptions } from "electron";
import { autoUpdater } from "electron-updater";
import fs from "node:fs";
import path from "node:path";
import {
  FIRST_UPDATE_CHECK_MS,
  parseUpdateChannel,
  UPDATE_CHECK_INTERVAL_MS,
  updateMenuItem,
  updatesSupported,
  type UpdateChannel,
  type UpdateState,
} from "../shared/update-policy";

const channelFile = (): string => path.join(app.getPath("userData"), "update-channel");

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

/**
 * The app updating itself (#4843), the way Discord and Slack do: it asks the
 * feed shortly after launch and a few times a day, downloads a newer version
 * in the background, and installs it the next time the app quits. Because the
 * app lives in the tray and may not quit for weeks, a downloaded update also
 * raises one notification and puts "Restart to Update" in the menus.
 *
 * `electron-updater` checks the download before installing it: on Windows
 * against the publisher name the installer was built with, on macOS through
 * the system's own code-signature check. An unsigned build (the `Desktop
 * build` workflow's) fails that check on macOS and the error is dropped here,
 * so it simply never updates.
 *
 * Returns the menu rows, empty where the build doesn't update itself
 * (`updatesSupported`). `onChange` redraws the menus; `beforeRestart` lets the
 * window really close, since closing it normally only hides it.
 */
export function startUpdater(options: {
  onChange: () => void;
  beforeRestart: () => void;
}): { menuItems: () => MenuItemConstructorOptions[] } {
  if (!updatesSupported({ isPackaged: app.isPackaged, platform: process.platform })) {
    return { menuItems: () => [] };
  }

  let state: UpdateState = { kind: "idle" };
  let channel = readChannel();
  const setState = (next: UpdateState): void => {
    state = next;
    options.onChange();
  };
  const restart = (): void => {
    options.beforeRestart();
    autoUpdater.quitAndInstall();
  };
  const check = (): void => {
    // A downloaded update is kept; asking again would only restart the row.
    if (state.kind !== "idle") return;
    setState({ kind: "checking" });
    autoUpdater.checkForUpdates().catch(() => {
      // Reported through the `error` event below.
    });
  };

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  // Whole files only. A partial download asks for hundreds of byte ranges of
  // one file, each a trip through the API's redirect, to save part of a
  // download that happens every few weeks.
  autoUpdater.disableDifferentialDownload = true;
  // Setting a channel turns downgrades on; leaving the beta must never
  // install an older build over a newer one's saved data.
  autoUpdater.channel = channel;
  autoUpdater.allowDowngrade = false;

  autoUpdater.on("update-available", (info) => setState({ kind: "downloading", version: info.version }));
  autoUpdater.on("update-not-available", () => setState({ kind: "idle" }));
  autoUpdater.on("error", (error) => {
    // Offline, the feed unreachable, or a build that can't verify an update:
    // nothing a member can act on. The next check tries again.
    console.warn(`Update check failed: ${error.message}`);
    setState({ kind: "idle" });
  });
  autoUpdater.on("update-downloaded", (info) => {
    setState({ kind: "ready", version: info.version });
    if (!Notification.isSupported()) return;
    const notice = new Notification({
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
            autoUpdater.channel = channel;
            autoUpdater.allowDowngrade = false;
            options.onChange();
            check();
          },
        },
      ];
    },
  };
}
