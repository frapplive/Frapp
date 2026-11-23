"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  useAskStatus,
  useMyPermissions,
} from "@repo/hooks";
import type { AskAccess } from "@repo/validation";
import { AskInChannelBridge } from "@/components/ask/ask-in-channel";
import { ASK_ROUTE, isAskRoute } from "@/components/layout/shell-layout";
import { PANEL_HOST_ATTRIBUTE } from "@/components/shared/panel";
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
  /**
   * What is typed in the Ask page's field, kept here so it is still there
   * when the member leaves the page (following a source, say) and comes
   * back. Kept outside state: the field owns the value while it is up.
   */
  keptDraft: () => string;
  keepDraft: (text: string) => void;
}

/** The Ask page's field carries it, so the bar can hand it focus. */
export const ASK_FIELD_ATTRIBUTE = "data-ask-field";

const AskEntryContext = createContext<AskEntry | null>(null);

/** The way into Ask, or null for a member without it (or outside a host). */
export function useAskEntry(): AskEntry | null {
  return useContext(AskEntryContext);
}

const AskPendingContext = createContext(false);

/**
 * Whether it is not yet known if this member has Ask: the reads are out, or
 * one failed and is being retried. The Ask page shows it is loading.
 */
export function useAskPending(): boolean {
  return useContext(AskPendingContext);
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
  // Read whether answers are being saved as soon as Ask is known, so the
  // saved line is in place when the page opens rather than arriving under
  // the field after the first question could already have gone.
  useAskStatus({ enabled: has });
  const draft = useRef("");
  const keptDraft = useCallback(() => draft.current, []);
  const keepDraft = useCallback((text: string) => {
    draft.current = text;
  }, []);

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
    // Not under a form an answer docked over the page: typing would go
    // into a field the member can't see.
    if (document.querySelector(`[${PANEL_HOST_ATTRIBUTE}] [data-docked-panel]`))
      return;
    document
      .querySelector<HTMLElement>(`[${ASK_FIELD_ATTRIBUTE}]`)
      ?.focus({ preventScroll: true });
  }, [open, router]);
  const entry = useMemo<AskEntry | null>(
    () => (has ? { open, openAsk, keptDraft, keepDraft } : null),
    [has, open, openAsk, keptDraft, keepDraft],
  );

  return (
    // The conversation is one chapter's: it starts over in another.
    <AskConversationProvider scope={chapterId}>
      <AskInChannelBridge access={access}>
        <AskEntryContext.Provider value={entry}>
          <AskPendingContext.Provider value={access === "unknown"}>
            {children}
          </AskPendingContext.Provider>
        </AskEntryContext.Provider>
      </AskInChannelBridge>
    </AskConversationProvider>
  );
}
