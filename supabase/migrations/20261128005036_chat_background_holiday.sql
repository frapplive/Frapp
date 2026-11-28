-- The Holiday chat background (#6149). A new built-in key, `holiday`, any
-- chapter or channel may pick by hand, and a chapter switch for the season:
-- from Dec 1 to Dec 26 a chapter whose default is Plain shows Holiday instead,
-- unless an officer turned the season off. The window is computed by the
-- clients from the viewer's local date, so nothing here changes with the
-- calendar. Behavior: spec/behavior/chat/README.md § Chat backgrounds.
--
--   chapters.chat_background_holiday   whether the season's Holiday shows for
--                                      this chapter. Not null; on for every
--                                      chapter until an officer turns it off.
--
-- The CHECK constraints mirror CHAT_BACKGROUND_KEYS in @repo/validation, as
-- 20261110235500_chat_backgrounds.sql set them, plus 'holiday'. The new column
-- has a constant default, so adding it rewrites no row.

alter table public.chapters
  add column if not exists chat_background_holiday boolean not null default true;

alter table public.chapters
  drop constraint if exists chapters_chat_background_key,
  add constraint chapters_chat_background_key check (
    chat_background in ('plain', 'gold-glow', 'midnight', 'game-day', 'letters', 'holiday', 'photo')
  );

alter table public.chat_channels
  drop constraint if exists chat_channels_background_key,
  add constraint chat_channels_background_key check (
    background is null
    or background in ('plain', 'gold-glow', 'midnight', 'game-day', 'letters', 'holiday', 'photo')
  );
