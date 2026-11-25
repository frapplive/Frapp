"use client";

import { useChapterChatLevel, useSetChapterChatLevel } from "@repo/hooks";
import {
  CHAT_CHAPTER_LEVEL_OPTIONS,
  type ChatChapterLevel,
} from "@repo/validation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SettingsRow } from "@/components/shared/settings-row";
import { useToast } from "@/lib/hooks/use-toast";
import { useNetwork } from "@/lib/providers/network-provider";
import { getErrorMessage } from "@/lib/utils";

/** The picker's id: settings search lands on it (`chat-notifications`). */
const PICKER_ID = "chat-level-legend";

/**
 * Settings → Notifications → Chat messages, on web (#4124, the web half of
 * #3840): the member's chapter-wide chat level, "All messages" or "Mentions
 * and DMs only". Slack's "Mentions & DMs only" and Discord's server-wide "Only
 * @mentions" are the same choice. The phone's is the Notifications page's row
 * and its `ChatLevelSheet`; the words for both come from `@repo/validation`.
 *
 * Two options, no Off: the owner dropped the switch that silenced all of chat
 * on 2026-11-06, and Shawn kept that on 2026-11-11.
 *
 * A Settings row whose value opens the picker (rulebook § 9; #6032 replaced
 * the two bordered radio cards), each option keeping its description inside
 * the menu. A pick saves at once. Nothing is shown as picked until the level
 * is read: "All messages" as a stand-in would state a level the server may
 * not hold.
 */
export function ChatLevelRow() {
  const { toast } = useToast();
  const { isOffline } = useNetwork();
  const levelQuery = useChapterChatLevel();
  const setLevel = useSetChapterChatLevel();
  const level = levelQuery.data;
  const unknown = level === undefined;
  // While the write is in flight the pending level shows as checked, so the
  // radio moves at the click rather than after the round trip. A failure
  // drops `variables` back to the server's level and says so in a toast.
  const shown: ChatChapterLevel | undefined = setLevel.isPending
    ? setLevel.variables
    : level;

  function pick(next: ChatChapterLevel) {
    if (unknown || next === shown || setLevel.isPending) return;
    if (isOffline) {
      // Refused, not queued: see the switches' `aria-disabled` note in
      // `chapter-alerts-section.tsx`.
      toast({
        title: "You're offline",
        description:
          "Reconnect to change your chat notifications. Nothing has been changed.",
      });
      return;
    }
    setLevel.mutateAsync(next).catch((error: unknown) =>
      toast({
        title: "Couldn't change chat notifications",
        description: getErrorMessage(
          error,
          "Your setting is unchanged. Try again or check your connection.",
        ),
        variant: "destructive",
      }),
    );
  }

  let note: React.ReactNode = null;
  if (levelQuery.isError && unknown) {
    note = (
      <>
        Couldn&apos;t load this setting.{" "}
        <button
          type="button"
          className="font-medium text-foreground underline underline-offset-4"
          onClick={() => void levelQuery.refetch()}
        >
          Retry
        </button>
      </>
    );
  } else if (isOffline && unknown) {
    note = "Reconnect to load this setting.";
  }

  return (
    <SettingsRow
      label="Chat messages"
      description={note}
      control={
        <Select
          value={shown ?? ""}
          disabled={unknown || setLevel.isPending}
          onValueChange={(next) => pick(next as ChatChapterLevel)}
        >
          <SelectTrigger
            id={PICKER_ID}
            className="w-56 max-w-[50vw]"
            aria-label="Chat messages"
          >
            <SelectValue
              placeholder={levelQuery.isLoading ? "Loading…" : "—"}
            />
          </SelectTrigger>
          <SelectContent align="end">
            {CHAT_CHAPTER_LEVEL_OPTIONS.map((option) => (
              <SelectItem
                key={option.level}
                value={option.level}
                description={option.description}
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    />
  );
}
