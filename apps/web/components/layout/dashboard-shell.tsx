"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { signetDarkTokens } from "@repo/theme/signet";
import { useNavPermissions } from "@/lib/hooks/use-nav-permissions";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { SKIP_LINK_CLASSES } from "@/components/ui/focus";
import { Sidebar } from "@/components/layout/sidebar";
import { ChannelListSlotProvider } from "@/components/layout/channel-list-slot";
import { FindProvider } from "@/components/layout/find-bar";
import {
  ESCAPE_LEAVES_ATTRIBUTE,
  isAskRoute,
  isChatRoute,
  isFullWidthToolRoute,
  isMessagesRoute,
  MESSAGES_ROUTE,
  PANE_FLOOR,
  SPLIT_QUERY,
  useMediaQueryState,
} from "@/components/layout/shell-layout";
import {
  persistChatOpen,
  persistChatWidth,
  DEFAULT_CHAT_WIDTH,
} from "@/components/layout/shell-prefs";
import {
  SplitDivider,
  type SplitSide,
} from "@/components/layout/split-divider";
import { ToolPageHeader } from "@/components/layout/tool-page-header";
import { PageHeaderSlotProvider } from "@/components/layout/page-actions";
import { ChatPanelBoundary } from "@/components/layout/chat-panel-boundary";
import { ChatPage } from "@/components/chat/chat-page";
import { ChatRouteSkeleton } from "@/components/chat/chat-route-skeleton";
import { chatDeepLink, type ChatView } from "@/lib/chat/chat-links";
import { TopBar } from "@/components/layout/top-bar";
import { useNotificationsLive } from "@/components/layout/notifications-popover";
import { persistNavCollapsed } from "@/components/layout/nav-collapse";
import { resolvePageTitle } from "@/components/layout/page-title";
import { useChapterVocabulary } from "@/lib/hooks/use-chapter-vocabulary";
import { isNavItemVisible } from "@/components/layout/protected-nav-item";
import { useChapterTheme } from "@/lib/hooks/use-chapter-theme";
import { useChapterModuleGate } from "@/lib/hooks/use-chapter-module-gate";
import { useTenantKind } from "@/lib/hooks/use-tenant-kind";
import { ChapterWizardGate } from "@/components/onboarding/chapter-wizard-gate";
import { NoAccessRedirect } from "@/components/layout/no-access-redirect";
import { CouncilRouteGate } from "@/components/layout/council-route-gate";
import { TermsPromptGate } from "@/components/auth/terms-prompt";
import { WelcomeGate } from "@/components/onboarding/welcome-gate";
import { WhatsNewHost } from "@/components/whats-new/whats-new-host";
import { GetTheAppCard } from "@/components/layout/get-the-app-card";
import { RolePreviewBanner } from "@/components/roles/role-preview-banner";
import { useAskEntry, useAskPending } from "@/components/ask/ask-host";
import { useChatRealtimeBinding } from "@/lib/chat/use-chat-realtime-binding";
import { DesktopRuntime } from "@/components/layout/desktop-runtime";
import { cn } from "@/lib/utils";

