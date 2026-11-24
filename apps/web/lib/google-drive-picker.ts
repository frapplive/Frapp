import * as Sentry from "@sentry/nextjs";

/**
 * Google's own folder picker for connecting a chapter's Drive folder (#5583;
 * `spec/behavior/chapter-docs.md` § Google Drive folder). The officer signs
 * in with Google (`drive.file` only, which shows Frapp nothing but what they
 * pick), picks the folder, and the API shares it with Frapp using that
 * sign-in. Google's guide: developers.google.com/workspace/drive/picker/guides/web-picker.
 *
 * The client id, API key and app id come from the API (`GET /v1/google-drive`
 * `picker`), so each environment uses its own Google client.
 */

const GSI_SRC = "https://accounts.google.com/gsi/client";
const GAPI_SRC = "https://apis.google.com/js/api.js";
const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const FOLDER_MIME = "application/vnd.google-apps.folder";
/** A token is asked for again this long before Google says it expires. */
const TOKEN_MARGIN_MS = 60_000;
/** How long the picker module may take to load before it counts as failed. */
const LOAD_TIMEOUT_MS = 15_000;
const LOAD_FAILED =
  "Couldn't load Google's folder picker. Check your connection and try again.";
const SHOWN_WRONG =
  "Google's folder picker didn't display properly. Reload the page and try again.";
/**
 * How long a picker window that first shows in the page's flow has to take
 * its place over the page before it counts as misplaced: room for a
 * stylesheet still being applied.
 */
const PLACEMENT_GRACE_MS = 150;

export interface DrivePickerConfig {
  client_id: string;
  api_key: string;
  app_id: string;
}

export interface PickedFolder {
  id: string;
  name: string;
  /** The officer's short-lived token, sent to the API once and never kept. */
  accessToken: string;
}

/** Why picking stopped without a folder, worded for the officer. */
export class DrivePickerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DrivePickerError";
  }
}

// The slices of Google's two browser libraries this file calls.
interface TokenResponse {
  access_token?: string;
  expires_in?: number | string;
  error?: string;
}
interface TokenClient {
  requestAccessToken(options?: { prompt?: string }): void;
}
interface GoogleAccounts {
  oauth2: {
    initTokenClient(config: {
      client_id: string;
      scope: string;
      callback: (response: TokenResponse) => void;
      error_callback?: (error: { type?: string }) => void;
    }): TokenClient;
  };
}
interface PickerView {
  setIncludeFolders(on: boolean): PickerView;
  setSelectFolderEnabled(on: boolean): PickerView;
  setMimeTypes(types: string): PickerView;
  setEnableDrives(on: boolean): PickerView;
}
interface PickerBuilder {
  addView(view: PickerView): PickerBuilder;
  setOAuthToken(token: string): PickerBuilder;
  setDeveloperKey(key: string): PickerBuilder;
  setAppId(id: string): PickerBuilder;
  setTitle(title: string): PickerBuilder;
  setCallback(callback: (data: PickerResponse) => void): PickerBuilder;
  build(): ShownPicker;
}
interface ShownPicker {
  setVisible(visible: boolean): void;
  dispose(): void;
}
interface PickerResponse {
  action?: string;
  docs?: { id?: string; name?: string; mimeType?: string }[];
}
interface GooglePicker {
  DocsView: new (viewId: string) => PickerView;
  PickerBuilder: new () => PickerBuilder;
  ViewId: { FOLDERS: string };
  Action: { PICKED: string; CANCEL: string };
}
interface GoogleGlobals {
  google?: { accounts?: GoogleAccounts; picker?: GooglePicker };
  gapi?: {
    load(
      name: string,
      config: {
        callback: () => void;
        onerror: () => void;
        timeout: number;
        ontimeout: () => void;
      },
    ): void;
  };
}

const scripts = new Map<string, Promise<void>>();
let ready: Promise<void> | null = null;
let token: { value: string; clientId: string; expiresAt: number } | null = null;
/** Set once a sign-in was refused, so the next one offers the account chooser. */
let chooseAccount = false;

