"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useActiveChapterId, useFrappClient } from "./use-frapp-client";

/**
 * A member linking their own Discord account in the active chapter, so the
 * chapter's imported Discord history they wrote shows as theirs (#2878).
 *
 * Any member, not officers only: the account is proved with Discord's own
 * sign-in, and no route links anyone but the caller. Linking and unlinking
 * change `sender_id` on imported messages server-side; imported rows never
 * arrive over Realtime, so a chat thread already in the cache shows the change
 * only on its next read. The caller decides what to drop or refetch, because this package
 * does not own the chat message cache (`@repo/chat-core`).
 */

/**
 * What Discord's sign-in came back with, read off the return address's query
 * (`?discord=<code>[&handshake=<token>]`), the same on web and the phone.
 *
 * A code, never text: the API keeps Discord's `error_description` off the
 * address, because rendering outside-chosen text in our own chrome is a
 * phishing surface. `pending` with its token is the one to confirm. Null when
 * the address carries no code, or one the API never sends (`?discord=constructor`).
 */
export type DiscordLinkReturn =
  | { kind: "confirm"; handshake: string }
  | { kind: "declined" | "expired" | "invalid" | "failed" };

export function readDiscordLinkReturn(
  params: URLSearchParams,
): DiscordLinkReturn | null {
  const outcome = params.get("discord");
  if (!outcome) return null;
  if (outcome === "pending") {
    const handshake = params.get("handshake");
    return handshake ? { kind: "confirm", handshake } : { kind: "failed" };
  }
  if (
    outcome === "declined" ||
    outcome === "expired" ||
    outcome === "invalid" ||
    outcome === "failed"
  ) {
    return { kind: outcome };
  }
  return null;
}

/** What a member reads when Discord's sign-in comes back without linking. */
export const DISCORD_LINK_RETURN_COPY: Record<
  Exclude<DiscordLinkReturn["kind"], "confirm">,
  string
> = {
  declined: "Linking was cancelled on Discord. Nothing changed.",
  expired: "That Discord link expired. Link your account again.",
  invalid: "Discord didn't finish signing you in. Link your account again.",
  failed: "Couldn't link your Discord account. Try again in a minute.",
};

/** The line after a link, by how many imported messages it attributed. */
export function discordLinkedMessage(count: number): string {
  if (count === 0) {
    return "Discord account linked. Messages you wrote under it will show as yours when your chapter imports them.";
  }
  return count === 1
    ? "Discord account linked. 1 imported message now shows as yours."
    : `Discord account linked. ${count} imported messages now show as yours.`;
}

/** The line after an unlink, by how many messages went back to their Discord name. */
export function discordUnlinkedMessage(restored: number): string {
  return restored > 0
    ? `Discord account unlinked. ${restored} imported ${restored === 1 ? "message shows" : "messages show"} under the Discord name again.`
    : "Discord account unlinked.";
}

const discordAuthorLinkKeys = {
  all: ["discord-author-link"] as const,
  mine: (chapterId: string | null) =>
    ["discord-author-link", chapterId, "mine"] as const,
};

/** The caller's link in the active chapter, plus whether linking is offered. */
export function useDiscordAuthorLink(options?: { enabled?: boolean }) {
  const client = useFrappClient();
  const chapterId = useActiveChapterId();

  return useQuery({
    queryKey: discordAuthorLinkKeys.mine(chapterId),
    queryFn: async ({ signal }) => {
      const { data, error } = await client.GET("/v1/discord/author-link", {
        signal,
      });
      if (error) throw error;
      return data;
    },
    enabled: !!chapterId && (options?.enabled ?? true),
    staleTime: 60_000,
  });
}

/**
 * Start linking. Returns Discord's authorize URL; the caller opens it.
 * Discord brings the browser back to `/preferences?section=apps&discord=…&handshake=…`,
 * or, with `client: "mobile"`, the phone to `returnUrl` (its own Settings
 * address, `Linking.createURL("preferences")`; the API refuses any other).
 */
export function useBeginDiscordAuthorLink() {
  const client = useFrappClient();
  return useMutation({
    mutationKey: ["discord-author-link", "begin-discord-author-link"],
    mutationFn: async (
      vars: { client: "web" } | { client: "mobile"; returnUrl: string },
    ) => {
      const { data, error } = await client.POST(
        "/v1/discord/author-link/start",
        {
          body:
            vars.client === "mobile"
              ? { client: "mobile", return_url: vars.returnUrl }
              : {},
        },
      );
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Spend the one-time token the callback put on the redirect. It links only for
 * the member who started the handshake, in the chapter it was started in.
 */
export function useConfirmDiscordAuthorLink() {
  const client = useFrappClient();
  const queryClient = useQueryClient();
  const chapterId = useActiveChapterId();

  return useMutation({
    mutationKey: ["discord-author-link", "confirm-discord-author-link"],
    mutationFn: async (vars: { handshake: string }) => {
      const { data, error } = await client.POST(
        "/v1/discord/author-link/confirm",
        { body: { handshake: vars.handshake } },
      );
      if (error) throw error;
      return data;
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: discordAuthorLinkKeys.mine(chapterId),
      });
    },
  });
}

export function useUnlinkDiscordAuthor() {
  const client = useFrappClient();
  const queryClient = useQueryClient();
  const chapterId = useActiveChapterId();

  return useMutation({
    mutationKey: ["discord-author-link", "unlink-discord-author"],
    mutationFn: async () => {
      const { data, error } = await client.DELETE("/v1/discord/author-link");
      if (error) throw error;
      return data;
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: discordAuthorLinkKeys.mine(chapterId),
      });
    },
  });
}
