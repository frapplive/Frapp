// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { captureMessage } = vi.hoisted(() => ({ captureMessage: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureMessage }));

/**
 * Google's two browser libraries, faked: the sign-in's token client and the
 * picker, so each branch of `google-drive-picker.ts` runs without Google.
 */
type TokenConfig = {
  callback: (response: Record<string, unknown>) => void;
  error_callback?: (error: { type?: string }) => void;
};
type PickerCallback = (data: Record<string, unknown>) => void;

const CONFIG = {
  client_id: "661618060468-abc.apps.googleusercontent.com",
  api_key: "AIza-picker",
  app_id: "661618060468",
};

let tokenReply: (config: TokenConfig) => void;
let pickerReply: (callback: PickerCallback) => void;
let gapiLoad: (config: {
  callback: () => void;
  onerror: () => void;
  ontimeout: () => void;
}) => void;
const requestAccessToken = vi.fn();
const dispose = vi.fn();
const setVisible = vi.fn();
const builder = {
  addView: vi.fn(),
  setOAuthToken: vi.fn(),
  setDeveloperKey: vi.fn(),
  setAppId: vi.fn(),
  setTitle: vi.fn(),
  setCallback: vi.fn(),
  build: vi.fn(),
};

function installGoogle() {
  const view = {
    setIncludeFolders: () => view,
    setSelectFolderEnabled: () => view,
    setMimeTypes: () => view,
    setEnableDrives: () => view,
  };
  let callback: PickerCallback = () => undefined;
  for (const key of Object.keys(builder) as (keyof typeof builder)[]) {
    builder[key].mockImplementation(() => builder);
  }
  builder.setCallback.mockImplementation((cb: PickerCallback) => {
    callback = cb;
    return builder;
  });
  builder.build.mockImplementation(() => ({
    setVisible: (visible: boolean) => {
      setVisible(visible);
      if (visible) pickerReply(callback);
    },
    dispose,
  }));
  Object.assign(window, {
    google: {
      accounts: {
        oauth2: {
          initTokenClient: (config: TokenConfig) => ({
            requestAccessToken: (options: unknown) => {
              requestAccessToken(options);
              tokenReply(config);
            },
          }),
        },
      },
      picker: {
        DocsView: function DocsView() {
          return view;
        },
        PickerBuilder: function PickerBuilder() {
          return builder;
        },
        ViewId: { FOLDERS: "folders" },
        Action: { PICKED: "picked", CANCEL: "cancel" },
      },
    },
    gapi: {
      load: (_name: string, config: Parameters<typeof gapiLoad>[0]) =>
        gapiLoad(config),
    },
  });
}

async function load() {
  vi.resetModules();
  return import("./google-drive-picker");
}

