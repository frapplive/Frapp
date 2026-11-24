/**
 * The Frapp desktop app's main process (ADR-29).
 *
 * A thin shell: one window showing the hosted web app, kept running in the
 * tray (Windows, Linux) or the dock (macOS) when the window is closed, so it
 * can notify like Discord and Slack do. Everything a member sees is the web
 * app; this file owns only the window, the menus and what may leave it.
 */
import { app, BrowserWindow, ipcMain, nativeImage, session, shell } from "electron";
import path from "node:path";
import { resolveAppOrigin } from "../shared/app-url";
import { AUTH_LINK_SCHEME, createAuthLinkGate, findAuthLink } from "../shared/auth-link";
import { badgeDescription, badgeDotPng } from "../shared/badge-overlay";
import { IPC, parseBadgeCount, parseExternalUrl } from "../shared/bridge";
import { decideNavigation, isPermissionAllowed } from "../shared/navigation";
import { offlinePageHtml, WINDOW_BACKGROUND } from "../shared/offline-page";
import { MIN_SIZE } from "../shared/window-state";
import { installContextMenu } from "./context-menu";
import { installAppMenu, launchedHidden } from "./menu";
import { createTray } from "./tray";
import { loadWindowState, trackWindowState } from "./window-state-store";

const { origin: appOrigin, rejected } = resolveAppOrigin({
  argv: process.argv,
  env: process.env,
  isPackaged: app.isPackaged,
});
if (rejected) console.warn(`Ignoring app URL outside the allow-list: ${rejected}`);

let mainWindow: BrowserWindow | null = null;
/** Set when the member chose Quit, so closing the window really quits. */
let quitting = false;
/**
 * Which `frapp-desktop://` sign-in link is taken: only the one answering the
 * Google or Apple sign-in the member last started here. Any web page can open
 * the scheme, so every other link is ignored and doesn't raise the window.
 */
const authLinks = createAuthLinkGate();

if (!app.requestSingleInstanceLock()) {
  // A second launch (double-clicking the icon again) hands over to the first.
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    // Windows and Linux deliver a sign-in link as a second launch.
    // An ordinary second launch (the icon again) brings the window forward.
    const link = findAuthLink(argv);
    if (link === null || openAuthLink(link)) showWindow();
  });
  // macOS delivers it here, to the running app.
  app.on("open-url", (event, link) => {
    event.preventDefault();
    if (openAuthLink(link)) showWindow();
  });
  app.on("before-quit", () => {
    quitting = true;
  });
  // macOS: clicking the dock icon with no window open brings it back.
  app.on("activate", () => showWindow());
  // The window hides instead of closing, so this fires only on a real quit.
  app.on("window-all-closed", () => app.quit());

  // Every page, including ones the app opens later, gets the same rules.
  app.on("web-contents-created", (_event, contents) => {
    const guard = (event: Electron.Event, url: string): void => {
      const decision = decideNavigation(url, appOrigin);
      if (decision.kind === "stay") return;
      event.preventDefault();
      if (decision.kind === "external") void shell.openExternal(decision.url);
    };
    contents.on("will-navigate", (event, url) => guard(event, url));
    // A server redirect skips `will-navigate`: an app URL answering 302 to
    // another site must not load that site in the window either.
    contents.on("will-redirect", (event, url, _inPlace, isMainFrame) => {
      if (isMainFrame) guard(event, url);
    });
    contents.on("will-attach-webview", (event) => event.preventDefault());
    contents.setWindowOpenHandler(({ url }) => {
      const decision = decideNavigation(url, appOrigin);
      if (decision.kind === "external") void shell.openExternal(decision.url);
      if (decision.kind === "stay") contents.loadURL(url).catch(ignoreLoadFailure);
      return { action: "deny" };
    });
  });

  void app.whenReady().then(() => {
    // Windows files a notification under this id; it must match the
    // installer's (`appId` in electron-builder.yml) or toasts show no app name.
    if (process.platform === "win32") app.setAppUserModelId("live.frapp.desktop");
    registerAuthLinkScheme();
    installPermissionHandlers();
    installBridge();
    const menus = { isPackaged: app.isPackaged, showWindow, onChange: () => rebuildMenus() };
    let tray: ReturnType<typeof createTray> | null = null;
    const rebuildMenus = (): void => {
      installAppMenu(menus);
      tray?.rebuild();
    };
    installAppMenu(menus);
    if (process.platform !== "darwin") tray = createTray({ ...menus, iconPath: trayIconPath() });
    mainWindow = createWindow({ hidden: launchedHidden() });
  });
}

