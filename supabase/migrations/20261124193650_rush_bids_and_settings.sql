-- The chapter recruitment pipeline, slice 3 of 3 (#5973, epic #5833): the
-- rest of the Recruitment settings page.
-- Behavior: spec/behavior/ifc-recruitment.md § Where the chapter's settings
-- live, and spec/behavior/rush.md § Settings.
--
-- Like the earlier slices' tables, `rush_settings` is chapter-private: RLS on
-- with no policies, reached only through the API's service-role client, which
-- checks each picked row belongs to the caller's chapter.

-- Three picks a `rush:manage` holder makes on the Recruitment settings page.
-- Each is cleared, not cascaded, when what it names is deleted, so deleting a
-- role, a group or a channel never deletes the chapter's settings.
--
-- - `new_member_role_id`: the role an accepted PNM's invite carries. Null
--   means the default, the first role in the chapter's New members tier,
--   which the API works out on read.
-- - `contacts_group_id`: the recruitment contacts Group, told about each new
--   interest-form submission along with `rush:manage` holders.
-- - `card_channel_id`: where an interest-form submission's candidate card is
--   posted; null posts no card.
alter table public.rush_settings
  add column if not exists new_member_role_id uuid
    references public.roles(id) on delete set null,
  add column if not exists contacts_group_id uuid
    references public.chapter_groups(id) on delete set null,
  add column if not exists card_channel_id uuid
    references public.chat_channels(id) on delete set null;

-- The foreign keys above are each read when their row is deleted.
create index if not exists rush_settings_new_member_role_idx
  on public.rush_settings (new_member_role_id)
  where new_member_role_id is not null;
create index if not exists rush_settings_contacts_group_idx
  on public.rush_settings (contacts_group_id)
  where contacts_group_id is not null;
create index if not exists rush_settings_card_channel_idx
  on public.rush_settings (card_channel_id)
  where card_channel_id is not null;

comment on table public.rush_settings is
  'A chapter''s recruitment settings: the stale-days threshold (#5934), the new-member role, the recruitment contacts Group and the card channel (#5973).';

-- How long a bid stays open before it expires (Winston, 2026-11-24): a
-- chapter setting until councils land, when the council's bid window becomes
-- its ceiling (`ifc-recruitment.md` § Bids).
alter table public.rush_settings
  add column if not exists bid_expiry_days integer not null default 7
    constraint rush_settings_bid_expiry_days_range
    check (bid_expiry_days between 1 and 30);

-- Bids -------------------------------------------------------------------------
--
-- A bid's full state (`ifc-recruitment.md` § Bids). `bid_status` keeps its two
-- values for shipped clients (§ Compatibility with shipped clients): the API
-- writes both, `extended` and `accepted` reading as `extended` there and every
-- other state as `none`.
--
-- A recorded acceptance stays `extended` until the PNM or a `rush:manage`
-- holder confirms it (Paul, #4218): `bid_acceptance_recorded_at` and `_by`
-- mark it, and a bid that expires first expires as usual.
alter table public.rush_candidates
  add column if not exists bid_state text not null default 'none'
    constraint rush_candidates_bid_state_check
    check (bid_state in ('none', 'extended', 'accepted', 'declined', 'expired', 'rescinded')),
  add column if not exists bid_extended_at timestamptz,
  add column if not exists bid_extended_by uuid
    references public.users(id) on delete set null,
  add column if not exists bid_expires_at timestamptz,
  add column if not exists bid_acceptance_recorded_at timestamptz,
  add column if not exists bid_acceptance_recorded_by uuid
    references public.users(id) on delete set null,
  -- Who answered or closed the bid and when: the member who recorded a
  -- decline, confirmed an acceptance or rescinded; null for the PNM's own
  -- confirmation and for an expiry, which `bid_answered_via` tells apart.
  add column if not exists bid_answered_at timestamptz,
  add column if not exists bid_answered_by uuid
    references public.users(id) on delete set null,
  add column if not exists bid_answered_via text
    constraint rush_candidates_bid_answered_via_check
    check (bid_answered_via is null or bid_answered_via in ('member', 'pnm', 'system')),
  add column if not exists bid_rescind_reason text
    constraint rush_candidates_bid_rescind_reason_len
    check (bid_rescind_reason is null or char_length(btrim(bid_rescind_reason)) between 1 and 200);

-- Every bid out today is `extended`.
update public.rush_candidates
   set bid_state = 'extended'
 where bid_status = 'extended' and bid_state = 'none';

-- The expiry sweep reads every open bid past its day.
create index if not exists rush_candidates_bid_expires_idx
  on public.rush_candidates (bid_expires_at)
  where bid_state = 'extended';
create index if not exists rush_candidates_bid_extended_by_idx
  on public.rush_candidates (bid_extended_by) where bid_extended_by is not null;
create index if not exists rush_candidates_bid_recorded_by_idx
  on public.rush_candidates (bid_acceptance_recorded_by)
  where bid_acceptance_recorded_by is not null;
create index if not exists rush_candidates_bid_answered_by_idx
  on public.rush_candidates (bid_answered_by) where bid_answered_by is not null;

-- The one-tap confirmation of a recorded acceptance (Winston, 2026-11-24).
-- The PNM's email lives here, apart from the candidate, because members never
-- see it: it is stored only to send the confirm link and the accepted PNM's
-- invite, and the row is deleted once the bid is answered or expires. The
-- link carries a random token; only its SHA-256 is stored.
create table if not exists public.rush_bid_confirmations (
  candidate_id uuid primary key,
  chapter_id uuid not null,
  email text check (email is null or char_length(email) between 3 and 320),
  token_hash text unique,
  created_at timestamptz not null default now(),
  foreign key (candidate_id, chapter_id)
    references public.rush_candidates (id, chapter_id) on delete cascade
);

create index if not exists rush_bid_confirmations_chapter_idx
  on public.rush_bid_confirmations (chapter_id);

alter table public.rush_bid_confirmations enable row level security;

comment on table public.rush_bid_confirmations is
  'A recorded bid acceptance waiting for the PNM: their email (never shown to members) and the one-tap link''s token hash. Deleted once the bid is answered or expires (#5973).';

-- Expires every open bid past its day, in one statement, so two API instances
-- running the sweep at once expire each bid once. A recorded acceptance nobody
-- confirmed expires with it, and its confirmation (with the email) goes.
create or replace function public.expire_rush_bids(p_now timestamptz default now())
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  with expired as (
    update rush_candidates
       set bid_state = 'expired',
           bid_status = 'none',
           bid_answered_at = p_now,
           bid_answered_by = null,
           bid_answered_via = 'system',
           bid_acceptance_recorded_at = null,
           bid_acceptance_recorded_by = null
     where bid_state = 'extended'
       and bid_expires_at is not null
       and bid_expires_at <= p_now
    returning id
  ), gone as (
    delete from rush_bid_confirmations c
     using expired e
     where c.candidate_id = e.id
  )
  select count(*) into v_count from expired;
  return v_count;
end;
$$;

revoke all on function public.expire_rush_bids(timestamptz) from public, anon, authenticated;
grant execute on function public.expire_rush_bids(timestamptz) to service_role;
