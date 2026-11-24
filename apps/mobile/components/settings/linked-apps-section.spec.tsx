import React from "react";
import { act } from "react";
import { Alert } from "react-native";
import { create, type ReactTestRenderer } from "react-test-renderer";
import * as Linking from "expo-linking";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  google: undefined as Record<string, unknown> | undefined,
  googleError: false,
  refetch: vi.fn(),
  start: vi.fn(),
  authSession: vi.fn(),
  disconnect: vi.fn(),
  discord: undefined as Record<string, unknown> | undefined,
  discordBegin: vi.fn(),
  discordConfirm: vi.fn(),
  discordUnlink: vi.fn(),
  sheetReturnPaths: [] as (string | undefined)[],
}));

vi.mock("expo-web-browser", () => ({
  openAuthSessionAsync: state.authSession,
}));

vi.mock("@repo/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/hooks")>()),
  useGoogleCalendarStatus: () => ({
    data: state.google,
    isError: state.googleError,
    refetch: state.refetch,
  }),
  useStartGoogleCalendarConnect: () => ({
    mutateAsync: state.start,
    isPending: false,
  }),
  useConfirmGoogleCalendarConnect: () => ({ mutateAsync: vi.fn() }),
  useDisconnectGoogleCalendar: () => ({
    mutateAsync: state.disconnect,
    isPending: false,
  }),
  useDiscordAuthorLink: () => ({ data: state.discord }),
  useBeginDiscordAuthorLink: () => ({
    mutateAsync: state.discordBegin,
    isPending: false,
  }),
  useConfirmDiscordAuthorLink: () => ({
    mutateAsync: state.discordConfirm,
    isPending: false,
  }),
  useUnlinkDiscordAuthor: () => ({
    mutateAsync: state.discordUnlink,
    isPending: false,
  }),
}));

vi.mock("@/components/events/calendar-subscribe-sheet", () => ({
  CalendarSubscribeSheet: (props: { googleReturnPath?: string }) => {
    state.sheetReturnPaths.push(props.googleReturnPath);
    return null;
  },
}));

vi.mock("@/lib/supabase", () => ({
  getSupabaseClient: () => ({
    auth: {
      getUserIdentities: async () => ({
        data: {
          identities: [
            {
              provider: "apple",
              identity_data: { email: "x@privaterelay.appleid.com" },
            },
          ],
        },
        error: null,
      }),
      getUser: async () => ({ data: { user: { email: "me@frapp.live" } } }),
    },
  }),
}));

import {
  currentItemMenu,
  dismissItemMenu,
  pickItemMenuAction,
} from "@/components/item-actions-menu";
import { FrappThemeProvider } from "@/lib/theme";
import { LinkedAppsSection } from "./linked-apps-section";

const OFF = {
  available: true,
  connected: false,
  status: null,
  google_email: null,
  last_synced_at: null,
};

async function render(): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(
      <QueryClientProvider client={new QueryClient()}>
        <FrappThemeProvider>
          <LinkedAppsSection />
        </FrappThemeProvider>
      </QueryClientProvider>,
    );
  });
  return tree;
}

function row(tree: ReactTestRenderer, label: string) {
  return tree.root.find(
    (node) =>
      node.props.label === label && typeof node.props.description === "string",
  );
}

