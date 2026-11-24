# Rush / Recruitment / Intake

The recruitment module manages prospective members from first contact through bid/vote to acceptance. Its surfaces follow the shared ops integration pattern — see [`integrations.md`](integrations.md).

A proposed upgrade (a pipeline, interest forms, eligibility and a council master list) is in [`ifc-recruitment.md`](ifc-recruitment.md). Until it is approved, this file owns what recruitment does today.

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
| `rush:view` | Look up a prospect and see their bid status | `GET /v1/rush/candidates`, `GET /v1/rush/candidates/:id`; `/<vocab> vote` and `bid` by name, which look the prospect up first |
| `rush:add` | Add a prospect | `POST /v1/rush/candidates`, `/<vocab> add` |
| `rush:vote` | Vote on a prospect | `POST /v1/rush/candidates/:id/vote`, `/<vocab> vote`, the card's Vote |
| `rush:bid` | Record a bid | `POST /v1/rush/candidates/:id/bid`, `/<vocab> bid`, the card's Extend bid |
| `rush:view_results` | See how many votes a prospect has | No route: without it, `vote_count` is left out of every prospect read and of the vote and bid responses, and the card shows no count ([#4084](https://github.com/pdcarlson/Frapp/issues/4084)) |
| `rush:notes` | Write notes on a prospect | Nothing yet: notes are not built. They wait on the IFC recruitment work ([`ifc-recruitment.md` § Notes, tags, ratings](ifc-recruitment.md#notes-tags-ratings), #5833) |
| `rush:manage` | Delete prospects and export the list | Nothing yet: neither is built. Both wait on the same work ([`ifc-recruitment.md`](ifc-recruitment.md)) |

**Default: today's behaviour** (Paul, 2026-11-10, [#4068](https://github.com/pdcarlson/Frapp/issues/4068) decision 12). Before these keys, any member with `members:view` could look up, add, vote and record a bid. So the seeded Member role holds every key but `rush:manage` (`RUSH_MEMBER_PERMISSIONS` in `@repo/validation`), and migration `20261111010000_rush_permissions_backfill.sql` gave the same six to every existing role and custom role that held `members:view` in a chapter with the module on. A chapter tightens it by taking a key off a role. `rush:manage` is held only through `*`.

Two things follow from where the keys were given:

- In a new chapter only Member is seeded with them, so someone whose only role is New Member or Alumni can't use recruitment until an officer grants it. In chapters that existed before the migration, those roles kept what they could do.
- A chapter that had the module off at the migration got no backfill. Turning it on later leaves recruitment to the President until the keys are granted.

**A hidden count is left out, not zeroed** (#4084, 2026-11-23). `vote_count` is optional in the contract, so a client can't read a hidden count as none. Mobile builds shipped before #4084 read it as a required number; for a viewer without `rush:view_results` their card discards the read and shows the prospect with no tally, badge, Vote or Extend bid (the slash commands still work). That happens for any role holding `rush:view` without `rush:view_results`: one a chapter took the key off, or one an officer granted the other keys alone (above, a new chapter's New Member, Alumni and custom roles, or a chapter that turned the module on after the backfill). The seeded Member role and every backfilled role hold both. The shipped-contract check waives the change on that evidence (`apps/mobile/store/api-breaking-ignore.txt`).

## Funnel

- The optional dashboard renders a candidate **funnel by stage**. The funnel's stage keys derive from chapter config / the workflow definition, not a hardcoded stage array, so a chapter's customized stages drive the columns with no code change.