function createWindow(options: { hidden?: boolean } = {}): BrowserWindow {
  const state = loadWindowState();
  const win = new BrowserWindow({
    ...state.bounds,
    minWidth: MIN_SIZE.width,
    minHeight: MIN_SIZE.height,
    show: false,
    title: "Frapp",
    backgroundColor: WINDOW_BACKGROUND,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: false,
      spellcheck: true,
      additionalArguments: [`--frapp-desktop-version=${app.getVersion()}`],
    },
  });
  if (state.bounds.x === undefined) win.center();
  // `maximize()` also shows the window, so it waits until the window is shown:
  // a hidden launch at login must stay hidden.
  if (state.maximized) pendingMaximize.add(win);
  trackWindowState(win);
  installContextMenu(win.webContents);

  win.once("ready-to-show", () => {
    if (!options.hidden) reveal(win);
  });
  // Closing the window keeps Frapp running for notifications; Quit ends it.
  // Windows signing out or shutting down closes windows without `before-quit`;
  // hiding instead would hold up the shutdown.
  win.on("session-end", () => {
    quitting = true;
  });
  win.on("close", (event) => {
    if (quitting) return;
    event.preventDefault();
    win.hide();
  });
  win.webContents.on("did-fail-load", (_event, code, _description, url, isMainFrame) => {
    // -3 is ERR_ABORTED: a navigation the page or we cancelled, not a failure.
    if (!isMainFrame || code === -3 || url.startsWith("data:")) return;
    win
      .loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(offlinePageHtml(appOrigin))}`)
      .catch(ignoreLoadFailure);
  });

  win.loadURL(appOrigin).catch(ignoreLoadFailure);
  return win;
}

/**
 * `loadURL` rejects when the page fails to load. `did-fail-load` already shows
 * the offline screen for that, and an unhandled rejection would put Electron's
 * "A JavaScript error occurred" dialog on top of it.
 */
function ignoreLoadFailure(): void {}

function showWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createWindow();
    setUnreadBadge(unreadBadge);
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  reveal(mainWindow);
  mainWindow.focus();
}

const pendingMaximize = new WeakSet<BrowserWindow>();

function reveal(win: BrowserWindow): void {
  if (pendingMaximize.delete(win)) win.maximize();
  win.show();
}

function installPermissionHandlers(): void {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((contents, permission, callback, details) => {
    const mediaTypes = "mediaTypes" in details ? (details.mediaTypes ?? []) : [];
    callback(isPermissionAllowed(permission, details.requestingUrl ?? contents.getURL(), appOrigin, mediaTypes));
  });
  ses.setPermissionCheckHandler((_contents, permission, requestingOrigin, details) => {
    const mediaType = details.mediaType;
    const mediaTypes = mediaType === "audio" || mediaType === "video" ? [mediaType] : [];
    return isPermissionAllowed(permission, requestingOrigin, appOrigin, mediaTypes);
  });
}

/** The main-process half of `window.frappDesktop`; see `shared/bridge.ts`. */
function installBridge(): void {
  const fromApp = (event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent): boolean =>
    event.senderFrame?.origin === appOrigin;

  ipcMain.on(IPC.setBadgeCount, (event, value: unknown) => {
    const count = parseBadgeCount(value);
    if (!fromApp(event) || count === null) return;
    setUnreadBadge(count);
  });
  // A click on one of the page's notifications: the page can't raise a window
  // hidden in the tray itself. Only the app's own page can ask.
  ipcMain.on(IPC.showWindow, (event) => {
    if (fromApp(event)) showWindow();
  });
  // Answers whether the browser was opened, so the page can say when it wasn't.
  ipcMain.handle(IPC.openExternal, async (event, value: unknown): Promise<boolean> => {
    const url = parseExternalUrl(value);
    if (!fromApp(event) || url === null) return false;
    // The only page this opens is the start of a sign-in that returns to this
    // app, and its link back is the one expected from now on.
    if (!authLinks.arm(url, appOrigin)) return false;
    try {
      await shell.openExternal(url);
      return true;
    } catch {
      return false;
    }
  });
}

/** The last count shown, so a window made later (reopened from the tray) gets its dot. */
let unreadBadge = 0;

/**
 * The unread count on the icon. macOS and Linux draw the number themselves.
 * Windows has no number: the window's taskbar button gets a red dot, with the
 * count in its description (`shared/badge-overlay.ts`).
 */
function setUnreadBadge(count: number): void {
  unreadBadge = count;
  if (process.platform !== "win32") {
    app.setBadgeCount(count);
    return;
  }
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const description = badgeDescription(count);
  mainWindow.setOverlayIcon(
    description === null ? null : nativeImage.createFromBuffer(badgeDotPng()),
    description ?? "",
  );
}

/**
 * Claim `frapp-desktop://` for this app. A packaged app registers itself; an
 * unpackaged `npm start` has to name its entry script, or the link would
 * start a bare Electron.
 */
function registerAuthLinkScheme(): void {
  const entry = process.argv[1];
  if (process.defaultApp && entry) {
    app.setAsDefaultProtocolClient(AUTH_LINK_SCHEME, process.execPath, [path.resolve(entry)]);
  } else {
    app.setAsDefaultProtocolClient(AUTH_LINK_SCHEME);
  }
}

/**
 * Finish a sign-in the member started here: load the web app's own callback
 * route with the code the browser brought back (`shared/auth-link.ts`). A
 * link nobody asked for, or one that isn't a sign-in, is dropped. Returns
 * whether the link was taken.
 */
function openAuthLink(link: string): boolean {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  const target = authLinks.accept(link, appOrigin);
  if (target === null) return false;
  mainWindow.loadURL(target).catch(ignoreLoadFailure);
  return true;
}

/** The Frapp mark for the tray: bundled as an extra resource when packaged. */
function trayIconPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "tray.png")
    : path.join(__dirname, "../../../../packages/brand-assets/assets/signet-emblem-B-32.png");
}
