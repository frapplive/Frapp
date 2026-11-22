"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowUp, SquarePen, X } from "lucide-react";
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
import { FrappCrest } from "@/components/ask/frapp-crest";
import {
  AskCardEditsContext,
  type AskCardEditsStore,
} from "@/components/ask/ask-proposal";
import { Button } from "@/components/ui/button";
import { escapeIntoDockedPanel } from "@/components/shared/panel";
import { DialogOverlay } from "@/components/ui/dialog";
import { IconButton } from "@/components/ui/icon-button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { JumpToLatestButton } from "@/components/chat/jump-to-latest-button";
import { prefersReducedMotion } from "@/components/chat/use-rail-flip";
import { useGrowWithText } from "@/lib/hooks/use-grow-with-text";

/**
 * Ask Frapp on web (#450, #451, #718): one conversation with Frapp, in a
 * dialog centered over the page. The member types in one field; Frapp
 * answers from the chapter's sources, each claim marked with the source it
 * came from, or shows a card for something they asked to have done.
 *
 * **Where Find opens** (#4904, Paul's pick of 2026-11-13). It was a card
 * that rose from a button in the chat composer (#4702), and before that a
 * panel docked to the right edge. From #4904 the top bar's field asked as
 * well as searched, so the conversation took the Find dialog's place and
 * measures (`find-dialog.tsx`): the same width, the same distance from the
 * top, the same surface and scrim. It is a real dialog, reachable from every
 * page, and Escape or a click outside closes it. Since #5476 (Paul,
 * 2026-11-18) the field only finds, and the floating Ask bar (`ask-bar.tsx`)
 * opens this dialog in the same place.
 *
 * **Following a link closes it.** A source, a channel an answer names and
 * the page a confirmed card leaves for all open under the dialog, so a
 * plain click on any link in the thread closes it. The conversation is
 * kept, and the Ask bar reopens it.
 *
 * It is owned by `AskHost` above the whole dashboard, so the thread is the
 * same thread on every page.
 *
 * **One conversation, one field** (2026-11-13, owner; `spec/behavior/ai.md`
 * § One conversation). There were two sides here, Ask and Do, under a
 * switch, and each showed one exchange at a time. ChatGPT, Claude, Slack's
 * assistant and Notion AI all take a question and a request in the same
 * field and let the assistant work out which it is, and all keep the thread
 * on screen so a follow-up can lean on what came before. So the card is a
 * thread: each turn stays, the turns before a question are sent with it,
 * and a member who may have Frapp act gets a card to confirm when what they
 * typed asks for something to be done. A member who may not gets answers
 * only, from the same field. The header's New conversation button clears
 * the thread.
 *
 * The thread is this sitting's: it survives a close and reopen, and is gone
 * on reload. A question still being answered when the card closes is
 * dropped; the turns before it stay.
 *
 * **It opens on the member's own account** (#4700, owner 2026-11-13: "not
 * just be like some presets"). Before the first turn the card offers up to
 * three questions and one request the server built from what this member's
 * account holds now: their next event, their open tasks, minutes they can
 * read, their points. There is no fixed list; a member with nothing to ask
 * about sees the two lines of the opening and the field. They are read when
 * the card opens and fade in under the opening words, where nothing sits
 * below them to move. A tapped question is sent as a suggestion, never as
 * words the member typed (`useAsk`'s `suggested`).
 *
 * **Consent is asked at the first question**, not when the card opens
 * (`useAiConsentGate`; `ai.md` § Consent). The question shows in the thread
 * first, so the sheet opens over the words it is about. The server checks
 * again.
 *
 * **The saved line.** While the beta diagnostics window is on for this
 * chapter, a line above the field says questions and answers are saved and
 * until when, where the member reads it as they type, and only then does a
 * question carry `saved_notice_shown`: the server keeps nothing from a
 * client that did not show it. The status is read as soon as the entry
 * exists, and again each time the card opens, so the line is in place when
 * the card comes up and is true at the moment of asking.
 */
