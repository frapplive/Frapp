# 20261124214736_rush_bids_and_settings.sql

<!-- One page per migration: its promotion entry and its rollback recipe.
     check:migration-safety reads the two headings below. Shared procedure
     lives in ../promotion.md and ../../db-rollback-playbook.md; link to it,
     don't copy it. -->

Adds bids to the recruitment pipeline (their state, who did what when, the PNM's pending one-tap confirmation and the hourly expiry) and the rest of the Recruitment settings page: bid days, the new-member role, the recruitment contacts Group and the card channel (#5973).

## Promotion

- **Purpose**: `rush_settings` gains `bid_expiry_days` (integer, default 7, 1 to 30) and three nullable picks, `new_member_role_id` (→ `roles`), `contacts_group_id` (→ `chapter_groups`) and `card_channel_id` (→ `chat_channels`), each `on delete set null` so deleting the role, group or channel clears the pick and keeps the row. `rush_candidates` gains `bid_state` (default `none`, one of six) and nullable bid columns (`bid_extended_at`/`_by`, `bid_expires_at`, `bid_acceptance_recorded_at`/`_by`, `bid_answered_at`/`_by`/`_via`, `bid_rescind_reason`, `bid_invite_sent`). A new table, `rush_bid_confirmations`, RLS on with no policies, holds a recorded acceptance's PNM email, token hash and when the email went out (`emailed_at`) until the bid is answered. A new function, `expire_rush_bids(timestamptz)`, executable by `service_role` only, expires open bids past their day. Partial indexes on each new foreign key and on open bids' expiry. **Writes data:** every candidate with `bid_status = 'extended'` gets `bid_state = 'extended'` and `bid_expires_at` 7 days from the push (the default bid days), so a bid out before this migration expires like any other.
- **Checks**: `select count(*) from rush_candidates where bid_status = 'extended' and bid_state <> 'extended';` returns 0. `select count(*) from rush_bid_confirmations;` returns 0. `select public.expire_rush_bids(now());` returns 0 right after the push (every backfilled expiry is 7 days out). `select count(*) from pg_indexes where indexname like 'rush_settings_%_idx';` returns 3.
- **Promoter notes**: push before the API that reads it: the new API selects and writes the new columns and calls `expire_rush_bids` hourly, so an API ahead of this migration fails the pipeline read, every bid and every settings save. An older API ignores the new columns, but its Extend writes `bid_status` alone, so a bid extended in that window reads `none` in `bid_state` until extended again; keep the window short. Needs `20261124191552_rush_followups.sql` first, which creates `rush_settings`.

## Rollback

Worth reverting only if the new columns or table themselves cause trouble. Revert the API first, because it reads and writes them and calls the function. Bids recorded since (states, expiries, pending emails) are lost with the columns; `bid_status` keeps the two-value view. Forward migration:

```sql
drop function if exists public.expire_rush_bids(timestamptz);
drop table if exists public.rush_bid_confirmations;
alter table public.rush_candidates
  drop column if exists bid_state,
  drop column if exists bid_extended_at,
  drop column if exists bid_extended_by,
  drop column if exists bid_expires_at,
  drop column if exists bid_acceptance_recorded_at,
  drop column if exists bid_acceptance_recorded_by,
  drop column if exists bid_answered_at,
  drop column if exists bid_answered_by,
  drop column if exists bid_answered_via,
  drop column if exists bid_rescind_reason,
  drop column if exists bid_invite_sent;
drop index if exists public.rush_settings_new_member_role_idx;
drop index if exists public.rush_settings_contacts_group_idx;
drop index if exists public.rush_settings_card_channel_idx;
alter table public.rush_settings
  drop column if exists bid_expiry_days,
  drop column if exists new_member_role_id,
  drop column if exists contacts_group_id,
  drop column if exists card_channel_id;
```