function globals(): GoogleGlobals {
  return window as unknown as GoogleGlobals;
}

function loadScript(src: string): Promise<void> {
  const existing = scripts.get(src);
  if (existing) return existing;
  const loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scripts.delete(src);
      script.remove();
      reject(new DrivePickerError(LOAD_FAILED));
    };
    document.head.appendChild(script);
  });
  scripts.set(src, loading);
  return loading;
}

/**
 * Loads Google's sign-in and picker libraries. Called when the connect panel
 * opens, so the sign-in popup can open straight from the button press
 * (browsers block a popup opened long after the press).
 */
export function preloadDrivePicker(): Promise<void> {
  if (!ready) {
    ready = Promise.all([loadScript(GSI_SRC), loadScript(GAPI_SRC)])
      .then(
        () =>
          new Promise<void>((resolve, reject) => {
            const fail = () => reject(new DrivePickerError(LOAD_FAILED));
            globals().gapi!.load("picker", {
              callback: () => resolve(),
              onerror: fail,
              timeout: LOAD_TIMEOUT_MS,
              ontimeout: fail,
            });
          }),
      )
      .catch((error: unknown) => {
        ready = null;
        throw error;
      });
  }
  return ready;
}

function signIn(clientId: string): Promise<string | null> {
  if (
    token &&
    token.clientId === clientId &&
    token.expiresAt - TOKEN_MARGIN_MS > Date.now()
  ) {
    return Promise.resolve(token.value);
  }
  const accounts = globals().google?.accounts;
  if (!accounts) {
    return Promise.reject(
      new DrivePickerError("Google sign-in didn't load. Try again."),
    );
  }
  return new Promise((resolve, reject) => {
    const client = accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_FILE_SCOPE,
      callback: (response) => {
        if (!response.access_token) {
          // Declining the consent screen comes back as `access_denied`.
          if (response.error === "access_denied") resolve(null);
          else
            reject(
              new DrivePickerError(
                "Google sign-in didn't go through. Try again.",
              ),
            );
          return;
        }
        const lifetime = Number(response.expires_in) || 3600;
        token = {
          value: response.access_token,
          clientId,
          expiresAt: Date.now() + lifetime * 1000,
        };
        resolve(response.access_token);
      },
      error_callback: (error) => {
        if (error.type === "popup_closed") resolve(null);
        else if (error.type === "popup_failed_to_open")
          reject(
            new DrivePickerError(
              "Your browser blocked Google's sign-in window. Allow pop-ups for Frapp, then try again.",
            ),
          );
        else
          reject(
            new DrivePickerError(
              "Google sign-in didn't go through. Try again.",
            ),
          );
      },
    });
    client.requestAccessToken({
      prompt: chooseAccount ? "select_account" : "",
    });
  });
}

/**
 * Forgets the sign-in, so the next pick asks Google again and offers the
 * account chooser. Called when Frapp refuses a pick: the sign-in may have
 * expired or been revoked, or be the wrong Google account.
 */
export function forgetDrivePickerSignIn(): void {
  token = null;
  chooseAccount = true;
}

/**
 * Signs the officer in with Google and opens the picker on their folders
 * (My Drive and shared drives). Resolves null when they close either
 * window without picking.
 */
