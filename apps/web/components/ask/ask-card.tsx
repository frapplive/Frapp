"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import {
  useActStatus,
  useAsk,
  useAskStatus,
  useAskSuggestions,
  useAskStarter,
  useMyPermissions,
  useViewerDisplayName,
  useViewerUserId,
  type AskOptions,
} from "@repo/hooks";
import {
  ASK_COPY,
  ASK_QUESTION_MAX_LENGTH,
  askSavedLine,
  can,
  formatAiAnswerDate,
  type AskSuggestion,
} from "@repo/validation";
import { useAiConsentGate } from "@/components/ai/meet-frapp-ai";
import { AskTurn } from "@/components/ask/ask-answer";
import { ASK_STARTER_STORE, AskOpening } from "@/components/ask/ask-opening";
import { useSharedAskCardEdits } from "@/components/ask/ask-in-channel";
import {
  AskCardEditsContext,
  type AskCardEditsStore,
} from "@/components/ask/ask-proposal";
import { Button } from "@/components/ui/button";
import { ASK_FIELD_ATTRIBUTE, useAskEntry } from "@/components/ask/ask-host";
import { PageActions } from "@/components/layout/page-actions";
import { NewButton } from "@/components/ui/new-button";
import { PANEL_HOST_ATTRIBUTE } from "@/components/shared/panel";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { JumpToLatestButton } from "@/components/chat/jump-to-latest-button";
import { prefersReducedMotion } from "@/components/chat/use-rail-flip";
import { useGrowWithText } from "@/lib/hooks/use-grow-with-text";

/**
 * Ask Frapp on web (#450, #451, #718): one conversation with Frapp, the
 * body of the Ask page (`app/(dashboard)/ask`). The member types in one
 * field; Frapp answers from the chapter's sources, each claim marked with
 * the source it came from, or shows a card for something they asked to have
 * done.
 *
 * **A page, chat beside it** (Paul's pick of 2026-11-22, after "too small
 * and not smooth"). The Ask bar opens it in the main area as the sidebar
 * opens Events, beside chat at the width the member set, with no scrim, so
 * a member can ask while reading a channel. The thread and the field keep
 * to one centred column of at most 720px, the field pinned under it, as
 * ChatGPT, Claude and Gemini draw theirs; on a narrow window it is the whole
 * page. The page's header holds its title, New conversation once there is a
 * turn, and the X; Escape on the page closes it, as on every page beside
 * chat (`dashboard-shell.tsx`). Until then it was a 640px dialog in Find's
 * place and measures over a dimmed app (#4904).
 *
 * A source, a channel an answer names and the page a confirmed card leaves
 * for are ordinary links: following one leaves the page, and the Ask bar
 * comes back to the same thread. An event form opened from an answer docks
 * over this page (`Panel`'s `docked="here"`).
 *
 * The conversation is owned by `AskHost` above the whole dashboard, so it is
 * the same thread on every visit, and a question still being answered when
 * the member leaves goes on being answered.
 *
 * **One conversation, one field** (2026-11-13, owner; `spec/behavior/ai.md`
 * § One conversation). There were two sides here, Ask and Do, under a
 * switch, and each showed one exchange at a time. ChatGPT, Claude, Slack's
 * assistant and Notion AI all take a question and a request in the same
 * field and let the assistant work out which it is, and all keep the thread
 * on screen so a follow-up can lean on what came before. So the page is a
 * thread: each turn stays, the turns before a question are sent with it,
 * and a member who may have Frapp act gets a card to confirm when what they
 * typed asks for something to be done. A member who may not gets answers
 * only, from the same field. New conversation clears the thread.
 *
 * The thread is this sitting's: it survives leaving and coming back, and is
 * gone on reload until kept conversations ship (#4704).
 *
 * **It opens on the member's own account** (#4700, owner 2026-11-13: "not
 * just be like some presets"). Before the first turn the page offers up to
 * three questions and one request the server built from what this member's
 * account holds now: their next event, their open tasks, minutes they can
 * read, their points. There is no fixed list; a member with nothing to ask
 * about sees the two lines of the opening and the field. They are read when
 * the page opens and fade in under the opening words, where nothing sits
 * below them to move. A tapped question is sent as a suggestion, never as
 * words the member typed (`useAsk`'s `suggested`).
 *
 * **Consent is asked at the first question**, not when the page opens
 * (`useAiConsentGate`; `ai.md` § Consent). The question shows in the thread
 * first, so the sheet opens over the words it is about. The server checks
 * again.
 *
 * **The saved line.** While the beta diagnostics window is on for this
 * chapter, a line above the field says questions and answers are saved and
 * until when, where the member reads it as they type, and only then does a
 * question carry `saved_notice_shown`: the server keeps nothing from a
 * client that did not show it. The status is read again each time the page
 * opens, so the line is true at the moment of asking.
 */

