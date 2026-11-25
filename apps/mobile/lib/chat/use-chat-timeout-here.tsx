/**
 * Chat timeouts on a phone chat screen (#6006, `spec/behavior/chat/README.md`
 * § Timeouts): the composer's hint while the viewer is timed out of the open
 * channel, whether a message's long-press offers Time out here, and the sheet
 * it opens. The channel screen and a message thread both read it, so the two
 * can't drift; the words are `@repo/chat-core/chat-timeout`'s, which web
 * reads too.
 */
import { useCallback, useRef, useState } from "react";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import {
  chatTimeoutNotice,
  canTimeOutSender,
  timeOutOfferedIn,
} from "@repo/chat-core/chat-timeout";
import type { ChatMessage } from "@repo/chat-core/types";
import { useMyChatTimeout, useNowDate, usePermissionList } from "@repo/hooks";
import { can } from "@repo/validation";
import {
  TimeoutMemberSheet,
  type TimeoutSheetTarget,
} from "@/components/chat/timeout-member-sheet";

export function useChatTimeoutHere(
  channel: { type?: string | null } | null | undefined,
) {
  const myTimeout = useMyChatTimeout();
  const now = useNowDate();
  const notice = chatTimeoutNotice(myTimeout.data, channel, now);
  const offered = timeOutOfferedIn(
    can("members:timeout", usePermissionList()),
    channel,
  );

  const sheetRef = useRef<BottomSheetModal>(null);
  const [target, setTarget] = useState<TimeoutSheetTarget | null>(null);
  const open = useCallback((next: TimeoutSheetTarget) => {
    setTarget(next);
    sheetRef.current?.present();
  }, []);

  /** The long-press row's target for a message, or `null` where none is offered. */
  const targetFor = useCallback(
    (
      message: Pick<ChatMessage, "sender_id" | "_status" | "is_deleted"> &
        Partial<Pick<ChatMessage, "kind" | "payload">>,
      viewerId: string | null,
      name: string | null,
    ): TimeoutSheetTarget | null =>
      message.sender_id && canTimeOutSender(message, viewerId, offered)
        ? { userId: message.sender_id, name: name ?? "this member" }
        : null,
    [offered],
  );

  return {
    /** The composer's hint while timed out here, or `null`. */
    hint: notice
      ? notice.detail
        ? `${notice.title} · ${notice.detail}`
        : notice.title
      : null,
    targetFor,
    open,
    sheet: <TimeoutMemberSheet ref={sheetRef} target={target} />,
  };
}
