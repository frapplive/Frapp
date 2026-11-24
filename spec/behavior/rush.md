# Rush / Recruitment / Intake

The recruitment module manages prospective members from first contact through bid/vote to acceptance. Its surfaces follow the shared ops integration pattern — see [`integrations.md`](integrations.md).

A larger upgrade (a pipeline, interest forms, eligibility and a council master list) is designed in [`ifc-recruitment.md`](ifc-recruitment.md) and is being built in slices under [#5833](https://github.com/frapplive/Frapp/issues/5833). Each rule moves here when it is built; this file owns what recruitment does today.

## Vocabulary

- The module name and all member-facing copy render through the chapter's **vocabulary helper**, never a hardcoded "rush." The substitutable term is configured per chapter (rush / recruitment / intake / induction) in the settings Chapter tab (`?tab=org`), and defaults to the archetype's. The same vocabulary term names the slash command, the dashboard and the chat candidate card's eyebrow. Web and mobile resolve it with the one helper, `vocab()` and `memberViewVocabulary()` in `@repo/org-archetypes`.

## Candidates

- A candidate is a prospective member tracked through the recruitment process. Candidates are added via the `/<vocab> add @candidate` slash command (e.g. `/rush add`, `/recruitment add`, `/intake add`).
- The candidate card (a chat card on web and mobile) shows the candidate and who added them, plus their live bid status and, for a role holding `rush:view_results`, their vote count, and offers Vote and Extend bid inline to a role holding that key. Its rules: [`chat/integrations.md` § Rich-message renderer registry](chat/integrations.md#rich-message-renderer-registry).

## Voting and Bids

- Members vote on a candidate via `/<vocab> vote <candidate>` and extend a bid via `/<vocab> bid <candidate>`, where each takes a candidate's id or name, or with the candidate card's Vote and Extend bid.
- **A name that matches several prospects** is never picked silently: the lookup (`GET /v1/rush/candidates?name=`) answers 409 `rush.several_match` with each match's id, name, stage and the day it was added, and web's slash command asks which one before it runs (#5973, [`ifc-recruitment.md` § Name lookup](ifc-recruitment.md#name-lookup)). Today names are still unique in a chapter, so this waits for candidates linked to PNMs.
- Vote and bid actor identity comes from the authenticated session (`viewer.id`), never a client-supplied id — see the actor-identity rule in [`chat/integrations.md`](chat/integrations.md#slash-command-dispatch).
- Ballots store `voter_id` so a member can vote once. The card and GET projection publish `vote_count` and `viewer_has_voted` only — voter names are never listed. `vote_count` is left out for a viewer without `rush:view_results` ([§ Permissions](#permissions)). No setting changes that: the seed's `wf_rush_anon_vote` is read by nothing and no longer shown in Chapter settings ([#3439](https://github.com/pdcarlson/Frapp/issues/3439), [#4073](https://github.com/pdcarlson/Frapp/issues/4073)). Vote is one-click, not a toggle.

## Permissions

Recruitment has its own permissions (#4070, 2026-11-10). Every REST route needs the `rush` module on, `members:view`, and the key for what it does. The slash commands and the card's buttons call those routes, so they carry the same gates, and web and mobile offer only what the role holds (#4084): the card leaves out Vote without `rush:vote` and Extend bid without `rush:bid`, and web's slash palette lists only the `/<vocab>` subcommands the role holds (`can` from `@repo/validation`).

| Permission | Lets a role | Gates today |
| --- | --- | --- |
| `rush:view` | Look up a prospect and see their bid status; open the pipeline and see stages, tags, owners, contacts and follow-ups | `GET /v1/rush/candidates`, `GET /v1/rush/candidates/:id`; `/<vocab> vote` and `bid` by name, which look the prospect up first; `GET /v1/rush/pipeline`, `GET /v1/rush/stages`, `GET /v1/rush/settings`, `GET /v1/rush/candidates/:id/contacts` |
| `rush:add` | Add a prospect and work them ("Add and work prospects"): move stages, log contacts, claim an unowned prospect or let go of their own, set and clear follow-ups | `POST /v1/rush/candidates`, `/<vocab> add`, `PATCH /v1/rush/candidates/:id/stage`, `POST …/contacts`, `PUT …/owner` (claim or let go), `PUT`/`DELETE …/follow-up` |
| `rush:vote` | Vote on a prospect and rate them | `POST /v1/rush/candidates/:id/vote`, `/<vocab> vote`, the card's Vote; `PUT /v1/rush/candidates/:id/rating` |
| `rush:bid` | Extend a bid; record a decline or an acceptance, which waits for confirmation ([§ Bids](#bids)) | `POST /v1/rush/candidates/:id/bid`, `/<vocab> bid`, the card's Extend bid; `POST …/bid/decline`, `POST …/bid/accept` |
| `rush:view_results` | See how many votes a prospect has and their average rating | No route: without it, `vote_count` is left out of every prospect read and of the vote and bid responses, and the card shows no count ([#4084](https://github.com/pdcarlson/Frapp/issues/4084)); the pipeline leaves out `vote_count`, `rating_average` and `rating_count` the same way |
| `rush:notes` | Write notes on a prospect and tag them | `POST /v1/rush/candidates/:id/notes`, editing and deleting their own (`PATCH`/`DELETE …/notes/:noteId`), `PUT /v1/rush/candidates/:id/tags` |
| `rush:read_notes` | Read notes on prospects ([§ Notes](#notes)) | `GET /v1/rush/candidates/:id/notes` |
| `rush:manage` | Edit the chapter's stages, tags and settings ([§ Settings](#settings)), assign any prospect's owner, delete anyone's note, confirm a recorded acceptance and rescind a bid | `PUT /v1/rush/stages`, `POST`/`PATCH`/`DELETE /v1/rush/tags`, `PUT /v1/rush/settings`, `PUT …/owner` for anyone, `DELETE …/notes/:noteId` for a note that isn't theirs, `POST …/bid/confirm`, `POST …/bid/rescind`. Deleting prospects and exporting the list are not built yet ([`ifc-recruitment.md`](ifc-recruitment.md), #5833) |

**Default: today's behaviour** (Paul, 2026-11-10, [#4068](https://github.com/pdcarlson/Frapp/issues/4068) decision 12). Before these keys, any member with `members:view` could look up, add, vote and record a bid. So the seeded Member role holds every key but `rush:manage` (and `rush:read_notes`, which came later, [§ Notes](#notes)) (`RUSH_MEMBER_PERMISSIONS` in `@repo/validation`), and migration `20261111010000_rush_permissions_backfill.sql` gave the same six to every existing role and custom role that held `members:view` in a chapter with the module on. A chapter tightens it by taking a key off a role. `rush:manage` is held only through `*`.

Two things follow from where the keys were given:

- In a new chapter only Member is seeded with them, so someone whose only role is New Member or Alumni can't use recruitment until an officer grants it. In chapters that existed before the migration, those roles kept what they could do.
- A chapter that had the module off at the migration got no backfill. Turning it on later leaves recruitment to the President until the keys are granted.

**A hidden count is left out, not zeroed** (#4084, 2026-11-23). `vote_count` is optional in the contract, so a client can't read a hidden count as none. Mobile builds shipped before #4084 read it as a required number; for a viewer without `rush:view_results` their card discards the read and shows the prospect with no tally, badge, Vote or Extend bid (the slash commands still work). That happens for any role holding `rush:view` without `rush:view_results`: one a chapter took the key off, or one an officer granted the other keys alone (above, a new chapter's New Member, Alumni and custom roles, or a chapter that turned the module on after the backfill). The seeded Member role and every backfilled role hold both. The shipped-contract check waives the change on that evidence (`apps/mobile/store/api-breaking-ignore.txt`).

## Pipeline

The recruitment page (#5924, slice 1 of the IFC recruitment work, #5833): web's page in the dashboard sidebar and the phone's screen under More, both named with the chapter's vocabulary term. It needs the `rush` module on, `members:view` and `rush:view`. Web shows a **board** (a column per stage) and a **list** of the same prospects; the phone shows a list one stage at a time behind chips. A prospect opens a panel on web and a screen on the phone, with their stage, rating, vote, tags and notes. Screens: [`spec/ui/web-dashboard/README.md`](../ui/web-dashboard/README.md) and [`spec/ui/mobile/screens.md`](../ui/mobile/screens.md).

### Stages

Stage, fit rating and bid status are three separate things, because a chapter acts on each differently: the stage is where the relationship is, the rating is what members think, and the bid is the formal offer. ChapterBuilder mixes them in one D-to-A+ scale; Frapp doesn't ([`ifc-recruitment.md` § Stages](ifc-recruitment.md#stages) has the reasoning).

- **Each stage belongs to one of six fixed categories.** Every chapter starts with one stage per category, named after it:

  | Category | Default stage | Means |
  | --- | --- | --- |
  | `new` | New | Just arrived from an add |
  | `contacted` | Contacted | Someone has reached out |
  | `met` | Met | Has met members in person |
  | `engaged` | Engaged | Keeps showing up; being seriously considered |
  | `bid_ready` | Bid ready | The chapter wants to bid |
  | `closed` | Closed | Out of the pipeline |

  The defaults are written the first time the chapter's stages are read. A default stage's key is its category's, so every prospect added before stages existed (`stage = 'new'`) is in New.
- **A holder of `rush:manage` renames, adds, reorders and hides stages within a category,** on the Recruitment page of Chapter settings. A stage never changes category and is never deleted, because prospects point at it; hiding takes it off the board and the stage pickers. **New** and **Closed** must each keep at least one visible stage. A hidden stage that still holds prospects keeps its board column, so nobody goes missing.
- **Anything automatic goes by category, never by name.** An automatic move lands in the first visible stage of its category, and is skipped when every stage there is hidden. Adding a prospect lands them in the first visible New stage, whatever the chapter calls it. The first logged contact moves a prospect still in a New stage to the first visible Contacted stage (#5934); a prospect already past New stays where they are. The move on attendance at an event comes with a later slice ([`ifc-recruitment.md` § Stages](ifc-recruitment.md#stages)).
- **Moving a prospect needs `rush:add`.** Any visible stage can be chosen; the board also takes a drag.
- **A Closed stage needs a reason.** A member picks one of: Not interested, Not eligible, Chapter passed, No response. Leaving Closed clears it. Three more reasons (Accepted elsewhere, Withdrew, Deleted their information) are set only by the system, in later slices.
- **On the board, every Closed stage folds into one Closed column** at the end, so the board fits a laptop window. Dropping a card there asks for the reason, and for which Closed stage when there is more than one.
- **Bid status is not a stage.** No stage move changes it, and extending a bid moves no stage. On the board, though, a prospect with a bid out sits in a **Bid extended** column before Closed whatever their stage, and one who accepted folds into Closed under **Accepted**, because only a bid action moves them there (Winston, 2026-11-24, [§ Bids](#bids)); those cards don't drag, and their stage still changes from Move to and the panel. The open count leaves accepted prospects out with the closed ones.

### Tags

- The chapter keeps its own tag list, such as "legacy", "athlete" or "met at tabling", on the Recruitment settings page. Names are unique in a chapter, whatever their case. Managing the list needs `rush:manage`; deleting a tag takes it off every prospect.
- Seeing a prospect's tags needs `rush:view`. Tagging a prospect needs `rush:notes`.
- Tags are private to the chapter.

### Ratings

- A member with `rush:vote` rates a prospect from 1 to 5 stars, and can change it. A rating is a member's own fit judgment, apart from the vote.
- Ratings are never shown by name. A reader with `rush:view_results` sees the average and how many rated; everyone sees only their own rating.
- Deleting an account deletes the member's ratings, as it deletes their ballots.

### Notes

- **Reading notes needs `rush:read_notes`; writing them needs `rush:notes`.** #4070's backfill gave `rush:notes` to every role that held `members:view`, New Member and Alumni included, so reading needed a key of its own to keep notes to a committee (Paul, 2026-11-11).
  - **New chapters:** the top two starting tiers (Exec board, Officers and chairs) hold `rush:read_notes`, as officer defaults (#4068 decision 9).
  - **Existing chapters:** nobody holds it until an officer turns it on. The Recruitment settings page says "Nobody can read recruitment notes yet" and offers to grant it to the chapter's top two tiers, which needs `roles:manage`; the page's Who can block grants it to anyone else.
  - A member who can write but not read sees the box to write a note and who can read it, and not the notes.
- **Nobody reads notes about themselves.** On a prospect linked to the viewer's own account, the notes read is empty and writing, editing or deleting a note is refused, whatever keys they hold.
- **The author edits or deletes their own note; `rush:manage` deletes any.**
- **Notes never appear on the chat card or in a push.**
- Notes stay when their author deletes their account, as their chat messages do, under the name "Deleted User".

### Contacts, owner and follow-ups

Built in #5934 (slice 2 of #5833). The reasoning and the recruitment week they're checked against: [`ifc-recruitment.md` § Contact tracking and follow-ups](ifc-recruitment.md#contact-tracking-and-follow-ups).

- **Log a contact** (`rush:add`): the kind (text, call, in person, social DM, email, at an event), the day (today by default; any day back to 120 days, never a later one), and an optional note of up to 500 characters. Who logged it is recorded. On the phone it is two taps from the prospect: Log contact, then the kind.
  - The prospect's **last contact** is the newest logged day and who logged it ("Last contacted November 18 · by Chris"). A contact dated earlier than the last one doesn't move it back.
  - Logging any contact **clears the follow-up**.
  - A contact's note reads like a recruitment note: only with `rush:read_notes`, and never on a prospect linked to the reader. Everyone with `rush:view` sees that the contact happened. Nobody logs a contact with themself.
  - Contacts stay when the member who logged them deletes their account, under "Deleted User", as notes do.
- **Owner**: one member is a prospect's main point of contact. A holder of `rush:add` claims an unowned prospect or lets go of their own; assigning someone else, or taking a prospect over, needs `rush:manage`. The owner must hold `rush:add`. Nobody owns themself as a prospect. Two claims at once leave one owner; the other is told someone claimed them first. A new owner takes over a follow-up that was the old owner's; one set for someone else stays theirs. Deleting an account clears the prospects it owned.
- **Follow-up**: one per prospect, a day (today up to 180 days ahead), what to do (up to 120 characters, "invite to house dinner"), and who it's for: the owner by default while they hold `rush:add`, else whoever sets it. It needs `rush:add` to set or clear, and whoever it's for must hold `rush:add`. A closed prospect takes none, and closing one drops it. A member linked to the prospect neither sets nor clears one, nor reads what to do.
  - **The push:** that member gets a push and an inbox item on the morning it's due (9 AM to noon in their own time zone, as task and dues reminders go out), once per follow-up day, while recruitment is on and they still hold `rush:add`. It opens the prospect.
- **The stale alert:** an open prospect with no logged contact for the chapter's **stale days** (default 7, from 1 to 60, set on the Recruitment settings page with `rush:manage`) **needs a follow-up**: counted from the last contact, or from the day they were added when nobody has logged one. The screens flag it. Its owner is told once, on their morning, per stretch without contact; a prospect with no owner is only flagged.
- **The pushes have no switch** in notification settings (category `rush`): each is a follow-up someone set for the member or a prospect they own, so muting it would drop the work rather than the noise. Neither push carries a note or the follow-up's own words: the title names the prospect, and the prospect's screen says what to do.
- **Where they show:** web's page header and the phone list's title say "N follow-ups due today" (the viewer's own, due today or earlier). The phone list opens on a **Follow up** chip: the viewer's due follow-ups and the stale prospects they own. Screens: [`spec/ui/web-dashboard/README.md` § Recruitment](../ui/web-dashboard/README.md#recruitment) and [`spec/ui/mobile/screens.md` § Recruitment](../ui/mobile/screens.md#recruitment).

## Bids

Built in #5973 (slice 3 of #5833). The reasoning, and what joins with the council and the PNM's own view: [`ifc-recruitment.md` § Bids](ifc-recruitment.md#bids).

- **A bid's state** is one of none, extended, accepted, declined, expired and rescinded (`bid_state`). Only bid actions move it. The card routes keep `bid_status`'s two values for shipped clients: `extended` for a bid out or accepted, `none` otherwise.
- **Extend** (`rush:bid`, the card's Extend bid, `/<vocab> bid` and the panel): only with no bid or an expired one; any other state answers 409 in words ("This prospect already accepted"), so an old card can't undo an answer. The bid is open for the chapter's **bid days** ([§ Settings](#settings)). Nobody extends a bid to themself. Bids out before this slice have no expiry.
- **Record a decline** (`rush:bid`): on an open bid, for a paper bid card or a spoken answer. "Declined, recorded by Chris".
- **Record an acceptance** (`rush:bid`): on an open bid. It **waits**: the bid stays extended, "Waiting to confirm" (Paul, #4218), until the PNM confirms it with one tap from the email Frapp sends at once, or a holder of `rush:manage` confirms it. Nothing else happens until then, and a bid nobody confirms expires as usual.
  - **The email** goes to the address the recorder types, or, left empty, a linked member's account email (Winston, 2026-11-24). It is kept apart from the prospect, never shown to members, and deleted once the bid is answered or expires. With no email, only `rush:manage` confirms, and the panel says so.
  - **The PNM's page** (`/recruitment/confirm`, the link's token in its fragment, no account needed) reads "{Chapter}'s bid · Recorded by Chris, waiting to be confirmed" with **Confirm I accepted**, then "Accepted · confirmed by you". Opening it confirms nothing; a used, answered or expired link says it no longer works.
- **Confirm** (`rush:manage`, or the PNM's tap): the bid is accepted, and the PNM is emailed an invite to join with the chapter's new member role ([§ Settings](#settings)), as from whoever confirmed it, or from the recorder when the PNM did. With no email, nobody is invited, and the panel says to invite them from Members.
- **Rescind** (`rush:manage`): an open bid, with a reason up to 200 characters.
- **Expire**: an hourly sweep expires every open bid past its day, a waiting acceptance with it; every action and the PNM's page also refuse one whose day has passed.
- **Nobody acts on a bid to themself.**
- **Still to come:** the PNM accepting or declining in their own view, the eligibility check before a bid, the council's bid window, and the push-ups to the council with the one-acceptance rule (`ifc-recruitment.md` § Phasing).

## Funnel

Built in #5973 (slice 3 of #5833) as the page's **Summary**, on web beside Board and List and on the phone beside List. Screens: [`spec/ui/web-dashboard/README.md` § Recruitment](../ui/web-dashboard/README.md#recruitment) and [`spec/ui/mobile/screens.md` § Recruitment](../ui/mobile/screens.md#recruitment).

- **It counts the board's own cards.** It is worked out from the same pipeline read the board draws (`rushDashboard` in `@repo/hooks`), so no number can disagree with the board, and it counts the whole pipeline whatever a view or search narrows.
- **The numbers:** open prospects (everyone not in a Closed stage and not accepted); the viewer's own open prospects, for a role that can own them (`rush:add`); how many need a follow-up ([§ Contacts, owner and follow-ups](#contacts-owner-and-follow-ups)); follow-ups due today or earlier, whoever they are for; and bids out.
- **By stage:** a count per board column, in the chapter's order, Bid extended and Closed as the board draws them.
- **Bids:** extended (every bid on record), out, waiting to confirm, accepted, declined and expired ([§ Bids](#bids)). Its rows come from the chapter's stages ([§ Stages](#stages)), not a hardcoded stage array, so a chapter's customized stages drive them with no code change.
- **Results**, only with `rush:view_results`: the five open prospects with the highest average rating and the five with the most votes. A reader without it gets neither, because the pipeline read leaves the counts out for them ([§ Permissions](#permissions)).
- **Still to come** with the slices that record them: eligibility counts, sources and the next council date ([`ifc-recruitment.md` § Dashboard](ifc-recruitment.md#dashboard)).

## Settings

The Recruitment module page in Chapter settings holds the stages and tags ([§ Stages](#stages), [§ Tags](#tags)), the stale days ([§ Contacts, owner and follow-ups](#contacts-owner-and-follow-ups)), the notes opt-in ([§ Notes](#notes)), and, since #5973:

- **The new member role:** the role an accepted prospect's invite carries ([§ Bids](#bids)). It defaults to the first role in the tier named New members, by the roles' order there, not the chapter's default invite role, which in some chapters is a full member's. When that tier holds no role or has been renamed away, the page asks for a pick. A role that holds everything (`*`) can't be picked, nor one the person picking couldn't invite someone into themself (the invite rank rules), because the invite is sent without a sender's rank check. Deleting the picked role puts the default back.
- **The recruitment contacts Group:** told about each interest-form submission along with the holders of `rush:manage`. A Group holds no permissions, so the page names any member of it who lacks `rush:view`; they are skipped. None is picked until an officer picks one.
- **The card channel:** where an interest-form submission's candidate card goes; none posts no card. A channel is taken only when everyone who can read it holds `rush:view`, because the card names the prospect to the whole channel; the save is refused otherwise, naming how many can't. The interest-form slice checks again at every post.

The contacts Group and the card channel are read by the interest-form slice ([`ifc-recruitment.md` § What a submission does](ifc-recruitment.md#what-a-submission-does)); until it lands they are saved and shown, and nothing else reads them.

Reading these needs `rush:view` (`GET /v1/rush/settings`); changing them needs `rush:manage` (`PUT /v1/rush/settings`, which writes only the fields it is sent).
