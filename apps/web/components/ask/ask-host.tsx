"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  AskConversationProvider,
  aiAvailableFrom,
  askAccessFrom,
  useActiveChapterId,
  useAiChapterSettings,
  useAiConsent,
  useMyPermissions,
} from "@repo/hooks";
import type { AskAccess } from "@repo/validation";
import { AskInChannelBridge } from "@/components/ask/ask-in-channel";
import { useIsRolePreviewActive } from "@/lib/stores/role-preview-store";

/**
 * Ask Frapp's front door on web: the Ask bar, the phone's bar on web
 * (`ask-bar.tsx`; #5476, Paul's pick of 2026-11-18), at the sidebar's foot
 * from `lg` up and floating at the bottom of the page below it (#5560).
 *
 * **The conversation is a page** (`/ask`, Paul's pick of 2026-11-22: Ask on
 * web was "too small"). It opens in the main area the way the sidebar opens
 * Events, with chat beside it, and no scrim. Before that it was a 640px
 * dialog centered over the page, in Find's place and measures (#4904), a
 * reason gone once the bar replaced the field (#5476). ChatGPT, Claude and
 * Gemini give the conversation a page; Slack's assistant a full-height pane
 * beside the channel. `@Frapp` typed in a channel asks from there
 * (`ask-in-channel.tsx`, #4713).
 *
 * `AskHost` wraps the dashboard. It decides whether this member has Ask at
 * all, and it owns the conversation (`AskConversationProvider`), so the
 * thread is the same one on the Ask page and in a channel a member asked
 * `@Frapp` from, and an answer still being written when the member leaves
 * the page is there when they come back. `useAskEntry` is how the bar
 * reaches it.
 *
 * **Who gets it** is the server's answer: the server has AI, the president
 * has Ask on, and the member holds `ai:use`. Anyone else gets no bar
 * (#2259), and nor does an officer viewing the chapter as a role (#4072):
 * asking is a POST, which the preview refuses (#4504). Until all of that is
 * known there is no bar. A member who lost Ask on the Ask page (a role
 * preview began, the president turned Ask off) is taken to chat.
 */
export interface AskEntry {
  /** Whether the Ask page is the page on screen. */
  open: boolean;
  /** Opens the Ask page, or puts focus in its field when it is open. */
  openAsk: () => void;
}

/** The Ask page's route. */
export const ASK_ROUTE = "/ask";

/** The Ask page's field carries it, so the bar can hand it focus. */
export const ASK_FIELD_ATTRIBUTE = "data-ask-field";

/** Whether `pathname` is the Ask page. */
export function isAskRoute(pathname: string | null): boolean {
  return pathname === ASK_ROUTE || !!pathname?.startsWith(`${ASK_ROUTE}/`);
}

const AskEntryContext = createContext<AskEntry | null>(null);

/** The way into Ask, or null for a member without it (or outside a host). */
export function useAskEntry(): AskEntry | null {
  return useContext(AskEntryContext);
}

export function AskHost({ children }: { children: ReactNode }) {
  const consent = useAiConsent();
  const available = aiAvailableFrom(consent);
  const settings = useAiChapterSettings({ enabled: available === true });
  const permissions = useMyPermissions().data?.permissions;
  const previewing = useIsRolePreviewActive();
  const chapterId = useActiveChapterId();
  // Three answers, not two: until the reads are in, a channel's composer
  // must not post a message that names `@Frapp` (#4713), and no entry shows.
  const access: AskAccess = previewing
    ? "no"
    : askAccessFrom({
        available,
        ask: settings.data?.ask,
        permissions,
      });
  const has = access === "yes";

  const pathname = usePathname();
  const router = useRouter();
  const open = isAskRoute(pathname);
  // Only a settled "no": while the reads are out the page waits for them.
  const lost = access === "no" && open;
  useEffect(() => {
    if (lost) router.replace("/chat");
  }, [lost, router]);
  const openAsk = useCallback(() => {
    if (!open) {
      router.push(ASK_ROUTE);
      return;
    }
    document
      .querySelector<HTMLElement>(`[${ASK_FIELD_ATTRIBUTE}]`)
      ?.focus({ preventScroll: true });
  }, [open, router]);
  const entry = useMemo<AskEntry | null>(
    () => (has ? { open, openAsk } : null),
    [has, open, openAsk],
  );

  return (
    // The conversation is one chapter's: it starts over in another.
    <AskConversationProvider scope={chapterId}>
      <AskInChannelBridge access={access}>
        <AskEntryContext.Provider value={entry}>
          {children}
        </AskEntryContext.Provider>
      </AskInChannelBridge>
    </AskConversationProvider>
  );
}