/** Within this of the bottom, the member is reading the newest words. */
const FOLLOW_SLACK_PX = 80;

/** The thread's bottom padding (`pb-4`), kept under the newest words. */
const THREAD_PAD_BOTTOM = 16;

/** Keys that scroll a focused view, so pressing one is the member's scroll. */
const SCROLL_KEYS = new Set(["ArrowUp", "PageUp", "Home", " "]);

/** Where `child` starts inside the scrolling `view`, in its scroll space. */
function offsetIn(view: HTMLElement, child: HTMLElement): number {
  return (
    child.getBoundingClientRect().top -
    view.getBoundingClientRect().top +
    view.scrollTop
  );
}

/**
 * The Ask page's body: the conversation for a member with Ask, and nothing
 * while that is being read or for anyone else (`AskHost` takes a member who
 * lost Ask to chat).
 */
export function AskPage() {
  return useAskEntry() ? <AskConversation /> : null;
}

export function AskConversation() {
  const {
    exchanges,
    working,
    ask,
    retry,
    setProposal,
    resolveProposal,
    resolveCard,
    reset,
  } = useAsk();
  const status = useAskStatus();
  const refetchStatus = status.refetch;
  const { ensureConsent, consentDialog } = useAiConsentGate();
  // No request for a member without `ai:act`: the server would answer 403.
  const permissions = useMyPermissions().data?.permissions;
  const mayAct = !!permissions && can("ai:act", permissions);
  const actions = useActStatus({ enabled: mayAct }).data ?? null;
  const canAct = actions !== null && actions.length > 0;
  const { suggestions } = useAskSuggestions({ enabled: true });
  const displayName = useViewerDisplayName();
  const viewerId = useViewerUserId();
  const opening = useAskStarter({
    userId: viewerId,
    open: true,
    empty: exchanges.length === 0,
    canAct,
    store: ASK_STARTER_STORE,
  });
  // What was changed on waiting cards, kept while the card is closed, and
  // shared with the same card drawn in a channel it was asked from.
  const sharedEdits = useSharedAskCardEdits();
  const [ownEdits] = useState<AskCardEditsStore>(() => new Map());
  const cardEdits = sharedEdits ?? ownEdits;
  const [draft, setDraft] = useState("");
  const field = useRef<HTMLTextAreaElement>(null);

  const savedUntil = status.data?.saved_until ?? null;
  // The server sends a date only while the window is open.
  const saving = savedUntil !== null;
  const last = exchanges.at(-1);

  // Whether answers are being saved can change while the app sits open.
  useEffect(() => {
    void refetchStatus({ cancelRefetch: false });
  }, [refetchStatus]);

  // The field takes focus when the page opens, as ChatGPT's and Claude's do.
  useEffect(() => {
    field.current?.focus({ preventScroll: true });
  }, []);

  // The field grows with what is typed.
  useGrowWithText(field, draft, true);

  // Where the view sits (Paul, 2026-11-22: reopening landed at the start of
  // the conversation, and the thread was "not smooth").
  //
  // - The end is the newest turn's last words, never the blank room under
  //   them: `target()` puts that turn's question at the top when its answer
  //   fits, and its last line at the bottom when it doesn't.
  // - While the view is pinned it stays at that end as the turn grows or a
  //   card fills in. It is pinned on opening, on a new question (which
  //   scrolls its question to the top, as ChatGPT and Claude place a new
  //   turn) and by Jump to latest; the member scrolling up unpins it, so
  //   the line they are reading never moves under them.
  // - Everything here starts from the scroller's own ref. (In the dialog this
  //   was, Radix's portal drew nothing in the render that opened it, so an
  //   effect keyed on `open` found no scroller and never scrolled.)
  // - An opening with no turn yet is never scrolled: it reads from the top.
  const scroller = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState<HTMLDivElement | null>(null);
  const attachScroller = useCallback((element: HTMLDivElement | null) => {
    scroller.current = element;
    setView(element);
  }, []);
  const newest = useRef<HTMLDivElement>(null);
  const newestWords = useRef<HTMLDivElement>(null);
  const thread = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const placed = useRef<string | null>(null);
  const [behind, setBehind] = useState(false);
  // The view's height, which the newest turn fills at least, so its
  // question can reach the top before there is an answer.
  const [room, setRoom] = useState(0);

  const target = useCallback((): number | null => {
    const element = scroller.current;
    const turn = newest.current;
    const words = newestWords.current;
    if (!element || !turn || !words) return null;
    const top = offsetIn(element, turn);
    const end = offsetIn(element, words) + words.offsetHeight;
    return Math.max(top, end - element.clientHeight + THREAD_PAD_BOTTOM);
  }, []);

  const settle = useCallback(() => {
    const element = scroller.current;
    const words = newestWords.current;
    if (!element) return;
    if (pinned.current) {
      const to = target();
      if (to !== null) element.scrollTop = to;
    }
    setBehind(
      words !== null &&
        offsetIn(element, words) +
          words.offsetHeight -
          (element.scrollTop + element.clientHeight) >
          FOLLOW_SLACK_PX,
    );
  }, [target]);

  // The view and the thread changing size: the turn growing, a card filling
  // in, the field growing under the view, the window resizing.
  useEffect(() => {
    const element = thread.current;
    if (!view || !element || typeof ResizeObserver === "undefined") return;
    pinned.current = true;
    const observer = new ResizeObserver(() => {
      setRoom(view.clientHeight);
      settle();
    });
    observer.observe(view);
    observer.observe(element);
    return () => observer.disconnect();
  }, [view, settle]);

  // Opening on a thread lands on its end at once, before the observer's
  // first report.
  useEffect(() => {
    if (view) settle();
  }, [view, settle]);

  // A new question goes to the top of the view, smoothly. The turn the card
  // opened on is placed by `settle` above.
  const lastId = last?.id ?? null;
  useEffect(() => {
    if (!view || lastId === null) return;
    const before = placed.current;
    placed.current = lastId;
    if (before === null || before === lastId) return;
    pinned.current = true;
    const to = target();
    if (to === null) return;
    view.scrollTo({
      top: to,
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }, [view, lastId, target]);

  function jumpToLatest() {
    const element = scroller.current;
    const to = target();
    if (!element || to === null) return;
    pinned.current = true;
    element.scrollTo({
      top: to,
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }

  // Only the member moving the view unpins it: a smooth scroll of ours
  // fires scroll events too.
  function memberScrolled() {
    pinned.current = false;
  }

  const options = (): AskOptions => ({
    savedNoticeShown: saving,
    // Asked for on the permission alone, which is already loaded. The list
    // of actions only words the opening: a request typed before it arrives,
    // or after it failed to load, must still come back as a card.
    actions: mayAct,
    gate: ensureConsent,
  });

  function submit(text: string) {
    if (!text.trim() || working) return;
    setDraft("");
    void ask(text, options());
  }

  function pick(suggestion: AskSuggestion) {
    if (working) return;
    // A question can name a record someone else wrote, so it is sent as a
    // suggestion. The one request holds none and is sent like typed words.
    void ask(suggestion.text, {
      ...options(),
      suggested: !suggestion.request,
    });
  }

  return (
    <>
      {exchanges.length > 0 ? (
        <PageActions>
          {/* The app's one New button (Paul, 2026-11-19), beside the X. */}
          <NewButton
            thing="conversation"
            onClick={() => {
              reset();
              cardEdits.clear();
              field.current?.focus({ preventScroll: true });
            }}
          />
        </PageActions>
      ) : null}
      {/*
        The whole page, edge to edge (the tool page's padding is taken back
        so the thread's scrollbar sits at the page's edge), with the thread
        and the field in one centred 720px column.
        `PANEL_HOST_ATTRIBUTE`: an event form opened from an answer docks
        over this page.
      */}
      <div
        {...{ [PANEL_HOST_ATTRIBUTE]: "" }}
        className="relative -mx-4 -my-4 flex min-h-0 flex-1 flex-col sm:-mx-6"
      >
        <div
          ref={attachScroller}
          data-ask-thread-view=""
          onWheel={(event) => {
            if (event.deltaY < 0) memberScrolled();
          }}
          onTouchMove={memberScrolled}
          onKeyDown={(event) => {
            if (
              SCROLL_KEYS.has(event.key) &&
              event.target === event.currentTarget
            )
              memberScrolled();
          }}
          onScroll={settle}
          className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-4 sm:px-6"
        >
          <AskCardEditsContext.Provider value={cardEdits}>
            <div
              ref={thread}
              className={cn(
                // The reading column ChatGPT and Claude draw.
                "mx-auto flex w-full max-w-[720px] flex-col gap-6",
                exchanges.length === 0 && "min-h-full",
              )}
            >
              {exchanges.length > 0 ? (
                exchanges.map((exchange, index) => (
                  <div
                    key={exchange.id}
                    data-ask-turn={exchange.id}
                    ref={index === exchanges.length - 1 ? newest : undefined}
                    // The newest turn fills the view at least, so its
                    // question can sit at the top while it is answered.
                    style={
                      index === exchanges.length - 1 && exchanges.length > 1
                        ? { minHeight: Math.max(room - 20, 0) }
                        : undefined
                    }
                  >
                    <div
                      ref={
                        index === exchanges.length - 1 ? newestWords : undefined
                      }
                    >
                      <AskTurn
                        exchange={exchange}
                        busy={working && exchange.phase !== "working"}
                        onRetry={() => void retry(exchange.id, options())}
                        onThinkHarder={() =>
                          void retry(exchange.id, {
                            ...options(),
                            effort: "more",
                          })
                        }
                        onAnswerConsent={() =>
                          void retry(exchange.id, options())
                        }
                        onProposal={(proposal) =>
                          setProposal(exchange.id, proposal)
                        }
                        onResolved={(resolution) =>
                          resolveProposal(exchange.id, resolution)
                        }
                        onCardEnded={(suggestionId, end) =>
                          resolveCard(exchange.id, suggestionId, end)
                        }
                      />
                    </div>
                  </div>
                ))
              ) : (
                <AskOpening
                  displayName={displayName}
                  mode={opening.mode}
                  onStarterShown={opening.starterShown}
                  canAct={canAct}
                  suggestions={suggestions}
                  onPick={pick}
                />
              )}
            </div>
          </AskCardEditsContext.Provider>
        </div>
        {behind && exchanges.length > 0 ? (
          <div className="relative mx-auto h-0 w-full max-w-[720px] shrink-0">
            <JumpToLatestButton hasNew={false} onJump={jumpToLatest} />
          </div>
        ) : null}
        <form
          // Pinned under the thread, in its column.
          className="shrink-0 px-4 pb-4 pt-2 sm:px-6"
          onSubmit={(event) => {
            event.preventDefault();
            submit(draft);
          }}
        >
          <div className="mx-auto w-full max-w-[720px]">
            {saving && savedUntil ? (
              <p className="mb-2 text-caption text-muted-foreground">
                {askSavedLine(formatAiAnswerDate(savedUntil))}
              </p>
            ) : null}
            <div className="flex items-end gap-2">
              <Textarea
                ref={field}
                {...{ [ASK_FIELD_ATTRIBUTE]: "" }}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault();
                    submit(draft);
                  }
                }}
                rows={1}
                maxLength={ASK_QUESTION_MAX_LENGTH}
                placeholder={ASK_COPY.placeholder}
                aria-label={ASK_COPY.placeholder}
                className="max-h-40 min-h-10 resize-none [field-sizing:content]"
              />
              <Button
                type="submit"
                size="icon"
                className="shrink-0"
                aria-label={ASK_COPY.send}
                title={ASK_COPY.send}
                disabled={working || draft.trim().length === 0}
              >
                <ArrowUp className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </form>
      </div>
      {consentDialog}
    </>
  );
}
