import { useEffect, useRef } from "react";
import { Alert } from "react-native";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useQueryClient } from "@tanstack/react-query";
import { refreshTimelinesForDiscordAuthor } from "@repo/chat-core/discord-author-reads";
import {
  DISCORD_LINK_RETURN_COPY,
  discordLinkedMessage,
  discordUnlinkedMessage,
  errorCopy,
  readDiscordLinkReturn,
  useBeginDiscordAuthorLink,
  useConfirmDiscordAuthorLink,
  useDiscordAuthorLink,
  useUnlinkDiscordAuthor,
} from "@repo/hooks";
import { confirmAlert } from "@/lib/minutes/meetings-on";

/**
 * Link tokens this app has already spent, for the life of the process. The
 * same return address can arrive twice (the sign-in sheet's result, and the
 * system handing it to the app through `Linking.useURL`, which also hands it
 * to every later mount), and the token is single use, so a second spend would
 * report a failure over a link that worked.
 */
const spentHandshakes = new Set<string>();
/** Return addresses already reported, so a cancel isn't said twice either. */
const reportedReturns = new Set<string>();

/** Server-written refusals ("already linked to another member") read as said. */
const SERVER_WRITES = { serverWritesForMembers: true } as const;

/**
 * Discord's link, finish and unlink on the phone (#5414), for Settings →
 * Linked apps, the way `useGoogleCalendarConnection` runs Google's. Linking
 * opens Discord's sign-in in the system auth sheet; Discord comes back to
 * `returnPath` (Settings' own address) with a one-time token, which is spent
 * here from the member's own session, exactly once. Only the member who
 * started the link can spend it (the API checks), so a token another app
 * caught on the way back links nothing.
 *
 * Linking and unlinking change on the server who an imported message's sender
 * is, so afterwards the chat threads holding that account's messages are read
 * again (`refreshTimelinesForDiscordAuthor`), as on web.
 */
export function useDiscordLinkConnection({
  returnPath,
}: {
  returnPath: string;
}) {
  const link = useDiscordAuthorLink();
  const begin = useBeginDiscordAuthorLink();
  const confirm = useConfirmDiscordAuthorLink();
  const unlinkMutation = useUnlinkDiscordAuthor();
  const queryClient = useQueryClient();
  const returnUrl = Linking.useURL();

  // The link as of now, for the confirm: a link to a different account
  // replaces the one held, whose messages go back to their Discord name too.
  const linkedRef = useRef(link.data);
  useEffect(() => {
    linkedRef.current = link.data;
  }, [link.data]);

  /** Finish a sign-in Discord sent back, once per address and per token. */
  function finish(url: string) {
    const query = url.includes("?") ? url.slice(url.indexOf("?") + 1) : "";
    const outcome = readDiscordLinkReturn(new URLSearchParams(query));
    if (!outcome || reportedReturns.has(url)) return;
    reportedReturns.add(url);
    if (outcome.kind !== "confirm") {
      // Cancelling is the member's own choice: nothing to tell them.
      if (outcome.kind !== "declined") {
        Alert.alert(
          "Discord wasn't linked",
          DISCORD_LINK_RETURN_COPY[outcome.kind],
        );
      }
      return;
    }
    if (spentHandshakes.has(outcome.handshake)) return;
    spentHandshakes.add(outcome.handshake);
    void confirm
      .mutateAsync({ handshake: outcome.handshake })
      .then((result) => {
        const linked = result?.discord_user_id ?? null;
        const before = linkedRef.current;
        void refreshTimelinesForDiscordAuthor(
          queryClient,
          linked === null || before === undefined
            ? null
            : [
                linked,
                ...(before.discord_user_id ? [before.discord_user_id] : []),
              ],
        );
        Alert.alert(
          "Discord linked",
          discordLinkedMessage(result?.messages_linked ?? 0),
        );
      })
      .catch((error: unknown) =>
        Alert.alert(
          "Discord wasn't linked",
          errorCopy(error, DISCORD_LINK_RETURN_COPY.failed, SERVER_WRITES),
        ),
      );
  }

  useEffect(() => {
    if (returnUrl) finish(returnUrl);
    // finish reads only module state, refs and stable mutations.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returnUrl]);

  async function connect() {
    const back = Linking.createURL(returnPath);
    try {
      const result = await begin.mutateAsync({
        client: "mobile",
        returnUrl: back,
      });
      if (!result?.authorize_url) {
        throw new Error("The API did not return a Discord link.");
      }
      const session = await WebBrowser.openAuthSessionAsync(
        result.authorize_url,
        back,
      );
      if (session.type === "success") finish(session.url);
    } catch (error) {
      Alert.alert(
        "Couldn't open Discord",
        errorCopy(error, "Try again in a moment.", SERVER_WRITES),
      );
    }
  }

  async function confirmUnlink() {
    const ok = await confirmAlert({
      title: "Unlink Discord?",
      body: "Your imported Discord messages go back to showing your Discord name. You can link again any time.",
      confirmLabel: "Unlink",
      destructive: true,
    });
    if (!ok) return;
    // Read before the unlink: its response doesn't name the account.
    const discordUserId = link.data?.discord_user_id ?? null;
    try {
      const result = await unlinkMutation.mutateAsync();
      void refreshTimelinesForDiscordAuthor(
        queryClient,
        discordUserId === null ? null : [discordUserId],
      );
      Alert.alert(
        "Discord unlinked",
        discordUnlinkedMessage(result?.messages_restored ?? 0),
      );
    } catch (error) {
      Alert.alert(
        "Couldn't unlink Discord",
        errorCopy(error, "Try again in a moment.", SERVER_WRITES),
      );
    }
  }

  return {
    link,
    connect,
    confirmUnlink,
    linking: confirm.isPending,
    busy: begin.isPending || confirm.isPending || unlinkMutation.isPending,
  };
}