describe("pickDriveFolder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Each <script> Google's libraries come from "loads" at once.
    vi.spyOn(document.head, "appendChild").mockImplementation((node) => {
      queueMicrotask(() =>
        (node as HTMLScriptElement).onload?.(new Event("load")),
      );
      return node;
    });
    installGoogle();
    gapiLoad = (config) => config.callback();
    tokenReply = (config) =>
      config.callback({ access_token: "token-1", expires_in: 3599 });
    pickerReply = (callback) => {
      // Google calls back once as the picker opens, before anything is picked.
      callback({ action: "loaded" });
      callback({
        action: "picked",
        docs: [{ id: "folder-9", name: "Chapter Drive" }],
      });
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const node of document.querySelectorAll(".picker-dialog")) {
      node.remove();
    }
  });

  /**
   * Google's picker window: `static` is where it sits without Google's
   * stylesheet, in the page's flow; `absolute` floats over the page.
   */
  function pickerWindow(position: "absolute" | "static", named = true) {
    const node = document.createElement("div");
    node.className = named ? "picker picker-dialog" : "picker";
    node.style.position = position;
    document.body.append(node);
    return node;
  }

  it("signs in for drive.file, then returns the picked folder with the token", async () => {
    const { pickDriveFolder } = await load();
    await expect(pickDriveFolder(CONFIG)).resolves.toEqual({
      id: "folder-9",
      name: "Chapter Drive",
      accessToken: "token-1",
    });
    expect(builder.setOAuthToken).toHaveBeenCalledWith("token-1");
    expect(builder.setDeveloperKey).toHaveBeenCalledWith("AIza-picker");
    expect(builder.setAppId).toHaveBeenCalledWith("661618060468");
  });

  it("answers null when the officer cancels the picker", async () => {
    pickerReply = (callback) => callback({ action: "cancel" });
    const { pickDriveFolder } = await load();
    await expect(pickDriveFolder(CONFIG)).resolves.toBeNull();
  });

  it("answers null when the officer closes Google's sign-in window", async () => {
    tokenReply = (config) => config.error_callback?.({ type: "popup_closed" });
    const { pickDriveFolder } = await load();
    await expect(pickDriveFolder(CONFIG)).resolves.toBeNull();
    expect(builder.build).not.toHaveBeenCalled();
  });

  it("says a blocked sign-in window was blocked", async () => {
    tokenReply = (config) =>
      config.error_callback?.({ type: "popup_failed_to_open" });
    const { pickDriveFolder } = await load();
    await expect(pickDriveFolder(CONFIG)).rejects.toThrow(/blocked/);
  });

  it("reuses a live sign-in, until a refusal forgets it and asks with the account chooser", async () => {
    const { pickDriveFolder, forgetDrivePickerSignIn } = await load();
    await pickDriveFolder(CONFIG);
    await pickDriveFolder(CONFIG);
    expect(requestAccessToken).toHaveBeenCalledTimes(1);
    expect(requestAccessToken).toHaveBeenLastCalledWith({ prompt: "" });

    forgetDrivePickerSignIn();
    await pickDriveFolder(CONFIG);
    expect(requestAccessToken).toHaveBeenCalledTimes(2);
    expect(requestAccessToken).toHaveBeenLastCalledWith({
      prompt: "select_account",
    });
  });

  it("fails, rather than waiting for ever, when the picker module won't load, and can try again", async () => {
    gapiLoad = (config) => config.ontimeout();
    const { pickDriveFolder } = await load();
    await expect(pickDriveFolder(CONFIG)).rejects.toThrow(
      /Couldn't load Google's folder picker/,
    );
    gapiLoad = (config) => config.callback();
    await expect(pickDriveFolder(CONFIG)).resolves.toMatchObject({
      id: "folder-9",
    });
  });

  it("closes a picker whose window sits in the page instead of over it, and says so", async () => {
    // On staging (2026-11-24) the window sat in the page's flow: the page
    // grew screens tall and scrolled to a blank bottom.
    pickerReply = () => {
      pickerWindow("static");
    };
    const { pickDriveFolder } = await load();
    await expect(pickDriveFolder(CONFIG)).rejects.toThrow(
      /didn't display properly/,
    );
    expect(setVisible).toHaveBeenLastCalledWith(false);
    expect(dispose).toHaveBeenCalled();
    expect(captureMessage).toHaveBeenCalledWith(
      "Google Drive picker shown in the page's flow",
      expect.objectContaining({ level: "warning" }),
    );
  });

  it("sees a window Google names only after adding it", async () => {
    pickerReply = () => {
      const node = pickerWindow("static", false);
      setTimeout(() => node.classList.add("picker-dialog"), 0);
    };
    const { pickDriveFolder } = await load();
    await expect(pickDriveFolder(CONFIG)).rejects.toThrow(
      /didn't display properly/,
    );
  });

  it("gives a window a moment to take its place before calling it misplaced", async () => {
    let pick: PickerCallback = () => undefined;
    pickerReply = (callback) => {
      pick = callback;
      const node = pickerWindow("static");
      setTimeout(() => (node.style.position = "absolute"), 20);
    };
    const { pickDriveFolder } = await load();
    const picked = pickDriveFolder(CONFIG);
    await new Promise((resolve) => setTimeout(resolve, 300));
    pick({
      action: "picked",
      docs: [{ id: "folder-9", name: "Chapter Drive" }],
    });
    await expect(picked).resolves.toMatchObject({ id: "folder-9" });
    expect(dispose).not.toHaveBeenCalled();
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it("leaves a picker that floats over the page open, and ignores an earlier picker's window", async () => {
    pickerWindow("static");
    let pick: PickerCallback = () => undefined;
    pickerReply = (callback) => {
      pick = callback;
      queueMicrotask(() => pickerWindow("absolute"));
    };
    const { pickDriveFolder } = await load();
    const picked = pickDriveFolder(CONFIG);
    await vi.waitFor(() =>
      expect(document.querySelectorAll(".picker-dialog")).toHaveLength(2),
    );
    await new Promise((resolve) => setTimeout(resolve, 300));
    pick({
      action: "picked",
      docs: [{ id: "folder-9", name: "Chapter Drive" }],
    });
    await expect(picked).resolves.toMatchObject({ id: "folder-9" });
    expect(dispose).not.toHaveBeenCalled();
  });

  it("stops watching once the pick ends, so a later window can't close it", async () => {
    const { pickDriveFolder } = await load();
    await expect(pickDriveFolder(CONFIG)).resolves.toMatchObject({
      id: "folder-9",
    });
    pickerWindow("static");
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(dispose).not.toHaveBeenCalled();
    expect(captureMessage).not.toHaveBeenCalled();
  });
});
