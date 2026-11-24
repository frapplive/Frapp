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
