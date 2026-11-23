-- The chapter recruitment pipeline, slice 1 of 3 (#5924, epic #5833):
-- stage categories with default stages, notes, tags and ratings.
-- Behavior: spec/behavior/rush.md § Pipeline; table shapes:
-- spec/architecture/school-layer.md § 2.5 (`rush_stages`).
--
-- Every table is chapter-private. RLS is on with no policies, the convention
-- for the other rush tables (20260910020000_rush_candidates.sql): the API
-- reaches them only through the service-role client, which scopes every read
-- to the caller's active chapter and checks the `rush:*` keys.
--
-- Default stages are not backfilled here. The API writes a chapter's six
-- defaults the first time it reads its stages (`RushPipelineService`), so a
-- chapter made later gets them the same way, and the list lives in one place
-- (`DEFAULT_RUSH_STAGES` in @repo/validation). Each default stage's key is
-- its category's, so every existing candidate (`stage = 'new'`) is already in
-- the New stage.

-- Composite keys the child tables point at, so a tag, note or rating can't
-- join a candidate or tag from another chapter.
alter table public.rush_candidates
  add constraint rush_candidates_id_chapter unique (id, chapter_id);

-- Why a candidate sits in a Closed stage. Null everywhere else; the API
-- clears it on any move out of Closed. The last three are set only by the
-- system, in later slices.
alter table public.rush_candidates
  add column if not exists closed_reason text
    constraint rush_candidates_closed_reason_check
    check (closed_reason in (
      'not_interested', 'not_eligible', 'chapter_passed', 'no_response',
      'accepted_elsewhere', 'withdrew', 'deleted_info'
    ));

create table if not exists public.rush_stages (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  -- What rush_candidates.stage holds. Never changes once written, so a
  -- rename can't strand a candidate.
  key text not null check (key ~ '^[a-z0-9_]{1,64}$'),
  label text not null check (char_length(btrim(label)) between 1 and 40),
  category text not null
    check (category in ('new', 'contacted', 'met', 'engaged', 'bid_ready', 'closed')),
  position integer not null check (position between 0 and 1000),
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (chapter_id, key)
);

create index if not exists rush_stages_chapter_position_idx
  on public.rush_stages (chapter_id, position);

alter table public.rush_stages enable row level security;

comment on table public.rush_stages is
  'A chapter''s recruitment stages, each in one of six fixed categories (#5924). Contract: spec/behavior/rush.md § Pipeline.';

create table if not exists public.rush_tags (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 40),
  created_at timestamptz not null default now(),
  constraint rush_tags_id_chapter unique (id, chapter_id)
);

-- One "Legacy" per chapter, whatever its case.
create unique index if not exists rush_tags_chapter_label_key
  on public.rush_tags (chapter_id, lower(btrim(label)));

alter table public.rush_tags enable row level security;

comment on table public.rush_tags is
  'A chapter''s own recruitment tags ("legacy", "athlete"), private to it (#5924).';

create table if not exists public.rush_candidate_tags (
  candidate_id uuid not null,
  tag_id uuid not null,
  chapter_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (candidate_id, tag_id),
  foreign key (candidate_id, chapter_id)
    references public.rush_candidates (id, chapter_id) on delete cascade,
  foreign key (tag_id, chapter_id)
    references public.rush_tags (id, chapter_id) on delete cascade
);

create index if not exists rush_candidate_tags_chapter_idx
  on public.rush_candidate_tags (chapter_id);
create index if not exists rush_candidate_tags_tag_idx
  on public.rush_candidate_tags (tag_id);

alter table public.rush_candidate_tags enable row level security;

create table if not exists public.rush_candidate_notes (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null,
  chapter_id uuid not null,
  author_id uuid not null references public.users(id) on delete restrict,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (candidate_id, chapter_id)
    references public.rush_candidates (id, chapter_id) on delete cascade
);

create index if not exists rush_candidate_notes_candidate_idx
  on public.rush_candidate_notes (candidate_id, created_at desc);
create index if not exists rush_candidate_notes_chapter_idx
  on public.rush_candidate_notes (chapter_id);
create index if not exists rush_candidate_notes_author_idx
  on public.rush_candidate_notes (author_id);

alter table public.rush_candidate_notes enable row level security;

comment on table public.rush_candidate_notes is
  'Members'' notes on a recruitment candidate. Read with rush:read_notes, written with rush:notes; never shown to the candidate themself, on the chat card or in a push (#5924).';

create table if not exists public.rush_candidate_ratings (
  candidate_id uuid not null,
  chapter_id uuid not null,
  rater_id uuid not null references public.users(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (candidate_id, rater_id),
  foreign key (candidate_id, chapter_id)
    references public.rush_candidates (id, chapter_id) on delete cascade
);

create index if not exists rush_candidate_ratings_chapter_idx
  on public.rush_candidate_ratings (chapter_id);
create index if not exists rush_candidate_ratings_rater_idx
  on public.rush_candidate_ratings (rater_id);

alter table public.rush_candidate_ratings enable row level security;

comment on table public.rush_candidate_ratings is
  'One 1-to-5 fit rating per member per candidate. Only the average and the count are ever returned, never who rated what (#5924).';

-- Account deletion -------------------------------------------------------------

-- `anonymize_user` is redefined in full from
-- `20261121001457_gif_favorites.sql`; the only change is the delete of the
-- member's recruitment ratings beside their ballots. Same signature, so its
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
