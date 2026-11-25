/**
 * The rules of the desktop app's self-update (#4843, ADR-29 decisions 7 and
 * 8), apart from the library that does it (`src/main/updater.ts`).
 *
 * Installers and their update feed are plain files under one address
 * (`publish.url` in electron-builder.yml). A feed is a small YAML file naming
 * the newest version; there are two per OS, and which one an installed app
 * reads is its channel:
 *
 * - `latest`: what every member gets. The default.
 * - `beta`: every release lands here first. A member opts in from the menu.
 *
 * Both channels are the same signed files and both open production (ADR-24:
 * a channel is not an environment). Promoting a release copies the beta feed
 * over the latest one, so nothing is rebuilt or signed again.
 */
const UPDATE_CHANNELS = ["latest", "beta"] as const;
export type UpdateChannel = (typeof UPDATE_CHANNELS)[number];

/** The channel a saved setting names; anything unreadable is the default. */
export function parseUpdateChannel(raw: string | null | undefined): UpdateChannel {
  const value = raw?.trim();
  return value === "beta" ? "beta" : "latest";
}

/** Long enough after launch that the check never competes with the first page load. */
export const FIRST_UPDATE_CHECK_MS = 30_000;
/** The app can run for weeks in the tray, so it asks again a few times a day. */
export const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

export type UpdateState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "downloading"; version: string }
  | { kind: "ready"; version: string };

/** The menu's update row: what it says and whether it can be clicked. */
export function updateMenuItem(state: UpdateState): {
  label: string;
  enabled: boolean;
  action: "check" | "restart" | null;
} {
  switch (state.kind) {
    case "checking":
      return { label: "Checking for Updates…", enabled: false, action: null };
    case "downloading":
      return { label: `Downloading Frapp ${state.version}…`, enabled: false, action: null };
    case "ready":
      return { label: `Restart to Update to ${state.version}`, enabled: true, action: "restart" };
    case "idle":
      return { label: "Check for Updates…", enabled: true, action: "check" };
  }
}

/**
 * Whether this build updates itself at all. Not an unpackaged `npm start`,
 * and not Linux: the AppImage is built for us to try and isn't offered to
 * members (ADR-29), so nothing publishes a feed for it.
 */
export function updatesSupported(options: { isPackaged: boolean; platform: string }): boolean {
  return options.isPackaged && (options.platform === "darwin" || options.platform === "win32");
}
