# UI/UX Specification: Web Dashboard (app.frapp.live)

> The chapter admin command center — secondary to chat in the chat-first product.
> This directory is the surface's spec: what its pages are built from, the navigation/permission map, gating and routing semantics, the responsive shell contract, and the data contracts that outlive the retired per-screen docs.
> Token values live in [`../design-system/`](../design-system/README.md); the surface's stylesheet is [`packages/theme/src/signet.css`](../../../packages/theme/src/signet.css).

**Active (Signet).**
The #920 slices reskinned this surface onto Signet, and [#2140](https://github.com/pdcarlson/Frapp/issues/2140) then rebuilt it from a committed Claude Design framework board.
Both have closed, and the rules each settled that still bind are folded in here ([History](#history)).
So this page is current truth for the web surface, and a gap between it and `apps/web` is drift to fix or file, as anywhere else in `spec/`.

| File                                | Owns                                                                                                                                                                                                                                                |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `README.md` (this page)             | Sources and precedence, brand and copy locks, navigation, page grammar, per-route decisions, gating and routing, the responsive contract, standing bans, data contracts                                                                             |
| [`tokens.md`](tokens.md)            | The surface's token record: what the #2140 ladder moved, where the board and the theme package disagree, and the locks L-01 to L-09, open and closed. Token **values** stay in [`../design-system/foundations.md`](../design-system/foundations.md) |
| [`reference/`](reference/README.md) | The committed framework board, [`web-framework.dc.html`](reference/web-framework.dc.html): how to read it, and where it no longer ships                                                                                                             |

## Sources and precedence

Highest wins on anything visual or structural.
This is the web half of [`../README.md` § Precedence](../README.md#precedence), which still binds above it.

| Rank | Source                                                                                                                            | Why it ranks here                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | [`reference/web-framework.dc.html`](reference/web-framework.dc.html)                                                              | Committed HTML beats written docs, the rule `../README.md` applies to every board. A shipped string's product name follows [`brand-identity.md` § 1](../brand-identity.md#1-identity), not the board                                                                                                                                                                                                                                                                                                                  |
| 2    | This directory                                                                                                                    | What the board does not draw, and every place the product departs from it, with the reason. **A departure recorded here is the decision, not drift**: rank 1 beats prose that merely describes the surface, never a recorded departure. Board-wide ones (the chat bubbles, the focus border) are in [`reference/README.md` § What this board settles](reference/README.md#what-this-board-settles); the rest are under [Surface decisions](#surface-decisions), [Page grammar](#page-grammar) and the two rules below |
| 3    | [`../mobile/`](../mobile/README.md)                                                                                               | The shipped Signet consumer surface. Where the board and this directory are silent, mobile is the precedent, because the two read as one product                                                                                                                                                                                                                                                                                                                                                                      |
| 4    | [`../design-system/`](../design-system/README.md), [`../brand-identity.md`](../brand-identity.md), [`../assets.md`](../assets.md) | Tokens, components, accent engine, brand. Canonical for everything the board does not overrule                                                                                                                                                                                                                                                                                                                                                                                                                        |

[`../../behavior/`](../../behavior/README.md) outranks all four: this tree governs presentation and never changes what the product does.
Deleting a route, a permission or a data contract is a behavior change with its own issue, never part of a chrome cleanup.

Two rules for reading the board, each learned by breaking it once:

- **Transcribe it, never lift it.**
  Its CSS was written for one demo tenant in a design tool.
  Copied verbatim, its scrollbar rule renders none of what it specifies in Chromium 121 and later ([`tokens.md`](tokens.md) § L-01), its 404 crest at `opacity:.9` composites to a gold that is not the mark's, and its 24px radius is off [`foundations.md`](../design-system/foundations.md)'s §8 radius map, and its 40px buttons, on the §9 scale to a mouse since 2026-11-05, were under the touch floor before the scale split by pointer.
  Take its intent at this repo's tokens.
- **Where the board draws a product this codebase does not have, the product wins.**
  It draws a two-tier plan with a price, seats and a card on file, and a Join code tab and a Subscription tab.
  None of those exists, so none is drawn ([Billing](#billing), [Settings](#settings)).
  Its demo tenant is also the house tenant, so a gold on the board may be the chapter accent, the fixed Ask family or the mark, and the board cannot say which: [`tokens.md`](tokens.md) § L-01 names that trap.

## Brand and copy locks

A routing table, not a second copy of the brand: every row but the last is owned elsewhere, and the values live at the link.
Follow it before building anything that turns on a specific hex or an exact wording.
One row restates its owner on purpose, and says so.

| Lock               | What a change needs to know                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Owned by                                                                                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Emblem             | Locked emblem B is the shipping mark, and how it may be _described in copy_ is constrained by that section's opening rule. Read it before writing any product or marketing string about the mark. (The "Banned logo vocabulary" list under it governs future mark **exploration**, not copy)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | [`brand-identity.md` § 2 The mark](../brand-identity.md#2-the-mark)                                                                                                                       |
| Mark colors        | Fixed gold on a fixed charcoal field. Do not sample them from a screenshot and do not restyle them piecemeal                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | [`assets.md` § 1 Status](../assets.md#1-status-locked-emblem-b), [`brand-identity.md` § 2](../brand-identity.md#2-the-mark)                                                               |
| Mark never retints | The mark and logo **MUST NOT** take the chapter accent, ever (one exception since #4702, Paul's: the crest drawn as a one-colour glyph on Frapp Intelligence's front doors, [`brand-identity.md` § 2](../brand-identity.md#2-the-mark)). Chapter theming recolors product UI; the brand itself does not move. **This is a restatement**, kept because wiring the mark to `--primary` with everything else is the easiest way to break it on this surface. `signet.css.spec.ts` asserts the fixed families (`--gold-ask-*`, `--gold-house`, `--gold-on-house`, and the neutral `--scrollbar-*`, which is fixed for its own reason in [`foundations.md`](../design-system/foundations.md) §12, not by the brand lock) are self-contained colours outside the accent bridge, and `crest-page.spec.tsx` that the crest carries no accent class or filter. If the rule is ever narrowed at its owner, narrow this copy with it | [`brand-identity.md` § 2](../brand-identity.md#2-the-mark)                                                                                                                                |
| No legacy chrome   | No legacy Frapp wordmark and no legacy bone/bronze/Geist visual. Since 2026-09-23 the product is named Frapp ([ADR-25](../../architecture/adr/adr-25.md)), so customer-facing copy says Frapp; code identifiers, `@repo/*` packages and `frapp.live` domains stay as they are. `frapp-naming.test.mjs` fails a copy line in `apps/web` that says the retired name, Signet. Three owners, not one                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | naming [§ 1](../brand-identity.md#1-identity) · Geist [§ 3](../brand-identity.md#3-decisions-recorded-as-of-this-doc) · bone/bronze [§ 5](../brand-identity.md#5-what-still-ships-legacy) |
| No em dashes       | The only row with no other home. Product copy on this surface uses no em dashes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | [below](#no-em-dashes-in-product-copy)                                                                                                                                                    |

### No em dashes in product copy

This lock is about **product copy**: UI strings, empty states, error text, labels, tab titles, and anything else a member reads in the app.
It is a de-slop rule, not a typographical purge.
[`../landing/README.md`](../landing/README.md) extends it to the landing's marketing copy.

It deliberately does **not** reach two places:

- **Approved microcopy in [`../design-system/writing.md`](../design-system/writing.md) §7.**
  Several approved strings carry an em dash, including the shipped connection-state copy, and they ship on more than one surface.
  Rewriting one is a writing.md change with its own review, not a side effect of another change; a change that touches one rewrites it and updates §7 in the same diff.
- **Repository prose.**
  Specs, ADRs, code comments and commit messages keep the house style.

One known gap: `@repo/chat-core`'s dispatch notices carry em dashes and render on `/chat`, as a failed slash command's `message._error`.
That package is shared with `apps/mobile`, which this lock does not reach, so rewriting them is a two-surface copy decision ([#2184](https://github.com/pdcarlson/Frapp/issues/2184)).

No CI check enforces this lock; it is a review rule.
A line grep for `—` over `apps/web` is mostly comment prose, so sweep with a JS/TSX-aware lexer that reads only string literals and JSX text.

## Navigation map

Source of truth: [`apps/web/components/layout/nav-config.ts`](../../../apps/web/components/layout/nav-config.ts).
Each item may declare `requirePermission`, `requireAnyOf` or `requireAllOf`, and an item with neither shows to every member; the shell hides items the caller cannot access.
The caller's effective permission set is loaded per chapter via `GET /v1/users/me/permissions` and cached with TanStack Query, keyed by chapter id (resolution rules: [`spec/behavior/rbac.md`](../../behavior/rbac.md)).
Controls inside a screen gate through `<Can>` or the `can()` / `canAny()` / `canAll()` helpers, which live in `@repo/validation` ([`packages/validation/src/permissions.ts`](../../../packages/validation/src/permissions.ts)) rather than in `apps/web`, because `apps/mobile` needs the same gate and the wildcard `*` rule has to match the server's `PermissionsGuard`: a per-app copy is how that drifts.

One sidebar, the same for every role ([`sidebar.tsx`](../../../apps/web/components/layout/sidebar.tsx); #5946, Paul, 2026-11-24, epic [#5943](https://github.com/pdcarlson/Frapp/issues/5943)).
Top to bottom:

1. **The head**, 48px, level with the page and channel headers beside it: the chapter's mark and name as a label, the connection pill while there is a connection problem to report ([`connection-state.md` § One indicator](../resilience/connection-state.md#one-indicator)), the notifications bell, and the collapse control.
   The name is not a menu: what a member can do about the chapter is in their menu at the foot.
   A member whose saved chapter is no longer one of theirs gets the recovery card in its place, the first thing in the column (`ChapterLabel` in [`chapter-switcher.tsx`](../../../apps/web/components/layout/chapter-switcher.tsx)).
2. **New and Search.**
   New wears the shared New button's outlined accent and opens Frapp Intelligence's page, `/ask`, the app's start view ([§ Top bar](#top-bar), "New is the start view").
   Search opens the Find dialog, as Cmd/Ctrl+F and Cmd/Ctrl+K do on every route.
3. **The five homes**, Activity, Messages, Calendar, Resources and Directory, then **More** while it holds anything (table below).
   Each home answers one of the three questions a member opens Frapp with ([`positioning.md` § Three questions](../../product/positioning.md#three-questions)): Activity and Calendar what is on me and what is happening, Messages what is being said to me, Resources and Directory where it is and who it is.
   There are no section headings: five rows need none, and a heading over each pair spent 37px the channel list wants.
4. **The chapter's channels**, after a hairline, scrolling in whatever height is left, with no heading and no control above them ([§ Chat](#chat)).
5. **The member** at the foot, and their one menu ([§ Account menu](#account-menu)).

Claude, Slack, Discord, Linear and Notion all keep one sidebar with a few destinations over a scrolling list and the person at the foot or the head; Apple's HIG keeps a sidebar to the top-level places people use most.
Activity carries the count of what is waiting, by the rule the phone's Activity tab uses (`activityCountChip` in `@repo/hooks`).
Messages carries a mention-red count of conversations with anything unread.
A row is lit on its own page (`aria-current="page"`) and on a page under it (`"true"`), and from `lg` up clicking the open page's row closes the page.
**More is temporary.**
Recruitment has no home in the series yet (#5998). Tasks left More in #5948: it folded into Activity's Mine and Everyone's ([§ Activity](#activity)), and `/tasks` redirects there.
Until its step lands a page stays reachable from More, a dropdown under its button that is lit while one of its pages is open and is not drawn when none of its rows is visible.
Meetings and Backwork left More in #5949: posted minutes are filed in Documents, and Backwork is Resources' second view ([§ Resources](#resources-documents-minutes-and-backwork)).
Resources opens the first of its views the member can open: Documents, or Backwork in a chapter with only Backwork on (`RESOURCES_VIEWS` in `nav-config.ts`).
Chapter settings has no row: it opens from the member's menu, its one door ([§ Account menu](#account-menu)).
In a council ([#5933](https://github.com/frapplive/Frapp/issues/5933), ADR-27) the sidebar keeps what a council's routes serve: New, Search, Messages, Chapters ([§ Council and school links](#council-and-school-links), #5974), Directory and the channel list (`NavItem.kinds`; `council-route-gate.tsx` sends any other page to `/chat`). Its New opens the council's home, its crest, type and school, then Invite delegates and Edit titles for an officer (`council-home.tsx`): a council has neither the assistant nor a chapter's forms. Chapters is a council's row only and stays hidden until the tenant kind is known, so a chapter's sidebar never draws it. The member menu names its settings Council settings, offers Start a council beside Join another chapter, and reads a council by its type in the switch list. _(#5946 by pdcarlson, 2026-11-24: the council's home sat in the shell's empty view, which #5946 deleted; on New pending Paul.)_
There is no Polls row: polls live in the channel where they were made, and the chapter-wide `/polls` list, which could only show the older REST poll shape no client creates any more, was retired ([#3871](https://github.com/pdcarlson/Frapp/issues/3871), Shawn, 2026-11-09).
Officer setup and officer tools sit behind Chapter settings; there is no Admin group ([#2946](https://github.com/pdcarlson/Frapp/issues/2946)).
It was named Settings until 2026-11-10: it is the chapter's, and a member's own settings are a separate page on the member's menu ([§ Two doors](#two-doors-chapter-settings-and-your-settings), [#3856](https://github.com/pdcarlson/Frapp/issues/3856)).

Recorded decisions this layout changed, kept for their reasons:

- A Chat anchor of two rows, Chat and Direct messages ([#3774](https://github.com/pdcarlson/Frapp/issues/3774), Shawn, 2026-11-12;
  [§ Chat](#chat)), two member sections (Chapter, Resources), and one unlabeled group holding Directory (Billing left it for Chapter settings' Plan and billing row in [#3827](https://github.com/pdcarlson/Frapp/issues/3827)).
  Changed in #5946 by pdcarlson, 2026-11-24: no anchor and no sections; the five homes above, the channel list in the sidebar, and Messages a page of its own.
- Chapter settings has no row: it opens from the chapter menu atop the nav, the crest and chapter name, which leads with Chapter settings, then Join another chapter (and the member's chapters to switch between, when there is more than one). _(Paul, 2026-11-19: one place, not a menu item and a row. The row sat in this group from #2946 to then. The phone matches: [`../mobile/navigation.md`](../mobile/navigation.md).)_
  Changed in #5946 by pdcarlson, 2026-11-24: it opens from the member's menu at the sidebar's foot, still its one door, with Join another chapter and the chapters to switch to; the chapter's name atop the sidebar is a label.

| Place    | Row           | Route                                       | Module                                          | Permission                                                                                                                                                                                                                                      |
| -------- | ------------- | ------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| _(lead)_ | New           | `/ask`                                      | —                                               | — (each action under it follows `availableNewActions`; the field needs Frapp Intelligence)                                                                                                                                                      |
| _(lead)_ | Search        | — (opens the Find dialog)                   | —                                               | — (each result group follows its own gate, [§ Top bar](#top-bar))                                                                                                                                                                               |
| Home     | Activity      | `/activity`                                 | — (each of its sections follows its own module) | —                                                                                                                                                                                                                                               |
| Home     | Messages      | `/messages`                                 | —                                               | —                                                                                                                                                                                                                                               |
| Home     | Calendar      | `/events` (the row was Events until #5946)  | `events`                                        | —                                                                                                                                                                                                                                               |
| Home     | Resources     | `/documents`, or `/backwork` in a chapter with only Backwork on (lit on both, on `/backwork/upload` and on `/meetings/<id>`; `/meetings` redirects to `/documents?type=minutes`) | Documents view: `documents` or `meetings`; Backwork view: `backwork` (`views`) | — (every member while its Documents view is open; Backwork view `backwork:upload` or `backwork:admin`; a minutes row follows the meeting's audience, [`chapter-docs.md` § Minutes](../../behavior/chapter-docs.md#minutes)). No setup gate since #5949 |
| Home     | Chapters      | `/chapters`                                 | —                                               | `members:view`, in a council only (`kinds: ["council"]`, #5974); acting needs `council:chapters_manage`. Hidden until the tenant kind is known                                                                                                  |
| Home     | Directory     | `/members`                                  | —                                               | `members:view`                                                                                                                                                                                                                                  |
| More     | Recruitment   | `/rush`                                     | `rush`                                          | `members:view` and `rush:view` (`requireAllOf`). The row reads the chapter's word (Rush, Recruitment, Intake); added in #5924 by `gampheadband`, 2026-11-23 ([§ Recruitment](#recruitment))                                                     |

Meetings and Backwork have no row: they are Resources since #5949 (its minutes rows and its Backwork view). _Changed in #5949 by pdcarlson, 2026-11-24: they were rows under More from #5946, and before it a Resources section of three rows, Meetings, Documents and Backwork._

Points, Study hours and Service hours have no row: standing is a fact about a person, so it is read on the person (#5950, Paul's pick, 2026-11-24, on epic #5943).
`/points`, `/service` and `/study` only redirect to the member's own panels on Profile (`/profile?open=points|service|study`, [§ Profile](#profile)); the standings are Directory sorts ([§ Directory](#directory)), reviewing hours is Activity's, and the chapter's points ledger and reviewed service entries are tools in Chapter settings ([`../../behavior/points.md` § Where points are read](../../behavior/points.md#where-points-are-read)).
_Changed in #5950 by pdcarlson, 2026-11-24: they were rows under More from #5946, and the Chapter section's last three rows before it (Study hours hidden while the chapter had no active study zone)._

**Behind Chapter settings.** The member menu's Chapter settings item shows when Chapter settings holds a tab or a tool for the viewer ([`../../behavior/settings/README.md`](../../behavior/settings/README.md#who-sees-what) § Who sees what).
These were the Admin group's rows until #2946, and each has one stated path.
The four tools keep the permission and module gate each had as a row.
The Roles tab opens a little wider than its row did: it also admits `chapter-config:view`, since anyone who could open Settings before could see it.

| Destination      | Route                                                                                      | Path                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Roles            | `/settings?tab=roles` (`/roles` redirects)                                                 | Settings → Roles tab                                                                                                                                                                                                                                                                                                                                                                                                              |
| Plan and billing | `/settings?tab=billing` (`/billing` redirects by permission)                               | Settings → Plan and billing; the sidebar's Billing row until #3827. The plan table and member invoices open as pages of their own (`&page=plan`, `&page=invoices`; #6031)                                                                                                                                                                                                                                                       |
| Chat Admin       | `/settings?tab=chat&page=chat-admin` (`/chat-admin` redirects, keeping `?channel=`)      | Settings → Chat → Chat admin, a row on the Chat page that opens its page with a back arrow (#6030): the channel tree, then Chat background and Reports as rows that open pages of their own (#6031). The `chat_reports` notification deep-links to the queue's page (`/settings?tab=chat&page=reports`), and a channel start's `Edit channel` / `Add a description`, or the rail's right-click Edit channel, opens `/settings?tab=chat&page=chat-admin&channel=<id>`, that one channel's page, in place of Chat admin with a back arrow |
| Discord Import   | `/settings?tab=chat&tool=discord-import` (`/discord-import` redirects, keeping its params) | Settings → Chat → Discord import, a row on the Chat page that opens it in place of the page with a back arrow |
| Study Zones      | `/settings?tab=geofences&page=study-zones` (`/geofences` redirects)                       | Settings → Study zones → Zones, a row on the module page that opens the zone list with a back arrow (#6030); New or Edit opens the map editor docked in place of the list (Paul, 2026-11-12: opening a tool must not leave Chapter settings) |
| Reports          | `/settings?tab=reports&page=reports` (`/reports` redirects)                               | Settings → Reports → Export a report, a row on the module page that opens the export form with a back arrow (#6030) |

No officer tool keeps a route of its own (#3837, Paul 2026-11-12: "I want to phase those out"): each opens inside Chapter settings, so the rail stays on screen and chat does not come back beside it.
A page opened in place of a module page (a channel's settings, Discord import) heads itself with a back arrow to that page, and the lit rail row also goes back to it, as Discord's server settings and iOS Settings do.
Switching rows drops the params that opened such a page.
The paths live in `apps/web/components/settings/settings-paths.ts`.
Who gets which tab and tool is owned by [`../../behavior/settings/README.md`](../../behavior/settings/README.md#who-sees-what) § Who sees what, and in code by `apps/web/components/settings/settings-access.ts`; neither list is restated here.

Five structural facts the table alone does not carry:

- **Chat is not a row.**
  `/`, `/dashboard` and the route-group index land on `/chat`, the open conversation ([§ Gating & routing semantics](#gating--routing-semantics)), and the chapter's channels are the sidebar's own list, always in view, so a pick opens one.
  Below `lg`, where the sidebar is a drawer, a Channels row links to `/chat` where the column holds the list.
- **The channel list keeps room for eight rows at 1024×768, with every row showing.**
  Each fixed row costs 30px (the 28px Row step plus the 2px gap) taken from the list; a channel row is 28px, a category heading about 28px at most and the list's top gutter 12px, so eight rows under one heading need 264px.
  _(Changed 2026-11-26 by Paul, [#6115](https://github.com/pdcarlson/Frapp/issues/6115): rows were 34px and channel rows 32 until the control size scale moved one step denser; the room measured for the demo president on the local stack went from 348px to 396px, enough for about twelve one-line rows under one heading.)_
  [`apps/web/tests/visual/nav-fit.spec.ts`](../../../apps/web/tests/visual/nav-fit.spec.ts) fails the required `web-responsive-floor` job when the list is given less.
  The harness runs sessionless with an owner's `*` permissions stubbed and the chapter read held open, so every permission and module row shows, More included: more rows than any seeded role sees.
  It measures the room the list is given rather than drawn rows, because the list needs a signed-in chat; the room was about 348px when #5946 added the test.
  A new destination finds a home inside an existing row (a tab, the member's menu, or Chapter settings) rather than growing the list.
  It replaced the rule below, kept for its reasons:
  - **The nav fits a 1024×768 window for every seeded role.**
    Each row costs 36px (34px plus the 2px gap) and a section heading about 37px, against a 666px nav region at a 768px window.
    Before #2946 a President's 17 rows needed an 828px window and scrolled by 60px at 768.
    Folding the six-row Admin group into the Settings row took them to 12, which fit from a 613px window.
    [`apps/web/tests/visual/nav-fit.spec.ts`](../../../apps/web/tests/visual/nav-fit.spec.ts) fails the required `web-responsive-floor` job when the list no longer fits.
    The harness runs sessionless with an owner's permissions stubbed and the chapter read held open, so it measures every row at once.
    A new destination finds a home inside an existing row (a tab, or Settings) rather than growing the list.
    Paul chose this shape and its follow-ups on 2026-09-30; the options and evidence are recorded on #2946.
    _Changed in #3897 by shawnatomklein-eng, 2026-11-10:_ the Activity row is a new destination that grows the list to 13 rows (36px more, still inside the 768px window; `nav-fit.spec.ts` measures it).
    Paul green-lit the page on #3897 and Shawn chose its own nav row over growing it out of chat; the rule stands for other destinations.
    Changed in #5946 by pdcarlson, 2026-11-24: with the channels in the sidebar the rows no longer need to fit a window but to leave the list its eight rows (above), and `nav-fit.spec.ts` asserts that instead.
- **Visibility is derived, never declared.**
  `isNavItemVisible` (`apps/web/components/layout/protected-nav-item.tsx`) is the one question every row asks, and More asks it of its own rows, drawing nothing when none survives.
  `protected-nav-item.spec.tsx` pins the five homes and their order, that an ordinary member sees each of them less what Directory's permission and Resources' setup gate hide, and that no Chapter settings, officer-tool or chat row comes back.
- **Chapter settings is gated on "has anything here".**
  An ungated entry point sent members without `chapter-config:view` to a screen that could not load, which is the fail-fast rule in [`../design-system/README.md`](../design-system/README.md) §5 inverted.
  The member menu's Chapter settings item, its one door since 2026-11-19 (on the chapter menu until #5946), shows only when Settings holds a tab or a tool whose module is on for the viewer (`hasSettingsDestination`, `apps/web/components/settings/settings-access.ts`).
  A treasurer whose only tool is Reports loses the item when the chapter switches Reports off, as the Reports row used to hide.
  Until 2026-11-19 a nav row asked the same question through `NavItem.showWhen`; both went with the row.
- **Profile left the nav** for the account menu (below).
  It is about the viewer, not the chapter, so it did not belong among chapter surfaces.
  It held two chapter-scoped cards until 2026-11-10: Notifications (#564), because `notification_preferences` is keyed `(user_id, chapter_id, category)`, and Blocked members (#2313), because a chat block is per-chapter too.
  Both are sections of the personal Settings page now, in its "In _chapter name_" group, and each still states its own no-chapter rung ([§ Two doors](#two-doors-chapter-settings-and-your-settings)).

**Directory is one screen with two tabs.**
`/members` hosts `?tab=members|alumni` (`apps/web/components/members/directory-page.tsx`), and `/alumni` redirects into `?tab=alumni`.
Actives and alumni are one directory; asking a member to know which list a person is on before they can look them up was the defect.
The redirect keeps existing links and bookmarks alive, the same shape `/roles` uses to reach Settings → Roles (role IA canon: [`spec/behavior/settings/customization.md`](../../behavior/settings/customization.md)).
`nav-config.ts` remains the source of truth for what renders.
Every row links to a built route; the nav draws no roadmap entries, since a disabled row with nothing behind it is a dead-end control (the `Soon`-chip branch was deleted unused, #3089).

**The actives tab shows presence.**
Each row carries a presence dot on the avatar (Online, Idle, Do Not Disturb, or Offline;
the shapes are [`components.md`](../design-system/components.md) § Chat member list), and the member's custom status line under their name, from the chapter-scoped Realtime Presence topic specified in [`../../behavior/chat/README.md`](../../behavior/chat/README.md#messages) § Messages.
Three rules it follows, each of which is the interesting case rather than the happy path:

- **No dot is not Offline.**
  Before the first presence `sync` lands, and whenever the network provider reports offline, no dot renders at all.
  Offline is a claim about _that member_; rendering it from our own unfinished join or our own dead socket would state something false about every person on the screen.
- **Colour is not the only carrier — for the Online/Idle pair.**
  Online is a filled dot and Idle is a ring, because `--success` and `--warning` are the green/amber pair colour-vision deficiency collapses; the ring's interior is opaque so an avatar photo cannot show through and make Idle read as filled.
  Online and Offline are separated by colour and opacity alone, which is acceptable only because the status is also _named_.
  The row is a button, and an `img`-role descendant would be absorbed into its accessible name and silently rename it as presence changed, so the dot is `aria-hidden` (`AvatarPresenceDot` has no labelled variant) and the row's own `aria-label` carries the status last, in a fixed position.
  Whatever renders the dot owns announcing the status.
- **No stale roster can be rendered as current**, and it takes two mechanisms because there are two ways to go stale.
  A teardown _we_ initiate is covered by an attach **generation** bumped in render whenever the inputs that mint a channel change — a counter rather than a stamp of the inputs themselves, because the inputs come back: a wifi flap takes the subscription down and up with the chapter unchanged, so an input-derived stamp would match again on the way back and re-adopt the pre-outage roster.
  A channel that simply _stops_ is the other way, and the generation cannot see it: a socket drop that never flips `navigator.onLine` leaves every input unchanged, so the transport has to say so — the subscription reports its own disconnection and the roster stops counting as evidence until it re-joins and re-syncs.
  From the inside, a quiet channel and a dead one look identical.

The **publisher is the dashboard shell, not this screen** ([`apps/web/lib/providers/chapter-presence-provider.tsx`](../../../apps/web/lib/providers/chapter-presence-provider.tsx)).
A member is present because the app is open, not because they are looking at the Directory — scoping the tracking to the reading screen would make the dot mean "has the Directory open" and render everyone in Chat as Offline.
It also keeps the topic to one channel: `attachRealtimeChannel` frees an occupied topic before minting, so a second subscriber would tear the first one down.

## Account menu

`apps/web/components/layout/account-menu.tsx` is the member at the sidebar's foot and the one menu they open (#5946, Paul, 2026-11-24: "copy the entire Claude sidebar system where the user lives at the bottom and we have a menu with more settings for the user and organization").
The row is the member's avatar with their presence dot, their name, and under it their custom status when they have set one, otherwise their presence in words ("Online", "Do Not Disturb"), as Discord's user panel reads; in the rail it is the avatar alone.
Below `lg` the same component is the drawer's foot, so a change to its contents reaches both.
It is one menu for the member and the chapter, in this order:

1. The member's name and email.
2. Theirs: Status and the custom status line (2026-11-09, #3845: first, because it is the row a member reaches for before practice, as on Discord and Slack), Profile, and Settings (`/preferences`, the member's own settings page;
   it replaced the "Notification settings" link into `/profile` on 2026-11-10, [#3856](https://github.com/pdcarlson/Frapp/issues/3856)).
3. The chapter's: Chapter settings, whenever Settings holds something for this viewer ([§ Navigation map](#navigation-map)), then School and council for a chapter's holders of `chapter-config:view` ([§ Council and school links](#council-and-school-links), #5974), Join another chapter, and the member's other chapters under "Switch chapter".
4. What's new (`/whats-new`, the changelog members read, from `RELEASE_NOTES` in `@repo/validation`, the same list as mobile Settings → What's new;
   2026-11-07;
   [§ What's new](#whats-new) has its unread dot), and Sign out.

A separator divides the groups.
Until #5946 identity and chapter were two menus: this one on the top-bar avatar and as a row at the foot of the drawer, and the chapter's on the crest and name atop the nav (`chapter-nav-header.tsx`, deleted), which Paul's note of 2026-11-19 made the one door into Chapter settings ([§ Navigation map](#navigation-map)).
It replaced three scattered affordances in the same change — the Profile nav row, the header's bare `Sign out` button, and the standalone header theme toggle — rather than shipping beside them.
The theme control it absorbed was itself deleted with `next-themes` in the #920 shell slice: the surface is dark-only, with no user-facing theme switch.
That was half-true until the Profile & pre-auth slice — `/profile` still shipped a light/dark/system `Select` writing `user_settings.theme`, a field nothing on any surface has read since `next-themes` left.
The control is gone; the orphaned API field is tracked separately.

- **Status** is a submenu row showing the member's current status (its dot, its name, and "Until 3:45 PM" while it has an end).
  It opens Online, Idle, Do Not Disturb and Invisible, each with its dot.
  Do Not Disturb opens its own submenu: Until I turn it off, For 1 hour, For 8 hours, and Until tomorrow (with the time it ends, 8:00 AM).
  Until I turn it off is the default and comes first, because a submenu row can only open its submenu, never select: opening it puts focus on the first row, so Enter takes the default.
  Do Not Disturb says "Only urgent notifications ring" and Invisible "You'll appear offline", each as a caption under its name.
  The current status carries a check.
  Where the window has no room to the right, Radix opens a submenu to the left, over the menu it came from.
- **The custom status row** reads "Set a custom status", or the line itself once there is one, and opens a dialog: one field (placeholder "At practice till 6", a code-point counter to 80, one line), "Clear after" (30 minutes, 1 hour, 4 hours, Today, Don't clear;
  Today the default), and Save, Cancel and, with a line set, Clear status.
  A field inside the menu was the alternative; the dialog is what Discord and Slack do, because a text field fights a menu's typeahead and arrow keys.
- **Both rows are disabled while the dashboard is offline**, as the Profile notification switches are ([`notifications.md`](../../behavior/notifications.md) § Preference sync), and until the member's settings have loaded.
  A pick saves optimistically through the shared settings mutation, so the dot moves on the click; a refused save rolls back and toasts.
- **Your own dot sits on the avatar** that opens the menu, in both variants, and the trigger's accessible name ends with the status ("Account menu for Paul Carlson, Do Not Disturb").
- **While the member's own record is still being read** the row draws an avatar disc and a name bar, and the menu's head a name bar, never a stand-in name or initials (#6121, 2026-11-26: "Your account" with "YA" read as an account nobody had linked).
  The trigger is then named "Account menu", with the status when the dot shows one.
  Only a read that failed, can't run, or waits for a connection names the row "Your account", with a person glyph in the avatar.

## What's new

What's new opens by itself once after an update, as on the phone (2026-11-09, [#3943](https://github.com/pdcarlson/Frapp/issues/3943)).
The rule is the phone's, one function both surfaces call (`decideWhatsNew` in `packages/validation/src/release-notes.ts`), and [`mobile/screens.md` s16](../mobile/screens.md) describes it: which entries show, what counts as newer, and why a new member is shown nothing.
This section holds only what is the web's own.

- **Lines for both first, then Web and Mobile.**
  An entry lists the changes members get everywhere, then the web-only ones under a Web subheading and the phone-only ones under Mobile, the same on the phone, the public changelog and the pasted text (`releaseNoteGroups`; Paul, 2026-11-12: "just 2 subheadings").
  Entries from before 2026-11-12 are one list.
- **The latest deploy's lines stand out**, in the dialog and on the page, as on the phone ([`mobile/screens.md` s16](../mobile/screens.md) states the rule; Paul, 2026-11-16).
  The browser keeps its own memory of the last deploy's newest entry ([`lib/whats-new-fresh.ts`](../../../apps/web/lib/whats-new-fresh.ts)), worked out on every page load by the host so a deploy counts even when the notes aren't opened on it.
- **A dialog, not a sheet**, mounted in the dashboard shell ([`whats-new-host.tsx`](../../../apps/web/components/whats-new/whats-new-host.tsx)).
  It holds the entries this browser hasn't shown, drawn as the What's new page draws them, and scrolls inside itself when they run long.
  Esc, the X and a click outside close it.
  It has no Got it button, which would be a second close ([`components.md` § Chrome weight](../design-system/components.md#chrome-weight)); its one action is See all updates, to `/whats-new`.
- **"Seen" is kept per browser** (`localStorage`, [`lib/whats-new.ts`](../../../apps/web/lib/whats-new.ts)), as the phone keeps it per phone, **and on the account** (#4043).
  The first device a member opens after an update shows the notes in full; a browser whose account has already seen the entry it would open doesn't open it, and marks the account menu's row instead until What's new is opened there.
  [`mobile/screens.md` s16](../mobile/screens.md) states the rule for both.
  Before #4043 nothing on the account recorded it, so an entry read on the phone showed once more on the web, and once more in each new browser.
  - Changed in #4043 by shawnatomklein-eng, 2026-11-11: once per account, with a quiet mark on the other devices, where #3943 kept it once per browser.
- **A new member is whoever's account is no older than the newest entry**, or whose welcome card is due in this browser (#5627; the first-run tour's mark until then).
  A browser holds nothing that tells an old install from a fresh one, which is what the phone goes by, so the account's age stands in.
  For them the entry is recorded without being shown.
  The stand-in has a known gap: someone whose account is older than the newest entry but who reaches the dashboard for the first time without the welcome card (a founder who signed up days before finishing the chapter wizard, or a member who onboarded on the phone) is shown the newest entry once.
- **It never covers a flow in progress.**
  Nothing is decided until the member has a chapter, so the chapter wizard is never interrupted; join links and sign-in are outside the shell.
  When it is time to open, it stands down if a dialog or menu is already up (the Terms prompt, an invite, anything the member opened), on Chapter settings (Plan and billing there is a checkout landing, and the shell reads only the pathname, so the whole route stands down, as the first-run tour did until #5627;
  `CHECKOUT_LANDING_PATHNAMES` in `billing-paths.ts`) and on `/whats-new` itself.
  A stood-down entry stays unread and the next navigation tries again.
- **The account menu's What's new row carries a dot while an entry is unread**: the neutral `--foreground` dot every unread mark uses.
  It clears when the dialog opens or the member reads the What's new page, whichever comes first.
  When another device showed the entry first (#4043) the dot is all there is, and it stays across reloads until the member opens the What's new page.

## Top bar

**There is no top bar from `lg` up** (#5946, Paul, 2026-11-24).
It held the page title, the Find field, the connection pill, the bell and the account avatar across 48px of every route, above every conversation.
Each has a home in the sidebar now ([§ Navigation map](#navigation-map)): Search is a row, the pill and the bell sit in the sidebar's head, the member is at its foot, and a page's title is in the page's own header.

Below `lg` the sidebar is a drawer, closed most of the time, so a 48px bar ([`top-bar.tsx`](../../../apps/web/components/layout/top-bar.tsx)) stays for what has to be reachable without opening it: the drawer trigger, with a dot while a conversation has something unread ([`components.md` § Sidebar item](../design-system/components.md#sidebar-item)), the page title, the Find field, the connection pill in a fixed 28px slot while there is a connection problem to report ([`connection-state.md` § One indicator](../resilience/connection-state.md#one-indicator)), and the bell.
It holds no account avatar: the member's row is the drawer's foot, and one menu is the rule.
(The ✦ Ask entry sat in the bar until #4702, and the avatar until #5946.)

- **The page title** (2026-11-05, reversing #2141's "titles not in top bar" at the owner's request, where board `1f` pin 1 drew it, "Page title in the top bar").
  It is the route's only `<h1>`, at `label`/700, derived from the route ([`page-title.ts`](../../../apps/web/components/layout/page-title.ts)) rather than passed up by the page, so the loading, offline, error and denied paths all carry it.
  **From `lg` up it is in the page's own 48px header** ([`tool-page-header.tsx`](../../../apps/web/components/layout/tool-page-header.tsx)), with the page's actions and its X, lined up with the sidebar's head and chat's channel header (2026-11-11, Paul asked for a way to close the panels on the right; from the side-by-side width until #5946).
  Below `lg` it is in the top bar's left cell.
  CSS shows one copy or the other, so the first paint is right before the width is known.
  On `/chat` and `/messages` from `lg` up there is no page header, so the `<h1>` ("Chat", "Messages") is read, not drawn: the channel header, or the Messages list's own title, already says where the member is.
  The words are the nav row's label, so the row a member clicked and the heading they land on match, and each route's `metadata.title` (the browser tab) uses the same words; `page-title.spec.ts` checks the two against each other.
  Resources reads "Resources" on Documents and Backwork alike (#5949); `/ask` reads "Frapp Intelligence", or "New" for a member without it.
  A page under a nav row that reads as its own step shows that row as a link and a chevron, going back to the page it came from: "Resources › Bulk upload" back to Backwork, and "Resources › Minutes" back to the chapter's minutes (`SUB_PAGE_TITLES`, `RECORD_PAGE_TITLES`). The link shows only to a viewer who can open the page it goes back to, and below `sm`, where the crumb is hidden, the page carries its own back link;
  a top-level route shows its title alone, with no chapter-name prefix, because the chapter's name heads the sidebar beside it.
  Below `sm` the top bar's title is visually hidden and stays the `<h1>` for a screen reader: a 390px bar has room for the drawer trigger, the find field and the right cluster only, and sharing it cut both the title and the field to a stub.
  From `sm` up it truncates rather than wrap the bar.
  A route `page-title.ts` does not know gets no title rather than an invented one.
  Mobile keeps its in-screen titles ([`../mobile/patterns.md`](../mobile/patterns.md) § Screen headers).

- **Find** ([`find-bar.tsx`](../../../apps/web/components/layout/find-bar.tsx), [`find-dialog.tsx`](../../../apps/web/components/layout/find-dialog.tsx)) is a centered dialog, opened from the sidebar's Search row from `lg` up, from the top bar's field-shaped button below it, and by Cmd/Ctrl+F or Cmd/Ctrl+K on every route (Cmd/Ctrl+K also from the chat composer, where a Mac's Ctrl+K stays with the field; Cmd/Ctrl+K opens it empty).
  The dialog searches channels, settings, members, messages, events and backwork, in that order (settings since 2026-11-19, [`../../behavior/settings/README.md` § Search settings](../../behavior/settings/README.md#search-settings)), with filter chips to narrow to one group, and every dated row carries its date: a message its sent day, an event its start, a backwork file its course, term and the day it was added ([`find-results.ts`](../../../apps/web/components/layout/find-results.ts)).
  Events and Backwork drop out when the chapter switches their module off (and stay out while that setting is still loading), and Backwork also drops out for a member without `backwork:upload` or `backwork:admin`, whom `/v1/search` sends no backwork rows either ([`search.md`](../../behavior/search.md)).
  Before anything is typed it lists the member's unread channels, then the ones this browser opened lately, and one or two letters list the channels they match at once, with no chips; a search starts from three letters ([`search.md` § Jump to a channel](../../behavior/search.md#jump-to-a-channel), #6053).
  Typing on the focused field opens the dialog with that text, as it would in the field it looks like.
  It replaced the ⌘K `cmdk` palette, which is deleted, and the chat channel list's own search field, which went with it.
  It carries **no navigation list**, so nav gating stays in one place (`nav-config.ts` and `isNavItemVisible`); a hand-maintained list of destinations here would be the defect the palette's derived list once fixed.
  Its Channels group lists channels only: a DM's stored `name` is not the participant's name, so typing a person finds the member, not the DM ([#2220](https://github.com/pdcarlson/Frapp/issues/2220); DMs left the group in #6053, where they had matched only on fragments of that stored name).
  An event row opens the event (`/events?event=<id>`, #6043) and a member row opens the member (`/members?member=<user id>`, #6046), [§ Addresses](#addresses); backwork rows open their route, not the item, until that route takes one.
  `cmdk` stays a dependency, because the slash palette and the onboarding wizard still use `components/ui/command.tsx`.
  **It departs from the board on three points** (Paul, 2026-11-05).
  It shows no `⌘F` / `esc` keycap, because a visible way in is always on screen (the field, and since #5946 from `lg` up the Search row) and the shortcut is a convenience rather than the way in.
  The field fills with `--surface-1`, the bar's own surface, rather than the board's `--card`, so it reads as part of the bar instead of a raised card on it.
  And the results open in a centered dialog rather than under the field (`1b` drew a visible field with no palette): the dropdown had no room for dates, full message previews or the two extra groups, and leaving Backwork out meant a search for a file that existed answered "No matches.".
  A visible entry stays the way in, so the board's reason for dropping the palette, a search you had to know a shortcut to reach, still holds.
  **Find is not Ask:** Find lists places to go from everything the member can read, chat included, in neutral chrome; Ask answers a question from official sources only ([`../../behavior/ai.md`](../../behavior/ai.md)), its source markers in house gold.
  On web Ask opens as its own card over the chat (a panel until #4702), not inside this dialog.
  (Changed in #4904 by pdcarlson, 2026-11-13: the two are still different things, but Find's field is now the way into Ask and its dialog's first row asks; next bullet but one.)
- _Renamed 2026-11-24 (Paul, #5945): the assistant and the umbrella once called Ask Frapp and Frapp AI are Frapp Intelligence; older notes below keep the names they shipped with._
- **Ask is not in the top bar** (changed in #4702 by pdcarlson, 2026-11-13; Paul: no "ask button" in the corner and no "side card", because "it's in the channels, and that's where we want everything to live anyway").
  Its entry is the **Ask Frapp button in the chat composer** (`components/ask/ask-host.tsx`): the crest in the chapter accent and the words "Ask Frapp", the accent's Tinted recipe at the Small step, after the composer's help mark; below `sm` the crest alone, named for a screen reader.
  In a channel the member can't post in, it sits at the end of the line that says so.
  It is drawn only when the server has AI, the chapter's president has Ask on, the member holds `ai:use`, and no officer is viewing the chapter as a role; until all of that is known there is no button, and it arrives in a row whose height it does not change.
  A server with no AI draws no Ask entry anywhere (the pill's "Ask isn't ready yet" popover went with the pill).
  **The conversation opens over the chat** (`components/ask/ask-card.tsx`), rising from the composer across the thread's width with no scrim, the way the composer's + card does: the channel header, the messages above it and the composer under it stay live, and a member can type in the channel with it open.
  Microsoft Teams puts Copilot in the compose box and WhatsApp puts Meta AI in the chat's own field, and both open over the conversation.
  It is one conversation for the whole dashboard: it is the same thread in every channel and after a tool page covered the chat, and with no chat on screen it waits.
  Following a source opens its page beside the chat and leaves the answer open, with two exceptions: a cited chat message is in the thread the card covers, so following one closes the card (the conversation is kept, and the button reopens it);
  and below 1056px, where a page takes chat's place, the card waits with the chat and is there when chat returns.
  The card is drawn on the page's own background, not the raised popover grey, and above an answer sit its folded steps and under it the sources and quiet icons (the read line under it went in #5427) (Paul, 2026-11-13; [`../design-system/components.md`](../design-system/components.md) §11).
  Size, surface and dismissal: [`../design-system/components.md`](../design-system/components.md) § Surface size.
  The two bullets below describe what shipped until then and are kept for the thread's own rules (turns, markers, chips, the saved line, consent), which did not change.
- **Ask is the top bar's find field** (changed in #4904 by pdcarlson, 2026-11-13; Paul, on the composer button once it shipped: "Looks soooo out of place.
  Need to rethink the UI around Frapp AI", then his pick of one field for search and Ask from three options drawn on the real screens).
  This replaces the entry and the placement the bullet above describes; who gets Ask, the one conversation for the whole dashboard and what is inside it stand.
  For a member with Ask the field reads "Search or ask Frapp" (`components/layout/find-bar.tsx`), and the Find dialog's first row is the crest in the chapter accent, "Ask Frapp" and what they typed (`find-dialog.tsx`).
  Choosing it closes Find and opens the conversation in Find's place, with the question already asked: the same width, distance from the top, surface and scrim, a real dialog that Escape or a click outside closes (`components/ask/ask-card.tsx`).
  With nothing typed the row opens the conversation as it stands.
  **Which row Enter means is read from the words alone** (`find-ask.ts`), never from results arriving, so the highlight cannot move under a keypress: text that ends in a question mark, opens with a question word, or runs to four words starts on the Ask row;
  anything else starts on the first result, with no row lit while a search is still loading;
  the Ask row takes over only when there is nothing to search for or a search settled empty.
  The other row is one arrow key away.
  A plain click on any link in the thread (a source, a channel an answer names, the page a confirmed card leaves for) closes the dialog, since what it opens is under it; the conversation is kept and the field reopens it.
  The composer has no Ask control, and `@Frapp` typed in a channel still asks from there.
  A member without Ask gets the field and the dialog as they were.
  Slack's search field and Linear's and Notion's command menus take a question the same way.
  Changed in #5476 by pdcarlson, 2026-11-18: the field no longer asks (next bullet). The dialog, the conversation in it and the link rule above stand, except that the Ask bar, not the field, reopens the conversation.
- **Ask is a floating bar; the field only finds** (changed in #5476 by pdcarlson, 2026-11-18; Shawn: "I don't like that asking frapp is in the search bar", Paul: "I don't like it either", then his pick of a floating bar from three options drawn on the real screens; the others were a button beside the field and a row at the top of the nav).
  The top bar's field reads "Find channels, members, messages and more" for everyone, as it always did for a member without Ask, and the Find dialog has no Ask row: Enter opens the highlighted result (`find-ask.ts` and the Ask row are gone).
  For a member with Ask, the phone's Ask bar is on web too (`components/ask/ask-bar.tsx`): a 48px glass capsule (§ Glass in `foundations.md`, its edge in the chapter accent at 30%) with the crest in the chapter accent, "What do you need?" and the send arrow on the accent's tint.
  From `lg` up it has one place on every layout: the foot of the sidebar, where it shares one 34px row with the collapse toggle, reading "Frapp Intelligence" in the Small type step with no send arrow (the name is too wide for the row otherwise, #5945) and filling the row while the toggle is a 34px glyph at its end, named "Collapse sidebar" in its label and tooltip; in the rail it is the crest alone in a 34px round button above the expand toggle (`app-nav.tsx`). One row, not two, so a full sidebar still fits 1024×768 (§ Responsive). It covers no page, so no page makes room for it, and it doesn't move as chat or a tool opens and closes.
  Changed in #5560 by pdcarlson, 2026-11-19 (Paul's pick, after Shawn: "not a fan that ask frapp moves around depending on what windows you have open"): until then it floated over whichever column was open, the tool page, the home view, or the foot of the Channels column, and covered the last row of a page with its own scroll box.
  Below `lg`, where the shell is one page with no sidebar, it floats 24px above the bottom of the tool page, centred, at most 520px wide, and the page leaves 96px under its last row so nothing stays under it (`dashboard-shell.tsx`). With chat alone it sits at the foot of the Channels column instead and reads "Frapp Intelligence", never over a channel: the message box owns the bottom of a channel, and asks there through `@Frapp` ([`../../behavior/ai.md` § Asking from a channel](../../behavior/ai.md#asking-from-a-channel)).
  A click opens the conversation in the same dialog as before, and focus comes back to the bar when it closes, or to another Ask bar on screen when that one is gone or hidden.
  Changed 2026-11-22 (Paul's pick, after "too small and not smooth"; next bullet): a click opens the Ask page instead.
  Below `lg` with a channel open, the channel fills the screen and there is no bar: the member asks there with `@Frapp`, as on the phone's channel screen, or goes back to the channel list for the bar.
  Below `lg`, a control a page pins to its own bottom sits above the bar (`--ask-bar-room`, as the Discord import's selection bar does).
  The bar's glass falls back to plain `surface-1` with the hairline under Reduce Transparency, and its accessible name is its own words.
  A member without Ask gets no bar.
  The phone's own bar (s17) is the model; ChatGPT's and Perplexity's home screens open their assistant from a bar shaped like its field the same way.
  Changed in #5946 by pdcarlson, 2026-11-24: the bar is deleted (`ask-bar.tsx`); the sidebar's New row opens the page (below).
- **Ask is a page, chat beside it** (changed 2026-11-22, Paul's pick from three drawn options after "I think we should rethink the chat UI for frapp AI in the web. Currently too small and not smooth."; the others were a bigger dialog with an Expand button, or the dialog as it was).
  The Ask bar opens `/ask` (`app/(dashboard)/ask`, `components/ask/ask-page.tsx`) in the main area, the way the sidebar opens Events: a tool page, with chat beside it at the width the member set, and no scrim, so the app around it stays usable and a member can ask while reading a channel.
  Its header is the shell's tool header: "Frapp Intelligence", the app's New button ("New conversation") once there is a turn, and the X; Escape on the page closes it as on every page beside chat, and from the field only while it is empty, so a half-typed question is never lost to Escape.
  The thread and the field keep to one centred column of at most 720px, the field pinned under the thread, as ChatGPT, Claude and Gemini draw theirs, on a page that runs edge to edge so the thread's scrollbar sits at the page's edge; below the side-by-side width it is the whole page, and below `lg` no Ask bar floats over it.
  On the Ask page the bar is marked as the page on screen (`aria-current="page"`), and a click on it puts the cursor back in the field. The field takes focus when the page opens, and keeps what was typed when the member leaves and comes back. While whether the member has Ask is still being read (a reload of `/ask`), the page holds the field's place with a loading line instead of standing empty.
  Links in the thread are ordinary links: following one leaves the page, and the bar brings back the same thread. A question still being answered goes on being answered when the member leaves, and is there when they return (until then closing the dialog dropped it). Edit on an event card grows the card into the event form in place; New conversation waits while it is open, and the view shows the form's top rather than following the end.
  The conversation is the same one (`AskHost`), kept across pages and gone on reload until kept conversations ship (#4704). A member who loses Ask on the page (a role preview, Ask turned off) is taken to chat.
  This replaces the dialog the bullets above describe (Find's 640px, 12vh down, 76vh tall, over a scrim, #4904); what is inside the conversation stands.
  Changed in #5946 by pdcarlson, 2026-11-24: the page stays and loses its bar; the sidebar's New row opens it, as the next bullet says.
- **New is the start view, and the bar is gone** (changed in #5946 by pdcarlson, 2026-11-24; Paul: "a universal new button which opens a chat with Frapp Intelligence", and the direct actions sit under the field).
  The sidebar's first row, New, opens `/ask` ([§ Navigation map](#navigation-map)), and the floating Ask bar (`ask-bar.tsx`) is deleted; `/` still lands on chat's last channel.
  For a member with Frapp Intelligence the page opens on the day and a greeting, the field ("What do you need?"), then what New starts, under the field, then the suggestions.
  The actions are New minutes, New event, New task, New message, Log hours and Upload: `WEB_NEW_ACTIONS` in `@repo/validation`'s `sections.ts`, in its shared order and words, each shown only when `availableNewActions` allows it, the one rule the phone's + panel reads too ([`new-actions.tsx`](../../../apps/web/components/ask/new-actions.tsx)).
  They are quiet outlined buttons, each led by its place's glyph, so the eye lands on the field first, as ChatGPT's, Claude's and Notion's home screens hang their shortcuts under the field; a member whose role starts none of them gets no row.
  Each links to its page with `?new=1`, and the page opens the form its own button opens ([`new-intent.ts`](../../../apps/web/components/layout/new-intent.ts)): one form per job, reachable from two places, and the mark comes off the address once the form opens, so a reload or Back does not open it again.
  Without Frapp Intelligence the page is titled "New" and holds the day, the greeting and the actions, with no field; it no longer sends the member to chat.
  The conversation itself, its header, its Escape rule and its centred 720px column are as the bullet above says.
- **Ask, as it was until #4702** (`ask-pill.tsx`, deleted) opened the Ask panel (`components/ask/ask-panel.tsx`, #450) when the server has AI, the chapter's president has Ask on and the member holds `ai:use`.
  With AI on and Ask off for this chapter or this member, there is no pill.
  Until the server has said which of these it is, the pill's place is held empty, so nothing beside it moves and nobody reads "not ready" a moment before Ask opens.
  On a server with no AI (the default) it is the shell it was: a small popover anchored to the pill, stating that Ask cannot answer yet and pointing at the find field and Documents (a popover rather than a dialog since 2026-11-05, [Shell chrome](#shell-chrome)), because a control that silently did nothing would be the dead end [`../design-system/README.md`](../design-system/README.md) §5 rule 2 bans.
  It paints in Signet's fixed gold family (the `gold-ask-*` tokens, 34px height / 10px radius in `ask-pill.tsx`; see [`../design-system/components.md`](../design-system/components.md) §7), house gold, never the chapter accent.
- **The Ask panel, until #4702** (a card over the chat since;
  the thread inside it is as described here;
  added 2026-11-12, #450 and #451;
  behavior in [`../../behavior/ai.md` § Frapp Intelligence](../../behavior/ai.md#frapp-intelligence)) is a 440px panel on the right edge that is not modal: nothing dims, from `lg` up the shell moves over so the page and the top bar sit beside it, and it closes by its X, the Ask pill, or Escape pressed inside it, not by a click or an Escape on the page.
  Below `lg` it covers the page, so following a source closes it and the answer is kept for when it reopens.
  Slack AI and Notion AI answer in a side panel for the same reason, since the next thing a member does with an answer is open what it cites.
  It is narrower than a form panel (576px) because it shares the screen, and below `sm` it is the whole viewport.
  It holds one conversation ([`ai.md` § One conversation](../../behavior/ai.md#one-conversation); changed in #4699 by pdcarlson, 2026-11-13, from one exchange at a time): a thread in its own scroll area. Changed 2026-11-22 (Paul: reopening "took me to the start of the convo", and the thread was "not smooth"): opening lands on the newest turn's last words; a new question moves to the top of the view and its answer grows into the room below it, the newest turn being at least the view's height, as ChatGPT and Claude place a new turn; the view stays at the newest words as an answer grows or a card fills in until the member scrolls up, and the chat's Jump to latest control (`JumpToLatestButton`) shows while those words are out of view. Until then it followed the bottom on every streamed piece, so the line being read kept moving. A question longer than six lines folds behind Show more when six lines at the bubble's width hide anything (`askQuestionShown`), with a paste's runs of blank lines squeezed to one.
  Each turn is what the member typed, in a bubble on the right (the chapter's solid accent with its on-accent text since #4702, `surface-1` before;
  18px radius, 6px at the bottom right, at most 85% wide), then what Frapp came back with on the left as plain text with no frame: the answer with a numbered gold marker after each cited sentence (the placement Notion AI and Perplexity use), and under it a wrapping row of source chips, each the marker's number in `gold-ask-text` and the source's name on a `surface-1` pill (32px, 44px on a touch pointer), with the source's kind and date as its tooltip and accessible name.
  Who said what is told by shape, not labels, the way ChatGPT, Claude and Slack's assistant draw a conversation.
  Markers and chips are links to the source; a source this build has no page for is a plain chip.
  While it works, its steps are a list that only grows at the end of the thread and folds into one row at the answer's first word, so nothing above it moves (#5427; until then one step line sat under the streaming text).
  Before the first turn it opens on the crest in the chapter's colour over a glow of that colour, the day and a greeting ("Good evening, Marcus."), with the suggestions as arrow rows just above the field, and on a member's first open in this browser on the "What can you do?" exchange instead of the greeting (changed in #4904 by pdcarlson, 2026-11-17, the phone's opening, [`ai.md` § What Ask opens with](../../behavior/ai.md#what-ask-opens-with); until then a title and a paragraph about where answers come from, every time; `components/ask/ask-opening.tsx`).
  The header holds the title (read to a screen reader only, before the first turn), a New conversation button once there is a turn, and the X. (Changed 2026-11-22: on the Ask page the header is the shell's tool header, above.) The field is two lines high with an arrow send and reads "What do you need?"; Enter sends and Shift+Enter breaks the line.
  Nothing sits under the field.
  While the beta diagnostics window is on, one caption line above the field says questions and answers are saved and until when; the status is read as soon as the member is known to have Ask, before the page opens, so the line is in place when the page draws.
  The consent sheet opens at the first question, not when the panel opens.
  Not Discord's search-results column: that lists messages to go to, which is Find's job here.
- **A proposal card in the thread** (added 2026-11-12, #718, as the Do side of an Ask and Do switch;
  changed in #4699 by pdcarlson, 2026-11-13: the switch is gone, a request is typed in the same field as a question, and its card is a turn in the thread, `components/ask/ask-proposal.tsx`;
  behavior in [`../../behavior/ai.md` § Asking Frapp to do something](../../behavior/ai.md#asking-frapp-to-do-something)).
  The first-open exchange tells a member who can ask for at least one action so (every open did until #4904).
  What it offers to tap is built from the member's own account, not a fixed list ([`ai.md` § What Ask opens with](../../behavior/ai.md#what-ask-opens-with);
  changed in #4700 by pdcarlson, 2026-11-13): up to three questions and one request, as rows led by an arrow above the field that fade in when they arrive, with nothing below them to move, and no rows at all for a member with nothing to ask about.
  Microsoft 365 Copilot and Gemini in Workspace open the same way, on prompts drawn from the person's own meetings, files and mail, above the field.
  Every card in the thread stays live; none is replaced by the next thing asked.
  The card is on the `card` surface, one step above the panel's turn bubbles, and is a 14px-radius bordered block. Its top line is a small mark and what it makes ("New event", "New task", "Give points") with a ··· menu at the right holding Dismiss and Report this (#5148). Then the headline (for points, the size in words, "Give 5 points to 42 members", with the total under it on a line that keeps its height when empty), each detail as a row led by a small Lucide mark in place of an all-caps label, the members as a list with a remove control on each row (collapsed behind "Show members" above five) and an "Add a member" select, notes on a `surface-1` strip, a caption saying that only the officer can see the card and who is notified, and Edit (secondary) beside one named action (primary: "Create event", "Create task", "Give 5 points") at the bottom right.
  A task card has the same who and when controls as the task form: the Who picker and a due-date field (a suggested task's card draws them as chips since 2026-11-19).
  Edit (#5117) grows an event card into the event form in place, filled in from the card (its X folds it back, keeping what was typed), and turns a task's name and details, or a points change's amount and reason, into fields on the card; a series adds a repeat row ("Every Sunday until February 7, 2027", "13 times" under it).
  An event's day sits in a date tile beside the written-out date and times ("Sunday, November 22", "6:48 to 7:48 PM").
  An event whose points could not be filled shows an outlined "Points for coming" field that the action waits on.
  Confirm pressed with something missing marks that field; nothing validates while typing.
  After the action or Dismiss the card stays in the same frame on `surface-1`, its details faded (struck through when dismissed), under one line of what was done (or "Dismissed. Nothing was changed.") and a link to what it made, an event itself.
  _(Changed in #5148 by pdcarlson, 2026-11-16: until then every detail sat under an eyebrow label, the buttons were Cancel, Edit and Confirm, and a decided card collapsed to a receipt.)_
  The pattern is Slack's `/remind` and Linear's create-from-text, which answer a typed request with the thing filled in to check, and Notion AI, which shows a change before making it.
  One field for both is how ChatGPT, Claude, Slack's assistant and Notion AI take a question and a request.
  Placed in the Ask panel, not the chat composer: a request typed in a channel reads as a message to the channel, and Slack and Discord both mark commands with a slash for that reason; the panel is already where a member types to Frapp.

## Page grammar

Every tool page sits flush on the shell (chat is a panel, not a page: see [The content row](#the-content-row)).
The board draws few page bodies (`4d` for settings and billing, `4e` for roles, `4c` for the settings drawer, `1j` for the upload sheet, `1k` for 404 and error), so for the rest this grammar is **derived**: from `1f` pin 2 ("one toolbar row, no wrapper card, no description paragraph"), `1t`'s deletion list, and the table rule `4d` and `4e` share.
A route that departs from it says why under [Surface decisions](#surface-decisions).

- **No wrapper card and no narration paragraph.**
  The body sits on `--background`, and the page's header (the top bar below `lg`) supplies the title on every path, offline included, so a route draws no heading row of its own.
  A paragraph explaining the page to someone already on it is deleted, not restyled.
  A line that reports state stays, moved onto the page surface: the Reports preview's row count and partial-export note are state, not a card describing itself.
  A `<Card>` paints `--card`, one rung up the ladder.
  Where the board frames a block it draws a hairline frame, never a `Card`: billing's plan panel is `--surface-1` at radius 16, and its plan matrix a radius-14 frame on the page surface.
  _Changed in #6031, 2026-11-25:_ the plan panel is a row in a settings group's frame now ([§ Billing](#billing)).
- **A page's actions are in its header** (Paul, 2026-11-19: "what if the new minutes button goes up to the Minutes section header next to the x?", then "across the board"). Its create button, an upload, a menu, and its search and filter when they fit as buttons (Events') render through [`page-actions.tsx`](../../../apps/web/components/layout/page-actions.tsx) into the tool page header between the title and the X, as Linear's, Notion's and Slack's side panels hold a view's actions in its title row. Below `lg` the header shows only when a page put actions or views in it, as one pinned row of them (the title is in the top bar there). Controls that need the page's width, such as a search field with filter chips beside it, stay a row in the body.
- **A page's views are plain words beside its title** (Paul, 2026-11-24, [#5947](https://github.com/frapplive/Frapp/issues/5947)). A page with two or three views renders them through `PageViews` in the same file into the header's view slot: after the title and a hairline, as [`components.md` § View labels](../design-system/components.md#view-labels-change-a-pages-or-a-lists-view) draws them, never as a boxed switch among the actions. Below `lg` they lead the header's pinned row. A member with one view sees none, and no hairline. A route with neither actions nor views draws no header row below `lg` and its body starts at the top of the pane.
  Every "New ..." button is one [`NewButton`](../../../apps/web/components/ui/new-button.tsx) ("+ New event", "+ New minutes"), and a main action with its own verb (Log hours, Upload, Adjust points) takes the same Button `action` variant ([`components.md`](../design-system/components.md) §3); on a narrow header it and Filter fold to their glyphs ([`components.md` § View labels](../design-system/components.md#view-labels-change-a-pages-or-a-lists-view) says when).
  Changed 2026-11-19 (Paul): it was one toolbar row at the top of the body carrying the route's filters, search and primary action, pushed to the trailing edge.
  The controls sit at the toolbar height: the Small step, 28 to a mouse (36 until #6115), 44 to a finger (Button's `toolbar` size and the toolbar recipes in `table-controls.ts`, [`components.md`](../design-system/components.md) §3).
  A list row's secondary actions (Edit, Delete, an icon) take Button's neutral `ghost` variant.
- **Lists are flush.**
  A list is a `<ul>` on `denseListClassName` ([`components/shared/table-controls.ts`](../../../apps/web/components/shared/table-controls.ts)): top-border dividers, no zebra, no per-row fill, no `<Table>`.
  Rows come in two shapes, and the difference is deliberate:

  |                         | `/documents`, `/backwork`, `/billing` invoices, `/discord-import`, Chat Admin's categories and report queue                                                                                                                                   | `/members` (actives and alumni), Chat Admin's channels                     |
  | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
  | Row is itself a control | No: text plus trailing controls                                                                                                                                                                                                               | **Yes**: the row opens the member                                          |
  | Height                  | `min-h-11` (44; on the List row step's 32 / 44 once [#3511](https://github.com/pdcarlson/Frapp/issues/3511) lands). `/backwork` is the exception: a seven-column grid at `@4xl:min-h-12` (48), stacking to two lines below a 896px page (`@4xl`) | `min-h-control-list-row`, and `pointer-coarse:min-h-11` (32, 44 on touch: the List row step; 36 until #6115) |

  `pointer-coarse` is [`components.md`](../design-system/components.md) §2's pointer-only carve-out in CSS: a mouse gets the List row step (32 since #6115; `4a` drew a 34px member row), a finger the full 44.
  Trailing row controls take `compactControlClassName` (the Row step, 28; 32 until #6115) on the same rule.
  Rows **stack** on a narrow page (`flex-col`, becoming a row at a breakpoint: `sm` or `md` on pages not yet converted, the page's or list's own `@xl` or `@md` on those that are, § Responsive contract) rather than hide fields, because `display:none` removes text from the accessibility tree too, and at the 375px floor a hidden meta line exists nowhere in the product.

- **The checkbox column is gone; selection is not.**
  The checkbox is the row's leading element, and select-all sits in the list header whenever there are rows, never inside the selection bar (Events puts both behind Select, in a trailing column: below.)
  In the bar it would be a control conditioned on its own output: unreachable until a row is ticked, and unmounted by its own use, which drops keyboard focus to `<body>`.
- **States are the nested family, with `sole`; loading is the page's skeleton.**
  Loading draws the route's own skeleton ([`components.md`](../design-system/components.md) §10), not a state component.
  The whole-screen `ErrorState`, `LoadingState` and `OfflineState` paint `--card` (empty is one line since 2026-11-07, §10), so on a flush route they redraw the card the route deleted.
  `elevation-contrast.spec.ts` measures why the nested fill is right, but it reads only tokens and cannot see a route.
  The DOM guard is `cardFilledContainers` ([`tests/card-surfaces.ts`](../../../apps/web/tests/card-surfaces.ts)).
  `chat-admin-page.spec.tsx`, `chat-reports-card.spec.tsx` and `discord-import-page.spec.tsx` run it on the loaded list (the import page: each state of its one import) and on each loading, empty, error and offline state their surface draws (Chat Admin's pins, the report queue's no-chapter state and the import channel panel included), and `discord-import-wizard.spec.tsx` on the connect step's loading, error and offline states, so a `--card` container put back in one of those fails CI.
  `profile-panel.spec.tsx` runs it on `/profile` and its loading, error and offline states (the screen was seven stacked cards until 2026-11-05; each block is a section under its label now, in one form-width column).
  The chapter-ops routes flushed on 2026-11-05 run it too: `tasks-board.spec.tsx` on the loaded and empty board, `events-page-list.spec.tsx` on the agenda, its navigator and the true-empty state (`events-calendar.spec.tsx`, which ran it on the calendar, went with the calendar in #5560), `points-ledger.spec.tsx` on the loaded chapter points ledger (Chapter settings' Points page), and `study-zones-manager.spec.tsx` on the zone list. _(Changed in #5950, 2026-11-24: `points/page.spec.tsx`, `service-page.spec.tsx` and `study-page.spec.tsx` went with their pages, and Profile's standing panels have no guard.)_
  `members-directory.spec.tsx` runs it on the roster and its error state only, so the Directory's loading, empty and offline states are unguarded, as are the wizard's other steps and any state added without a test under the guard; `/documents`, `/backwork` and `/billing` have no guard at all.
  The exception is a no-chapter branch that replaces the whole page rather than a list (alumni, Backwork).
- **Empties split three ways**: empty, filtered and searched, per `3b` ("No results = neutral tile, names the query") and its six-word status budget.
  The strings live in [`../design-system/writing.md`](../design-system/writing.md) §7, which moves in the same change as any new state.
  **Amended 2026-11-06:** Points and Events draw these as one line where the rows would be, not a tile, and their search line doesn't quote the query, since it sits under the field that holds it and carries a Clear search link instead.
  Events splits further (the lines are listed in [`writing.md` § Events (dashboard)](../design-system/writing.md#events-dashboard)): the time window (`No upcoming events.`) is its own, because the default window hides past events without anyone touching a filter.
- **An absent value is absent, not a glyph.**
  In a `·`-joined meta line an absent fact drops out of the line.
  In a label-over-value tile the value reads `Not set` or `Not recorded`, because a label over nothing names nothing.
  A lone `—` is a character a screen reader announces standing in for nothing.
- **The upload sheet is `1j`** ([`components/shared/upload-sheet.tsx`](../../../apps/web/components/shared/upload-sheet.tsx)): fields and footer buttons at the Small step (28 to a mouse since #6115, 44 to a finger;
  the board drew 44, [`../design-system/foundations.md`](../design-system/foundations.md) §9), inline errors on touched fields, and no instructional paragraph.
  Upload stays enabled and a missing file is an inline error; only a subscription refusal disables it, because that is a verdict about the chapter rather than the form.
  The well collapses to a file row.
  Since 2026-11-06 the well is a drop target, and `/documents` uses it inside a panel rather than the upload dialog ([`components.md`](../design-system/components.md) § Surface size, "Chapter document upload is a panel").
  _(2026-11-12: `/backwork`'s upload moved to a panel docked in place of the page too ([#4593](https://github.com/pdcarlson/Frapp/issues/4593)), so the dialog chrome, the radius-20 sheet and its 18/700 title row, is gone; the module keeps the fields, the well and the footer buttons' size.)_
  One thing the board draws is **not built**: an error slot on a metadata field, since no metadata field can be required yet, so the change that adds the first required one adds the recipe with it.
  A dialog with a genuine description (renaming a document folder re-files every document in it; a draft invoice is invisible to the member until it is sent) keeps it.
- **Confirmations are dialogs.**
  Every destructive confirmation goes through `useConfirmDialog` ([`components/shared/confirm-dialog.tsx`](../../../apps/web/components/shared/confirm-dialog.tsx)); no live `window.confirm` or `window.prompt` is left in `apps/web`.
  A dialog rendered inside a query's success branch is safe across a refetch, because the host settles a pending `confirm()` to `null` when its caller stops rendering it; check that before restructuring a caller around it.
- **There is no per-page settings drawer.**
  Board `4c` drew a gear on a tool page opening a 400px drawer of that page's settings; Study zones was its only adopter, with an Access section that repeated the module page's Who can.
  Paul asked for these sidebar cards to be phased out (2026-11-12), so the drawer and `page-settings-drawer.tsx` were deleted with it: a module's switch, rules and Who can live on its Chapter settings page.
- **Crest art appears in one place**: the 404 page and the root error page, through one recipe ([`components/shared/crest-page.tsx`](../../../apps/web/components/shared/crest-page.tsx), board `1k`).
  `crest-page.spec.tsx` asserts that inventory, so no empty state grows crest art.
  The dashboard's own error boundary (`app/(dashboard)/error.tsx`, [#2175](https://github.com/pdcarlson/Frapp/issues/2175)) draws [`components.md`](../design-system/components.md) §10's card for a failed region instead, since the shell around it still works.

## Surface decisions

Per-route decisions that still bind.
Each is either the product declining to be what the board drew, or a call the board did not make.
A later change may revisit one, but it reverses the reason stated here rather than rediscovering the question.

### Activity

`/activity` gathers what is waiting on the member and what they made, so they don't have to look through channels and module pages for it ([#3897](https://github.com/pdcarlson/Frapp/issues/3897): Shawn's idea, 2026-11-09;
green-lit by Paul, 2026-11-10;
Shawn picked its own page over growing it out of chat, and the name).
It is an inbox beside chat, the way Slack's Activity and Later, Discord's Inbox and GitHub's notifications sit beside their main surface.
It is not a home: `/` and `/dashboard` still land on `/chat`.
What the read returns, and who sees which row, is [`../../behavior/activity.md`](../../behavior/activity.md).

- **Now sits first** ([#5777](https://github.com/pdcarlson/Frapp/issues/5777)): the event on right now, also at the top of the chat rail, and as a pill at the top of the event's sheet. The rule and the read are [`activity.md` § Now](../../behavior/activity.md#now); the phone draws the same card at the top of Chat home and Activity.

- **The page is what is left to do, then what the member has running** ([#5779](https://github.com/frapplive/Frapp/issues/5779);
  Paul's direction A, 2026-11-20: one home per question; [`activity.md` § Cards](../../behavior/activity.md#cards) has the table of what moved where).
  It is the phone's Activity tab on web, from the same model in `@repo/hooks` (`activityWeekSummary`, `activityAgenda`, `activityReview`, `activityGroups`), so the two say the same things in the same order ([`../mobile/screens.md`](../mobile/screens.md), Activity;
  [`principles.md`](../design-system/principles.md) P6).
  Top to bottom: Now, then the member's cards in their order (To do and Running; the Frapp card is the phone's and holds its place on web, where Edit Activity marks it "On your phone"), then Snoozed and Archive.
  The page header holds the week ring and **Edit Activity**, a small secondary button, as the app's other pages put their actions beside the title (#5686).
- **Mine and Everyone's** ([#5948](https://github.com/frapplive/Frapp/issues/5948), step 4 of #5943; Paul's pick of 2026-11-24, "two homes": Activity is yours, the Calendar is the chapter's; rules in [`activity.md` § Mine and Everyone's](../../behavior/activity.md#mine-and-everyones)).
  The Tasks page folded in, and `/tasks` redirects here, keeping `?task=` and `?group=`.
  For a `tasks:manage` holder, and a member who follows someone else's task, the header shows **Mine** and **Everyone's** beside the title, as plain words ([`components.md` § View labels](../design-system/components.md#view-labels-change-a-pages-or-a-lists-view)); anyone else sees none. The page opens on Mine.
  Mine is the page above with three things from the Tasks page: **New task** at the header's end, for a `tasks:manage` holder, opening the add row under Now with its More open (Escape on an empty row puts it away; a half-typed task is kept); **Up for grabs** under Now, while something is open; and the task panel, which `?task=` and `?group=` open in place.
  A task made on Mine for someone else toasts **Show everyone's**.
  Everyone's replaces the page with the chapter's task board, [§ Chapter ops](#chapter-ops-events-tasks-and-study-zones): its header holds the one **Filter** button and **New task**, and the officers' suggestions from minutes sit above it.
  Comparable apps: Asana's My tasks beside a project's board, Linear's My issues beside the team's, and GitHub's Assigned to you beside a repository's issues; each keeps the person's list and the team's board as two views of one place rather than two pages.
  _Changed in #5948 by `pdcarlson`, 2026-11-25:_ "an inbox beside chat, not a home" (#3897) still holds for Mine; the Tasks page, which listed the same tasks a third time (Activity's To do, the Tasks page's My tasks, the Events agenda), is gone.
  Until #5779 the page was the week card, Last week, This semester, To review, To do, the Calendar row, Reminders, Waiting on others and Links (#4766, #5520). _Changed in #5779 by `pdcarlson`, 2026-11-20._
  It is drawn and checked for four people ([`principles.md` § Three people](../design-system/principles.md#three-people)): a member with nothing due, an average member, a committee chair and the president.
- **Edit Activity** (`components/activity/activity-editor.tsx`) swaps the page for the editor as Archive does: Shown (Now first, fixed, then each card with Hide, Move up and Move down as icon buttons, To do without Hide) and Hidden (each with Show), Reset to the default once the member has saved one, and Done, which saves and goes back. `‹ Activity` is Done too. A failed save is a toast, and the page goes back to the saved arrangement.
- **It lays out by its own width, never the window's.**
  The page is usually a pane beside chat (about 825px in a 1440px window since #5575, and as narrow as 375px when the member widens chat), and the whole window only when chat is closed, so its breakpoints are container queries on the page (`@container`): under 768px of page it is the phone's column, and from 768px a To do row has room for its detail on one line.
  A window breakpoint would draw the wide layout in the narrow pane.
- **The week ring** (`components/activity/week-ring.tsx`, #5779; Paul's pick "Small ring beside the title", 2026-11-20), in the page header: a 22px ring (`components/shared/progress-ring.tsx`) and "4/15", done of total this week from the read's `week` ([`activity.md` § Week](../../behavior/activity.md#week)), in a bordered pill.
  Apple Fitness keeps its rings this small in a summary, one press from the detail.
  Pressed, it opens a popover with the headline ("3 left this week") and a line per kind that has anything this week (Events, Tasks, "Polls and sign-ups"), each a dense meter and its count. A kind the chapter has off, or with nothing this week, has no line.
  **Nothing due:** the ring is its groove and reads "0", and the popover says "Nothing due this week", never "0 of 0".
  **Everything done:** the ring takes the success hue.
  **A part couldn't load:** the pill reads "–" when nothing else counted, its line draws a dash, the headline says "At least N left this week", and a warning line names the part; a failed read is never a zero and never a finished week.
  **An API from before `week`:** no ring.
  Until #5779 this was the week card: a 96px ring, the lines beside it, and **Next**, the one thing to do next.
- **A line of the ring narrows the To do list** to that kind: it is a toggle button (`aria-pressed`) that closes the popover, and the pill's count takes the accent's text while the list is narrowed.
  Pressing it again, or the list's "Show everything", clears it; while narrowed the list says so ("Showing only tasks.", or "No events left to do."), holds nothing back, and Running steps out.
  The narrowing is never stored: the page always opens on everything, and it ends for good when its line leaves (its module turned off, or nothing of its kind left in the week's count, as on a new week).
  Finishing the last item does not end it: the line stays, at "3 of 3", and the list says "No tasks left to do."
  A list that is empty because its read failed never says that; it says "Showing only tasks." over the line that names what couldn't load.
  This replaces the filter chips and the chip remembered per browser (#4402): Changed in #4766 by `pdcarlson`, 2026-11-13.
- **Last week and This semester are on the profile** (`components/activity/standing-cards.tsx` in `components/profile/profile-panel.tsx`, beside Points, since #5779), drawn as they were on Activity:
  **"Last week"** (`components/activity/recap-card.tsx`, [#4983](https://github.com/pdcarlson/Frapp/issues/4983); Shawn, 2026-11-14) on Sunday to Tuesday, what the member did in their last full week, from [`activity.md` § Recap](../../behavior/activity.md#recap): the eyebrow "Last week" with the week's days beside it, then one ruled card of figures ("2 events", "+30 points", "2h 30m service"), only what the member did, with a close button that hides it until next week's recap, remembered per browser, per chapter and week.
  **"This semester"** (`components/activity/semester-strip.tsx`; Evan, 2026-11-12): up to four gauges in one ruled card, Points, Required events, Service hours and Study hours (this week), each opening what is behind its number (Points, Service hours and Study hours their panel on the profile, [§ Profile](#profile), since #5950; Required events, Events), with a 36px ring only toward a target ([`activity.md` § Standing](../../behavior/activity.md#standing), [§ Goals](../../behavior/activity.md#goals)); a zero with nothing to aim at is left out, a module that is off draws no gauge, and a part that couldn't be read draws a dash.
  On the profile its Points and Service hours stay beside the All time doors above them: those are all time, these are this semester's, with the goal and rank.
- **Running** (#5779): what the member has going, where To review and Waiting on others were, under one heading with one count. Linear's My issues splits Assigned from Created the same way.
  It leads with **"N to approve"** (`components/activity/review-card.tsx`): what waits on an officer's sign-off, finished tasks to confirm (longest waiting first) then service hours to approve, as one card whose title is the count ("3 to approve", "5+ to approve" past the read's cap), as Google Classroom gives a teacher one "To review" apart from their own work.
  It is drawn only when something waits or a part behind it failed to load, so a member, and an officer with an empty queue, sees no card and no zero.
  The week ring never counts it: reviewing is the officer's queue, not their week.
  A queue of three or fewer is drawn open, so a chair's two confirmations are still one press each; a longer one waits behind its title ("14 to approve", "10 tasks · 4 hours entries") and opens in place on a press, five rows then "Show all N".
  Open or closed is decided once, when the card first has rows, and after that only a press changes it.
  Then what the member made, by kind (described under **What the member made** below). Running shows for anyone with something in it, not only officers, and steps out while To do is narrowed.
- **To do** is the member's own events, open tasks, and unanswered polls, sign-ups and forms, **by day**, as Things' Today and Todoist's Upcoming list them and as the Events page does: Overdue (in the warning hue, never cut), then what is open for check-in now, Today, Tomorrow, each weekday of the coming week, Later, and No deadline.
  A day draws three rows, then "Show N more", so the president's Saturday doesn't bury Sunday.
  Under a day a row says only its time; under Later it keeps its date.
  A task says its state only when that is news (overdue, or sent back for changes): "To do" on every row of a list named To do is noise (P3), and a row under Overdue doesn't repeat the heading as a chip.
  An event the member has checked in to leaves the list.
  Due and waiting reminders are rows on their days (#5779), below.
  Minutes waiting on the member are a **Minutes** run after Later ([#5949](https://github.com/frapplive/Frapp/issues/5949); what is listed: [`activity.md` § Minutes](../../behavior/activity.md#minutes)), each row leading with the Meetings glyph: a meeting to write minutes for opens the event, with **Write minutes** on the row (it starts the minutes and opens `/meetings/:id`) and **No minutes for this meeting** in its `⋯` and right-click menu, confirmed by a toast with Undo; a draft opens its minutes with where it stands as a chip; notes open `/meetings/:id/notes`, with Take notes as the ask until the member starts.
  Its header holds **Calendar ›**, a link to `/events`, the chapter's whole month, where the Calendar row was (#5310).
  With nothing at all it says "Nothing to do right now."
- **Reminders** ([#4957](https://github.com/pdcarlson/Frapp/issues/4957), Shawn, 2026-11-13;
  what is listed is [`activity.md` § Reminders](../../behavior/activity.md#reminders)): the reminders the member set on chat messages, as Slack's Later tab holds them, rows in To do on the day each is for (#5779; they were their own card), a due one with a `Due` badge in the warning tone.
  A row leads with the reminder glyph (the nav set's `schedule` clock), titles itself with the message's words, and its detail names the author, the channel and "Remind me Tomorrow · 2:00 PM" (or "Reminded …" once due).
  It opens chat at the message.
  A check button on the row is Done, which takes the row off at once and says `Marked done`; its `⋯` (or right-click) menu holds Snooze, the message menu's five presets (`Snoozed`, "I'll remind you tomorrow at 9:00 AM."), and Open in chat.
  A row whose channel the member lost doesn't open and offers only Done.
- **What the member made**, under Running (#5779; it was "Waiting on others" from #4766 and "Made by you" before), by kind (Tasks you assigned, Events you made, Polls you posted), three of each then **Show all N**, so 17 assigned tasks don't bury the rest.
  Files you uploaded was a fourth kind until [#4291](https://github.com/pdcarlson/Frapp/issues/4291) (Shawn, 2026-11-11), since a member's uploads are already in Documents and Backwork.
  **Polls you posted lists open polls only** ([#4258](https://github.com/pdcarlson/Frapp/issues/4258), Shawn, 2026-11-11): a poll closed by hand or past its closing time leaves the list, the moment its time runs out if the page is open, for an **Archived polls (N)** text button at the foot of the group, which opens the closed ones newest closed first, each opening its card with the final result.
  (Changed in [#5127](https://github.com/frapplive/Frapp/issues/5127) by shawnatomklein-eng, 2026-11-15: Archived polls is gone; a closed poll is in the Archive below with everything else that is over.)
  Tasks you assigned likewise leaves out a confirmed task, and one the member gave themselves while To do lists it, since that row already says it (#5779; the phone does the same).
  **A task for everyone is one row** ([#5538](https://github.com/frapplive/Frapp/issues/5538), 2026-11-18, as the phone has drawn it since #5492): its title, who it went to and when it is due ("Everyone · Due Fri", `taskGroupLabel`), a stack of up to three faces of whom it went to with "+N" for the rest, then the progress bar and "12 of 30" (read "12 of 30 done"), and **Overdue** when any copy is.
  It opens the group in the task panel in place (`/activity?group=<id>`, [`tasks.md` § Tasks for everyone](../../behavior/tasks.md#tasks-for-everyone); `/tasks?group=` until #5948), never Activity's panel, which draws one task as chat's card and would show one member's copy as if it were the group; a one-person task still opens Activity's panel.
  A review link (`/activity?review=<id>`) opens what waits on the officer's review in Activity's panel; one for a copy of a task for everyone that no longer waits there, or any task the read no longer holds, opens in the task panel (`/activity?task=<id>`), the copy's group for a copy.
  Until then web listed a row per copy, so one task sent to 30 members was 30 rows.
  To do likewise drops a poll whose time ran out since the read.
  A group with nothing in it is left out rather than drawn as an empty line.
  **A poll you posted, while open, and an event you made, once its check-in opens, say how far along they are** ([#4792](https://github.com/pdcarlson/Frapp/issues/4792)): a thin bar and "41 of 60" under the detail, as on the phone, the bar `aria-hidden` and the count read whole ("41 of 60 voted");
  the groove is `bg-card`, since the row sits on the page, where the meter's `bg-background` recess vanishes.
  The counts are [`activity.md` § Progress](../../behavior/activity.md#progress); with none, no bar.
- **Archive** ([#5127](https://github.com/frapplive/Frapp/issues/5127), Shawn, 2026-11-15; what it holds is [`activity.md` § Archive](../../behavior/activity.md#archive)): an **Archive** text button at the foot of the page, under Snoozed, swaps the page for the Archive until **‹ Activity** takes it back. It is `?view=archive`, pushed, so Back leaves it too ([§ Addresses](#addresses), #6044; state for the visit until then).
  It is a heading, "Events, tasks and polls that are over.", then Events, Tasks and Polls as the page draws its groups, each row its page row with no ask (an event says Checked in when the member did, a task its state, a poll Closed) and opening the same panel.
  A section that failed says so; with nothing it says "Nothing finished in the last 30 days. Events, tasks and polls land here once they're over."
  It follows Google Classroom's To-do, whose Done tab holds finished work apart from what is assigned, and Gmail's Archive, which keeps mail out of the inbox one press away.
- **Gone from the page** (Changed in #4766 by `pdcarlson`, 2026-11-13): the "N things need you" headline and its count tiles ([#4173](https://github.com/pdcarlson/Frapp/issues/4173), Shawn, 2026-11-11, after Apple Reminders' count tiles), the filter chips, the Needs you chip and the chip remembered per browser ([#4402](https://github.com/pdcarlson/Frapp/issues/4402), Shawn, 2026-11-12), the Now and Later split (#4173), and the Coming up group, whose events are now on their days in To do.
  "Needs you" as a name went with them (Paul: not a fan of it).
- **A row is one hit target:** a lead, a title, one line of detail (who and when), and a badge naming what it asks or where it stands.
  The lead is the kind's glyph from the shared nav set in a neutral 40px tile (a task the Tasks shape, hours the Service shape), as Teams' Activity marks each row, or for an event a calendar-style block with its month and day (#4173), wherever the row stands apart from a day: under Events you made, in Running.
  An event under a day's heading in To do leads with the events glyph and says only its time, the heading having said the day (#4766, as on the phone).
  The block is decoration: where it is drawn the detail line still says the day in words ("Tomorrow · 7:00 PM"), which is what a screen reader reads, and the year outside the current one.
  The glyphs stay neutral: on this page colour is for asks and status, never for a kind.
  **A row from someone leads with their face** ([#4463](https://github.com/pdcarlson/Frapp/issues/4463), Shawn, 2026-11-12): the poster of a poll or sign-up link, whoever assigned the member a task, and the member whose completion or hours wait on their confirm or approval, drawn as chat draws an author (their photo, else initials on their tint, from the roster chat reads, so the Activity read is unchanged), with the kind's glyph small on the face's lower corner, as Microsoft Teams' and Slack's Activity draw the actor with the kind's badge on it.
  A row with no one else to show (an event, a task the member set themselves, every row under Running that the member made) and a row from someone the roster no longer holds keep the glyph tile; a member still on the roster who never set a name shows their photo, or "?" on their tint, as chat draws them.
  The face is decoration too: the detail names the person, except on a poll, whose detail is its channel, so a poll row says its poster to a screen reader ("From Olive Officer").
  **What closes within a day says so relatively and in the warning tone** (#4463): a poll closing, or a task with a due time, less than a day away reads "closes in 2 hours" or "Due in 40 minutes" (counted down, never "0 minutes"), and that phrase, the detail's last, is drawn in `--warning`, so what runs out tonight reads apart from what runs out next week.
  Further out it reads as before ("closes Tue 3:00 PM"); a task due on a bare date keeps "Due today", and an overdue task stays the red badge.
  An ask (`Vote`, `Confirm`, `Approve`, `Check in`) draws as the action it opens, in the tinted button's recipe, so it reads apart from a status (#4173; until then it was the `warning` badge, which looked like `To do` beside it).
  **`Confirm`, `Approve` and `Check in` are buttons on the row** ([#4426](https://github.com/pdcarlson/Frapp/issues/4426), Shawn, 2026-11-12;
  Check in [#4427](https://github.com/pdcarlson/Frapp/issues/4427), 2026-11-13), drawn where the ask was, as GitHub's notifications and Slack's Activity put quick actions on the row: one press does what the panel's own control does (`useConfirmTask` with the task card's words, the Service hours review's Approve, the event card's `useSelfCheckIn` with its toasts), records the item as read, and re-reads the page, and the row leaves the to-approve card.
  The button stays disabled once its write lands, so a second press can't repeat it, and focus then moves to the next row.
  The rest of the row still opens the panel, where Reject, a send-back and the record's detail stay.
  `Vote` stays the row's ask and opens the panel, since a poll asks which option.
  So does `Check in` for an event with a check-in zone (`check_in_needs_location`), since it needs a location the web can't give: its panel says to check in from the phone.
  So does `Check in` while an officer's check-in screen is up for the event (`check_in_needs_code`, [#4808](https://github.com/pdcarlson/Frapp/issues/4808)), since it needs the code the web can't scan: its panel says to point the phone's camera at the code. The officer whose own screen it is keeps Check in, since the server takes their own check-in without the code (2026-11-17, `events.md` § Check-In).
  They are paid-chapter writes: while the chapter's plan refuses them, no row draws a button and each opens its panel, whose notice says why; offline or while the chapter loads, the buttons show disabled, and a click on one opens the panel as the ask did.
  An overdue task is `destructive`; any other state is an `outline` or `success` badge.
  A task's state uses the shared task words every task surface uses.
- **An unread row carries a dot** ([#4405](https://github.com/pdcarlson/Frapp/issues/4405), 2026-11-12;
  what counts as unread is [`activity.md` § Unread](../../behavior/activity.md#unread)): the neutral `--foreground` dot every unread mark uses, in a slot of its own before the lead, as the notification drawer's rows and Linear's and GitHub's inboxes draw theirs.
  The slot stays when the row is read, so rows don't shift as dots clear, and a screen reader hears "Unread:" before the title.
  Opening the row (its panel, or a link's own page) clears it at once; scrolling past does not.
  What the member made never has one.
- **A row opens the record in a panel, drawn with chat's own card** (`components/chat/renderers/`), docked in place of the page beside chat with a Back to activity arrow ([`components.md` § Surface size](../design-system/components.md#surface-size), 2026-11-12), so the member votes, starts or finishes a task, confirms it, or checks in with the controls chat already taught them.
  The cards are not forked: the page hands each one a message built from the row (`@repo/chat-core/activity-cards`), and the card reads the record's live state as it does in chat.
  Things sit around a card where the card doesn't carry them: a poll has **Open in chat**, a link to its message;
  an event has **Open in Events**, a link (`/events?event=<id>`) that opens its detail panel on the Events page, where a member with `events:update` edits it;
  a pending service entry has **Approve** and **Reject** (chat's hours card is a read-only record), over them what Approve will award at the chapter's rate, and **View proof** when the member attached proof: Activity is the one place hours are reviewed since #5950, when the Service hours page and its queue went ([`../../behavior/service-hours.md` § Approval Workflow](../../behavior/service-hours.md#approval-workflow)).
- **The panel stays open after an action.**
  A vote shows its tallies; the row leaves the list underneath.
  Approving or rejecting hours closes it, since nothing is left to show.
  A poll's votes are re-read every 15 seconds while its card is open, because the page holds no live channel subscription; a vote or a close made here is also written into that channel's chat cache when it is loaded, so the thread does not show a stale tally.
- **A sign-up sheet, headcount or form you haven't answered is on the To do list** ([#3926](https://github.com/pdcarlson/Frapp/issues/3926) step 4, Shawn, 2026-11-13;
  which ones: [`activity.md` § Sign-ups and forms](../../behavior/activity.md#sign-ups-and-forms)), as Google Forms and SignUpGenius send a reminder to whoever hasn't responded, and Slack's Activity lists a workflow form waiting on you.
  The row leads with the poster's face, is titled by the card's title, and its detail says what it is and where ("Sign-up · 4 slots · #rush · closes Fri 5:00 PM", "Headcount", "Form · 6 questions"); its ask is `Sign up`, `Answer` or `Fill out`.
  It opens no panel: the row is a link to the card's message in chat, where the slots are claimed or the form opened, as a sign-up link row goes to its link.
  Answering it there takes it off the list at the next read.
  It shares the week ring's "Polls and sign-ups" line with polls.
- **The list is re-read every time the page opens or the window regains focus**, and after each action.
  The records it gathers are changed from other surfaces (a vote in chat, a task finished on the board), so it never trusts a cached copy.
  A re-read that fails keeps the list already on screen.
- **Snooze** ([#4982](https://github.com/pdcarlson/Frapp/issues/4982), Shawn, 2026-11-14;
  the rule is [`activity.md` § Snooze](../../behavior/activity.md#snooze)): every row on To do and Running's "to approve" card has a `⋯` menu (shown on hover or focus, and a right-click), led by **Snooze until** with Gmail's fixed times: Later today (6 PM, while that is more than an hour off), Tomorrow and This weekend (8 AM;
  the weekend Monday to Thursday) and Next week (Monday 8 AM).
  The row leaves at once and toasts "Snoozed until Tomorrow · 8:00 AM" with **Undo**.
  Snoozed rows wait behind a **Snoozed (N)** text button at the foot of the page, soonest back first, each reading "Back Tomorrow · 8:00 AM" in place of its detail and still opening its record; its menu holds **Unsnooze**.
  A snoozed row comes back on the page's own clock, and the page reads Activity again then, so its dot and the badge return with it.
  Gmail's Snoozed folder and Slack's Later are the models.
- **Links: sign-up links posted in chat** (forms, sheets, booking pages; which ones and who sees them: [`activity.md` § Links](../../behavior/activity.md#links)), in the channel's own menu since #5779 (`components/chat/channel-links-panel.tsx`): a **Links** view beside Pinned and Saved, with its count, listing that channel's links still open to the member (not their own, and not ones they marked Done or hid, as Activity listed them), or "Nothing to sign up for in this channel.", as Discord keeps a channel's links. Opening one clears its dot.
  A row is the link itself: the page's name when the API read one, else its kind ("Google Form", "Calendly"), then, under it, the kind when the name is the title (#4187), who posted it, where and when; it opens the link in a new tab and draws no badge.
  **Done** (a check) sits on the row, as GitHub's notifications and Slack's Later put theirs, since marking one done is what a member does after filling it in.
  The row's `⋯` menu (or a right-click off the link) holds **Hide: not chapter business**, **Open in chat** (the message it was posted in; a thread reply goes to its thread's first message, since the web has no link that opens a thread), and, for a `channels:manage` holder, **Remove for everyone**.
  Each of Done, Hide and Remove takes the row away at once and toasts with **Undo**.
  Links are not on Activity and not in the nav count.
- **Leave out of Activity** is a switch in the channel editor (Settings → Chat → Chat admin, `/settings?tab=chat&page=chat-admin&channel=<id>`, `channels:manage`), for a channel like #advertising whose links aren't chapter business.
  Direct messages are not listed there, so they never show it.
  The phone has no channel editor, so the switch is web-only.
- **A section that could not be read is said** ("Couldn't load polls"), never drawn as empty.

### Chat

- **One sidebar, then the page and the open conversation** (#5946, Paul, 2026-11-24, epic [#5943](https://github.com/pdcarlson/Frapp/issues/5943); [`dashboard-shell.tsx`](../../../apps/web/components/layout/dashboard-shell.tsx), the state model in [`shell-layout.ts`](../../../apps/web/components/layout/shell-layout.ts)).
  The chapter's channel list is in the sidebar ([§ Navigation map](#navigation-map)).
  It is chat's own list, drawn there through a portal ([`channel-list-slot.tsx`](../../../apps/web/components/layout/channel-list-slot.tsx)), never a copy, so nothing is read or subscribed twice; its filters open from a control on its first category heading.
  So from `lg` up the shell mounts one chat panel on every route, shown or not, and the routes decide what it shows (the path is the page; what opens inside a page is in its query, [§ Addresses](#addresses)):
  - **`/chat`** is the open conversation alone, with the member column beside it from 1280px (below).
  - **`/messages`** is the Messages page, which the Messages row opens: the member's direct and group conversations in a 240px list pane titled "Messages", with the New message pencil and the people search, beside the open conversation.
  - **Beside a page** (any other route) the open conversation docks on the right at the member's width, with no list and no back-to-list arrow; the divider, the X and the 375px floors are as below.
    Closed by its X it stays mounted out of sight (`shown` false, so nothing in it is marked read), and picking a channel in the sidebar opens it again.
    Beside Chapter settings, which takes the whole width, it is hidden, and a pick goes to `/chat`.
  - **The address follows the conversation**, so a DM is always read beside its list: a conversation of the other kind moves between `/chat` and `/messages`, keeping its target. The history rules (a link replaces, a pick pushes) are in [§ Addresses](#addresses).
    The Chat and Direct messages rows, the `frapp_chat_view` cookie, `?view=` and the home view (`chapter-home.tsx`) are deleted.
    The split breakpoint is `lg`, 1024px (1056px until #5946): the full sidebar beside both 375px floors fits from there ([§ Responsive contract](#responsive-contract)).
  - **New unreads.** While an unread channel is scrolled out of sight, a **New unreads** pill floats over that edge of the list, and pressing it scrolls to the nearest one without opening it ([`spec/behavior/chat/README.md`](../../behavior/chat/README.md) § Sidebar arrangement, "New unreads"; [#6045](https://github.com/frapplive/Frapp/issues/6045)).
- **Chat opens beside the chapter tools** ([#3779](https://github.com/pdcarlson/Frapp/issues/3779); proposed by Winston, approved by Paul 2026-11-10).
  Chat is a panel of the shell, not a page: the nav column always stays, its **Chat** row opens and closes the chat panel (channels, thread, members) right of the nav, and a tool row (Events, Tasks, …) opens that tool's page right of chat.
  Changed in #5575 by pdcarlson, 2026-11-19 (Paul asked, from his screen critique): with a tool open, **the tool page takes the main column right of the nav and chat is a side panel on the right**, 375px unless the member drags it wider, showing one pane at a time.
  At 1440px the old order gave the tool page under half of what was left beside chat's channels column, so Tasks cut off task titles and the Directory clipped emails that fit in full at 820px.
  Beside a tool the panel shows the channel list or the conversation, never both, as the phone does: the conversation's header has the back arrow to the list, and picking a row opens it.
  The pick pushes no history entry there, so Back still moves between pages.
  Changed in #5946 by pdcarlson, 2026-11-24: the list is in the sidebar, so beside a page the panel is the conversation alone, with no back arrow, and a pick from the sidebar changes it in place.
  With chat alone (`/chat`) the panel keeps both columns and the member column as before (since #5946 the conversation and the member column: its list is the sidebar's).
  Comparables: Slack's canvas and huddle beside a channel, Linear's issue view with its activity panel, and Notion's comment sidebar all give the document the main column and dock the conversation on the right at a narrower width the member can drag.
  Clicking the open tool's row closes it, and clicking another tool switches to it, so chat and at most one tool are open.
  With no tool open, `/chat` is the open conversation. (Until #5946, with neither open the shell showed a home view, the chapter's mark, name and school on a glow of its accent; it was deleted with the Chat row that could close chat.)
  Between the tool page and chat a **divider** sets chat's width: it starts at 375px (until #5575, 50/50 between the thread and the page), drags, moves with the arrow keys (Home and End to the limits, Enter or a double-click to reset), is remembered in a cookie read on the server (`frapp_chat_width`, pixels, so the panel keeps its width as the window changes and the page takes the rest), and never lets chat or the page drop below **375px**, the width the thread is tested at ([`split-divider.tsx`](../../../apps/web/components/layout/split-divider.tsx)).
  While chat and a tool are both open the **member column closes on its own** and the people button opens the list in a popover under it (2026-11-15, #4593; a Panel until then); the member's own show-or-hide choice is kept for chat alone.
  **Every tool page can be closed from itself** (Paul, 2026-11-11): before, only a tool with a nav row of its own could be closed, by clicking the row again, and the Settings tools, Profile and the personal Settings page had none, so a member who opened Chat admin beside chat could not get rid of it.
  From `lg` up the tool page has a 48px header lined up with chat's channel header, its title on the left, the page's actions, and a close button on the right ([`tool-page-header.tsx`](../../../apps/web/components/layout/tool-page-header.tsx));
  Escape inside the page closes it too, except from a text field or when a dialog or menu inside used the key;
  and dragging the divider to an edge closes that side, chat at the right edge and the page at the left (the other way round until #5575), the way VS Code's and Figma's panels snap shut.
  The side stops at its 375px floor and fades once the pointer is past half of it, so the member sees what letting go will do; dragging back cancels, and a close keeps the split from before the drag.
  Closing the page goes to `/chat` as a nav row's close does.
  **Chat closes from its own header too** ([#4223](https://github.com/pdcarlson/Frapp/issues/4223), asked by Shawn 2026-11-11): from `lg` up, with chat beside a page, an X at the right end of chat's channel header, after the people and ⋯ buttons, closes chat and leaves the page filling the row (from #5575 until #5946, when the side panel showed the list instead, the list's header carried the same X).
  It is the tool page header's close button (`PanelCloseButton`), 16px from its panel's edge as the page's is, so the two panels close the same way, as Slack's channel and right-hand panel and Discord's thread and member panels each carry their own X.
  An open thread covers the channel header, so the thread's header carries the same X.
  Focus moves to the page, since the X goes with the panel.
  With chat alone, or below `lg`, there is nothing to close chat into and the X is not drawn.
  Closed beside a page, chat stays mounted out of sight, and picking a channel in the sidebar opens it again (until #5946 the Chat row opened and closed it).
  Escape inside chat does not close it, because Escape there already closes a thread or cancels a reply.
  This changes the rule on [#4023](https://github.com/pdcarlson/Frapp/issues/4023) that the nav rows stay the only open and close controls (Winston, 2026-11-10), which the page's own close (above) had already relaxed for tool pages.
  The members column and the side sheets (event, member, upload panels) already closed: the people button toggles the column, and every sheet has its close button and Escape.
  _(2026-11-12: those panels now open docked in place of their page, and close with a back arrow and Escape, [`components.md` § Surface size](../design-system/components.md#surface-size).)_
  Panels open with Signet's `context` duration and `entrance` ease and close with `standard` and `exit`, gliding 16px from the right edge, the side chat docks to (from the nav side until #5575); a page load or a link paints them in place, and reduced motion makes it instant.
  State: the open tool is the path, and what opens inside it is the query ([§ Addresses](#addresses)), so links and Back work; `/chat` means "no tool", the conversation alone, and `/messages` the Messages page; chat open or closed beside a page is a cookie (`frapp_chat_open`).
  Any arrival at `/chat` or `/messages` (a link, a notification, a Find result, or the shell's own move there when a page closes) shows the conversation.
  Widths and the single-page fallback: [§ Responsive contract](#responsive-contract); the state model: [`shell-layout.ts`](../../../apps/web/components/layout/shell-layout.ts).
  Tool pages lay out by their own width beside chat, not the window's ([§ Responsive contract](#responsive-contract), #4022, #4033).
  Not yet: the same for Settings and Profile, which the Settings rebuild ([#3856](https://github.com/pdcarlson/Frapp/issues/3856), open as #4106) is replacing ([#4033](https://github.com/pdcarlson/Frapp/issues/4033)), and members rearranging the panels (sub-issues of #3779).
  - **Direct messages have their own row** ([#3774](https://github.com/pdcarlson/Frapp/issues/3774), asked by Shawn 2026-11-09, decided by him 2026-11-12 on a proposal page built on this screen).
    Under Chat the nav has a **Direct messages** row (paper-plane glyph) that opens the same chat panel on the member's direct and group messages instead of the chapter's channels, the way Slack's DMs entry, Discord's Direct Messages home and Teams' separate Chat entry keep conversations apart from channels.
    Changed in #5946 by pdcarlson, 2026-11-24: the row is **Messages**, and it opens `/messages`, the Messages page, with the list in its own pane beside the conversation; there is no Chat row to pair it with, and the list on screen is the route, not a cookie or `?view=`.
    The channel list holds channels only, and the Messages list holds DMs and group DMs, with Pinned above them and Hidden conversations below, no heading of its own, and no officer reordering (a DM has no place in the chapter's order).
    Each Messages row is two lines like the phone's: the name with the last message's time at its end (`formatConversationTime`, the full date and time as its tooltip), and the last line, led by a sent check or a read double check in the chapter accent when it is the member's own, with the count badge at its end (#5519, Paul, 2026-11-18; [`spec/behavior/chat/README.md`](../../behavior/chat/README.md) § Read Receipts → Shown to the sender).
    `/chat` lands on the member's last channel as before; `/messages` opens only the DM the member last had open there, and with none asks them to pick one, since opening one they didn't pick would mark it read unseen ([`spec/behavior/chat/README.md`](../../behavior/chat/README.md) § Where Chat opens).
    The Messages row carries a mention-red count of conversations with anything unread, the count the phone's Messages tab shows; an unread channel lights its own row in the sidebar's list.
    With none, the thread column says how to start one: "Find someone to message" opens the people search ([#4668](https://github.com/pdcarlson/Frapp/issues/4668); until then it linked to the Directory's Message).
    Below `lg` `/messages` is chat's single page on that list, as `/chat` is on the channels, and the drawer's Messages row marks it as the current page.
    The Messages list reads like the phone's Messages screen: newest first (pinned ones on top), each row two lines, 48px, the name then its last line in caption type (`channelPreviewLine`, [`spec/behavior/chat/README.md`](../../behavior/chat/README.md) § Channel list previews), and a **New message** pencil in its header that opens the people search below (until [#4668](https://github.com/pdcarlson/Frapp/issues/4668) it opened the Directory, where a DM starts).
    The latest-message read runs only while that list shows.
    The list shows its skeleton until that read first answers, as the phone's does, so rows never re-sort under the pointer, and a later read that fails keeps the last good order and lines.
    A row in Hidden conversations stays one line with no preview, since the server keeps none for a hidden DM.
    The New message pencil shows only once the list has loaded.
    This changes the single Chat anchor of [#2946](https://github.com/pdcarlson/Frapp/issues/2946) and gives the #3779 panel a second list; its open and close rules are unchanged.
  - _Replaced 2026-11-10, recorded by Paul 2026-11-05/06:_ **the channel list was the left column.**
    From `lg` up on `/chat` the shell's left column showed the channels in place of the module nav, a back arrow slid the nav in, and the same column served every route so nothing jumped going in and out of Chat.
    The reason was width: the nav's 220px and the channels' 240px side by side cost 460px before a single message.
    Changed in #3779 by `whewitt-frapp`, 2026-11-10, with Paul's approval: with chat open the nav and the channels sit side by side again (480px), because keeping a tool page in view while talking about it was worth that width.
    The one-column rule still holds for the nav itself, which no longer changes between routes at all.
    Changed in #5946 by pdcarlson, 2026-11-24: the channels are in the left column again, under the rows rather than in place of them, in one 264px sidebar on every route, so the nav and the channels together cost 264px.
- **Getting back from a channel** (2026-11-09, [#3824](https://github.com/pdcarlson/Frapp/issues/3824)).
  Below `lg` the list and the thread are one screen each.
  The thread header's back arrow is a 40px target, `Esc` returns to the list wherever nothing else takes it (a field, the composer or an open overlay keeps it), and picking a channel from the list pushes a same-URL history entry, so the browser's Back returns to the list rather than leaving Chat.
  A thread that opened without a pick (the landing channel, a link) has no entry of its own; going back from it just shows the list.
  While the list is showing, the channel left behind is not counted as being read: a message landing in it is not stamped read, so it lights its row in the channel list, and below `lg` the drawer's Channels row, under the usual rules (an @-mention, or any message in a channel not muted), or for a DM adds to the Messages row's count (#3774), and stays unread for the next visit.
  Its own row keeps the selected-row look until another channel is picked.
  From `lg` up the channel list is in the sidebar (and on `/messages` the Messages list is beside the thread) and nothing is pushed, and `Esc` does nothing there (until #3779 it brought the channels back over the module face).
  Beside a tool page (#5575) the panel is one pane wide again: the back arrow and `Esc` show the list and picking a row shows the conversation, the read rule above holds while the list shows, and nothing is pushed or followed in history, so Back between tool pages leaves the pane as it was. Pressing the nav's Chat or Direct messages row to switch lists shows that list, and focus moves into the pane that appears when the control that switched it went with its pane.
  Changed in #5946 by pdcarlson, 2026-11-24: beside a page the panel is the conversation alone, with no list, no back arrow and no Chat or Direct messages row, so there is nothing to go back to; `Esc` there does nothing, as with chat alone.
  An entry pushed below `lg` can outlive a widening past it (a tablet turned to landscape, a resized window); from `lg` up, the Back press that leaves it carries on past the same-URL entry under it, so the first press goes where a desktop Back would have gone without the pick (usually out of Chat).
  Narrowing again first keeps its Back step (added 2026-11-13, [#3836](https://github.com/pdcarlson/Frapp/issues/3836)).
  The channel header names the channel in the type of its own row in the list (14px / 600), never larger.
- **A member list on the right, and no reply panel.**
  `1t` drew Chat as two flush columns with no details rail.
  Once the channels moved into the shell's left column (since replaced by the chat panel, [#3779](https://github.com/pdcarlson/Frapp/issues/3779), and in the sidebar again since #5946), Paul asked for the freed width to hold a member list "similar to that of discord" (2026-11-05, [#3536](https://github.com/pdcarlson/Frapp/issues/3536)), so from 1280px a 240px members column sits right of the thread, on `--surface-1` like the sidebar, shown unless the member hid it with the people toggle in the channel header (a cookie remembers that, read on the server so the column never paints and vanishes), and closed on its own while a tool page is open beside chat.
  Below 1280px, and beside a tool, there is no room for a third column and the same toggle opens the list in a popover under it ([`components.md` § Chat member list](../design-system/components.md#chat-member-list); a Panel until 2026-11-15, #4593).
  Who is listed and how it sorts: [`spec/behavior/chat/README.md`](../../behavior/chat/README.md) § Member list; geometry: [`components.md` § 7](../design-system/components.md#7-navigation-items-web).
  Reply opens no panel: clicking the quote above a reply calls `onJumpToParent`, which scrolls the timeline to the message it quotes, the same machinery pins, saved messages and deep links use.
  The panel it replaced was a read-only copy of messages already in the timeline.
  Message threads (#3785, added 2026-11-10) are a separate feature with their own replies: from 1280px, with no tool page beside chat, a thread opens as a 384px column beside the chat in the members column's place, as Discord's and Slack's do on a computer;
  narrower, or beside a tool, it opens over the chat column in place of the timeline, with Back returning to it ([`spec/behavior/chat/README.md`](../../behavior/chat/README.md) § Messages, Message threads).
  _Changed 2026-11-12 ([#4297](https://github.com/pdcarlson/Frapp/issues/4297), asked by Shawn):_ until then it never opened as a third column.
- **The channel list has no search field and no "N channels" count.**
  Find (the sidebar's Search row, Cmd/Ctrl+F or Cmd/Ctrl+K) covers channels, members and messages (`1b` pin 8), and events and backwork besides.
  A read-only channel says so only in its composer: the lock glyph it once carried in the list was dropped in [#2877](https://github.com/pdcarlson/Frapp/issues/2877), because it shared its glyph with the private-channel mark.
  - Changed in [#4668](https://github.com/pdcarlson/Frapp/issues/4668) by Shawn (`shawnatomklein-eng`), 2026-11-13, for the Messages list only (the Direct messages list until #5946): it has a **people search**, a field-shaped button under its header reading "Find or start a conversation" (Discord's words for the same field), built as Find is so the two read as one search ([`dm-search-dialog.tsx`](../../../apps/web/components/chat/dm-search-dialog.tsx)).
    Clicking it, typing on it, the header's New message pencil or the empty list's "Find someone to message" opens a centered dialog with Find's size, rows, group headings and keys.
    Before anything is typed it lists the six newest conversations under Recent;
    a name lists the member's conversations under **Conversations** (a group DM matches on any member's name or its title), then everyone else on the roster with no conversation under **Start a conversation**, each row reading Message.
    Picking a conversation opens it as a click on its row does, staying beside any open tool page; picking a member opens your DM with them through `POST /v1/channels/dm`, which also brings back one you hid, and a failure says "Could not start conversation" as the member sheet's Message does.
    When no members can be listed, a line under the conversations says why instead of "no one matches": the block list is still being read or couldn't be (with Try again), or the roster couldn't be read (with Try again).
    Closing it puts focus back on what opened it.
    Who is offered, the ranking and the copy are shared with the phone's Messages search (`searchDirectMessages` in `@repo/hooks/dm-search`, [`spec/behavior/chat/README.md` § Direct Messages](../../behavior/chat/README.md#direct-messages)).
    Comparable apps: iMessage's and Instagram's new-message search, Slack's DM search and Discord's "Find or start a conversation".
    The channel list itself keeps no field: Find still covers channels.
- **Message search stays in the channel's `⋯` menu**, with Pins, Bookmarks and the notification level, per `1t`'s own wording, although `1b` pin 11's inventory of that menu omits it.
  Deleting it would remove a capability, not chrome.
- **Not built, because each is a capability the board assumed**: the channels column's `+` (no create-channel surface exists for it to open);
  presence dots on DMs (no presence data reaches the channel list);
  a member count in the channel header (the data exists since `GET /v1/channels/{id}/members`, [#3536](https://github.com/pdcarlson/Frapp/issues/3536), and the member list already counts each role group and names the total in its search field, so a header count would repeat it;
  not built unless someone asks).
  Also not built: `4b`'s PRO chips in the nav, and `1h`'s locked-module sheet, which opens from a greyed nav row and which `1t` meant to replace chat's ops-setup nudge.
  A module that is off hides its nav row ([Gating & routing semantics](#gating--routing-semantics), owned by [`../../behavior/settings/README.md`](../../behavior/settings/README.md)), so a greyed row could only mean a module that is on but not paid for, and whether that draws a locked row is undecided ([#3056](https://github.com/pdcarlson/Frapp/issues/3056)).
  Until then the ops-setup nudge stays.
- **Catch me up** (added 2026-11-12, [#3946](https://github.com/pdcarlson/Frapp/issues/3946);
  behavior in [`../../behavior/ai.md` § Catch me up](../../behavior/ai.md#catch-me-up)) has three doors, none shown unless summaries are on for the chapter and the member: the first row of the channel's `⋯` menu, a "Summarize thread" text button in a thread's header once the thread holds 5 messages, and a strip above the timeline when a channel opens with 20 or more new messages ([`components.md` § The Catch me up strip](../design-system/components.md#the-catch-me-up-strip)).
  The summary opens in the channel itself, as a block between the channel header and the first message, in the offer strip's place (a thread's opens at the top of the thread pane). Changed 2026-11-19 at Paul's word ("I NEVER WANT TO SEE ANOTHER ONE OF THESE SIDE CARDS"): until then it was a 440px panel on the window's right edge, in the place Ask's panel had until #4702, chosen so the summary stayed beside the message a line opened, as Slack's recap and Teams' Copilot recap do; it covered the page beside chat. The block keeps that reason without the card: it is at most a third of the pane tall and scrolls inside itself, so pressing a line scrolls the conversation under it to the message and the summary is still above it. Gmail's and Outlook's thread summaries sit at the top of the thread the same way, and Discord's summaries are a strip above the channel.
  Its header row is the title, a dense segmented control picking the stretch (New messages, Last 24 hours, Last 7 days; New messages only when the channel had some; picking one asks again), then **Hide** and an ×.
  Hide folds it to the one-line strip "Your summary is still here." with **Back to summary**, the phone's strip; the × ends it. Escape inside the block ends it too; nothing is dimmed or modal, so Escape in the composer stays the composer's.
  The points sit under four group labels, each point one sentence over its author and the full date and time, and the whole point is the link. Under them, who it is for ("Only you can see this. It isn't saved."), then Summarize again and Report this.
  While it works, one line ("Reading the conversation") sits where the first group lands, so nothing above it moves.
  Leaving the channel ends the summary.
- **`@Frapp` in the message box asks Frapp from the channel** (added in #4713 by pdcarlson, 2026-11-13; behavior in [`../../behavior/ai.md` § Asking from a channel](../../behavior/ai.md#asking-from-a-channel)).
  For a member with Ask the composer's `@` list offers Frapp (`mention-list.tsx`), and while the draft names `@Frapp` a caption on the composer's control row, beside the send button, says only they will see the question and the answer.
  Where the row is too narrow for the sentence (a phone-width window) it is a private mark and "Only you", and a screen reader still gets the sentence.
  Send asks instead of posting; a refusal (files attached, no question, too long, still answering) is a toast and the text stays.
  The answer is drawn by the timeline under the message that was newest when it was asked (`components/ask/ask-in-channel.tsx`, placed by `placeAskTurns`; [`components.md`](../design-system/components.md) §11 owns the row), and it is the same turn the Ask card shows.
  It is drawn as trailing content of that message's row, not as a row of its own, so the list's count, keys and scroll position are untouched when it arrives; an empty channel draws it in the empty state's place.
  An answer being written redraws its own row and nothing else: the chat reads which turns are in its channel from a small store the conversation feeds (`useChannelAskTurns`), which changes only when a turn is added, dismissed or asked again, and each row reads its own turn (`AskChannelTurn`).
  The thread panel's reply box refuses a reply that names `@Frapp`, with a toast, and keeps the words.
  Until it is known whether the member has Ask, a message or a reply naming `@Frapp` is held with a toast and never posted.
- **The message layout is bubble-free** since [#2873](https://github.com/pdcarlson/Frapp/issues/2873); [`components.md`](../design-system/components.md) §11 owns it and supersedes the board's bubbles.

### Resources: Documents, minutes and Backwork

- **One row, one page, two views** ([#5949](https://github.com/frapplive/Frapp/issues/5949), step 5 of #5943; Paul, 2026-11-24: "resources could be consolidated into one tab (mainly centered around documents, with minutes being a doc type …), and then backwork being it's own tab within resources that you can toggle into").
  The Resources row opens Documents. Its header reads Resources, then the view labels Documents and Backwork as plain words beside the title ([`rulebook.md` § 2](../../../.claude/skills/ui-development/rulebook.md#2-page-layout), the shared `ViewLabels` from #5947); a member who can't open Backwork, or a chapter with it off, sees no labels. Each view keeps its own list, search and filters, and its own route (`/documents`, `/backwork`, `/backwork/upload`), so links and bookmarks keep working. Comparable: GitHub's and Linear's text tabs beside a page title, Google Drive's My Drive and Shared drives under one New.
- **A meeting's posted minutes are a row in Documents** ([`chapter-docs.md` § Minutes](../../behavior/chapter-docs.md#minutes)), in the Minutes folder (or its series' folder under it), shown only to who the meeting invited. The row wears the minutes glyph and reads the meeting's day, its folder, what the minutes hold in the Minutes list's words ("Recorded · 3 decisions · 5 action items") and the TL;DR's first line. It opens the minutes page, never the file viewer, and has no Download or Delete; Star, Pin and Move work as on a file. The File type filter's first group is **Minutes**, and `/documents?type=minutes` opens on it, which is where `/meetings` and a minutes page's way back go.
- **The Meetings page is gone.** Its jobs moved: posted minutes to Documents, Next up to Calendar, Write minutes for a past meeting, No minutes, the member's own drafts and Taking notes to Activity's To do, and **New minutes** to the Documents add menu beside Import a folder and Google Drive (for `meetings:record` while the module is on), as well as the event's page and New. Changed in #5949 by pdcarlson, 2026-11-24.
- **Each page keeps its own search field.**
  Both search the library they already loaded, typos forgiven, with filters beside the field: Backwork's chips, and Documents' one Filters menu (chips since #3852, one menu since #5576; [`chapter-docs.md` § Search](../../behavior/chapter-docs.md#search)) ([`backwork.md` § Browsing and Search](../../behavior/backwork.md#browsing-and-search)).
  The find bar navigates rather than narrowing a route, so deleting either would move a capability.
- Backwork's one actionable instruction (unknown departments and professors are created on upload) is field help beside those two fields, not a dialog description.
- **Folder management is a mode.**
  The rail is navigation; an officer's Edit reveals each folder's move, rename and delete controls and Done puts them away (2026-11-05).
  Pin joined them in #3934 (2026-11-11).
  Edit is not a write and is not gated; the controls it reveals are.
- **Pinned and starred lead Documents** (#3934, Shawn's idea): cards for what's pinned and starred above the unfiltered All files, Pinned, Starred and Other folders groups in the rail, and a Star and (for `chapter_docs:manage`) a Pin on each row.
  The rules are in [`chapter-docs.md` § Pinned and starred](../../behavior/chapter-docs.md#pinned-and-starred).
- **The folder rail is a tree** ([#5337](https://github.com/frapplive/Frapp/issues/5337), Shawn's pick, 2026-11-17): a folder named by its path, as Google Drive sync names them, sits under its parent with a chevron to open and close it, reading its own name, as Drive's and Dropbox's sidebars draw theirs.
  The rules are in [`chapter-docs.md` § Structure](../../behavior/chapter-docs.md#structure) and § Pinned and starred.
- **Documents is files first** ([#5576](https://github.com/frapplive/Frapp/issues/5576), Paul, 2026-11-19, from the screen critique: the first file sat at the fold of a 1440×900 window).
  Over the list sit one Upload control and one toolbar line, as Google Drive, Dropbox and Notion's file lists keep theirs:
  - **Upload** is an outlined button with a menu beside it holding **Import a folder** and, for `chapter_docs:manage`, **Google Drive** (Connect Google Drive opens Google's picker first; once a folder is connected the item opens it in Documents, where its state line and ⋯ manage it: [`chapter-docs.md` § Google Drive folder](../../behavior/chapter-docs.md#google-drive-folder), 2026-11-25), as Drive's New and Dropbox's Upload menus hold folder uploads and connected sources (`upload-menu.tsx`). Its fill goes to the files, not to the button.
  - **The toolbar** is the search field and one **Filters** menu holding Uploaded by, Date added, File type, Pinned, Starred and the order (`DocumentFilterMenu`). The trigger is tinted and counts the filters that are on, so a narrowed list says so with the menu closed.
  - **Folders** stay a rail beside the list from a 672px page (`@2xl`), where they cost the list no height. Narrower, the tool panel beside chat included, the rail folds into a **Folder** control at the toolbar's start that opens the same rail, Edit and all, in a popover, and closes when a folder is picked. They are not a section of the Filters menu, because the rail also carries folder management.
  - **A row is one line** at every width: a tile in its folder's hue, the title over its facts, and a star or pin mark when set, with Google Drive's mark on a file from Drive. Star, Pin, Who can see, Open in Google Drive (a file from Drive, #6055), Download, Upload a new version (its uploader or `chapter_docs:manage`, never a Drive file or minutes: the system file picker opens at once and the file goes onto the same document, the control spinning meanwhile and a refusal said in a toast; [`chapter-docs.md` § New version](../../behavior/chapter-docs.md#new-version), #6055) and Delete come up over the row's end on hover or when a control in the row takes focus, as Gmail's and Drive's row actions do. On a touch screen, with no hover, the same actions sit behind one More button at the row's end, as Drive's and Dropbox's touch layouts put them. A right-click on the row, or a long-press on touch, opens the same actions as the app's one action menu, as Gmail's and Drive's rows do. _(Added 2026-11-21.)_
  - **The tile's hue is the folder's** (`documentFolderHues` in `@repo/hooks/document-library`): the top folders the member has take the role palette in the rail's order, a folder drawn under another wears its top folder's hue, and a file in no folder is Slate. So a folder hidden from a member, or one added ahead of the others, shifts the colours after it: distinct colours on one screen won over one colour per folder for everyone. The rail's folder glyph wears the same hue at rest, so the rail is the key. Folder rather than file type because a chapter library is nearly all PDFs. It follows [`foundations.md` § A place's hue](../design-system/foundations.md#a-places-hue-2026-11-12): a hue names a place, never a state.
  - **There is no List | Grid** (it was [#4175](https://github.com/pdcarlson/Frapp/issues/4175), Shawn's idea, 2026-11-12, with previews from [#4647](https://github.com/pdcarlson/Frapp/issues/4647)). Changed in [#5576](https://github.com/frapplive/Frapp/issues/5576) by pdcarlson, 2026-11-19: view switchers are out, and the grid's tiles showed a few files a screen. The Directory keeps its List | Grid until [#5577](https://github.com/frapplive/Frapp/issues/5577).

### Directory

- **The row is the control.**
  Actives and alumni rows both open `MemberDetailSheet` (alumni since [#2484](https://github.com/pdcarlson/Frapp/issues/2484)).
  _Changed 2026-11-19 (Paul picked "a small card from the row", [#5684](https://github.com/frapplive/Frapp/issues/5684)): a row or tile opens the member's card beside it (chat's `MemberPopout`), and the card's View profile opens `MemberDetailSheet` as before._
  _Changed 2026-11-20 ([#5749](https://github.com/frapplive/Frapp/issues/5749), Shawn): a list row opens the card below the row, flipping above it near the window's bottom, since a row spans the Directory and beside it the card ran off the window's left edge; a grid tile still opens it beside the tile._
  There is no trailing "View details" button: a 44px button inside a 32px row sets the row's height on its own.
- **One member profile, every door** ([#3726](https://github.com/pdcarlson/Frapp/issues/3726)).
  `MemberDetailSheet` (`components/members/member-detail-sheet.tsx`) reads a member by `users.id` (`GET /v1/members/by-user/{userId}`), so chat can open it with only a sender or mention id: since 2026-11-15 (#4593) a sender's name or photo, an `@` chip or a member-list row opens chat's profile popout first, and the sheet is its View profile ([`chat/README.md` § Mentions](../../behavior/chat/README.md#mentions), "The web profile popout").
  It follows mobile s13's order ([`../mobile/screens.md`](../mobile/screens.md)): photo, name and the class-year line, Message as a small Secondary button sized to its label and centered under the name, never a full-width bar (Paul, 2026-11-20; _changed from the sheet's one full-width accent button_), then the member's roles and groups (`MemberAssignments`, below), then a flat list of Phone (when set: the number is a `tel:` link and Text beside it an `sms:` link), Email (a `mailto:` link) and Member since, then the bio, with the custom fields the viewer's tier can see, those with a value (#1749), behind a More details toggle that starts closed on every opening (#3711, 2026-11-12: contact first, logistics a tap away).
  In the Directory (actives and alumni) it opens docked in place of the list, led by a Back to directory arrow, and chat opens it docked over the chat column, led by a Back to chat arrow, so the page beside chat stays in view ([`components.md` § Surface size](../design-system/components.md#surface-size), 2026-11-12; in chat since #5616, 2026-11-19).
  Its title row draws no title, only the close or the back arrow (with the `⋯` below at its end), and the name heads the body, as § Surface size has a member sheet do.
  Under the roles sits the member's pledge class and order number ([#3939](https://github.com/pdcarlson/Frapp/issues/3939)), drawn when set, and always for a `roles:manage` holder, who gets Edit there;
  [`members.md` § Pledge class and order number](../../behavior/members.md#pledge-class-and-order-number) owns it, and mobile shows it read-only, each when set.
  Two rows mobile does not draw: Points, only where the Directory passes the leaderboard balance it already reads and only while Points is on, and Onboarding · Pending, only while it is.
  For a `points:view_all` holder the Points row ends with **Ledger**, a link to the chapter points ledger on that member (`/settings?tab=points&page=points-ledger&member=<user id>`, [`../../behavior/points.md` § Where points are read](../../behavior/points.md#where-points-are-read); #5950).
  ~~A viewer holding `roles:manage` gets Edit beside the Roles heading, which swaps the chips for the role checklist with Cancel and Save roles in the footer~~ _Changed 2026-11-19 (Paul, [#5684](https://github.com/frapplive/Frapp/issues/5684)): there is no Edit mode._ Two rows of chips, Roles in the chapter's rank then Groups (the chapter's own first), each with its color dot; the same rows sit on the card. A viewer who may change one gets an x on its chip and a "+ Add role" / "+ Add to group" that opens one searchable list of the roles under their tiers and the chapter's own groups, each tick saving at once; a role out of the viewer's rank is listed, disabled, with why, and taking away the last role with member access still asks first (#3670). A long row folds behind "+N more" (#5783). Rules: [`members.md` § Groups](../../behavior/members.md#groups).
  **Adjust points** is the first row in the `⋯` (#5950; the Points page's own button until then, which asked who): for a `points:adjust` holder while Points is on, never on the viewer's own card, and held while the plan refuses writes.
  It opens the adjustment form with the member fixed, titled "Adjust <name>'s points".
  Remove from chapter is a row in the `⋯` beside the close, drawn only when the profile read says this viewer may remove this member (`viewer_can_remove`: `members:remove`, not their own profile, and the member ranks below them, [`rbac.md` § Rank](../../behavior/rbac.md#rank)), and it asks before it acts.
  Above it, Edit name and graduation year, drawn where the read says `viewer_can_edit_profile`, opens `MemberCorrectionDialog` (#4367; rules in [`members.md` § Profiles](../../behavior/members.md#profiles)).
  Between them, Time out, or Lift timeout while one runs (#6006), drawn where the read says `viewer_can_timeout`: Time out opens `TimeoutMemberDialog` (also the message More menu's), Lift timeout asks first. A running timeout reads "Timed out until …" under the name, to the member and to whoever can time out ([chat § Timeouts](../../behavior/chat/README.md#timeouts)).
  With nothing to hold the `⋯` is not drawn ([`components.md` § Shared rules](../design-system/components.md#2-shared-rules), 2026-11-11).
  _(Changed 2026-11-11: it was a full-width red button in the footer for any `members:remove` holder, on their own profile too.)_
  Mobile's Block / Unblock is not on web's sheet; web blocks from a message's More menu and undoes it in `/profile`.
- **One sort chip** in the toolbar row carries every (key, direction) pair, in place of sortable column headers.
  The pairs, the standings and the fraternal-order sort a chapter with pledge classes or order numbers also gets, are listed in [`members.md` § Directory](../../behavior/members.md#directory).
  **A standing** (#5950: Most points, Fewest points, Most service hours) adds a **Period** group under the orders in the same menu and names its period on the chip; each row then leads with `#rank` in a narrow mono column, the viewer's row carries an outlined **You** badge after the name (Strava's and Duolingo's boards mark it the same way), and the period's total ends the row in the foreground at 600 weight, where outside a standing the all-time points are one more muted fact.
  These are the leaderboards the Points and Service hours pages drew (the service board's Strava-style pinned row and top ten went with its page).
- **The filters are chips** (Role, Group, Graduation year, Status, and the pledge class one a chapter with classes gets;
  [`members.md` § Directory](../../behavior/members.md#directory) owns the set), and so is the bulk bar's Assign role picker ([`components.md` §4](../design-system/components.md#4-inputs-and-selection);
  native selects until [#3970](https://github.com/pdcarlson/Frapp/issues/3970)).
  A chapter imported from Discord can hold 100+ roles, so a long list opens with a type-to-filter field above it and stays scrollable.
- **No card-grid view.**
  Its tile was a wrapper card per member, showed strictly less than the row, and made selection unreachable while the bulk bar still rendered.
  A second rendering of one list is chrome.
  - Changed in [#4509](https://github.com/pdcarlson/Frapp/pull/4509) by shawnatomklein-eng, 2026-11-12: the Directory offers **List or Grid** again ([#4175](https://github.com/pdcarlson/Frapp/issues/4175), Shawn's principle that a list view also offers a grid).
    The shared List/Grid control ([`components.md` § Segmented control](../design-system/components.md#segmented-control), which says where the pick is kept) sits at the tab row's trailing edge and picks it for both tabs.
    The grid answers the three reasons above: a tile is a hairline-bordered button on the page surface, not a card;
    it shows every fact the row shows, the face larger;
    and each tile keeps its checkbox, with the list's always-rendered "Select all on this page" above the grid (`components/members/member-grid.tsx`;
    the Alumni tab's tiles in `alumni-directory.tsx`).
  - Changed in [#4647](https://github.com/pdcarlson/Frapp/issues/4647) by shawnatomklein-eng, 2026-11-13: the grid no longer stretches a fixed 2 to 5 columns across a wide page.
    Two columns at the 375px floor, then from a 448px page as many tiles as fit at 176px or more (`denseGridClassName`), so a tile stays about 176 to 230px wide, as Google Drive's grid does.
- **The tab row is underlined, not a segmented toggle.**
  The board draws no horizontal tab bar; its tab shape is `4d`'s settings rail, and actives and alumni are two datasets.
  [`components.md`](../design-system/components.md) §6 is explicit: underline only.
  _(Corrected 2026-11-09, #3822: this used to name `1f`'s view toggle as a second tab shape.
  Choosing between two renderings of one dataset is picking one answer from a short set, which is § Segmented control, and Events' List/Calendar toggle is now one.)_
- **The page keeps its search field.**
  It calls `GET /v1/members/search`, a server-side search over the whole roster; the find bar lands on `/members` without narrowing it.
- **Invite sits at the trailing edge of the actives toolbar row**, not in `PageActions`.
  The route has no `<Can>`, so a `PageActions` trigger would mount `InviteMemberDialog`, and fire its `GET /v1/invites` (gated on `members:invite`), on every path and on the Alumni tab.
  The missing client permission gate on Invite, bulk assign and the row checkboxes is [#2170](https://github.com/pdcarlson/Frapp/issues/2170).

### Chat Admin and Discord Import

Flushed last ([#2500](https://github.com/pdcarlson/Frapp/issues/2500)); the board draws neither, so the grammar above is derived for both.

- **A failed background read keeps what is loaded, and says so.**
  Channels, categories, a channel's pins, the permission catalog behind a role-gated channel's grid (Chat Admin's, and the import wizard's channel step), the report queue, the chapter's Discord import and the import wizard's Discord connection each show their error state only when they have no data at all (`isError && data === undefined`).
  A refetch that fails after its retries leaves the rows, the edit form, the meters and their controls in place, rather than swapping them for an error state over a read that will likely succeed on the next try.
  Over what is kept, an empty report tab and the connection's last answer included, every one but the catalog shows one line naming it as the last that loaded, with Try again ([`components/shared/stale-read-notice.tsx`](../../../apps/web/components/shared/stale-read-notice.tsx), the import watch panel's line, shared): without it a deletion's meter that stopped moving reads as stuck rather than stale.
- **The screen-level denied state is a plain line, not a card** (2026-11-05): "Your role can't manage channels." on Chat Admin, "Your role can't import Discord history." on Discord Import, each with who can change it, under the page's title, as on `/reports`;
  Study zones draws the same line inside its Chapter settings page.
  A permission check that can't run offline still draws `PermissionsOfflineSurface`, the shared offline state with its Retry, in place of the body.
  While the read is in flight, all three routes and the Study zones page draw the body's skeleton rather than a "Checking your chapter permissions…" line (2026-11-05).
  The report queue has no denied state: a role that can't review reports simply doesn't see the queue (Paul, 2026-11-11).
- **Two pages on one route, scoped like Discord's channel settings** (Paul, 2026-11-11: "scope the chat admin panel to whatever channel you're editing"; "reported messages should be at the bottom"; "don't need a list of all the channels right here").
  `?channel=<id>` is that channel's page alone, in the settings-row shape of Discord's channel settings ([#6031](https://github.com/frapplive/Frapp/issues/6031), Paul's pick on its concept page, 2026-11-25; `components.md` § Settings rows): a "‹ Chat admin" back line and a `<h2>` naming the channel, then Name and Description with Save channel under them, then three groups of rows, **Access** (Category, Who can see, Who can post, and Match <category> while it differs, with the match state as the footnote), **Defaults** (Default notifications, Chapter default channel, Leave out of Activity) and **Moderation** (Pinned messages with its count, Reports with its open count), then Delete channel, red and alone, last.
  Every row saves on its own the moment it changes; Save channel covers only the two typed fields (#6033 makes those save on their own too).
  Who can see, Who can post, Pinned messages and Reports each open a page of their own with a way back to the channel (`&page=see|post|pins|reports`); an access page has its own Save, since an empty chosen list must never save by accident. The type badge went: a private channel's Who can see reads "Only people added".
  It shows no other channel, no categories and no chapter background.
  Without a channel the page is Chat admin (`?tab=chat&page=chat-admin`, opened from the Chat page's row, #6030): a **Channels** group (New channel on its heading, the category tree, New category as its last row), then **Look** (Chat background, a row with its current choice that opens the picker at `?tab=chat&page=background`) and **Moderation** (Reports with its open count, opening the whole queue at `?tab=chat&page=reports`, the only place a report about a DM appears). Discord import is a row on the Chat page itself (#6030).
  **Categories fold out to their channels** ([#5727](https://github.com/pdcarlson/Frapp/issues/5727), Shawn, 2026-11-20), the way Discord's server settings list channels under their categories and Slack's sidebar sections fold: each category row is a toggle (a chevron that turns, the name, then its access summary and channel count), closed until clicked, and opens to its channels, each row opening that channel's page.
  The groups are the rail's sections in the rail's order: channels in no category first, under **No category** (the rail's "Channels"; the category picker on both apps says the same, #6031), then the categories in the server's order (a **System** group held the audit log last until `#chapter-audit` was removed on 2026-11-21), each sorted inside by the chapter's drag order and then A to Z (`groupChannelsByCategory`, `compareChannelOrder`).
  No category and System have no row actions; a category's rename, who can see and post, and delete are in its ⋯ menu and on right-click (#6031; three icon buttons on every row until then). A group starts closed, except No category when the chapter has no categories, since it is then the only way to a channel; once the officer opens or closes a group, that choice holds until they leave the page, through a category being created or deleted.
  This replaced the Edit a channel picker, which reached the same pages and ran off the screen at 20 or more channels ([#5724](https://github.com/pdcarlson/Frapp/issues/5724)).
  **Reports stay out of the way** (Paul, 2026-11-11: "it doesn't need to be staring you right in the face"): on either page the queue is one row saying how many reports are open ("None open"), and its page shows it whole (#6031; until then the queue sat last on the page, folded to a quiet Report history link with nothing open).
  The new-report notification opens the chapter's queue page (`?tab=chat&page=reports`); an older link's `#reported-messages` on the Chat page or Chat admin lands there too.
  A channel's own page lists no other channel; the chat rail's right-click Edit channel opens it, and so does a row in the chapter page's category tree.
  Until 2026-11-20 neither page listed every channel ("the chat rail is that list").
  Changed in #5733 by shawnatomklein-eng, 2026-11-20: the chapter's page lists every channel inside its folded category.
  The form has no type field because the update route takes none; the create panel, where the type is chosen, says it is final.
- **The report queue keeps two lines of its own**: under its label, that each report shows the message as it read when reported and that who reported it is never shown; and on the Open tab, that Mark reviewed and Dismiss leave the message up.
  A row can show neither, and neither button's label says the second.
- **The import wizard renders above the page's state branches**, on the page surface.
  It keeps every choice in its own state, so a branch that unmounted it lost them; the delete confirmation sits above those branches for the same reason ([#2944](https://github.com/pdcarlson/Frapp/issues/2944)).

### Chapter ops: Events, Tasks and Study zones

Flushed together on 2026-11-05 (with `/polls`, since retired, #3871); the board draws none of them, so the grammar above is derived.

- **Events is one agenda** ([#5560](https://github.com/pdcarlson/Frapp/issues/5560), Paul, 2026-11-19), in place of the List and the Calendar and their switchers ([`design-system/README.md` § 2](../design-system/README.md#2-de-google-guardrails)), as Fantastical's and Google Calendar's Schedule views list days.
  The days run in order from an anchor day (today unless a day was picked), each under its written-out heading, holding that day's events by start time, then its tasks, then its birthdays.
  A day with nothing is skipped, except the anchor: `Today` always shows, reading `Nothing today.` when empty. When the seven days from the anchor hold nothing, one line says `Nothing this week.` and the agenda carries on to the next days that have anything.
  It reaches four weeks; **Show more** adds four more, and picking a day keeps that reach. When the window holds nothing, it carries on to the next day that has anything.
  The viewer's unfinished tasks due before today gather under an **Overdue** group at the top of Upcoming, before Today, each still saying `Overdue`; the Tasks key counts them.
  Under Past it lists past days back from today, newest first, as the list did, carrying back past the window to the last day with anything, and `No past events.` when there is none; a day picked under Past heads it (`Nothing on <day>.` when empty), and Past then lists back from that day.
  Rules: `apps/web/lib/events/agenda.ts`.
  **A row's kind is its colour**, the same hue its navigator dot and colour key swatch wear (`CALENDAR_KIND_HUE` in `@repo/hooks/activity-agenda`, beside the Activity strip's hues: events sky, tasks green, birthdays rose; never the accent, never red).
  An event row has a 4px sky bar at its left and a faint sky wash (9%); a task row a 16px green ring, filled once the task is done, when its title is struck and muted; a birthday row a 16px rose rounded square.
  The title is 600 weight in the foreground; the meta line (time · place · points, a task's status, `Birthday`) is muted, and an assigned task names its assignee, or its progress (`0 of 3 done`), at the right. A task handed to many is one row (`selectCalendarTasks` groups them), and a task row opens the task card below.
  **A required event is the loudest row**: sky at 22%, a 1px sky edge at 60%, and `Required` in sky after the title, in place of the grey Mandatory badge.
  **The navigator** jumps the agenda to a day and is not a view: on a pane at least 720px wide (measured on the page, not the viewport, since beside chat it can be 375px) a ~260px column left of the agenda holds a small month (its name with chevrons, seven columns of the month's own days, no trailing week, and up to three dots a day, one per kind it holds); narrower, a seven-day strip over the agenda (weekday initial, number, dots, chevrons that step a week), ported from the phone's Activity strip.
  Today is the filled chapter-accent disc; the picked day a 1.5px foreground ring; the two never look alike.
  Picking a day scrolls the agenda to its heading, or, when the agenda isn't listing anything there (before the anchor, or nothing on it), starts the agenda on it, reading `Nothing on <day>.` when empty.
  **The colour key is the filter**: under the month (or in one row under the strip), a toggle per kind, its swatch, `Events`, `Tasks` or `Birthdays`, and how many the agenda's range holds. Off, the swatch goes hollow, the name is struck through and muted, and the kind's rows and dots go; the count stays. It is remembered per user on this browser as the kinds hidden. My tasks and Assigned by me are both Tasks.
  _(Changed in [#5948](https://github.com/frapplive/Frapp/issues/5948) by pdcarlson, 2026-11-27, Paul's decision 1 on #5943, "Calendar is the chapter's events and birthdays, tasks off unless their key is turned on": until a member touches the key, **Tasks are off** (`DEFAULT_HIDDEN_CALENDAR_KINDS` in `@repo/hooks/calendar-tasks`), and turning them on is remembered as before. The key's group reads "Show on Calendar". A member who had already stored a choice keeps it. Until then every kind showed until switched off.)_
  Search matches task and birthday titles too, of the kinds the key shows (so a task's title finds nothing while Tasks are off, #5948); the Attendance and Cadence filters, which only an event answers, leave no tasks or birthdays.
  The navigator's header has a quiet **Today** once anything moved off today (a picked day, another month or week), which brings the month or week and the agenda back to today; picking today does too.
  **Hours ›**: each day heading ends with a quiet Hours button that swaps the agenda for the hour grid (below) on that day, three days on a wide pane and one on a narrow one, with a **Calendar** back button (**Events** until #5948) that returns to the agenda on the same day. With three days a column heading's **Open <day>** shows that day alone, whose hours are the keyboard's way to make an event. The grid wears the kinds too: event blocks and chips the sky wash with a sky edge (the required treatment for a required one, never the accent, which marks today), task chips the green ring, birthdays the rose square. The hour grid is to be rebuilt in step 3 of #5560.
  The event's detail sheet heads its title with the same 4px sky bar; `Required` is a hairline badge in the state line under it when the event requires the viewer (since 2026-11-22; sky text after the title until then).
  The toolbar recedes to the title row's trailing side: search, Filter, Subscribe, and New event, still the one primary action and still gated, drawn in accent text with a 1px accent edge at 35% and no fill. Since 2026-11-19 they are in the page header beside the X, and that look is every page's main action (the Button `action` variant).
- **Events: the row is the control**, as on the Directory: it opens `EventDetailSheet`, with no trailing "View details" button.
  It keeps the 44px height of the first row shape above, because its meta line wraps under the name on a phone.
  **Reworked 2026-11-09 ([#3822](https://github.com/pdcarlson/Frapp/issues/3822), Paul):** the list has no checkboxes by default.
  A role holding `events:update` (the permission bulk Mark attendance complete's auto-absent POST checks) gets a **Select** button in the list header, which enters a selection mode: a checkbox in each row's trailing column and the select-all in the header's, with the header's trailing controls swapped in place for Mark attendance complete and Done.
  That column is reserved for such a role in or out of the mode, and no strip mounts above the rows, so entering the mode or ticking a row moves nothing (the old selection bar mounted above the list and pushed it down).
  The bulk button also takes the event write subscription gate, as the attendance panel's does.
  Rows sit under written-out day headings; a repeating series is one row, its next meeting, reading `Every Sunday · 6:48 PM`, and opening it lists the series' upcoming meetings under the one it opened.
  Under Upcoming the list holds today through the next 14 days, and what starts later waits behind a **Later** disclosure ([#3707](https://github.com/pdcarlson/Frapp/issues/3707);
  the series and horizon rules are `@repo/hooks/event-series`; mobile's Calendar reads only its cadence line from there since #5310 ([#3823](https://github.com/pdcarlson/Frapp/issues/3823))).
  _(Changed in [#5560](https://github.com/pdcarlson/Frapp/issues/5560) by pdcarlson, 2026-11-19: the agenda reaches four weeks with Show more past them, not a 14-day horizon and Later; a series row still collapses, from the agenda's first day.)_
  Mandatory is the hairline badge, not a red pill on every row, and it means the event requires this viewer, by default or by a role of theirs ([`events.md` § Attendance by role](../../behavior/events.md#event-creation); #4132, 2026-11-13: until then web drew it for an event required of everyone, and the chat event card drew it red).
  _(Changed in [#5560](https://github.com/pdcarlson/Frapp/issues/5560) by pdcarlson, 2026-11-19: it is the agenda's loudest row and the word `Required` in the events hue, above; what it means is unchanged.)_
  The toolbar is `PageActions` like every route's: the List and Calendar toggle leads as the page's primary control, a segmented control ([`components.md`](../design-system/components.md) § Segmented control;
  it was underlined tabs until #3822), and the page opens on whichever view this person last used on this browser;
  then search and one **Filter** button (`FilterMenu`, [`components.md`](../design-system/components.md) § 13 Filter bar), whose menu has a row each for Time, Attendance and Cadence and Clear all, and which shows a count while any is off its default; the filters that are on show as removable chips under the header (2026-11-20, #5739) (Time only on the list, the one view it applies to).
  New event holds the trailing edge.
  On a phone search and Filter take `order-last`, so the view toggle and New event keep the first line.
  The calendar is a radius-14 hairline frame on `--background`, not a card.
  _(Changed in [#5560](https://github.com/pdcarlson/Frapp/issues/5560) by pdcarlson, 2026-11-19: the List and Calendar toggle, and the Calendar's month grid and compact month, are gone, and Time applies to the agenda; the toolbar is above.)_
  **Month, Week and Day** ([#4818](https://github.com/pdcarlson/Frapp/issues/4818), Shawn, 2026-11-13), the way Google Calendar, Apple Calendar and Outlook offer them: a Month / Week / Day segmented control in the calendar header beside Today and the chevrons, which step a month, a week or a day, and the choice is remembered per browser like the List/Calendar toggle.
  Week and Day are an hour grid (48px hours, an hour column at the left, opened scrolled to 8 AM): each timed event is a block at its start as tall as it lasts, events that overlap share the column side by side in equal lanes, an event lasting a day or more sits in an **All day** strip at the top, on every day it covers, with the day's tasks, and a red line marks the time now in today's column.
  The week starts on Sunday, as the month does.
  A day's heading in the Week opens it in Day.
  Switching views keeps the day the calendar is on (the compact month's picked day is that day), and a chapter with no events is told to press an hour.
  A creator presses an empty hour to make an event starting then (the month's day number still starts one at 6 PM); in the Week the hours stay out of the tab order and the Day's hours are the keyboard path.
  Below the compact width (600px, beside chat) the Week draws three days from the day it is on and its segment reads **3 days**, as Google Calendar's phone app does.
  Placement rules: `@repo/hooks/calendar-time-grid`.
  _(Changed in [#5560](https://github.com/pdcarlson/Frapp/issues/5560) by pdcarlson, 2026-11-19: the Month / Week / Day control is gone; the hour grid is reached from a day heading's Hours, three days wide or one day narrow, and the hours stay the creator's way in.)_
  **The calendar shows tasks too** ([#4144](https://github.com/pdcarlson/Frapp/issues/4144), Paul): the viewer's own on their due day and the ones they assigned, from the same `GET /v1/tasks` read Activity's task board uses (a member gets their own rows;
  a `tasks:manage` holder gets the chapter's, of which the ones they created are theirs to follow), so it needs no endpoint.
  An event is a filled chip with an edge; a task has no fill and leads with a round mark for where it stands, the way Google Calendar sets tasks apart from events: an empty ring to do (red when overdue), a ring with a check waiting on an officer, a green check confirmed and struck through.
  An assigned task names who it went to, or, handed to many members, is one chip with how many are done (`8/20`).
  Events, tasks and birthdays share the day's cap of three before `+N more`.
  A chip opens a card: the due day and status (and who assigned it), or each assignee and their status, with **Open task**, which opens it in the task panel on Activity (`/activity?task=<id>`, #5948; Open Tasks went to the Tasks page until then).
  Toggles under the month (Events, My tasks, Assigned by me, Birthdays) switch each kind and double as the key; they appear only for kinds the viewer has and are remembered per browser as the kinds hidden, so a kind added later starts on.
  On the compact month a day carries a ring after its event dots when anything is due, and the picked day lists its tasks after its events.
  Rules and words: `@repo/hooks/calendar-tasks`, which mobile's Calendar reads too.
  **A task due at a time** ([#5116](https://github.com/frapplive/Frapp/issues/5116), Shawn, 2026-11-15) sits on that moment's local day and says its time in the viewer's clock ("5 PM", or "17" on a 24-hour clock, as the Tasks rows write it): its agenda row's line under the title starts with it, its card reads "Due Thursday, November 20 at 5 PM", and the hour grid draws it as a slim marker at that time (half an hour tall, ending at midnight for a task due in the day's last half hour), sharing lanes with the events it overlaps, the way Google Calendar draws a timed task; a task with no time stays in the All day strip.
  A day's timed tasks list first, by time, then its untimed ones, as [`tasks.md`](../../behavior/tasks.md) orders a day; one task an officer handed to many at two different times is two rows. On the grid an assigned task's marker still names who it went to or how many are done.
  _(Changed in [#5560](https://github.com/pdcarlson/Frapp/issues/5560) by pdcarlson, 2026-11-19: tasks are agenda rows in the Tasks hue, above; the layer toggles became the colour key, which switches Tasks as one kind; the hour grid's All day strip still draws the chips.)_
  _(Changed in [#5948](https://github.com/frapplive/Frapp/issues/5948) by pdcarlson, 2026-11-27: tasks are off until the member turns on the colour key's Tasks (above), so all of this applies once they are on; the hour grid's back button reads Calendar.)_
  **Birthdays too** ([#4959](https://github.com/pdcarlson/Frapp/issues/4959), Shawn, 2026-11-14): every birthday a member shares with the chapter ([`members.md` § Profiles](../../behavior/members.md#profiles)) is an all-day item on its day each year, listed before the day's tasks, from `GET /v1/members/birthdays`.
  It draws a cake and the member's name with no fill and nothing to open, as Google Calendar draws its birthdays calendar; on the compact month its day carries a muted dot.
  A **Birthdays** toggle beside the others hides them.
  Rules: `@repo/hooks/calendar-birthdays`.
  _(Changed in [#5560](https://github.com/pdcarlson/Frapp/issues/5560) by pdcarlson, 2026-11-19: a birthday is an agenda row with a rose square, after the day's tasks, and the colour key's Birthdays hides it.)_
- **Tasks: each kanban column is a `<section>`** with a `SectionLabel` carrying its count, on `--background`.
  Tiles keep a hairline frame (radius 14, no fill) rather than flush rows, because a tile is a block with its own controls.
  Confirm is the one primary on a tile; the rule that you can't confirm your own task shows on that tile only.
  **Tasks is a Grid or a List** ([#4175](https://github.com/pdcarlson/Frapp/issues/4175), Shawn's idea, 2026-11-12).
  The List / Grid switch ([`components.md` § Segmented control](../design-system/components.md#segmented-control)) sits at the trailing edge of the row over the groups, where Linear and Asana keep their List / Board; since 2026-11-15 that row also holds the view switch and filter chips (below).
  Since 2026-11-18 List / Grid is a pick in the toolbar's **View** menu (below), not a segmented switch, so the toolbar fits the Tasks column beside chat.
  Grid is the board above and stays the default.
  List is the same groups (To do, In progress, Waiting on an officer, Overdue, then Confirmed) stacked top to bottom as flush rows split by a hairline: the tile's title, one line of description and meta line lead, and its controls (Start or Mark done, Confirm and Send back, Edit and Delete) end the row, wrapping within its trailing half on a narrow page.
  Changed 2026-11-18 (Paul: "I had to scroll all the way down just to see the regular tasks"): List is the default. A List row is one compact line, as Linear's, Asana's and Todoist's lists are: a checkbox, the title, who, due and points, so an exec's 20 to 40 tasks fit on a screen. Every other control and every edit is in the task panel the row opens ([`tasks.md` § Task Lifecycle](../../behavior/tasks.md#task-lifecycle)). A group task is one row naming its target with its done count. Suggested tasks are a one-line strip at the top of the board whose Review opens the list. **Up for grabs** sat over the groups until #5948; it is on Activity's Mine now ([§ Activity](#activity)).
  The add row shows only once **New task** is pressed, at the head of the list (below).
  Changed in [#4582](https://github.com/pdcarlson/Frapp/pull/4582) by shawnatomklein-eng, 2026-11-12: the framed tiles above are the default Grid, and List adds flush rows beside them.
- **Tasks: Everyone's** ([#4295](https://github.com/frapplive/Frapp/issues/4295) step 5, [#3617](https://github.com/frapplive/Frapp/issues/3617), [#5578](https://github.com/frapplive/Frapp/issues/5578), [#5948](https://github.com/frapplive/Frapp/issues/5948); rules in [`tasks.md` § Views](../../behavior/tasks.md#views)).
  There is no Tasks page since #5948: the board is Activity's **Everyone's** view ([§ Activity](#activity)), and the member's own tasks are Activity's To do. The bullets here describe the board as Everyone's draws it.
  Its header holds, at its end, the one **Filter** button and **New task**, as [`components.md` § Filter bar](../design-system/components.md#filter-bar) lays out every list (Paul, 2026-11-20). At rest nothing sits between the header and the first task: no chips, no add row (#5578, Paul, 2026-11-19), as Linear's issue list and Things 3 open straight on the work. Filter (`FilterMenu`) holds, on an officer's Everyone's, **Assignee**, **Status** and **Due** (each the values some task has, searchable past eight) and **Group** (By status / By person), and on every view **Layout** (List / Grid); Group and Layout are rows like other lists' Sort, never counted or cleared. A filter that is on shows as a removable chip under the header (`ActiveFilterChips`), and Filter counts it.
  A member who follows another member's task ([`tasks.md` § Following a task](../../behavior/tasks.md#following-a-task), #5473) gets Everyone's too, with no filters, over what they can read.
  **New task** opens the add row at the head of the list with its More open; Escape on an empty row, or its close, puts it away, and a half-typed task is kept for the next New task.
  With nothing on the board, a List says so in one line ("No tasks yet. New task gives one to a member."); a Grid keeps its four lanes.
  _(Changed in [#5578](https://github.com/frapplive/Frapp/issues/5578) and [#5699](https://github.com/frapplive/Frapp/issues/5699) by shawnatomklein-eng, 2026-11-19: it was an officer's My tasks / All tasks switch on its own row opening on All tasks, a second row of filter chips, an add row always shown, and a My tasks row that showed a group copy as the viewer's alone. #5578 asked for no segmented control; the switch stays as the header's view switch, which Paul's 2026-11-20 Filter bar standard sets for two named sets.)_
  _(Changed in [#5947](https://github.com/frapplive/Frapp/issues/5947), Paul, 2026-11-24: the view switch became the two views as plain words beside the title, with none drawn for a member who has one view.)_
  _(Changed in #5948 by `pdcarlson`, 2026-11-25: the page's My tasks view, its Overdue / Today / This week / Later grouping and the group copy's "Everyone · 14 of 20 done" line under My tasks (#5699) went with the page; Mine and Everyone's are Activity's views, and the member's own tasks are To do's rows.)_
- **Service hours and Study are not pages** (#5950, Paul's pick, 2026-11-24): your own hours and sessions are panels on the profile ([§ Profile](#profile)), the service leaderboard is a Directory sort ([§ Directory](#directory)), reviewing is Activity's ([§ Activity](#activity)), and the chapter's reviewed entries are on Chapter settings' Service hours page.
  _Changed in #5950 by pdcarlson, 2026-11-24:_ "Service hours opens on yours" ([#4669](https://github.com/pdcarlson/Frapp/issues/4669), Shawn, 2026-11-12) drew your stats and log first, the leaderboard beside them with your row pinned under the top ten (after Strava's club leaderboard, Duolingo's league list and GreekTrack's member tracker), then an approver's Review queue and Chapter history; your stats and log keep that order in the Service hours panel.
  The `/study` page's running timer was the route's one framed block; the web runs no session now ([`../../behavior/study-sessions.md` § Surface Coverage](../../behavior/study-sessions.md#surface-coverage)).
- **Study zones are a flush list** with quiet row actions, and New study zone (a `NewButton`) sits on the Zones section's label row, since Study zones is a Settings section rather than a page with a header of its own.
- **Denied copy names the role, never the permission key**: "Your role can't see every poll." was the shape, not `polls:view_all`.
- **Dates in the house shapes**: `@repo/formatting`'s display helpers ("Friday, November 6 · 5:00 – 7:00 PM", "Due tomorrow", "Overdue by 2 days"), written out as [`writing.md` § 5a](../design-system/writing.md#5a-dates-and-times) says, never a numeric date with seconds.
  Both apps' task due lines read the same helpers through `@repo/hooks`' `taskDueLine`, and both chat event cards read `formatEventWhen` ("Tonight · 6:00 – 7:00 PM", or "Friday · All day" for a dated event; `formatEventWindow` until #6098), since #4135 (2026-11-12).
  Mobile's event rows still format their times with their own copy until they read these ([#3420](https://github.com/pdcarlson/Frapp/issues/3420)).

### Recruitment

Added in #5924 by `gampheadband`, 2026-11-23, from Winston's UI design v8 § 3b. Rules: [`../../behavior/rush.md` § Pipeline](../../behavior/rush.md#pipeline). Code: `apps/web/components/rush/`, the route `/rush`.

Changed in #5934 by `gampheadband`, 2026-11-24: contacts, owners, follow-ups and the stale alert ([`../../behavior/rush.md` § Contacts, owner and follow-ups](../../behavior/rush.md#contacts-owner-and-follow-ups)), search, and kept note drafts (#5931).

Changed in #5973 by `gampheadband`, 2026-11-24, from Winston's UI design v8 § 3b: bids (the Bid extended column, the panel's Bid row and the PNM's one-tap page), the Summary layout, the Recruitment settings' Bids, Joining and Sign-ups rows, and the slash command's picker when a name matches several prospects.

- **The page** is named with the chapter's word for recruitment. Beside its title sit **Board / List** as plain view labels (#5947), opening on Board and remembered like the other list layouts (`lib/list-layout.ts`), as Linear's is. Its header holds the count of open prospects ("48 prospects") and **New prospect** for `rush:add`, a centred dialog asking one name (a taken name is said under the field). The count adds the viewer's own follow-ups due today or earlier ("48 prospects · 3 follow-ups due today"), and leaves that part off at 0. A **search** field narrows the board and the list by name (word starts, `matchesWordStarts`). For `rush:add`, **All / Follow up** view labels sit before Board / List, a view rather than a filter as Tasks' My tasks / Everyone's is (rulebook § 9): Follow up holds the viewer's follow-ups due today or earlier and the prospects they own that need one (`isRushFollowUpForViewer`), the list ChapterBuilder's follow-up alerts and a HubSpot or Pipedrive "my activities due" view gather. Like Tasks, the page opens on Follow up when it holds anyone and on All when it doesn't, and keeps that first answer; empty, it says what goes there in one line. `/rush?prospect=<id>`, the follow-up and stale pushes' link, opens that prospect's panel. Share form joins the header in a later slice. Beside chat the header folds on its own width (2026-11-24): below 52rem the count goes and search is a glyph that opens into its field; below a header of about 36rem (the fold is measured on the page, and unfolds 40px later so it doesn't flicker) both sets of view labels fold into one **View** menu among the actions ([`../design-system/components.md` § View labels](../design-system/components.md#view-labels-change-a-pages-or-a-lists-view)).
- **Board**: a column per visible working stage, then one **Closed** column holding every Closed stage, so the board fits a laptop window, as Pipedrive's and HubSpot's deal boards do. Beside chat the columns share the page's width: a stage holding prospects grows to fill the row between 12rem and 20rem, and an empty stage folds to its label, still a column a card drops on, so the stages that hold people get the room (Paul, 2026-11-24, on four fixed 256px columns that cut the one holding prospects off mid-card). Only past that does the board scroll sideways, and a column cut by the pane's edge fades out rather than stopping dead. A card is the name, its owner ("Owned by {name}" or "No owner") with a follow-up not yet due after it ("· Follow-up Thursday"), the rating summary for `rush:view_results`, and up to two tags with a count, then the warning badges: **Follow-up {day}** once it is due today or earlier, else **Needs follow-up** once nobody has logged a contact for the chapter's stale days. A closed prospect shows neither. With `rush:add` a card drags to another column, and its ⋯ has **Move to** for the keyboard; dropping on Closed asks the reason (and which Closed stage, when there are several) in a centred dialog, and cancelling puts the card back. Moves show at once and are announced.
- **Bids on the board** ([`../../behavior/rush.md` § Bids](../../behavior/rush.md#bids)): while a bid is out, a **Bid extended** column sits before Closed and holds every prospect with one, whatever their stage; an accepted prospect folds into Closed, listed first under "Accepted · N" with the closed ones under "Closed · N". Those cards don't drag, since only a bid action puts them there; Move to and the panel still change their stage. A card wears its bid's badge: Bid extended (info), Waiting to confirm (warning), Accepted (success), or Declined, Bid expired or Rescinded (outline).
- **List**: the same prospects as a sortable table: name, stage (with the Closed reason), owner, follow-up (the same text or badge as a card; sorting puts Needs follow-up first, then follow-ups by day), tags, rating, added. On a narrow page the table leaves columns out rather than scroll its ⋯ off the edge, Tags first, then Rating, Owner and Follow-up; name, stage, Added (the order it opens in) and the ⋯ always show, and the panel holds the rest. Owner took Added by's column in #5934; who added a prospect is on their panel.
- **The prospect panel** docks on the right, as the task panel does: the name; first its state, "Last contacted November 18 · by Chris" or "No contact logged yet", with **Log contact** beside it for `rush:add` (not on a prospect linked to the viewer): a menu of the six kinds where a pick logs it today, two clicks, as HubSpot's Log call is, and **Another day or a note…** last, a centred dialog with How, When (today back to 120 days) and an optional note of up to 500 characters, its draft kept per prospect; Stage (`rush:add`); **Owner**, the name or "No owner", with **Claim** on an unowned prospect and **Let go** on the viewer's own for `rush:add`, and for `rush:manage` a searchable member picker (the viewer first, "No owner" leading it to clear), a refusal said under the row in the phone's words; **Follow-up** (not on a closed prospect), "Thursday, invite to house dinner" with "· for {name}" when it isn't the viewer's, the day in the warning colour once due, or "None" with **Needs follow-up** when stale, and for `rush:add` **Set** or **Change** (a centred dialog: When, today up to 180 days; What to do, up to 120 characters; For, the owner by default, from a searchable member picker; its draft kept per prospect) and a × to clear; **Bid**, for `rush:bid` or once a bid exists: its state first ("Bid extended yesterday by Chris" / "Expires Tuesday"; "Recorded by Chris, waiting to be confirmed" / "Emailed them to confirm. It expires Tuesday if nobody does."; "Accepted, confirmed by them today"), then compact buttons for what the viewer may do now: **Extend bid**, **Confirm acceptance** (`rush:manage`), **Record acceptance** (a centred dialog asking the PNM's email, "Only Frapp sees it", or for a linked member "Leave it empty to use their Frapp account's email"), **Record decline** (confirmed first) and **Rescind bid** (`rush:manage`, red, last, with a reason); none on a prospect linked to the viewer; the viewer's own 1 to 5 stars (`rush:vote`) and the average and count (`rush:view_results`); the anonymous Vote, with its count for `rush:view_results`; tags, edited from the chapter's list with `rush:notes`; then **Contacts**, once one is logged: newest first, "Texted · November 18 · by Chris" with its note under it for a reader the server shows notes to, five and then Show all; and **Notes · chapter only** for `rush:read_notes`, newest first, with a box to write one for `rush:notes` (its half-written draft kept per prospect, so opening another prospect and coming back finds it, as on the phone), edit and delete of one's own and delete of any for `rush:manage`. A writer who can't read sees the box and "Your role can't read notes. The roles your chapter lets read them can." The notes are not drawn on a prospect linked to the viewer.
- **Summary**, the third layout label after Board / List ([`../../behavior/rush.md` § Funnel](../../behavior/rush.md#funnel)), as Pipedrive's Insights and HubSpot's deal dashboard sit beside their boards: a bordered row of numbers (Open prospects, Yours for `rush:add`, Need follow-up, Follow-ups due, Bids out), then **By stage**, a row per board column in the board's order (Bid extended and Closed as on the board) with a neutral bar and its count, then **Bids** (Extended, Out, Waiting to confirm, Accepted, Declined, Expired), then, for `rush:view_results` only, **Top rated** and **Most votes**, five open prospects each, a row opening the prospect's panel. It counts the whole pipeline, so the All / Follow up labels and the search leave the header while it shows; it isn't remembered, and the page opens on Board or List.
- **The PNM's one-tap page** (`/recruitment/confirm`, under the sign-in frame, no account needed): "{Chapter}'s bid", "Recorded by Chris, waiting to be confirmed", **Confirm I accepted**, and "Didn't accept? Leave it. The bid expires December 1."; then "Accepted · confirmed by you"; a closed bid says there's nothing to confirm, and a used or dead link that it doesn't work any more. Where the confirmation email's button lands; it moves into the PNM's own view at `/me/recruitment` with the school layer.
- **A name that matches several prospects**: `/<word> vote` or `bid` by name opens a centred dialog, "Several prospects match "Jake Smith"", with a row per match (the name, then its stage and the day it was added); a pick runs the command for that one, and closing runs nothing ([`../../behavior/ifc-recruitment.md` § Name lookup](../../behavior/ifc-recruitment.md#name-lookup)).
- **Empty and failed**: a chapter with no prospects gets one line naming New prospect and `/<word> add`; the module off, and a role without access, each get one line.
- **Chapter settings → the Recruitment module page** adds these blocks above its Who can, all editable with `rush:manage` and read-only otherwise: **Stages**, grouped by category, renamed in place, hidden, dragged to reorder within a category (arrow keys on the grip), and added per category, each change saved once `rushStagesProblem` passes and its message shown otherwise; **Tags**, added, renamed and deleted; **Follow-ups**, one settings row, "Needs follow-up after [7] days", typed and saved on Enter or leaving the field with a quiet "Saved", Escape putting it back, from 1 to 60, and read-only otherwise as "Needs follow-up after 7 days without a logged contact"; **Bids**, one settings row, "Bids expire after [7] days", typed like Follow-ups' from 1 to 30; **Joining**, one settings row, "New member role", whose menu lists the chapter's roles (none that holds everything) and opens on the first role in the New members tier marked "(default)", or asks for a pick when that tier holds no role or was renamed away; **Sign-ups**, used once the interest form is open: "Recruitment contacts", a menu of the chapter's Groups (No Group first) naming any member of the picked Group who can't open recruitment, and "Card channel", a menu of the channels (No card first) that refuses one anyone without `rush:view` can read, said in a toast; and, while no tier or role holds `rush:read_notes`, **"Nobody can read recruitment notes yet."** with **Let the top two tiers read them**, which grants it to the chapter's two highest tiers and needs `roles:manage`.

### Profile

- **One form-width column** (`max-w-2xl`): the identity header, the viewer's numbers (All time, below) and class, Last week and This semester, then the directory profile form as a section under its label.
  The settings blocks that used to follow it (quiet hours, notifications, chat density, blocked members, Discord history, the Account rows) are the personal Settings page since 2026-11-10 ([§ Two doors](#two-doors-chapter-settings-and-your-settings)), in the same grammar: a section under its label with at most one line under it, switches and Account rows as flush lists.
- **Same content as the phone's s15, web's own grammar** ([#4137](https://github.com/pdcarlson/Frapp/issues/4137), Shawn, 2026-11-12).
  The header carries the name, the phone's major · company · 'YY line (from the saved profile), the email, and the photo controls; the initials take the member tint, or `--foreground` without one, as on the phone.
  Under it, the viewer's numbers and their pledge class and order number, read-only and each only when set, as [`../mobile/screens.md`](../mobile/screens.md) s15 draws them.
  A viewer whose role lacks `members:view`, which both reads and the class rows require, sees none of them rather than a failure note.
  Four differences are deliberate:
  - The photo sits beside the name, not centred over it: a desktop profile reads left to right, as Slack's and LinkedIn's do on the web, and the form under it is left-aligned.
  - The numbers are three doors in a ruled frame; the phone draws only a points figure beside the You title and leaves service and study to the This semester gauges.
  - Editing is an inline form with Save profile; the phone shows read-only rows that open a sheet.
    A desktop has the room to show every field editable at once, as Slack's and LinkedIn's web profile editors do, while the phone keeps a readable profile and edits on demand.
  - The email stays in the header, under the major · company · year line; the phone moved it to its Details rows.
    Web has no Details list: its form holds only fields the member edits, and the email is not one of them, so the header, where web shows who you are read-only, is its only place.
- **Your numbers are doors** (#5950, Paul's pick, 2026-11-24; `components/standing/`): an **All time** frame of up to three cells, Points, Service hours and Study hours, each its figure under its label with a chevron, ruled like This semester's gauges under it, and each opening a panel docked in place of the page with a back arrow to the profile (`/profile?open=points|service|study`, which `/points`, `/service` and `/study` redirect to; one open at a time, and the profile under it keeps what was typed).
  Points and Service hours read through `useMyProfileStats` in `@repo/hooks`, shared with the phone so the two can't disagree; a failed read is a dash, never a zero.
  A module the chapter has off draws no cell and sends no read.
  Service hours stays at zero, since its panel is where the first hours are logged; Study hours is drawn only once the member has a session, since a session starts on the phone and the web says nothing about where.
  This semester's Points, Service hours and Study hours gauges open the same panels.
  - **Points**: the balance for a period and the member's place this semester with **Standings** (the Directory's points standing), then their point history; what it holds is [`../../behavior/points.md` § Where points are read](../../behavior/points.md#where-points-are-read). Search (from 15 transactions), Filter (Period, Category, Amount) and Export are in the panel's header.
  - **Service hours**: approved This semester and All time and Pending with its entry count, then Your log, every one of the viewer's entries in every state, newest first, with its status and points badges, any reviewer note, and Withdraw on a pending row; **Log hours** is the header's action.
    It is always the viewer's alone: an approver's chapter-wide read is filtered to them, which is also what keeps Withdraw (whose `DELETE` an approver may aim at anyone's entry) off other members' rows.
  - **Study hours**: the hours the member's sessions add up to, then each session by zone, day, length and how it ended; read only.
- **More details** follows the Directory profile form (#581, `components/profile/own-custom-fields-section.tsx`): the chapter's custom fields, every tier, each with a line of who else sees it, and its own Save details button, which sends only what changed.
  A `select` is a `Select` with Not set first (gone once a required field has a value), a `boolean` a `Switch` at the row's end, a `phone` a phone field formatted on leaving it, the rest text fields; a refused value says why under its field on Save.
  Nothing draws for a chapter with no fields or a viewer without `members:view`. The phone draws the same fields, words and order under Details ([`../mobile/screens.md`](../mobile/screens.md) s15); the rules are [`members.md` § Custom Fields](../../behavior/members.md#custom-fields).

### Council and school links

Built for [#5974](https://github.com/frapplive/Frapp/issues/5974) (`school-layer.md` § 2.4, `council-types.md` § What each council's space shows).
Two pages, one per side of a link. The phone draws the council's side as a section of the council home, in the same words (`COUNCIL_CHAPTERS_COPY` in `@repo/validation`); the chapter's side is web only for now (`CHAPTER_AFFILIATIONS_COPY`), and a chapter officer on the phone can't yet confirm a school or answer a council.

- **Chapters (`/chapters`, a council's sidebar row).**
  `apps/web/components/affiliations/council-chapters-page.tsx`.
  Waiting on you (a chapter's request: Accept, Decline), Member chapters (accepted, and suspended with a Suspended badge; the row's menu holds Suspend or Reinstate, then Remove from council, each destructive step confirmed), and Invited (the council's own invitations: Cancel invite).
  Invite a chapter is the header's main action, a searchable list of the chapters at the council's school, suggested ones (`COUNCIL_LINK_OFFERS`) first.
  A chapter shows by its public listing only (name, kind, school): a council never reads a chapter's data (#4068 decision 11).
  A delegate (`members:view` without `council:chapters_manage`) sees Member chapters alone, read-only.
  A chapter that opens the route is sent to chat (`COUNCIL_ONLY_ROUTES`, `council-route-gate.tsx`).
- **School and council (`/affiliations`, the member's menu).**
  `apps/web/components/affiliations/school-and-council-page.tsx`, reached from the member's menu at the sidebar's foot, under Chapter settings, by a chapter's holders of `chapter-config:view`.
  School: none offers a school search, whose pick links and confirms it; a proposed school offers Confirm and Not our school; a confirmed one has Unlink school in its menu, whose confirm says it also ends the chapter's council memberships there.
  Councils, once a school is confirmed: each council at it with its status (`councilLinkLabel`) and the step for its state (Ask to join, Cancel request, Accept or Decline an invitation, and Leave council in the row's menu).
  Its school and council rows lead with the name and the line under it, with no tile: the row has no real mark to draw, and a school's logo is its trademark. _(Paul, 2026-11-25, #6066: the school row's initials tile, "RP" for Rensselaer, is gone.)_ The council's Chapters page still leads each chapter with initials from its name, not its own mark ([#6071](https://github.com/frapplive/Frapp/issues/6071)).
  Without `chapter-config:manage` the page is read-only.
  It is its own page, not a Settings tab, for now; folding it into Chapter settings waits on that screen's open PR.
- Comparable apps: Slack Connect's invitations between workspaces (either side accepts or declines; a pending invite can be cancelled), GitHub's organization membership requests, and Discord's server settings for partnered servers.

### Two doors: Chapter settings and your Settings

Decided by Paul, 2026-11-10 ([#3856](https://github.com/pdcarlson/Frapp/issues/3856), asked for by Winston and Shawn; epic [#4068](https://github.com/pdcarlson/Frapp/issues/4068) decision 1).
The web app has two settings places and their names say whose each is, the split Discord draws between User Settings and Server Settings and Slack between Preferences and workspace settings:

- **Chapter settings** is the member menu's item (`/settings`; a nav row until 2026-11-19, the chapter menu's item until #5946): officer setup and officer tools, shown to whoever it holds something for.
- **Settings** is the member's own page (`/preferences`, [`components/personal-settings/`](../../../apps/web/components/personal-settings/personal-settings-page.tsx)), opened from the member's menu at the sidebar's foot and shown to every member.
  It took every settings block off `/profile`, which keeps the profile itself.

The personal page has a rail of links, one address per section (`?section=`, the bare path being Notifications), in two groups by what a setting is stored against.
Since [#6032](https://github.com/pdcarlson/Frapp/issues/6032) (2026-11-25, epic [#5964](https://github.com/pdcarlson/Frapp/issues/5964)) the rail is the phone Settings screen's first page, page for page, in the same order and words (`PERSONAL_SETTINGS_PAGES` in `@repo/validation`), and each page is groups of Settings rows ([`components.md` § Settings rows](../design-system/components.md#settings-rows)).
It opens full width like Chapter settings (`isFullWidthToolRoute`; Paul's pick of 2026-11-25), so the rail stands as a column rather than wrapping into lines beside chat.

| Group             | Section            | `?section=` | Holds                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------- | ------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| My account        | Notifications      | _(none)_    | Quiet hours (`user_settings`): the switch, then From and To as `TimeField`s while it is on, with Save quiet hours until [#6033](https://github.com/pdcarlson/Frapp/issues/6033). Then a group headed with the chapter's name: Chat messages (All messages / Mentions and DMs only, a row whose value opens the picker; [#4124](https://github.com/pdcarlson/Frapp/issues/4124)) and the active chapter's notification categories, each with its one line. `?section=alerts` opens it |
| My account        | Chat               | `chat`      | Density (the three preview cards, kept on the browser), then Direct messages: the Read receipts switch, an account setting (#5519; [`chat/README.md` § Shown to the sender](../../behavior/chat/README.md#shown-to-the-sender)). No theme choice: the product is dark-only ([#3330](https://github.com/pdcarlson/Frapp/issues/3330)). `?section=appearance` opens it                                    |
| My account        | Linked apps        | `apps`      | The active chapter's links, each marked with a green check when connected, greyed when not and red once expired (#5407): Google Calendar, Calendar apps (the subscription link: Copy link, made only on that tap, and the Apple, Outlook and Reset menu) and Discord. `?section=discord` and `?section=calendar` open it. The API's Discord link handshake and Google's sign-in return here               |
| My account        | Frapp Intelligence | `ai`        | The Frapp Intelligence switch: on opens Meet Frapp Intelligence, off turns it off ([`ai.md` § Consent](../../behavior/ai.md#consent); #4790). For `chapter-config:view`, the Chapter AI row (how many of the chapter's AI features are on), which opens Chapter settings' AI page (the phone's opens its AI screen). Listed only while the server has AI; the rail waits for that answer                                                  |
| My account        | Account            | `account`   | Sign in (email, Google, Apple, read from Supabase Auth: Link on a missing Google or Apple, ⋯ → Unlink…, confirmed, on a linked one while another way in is left, #2223; Link returns through `/auth/callback?intent=link` and is disabled in the desktop app), then Session: Sign out and Delete account (Replay the tour went with the tour, #5627)                                                                                                                                                                                                                                                         |
| In _chapter name_ | Blocked members    | `blocked`   | The active chapter's block list                                                                                                                                                                                                                                                                                                                                                                        |

"My account" follows the person into every chapter; "In _chapter name_" changes with the chapter switcher.
The decision listed blocked members under the account; they sit in the chapter group because `GET /v1/chat/blocks` is the active chapter's list.
Only the open section mounts, and each carries its own offline, loading and error states, so the page has no page-scale ladder.
My invoices sits in the chapter group since billing moved into Chapter settings ([#3827](https://github.com/pdcarlson/Frapp/issues/3827)): the member's own invoices with Pay on each open one, hidden while dues is beta-off.
Pay opens the pay dialog. After a card or bank payment is submitted it re-reads the invoice ([`billing.md`](../../behavior/billing.md) § Member payment flow): `Payment complete. This invoice is now marked paid.` once the server says PAID; `Payment received. Your chapter's records update as soon as the confirmation lands, usually within a minute.` while it hasn't, re-reading every 10s while the dialog stays open; and `Your payment didn't go through: <Stripe's reason>. You can try again.` (or without the reason) once the server records a failure newer than that submit (#3460), with `Try again`, which starts a new attempt rather than reusing the last one.

### Billing

`4d` and `4b` draw this page, so its grammar is taken rather than derived.
What needs stating is where the board describes a product this codebase does not have.

- **The settings-row shape** ([#6031](https://github.com/frapplive/Frapp/issues/6031), Paul's pick on its concept page, 2026-11-25; GitHub's, Linear's and Slack's billing pages): the page has its own title, "Plan and billing", as every Chapter settings page does.
  The plan is one row in a group's frame: its name and status chip, the meta line under them, and its one action at the row's end, sized to its label.
  Under it, a group of rows: the plan table's ("What your plan includes", or "What the subscription unlocks" off a paid plan, with how many modules it lists) and, while dues is on, Member invoices with how many are open.
  Each opens a page of its own with a way back (`?tab=billing&page=plan|invoices`), so the table no longer fills the page a president opens a few times a year.
  Cancel or close stays last. The plan's, the table's and Cancel or close's words are unchanged; the table names modules as the app does (Study zones, Logs, Chapter settings, Paul's pick), the plan's meta line lost its Invoices link to the Member invoices row, and the rows' labels and counts are new.
  The phone has no billing page: subscriptions are not offered, linked or mentioned in the app ([`../../behavior/onboarding.md`](../../behavior/onboarding.md)).

- **Omit, never placeholder.**
  `4d` draws a price, a seat count, a renewal date, a card's brand and last four, and a next charge.
  None has a source (no endpoint returns them, and `IBillingProvider` reads no subscription back from Stripe), so none renders: a row reading "Next charge" with no value claims there is one.
  Wiring them is a behavior issue.
  The plan panel's heading is derived from `subscription_status`, never written: `active` and `past_due` hold the subscription ("Pro"), `incomplete` and `canceled` hold none ("No subscription"), and an unresolved status names the section and asserts no plan.
- **Sell nothing that cannot be bought.**
  There is one tier, so there is no "Upgrade to Pro".
  The panel's primary action is the recovery for the status the chapter is in ([#929](https://github.com/pdcarlson/Frapp/issues/929)): `past_due` opens the Customer Portal, `incomplete` and `canceled` start checkout, and `active` offers the Portal as a secondary.
- **The plan matrix's rows are modules a member can reach**, not `tier === "paid"`.
  The catalog is the master plan's, and it lists paid modules with no route at all.
  The filter is the `module` keys in `nav-config.ts`, plus `dues` (its surface is this page's invoice list; no row while it is [beta-off](../../product/modules.md#beta-off-modules)) and never `billing` (`BillingController` is subscription-exempt).
  `plan-matrix.spec.tsx` pins it against the catalog and the nav.
  Each verdict cell names its own column in visually hidden text, and the "not included" dash is `--muted-foreground`, because it is informational content, not a disabled control.
- **One invoice list.**
  `GET /v1/invoices` returns the whole chapter to a `billing:view` holder and only the caller's own rows to everyone else, so the two lists the route once stacked were always the same data.
  The officer controls are gated on `billing:manage`, and so is the `useMembers` read that serves them (`enabled` on the same check), which would otherwise be a guaranteed 403 for every member.
- **The PRO chip states an entitlement, so it takes the accent** ([`pro-chip.tsx`](../../../apps/web/components/billing/pro-chip.tsx), `4b`'s geometry).
  Never `--gold-ask-*`: the board's chip reads as fixed gold only because its tenant is the house tenant, and taking the Ask family would freeze it gold on every chapter.
  It goes only on a control gated by entitlement.
  A write blocked because the chapter is `past_due` or `canceled` is disabled without a chip, and `SubscriptionNotice` says why, because "not in your plan" is the wrong one of `4b`'s two kinds of locked.
- **A lapsed chapter gets one line, at the top of this page and nowhere else** (`4d` note 4), keyed on `subscriptionStatusKind(status) === "destructive"`, so `canceled` as well as `past_due`.
  `incomplete` gets none, and an unresolved status gets nothing.
- **"Ask an officer" is the `deniedFallback` only.**
  `fallback` stays `null`, so an officer is not told to ask an officer while their own permissions load, and `offlineFallback` stays the gate's control-slot state.
  An `active` chapter passes no copy at all.
- **Stripe is blocking and nothing is optimistic.**
  Both actions await the mutation, disable their own button and hand off with `window.location.assign`.
  Neither moves the status chip, which reports the chapter record and nothing else; the bounded poll after checkout ([Surviving data contracts](#surviving-data-contracts)) exists to keep it that way.

### Settings

- **One page, a left rail** (`4d`): 200px, rows at the sidebar's Row step (28 on a mouse since #6115; the board drew 34) at radius 10, a filled accent chip for the active tab, grouped Chapter, People and Modules.
  _Changed in #3827, 2026-11-11:_ Danger zone is no longer a row; its content is the last section of Plan and billing.
  The tabs are `SETTINGS_TABS` in `settings-rail.tsx`, and who sees which is owned by [`../../behavior/settings/README.md`](../../behavior/settings/README.md#who-sees-what); neither is restated here.
  The board's rail is a simplified chapter's, not an inventory: this product's live tabs it does not draw are kept.
  Two board tabs are **not built**: Join code (`apps/web` has no join-code surface; invites are single-use tokens), and Subscription as `4d` draws it.
  _Changed in #3827, 2026-11-11:_ the subscription is the Plan and billing row now, shown to `billing:view`; a member pays their own invoices from My invoices in personal Settings, so `4d`'s "Members never see this page" holds.
- **Roles and groups is the chapter's tiers, in order, each with its roles** (#3990, 2026-11-12; the `4e` matrix it replaced is deleted, which made #2173 and #2836 moot; in the settings shape since #6029, 2026-11-25).
  Every page is addressed by the URL so Back and a shared link work, and each page opened from a row draws `SettingsSubpage`'s back line to Roles and groups ([`settings-roles-tab.tsx`](../../../apps/web/components/settings/settings-roles-tab.tsx)):
  `?tab=roles` is one `SettingsGroup` per tier, highest first (its Permissions row, its roles with member counts and a ⋯, Add role), Add tier, the roles outside the tiers, Non-chapter business, Groups and Invites and presidency ([`roles-overview.tsx`](../../../apps/web/components/roles/roles-overview.tsx), [`groups-section.tsx`](../../../apps/web/components/roles/groups-section.tsx));
  `&tier=<id>` is a tier's name, ⋯ (Move up, Move down, Delete), @mention switch, roles, then one switch per permission grouped by module, saved on click ([`tier-permissions-page.tsx`](../../../apps/web/components/roles/tier-permissions-page.tsx));
  `&role=<id>` is one role's name, its Role group and Save role, then its permissions ([`role-page.tsx`](../../../apps/web/components/roles/role-page.tsx));
  `&group=<id>` is one group's page and `&groups=automatic` the groups kept from member details.
  A role in a tier lists each permission once, with what the role ends up with as a value that opens Same as the tier, On and Off, each pick saved as one key of `permission_overrides` ([`role-override-list.tsx`](../../../apps/web/components/roles/role-override-list.tsx)); until #6029 it drew the tier's answer in a read-only column beside a three-way segmented switch on every row;
  a role outside the tiers keeps one column of live switches.
  Rows read in the registry's words ([`permission-registry.ts`](../../../packages/validation/src/permission-registry.ts)), never the raw string, and the wildcard is never a switch.
  The word "tier" is the chapter's own (`tier` vocabulary, set in Chapter settings → Vocabulary).
  Controls the rank rules ([`../../behavior/rbac.md`](../../behavior/rbac.md), #4071) would refuse are disabled with the reason, from [`role-tiers.ts`](../../../packages/hooks/src/role-tiers.ts) in `@repo/hooks`, which the phone shares (#4074); the API stays the authority.
  **View as a role** (#4072, after Discord's View Server As Role): a `roles:manage` holder opens it from any role's page but the President's, and the dashboard then reads that role's permissions in place of their own (a member holding only that role, with Member beside it when a join would add it), under a bar naming the role whose Exit returns to the role's page ([`role-preview-banner.tsx`](../../../apps/web/components/roles/role-preview-banner.tsx)).
  It is for looking: the API still answers as the officer, so pages show the officer's data, and the web client refuses every write but the read markers until the preview ends ([`role-preview-store.ts`](../../../apps/web/lib/stores/role-preview-store.ts)).
  Ask, Do and Catch me up are left off while it runs, since each starts with a request the preview would refuse (#4504).
  It lives in memory only, so a reload or another chapter ends it.
  The tab does not wait on the chapter-config read, which needs `chapter-config:view`; only the default-invite-role control degrades without it.
- **A module page's "Who can" answers in tiers** (#3990): each permission shows the tiers that have it, and a role only where it differs from its tier or sits outside the tiers.
  Custom roles are ordinary roles (#4075, [`../../behavior/rbac.md` § Custom roles folded into roles](../../behavior/rbac.md#custom-roles-folded-into-roles)).

### Errors and tab titles

- **404 and the root error page** are `1k`, through `CrestPage`.
  Transcribed, not lifted: the crest renders at full opacity, the panel at radius 20 rather than 24, and the buttons at `size="sm"` (28 to a mouse since #6115, 36 from 2026-11-05, 44 to a finger) rather than 40.
- **`app/error.tsx` reports to Sentry.**
  Before it existed every render error below the root layout reached `global-error`, which reports; catching them here without `captureException` would make the product look better and report less.
- **The recovery prop is `retry`, not `reset`.**
  Next 16 has both, so `reset` from memory type-checks and ships a Retry that replays the same failed render against the same cache.
  `global-error.tsx` still takes `reset` ([#2219](https://github.com/pdcarlson/Frapp/issues/2219)).
- **One title template.**
  The root layout's `title.template` is `"%s · Frapp"` and its default `"Frapp"`, so no route spells the product name.
  A `"use client"` page cannot export `metadata`, so it gets a `layout.tsx` whose only job is the title (none does since `/points` became a redirect, #5950).
  `scripts/ci/__tests__/frapp-naming.test.mjs` pins the template, the default, and that no route title says the retired name.

### Get the app (phones)

On an iPhone or an Android phone (`phonePlatform` in `@repo/validation`), every dashboard page shows a strip between the top bar and `<main>` that points at the app ([`get-the-app-card.tsx`](../../../apps/web/components/layout/get-the-app-card.tsx), #4002): **Get the app** (the environment's install link, [`lib/app-install.ts`](../../../apps/web/lib/app-install.ts): the TestFlight or Play tester link during the beta, the store listing when none is set, hidden for Frapp Staging until its link is set) and **Open the app** (`frapp://` on iOS;
Chrome's `intent:` on Android, which opens Play when the app is missing), and a close button.
Closing it hides it for good in that browser (`localStorage`, [`lib/get-the-app.ts`](../../../apps/web/lib/get-the-app.ts)); with storage blocked it stays hidden until the page reloads.
It never shows in the app's own in-app browser: the app marks the dashboard pages it opens with `?from=app` (the setup list's web-only steps), and the card stays away for that tab's session.
During the beta the store listings open for testers only, so the card still says that if the store shows Frapp as unavailable, keep using it here; with an install link set, Get the app goes to TestFlight's or Play's tester page instead (2026-11-19).
Until closed it takes about 120px of a phone's height above chat or the page.
It is per browser, not per account, because it is about this phone.
Tablets and desktops never see it.
It is drawn in the ops nudge's Accent recipe ([`ops-setup-nudge.tsx`](../../../apps/web/components/chat/ops-setup-nudge.tsx)), a standing suggestion rather than an alert, the way Slack's and Discord's mobile web suggest their apps without blocking the page.
Chapter setup isn't pushed to the app: the card suggests and the dashboard keeps working.
Its strings: [`writing.md` § Get the app (dashboard, phones)](../design-system/writing.md#get-the-app-dashboard-phones).

### Shell chrome

Owner decision, 2026-11-05: the chrome rule in [`components.md` § Chrome weight](../design-system/components.md#chrome-weight).
These are the places it departs from the board, recorded here so they read as decisions rather than drift.

- **The notification list departs from `1g`.**
  The board draws a gold count badge in the header, a worded "Mark all read", unread rows on the card step and red or gold dots.
  The list draws a bare "Notifications" title, a worded "Mark all read" at the header's end while anything is unread (an icon button until 2026-11-09, #3929;
  one request, `POST /v1/notifications/read`), and a flat list divided by hairlines with a `--foreground` dot and a bolder title for unread, grouped Today / Earlier since #4346.
  Each row (#4346, Shawn 2026-11-11) leads with who it is about and a kind badge, or a kind tile, with the person's name in their role colour and @-names as chat's mention chip; a mention of you is the @ badge in the mention chip's fixed gold, not a tinted row.
  Mobile s14 draws the same row from the same module (`@repo/hooks/notification-rows`).
  Since 2026-11-13 ([#3948](https://github.com/pdcarlson/Frapp/issues/3948)) the header also carries All / Unread: since 2026-11-24 ([#5947](https://github.com/frapplive/Frapp/issues/5947)) as plain words beside the title after a hairline ([`components.md` § View labels](../design-system/components.md#view-labels-change-a-pages-or-a-lists-view)), with Mark all read at the row's end and the words staying put when it goes; and a conversation's rows are one row with how many messages it stands for under the preview ([`notifications.md` § The in-app list](../../behavior/notifications.md#the-in-app-list)).
  Each row carries a Clear × (#3948): to a mouse it shows over the time on hover or focus, as Gmail's row actions do; to a finger it is always there, centred in a right gutter the row keeps for it.
  There is no count badge, no description and no header Refresh; the realtime ping refetches, and a failed load carries its own Try again ([`notifications-popover.tsx`](../../../apps/web/components/layout/notifications-popover.tsx)).
  Since 2026-11-12 ([#4593](https://github.com/pdcarlson/Frapp/issues/4593)) the list is a dropdown under the bell (in the sidebar's head, at the rail's foot, or in the top bar below `lg`), 400px wide and up to 560px tall before it scrolls, as Discord's inbox and Facebook's and LinkedIn's bells are, not a sheet sliding over the page;
  it closes on a row, Escape, the bell or a click outside, and Escape hands focus back to the bell.
- **Ask's "not yet" is a popover**, not the dialog it was.
  A modal that dims the dashboard to say a feature isn't ready is heavier than the news.
- **The event panel's actions are icons in its title row**, beside the close: Edit and Delete, each with its name as a tooltip.
  They were full-width worded buttons at the top of the body.
  Add to calendar was a third until the `.ics` export was withdrawn (#3708).
- **No decorative glyph before a dialog or sheet title.**
  The create task, new event, adjust points, log service hours, invite and member sheets each drew one before the title, repeating the button just pressed.
- **The sidebar's New row is the one row drawn in the accent at rest** (#5946, Paul, 2026-11-24).
  It wears the shared New button's outlined accent ([`new-button.tsx`](../../../apps/web/components/ui/new-button.tsx)), so "New" looks the same in the sidebar as on every page; every other row is neutral until it is the open page's ([`components.md` § Sidebar item](../design-system/components.md#sidebar-item)).
  The More row is a grid glyph, not `⋯`, which is the app's action menu.
  Nothing sits over the channel list: no heading, switcher or button (Paul, 2026-11-24: no switcher over a list); its filters open from a control on its first category heading.

## Addresses

Every screen the shell opens on web has an address, so Back, Forward, a reload and a shared link each land on it, and the phone opens the same screen from the same link (epic [#6034](https://github.com/frapplive/Frapp/issues/6034); scheme approved by Paul, 2026-11-25, on [its decision comment](https://github.com/frapplive/Frapp/issues/6034#issuecomment-7149459567)).
Comparables: Slack web and Discord web keep the open channel and thread in the address, and Linear and Notion give an opened record its own link.

- **The path is the page whose sidebar row is lit** (`/events`, `/documents`, `/settings`, `/meetings/<id>`), unchanged.
- **The query is anything that draws its own back arrow or X in place of the page**: a folder, a record, an editor, a Settings page, a named view.
  Query parameters, not deeper paths. Back does exactly what that arrow does.
- **The conversation** is in the address only where it is the page: `/chat?channel=<id>&thread=<id>` and `/messages?channel=<id>&thread=<id>`.
  Beside any other page it is remembered, not addressed, so Back keeps moving through that page (#5575).
- **Never in the address:** typing, filter chips, menus, popovers, centred dialogs, Find, the bell, What's new, the image viewer.
  The table's named exceptions stand: Documents' Minutes view (`type=minutes`, a filter value that is where `/meetings` lands) and its Who can see dialog (`access=`).

### History rules

- **Push:** a page; a named view; a folder, record or editor, or anything docked with a back arrow; a conversation or thread on `/chat` and `/messages`, and a search jump there.
- **Replace:** moving through days and months, and changing the sort.
- **Closing.** A back arrow, X or Escape on something opened in this tab goes Back, so Forward reopens it.
  On something that arrived from a link, a notification or a reload, it replaces the address with its parent.
- **One-shot marks erase themselves** with a replace once acted on: `?new=1`, `&message=` once the jump lands, `&excuse=1`, `?setting=`.
- **A dead or forbidden id** opens the page with a short inline note in place of the record, and its parameter is replaced away.

The web reads and moves these through one hook, [`use-address-params.ts`](../../../apps/web/lib/address/use-address-params.ts) over [`address.ts`](../../../apps/web/lib/address/address.ts): open pushes, close goes Back or replaces, replace mode is for days and sorts, `consumeAddressParam` takes a one-shot mark off, and `useDeadAddressParam` drops a dead id and keeps its note.
The parameter names live in [`@repo/validation` `web-addresses.ts`](../../../packages/validation/src/web-addresses.ts): the web's own names (`EVENT_PARAM`, `TASKS_TASK_PARAM` and the rest) are read from it, and the phone reads it ([#6050](https://github.com/frapplive/Frapp/issues/6050); [`../mobile/navigation.md` § Deep links](../mobile/navigation.md#deep-links)).

### The table

Rows marked "planned" are built by the sub-issue named; until it merges the page keeps the behaviour it has today.
[`every-page-has-an-address.spec.ts`](../../../apps/web/components/layout/every-page-has-an-address.spec.ts) fails for a dashboard route missing from `web-addresses.ts`, and for a row of it, or a parameter in its Address cell, missing here.
It can't see a parameter a page reads without listing it there, so each family's PR adds its own.

| Address | History | Phone screen |
|---|---|---|
| `/chat?channel=&thread=&message=` | A pick, a DM, All threads or a thread opened pushes, so Back walks them and a reload or a copied address reopens the same conversation and thread. A thread's X, back arrow or Escape goes Back when this tab opened it and otherwise replaces. A bare `/chat` (the nav's row, a fallback after a delete or a hide) has its landing conversation written in place. A search or bookmark jump into another conversation pushes `channel=` with `message=`, which is replaced away once the jump lands or is found unreachable; one in the open conversation moves nothing. A conversation of the other kind moves the path: a pick pushes, a link that named the wrong kind replaces. Below `lg`, a pick from the list moves the list's own Back step to the picked conversation, so Back returns to the list. Built in #6041 | `/chat-thread` (`channelId`, `threadRootId`, `focusMessageId`); bare: Chat home |
| `/messages?channel=&thread=&message=` | As on `/chat` (a group conversation's threads too). A channel picked on Messages pushes `/chat?channel=`. With no conversation open (the open one just hidden), the address names none. Built in #6041 | `/chat-thread` (`channelId`); bare: Messages |
| `/documents?folder=&document=&access=&type=` | `folder=` is the folder's name (`+`, a space, for No folder: folder names are trimmed, so none is a space), and each one opened pushes, so Back walks them as Finder and Google Drive do. `document=` is the viewer: opening pushes, its previous and next replace, so Back closes it rather than stepping back through files. `access=` is Who can see, opened only for a file the member may set (the same check as the row's control); any other is unavailable. `type=minutes` is the Minutes view, pushed when Minutes is picked. A folder or file the member can't see shows a short note and is replaced away. Built in #6042; the docked upload and folder-import panels are not addressed yet (#6157) | Documents |
| `/events?day=&event=&edit=&hours=&excuse=` | `day=YYYY-MM-DD` is the picked day, replaced as days are picked so Back doesn't walk them; today has none. A day from a link or a reload moves the month and the week strip to it; paging months is not in the address. `event=` is the open event, pushed; its back arrow and Escape close by the rule, and another meeting of its series replaces it. `edit=1` is its editor, pushed; leaving it goes back to the event. `hours=YYYY-MM-DD` is the hour grid, pushed; moving its day replaces, and its one-day view is not in the address. `edit=1` opens only for someone who may edit the event; anyone else's is taken out. `new=1` stays one-shot until #6157 decides create forms. `excuse=1` (a chat card's Can't make it) is one-shot. An event that is gone or not the member's to see is said and replaced away. Built in #6043 | `/event-details` (`id`, `excuse`), `/calendar-day` (`day`), Events |
| `/activity?view=&task=&group=&posting=&item=&review=&extension=` | `view=everyone` (Everyone's tasks) and `view=archive` push; Mine is the bare address. `task=`, `group=` and `posting=` open the task panel with a push (a copy's task link is replaced with its group's), and `item=<row key>` is the open row, pushed; the next review in a review replaces it. A notification's `review=` or `extension=` becomes the row's `item=` in place once its row is found. A task or row that is gone or not the member's to see is said and replaced away. Tasks folded in with #5948, and `/tasks` redirects here keeping `task=` and `group=`. Built in #6044 | `/tasks` (`task`), `/activity` (`review`) |
| `/members?tab=&member=&sort=` | `tab=alumni` pushes (was replace); Members is the bare address. `member=<user id>` is the member open in place of the list (and on Alumni), pushed by View profile; its back arrow closes by the rule. A row's card is a popout, not a place. `sort=` replaces. Invite's `new=1` stays one-shot until #6157. A `member=` the roster lacks is read again once, then an alumnus moves to `tab=alumni` in place, and anyone else (left, or hidden from the viewer) is said and replaced away; the same holds on Alumni. Message from the profile replaces `member=` before leaving for chat, so no Back races it. Chat's View profile opens the member sheet over the conversation, which, like the popout, has no address. Built in #6046 | `/member` (`userId`), `/directory` (`sort`) |
| `/rush?view=&prospect=` | `view=follow-up` or `view=all` is the view the member picked, pushed; with no `view=` the page opens as it always has (Follow up when it holds anything). `prospect=<id>` is the prospect open in place of the board, pushed; opening another while one is open replaces it, so Back closes the panel; its back arrow closes by the rule. Summary, the layout and search are not in the address. A linked prospect the read lacks is read again once, then one removed or not the role's to see is said and replaced away. Built in #6047 | `/rush-prospect` (`candidateId`), Recruitment |
| `/profile?open=` | Opening a door (Points, Service, Study) pushes; closing follows the rule, so Back goes to the profile and Forward reopens the panel. Built in #6048 | You |
| `/preferences?section=` | Each rail row is a link, so it pushes. `setting=` (settings search) is one-shot. Invoice pay and Meet Frapp AI are centred dialogs, not in the address. Built in #6048 | Preferences |
| `/settings?tab=&page=&channel=&tool=&tier=&role=&class=&field=&zone=&member=` | Rail rows push `tab=`; `channel=` adds Chat admin's picked channel; `class=` is a pledge class's page and `field=` a member field's (`field=new` adds one); `page=new` on Semester is the new-semester page (#6028); `member=` is the points ledger's member. Still full width, with chat hidden. Planned, #6049 | Web only |
| `/ask` | No change until conversations get ids (#4704) | Frapp Intelligence |
| `/whats-new` | Path only | What's new |
| `/meetings/<id>`, `/meetings/<id>/notes`, `/meetings/<id>/transcript` | Paths | Web only |
| `/backwork`, `/backwork/upload` | Paths | Web only |
| `/affiliations`, `/chapters` | Path only | Web only |

A route kept only to send old links on (`/tasks`, `/points`, `/billing`, `/chat-admin` and the rest) never draws, so it has no row; it keeps the parameters it forwards.

### The phone

`web-addresses.ts` maps each web address to its phone screen and the phone's parameter names.
The phone reads it in two places since [#6050](https://github.com/frapplive/Frapp/issues/6050): a link tapped inside a message, and the `+native-intent` handler for a link another app hands over ([`../mobile/navigation.md` § Deep links](../mobile/navigation.md#deep-links) owns how).
Two readers are still to come: the phone's notification targets ([#6191](https://github.com/frapplive/Frapp/issues/6191)) and Copy link on the phone's records ([#6186](https://github.com/frapplive/Frapp/issues/6186)).
The app doesn't claim these paths yet; when it does is Paul's call ([#6185](https://github.com/frapplive/Frapp/issues/6185)). Web-only pages are never claimed.

## Gating & routing semantics

- **Module gating is hide, not grey.**
  Each nav item carries a `module` field, and `<ProtectedNavItem>` **hides** an item whose module is disabled, never greys it.
  The shell reads module state with `useChapterModuleGate()` (`apps/web/lib/hooks/use-chapter-module-gate.ts`), from `enabled_modules` on `GET /v1/chapters/current`.
  That is the member view.
  It deliberately doesn't read `useOrgConfig()`: that endpoint needs `chapter-config:view`, so for every seeded role below President it errored and the gate failed open for good ([#1982](https://github.com/pdcarlson/Frapp/issues/1982)).
  While the read is in flight nothing is gated, so no row flashes out; once it has failed, module rows hide.
  A module toggle reaches it at once: `usePatchOrgConfig` writes the new `enabled_modules` into the cached current-chapter payload as well as the config cache, and re-reads both once the write settles.
  Permission gating and module gating coexist: an item shows only when the caller holds the permission _and_ the module is enabled.
  Disabling a module from Settings → Modules immediately removes its sidebar item, and strips its slash commands from the chat palette;
  turning Polls off also withdraws the Vote on chat poll cards, which read the same hook's `useChapterModuleGateState()` and hold the Vote, saying why, until the read answers ([#3012](https://github.com/pdcarlson/Frapp/issues/3012)).
  Data is preserved and re-enabling restores everything ([`spec/behavior/settings/README.md`](../../behavior/settings/README.md)).
- **Default route.**
  Chat is the post-sign-in landing surface (`/chat` is the shell with no tool page open, [§ Chat](#chat)): `/` redirects to `/chat` once a Supabase session is present (and to `/sign-in` without one, since 2026-11-05), `/dashboard` is a legacy alias that also redirects to `/chat`, and `app/(dashboard)/page.tsx` (the route-group index) redirects there as well so bookmarks and internal tooling always find a segment root.
  The standalone `/home` overview was removed in the chat-first rework; chapter health at a glance is meant to become the pulse card, an inline chat artifact that is designed but not built yet ([`spec/behavior/chat/catch-up.md`](../../behavior/chat/catch-up.md)).
  Users with zero permissions land on `/no-access`, which explains how to request a role without dumping them back to sign-in.
  The shell sends them there once `GET /v1/users/me/permissions` has answered with an empty set ([`no-access-redirect.tsx`](../../../apps/web/components/layout/no-access-redirect.tsx)), never while that read is loading or after it failed with nothing cached, and only when the active chapter is their only one: `/no-access` has no chapter switcher, so a member of another chapter stays in the shell, where they can switch.
  An account with no chapter at all gets the chapter wizard instead, unless an invite was emailed to it: then it is sent to `/join`, which offers that invite ([`onboarding.md`](../../behavior/onboarding.md), #5077).
  _Corrected 2026-11-06 ([#3236](https://github.com/pdcarlson/Frapp/issues/3236)):_ until then nothing routed anyone to `/no-access`, so a role-less member landed on `/chat`, where every read 403s because the chat endpoints require `members:view`.
- **Unauthenticated deep links keep their destination.**
  [`apps/web/proxy.ts`](../../../apps/web/proxy.ts) guards every protected prefix: with no Supabase session it redirects to `/sign-in?redirectTo=<pathname + search>`, and once a session exists the same proxy returns the caller there instead of the `/chat` default.
  The value must start with `/` or it falls back to `/chat` — the open-redirect guard, applied in the proxy and again in `resolveRedirectPath` ([`apps/web/lib/auth/redirect.ts`](../../../apps/web/lib/auth/redirect.ts)) — and it survives the sign-in ↔ sign-up hop.
  An emailed code (sign-in's Email me a code, sign-up's and an unconfirmed sign-in's Confirm your email, the invite card's Continue with email) is typed on the screen that asked for it, which then goes to `redirectTo` itself: every Auth email carries a 6-digit code and no link since #6134 (Paul, 2026-11-26; templates in [`supabase.md` § Auth email templates](../../../docs/ops/deployment/supabase.md#auth-email-templates-a-6-digit-code-no-link-6134)).
  **Google / Apple OAuth**, and the link production's emails keep beside the code until its switch, carry it as the `next` of `/auth/callback` ([`apps/web/app/auth/callback/route.ts`](../../../apps/web/app/auth/callback/route.ts)), a route outside the proxy's matcher. A Google or Apple sign-in started in the desktop app returns to `/auth/desktop` instead ([`apps/web/app/auth/desktop/route.ts`](../../../apps/web/app/auth/desktop/route.ts)), also outside the matcher, which hands the code and the same `next` back to the app ([architecture § 3.4a](../../architecture/README.md)).
  *The lines below on email links hold only for production's transition-era templates; #6136 deletes that handling once production is code-only.* The transition Magic Link template hrefs `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=magiclink` so the click stays on `app.{staging.}frapp.live` (or `frapp:///?` on mobile) instead of `*.supabase.co/auth/v1/verify` — Gmail treats a `frapp.live` From plus that Auth hostname as the default Supabase phishing shape.
  Web's `emailRedirectTo` already has `?next=`; mobile's ends with `?` so the `&` is valid.
  The callback calls `verifyOtp` with that hash; that path does not need the PKCE cookie, so the link works in a different browser than the one that requested it.
  An un-rewritten GoTrue `ConfirmationURL` still arrives as `?code=…` after the hosted verify hop; `@supabase/ssr` exchanges that code server-side against the cookie-held verifier.
  OAuth uses that same `?code=…` exchange.
  Either way the callback re-applies the open-redirect guard to `next` and redirects there signed in.
  A brand-new account goes straight on too: the `/new-account` stop that once named it (#3786, #3801) was replaced on 2026-11-15 by `/join`'s quiet `Already in a chapter?` line ([`writing.md` § Already in a chapter](../design-system/writing.md#already-in-a-chapter-pre-auth)).
  The sign-in screen's magic link still adds `intent=sign-in-link`, which keeps a Confirm-signup code that won't exchange reading as a confirmed address; its Google and Apple starts still add `intent=sign-in`, which nothing reads any more.
  Nothing is merged on sign-in. A signed-in member adds Google or Apple from Settings → Account instead ([#2223](https://github.com/frapplive/Frapp/issues/2223)): `linkIdentity` returns through the same callback with `intent=link`, and a refused or failed link goes back to `next` (Account) with `linkError` set to GoTrue's code, never to `/sign-in`, which would bounce a signed-in member straight back without saying why.
  Otherwise a failed link (expired, reused, bad hash) or a colliding OAuth identity lands on `/sign-in` with `redirectTo` intact and `authError` naming the reason, which the page shows once as a toast.
  A PKCE `code` that can't be exchanged (opened in another browser, or after a later email request in this one replaced the verifier) fails with `exchange_failed`, with one exception since 2026-11-09 ([#3831](https://github.com/pdcarlson/Frapp/issues/3831)): every email link web asks for carries an email-link intent — the sign-up confirmation and its Resend `intent=confirm`, the sign-in magic link `intent=sign-in-link` ([`isEmailLinkIntent`](../../../apps/web/lib/auth/redirect.ts)) — while OAuth carries `intent=sign-in`.
  GoTrue hands out a code only after verifying the link, which confirms the address, so a failed email-link code lands with `authError=email_confirmed` and the page says to sign in; an OAuth `sign-in` code that won't exchange stays `exchange_failed`.
  Production's Confirm signup template may still link `ConfirmationURL` until its switch to the code-only template (#6134), which makes [#1925](https://github.com/pdcarlson/Frapp/issues/1925)'s `token_hash` paste unnecessary.
- **Web runs no study session** (#5950): a session starts and runs on the phone, and the web lists the member's own sessions read-only ([§ Profile](#profile)).
  Full rules: [`spec/behavior/study-sessions.md`](../../behavior/study-sessions.md#surface-coverage).
  _(Changed in #5950 by pdcarlson, 2026-11-24: the `/study` page's timer paused through `POST /v1/study-sessions/pause` when the tab was hidden.)_
  Chapter settings' Study zones page configures each zone's shape (a circle or an outline drawn on a map), points rate, minimum session length, and pause grace.
- **Hidden from search while Frapp is in testing (2026-11-13, #4758).** robots.txt turns crawlers away from everything but `/.well-known/` (Vercel CPU cost, app links), and every page and response also says `noindex, nofollow` (root-layout `robots` metadata and an `X-Robots-Tag` header), driven by the same switch as the landing: [landing spec § Search engines](../landing/README.md).

## Responsive contract

Shell geometry as built.
Source of truth: [`apps/web/components/layout/dashboard-shell.tsx`](../../../apps/web/components/layout/dashboard-shell.tsx) against stock Tailwind v4 breakpoints (`sm` 640px, `md` 768px, `lg` 1024px — v4 states them in `rem`, at the same pixel values) — the shared preset ([`packages/theme/src/tailwind.config.ts`](../../../packages/theme/src/tailwind.config.ts)) extends colors, radii, and motion but never overrides `screens`.

| Viewport       | Primary navigation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Content column                                                                                                                                                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ≥1024px (`lg`) | The sidebar ([`sidebar.tsx`](../../../apps/web/components/layout/sidebar.tsx)), flush left, 264px expanded or a 56px rail, `--surface-1` with a right hairline: a 48px head level with the page and channel headers, the rows, the chapter's channel list in the height left, and the member at the foot ([§ Navigation map](#navigation-map)). No top bar. The open page's row is a toggle. The full sidebar fits beside both 375px floors from here up (264 + 375 + 375 + hairlines), so no rail is forced; from #3779 until #5575 it dropped to its rail from 1056 to 1239px, when chat's channels column sat beside the thread. The channel list keeps room for eight rows at 1024×768 with every row showing (§ Navigation map). Above the member's row, the expanded column may show the live-meeting card ([`meetings.md` § Writing minutes by hand](../../behavior/meetings.md#writing-minutes-by-hand), #5219) while an event its viewer created is on, and the list gives up that height for the hour. The rail is the rows as glyphs, a hairline, a Channels button that opens the list in a popover beside it, then the pill, the bell, the expand toggle and the avatar at its foot | The page and the open conversation side by side ([§ Chat](#chat)): the page, the divider, and the conversation docked at the member's width (375px unless dragged wider), each at least 375px. On `/chat` and `/messages` the conversation has the row |
| <1024px        | Sidebar hidden; the top bar's drawer trigger opens the same sidebar in a left slide-out Sheet (75% of viewport width, capped at 384px from 640px up) over a modal overlay, with a Channels row to `/chat` in place of the list. The drawer's head is the chapter alone: the pill and the bell are in the top bar                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Full width, one page at a time: `/chat` and `/messages` are chat with its own list pane, any other route its page                                                                                                                                      |

- **Two navigation states.**
  The navigation switches once, at `lg`.
  The 56px rail is a remembered desktop preference (a cookie, `nav-collapse.ts`), never forced since #5575 (before it, while chat and a tool were open side by side below 1240px), and there is no hover-expand sidebar.
  The page and the conversation split side by side at the same switch (`lg`; a tier of its own at 1056px from [#3779](https://github.com/pdcarlson/Frapp/issues/3779) until #5946), so the shell has two states: below `lg` a single page behind a drawer, from `lg` up the sidebar, the page and the conversation.
  [`shell-layout.ts`](../../../apps/web/components/layout/shell-layout.ts) asserts that the full sidebar and both 375px pane floors fit at that width (`SPLIT_MIN_WIDTH`), and the shell's classes use `lg`.
  The server cannot know the window width, so it draws chat beside a tool by CSS and the client drops it on a narrow window.
  _(Until #5575 the forced rail was drawn the same way, [#4024](https://github.com/pdcarlson/Frapp/issues/4024): both nav columns until hydration, the band's CSS showing one. With no rail forced, the shell draws one column.)_
- **No shell cap.**
  The sidebar sits flush against the viewport edge and content takes the remaining width; the former `max-w-[1400px]` wrapper is gone (`dashboard-shell.tsx`).
  The tool page pads `px-4` below 640px and `px-6` from 640px up ([§ The content row](#the-content-row)).
- **The drawer is the sidebar.**
  The drawer renders the same `Sidebar` (`variant="drawer"`), so every row and its permission and module gates reach the drawer automatically.
  Its rows are 44px, the touch minimum, and it holds a Channels row to `/chat` in place of the list, so the eight-row rule (§ Navigation map) doesn't bind it; a short phone's drawer gets no trimmed second list either (Paul, #2946).
  Navigation MUST NOT be duplicated into a separate mobile list; the trigger keeps its "Open navigation menu" accessible name and the drawer keeps its labelled title and description.
  The member's row is the drawer's foot, the same `AccountMenu` as the column's, so a change to its contents reaches both.
- **The top bar shrinks to fit** (below `lg`, where it is drawn).
  The find field is `min-w-0 flex-1` (capped at 520px from `sm`), so it gives up width before the fixed controls do;
  the breadcrumb block and per-route primary action that once crowded this row are gone from the bar (`top-bar.tsx`), and the page title that came back to it (§ Top bar) truncates in its own cell and hides below `sm`, where the left cell shrinks to the drawer trigger.
  The shrink only takes effect if the **content column** is also `min-w-0` — see the floor rule below.
- **A tool page lays out by its own width** ([#4022](https://github.com/pdcarlson/Frapp/issues/4022)).
  Beside chat a page is 375px or more wide (about 800px at chat's default width in a 1440px window beside the 264px sidebar, about 825px beside the 240px nav from #5575 until #5946, about 480px at the old 50/50 split) in a window wide enough for every viewport breakpoint, so a converted page's layout breakpoints are container queries, not `sm`/`md`/`lg`/`xl`: `@container` on the page root (Documents' list is its own container too, so its rows count the list's width beside the folder rail), then Tailwind's `@md` 448px, `@xl` 576px, `@2xl` 672px, `@3xl` 768px and `@4xl` 896px variants.
  A narrow page beside chat gets the page's phone shape: Events' toolbar on two rows and its rows stacked below 576px, Tasks' lanes one per row below 672px and two below 896px, Documents' folder rail as a Folder control in the list's toolbar below 672px, Backwork's table as stacked rows below 896px.
  Because the page loses 264px when the sidebar appears at `lg`, a window just past 1024px with chat closed can show a narrower shape than one just under it (Tasks' two lanes, Backwork's stacked rows);
  that is the page's real width, and Backwork's seven columns were cramped there before.
  Every tool page is converted ([#4033](https://github.com/pdcarlson/Frapp/issues/4033) did Reports, Roles, Members and Alumni, Billing, Chat admin, Discord import, Geofences, Service and Study) except Profile, which still follows the window.
  Chapter settings never sits beside chat: it takes the whole width and hides chat while it is open ([#4068](https://github.com/pdcarlson/Frapp/issues/4068) decision 3), so its rail and panel keep viewport breakpoints.
  Personal Settings joined it on Paul's pick of 2026-11-25 ([#6032](https://github.com/pdcarlson/Frapp/issues/6032)): beside chat its rail wrapped into lines of words.
  A field grid inside a card or pane that sits beside another (Roles' cards, Chat admin's edit pane) is its own container, so it counts the card's width rather than the page's.
  [`beside-chat-floor.spec.ts`](../../../apps/web/tests/visual/beside-chat-floor.spec.ts) opens every tool page but the two Settings pages (Chat admin and the Alumni tab included) at its 375px floor beside chat in a 1440px window;
  in CI it runs sessionless, so populated pages are measured only by its signed-in local mode.
  Viewport breakpoints stay for what follows the window: the top bar, the sidebar, dialogs and sheets.
  A shape CSS can't draw is measured instead ([`use-is-narrow.ts`](../../../apps/web/lib/use-is-narrow.ts)): below 600px the Events calendar is a month of days with a dot per event, and the picked day's events listed under it by name ([`writing.md` § Events (dashboard)](../design-system/writing.md#events-dashboard)).
- **375px is the floor.**
  Every dashboard route MUST render without horizontal scroll down to 375px.
  Every route in `DASHBOARD_ROUTES` ([`apps/web/tests/visual/routes.ts`](../../../apps/web/tests/visual/routes.ts) — the count lives there, not here) holds it, and [`apps/web/tests/visual/responsive-floor.spec.ts`](../../../apps/web/tests/visual/responsive-floor.spec.ts) measures it — a plain `scrollWidth <= 375` assertion per route, no baseline.
  The **pre-auth** routes are measured too, by a second spec ([`pre-auth-floor.spec.ts`](../../../apps/web/tests/visual/pre-auth-floor.spec.ts)) in the same required job, because they need the opposite redirect assertion: the dashboard suite asserts a route did _not_ land on `/sign-in`, which for `/sign-in` itself is backwards.
  Both specs take their routes from `routes.ts`, and the pre-auth spec adds one guard; `/join` is the gap, since its own session check redirects a sessionless harness away.
  Before #1142 nothing measured it at all, because the visual snapshot suite of the day pinned every shot to 1440×960 and could not see this class of defect.
  **It is meant to block.** #1152 split it out of the advisory `web-visual-regression` into its own `web-responsive-floor` job and listed that job in [`scripts/ci/lib/required-checks.mjs`](../../../scripts/ci/lib/required-checks.mjs);
  that snapshot job was advisory because baselines drift with Chromium, and the floor gate had inherited the exemption purely by sharing a directory with it despite storing no baseline and comparing no pixels.
  The snapshot job has since been deleted, so `test:floor` now runs the whole directory rather than a tagged slice of it.
  Whether the job is _live_ on a branch depends on when an admin last ran `npm run configure:branch-protection` — read live state per [`github-branch-protection-runbook.md`](../../../docs/ops/github-branch-protection-runbook.md#required-status-checks), not from this page.
  Either way, read a green board carefully: it does not on its own prove the floor held — see the coverage limits below.
- **Sign-in and sign-up fit a laptop window.**
  `/sign-in` and `/sign-up` MUST render without vertical scroll in a 1280×650 window, a 1366×768 or 1280×720 laptop after the browser's own chrome (Paul, 2026-11-05, after the split frame scrolled on his laptop).
  [`apps/web/tests/visual/pre-auth-fit.spec.ts`](../../../apps/web/tests/visual/pre-auth-fit.spec.ts) measures it in the same job as the floor.
  A field, hint or consent line added to either form spends from this budget.
- **What that gate does and does not cover.**
  It runs a sessionless harness — no active chapter — so on most dashboard routes `<main>` is a 160–256px empty-state card and the route's real content never mounts.
  The pre-auth routes are the inversion of that limit and the reason they are worth measuring: signed out is not a degraded mode for a sign-in screen, it is the only mode, so there the harness renders exactly what a visitor sees.
  It therefore pins the **shell** on every route — which is what actually broke — and the page content only where the route renders it without a chapter (`/points` did, until it became a redirect to Profile in #5950).
  A populated table that overflows at 375px while its empty state does not would still pass.
  Signed-in coverage is not solved; do not read a green run as "this screen is responsive".
- **The content column MUST stay `min-w-0`.**
  It is a flex item, so its automatic minimum size is its min-content width: without the override it will not shrink below the widest unbreakable thing on the route, the header never gets a reason to collapse, and the page scrolls sideways.
  This is not a micro-optimisation — a missing `min-w-0` here was six of the seven routes reported in #1142 (`/documents` 426px, `/reports` 408, `/settings` 408, `/study` 392, `/service` 390, `/geofences` 383).
  It presents as per-route content overflow, and was filed that way, because page content is what supplies the min-content number; the shell measured clean on its own.
  Read a floor failure as a shell question first.
- **In-page columns collapse on their own breakpoint.**
  Chat is flush columns (on `/messages` the list, then the thread, then from 1280px the member list, or an open message thread in its place; the channel list is the sidebar's) ([`apps/web/components/chat/chat-shell.tsx`](../../../apps/web/components/chat/chat-shell.tsx));
  its panes are **not cards** — the thread sits on `--background`, so the `--card` cards posted into it read as the step above it and a hovered message row lifts to `--surface-1` (the message bubbles this once framed are gone since the compact layout, #2873), and the Messages list pane, and the member list column from 1280px, take `--surface-1`, the ladder step the sidebar already uses (rationale: [`../design-system/components.md`](../design-system/components.md) §2);
  Settings is a wrapped horizontal tab row below 1024px and a 200px vertical rail at `lg` ([`apps/web/components/settings/settings-rail.tsx`](../../../apps/web/components/settings/settings-rail.tsx)).
  Both tiers count as impacted responsive behavior for those routes.

### The content row

Right of the sidebar (under the top bar below `lg`), `<main id="main-content">` is one row: the page, the divider, and the chat panel ([§ Chat](#chat); chat came first until #5575, and with no page open there was a home view until #5946).
It is the skip link's target, the confirm dialog's focus fallback, and what the 375px floor suite measures, so chat counts as content everywhere.
The **tool page** pads `px-4 py-4` (`px-6` from 640px) and owns its scroll; the **chat panel** is flush, with its own columns and scroll, and its composer pinned to the bottom of the viewport (`1b`).

_Replaced 2026-11-10 ([#3779](https://github.com/pdcarlson/Frapp/issues/3779)):_ chat used to be a route inside `<main>`, so `full-bleed-routes.ts` listed `/chat` as a route handed the frame without `<main>`'s padding and scroll, and the dashboard error boundary added its own gutter there.
Chat is a shell panel now, `/chat`'s page renders nothing, and the list, its helper and the boundary's gutter are deleted.

## Standing bans

Each held when last checked, by the numbered check in its row.
Only the shadow ban has a test behind it, so reintroducing any other is caught by the next reader rather than by CI: re-run the check rather than trust its result column.
The commands live in the block below the table, not in its cells, because a table cell has to escape `|` and the escaped form is not a runnable command.

| Ban                                                                             | Check                       | Last result                                                                                                                                                  |
| ------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| No `next-themes`, no theme switcher, no light palette: the surface is dark-only | 1                           | No match, 2026-10-01                                                                                                                                         |
| No live `dark:` variant                                                         | 2                           | No match, 2026-10-01                                                                                                                                         |
| No rendered shadow. Elevation is a lighter surface step                         | 3, and the token rule below | Comment text only (`components/ui/card.tsx`), 2026-10-01. [#2743](https://github.com/pdcarlson/Frapp/issues/2743) deleted the last two inert classes         |
| No legacy bone, bronze or Geist                                                 | 4                           | Comment text only, 2026-10-01                                                                                                                                |
| No unused component under `apps/web/components/ui`                              | 5                           | No `UNUSED` line, 2026-10-01. The check matches the import path string, so a component reached only through a re-export or a dynamic specifier reads as used |

```sh
# Run from the repo root. A check that holds prints nothing, except where the
# table above expects comment text.
# 1. Dark-only: no next-themes dependency, no light-scheme selector
grep -rn next-themes --include=package.json --exclude-dir=node_modules .
grep -rnE 'prefers-color-scheme|data-theme' packages/theme/src/signet.css apps/web/app/globals.css
# 2. No live dark: variant
grep -rnoE '(class|className)="[^"]*\bdark:[a-z-]+' apps/web/components apps/web/app --include=*.tsx
# 3. No shadow utility class, any size, plain, inset or drop
grep -rnoE '\b(inset-|drop-)?shadow-(2xs|xs|sm|md|lg|xl|2xl|inner)\b' apps/web --include=*.ts --include=*.tsx --exclude-dir=node_modules --exclude-dir=.next | grep -v '\.spec\.'
# 4. No legacy bone, bronze or Geist
grep -rniE '\bbone\b|\bbronze\b|Geist' apps/web/components apps/web/app --include=*.tsx --include=*.ts --include=*.css
# 5. Every components/ui file has an importer outside itself
for f in apps/web/components/ui/*.tsx; do
  n=$(basename "$f" .tsx); case "$n" in *.spec) continue;; esac
  grep -rlE "components/ui/$n[\"']" apps/web --include=*.ts --include=*.tsx | grep -qvx "$f" || echo "UNUSED: $n"
done
```

**The shadow ban is only partly a token rule.**
The shared preset ([`packages/theme/src/tailwind.config.ts`](../../../packages/theme/src/tailwind.config.ts)) binds `xs`, `sm`, `DEFAULT`, `md` and `lg` to `--shadow-*` tokens that are `none` in `signet.css`, and `signet.css.spec.ts`'s shadow roster fails if one is deleted, so those five are inert even as stray class text.
Everything else does not inherit `none`.
`shadow-2xs`, `shadow-xl`, `shadow-2xl` and every `inset-shadow-*` and `drop-shadow-*` fall through to Tailwind's stock tokens and compile a real shadow, which is how `shadow-md` once shipped past this ban.
Check 3 is the only guard for those today, and nothing in CI runs it; neutralizing them at the token layer is [#3058](https://github.com/pdcarlson/Frapp/issues/3058).

## Surviving data contracts

Per-screen truths that outlive the retired screen docs.
Where a fact is canonical in `spec/behavior/`, the pointer is the fact — do not restate it here.

- **Global query defaults.**
  One browser-wide `QueryClient` ([`apps/web/lib/providers/query-provider.tsx`](../../../apps/web/lib/providers/query-provider.tsx)), whose caches report final failures to Sentry ([`observability.md` § Error Tracking](../../behavior/observability.md#error-tracking)), defaults queries to `staleTime: 30_000`, `gcTime: 10 * 60_000`, `retry: retryQuery` (three more attempts, except after a definitive 4xx, the throttler's 429 included, and six for a busy server's 429;
  [`api-retry.md` § Reads](../resilience/api-retry.md#reads)), `retryDelay` from `readRetryDelayMs` (`min(1000 * 2 ** attempt, 30_000)`, longer and jittered for a busy server), `refetchOnWindowFocus: true`, `refetchOnReconnect: "always"`, and mutations to `retryMutation` (two more attempts, only for a failure that may be transient: a 5xx, no status, an intermediary's 408/499/460, or a busy server's 429;
  [`api-retry.md` § Writes](../resilience/api-retry.md#writes)) with the same backoff capped at 10s plus **`networkMode: "always"`, which is load-bearing**.
  TanStack's default `"online"` _pauses_ an offline mutation rather than rejecting it, so `await mutateAsync(...)` never settles: the success toast never fires, the `catch` holding the error toast is unreachable, the dialog never closes, and `isPending` latches `true`.
  `"offlineFirst"` does not fix it either — it clears `canStart` but not `canContinue`, so the first failure still pauses.
  `"always"` clears both, so the retries run to exhaustion and the promise rejects.
  Queueless writes are meant to fail offline, not queue ([`../resilience/connection-state.md`](../resilience/connection-state.md)); the pause was an accidental queue with no UI (#1707).
  One residual, unchanged by that fix and shared with every retried mutation: `canContinue` also requires `isFocused()`, so a tab hidden during a backoff pauses until it is refocused, then settles.
  Both retry policies are status-driven (the query policy since #3141; it sets no `networkMode`).
  The other systematic status-driven behavior is the unauthenticated redirect under [Gating & routing semantics](#gating--routing-semantics).
  The chat message cache opts out with `staleTime: Infinity` because realtime, not polling, keeps it fresh.
  That is also why chat resolves author and DM names from the cached chapter roster (`GET /v1/members/roster`) by `sender_id` instead of joining them onto the message; `spec/behavior/chat/README.md` owns that rule and the reasoning behind it.
- **Mutation optimism is opt-in, not the default.**
  The domain hooks in [`packages/hooks/src/`](../../../packages/hooks/src) are pessimistic — `mutationFn`, then `invalidateQueries` on success;
  the only `onMutate`/rollback paths that ship are the chat send ([`packages/chat-core/src/cache.ts`](../../../packages/chat-core/src/cache.ts)) and the chapter-config PATCH ([`packages/hooks/src/use-org-config.ts`](../../../packages/hooks/src/use-org-config.ts)), the one opted-in exception inside the package itself.
  Two writes must stay pessimistic whatever the default becomes: invoice status transitions (`useTransitionInvoiceStatus`) and service approve/reject (`useReviewServiceEntry`) are irreversible, so the UI waits for server confirmation rather than rendering a state it cannot roll back.
- **Billing pay affordance (client gate).**
  The Pay action renders only when the invoice is `OPEN`, its `user_id` is the signed-in member's, and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is configured (absent → the affordance does not render, so local dev, CI, and the build prerender are unaffected).
  The Stripe Elements dialog confirms against the `client_secret` from `POST /v1/invoices/:id/payment-intent` with `redirect: "if_required"` (3-D Secure stays in-page), then re-reads the invoice until the server reports PAID.
  List scoping, failure-code mapping, and the webhook-is-truth-for-PAID rule: [`spec/behavior/billing.md`](../../behavior/billing.md) §Member payment flow.
- **Billing plan panel (checkout entry point).**
  Plan and billing (`/settings?tab=billing`;
  the `/billing` route until #3827) renders the plan panel ([`plan-panel.tsx`](../../../apps/web/components/billing/plan-panel.tsx), board `4d`;
  it replaced the subscription checkout card in [#2172](https://github.com/pdcarlson/Frapp/pull/2172)) first, under only the page header and the lapse line, because when a chapter is locked its action is the only control on the screen that can succeed.
  It reads `subscription_status` from the chapter payload — the same query the subscription gate uses, never a second source — and renders no action while that is unresolved, so a slow or failed fetch never asserts a lock.
  Checkout is offered at `incomplete` and at `canceled`; only `past_due` routes to the Customer Portal, because only it still holds a live subscription a second checkout would duplicate ([`spec/behavior/billing.md`](../../behavior/billing.md) §Duplicate checkout).
  Stripe returns to `/settings?tab=billing&checkout=success|cancelled` (`/billing?checkout=…` before #3827;
  `/billing` forwards the param);
  because the webhook — not the redirect — activates the chapter, `success` polls for the flip on a bounded schedule (10 × 3s) and invalidates both the `["chapters"]` and `["billing"]` caches so the page cannot half-update.
  The panel reads `?checkout=` via `useSearchParams`, so it must stay under a `<Suspense>` boundary.
  A stale `?checkout=success` never suppresses the recovery control for a chapter that has since lapsed.
- **Slash palette fails closed.**
  The `cmdk` palette reads its catalog from `@repo/chat-core/integrations` filtered by the module gate from `useChapterModuleGateState()`, which reads the same member view as the nav, not `useOrgConfig()` ([#2957](https://github.com/pdcarlson/Frapp/issues/2957)).
  While that read is running it renders an explicit "Loading commands…" panel;
  while it can't run offline (paused, or retrying and failing while the dashboard is OFFLINE), an offline panel with Retry;
  on error, or with no active chapter, a "Modules unavailable" panel with Retry — never the unfiltered catalog.
  A paused or disabled read used to show "Loading commands…" indefinitely ([#3160](https://github.com/pdcarlson/Frapp/issues/3160)).
  Empty match → "No matching command."
  A module-backed command typed out in full and sent with Enter goes through the same gate (`slashModuleRefusal` in `composer.tsx`): it is refused with a toast while its module is off, still loading, unreachable offline, or failed to load, and the member's text stays in the composer ([#2993](https://github.com/pdcarlson/Frapp/issues/2993)).
- **Chat reconnect order (web client).**
  The client gates REST backfill (`GET /v1/channels/{id}/messages?since=<lastSeen>`) on the realtime subscription reaching `SUBSCRIBED` — subscribe first, then backfill — relying on the single idempotent per-channel merge keyed by `client_message_id` to dedupe overlap (`packages/chat-core`, wired through the web glue in `apps/web/lib/chat/`);
  that merge lands in one normalized cache per channel under query key `["chat", channelId, "messages"]`, shaped `{ byId, order, actionIndex }`.
  Message-delivery guarantees: [`spec/behavior/chat/README.md`](../../behavior/chat/README.md) and [`../resilience/`](../resilience/README.md).
- **The chat composer is never disabled offline.**
  It takes `isOffline`, which only refuses the queueless slash commands;
  the connection pill (the sidebar's head; the top bar below `lg`) carries the offline label and the queue's promise while a chat is open ([`connection-state.md` § One indicator](../resilience/connection-state.md#one-indicator);
  the composer drew its own line until 2026-11-06);
  `sendMessage` writes to the Dexie outbox before it touches the network, so gating it would defeat the queue.
  This is [`../resilience/connection-state.md`](../resilience/connection-state.md)'s rule, which web broke until the #920 chat slice — `submit()` returned early on the same flag, so Enter discarded the draft silently.
- **Chat unread and mention counts come from `GET /v1/channels/unread`**, read through `useChannelUnreadCounts()` in `@repo/hooks` and never re-derived client-side ([`spec/behavior/chat/README.md`](../../behavior/chat/README.md) § Read Receipts).
  The channel payload carries no counts; a `unread_count?` field on the web channel type claimed otherwise for a long time and nothing ever populated it, so the badge could not render.
  Plain unread is a bold name with no number, mention/DM the fixed red badge (2026-11-07, [foundations.md](../design-system/foundations.md) §5) — never the chapter accent.
- **Chat drafts & outbox (Dexie).**
  `drafts(userId, channelId, body, updatedAt)` restore on reload; `outbox(userId, chapterId, clientId, channelId, body, attempts, queuedAt, status)` flushes in order on reconnect — a 4xx moves the entry to `failed` (surfaced inline with Retry / Discard), network errors and 5xx stay queued.
  Every row is keyed on the member who wrote it (`userId` is the Supabase auth uid), so a shared browser cannot show one member's draft to another or flush one member's queue under another's token (#2226).
  These are **outbound**, and the inbound first-chunk read cache is a separate IndexedDB database governed by the opposite rule; both rows, why they differ on an identity change, and why only the outbox is chapter-scoped, are in [`../resilience/caching.md`](../resilience/caching.md#cache-layers).
- **Realtime primitive.**
  Live surfaces (event attendance rosters, the events list, the notification list) subscribe to a **private broadcast change-ping** via the shared `useRealtimeTable` hook ([`apps/web/lib/realtime/use-realtime-table.ts`](../../../apps/web/lib/realtime/use-realtime-table.ts)), and one shared browser Supabase client multiplexes every subscription over a single websocket ([`apps/web/lib/realtime/supabase-realtime.ts`](../../../apps/web/lib/realtime/supabase-realtime.ts)).
  The hook takes `{table, scopeId}` and builds its topic from the contract in [`change-topics.ts`](../../../packages/chat-core/src/change-topics.ts); the ping carries no row data and the hook's whole body is `invalidateQueries`.
  **Not `postgres_changes`** — those tables are API-enforced and publishing them would move the enforcing layer into RLS (#867).
- **Notification drawer.**
  Endpoint + realtime contract and the web-push scope decision: [`spec/behavior/notifications.md`](../../behavior/notifications.md).
- **Event attendance by role.**
  The rule and its wire semantics (the three role lists and `others_invited`): [`spec/behavior/events.md`](../../behavior/events.md) §Event Creation.
  The editor is `components/events/attendance-editor.tsx`.
- **Onboarding wizard.**
  Trigger, re-trigger signal, and server-side config materialization via `POST /v1/chapters/onboard`: [`spec/behavior/onboarding.md`](../../behavior/onboarding.md).
  Wizard UI contract: full-screen overlay at [`apps/web/components/onboarding/chapter-wizard.tsx`](../../../apps/web/components/onboarding/chapter-wizard.tsx), mounted by `ChapterWizardGate` in [`chapter-wizard-gate.tsx`](../../../apps/web/components/onboarding/chapter-wizard-gate.tsx) — a separate file since [#2145](https://github.com/pdcarlson/Frapp/issues/2145) put the wizard behind `next/dynamic`, so the shell no longer pays for it on every route.
  It is **not** covered by the [375px floor](#responsive-contract) gate — it is an overlay the gate mounts conditionally on a zero-membership account, never a route, so neither floor suite can reach it, and this page asserted a floor nothing was measuring until the Profile & pre-auth slice said so — directory combobox debounced 250ms against `GET /v1/chapter-directory/search` with explicit idle/loading/no-results/error states, and a manual-entry path that is always available.
- **Custom fields CRUD.**
  Endpoint permissions and status-code semantics (409 duplicate key, `key`/`type` immutability): [`spec/behavior/settings/customization.md`](../../behavior/settings/customization.md).
- **Points ledger.**
  `GET /v1/points/transactions` (`points:view_all`, `limit` clamped 1–200, default 50) and anomaly flagging: [`spec/behavior/points.md`](../../behavior/points.md).
- **Config, theme, archetype.**
  Config reads/writes go through `GET`/`PATCH /chapters/:id/config` and every write produces a `chapter_audit_log` row, which officers read on the Logs tab (`?tab=logs`; [`settings/README.md` § Audit Rules](../../behavior/settings/README.md#audit-rules));
  the Settings accent save goes through `PATCH /v1/chapters/current`, which recomputes and stores the palette in the same write, and the refetched chapter repaints it without a reload (`POST /chapters/:id/theme-palette` recomputes on its own, but no client calls it).
  The engine persists **hex**, so any token it writes MUST be stored as a complete colour value and read as a bare `var()`, never wrapped in `hsl()` — the wrapper turns an injected `#C49A3A` into the invalid `hsl(#C49A3A)` and the chapter's branding silently does not paint (#1143).
  Every colour token in both stylesheets — [`packages/theme/src/signet.css`](../../../packages/theme/src/signet.css), which this surface and `apps/landing` both ship since #2366, and the legacy `packages/theme/src/globals.css`, deleted in that same cutover — is stored that way — one format, no per-token pairing rule — owned by [`../design-system/accent-engine.md`](../design-system/accent-engine.md) §6 and not restated here;
  [`packages/theme/src/tailwind.config.spec.ts`](../../../packages/theme/src/tailwind.config.spec.ts) and [`packages/theme/src/signet.css.spec.ts`](../../../packages/theme/src/signet.css.spec.ts) enforce both halves of it per stylesheet, including a repo-wide ban on hand-written `hsl(var(--token))` (#1151): [`spec/behavior/chapter-config.md`](../../behavior/chapter-config.md).
  Archetype switching resets modules and vocabulary, changes no roles, and preserves identity, branding, and custom fields: [`spec/behavior/settings/README.md`](../../behavior/settings/README.md).

## History

Two series built this surface.
Their rules that still bind are stated in the sections above; what follows is the record of how they got there, kept where a reason is not derivable from the code.

### #2140 greenfield

[#2140](https://github.com/pdcarlson/Frapp/issues/2140) rebuilt the surface from the framework board in [`reference/`](reference/README.md), one lane per PR: the spec lock and the token ladder ([#2152](https://github.com/pdcarlson/Frapp/pull/2152)), the shell and the ⌘K palette's deletion ([#2161](https://github.com/pdcarlson/Frapp/pull/2161)), chat ([#2163](https://github.com/pdcarlson/Frapp/pull/2163)), Documents and Backwork ([#2164](https://github.com/pdcarlson/Frapp/pull/2164)), Directory, Finance and Admin ([#2171](https://github.com/pdcarlson/Frapp/pull/2171), [#2172](https://github.com/pdcarlson/Frapp/pull/2172), [#2174](https://github.com/pdcarlson/Frapp/pull/2174)), chat cold load ([#2178](https://github.com/pdcarlson/Frapp/pull/2178)), and the chapter accent, 404 and copy ([#2179](https://github.com/pdcarlson/Frapp/pull/2179)).
Its goal was a surface that reads dense, consumer-dark and FITFO: more content space, less generated chrome.
A lane was done when the thing it replaced was gone, not when the new surface rendered.

Its lane record lived in `spec/ui/web-greenfield/`, which outranked this page until [#2743](https://github.com/pdcarlson/Frapp/issues/2743) folded the rules that still bind into this page and [`tokens.md`](tokens.md), moved the board here, and deleted the rest.
The per-lane narrative, including each corrected draft and the commands each lane ran, is in git: `git log --diff-filter=D -- spec/ui/web-greenfield/deletion-checklist.md` names the commit that deleted it.

### #920 reskin

The dashboard's Signet visual system — palette, type, radii, iconography, states — is specified in [`../design-system/`](../design-system/README.md).
The #920 shell slice landed it: the surface ships [`packages/theme/src/signet.css`](../../../packages/theme/src/signet.css), Figtree, and a fully repainted shell (sidebar, top bar, account menu, ⌘K palette, drawer, onboarding chrome), with the Signet duotone nav glyphs in [`apps/web/components/layout/nav-glyphs.tsx`](../../../apps/web/components/layout/nav-glyphs.tsx).
The primitives slice repainted `components/ui/**` and `components/shared/**`, and the **chat slice** trued up `components/chat/**` — bubbles, composer, rails, reactions, pins, and every renderer — with its own duotone glyph set ([`apps/web/components/chat/chat-glyphs.tsx`](../../../apps/web/components/chat/chat-glyphs.tsx)).
The **Directory & Finance slice** trued up `components/{members,alumni,billing,points}/**` together with the `/billing` and `/points` routes that are those screens, drawing them in [`apps/web/components/members/directory-glyphs.tsx`](../../../apps/web/components/members/directory-glyphs.tsx) and [`apps/web/components/points/points-glyphs.tsx`](../../../apps/web/components/points/points-glyphs.tsx).
It changed no billing data contract — the pay affordance gate, the subscription card rendering first, checkout only at `incomplete`, the bounded poll, and the two pessimistic writes all hold as written above.
_Corrected 2026-10-01:_ that was true when the slice landed.
Since then [#929](https://github.com/pdcarlson/Frapp/issues/929) offers checkout at `canceled` as well, and [#2172](https://github.com/pdcarlson/Frapp/pull/2172) folded the subscription card into the plan panel; [Surviving data contracts](#surviving-data-contracts) states the current rule.

The **Chapter Ops slice** trued up `components/{events,tasks,study,service,geofences}/**`.
Beyond the repaint it settled three things the remaining slices inherit.
Status colour is checked by vocabulary rather than by grepping for the accent — #1202 reported one accent-painted badge and the family had five, in three spellings, plus the mirror error of §5's Neutral count badge carrying `LATE`, `PENDING` and `ACTIVE`.
A state's fill has to be dropped whenever it cannot rise above its container, not only inside a `<CardContent>`: the attendance panel renders in a `SheetContent`, which is the top of the ladder, so its `--card` panel was a step _down_.
And `window.confirm` is a behavioural ban rather than a visual one — its Binds column reads "Every surface" — so the six native dialogs here (four `confirm`, two `prompt`) became [`apps/web/components/shared/confirm-dialog.tsx`](../../../apps/web/components/shared/confirm-dialog.tsx), which the four families still holding native dialogs can adopt rather than redesign.
It changed no data contract: the realtime change-ping wiring, the `required_role_ids` semantics, and every §5 gated write are as written above, including the deliberate ungating of study Pause/Resume and Stop, which act on a running session and must never trap a member in a timer they cannot end.

The **Resources & Reporting slice** trued up `components/{documents,backwork,polls,reports}/**` — naming all four directories here because this family's own name reads as three, and `/polls` was filed under Chapter in the nav table above until #3871 retired it.
Beyond the repaint it settled four things.
A status vocabulary reached by a derived boolean is still a vocabulary: `/polls` painted `Open` in the chapter accent through an inline ternary and had no mapper for the shared invariant to check, so `poll-status.ts` joined the five (deleted with the page, #3871) and `status-kind.spec.ts` grew a table for boolean-input mappers.
The accent sweep runs in both directions — the same slice took the accent _off_ the poll status and left it _on_ `/documents`' folder filter, which §5 already called accent-worthy and which had been spelled as a raw `bg-primary/10` wash.
A screen's states must not sit above its own dialogs: `/documents` early-returned its loading and error states above the gated upload `Dialog`, so a background refetch failure unmounted an open upload form mid-draft, which is [`../design-system/components.md`](../design-system/components.md) §10's rule met from the other side.
And an error state that was never written down is an error state that does not exist — `/reports` caught a failed run, raised a toast, and fell through to its idle copy, because `writing.md` §7's table for it had no Error row.
It changed no data contract: the 5,000-row cap, the client-side CSV built from the preview, the signed-URL PDF, and every §5 gated write are as written above.

The **Settings & Roles slice** trued up `components/{settings,roles}/**`.
Beyond the repaint it settled four things.
A tier is not a status: the modules tab painted `Chapter Pro` in the chapter accent and `Free` in a hand-spelled success tint, and both now take §5's Hairline, because a module's price is a fixed property of the catalog while its _state_ is the Switch beside it — a green `Free` next to an off switch said the module was on ([`settings-status.ts`](../../../apps/web/components/settings/settings-status.ts)).
The accent sweep ran the other way in the same pass: the archetype grid's selected card was a raw `bg-primary/5` wash of the chapter hex on a selection §5 genuinely calls accent-worthy, and takes the two card-seated states now.
A screen's states must sit _inside_ its own permission gate — `/roles` early-returned loading and error above `<Can>`, so a member without `roles:manage` was told the roles were loading and then that they had failed, for a surface they were never going to see.
And a token that reads like the right one is not a measurement: the capability matrix's missing-permission mark went from a 2.184:1 opacity wash to `--muted`, which was then 3.568:1 on that card and under §6 (6.69:1 since the 2026-11-09 text ladder), before landing on `--muted-foreground` — `✓` and `—` are characters, so the text floor applies, not the glyph one.
It changed no data contract: the `?tab=` deep links, the archetype-switch reset semantics, the wildcard's transfer-only path, and every §5 gated write are as written above.

The **Profile & pre-auth slice** trued up `components/{profile,onboarding}/**`, the four routes outside `(dashboard)` — `/`, `/sign-in`, `/sign-up`, `/join`, `/no-access` — and `app/global-error.tsx`, drawing them in [`apps/web/components/profile/profile-glyphs.tsx`](../../../apps/web/components/profile/profile-glyphs.tsx).
It is the last screen family, so with it every `apps/web` surface ships Signet and no in-screen icon is on the Lucide interim pack except the control furniture [`../design-system/iconography.md`](../design-system/iconography.md) §6.2.2 keeps there deliberately.

Four of those screens carried staging-demo copy and three were **rebuilt rather than repainted**, which is the finding rather than a scope note.
`/`, `/sign-in`, `/sign-up` and `/join` came from an early milestone chunk — two- and three-card grids whose copy read "Frapp staging", "Sign in to manage your chapter in staging", "This milestone enables real staging usage, not preview data" and "Invite redemption writes directly to the chapter membership table".
They are the first thing a member ever sees, and they described the build rather than the product.
All five pre-auth routes now share one column, [`apps/web/components/auth/auth-screen.tsx`](../../../apps/web/components/auth/auth-screen.tsx): the layout had been inlined per route, which is how the copy drifted into four voices and four heading sizes without anyone editing a shared file.

**Correction, 2026-11-05: the column became a split frame.**
Paul judged the single centred column to be the mobile s01 layout stretched onto a desktop, and asked for sign-in and sign-up to read as one page with different fields.
The signed-out routes now live in the `(auth)` route group, whose layout mounts [`auth-frame.tsx`](../../../apps/web/components/auth/auth-frame.tsx) once: the form column on the left, headed by the mark and wordmark on every route, and from `lg` up a live product panel on the right ([`chapter-showcase.tsx`](../../../apps/web/components/auth/chapter-showcase.tsx)).
Because the frame is a layout, the hop between `/sign-in`, `/sign-up`, `/join` and `/no-access` swaps only the form and the panel keeps playing.
`AuthScreen` is now only the form column.
`/` stopped being a two-button screen and became a gate that redirects to `/sign-in` signed out; it cannot render the form itself because `app/(dashboard)/page.tsx` already resolves to `/` inside its own group.
The mobile boards' rule that only the entry screen draws the mark does not carry over: on a phone the mark is the screen's anchor, here it is the frame's lockup and the form's `<h1>` is the anchor.
Paul picked the panel's content from three directions (a live chat scene, a faked Ask answer, a drifting card stream): a short #general scene with an event's check-in count climbing, a task handed off and finished, and a poll filling in.
What it may draw is bounded the way the landing frames are ([`../landing/README.md`](../landing/README.md), "What the frames may draw"): no RSVP, no dues card, no Ask.
It is `aria-hidden` with nothing focusable, opens on its finished frame, and under `prefers-reduced-motion` never leaves it.
It loops, so it is not one of [#3493](https://github.com/pdcarlson/Frapp/issues/3493)'s once-per-flow signature moments; it is a pre-sign-in showcase that borrows the theme's motion scale.

Beyond the repaint it settles four things.

**A pre-auth screen has no tenant, so the accent slot holds the house default there — and the mark still may not use it.**
`useChapterTheme()` mounts inside [`dashboard-shell.tsx`](../../../apps/web/components/layout/dashboard-shell.tsx) and these routes render outside it, so the engine never runs and the accent family resolves to `signet.css`'s baked seed.
Ordinary chrome may take it and does: the primary button, the footer links and the `/no-access` state tile are all accent-role classes, and if a chapter accent were ever applied this high they _should_ follow it.
The **mark** is the exception, because [`../brand-identity.md`](../brand-identity.md) §2 says it MUST NOT take the chapter accent ever (outside Frapp Intelligence's front doors, its one exception since #4702) — so [`signet-mark.tsx`](../../../apps/web/components/auth/signet-mark.tsx) paints locked emblem B as `#1A1A1A` / `#DDB844` rather than `--primary` or `--gold-house`.
The mirror half is `/profile`: it renders _inside_ a chapter, so its s15 identity header takes the accent roles rather than the house family the board happens to draw it in.

**The reference wins on visuals and not on the data model.** s02 draws a six-cell row for a shared chapter code;
[`spec/behavior/onboarding.md`](../../behavior/onboarding.md) specifies invite links instead (a personal one used once, or an officer's chapter link for a role, each lasting 7 days), and [`../README.md`](../README.md)'s precedence rule puts behavior above UI on what the product does.
So `/join` takes s02's chrome — the title ladder (the back affordance went with the 2026-11-05 split frame, whose header and footer links do that job), the primary, the `--surface-1` hint card — and not its input. Since #5625 the page leads with the invite card; its one token field, behind **Have a different invite?** or shown when there is no invite, accepts a pasted raw token or the join URL officers copy (`extractInviteToken` in `@repo/validation`). The phone has no field at all ([`../mobile/screens.md`](../mobile/screens.md)).

The settings blocks this history describes on `/profile` (quiet hours, notifications, blocked members) moved to the personal Settings page on 2026-11-10 ([§ Two doors](#two-doors-chapter-settings-and-your-settings)); the rules they settled moved with them.

**A control with no reader is deleted, not restyled.**
`/profile`'s theme `Select` wrote `user_settings.theme`, which nothing on any surface has read since `next-themes` left in the shell slice — while the account menu paragraph above already asserted the surface had no theme switch.
The tutorial slide advertising it went in the same change.

**A second query on a screen is a second set of states.**
`/profile` reads `GET /v1/users/me` _and_ `GET /v1/settings`, and only the first had any branches.
A failed settings fetch rendered empty quiet-hours fields beside a live Save button, and because the submit maps an unloaded field to `undefined`, pressing it sent an empty body and toasted "Preferences saved" — [`spec/behavior`](../../behavior/README.md)'s reads reported as writes.
The card carries its own nested states now.
The same screen also moved off a bare `isError`: TanStack keeps `data` through a background refetch failure, so the old branch unmounted a form holding unsaved drafts when a window-focus refetch failed.

It changed no data contract: the `/` → `/chat` redirect, the `redirectTo` open-redirect guard and its reuse as the magic-link `emailRedirectTo`, the invite token's 410/409 semantics, and the wizard's cold-path `POST /v1/chapters/onboard` are all as written above.

**Later, and not part of that slice: a third query, and the first chapter-scoped control on `/profile` (#564).**
The Notifications card reads `GET /v1/notifications/preferences` and shipped with its own state ladder from the start, so the rule above held rather than being re-learned.
It carries a no-chapter rung the other cards of that slice do not, and its reason is not the one a reader would guess.
It is **not** that a disabled query spins — v5 derives `isLoading = isPending && isFetching`, so a query held by `enabled: !!chapterId` never reaches the loading rung at all.
The rung exists because without it the card falls through to `null` and renders six live-looking switches whose clicks the handler silently drops, which is a dead control rather than a missing one.

**That rung's copy instructs, and does not assert.**
`activeChapterId` initialises to `null`, so before the persisted store rehydrates — and in the server-rendered HTML — a member _with_ a chapter is indistinguishable from one without.
"Select a chapter" is true in both states; "you have no active chapter" would be a confident falsehood in one of them.
Gating the rung on the store's `hasHydrated` instead was tried and **reverted**: that flag has three ways to stick at `false` for the life of a session, verified empirically against `zustand@5.0.15`.
When `localStorage` access throws, `createJSONStorage` returns `undefined` and `persistImpl` early-returns on `!storage` without ever calling `hydrate()` — and in that branch `api.persist` is never assigned either, so `useChapterStore.persist.hasHydrated()` is not a safe substitute; it throws.
Corrupt JSON under the storage key, and a `setItem` that throws on quota, both land in the hydration chain's `.catch`, which calls the callback as `postRehydrationCallback(undefined, e)` — and `chapter-store.ts`'s `state?.setHasHydrated(true)` optional-chains into a no-op.
In all three the card would hang on a permanent skeleton, shown to exactly the members for whom the no-chapter state is genuinely correct.
A sentence that is wrong for an instant is worth fixing; a card that never resolves is not the fix.
`hasHydrated` consequently still has no consumer.

This was also the first control on the screen with a tenant, `notification_preferences` being keyed `(user_id, chapter_id, category)`; see the qualification in the "Profile left the nav" bullet above.

**Two more queries, and a second tenant: Blocked members (#2313).**
[`blocked-members-card.tsx`](../../../apps/web/components/profile/blocked-members-card.tsx) reads `GET /v1/chat/blocks` through `useBlockedUserIds`, whose status is tri-state, so the card says "empty" only after a read confirmed it.
A failed or offline read either shows the error state or keeps a cached list under a "couldn't refresh" line.
Blocks are chapter-scoped ([`../../behavior/chat/README.md`](../../behavior/chat/README.md) § Block), so it carries a no-chapter rung like the Notifications card, for a different reason: with no chapter the query is disabled and never settles, and `useBlockedUserIds` reports a query that neither succeeded nor failed as `loading`, so the card would show a skeleton forever.
Its second read is the roster (`useMemberDisplayNames`), for names only, and it has no states of its own on purpose: a member the roster cannot name, because the read failed or because they left the chapter (a block outlives membership), is listed under a fallback label and can still be unblocked.
It is web's durable way to undo a block, alongside the tombstone's Unblock in `/chat`.

The **legacy engine cutover** (slice 9) closed the series.
It touched no screen — every family was already Signet — and deleted the `derivePalette` accent engine, which had gone on being computed and persisted on every chapter save although nothing had read its output since the shell slice.
Its only production caller was `buildChapterPalette` in the API, which now writes one map instead of merging two.
Three things about it are worth keeping.

**A stored artifact outlives the code that wrote it.**
`chapters.theme_palette` is unconstrained jsonb, and at the cutover nothing pruned it, so every row saved before then holds the eight dead legacy keys until the #1165 stale-palette sweep recomputes it, in each environment once that environment runs #1165 ([`../design-system/accent-engine.md`](../design-system/accent-engine.md) §4).
Deleting the writer was safe _because_ both clients read by allow-list — [`use-chapter-theme.ts`](../../../apps/web/lib/hooks/use-chapter-theme.ts) takes a fixed `--signet-*` list, mobile a fixed handful of keys ([`accent-engine.md`](../design-system/accent-engine.md) §6, Delivery (native)) — and those allow-lists are therefore load-bearing rather than historical.
The guard asserting no legacy token reaches `:root` outlived its subject for the same reason.

**A documented blocker can be wrong about its own subject.**
[`../design-system/accent-engine.md`](../design-system/accent-engine.md) §6 gated this deletion on "mobile's pre-Signet-map fallback retiring".
That fallback is `resolveChapterAccentColor`, a different function in a different package that re-validates `accent_color` and never read the deleted engine's map — `apps/mobile` does not even declare `@repo/chapter-theme`.
The two were coupled in prose only, and the same §6 said elsewhere that the legacy units die "at the end of the #920 series".
Read the code the blocker names before treating it as a gate.

**A chapter now supplies one colour, not two.**
`branding.colors.dark` fed only the deleted map, so it went with it — DTO, Zod schema, regenerated contract, and the "Primary (dark) color" picker in both onboarding wizards.
The neutral ladder was already fixed rather than branded ([`../design-system/accent-engine.md`](../design-system/accent-engine.md) §5), so there was nothing left for a second colour to paint; #541, which tracked building a picker for it, is obsolete.
