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
- Vote and bid actor identity comes from the authenticated session (`viewer.id`), never a client-supplied id — see the actor-identity rule in [`chat/integrations.md`](chat/integrations.md#slash-command-dispatch).
- Ballots store `voter_id` so a member can vote once. The card and GET projection publish `vote_count` and `viewer_has_voted` only — voter names are never listed. `vote_count` is left out for a viewer without `rush:view_results` ([§ Permissions](#permissions)). No setting changes that: the seed's `wf_rush_anon_vote` is read by nothing and no longer shown in Chapter settings ([#3439](https://github.com/pdcarlson/Frapp/issues/3439), [#4073](https://github.com/pdcarlson/Frapp/issues/4073)). Vote is one-click, not a toggle.

## Permissions

Recruitment has its own permissions (#4070, 2026-11-10). Every REST route needs the `rush` module on, `members:view`, and the key for what it does. The slash commands and the card's buttons call those routes, so they carry the same gates, and web and mobile offer only what the role holds (#4084): the card leaves out Vote without `rush:vote` and Extend bid without `rush:bid`, and web's slash palette lists only the `/<vocab>` subcommands the role holds (`can` from `@repo/validation`).

| Permission | Lets a role | Gates today |
| --- | --- | --- |
| `rush:view` | Look up a prospect and see their bid status; open the pipeline and see stages and tags | `GET /v1/rush/candidates`, `GET /v1/rush/candidates/:id`; `/<vocab> vote` and `bid` by name, which look the prospect up first; `GET /v1/rush/pipeline`, `GET /v1/rush/stages` |
| `rush:add` | Add a prospect and move them between stages ("Add and work prospects") | `POST /v1/rush/candidates`, `/<vocab> add`, `PATCH /v1/rush/candidates/:id/stage` |
| `rush:vote` | Vote on a prospect and rate them | `POST /v1/rush/candidates/:id/vote`, `/<vocab> vote`, the card's Vote; `PUT /v1/rush/candidates/:id/rating` |
| `rush:bid` | Record a bid | `POST /v1/rush/candidates/:id/bid`, `/<vocab> bid`, the card's Extend bid |
| `rush:view_results` | See how many votes a prospect has and their average rating | No route: without it, `vote_count` is left out of every prospect read and of the vote and bid responses, and the card shows no count ([#4084](https://github.com/pdcarlson/Frapp/issues/4084)); the pipeline leaves out `vote_count`, `rating_average` and `rating_count` the same way |
| `rush:notes` | Write notes on a prospect and tag them | `POST /v1/rush/candidates/:id/notes`, editing and deleting their own (`PATCH`/`DELETE …/notes/:noteId`), `PUT /v1/rush/candidates/:id/tags` |
| `rush:read_notes` | Read notes on prospects ([§ Notes](#notes)) | `GET /v1/rush/candidates/:id/notes` |
| `rush:manage` | Edit the chapter's stages and tags, and delete anyone's note | `PUT /v1/rush/stages`, `POST`/`PATCH`/`DELETE /v1/rush/tags`, `DELETE …/notes/:noteId` for a note that isn't theirs. Deleting prospects and exporting the list are not built yet ([`ifc-recruitment.md`](ifc-recruitment.md), #5833) |

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
- **Anything automatic goes by category, never by name.** An automatic move lands in the first visible stage of its category. Today the only one is adding a prospect, which lands in the first visible New stage, whatever the chapter calls it. The other automatic moves (on a first logged contact, on attendance at an event) come with later slices ([`ifc-recruitment.md` § Stages](ifc-recruitment.md#stages)).
- **Moving a prospect needs `rush:add`.** Any visible stage can be chosen; the board also takes a drag.
- **A Closed stage needs a reason.** A member picks one of: Not interested, Not eligible, Chapter passed, No response. Leaving Closed clears it. Three more reasons (Accepted elsewhere, Withdrew, Deleted their information) are set only by the system, in later slices.
- **On the board, every Closed stage folds into one Closed column** at the end, so the board fits a laptop window. Dropping a card there asks for the reason, and for which Closed stage when there is more than one.
- **Bid status is not a stage.** No stage move changes it, and extending a bid moves no stage.

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

## Funnel

- The optional dashboard renders a candidate **funnel by stage**. It isn't built yet (slice 3 of #5833). Its columns come from the chapter's stages ([§ Stages](#stages)), not a hardcoded stage array, so a chapter's customized stages drive them with no code change.