/**
 * The dashboard shell: one sidebar, then the page and the open conversation
 * (#5946, Paul 2026-11-24; epic #5943).
 *
 * Flush columns rather than a centered page. An earlier shell wrapped
 * everything in `mx-auto max-w-[1400px]`, which on a wide display left the nav
 * floating in from the left edge with background either side of it. The
 * board seats the sidebar against the viewport edge (`1b`: "flush columns,
 * 100vh, independent scroll") and lets content use the width it has.
 *
 * **There is no top bar from `lg` up.** It held the page title, the Find
 * field, the connection pill, the bell and the account avatar across 48px of
 * every route. Each has a home in the sidebar now: Search is a row, the pill
 * and the bell sit in the sidebar's head, the member is at its foot
 * (`sidebar.tsx`), and a page's title is in the page's own header
 * (`tool-page-header.tsx`). The conversation starts at the top of the window.
 * Below `lg` the sidebar is a drawer, so a slim bar stays there to open it
 * and to hold Find, the pill and the bell (`top-bar.tsx`).
 *
 * **Chat is a panel of the shell, not a page** (#3779, Paul 2026-11-10), and
 * its channel list is in the sidebar (#5946). The shell mounts one chat from
 * `lg` up on every route, because the sidebar's list is that chat's own list
 * (`channel-list-slot.tsx`): on `/chat` the conversation has the row, beside
 * a page it docks on the right with a divider between them (#5575, Paul
 * 2026-11-19), and where it has no room (Chapter settings, or closed by its
 * X) it stays mounted out of sight so the list keeps working. `/messages` is
 * the Messages page: the same panel showing the member's conversations
 * listed beside the open one. `shell-layout.ts` owns the state model: the
 * open page is the URL, chat open or closed beside a page and the divider
 * are cookies.
 *
 * What this shell deliberately no longer does:
 *
 * - **No ⌘K palette and no keydown listener for it.** Find is the
 *   replacement: the sidebar's Search row opens a centered dialog, as does
 *   Cmd/Ctrl+F, both owned by `find-bar.tsx`. The `cmdk` dependency stays:
 *   `components/ui/command.tsx` still serves the chat slash palette and the
 *   chapter wizard.
 * - **No home view.** With nothing open the old shell drew the chapter's
 *   mark on a glow (`chapter-home.tsx`, deleted). An empty screen is now the
 *   place to start something: the New row opens Frapp Intelligence's page,
 *   and `/chat` is always the open conversation.
 * - **No floating assistant bar.** New is the one way in (`ask-bar.tsx`,
 *   deleted).
 *
 * The responsive contract: two states, one switch at `lg`. Below it the
 * sidebar lives in a drawer and the shell is a single page: `/chat` is chat
 * with its own list pane, a tool route is its tool. From `lg` up it is the
 * sidebar, the page and the conversation. The drawer renders the same
 * `Sidebar`, so navigation is never duplicated into a second list that can
 * drift.
 */

type DashboardShellProps = {
  children: React.ReactNode;
  /**
   * Collapse preference, read from a cookie by the server layout so the first
   * paint is already correct. Reading it on the client instead would render
   * 264px and then snap to 56px after hydration, on every route.
   */
  defaultNavCollapsed?: boolean;
  /** Chat open or closed beside a page, from its cookie (`shell-prefs.ts`). */
  defaultChatOpen?: boolean;
  /** The docked conversation's width beside a page, from its cookie (#5575). */
  defaultChatWidth?: number;
  /** Chat's member column preference (`lib/chat/members-panel.ts`). */
  defaultMembersHidden?: boolean;
};

/** Chat's panel enters and leaves with the standard Signet tokens. */
const PANEL_ENTER_MS = signetDarkTokens.motion.duration.context;
const PANEL_EXIT_MS = signetDarkTokens.motion.duration.standard;

export function DashboardShell(props: DashboardShellProps) {
  return (
    // Find's dialog and the channel list's slot are the shell's, so the
    // sidebar, the drawer and the top bar all reach the same ones.
    <FindProvider>
      <ChannelListSlotProvider>
        <Shell {...props} />
      </ChannelListSlotProvider>
    </FindProvider>
  );
}

