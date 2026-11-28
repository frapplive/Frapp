"use client";

import { Suspense, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { isChatRoute } from "@/components/layout/shell-layout";
import { ChatProvider } from "@/lib/chat/chat-provider";
import { ChatShell } from "./chat-shell";
import { FormFillHost } from "./form-fill-dialog";
import { FormResponsesHost } from "./form-responses-dialog";
import { ChatRouteSkeleton } from "@/components/chat/chat-route-skeleton";
import {
  CHAT_CHANNEL_PARAM,
  CHAT_MESSAGE_PARAM,
  CHAT_THREAD_PARAM,
} from "@/lib/chat/chat-links";
import type { ChatView } from "@/lib/chat/chat-links";
import { NEW_INTENT_PARAM } from "@/components/layout/new-intent";

/**
 * Reads `?channel=<id>&thread=<id>&message=<id>` so a caller (the member directory's
 * Message action, a notification, a command-palette search hit) can
 * navigate here with a channel — and optionally a specific message —
 * pre-selected. `useSearchParams` requires a Suspense boundary (matches
 * `directory-page.tsx`'s `?tab=` pattern).
 *
 * Only a chat URL names chat's target (#3779). The panel stays mounted beside
 * every tool page, and a page's own `?channel=`
 * (`/settings?tab=chat&page=chat-admin&channel=` is the channel editor's) must not steer it. Off a chat URL the panel keeps the
 * target it last had, so going from a linked message to a tool page does not
 * read as the link being cleared. On a chat URL the shell also writes the
 * address as the conversation moves (`addressed`, #6041).
 */
function ChatPageContent({
  defaultMembersHidden,
  toolBeside,
  onClose,
  view,
  onPick,
  shown,
}: {
  defaultMembersHidden: boolean;
  toolBeside: boolean;
  onClose?: () => void;
  view: ChatView;
  onPick?: (kind: ChatView, channelId: string) => void;
  shown: boolean;
}) {
  const searchParams = useSearchParams();
  const onChatUrl = isChatRoute(usePathname());
  const liveChannel = searchParams.get(CHAT_CHANNEL_PARAM);
  const liveMessage = searchParams.get(CHAT_MESSAGE_PARAM);
  const liveThread = searchParams.get(CHAT_THREAD_PARAM);
  const [target, setTarget] = useState({
    channel: onChatUrl ? liveChannel : null,
    message: onChatUrl ? liveMessage : null,
    thread: onChatUrl ? liveThread : null,
  });
  if (
    onChatUrl &&
    (target.channel !== liveChannel ||
      target.message !== liveMessage ||
      target.thread !== liveThread)
  ) {
    setTarget({ channel: liveChannel, message: liveMessage, thread: liveThread });
  }

  return (
    <ChatProvider>
      {/* The full-page form a form card opens, and its creator's Responses
          (#3926), hosted above the shell so a card the timeline scrolls away
          can't close either mid-use. */}
      <FormFillHost>
        <FormResponsesHost>
          <ChatShell
            initialChannelId={target.channel}
            initialMessageId={target.message}
            initialThreadId={target.thread}
            addressed={onChatUrl}
            defaultMembersHidden={defaultMembersHidden}
            toolBeside={toolBeside}
            onClose={onClose}
            view={view}
            onPick={onPick}
            shown={shown}
            newMessageAsked={
              onChatUrl && searchParams.get(NEW_INTENT_PARAM) === "1"
            }
          />
        </FormResponsesHost>
      </FormFillHost>
    </ChatProvider>
  );
}

/**
 * The chat panel's contents, which the dashboard shell hosts on every route
 * (`dashboard-shell.tsx`, #3779): alone on `/chat`, as the Messages page,
 * docked beside the open tool page, and out of sight where there is no room,
 * since the sidebar's channel list is this panel's own (#5946). Mounts the chat hot-path provider
 * (outbox flush + persisted first chunk; the realtime manager is the
 * dashboard shell's, `use-chat-realtime-binding.ts`) and renders the chat
 * shell. The provider lives inside the dashboard tree so it sees the existing
 * QueryClient, api-sdk client, and active chapter id.
 */
export function ChatPage({
  defaultMembersHidden = false,
  toolBeside = false,
  onClose,
  view = "channels",
  onPick,
  shown = true,
}: {
  /** The member list's remembered state, read by the layout on the server. */
  defaultMembersHidden?: boolean;
  /** Open beside a tool page (`ChatShell`'s prop of the same name). */
  toolBeside?: boolean;
  /** Closes the chat panel (`ChatShell`'s prop of the same name). */
  onClose?: () => void;
  /** The conversation alone, or the Messages page (`ChatShell`'s prop). */
  view?: ChatView;
  /** A row was picked from a list (`ChatShell`'s prop of the same name). */
  onPick?: (kind: ChatView, channelId: string) => void;
  /** Whether the conversation is on screen (`ChatShell`'s prop). */
  shown?: boolean;
} = {}) {
  /*
    This boundary's fallback must never be what the server sends.

    `1s` puts "composer shell" in the 0ms set as "static markup in the RSC
    payload", and `ComposerShell` (#2176) is only focusable before hydration
    because it really is in that payload. A Suspense boundary around a
    `useSearchParams()` consumer is exactly the thing Next.js resolves to its
    fallback on a *static* prerender — which would ship the skeleton instead
    of the shell, and the budget would go quietly back to being hydration-gated
    with every test still green.

    It does not, because `app/(dashboard)/layout.tsx` awaits `cookies()` for the
    nav-collapse and chat preferences, which opts this whole segment into dynamic
    rendering. That is a real dependency between two files that never mention
    each other, and nothing enforces it: if that `cookies()` read ever moves or
    is memoized away, check the `/chat` SSR payload still contains the
    composer's `<textarea>` before assuming this still holds.
  */
  return (
    <Suspense fallback={<ChatRouteSkeleton />}>
      <ChatPageContent
        defaultMembersHidden={defaultMembersHidden}
        toolBeside={toolBeside}
        onClose={onClose}
        view={view}
        onPick={onPick}
        shown={shown}
      />
    </Suspense>
  );
}
