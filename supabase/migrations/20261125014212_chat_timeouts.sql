-- Chat timeouts (#6006, spec/behavior/chat/README.md § Timeouts).
--
-- An officer holding `members:timeout` stops a member ranked below them from
-- posting or reacting in the chapter's channels for 5 minutes, an hour, a day
-- or a week. DMs and group DMs are unaffected, and the member still reads.
--
-- The timeout lives on the member row rather than in a table of its own: the
-- API's channel check (`ChannelAccessService.assertChannelAccess`) already
-- reads that row on every channel write, so enforcing a timeout costs the chat
-- hot path no query. `members` has no policy a member's own token can read
-- (only the auth hook's), so the reason stays between the API, the member and
-- the officers it serves it to.
--
-- A timeout past its time no longer refuses anything: the API compares
-- `chat_timeout_until` with the clock. The API's minute sweep clears the
-- columns afterwards and sends the member the "it's over" push.

alter table public.members
  add column if not exists chat_timeout_until timestamptz,
  add column if not exists chat_timeout_reason text,
  add column if not exists chat_timeout_by uuid
    references public.users(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'members_chat_timeout_reason_len'
  ) then
    alter table public.members
      add constraint members_chat_timeout_reason_len
        check (chat_timeout_reason is null or char_length(chat_timeout_reason) <= 200);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'members_chat_timeout_reason_needs_until'
  ) then
    alter table public.members
      add constraint members_chat_timeout_reason_needs_until
        check (chat_timeout_reason is null or chat_timeout_until is not null);
  end if;
end $$;

-- The sweep reads only the members whose timeout has a time at all.
create index if not exists members_chat_timeout_until
  on public.members (chat_timeout_until)
  where chat_timeout_until is not null;

comment on column public.members.chat_timeout_until is
  'Until when this member cannot post or react in the chapter''s channels (#6006). Null, or a time already past, is no timeout. DMs are unaffected.';
comment on column public.members.chat_timeout_reason is
  'The optional reason the officer gave, shown to the member and to officers who can time out. Up to 200 characters.';
comment on column public.members.chat_timeout_by is
  'The users.id of the officer who set the timeout.';

-- ---------------------------------------------------------------------------
-- Who can time out: `members:timeout` for whoever already manages channels.
-- ---------------------------------------------------------------------------
--
-- `channels:manage` holders can already delete anyone's message, so they are
-- the officers a chapter already trusts with moderation. Existing chapters:
-- every tier holding it gets `members:timeout`, and so does any other role
-- holding it (as an override, which is how a role outside the tiers, or one
-- switched on beyond its tier, holds a permission). The President's `*`
-- already covers it. New chapters get it in their top two starting tiers
-- (`OFFICER_DEFAULT_PERMISSIONS`), the same ones that manage channels.

update public.role_tiers
   set permissions = permissions || array['members:timeout']
 where 'channels:manage' = any (permissions)
   and not ('members:timeout' = any (permissions));

update public.roles
   set permission_overrides =
         permission_overrides || jsonb_build_object('members:timeout', true)
 where 'channels:manage' = any (permissions)
   and not ('*' = any (permissions))
   and not ('members:timeout' = any (permissions))
   and not (permission_overrides ? 'members:timeout');
