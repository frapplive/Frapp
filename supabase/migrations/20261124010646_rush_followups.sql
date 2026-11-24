-- The chapter recruitment pipeline, slice 2 of 3 (#5934, epic #5833):
-- logged contacts, a prospect's owner, follow-ups and the stale alert.
-- Behavior: spec/behavior/rush.md § Pipeline (Contacts, owner and follow-ups).
--
-- Like slice 1's tables (20261123215153_rush_pipeline.sql), everything here
-- is chapter-private: RLS on with no policies, reached only through the API's
-- service-role client, which scopes every read to the caller's chapter and
-- checks the `rush:*` keys.

-- One prospect's owner, the last contact and the one open follow-up live on
-- the candidate row, so the pipeline read stays one query per table.
--
-- `last_contact_on` / `last_contact_by` mirror the newest row of
-- `rush_candidate_contacts` by `contacted_on`. The API moves them with a
-- conditional update (only forward), so two contacts logged at once keep the
-- later date.
--
-- A follow-up is a day (`follow_up_on`), what to do (`follow_up_note`) and who
-- it is for (`follow_up_user_id`). Logging any contact clears all three.
alter table public.rush_candidates
  add column if not exists owner_id uuid references public.users(id) on delete set null,
  add column if not exists last_contact_on date,
  add column if not exists last_contact_by uuid references public.users(id) on delete set null,
  add column if not exists follow_up_on date,
  add column if not exists follow_up_note text
    constraint rush_candidates_follow_up_note_len
    check (follow_up_note is null or char_length(follow_up_note) <= 120),
  add column if not exists follow_up_user_id uuid references public.users(id) on delete set null;

-- The follow-up sweep reads every follow-up coming due across chapters each
-- hour; the stale sweep reads every owned prospect.
create index if not exists rush_candidates_follow_up_on_idx
  on public.rush_candidates (follow_up_on)
  where follow_up_on is not null;
create index if not exists rush_candidates_owner_idx
  on public.rush_candidates (owner_id)
  where owner_id is not null;

create table if not exists public.rush_candidate_contacts (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null,
  chapter_id uuid not null,
  -- Kept when the member deletes their account, as their notes are.
  logged_by uuid not null references public.users(id) on delete restrict,
  kind text not null
    check (kind in ('text', 'call', 'in_person', 'social_dm', 'email', 'event')),
  contacted_on date not null,
  note text check (note is null or char_length(btrim(note)) between 1 and 500),
  created_at timestamptz not null default now(),
  foreign key (candidate_id, chapter_id)
    references public.rush_candidates (id, chapter_id) on delete cascade
);

create index if not exists rush_candidate_contacts_candidate_idx
  on public.rush_candidate_contacts (candidate_id, contacted_on desc, created_at desc);
create index if not exists rush_candidate_contacts_chapter_idx
  on public.rush_candidate_contacts (chapter_id);
create index if not exists rush_candidate_contacts_logged_by_idx
  on public.rush_candidate_contacts (logged_by);

alter table public.rush_candidate_contacts enable row level security;

comment on table public.rush_candidate_contacts is
  'Contacts members logged with a recruitment candidate (text, call, in person...). The optional note reads like a recruitment note: rush:read_notes, never to the candidate themself (#5934).';

-- A chapter's recruitment settings that are not stages or tags. One row per
-- chapter, written on the first save; no row reads as the defaults.
create table if not exists public.rush_settings (
  chapter_id uuid primary key references public.chapters(id) on delete cascade,
  -- Days without a logged contact before an open prospect needs a follow-up.
  stale_days integer not null default 7 check (stale_days between 1 and 60),
  updated_at timestamptz not null default now()
);

alter table public.rush_settings enable row level security;

comment on table public.rush_settings is
  'A chapter''s recruitment settings: the stale-days threshold (#5934).';

-- The two new sweeps claim their pushes in the shared dispatch log.
alter table scheduled_notification_dispatches
  drop constraint if exists scheduled_notification_dispatches_entity_type_check;
alter table scheduled_notification_dispatches
  add constraint scheduled_notification_dispatches_entity_type_check
  check (entity_type in ('INVOICE', 'TASK', 'EVENT', 'POLL', 'RUSH_CANDIDATE'));
alter table scheduled_notification_dispatches
  drop constraint if exists scheduled_notification_dispatches_threshold_check;
alter table scheduled_notification_dispatches
  add constraint scheduled_notification_dispatches_threshold_check
  check (
    threshold in (
      'DUE_SOON', 'OVERDUE', 'AUTO_ABSENT', 'EXPIRED', 'EVENT_REMINDER',
      'FOLLOW_UP', 'STALE'
    )
  );

-- Account deletion -------------------------------------------------------------

-- `anonymize_user` is redefined in full from
-- `20261123215153_rush_pipeline.sql`; the only change is clearing the
-- member's recruitment ownership and follow-ups. Same signature, so its
-- grants are kept.
create or replace function anonymize_user(
  p_user_id uuid,
  p_rescan_cards boolean default false
)
returns setof users
language plpgsql
security invoker
-- Pinned explicitly: the PGlite search_path guard (#830) fails this
-- redefinition without it.
set search_path = public, pg_temp
as $$
declare
  v_user users;
  v_was_tombstoned boolean;
begin
  if p_user_id = '00000000-0000-0000-0000-000000000000'::uuid then
    raise exception 'anonymize_user: refusing to anonymize the system user'
      using errcode = 'invalid_parameter_value';
  end if;

  -- #2878: the link lock of every chapter the member linked in, taken BEFORE
  -- the user row below, in the order the import trigger and the link
  -- functions take them (link lock, then a key-share on `users` through the
  -- sender foreign key). Taken after, the two would deadlock. Holding it, an
  -- import batch whose trigger already attached a row to the member commits
  -- before the scrub reads, and one that has not yet read the link finds it
  -- gone. A link made in a chapter not listed here waits on the user row and
  -- then refuses the tombstone (`link_discord_author`). The one window left,
  -- an import in such a chapter attaching a row between that link committing
  -- and this scrub, is closed by the deletion flow's second, converging call
  -- (`AccountDeletionService`, `p_rescan_cards`), which runs this scrub again.
  perform pg_advisory_xact_lock(discord_author_link_lock_key(l.chapter_id))
     from (
       select distinct chapter_id from discord_author_links
        where user_id = p_user_id
        order by chapter_id
     ) l;

  select * into v_user from users where id = p_user_id for update;
  if not found then
    return; -- unknown user: empty result, the API maps this to 404
  end if;

  v_was_tombstoned := v_user.deleted_at is not null;

  update users
     set email = 'deleted+' || p_user_id::text || '@anonymized.invalid',
         display_name = 'Deleted User',
         avatar_url = null,
         bio = null,
         graduation_year = null,
         current_city = null,
         current_company = null,
         major = null,
         phone = null,
         active_chapter_id = null,
         deleted_at = coalesce(v_user.deleted_at, now())
   where id = p_user_id
   returning * into v_user;

  delete from members where user_id = p_user_id;
  delete from user_settings where user_id = p_user_id;
  delete from push_tokens where user_id = p_user_id;
  delete from notifications where user_id = p_user_id;
  delete from notification_preferences where user_id = p_user_id;
  delete from chat_notification_preferences where user_id = p_user_id;
  delete from channel_read_receipts where user_id = p_user_id;
  delete from chat_message_bookmarks where user_id = p_user_id;
  -- Reminders (#4957): private to the member, like bookmarks.
  delete from chat_message_reminders where user_id = p_user_id;
  delete from chat_member_blocks where blocker_user_id = p_user_id;
  delete from chat_sidebar_preferences where user_id = p_user_id;
  delete from chat_sidebar_pins where user_id = p_user_id;
  -- Message threads (#3785): which threads the member follows or muted, and
  -- how far they read each. Per-user current state, like the sidebar rows.
  delete from chat_thread_follows where user_id = p_user_id;
  -- Activity links (#3897): the member's own Done and Hide states.
  delete from chat_link_member_states where user_id = p_user_id;
  -- Documents (#3934): the member's own starred folders and files.
  delete from chapter_document_stars where user_id = p_user_id;
  -- Activity unread dots (#4173): which Activity items the member opened.
  delete from activity_item_reads where user_id = p_user_id;
  delete from activity_unread_starts where user_id = p_user_id;
  -- Activity cards (#5520): how the member ordered and hid their cards.
  delete from activity_layouts where user_id = p_user_id;
  -- GIF favorites (#5772): the member's own starred GIFs.
  delete from gif_favorites where user_id = p_user_id;
  -- Important strip (#4186): which Important messages the member has seen.
  delete from chat_message_important_seen where user_id = p_user_id;
  -- AI consent (#4308): the member's answers on the AI sheet. Deleting an
  -- account counts as turning AI off (spec/behavior/ai.md § Consent).
  delete from user_ai_consents where user_id = p_user_id;
  -- Member nudges (#4781): the member's cards and their own switch.
  delete from member_nudges where user_id = p_user_id;
  delete from member_nudge_settings where user_id = p_user_id;
  -- AI suggestions (#4309): the member's words leave every suggestion that
  -- quotes them, as a No on the sheet does. Decided rows hold no quote.
  update ai_suggestions set quote = null, quote_author_id = null
   where quote_author_id = p_user_id;
  delete from rush_candidate_votes where voter_id = p_user_id;
  -- Recruitment ratings (#5924): one member's own 1-to-5 score, like a
  -- ballot. Notes they wrote stay, as their chat messages do.
  delete from rush_candidate_ratings where rater_id = p_user_id;
  -- Recruitment owners and follow-ups (#5934): a deleted member stops owning
  -- prospects, and a follow-up set for them is cleared, so no push names a
  -- prospect to an account that no longer exists. Contacts they logged stay,
  -- as their notes do, under "Deleted User".
  update rush_candidates set owner_id = null where owner_id = p_user_id;
  update rush_candidates
     set follow_up_on = null, follow_up_note = null, follow_up_user_id = null
   where follow_up_user_id = p_user_id;
  delete from study_sessions where user_id = p_user_id;

  -- #2878: the Discord identity on imported rows attributed to this member.
  -- Unconditional (not under the rescan gate below): it is idempotent, and a
  -- retry after a link made before this migration must still reach it.

  -- Reports on those rows keep the reported words (data-retention.md), but
  -- not the Discord name: the officer queue falls back to it when the sender
  -- is off the roster, and a deleted member always is.
  update chat_message_reports r
     set reported_author_name = null
   where r.reported_author_name is not null
     and (r.reported_sender_id = p_user_id
       or exists (
         select 1 from chat_messages m
          where m.id = r.message_id
            and m.kind = 'imported'
            and m.sender_id = p_user_id
       ));

  update chat_messages
     set author_name = null,
         author_avatar_path = null,
         author_external_id = null,
         payload = case
           when payload ? 'author_username' then payload - 'author_username'
           else payload
         end
   where kind = 'imported'
     and sender_id = p_user_id
     and (author_name is not null
       or author_avatar_path is not null
       or author_external_id is not null
       or payload ? 'author_username');
  delete from discord_author_links where user_id = p_user_id;

  if not v_was_tombstoned or p_rescan_cards then
    update chat_messages
       set payload = case
             when payload is null then payload
             else payload
               || case when kind = 'task' and payload->>'assigner_user_id' = p_user_id::text
                       then jsonb_build_object('assigner_name', 'Deleted User')
                       else '{}'::jsonb end
               || case when kind = 'task' and payload->>'assignee_user_id' = p_user_id::text
                       then jsonb_build_object('assignee_name', 'Deleted User')
                       else '{}'::jsonb end
               || case when kind = 'points' and payload->>'actor_user_id' = p_user_id::text
                       then jsonb_build_object('actor_name', 'Deleted User')
                       else '{}'::jsonb end
               || case when kind = 'points' and payload->>'recipient_user_id' = p_user_id::text
                       then jsonb_build_object('recipient_name', 'Deleted User')
                       else '{}'::jsonb end
           end,
           content = case
             when kind = 'task' and payload->>'assignee_user_id' = p_user_id::text
               then anonymize_card_content(content, payload->>'assignee_name')
             when kind = 'points' and payload->>'recipient_user_id' = p_user_id::text
               then anonymize_card_content(content, payload->>'recipient_name')
             when kind = 'event' and sender_id = p_user_id
               then regexp_replace(content, '^(.*?)( scheduled ")', 'Deleted User\2')
             else content
           end
     where (kind = 'task' and (payload->>'assigner_user_id' = p_user_id::text
                            or payload->>'assignee_user_id' = p_user_id::text))
        or (kind = 'points' and (payload->>'actor_user_id' = p_user_id::text
                              or payload->>'recipient_user_id' = p_user_id::text))
        or (kind = 'event' and sender_id = p_user_id);

    -- Forwarded copies (#4864): a forward keeps the name its author had at
    -- forward time, a display-name snapshot like the cards' above, so it is
    -- rewritten the same way (spec/behavior/data-retention.md). The words
    -- stay, as the member's own messages do.
    update chat_messages
       set forwarded_from = jsonb_set(
             forwarded_from, '{author_name}', to_jsonb('Deleted User'::text)
           )
     where forwarded_from is not null
       and forwarded_from ->> 'sender_id' = p_user_id::text
       and forwarded_from ->> 'author_name' is distinct from 'Deleted User';

    update chat_message_reports r
       set reported_content = m.content
      from chat_messages m
     where r.message_id = m.id
       and ((m.kind = 'task' and (m.payload->>'assigner_user_id' = p_user_id::text
                               or m.payload->>'assignee_user_id' = p_user_id::text))
         or (m.kind = 'points' and (m.payload->>'actor_user_id' = p_user_id::text
                                 or m.payload->>'recipient_user_id' = p_user_id::text))
         or (m.kind = 'event' and m.sender_id = p_user_id));
  end if;

  return next v_user;
end;
$$;