describe("Phone Settings → Linked apps (#5407)", () => {
  afterEach(() => {
    dismissItemMenu();
  });

  beforeEach(() => {
    state.google = OFF;
    state.googleError = false;
    state.refetch.mockReset();
    state.start.mockReset();
    state.start.mockResolvedValue("https://accounts.google.com/x");
    state.authSession.mockReset();
    state.authSession.mockResolvedValue({ type: "cancel" });
    state.disconnect.mockReset();
    state.discord = { available: true, linked: false };
    state.discordBegin.mockReset();
    state.discordBegin.mockResolvedValue({
      authorize_url: "https://discord.com/oauth2/authorize?x",
      expires_at: "2026-11-24T12:15:00Z",
    });
    state.discordConfirm.mockReset();
    state.discordUnlink.mockReset();
    state.sheetReturnPaths = [];
    vi.spyOn(Alert, "alert").mockImplementation(() => {});
    vi.mocked(Alert.alert).mockClear();
  });

  it("connects Google from Settings and has the sign-in come back to Settings", async () => {
    const tree = await render();
    await act(async () => {
      row(tree, "Google Calendar").props.onPress();
    });
    expect(state.start).toHaveBeenCalledWith({
      client: "mobile",
      returnUrl: expect.stringContaining("preferences"),
    });
    // The Calendar apps sheet opened from here comes back here too.
    expect(state.sheetReturnPaths.at(-1)).toBe("preferences");
  });

  it("offers Reconnect and Disconnect on an expired connection", async () => {
    state.google = { ...OFF, connected: true, status: "needs_reconnect" };
    const tree = await render();
    expect(row(tree, "Google Calendar").props.accessibilityValue).toBe(
      "Expired",
    );
    act(() => row(tree, "Google Calendar").props.onPress());
    const menu = currentItemMenu()!;
    expect(menu.title).toBe("Google Calendar");
    expect(
      menu.actions.map((action) => [action.label, !!action.destructive]),
    ).toEqual([
      ["Reconnect", false],
      ["Disconnect", true],
    ]);
    expect(state.start).not.toHaveBeenCalled();

    await act(async () => {
      pickItemMenuAction("Reconnect");
    });
    expect(state.start).toHaveBeenCalledTimes(1);
    expect(currentItemMenu()).toBeNull();
  });

  it("says a failed read and retries on a tap, rather than hiding the row", async () => {
    state.google = undefined;
    state.googleError = true;
    const tree = await render();
    act(() => row(tree, "Google Calendar").props.onPress());
    expect(state.refetch).toHaveBeenCalledTimes(1);
  });

  it("marks each sign-in method by whether the account has it", async () => {
    const tree = await render();
    // The sign-in methods load through a query that settles a few ticks later.
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }
    expect(row(tree, "Apple").props.accessibilityValue).toBe("Connected");
    expect(row(tree, "Google").props.accessibilityValue).toBe("Not connected");
    expect(row(tree, "Email").props.accessibilityValue).toBe("Not connected");
  });

  it("links Discord in the auth sheet and has it come back to Settings (#5414)", async () => {
    state.authSession.mockResolvedValue({
      type: "success",
      url: "frapp://preferences?discord=pending&handshake=11111111-1111-4111-8111-111111111111",
    });
    state.discordConfirm.mockResolvedValue({
      available: true,
      linked: true,
      discord_user_id: "1100000000000000001",
      discord_username: "jkslayer",
      linked_at: "2026-11-24T12:00:00Z",
      messages_linked: 3,
    });
    const tree = await render();
    expect(row(tree, "Discord").props.accessibilityValue).toBe("Not connected");
    await act(async () => {
      row(tree, "Discord").props.onPress();
    });

    expect(state.discordBegin).toHaveBeenCalledWith({
      client: "mobile",
      returnUrl: "frapp://preferences",
    });
    expect(state.authSession).toHaveBeenCalledWith(
      "https://discord.com/oauth2/authorize?x",
      "frapp://preferences",
    );
    expect(state.discordConfirm).toHaveBeenCalledWith({
      handshake: "11111111-1111-4111-8111-111111111111",
    });
    expect(Alert.alert).toHaveBeenCalledWith(
      "Discord linked",
      "Discord account linked. 3 imported messages now show as yours.",
    );
  });

  it("says nothing when the member cancels on Discord, and says an expired link", async () => {
    state.authSession.mockResolvedValueOnce({
      type: "success",
      url: "frapp://preferences?discord=declined",
    });
    const tree = await render();
    await act(async () => {
      row(tree, "Discord").props.onPress();
    });
    expect(state.discordConfirm).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();

    state.authSession.mockResolvedValueOnce({
      type: "success",
      url: "frapp://preferences?discord=expired",
    });
    await act(async () => {
      row(tree, "Discord").props.onPress();
    });
    expect(Alert.alert).toHaveBeenCalledWith(
      "Discord wasn't linked",
      "That Discord link expired. Link your account again.",
    );
  });

  it("offers Unlink on a linked row, confirmed before anything changes", async () => {
    state.discord = {
      available: true,
      linked: true,
      discord_user_id: "1100000000000000001",
      discord_username: "jkslayer",
    };
    state.discordUnlink.mockResolvedValue({
      unlinked: true,
      messages_restored: 1,
    });
    const tree = await render();
    expect(row(tree, "Discord").props.accessibilityValue).toBe("Connected");
    expect(row(tree, "Discord").props.description).toBe("jkslayer");

    await act(async () => {
      row(tree, "Discord").props.onPress();
    });
    expect(state.discordBegin).not.toHaveBeenCalled();
    const [title, , buttons] = vi.mocked(Alert.alert).mock.calls[0]!;
    expect(title).toBe("Unlink Discord?");
    expect(state.discordUnlink).not.toHaveBeenCalled();

    await act(async () => {
      buttons!.find((button) => button.text === "Unlink")!.onPress!();
    });
    expect(state.discordUnlink).toHaveBeenCalledTimes(1);
    expect(Alert.alert).toHaveBeenLastCalledWith(
      "Discord unlinked",
      "Discord account unlinked. 1 imported message shows under the Discord name again.",
    );
  });

  it("spends a link token once when it arrives by both the sheet and the app link", async () => {
    const url =
      "frapp://preferences?discord=pending&handshake=22222222-2222-4222-8222-222222222222";
    state.authSession.mockResolvedValue({ type: "success", url });
    state.discordConfirm.mockResolvedValue({
      linked: true,
      discord_user_id: "1100000000000000001",
      messages_linked: 0,
    });
    const tree = await render();
    await act(async () => {
      row(tree, "Discord").props.onPress();
    });
    // The system hands the same address to the app, as Android does.
    vi.mocked(Linking.useURL).mockReturnValue(url);
    await act(async () => {
      tree.update(
        <QueryClientProvider client={new QueryClient()}>
          <FrappThemeProvider>
            <LinkedAppsSection />
          </FrappThemeProvider>
        </QueryClientProvider>,
      );
    });
    vi.mocked(Linking.useURL).mockReturnValue(null);
    expect(state.discordConfirm).toHaveBeenCalledTimes(1);
  });

  it("says a second failure of the same kind too", async () => {
    state.authSession.mockResolvedValue({
      type: "success",
      url: "frapp://preferences?discord=failed",
    });
    const tree = await render();
    for (let i = 0; i < 2; i++) {
      await act(async () => {
        row(tree, "Discord").props.onPress();
      });
    }
    expect(Alert.alert).toHaveBeenCalledTimes(2);
  });
});