function Shell({
  children,
  defaultNavCollapsed = false,
  defaultChatOpen = true,
  defaultChatWidth = DEFAULT_CHAT_WIDTH,
  defaultMembersHidden = false,
}: DashboardShellProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  // Chapter accent, shell-wide: maps the persisted engine roles onto the
  // semantic tokens signet.css defines. Mounted here (not in ChatProvider) so
  // the nav's active-item tint does not depend on which route is open.
  useChapterTheme();
  // Chat's inbox, joined on every page, so a message arriving while the member
  // is on Calendar lights its channel in the sidebar within seconds (#3745).
  useChatRealtimeBinding();
  // What notifications need on every page, whichever bell is on screen.
  useNotificationsLive();

  const [navCollapsed, setNavCollapsed] = useState(defaultNavCollapsed);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // The sidebar's width (`lg`), where the page and the conversation also sit
  // side by side: `null` until the client knows its width, so a hydration
  // render never mounts a chat a phone cannot show.
  const desktop = useMediaQueryState(SPLIT_QUERY);
  const onChatRoute = isChatRoute(pathname);
  const onMessages = isMessagesRoute(pathname);
  const hasTool = !onChatRoute;
  // The Messages page lists the member's conversations; everywhere else the
  // panel is the open conversation alone.
  const chatView: ChatView = onMessages ? "direct" : "channels";

  // Beside a page only: on `/chat` and `/messages` the conversation is the
  // page, whatever this says.
  const [chatOpen, setChatOpen] = useState(defaultChatOpen);
  const [chatWidth, setChatWidth] = useState(defaultChatWidth);
  const splitRowRef = useRef<HTMLElement>(null);
  // Only an open the member asked for plays the entrance; a page load paints
  // chat in place. Cleared when the entrance ends, so a later remount (the
  // window narrowing and widening) does not replay it.
  const [animateOpen, setAnimateOpen] = useState(false);
  // The cookie follows the state, whichever way it changed.
  useEffect(() => {
    persistChatOpen(chatOpen);
  }, [chatOpen]);

  /*
    Closing plays the exit before the panel hides. `leaving` is the panel
    still on screen while it fades and slides out.
  */
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => setLeaving(false), PANEL_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [leaving]);

  const toolColumnRef = useRef<HTMLDivElement>(null);
  // The tool page header's action slot (`page-actions.tsx`): a page's
  // actions render there at every width.
  const [headerActionSlot, setHeaderActionSlot] =
    useState<HTMLDivElement | null>(null);
  /*
    The X in chat's channel header (#4223): closes chat and leaves the tool
    page, which fills the row. The X goes with the panel, so focus moves to
    the page rather than dropping to `<body>`, and Escape there still closes
    the page.
  */
  // Its view slot, beside the title (`PageViews`).
  const [headerViewSlot, setHeaderViewSlot] = useState<HTMLDivElement | null>(
    null,
  );
  const closeChatPanel = useCallback(() => {
    if (!chatOpen) return;
    setLeaving(true);
    setAnimateOpen(false);
    setChatOpen(false);
    toolColumnRef.current?.focus();
  }, [chatOpen]);
  const closeTool = useCallback(() => {
    router.push("/chat");
  }, [router]);

  // A full-width tool (Chapter settings) hides chat without closing it: the
  // cookie stays as it was, so leaving the page brings chat back beside the
  // next tool.
  const fullWidthTool = hasTool && isFullWidthToolRoute(pathname);

  /*
    The member picked a conversation from a list (`ChatShell`): a channel in
    the sidebar, or a conversation on the Messages page. The panel selects it
    itself; the shell's part is making sure it is on screen. A channel picked
    from Messages leaves Messages for the conversation alone. Beside a page it
    opens the docked panel if its X had closed it, and where the page leaves
    it no room (Chapter settings, or a window too narrow to split) the pick
    goes to `/chat`, because a pick that showed nothing would be a dead click.
  */
  // A pick that is moving the address: the panel's own kind-following
  // (`followConversationKind`) stands down until the address has moved, or
  // its replace would overwrite the pick's push in the same click.
  const pickNavigating = useRef(false);
  useEffect(() => {
    pickNavigating.current = false;
  }, [pathname]);
  const showPickedConversation = useCallback(
    (kind: ChatView, channelId: string) => {
      if (kind === "direct") return;
      if (onMessages || (hasTool && (fullWidthTool || desktop !== true))) {
        pickNavigating.current = true;
        router.push(chatDeepLink({ channelId }));
        return;
      }
      if (hasTool && !chatOpen) {
        setAnimateOpen(true);
        setChatOpen(true);
      }
    },
    [onMessages, hasTool, fullWidthTool, desktop, chatOpen, router],
  );
  /*
    The open conversation is the other kind from the page it is on: a link, a
    notification, a Find result or a bookmark into a DM landed on `/chat`, or
    one into a channel landed on Messages. The address follows the
    conversation, keeping its target, so a DM is always read on Messages with
    its list beside it. Replaced, not pushed: the link the member followed is
    the one entry. Beside a page there is no list to disagree with, so
    nothing moves.
  */
  const followConversationKind = useCallback(
    (kind: ChatView) => {
      if (hasTool || pickNavigating.current) return;
      if ((kind === "direct") === onMessages) return;
      const query = searchParams?.toString() ?? "";
      const base = kind === "direct" ? MESSAGES_ROUTE : "/chat";
      router.replace(query ? `${base}?${query}` : base);
    },
    [hasTool, onMessages, searchParams, router],
  );

  /*
    The side a divider drag will close if released now (dragged to that
    edge), so the side can fade first and the release is no surprise.
  */
  const [collapsing, setCollapsing] = useState<SplitSide | null>(null);
  const collapseSide = useCallback(
    (side: SplitSide) => {
      setCollapsing(null);
      if (side === "page") closeTool();
      else closeChatPanel();
    },
    [closeTool, closeChatPanel],
  );

  /*
    Escape inside the tool page closes it, from `lg` up. Not from a field,
    where Escape means "stop typing" and closing would throw the draft away
    (unless the field says Escape is the page's: Frapp Intelligence's, while
    empty), and not when something inside already used the key: a Radix
    dialog, menu or popover handles Escape first and marks it handled.
  */
  const onToolKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (desktop !== true) return;
      const target = event.target as HTMLElement;
      if (
        target.closest(
          "input, textarea, select, [contenteditable=''], [contenteditable='true']",
        ) &&
        !target.closest(`[${ESCAPE_LEAVES_ATTRIBUTE}]`)
      ) {
        return;
      }
      event.preventDefault();
      closeTool();
    },
    [desktop, closeTool],
  );

  // Docked beside the page: open (or still leaving), and the page leaves room.
  const chatDocked = hasTool && (chatOpen || leaving) && !fullWidthTool;
  // On screen at all: the page itself on a chat route, else docked from `lg`.
  const conversationShown = onChatRoute || (chatDocked && desktop === true);
  /*
    Mounted on its own routes at every width (the single page below `lg`),
    and on every route from `lg` up, shown or not: the sidebar's channel list
    is this chat's list. While the width is not known (the server render,
    hydration) the panel is mounted too, holding its place by CSS with chat's
    skeleton, so a page beside it paints at its final width; chat itself
    waits for the client to know the window is wide, so a phone never builds
    a chat it cannot show (below).
  */
  const chatMounted = onChatRoute || desktop !== false;
  // `undefined` hides gated rows until the read answers; `null` means the
  // offline dashboard can't ask, and shows them (`useNavPermissions`, #3854).
  const permissions = useNavPermissions();
  // Module gating: items tied to a disabled module hide once the chapter read
  // resolves. Undefined while loading means "do not gate", so nothing flashes
  // out during the initial load. Read from the member-readable current chapter,
  // never the officer-only config read (#1982; the hook says why).
  const isModuleEnabled = useChapterModuleGate();
  // A council's rows and titles (#5933).
  const tenantKind = useTenantKind();
  // A title named in the chapter's own word (Recruitment's Rush / Intake).
  const chapterVocabulary = useChapterVocabulary();
  // The crumb's parent link follows its nav row's gates, so a title never
  // offers a member a door the sidebar hides from them.
  // New's page is named for the assistant only for a member who has it; for
  // anyone else, a council included (its home, #5933), it says "New"
  // (`ask-page.tsx`).
  const askEntry = useAskEntry();
  const askPending = useAskPending();
  const newWithoutAssistant =
    isAskRoute(pathname) &&
    (tenantKind === "council" || (askEntry === null && !askPending));
  const pageTitle = useMemo(
    () =>
      newWithoutAssistant
        ? { title: "New" }
        : resolvePageTitle(
            pathname,
            (item) =>
              isNavItemVisible(item, permissions, isModuleEnabled, tenantKind),
            chapterVocabulary,
            tenantKind,
          ),
    [
      newWithoutAssistant,
      pathname,
      permissions,
      isModuleEnabled,
      chapterVocabulary,
      tenantKind,
    ],
  );

  const toggleNavCollapsed = useCallback(() => {
    // The cookie write is deliberately OUTSIDE the updater. React requires an
    // updater to be pure and double-invokes it under Strict Mode; the write is
    // idempotent so nothing breaks today, but a side effect in that position is
    // the kind that starts misbehaving the moment it stops being idempotent.
    setNavCollapsed((prev) => !prev);
    persistNavCollapsed(!navCollapsed);
  }, [navCollapsed]);

  const chatPanelClassName = cn(
    // `clip`, as `<main>` is: never a scroll container that hides its header.
    "min-h-0 min-w-0 flex-col overflow-clip bg-background",
    onChatRoute
      ? // The page itself: the whole row.
        "flex flex-1"
      : chatDocked
        ? // Beside a page: from `lg` up only.
          "hidden shrink lg:flex"
        : // Mounted for the sidebar's list, with nowhere to show.
          "hidden",
    // A divider drag about to close chat fades it first.
    collapsing === "chat" && "opacity-40 transition-opacity",
  );
  const chatPanelStyle: React.CSSProperties = {
    // Keyframes in `app/globals.css`, off under reduced motion.
    animation: leaving
      ? `shell-panel-out ${PANEL_EXIT_MS}ms ${signetDarkTokens.motion.easing.exit} forwards`
      : animateOpen
        ? `shell-panel-in ${PANEL_ENTER_MS}ms ${signetDarkTokens.motion.easing.entrance}`
        : undefined,
    ...(hasTool
      ? {
          // The docked conversation keeps the member's width and the page
          // takes the rest (#5575). CSS holds both floors: chat never below
          // 375, and never so wide that the page (`min-w-[375px]`; the
          // divider's `w-2 -mx-1` nets no width) drops below 375, whatever
          // width was saved.
          flex: `0 1 ${chatWidth}px`,
          minWidth: PANE_FLOOR,
          maxWidth: `calc(100% - ${PANE_FLOOR}px)`,
        }
      : {}),
  };
  const showDivider = chatDocked && desktop !== false;

  return (
    /*
      The visible viewport's height. The connection pill sits in the sidebar's head
      (`connection-pill.tsx`; the top bar below `lg`) and takes no row of its own, so nothing here
      makes room for it. This used to subtract the banner's published height,
      and that is exactly what moved the whole shell down every time the state
      left ONLINE (#2244). `data-dashboard-shell` is how the root layout's
      floating pill knows to stand down while the shell carries one.

      `dvh`, not `vh`: on a phone browser whose toolbar can hide, `100vh` is
      the viewport with the toolbar hidden, so a shell that clips its overflow
      would put chat's composer under the toolbar while it shows.

      `relative overflow-clip` is load-bearing, both halves (#4000). An
      element's overflow clips only the boxes whose containing block is it or
      inside it. Without a position here, every `absolute` box in the shell
      (each `sr-only` label, a Radix control's hidden input) took the initial
      containing block, the viewport, and sat at its unscrolled place in a
      long page. Nothing clipped it, so the document grew past the viewport
      and scrolled the whole shell up, leaving a black band below it.
      `relative` makes this the containing block. `clip`, not `hidden`,
      because a `hidden` box is still a scroll container: those same boxes
      became its scrollable overflow, and the skip link, a focused control or
      a `scrollIntoView` scrolled the shell instead, with no way for a wheel
      to scroll it back. A `clip` box cannot be scrolled at all.
    */
    <div
      data-dashboard-shell=""
      className="relative flex h-dvh overflow-clip bg-background"
    >
      <ChapterWizardGate />
      {/* A council member on a chapter-only page (#5933). */}
      <CouncilRouteGate />
      {/* A member whose roles grant nothing (#3236). */}
      <NoAccessRedirect />
      {/* A member who hasn't accepted the current Terms (#2302). */}
      <TermsPromptGate />
      {/* Back to the name and photo for a member who hasn't finished joining (#5627). */}
      <WelcomeGate />
      {/* What's new, by itself once after an update (#3943). */}
      <WhatsNewHost />
      {/* Inside the desktop app only: the icon's count and system notifications (#4842). */}
      <DesktopRuntime />

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        {/*
          The drawer is the sidebar: it renders the same `Sidebar`, never a
          second hand-maintained list, and the sheet mounts it only while
          open.
        */}
        <SheetContent
          side="left"
          className="flex flex-col border-border bg-surface-1 p-2 text-foreground"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
            <SheetDescription>
              Open dashboard routes and chapter tools.
            </SheetDescription>
          </SheetHeader>
          <Sidebar
            variant="drawer"
            collapsed={false}
            permissions={permissions}
            isModuleEnabled={isModuleEnabled}
            pathname={pathname}
            onNavigate={() => setMobileNavOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <a href="#main-content" className={SKIP_LINK_CLASSES}>
        Skip to main content
      </a>

      {/*
        The sidebar always stays (#3779): one column on every route, so
        nothing in it jumps going between a page and a channel.
      */}
      <div className="hidden lg:flex">
        <Sidebar
          collapsed={navCollapsed}
          onToggleCollapsed={toggleNavCollapsed}
          permissions={permissions}
          isModuleEnabled={isModuleEnabled}
          pathname={pathname}
          onCloseTool={desktop === true && hasTool ? closeTool : undefined}
        />
      </div>

      {/*
        `min-w-0` is load-bearing, not tidying. This column is a flex item, so
        its automatic minimum size is its min-content width — without the
        override it refuses to shrink below whatever the widest unbreakable
        thing on the route needs, and the whole page scrolls sideways. That one
        missing declaration was six of the seven routes in #1142.
      */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* "View as a role" (#4072): above everything, on every route. */}
        <RolePreviewBanner />
        {/* Below `lg` only: the drawer's trigger, the title, Find, the bell. */}
        <TopBar
          pageTitle={pageTitle}
          titleIsHeading={desktop !== true}
          onOpenMobileNav={() => setMobileNavOpen(true)}
        />
        {/*
          The route's one `<h1>` on a chat route from `lg` up, where no bar
          names it: read, not drawn, because the channel header (or the
          Messages list's own title) already says where the member is.
        */}
        {onChatRoute && pageTitle && desktop === true ? (
          <h1 className="sr-only">{pageTitle.title}</h1>
        ) : null}
        {/* On a phone only, until dismissed (#4002). Above `<main>` so it
            sits over chat and every tool page alike. */}
        <GetTheAppCard />
        {/*
          `<main>` is the whole row right of the nav: the tool page, the
          divider and chat (#3779; that order since #5575). One landmark for everything the member came
          for, so the skip link, the confirm dialog's focus fallback
          (`confirm-dialog.tsx`) and the 375px floor suite, which measures
          inside `<main>`, all reach chat as well as the page.

          `overflow-clip`, not `hidden`, for the shell's own reason (#4000,
          above): a `hidden` box is still a scroll container, so a jump, a
          focused control or an anchor deep in a long page (minutes) scrolled
          `<main>` itself and slid the page's header, its title and X, up
          out of view, with no wheel to bring it back (Paul,
          2026-11-20: "no way for me to x out or to go back"). Only the page
          and chat's own scrollers scroll.
        */}
        <main
          id="main-content"
          ref={splitRowRef}
          className="flex min-h-0 min-w-0 flex-1 overflow-clip"
        >
          {/*
            The tool page. It scrolls independently of the sidebar, which is
            what makes the channel list's scroll position survive navigation. `min-w-0`
            and `min-h-0` are load-bearing: as flex items, without them this
            refuses to shrink below its widest unbreakable content and the
            whole page scrolls sideways (six of the seven routes in #1142).
            Beside chat it keeps the 375px floor.
          */}
          {hasTool ? (
            <div
              ref={toolColumnRef}
              data-tool-column=""
              onKeyDown={onToolKeyDown}
              // Focusable by click only, so a click on the page's blank space
              // puts focus in the page and Escape reaches it, rather than
              // leaving focus on `<body>`. Never a Tab stop.
              tabIndex={-1}
              className={cn(
                // `relative`: a docked panel (`shared/panel.tsx`) covers the column.
                "relative flex min-h-0 min-w-0 flex-1 flex-col outline-none transition-opacity",
                chatDocked && "lg:min-w-[375px]",
                collapsing === "page" && "opacity-40",
              )}
            >
              <ToolPageHeader
                pageTitle={pageTitle}
                titleIsHeading={desktop === true}
                onClose={closeTool}
                actionSlotRef={setHeaderActionSlot}
                viewSlotRef={setHeaderViewSlot}
              />
              <div
                data-tool-page=""
                className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4 sm:px-6"
              >
                <PageHeaderSlotProvider
                  slot={headerActionSlot}
                  viewSlot={headerViewSlot}
                >
                  {children}
                </PageHeaderSlotProvider>
              </div>
            </div>
          ) : null}
          {showDivider ? (
            <div className="hidden lg:flex">
              <SplitDivider
                width={chatWidth}
                onChange={setChatWidth}
                onCommit={persistChatWidth}
                rowRef={splitRowRef}
                onCollapsePreview={setCollapsing}
                onCollapse={collapseSide}
              />
            </div>
          ) : null}
          {chatMounted ? (
            <section
              id="chat-panel"
              aria-label={onMessages ? "Messages" : "Chat"}
              data-chat-panel=""
              inert={leaving}
              className={chatPanelClassName}
              style={chatPanelStyle}
              onAnimationEnd={() => setAnimateOpen(false)}
            >
              <ChatPanelBoundary resetKey={pathname}>
                {/*
                  Beside a tool, chat mounts once the window is known to be
                  wide enough. Until then (server render, hydration) the
                  panel holds its place with chat's skeleton, so a phone never
                  builds and tears down a chat it cannot show.
                */}
                {onChatRoute || desktop === true ? (
                  <ChatPage
                    defaultMembersHidden={defaultMembersHidden}
                    toolBeside={hasTool}
                    view={chatView}
                    onViewChange={followConversationKind}
                    onPick={showPickedConversation}
                    shown={conversationShown}
                    onClose={
                      hasTool && desktop === true ? closeChatPanel : undefined
                    }
                  />
                ) : (
                  <ChatRouteSkeleton />
                )}
              </ChatPanelBoundary>
            </section>
          ) : null}
        </main>
      </div>
    </div>
  );
}