/**
 * The entries: every Ask bar carries the attribute (`ask-bar.tsx`). Focus
 * goes back to one that is on screen when the bar that opened the
 * conversation is gone or hidden: following a link from a tool page lands on
 * `/chat`, and below `lg` with a channel open the Channels column's bar is
 * there but hidden (#5476).
 */
const ASK_ENTRY_SELECTOR = "[data-ask-entry]";

/**
 * Whether focus can land on `element`: in the page and not hidden by a
 * `display: none` ancestor. `checkVisibility` answers that where the browser
 * has it; without it (jsdom), being in the page is all there is to check.
 */
function onScreen(element: HTMLElement | null): element is HTMLElement {
  if (!element?.isConnected) return false;
  return typeof element.checkVisibility === "function"
    ? element.checkVisibility()
    : true;
}

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

export function AskCard({
  open,
  onOpenChange,
  returnFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The control that opened it, which takes focus back when it closes. */
  returnFocus?: RefObject<HTMLElement | null>;
}) {
  const {
    exchanges,
    working,
    ask,
    retry,
    setProposal,
    resolveProposal,
    resolveCard,
    stop,
    reset,
  } = useAsk();
  const status = useAskStatus();
  const refetchStatus = status.refetch;
  const { ensureConsent, consentDialog } = useAiConsentGate();
  // No request for a member without `ai:act`: the server would answer 403.
  const permissions = useMyPermissions().data?.permissions;
  const mayAct = !!permissions && can("ai:act", permissions);
  const actions = useActStatus({ enabled: open && mayAct }).data ?? null;
  const canAct = actions !== null && actions.length > 0;
  const { suggestions } = useAskSuggestions({ enabled: open });
  const displayName = useViewerDisplayName();
  const viewerId = useViewerUserId();
  const opening = useAskStarter({
    userId: viewerId,
    open,
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
  const card = useRef<HTMLDivElement>(null);

  const savedUntil = status.data?.saved_until ?? null;
  // The server sends a date only while the window is open.
  const saving = savedUntil !== null;
  const last = exchanges.at(-1);

  // A question still being answered is dropped with the card, however it
  // was closed; the turns before it are there when it reopens. One asked
  // from a channel (`@Frapp`) is not the card's to drop: it is answered
  // there, with the card closed.
  const askedHere = exchanges.some(
    (exchange) => exchange.phase === "working" && !exchange.origin,
  );
  useEffect(() => {
    if (!open && askedHere) stop();
  }, [open, askedHere, stop]);

  // Whether answers are being saved can change while the page sits open.
  useEffect(() => {
    if (open) void refetchStatus({ cancelRefetch: false });
  }, [open, refetchStatus]);

  const shown = open;

  // The field grows with what is typed.
  useGrowWithText(field, draft, shown);

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
  // - Radix's portal draws nothing in the render that opens the dialog, so
  //   an effect keyed on `open` found no scroller and the old reopen scroll
  //   never ran. Everything here starts from the scroller's own ref.
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

  function close() {
    onOpenChange(false);
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
      <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
        <DialogPrimitive.Portal>
          <DialogOverlay className="motion-reduce:animate-none" />
          <DialogPrimitive.Content
            ref={card}
            aria-describedby={undefined}
            // An event form opened from an answer docks over the card
            // (`Panel`'s `docked="here"`), never a card over the window.
            data-panel-host=""
            // Closing drops a question still being answered (above), so a
            // stray click on the page behind does not close it mid-answer.
            // Escape and the close button still do.
            onInteractOutside={(event) => {
              if (askedHere) event.preventDefault();
              // A click outside with a form docked over the card (Ask's event
              // form) would close the form with Ask; only its back arrow,
              // Escape or Ask's X leave it.
              if (card.current?.querySelector("[data-docked-panel]")) {
                event.preventDefault();
              }
            }}
            // Escape in an event form docked over the card goes back to the
            // answer, as it does from a docked form anywhere, rather than
            // closing Ask with the form in it.
            onEscapeKeyDown={(event) => {
              if (escapeIntoDockedPanel(event.target)) event.preventDefault();
            }}
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              field.current?.focus({ preventScroll: true });
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              // What opened it, or an Ask bar on screen now: the one that
              // opened it may be gone, or hidden by the layout it left.
              const opener = returnFocus?.current ?? null;
              const entry = onScreen(opener)
                ? opener
                : Array.from(
                    document.querySelectorAll<HTMLElement>(ASK_ENTRY_SELECTOR),
                  ).find(onScreen);
              entry?.focus({ preventScroll: true });
            }}
            // The Find dialog's place and measures (`find-dialog.tsx`), with
            // a floor so a first answer does not open in a sliver.
            className="fixed left-1/2 top-[12vh] z-50 flex max-h-[76vh] min-h-[min(22rem,76vh)] w-[min(640px,calc(100vw-24px))] -translate-x-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-[0.98] motion-reduce:animate-none"
          >
            <div className="flex min-h-12 shrink-0 items-center gap-1 py-1.5 pl-4 pr-2">
              {/* Before the first turn the opening's big crest is the mark;
                  the name is shown again with the conversation (#4904). */}
              {exchanges.length > 0 ? (
                <FrappCrest className="h-[18px] w-[15px] shrink-0 text-primary" />
              ) : null}
              <DialogPrimitive.Title
                className={cn(
                  "ml-1.5 min-w-0 flex-1 text-base font-bold leading-6",
                  exchanges.length === 0 && "sr-only",
                )}
              >
                {ASK_COPY.name}
              </DialogPrimitive.Title>
              {exchanges.length === 0 ? <span className="flex-1" /> : null}
              {exchanges.length > 0 ? (
                <IconButton
                  label={ASK_COPY.new_conversation}
                  onClick={() => {
                    reset();
                    cardEdits.clear();
                    field.current?.focus({ preventScroll: true });
                  }}
                  className="shrink-0 text-muted-foreground"
                >
                  <SquarePen className="h-4 w-4" aria-hidden="true" />
                </IconButton>
              ) : null}
              <IconButton
                label={ASK_COPY.close}
                onClick={close}
                className="shrink-0 text-muted-foreground"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </IconButton>
            </div>
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
              className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-1"
            >
              <AskCardEditsContext.Provider value={cardEdits}>
                <div
                  ref={thread}
                  className={cn(
                    "flex flex-col gap-6",
                    exchanges.length === 0 && "min-h-full",
                  )}
                  // Whatever a link in the thread opens, it opens under this
                  // dialog. A click that opens a new tab leaves it as it was.
                  onClick={(event) => {
                    if (
                      event.metaKey ||
                      event.ctrlKey ||
                      event.shiftKey ||
                      event.altKey
                    )
                      return;
                    if ((event.target as HTMLElement).closest("a[href]"))
                      close();
                  }}
                >
                  {exchanges.length > 0 ? (
                    exchanges.map((exchange, index) => (
                      <div
                        key={exchange.id}
                        data-ask-turn={exchange.id}
                        ref={
                          index === exchanges.length - 1 ? newest : undefined
                        }
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
                            index === exchanges.length - 1
                              ? newestWords
                              : undefined
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
              <div className="relative h-0 shrink-0">
                <JumpToLatestButton hasNew={false} onJump={jumpToLatest} />
              </div>
            ) : null}
            <form
              className="shrink-0 border-t border-border px-4 py-3"
              onSubmit={(event) => {
                event.preventDefault();
                submit(draft);
              }}
            >
              {saving && savedUntil ? (
                <p className="mb-2 text-caption text-muted-foreground">
                  {askSavedLine(formatAiAnswerDate(savedUntil))}
                </p>
              ) : null}
              <div className="flex items-end gap-2">
                <Textarea
                  ref={field}
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
            </form>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
      {consentDialog}
    </>
  );
}