export async function pickDriveFolder(
  config: DrivePickerConfig,
): Promise<PickedFolder | null> {
  await preloadDrivePicker();
  const accessToken = await signIn(config.client_id);
  if (!accessToken) return null;
  const picker = globals().google?.picker;
  if (!picker) {
    throw new DrivePickerError(
      "Couldn't load Google's folder picker. Try again.",
    );
  }
  const folders = () =>
    new picker.DocsView(picker.ViewId.FOLDERS)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(true)
      .setMimeTypes(FOLDER_MIME);
  const earlier = new Set(document.querySelectorAll(PICKER_WINDOW));
  return new Promise((resolve, reject) => {
    let settled = false;
    let stopWatching: () => void = () => undefined;
    const settle = (finish: () => void) => {
      if (settled) return;
      settled = true;
      stopWatching();
      finish();
    };
    const shown = new picker.PickerBuilder()
      .addView(folders())
      .addView(folders().setEnableDrives(true))
      .setOAuthToken(accessToken)
      .setDeveloperKey(config.api_key)
      .setAppId(config.app_id)
      .setTitle("Pick your chapter's folder")
      .setCallback((data) => {
        if (data.action === picker.Action.CANCEL) {
          settle(() => resolve(null));
          return;
        }
        if (data.action !== picker.Action.PICKED) return;
        const doc = data.docs?.[0];
        settle(() =>
          resolve(
            doc?.id ? { id: doc.id, name: doc.name ?? "", accessToken } : null,
          ),
        );
      })
      .build();
    // Watched from before it shows, since Google may add its window to the
    // page while showing it. Settled first, so closing it can't end the pick
    // as a cancel.
    stopWatching = watchPlacement(earlier, () => {
      settle(() => reject(new DrivePickerError(SHOWN_WRONG)));
      try {
        shown.setVisible(false);
        shown.dispose();
      } catch {
        // Already gone: the page is back either way.
      }
    });
    shown.setVisible(true);
  });
}

/** The picker's window, which Google adds to the page once it is shown. */
const PICKER_WINDOW = ".picker-dialog";

/**
 * Calls `onWrong` if the picker's window stays in the page's flow instead of
 * floating over it. On staging on 2026-11-24 it did: the window and its
 * backdrop stacked under the app, the page grew several screens tall and the
 * browser scrolled to a blank bottom. Google styles that window with a
 * stylesheet its picker module adds, so that sheet not applying is the likely
 * cause; the Sentry report says whether a sheet with its rules was there.
 * Closing the picker and saying so leaves the page as it was.
 *
 * Google adds the window to the page and names it a moment later, so each
 * new child of the page is watched for its class too. `earlier` holds the
 * windows of pickers shown before, which Google keeps hidden on the page.
 * Returns a function that stops watching.
 */
function watchPlacement(
  earlier: ReadonlySet<Element>,
  onWrong: () => void,
): () => void {
  let grace: ReturnType<typeof setTimeout> | undefined;
  const check = (): boolean => {
    const shownWindow = Array.from(
      document.querySelectorAll(PICKER_WINDOW),
    ).find((element) => !earlier.has(element));
    if (!shownWindow) return false;
    if (getComputedStyle(shownWindow).position === "static") {
      grace = setTimeout(() => {
        if (getComputedStyle(shownWindow).position !== "static") return;
        Sentry.captureMessage("Google Drive picker shown in the page's flow", {
          level: "warning",
          tags: { feature: "google-drive-picker" },
          extra: pickerStylesheets(),
        });
        onWrong();
      }, PLACEMENT_GRACE_MS);
    }
    return true;
  };
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of Array.from(record.addedNodes)) {
        if (node instanceof Element) {
          observer.observe(node, {
            attributes: true,
            attributeFilter: ["class"],
          });
        }
      }
    }
    if (check()) observer.disconnect();
  });
  observer.observe(document.body, { childList: true });
  return () => {
    observer.disconnect();
    clearTimeout(grace);
  };
}

/** Which of the page's stylesheets hold the picker window's rules, for Sentry. */
function pickerStylesheets(): { withPickerRules: number; unreadable: number } {
  let withPickerRules = 0;
  let unreadable = 0;
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      if (
        Array.from(sheet.cssRules).some((rule) =>
          rule.cssText.includes(PICKER_WINDOW),
        )
      ) {
        withPickerRules += 1;
      }
    } catch {
      // Another origin's sheet, which the page may not read.
      unreadable += 1;
    }
  }
  return { withPickerRules, unreadable };
}
