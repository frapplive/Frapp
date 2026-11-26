/**
 * Chapter settings → Chapter, the rules both apps' forms follow (#6027).
 *
 * Web's Chapter tab (`apps/web/components/settings/settings-org-tab.tsx`,
 * `settings-chapter-mark-card.tsx`) and the phone's Chapter settings
 * (`apps/mobile/app/(app)/chapter-settings.tsx` and the pages its rows open)
 * edit the same profile, mark, identity, type and vocabulary through the same
 * two routes: `PATCH /v1/chapters/current` for the profile and the audited
 * `PATCH /v1/chapters/current/config` for the rest. What each Save sends, and
 * what each row says its value is, lives here once, so the two apps can't
 * drift into storing different things for the same edit.
 *
 * Pure: no React, no react-query. A subpath export, like `./chapter-identity`.
 */

import {
  DEFAULT_TIER_WORD,
  VOCABULARY_DEFAULTS,
  getArchetype,
  orgHidingGreekLettersIn,
  type Archetype,
  type ArchetypeKey,
} from "@repo/org-archetypes";
import {
  greekLettersShown,
  resolveChapterMark,
  type PatchChapterConfig,
} from "@repo/validation";
import { parseFoundedYear } from "./chapter-identity";

/** The `branding` keys the Chapter tab reads and writes. */
export type ChapterTabBranding = {
  greek_letters?: string;
  short_name?: string;
  show_greek_letters?: boolean;
  designation?: string;
  school_short?: string;
  founded_at?: number;
};

/**
 * The stored `branding` object, each key kept only when it has the type the
 * form expects. Read key by key, not through a schema: a whole-object parse
 * emptied every field when one key was malformed (#2844).
 */
export function readChapterBranding(raw: unknown): ChapterTabBranding {
  const b = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const text = (value: unknown) =>
    typeof value === "string" ? value : undefined;
  return {
    greek_letters: text(b.greek_letters),
    short_name: text(b.short_name),
    show_greek_letters:
      typeof b.show_greek_letters === "boolean"
        ? b.show_greek_letters
        : undefined,
    designation: text(b.designation),
    school_short: text(b.school_short),
    founded_at: typeof b.founded_at === "number" ? b.founded_at : undefined,
  };
}

/** Whether the chapter's organization never displays its letters (FIJI). */
export function chapterLettersHidden(chapterName: string): boolean {
  return orgHidingGreekLettersIn(chapterName) !== undefined;
}

// ── Profile ─────────────────────────────────────────────────────────────

/** The chapter profile, as stored and as typed. */
export type ChapterProfileFields = {
  name: string;
  university: string;
  donation_url: string;
};

/** The `PATCH /v1/chapters/current` body the profile's Save sends. */
export type ChapterProfileSaveBody = {
  name?: string;
  university?: string;
  donation_url?: string;
};

/**
 * What the profile's Save sends: only the fields the officer changed,
 * trimmed, so a name or university stored before the API's rule
 * (`ChapterNameRules`, the onboarding wizard's 3 to 200 characters) never
 * refuses an edit of the donation link.
 *
 * A cleared name or university is sent as typed, so the API's refusal names
 * the minimum; it used to be dropped, and the save said "saved" while the old
 * name stayed. A cleared donation link is still left out, because the API
 * reads an empty one as an invalid URL and has no way to clear it.
 */
export function chapterProfileSaveBody(
  stored: ChapterProfileFields,
  draft: ChapterProfileFields,
): ChapterProfileSaveBody {
  const body: ChapterProfileSaveBody = {};
  const name = draft.name.trim();
  if (name !== stored.name.trim()) body.name = name;
  const university = draft.university.trim();
  if (university !== stored.university.trim()) body.university = university;
  const donation = draft.donation_url.trim();
  if (donation && donation !== stored.donation_url.trim()) {
    body.donation_url = donation;
  }
  return body;
}

/** Whether any profile field differs from what is stored: Save waits on it. */
export function chapterProfileChanged(
  stored: ChapterProfileFields,
  draft: ChapterProfileFields,
): boolean {
  return (
    draft.name !== stored.name ||
    draft.university !== stored.university ||
    draft.donation_url !== stored.donation_url
  );
}

// ── Chapter mark ────────────────────────────────────────────────────────

/** The mark page's two fields, as stored. */
export type ChapterMarkDraft = { shortName: string; showLetters: boolean };

export function chapterMarkDraftOf(
  branding: ChapterTabBranding,
): ChapterMarkDraft {
  return {
    shortName: branding.short_name ?? "",
    showLetters: greekLettersShown(branding),
  };
}

/** Whether the mark page holds an edit: the phone's Save waits on it. */
export function chapterMarkChanged(
  draft: ChapterMarkDraft,
  branding: ChapterTabBranding,
): boolean {
  const stored = chapterMarkDraftOf(branding);
  return (
    draft.shortName.trim() !== stored.shortName.trim() ||
    draft.showLetters !== stored.showLetters
  );
}

/**
 * What the mark's Save sends: the letters switch, always, and the short name
 * when there is one to keep or to clear. The config PATCH deep-merges, so a
 * left-out key keeps its stored value and an empty string is how a cleared
 * field is removed. A chapter whose organization hides its letters writes
 * them off on every save.
 */
export function chapterMarkBrandingDiff(input: {
  shortName: string;
  showLetters: boolean;
  lettersHidden: boolean;
  stored: ChapterTabBranding;
}): ChapterTabBranding {
  const diff: ChapterTabBranding = {
    show_greek_letters: input.showLetters && !input.lettersHidden,
  };
  const trimmed = input.shortName.trim();
  if (trimmed || input.stored.short_name) diff.short_name = trimmed;
  return diff;
}

/**
 * The Chapter mark row's value: "Logo", the text the mark draws, or
 * "Initials", read through `resolveChapterMark` the way every surface reads
 * the mark.
 */
export function chapterMarkValue(input: {
  logoUrl: string | null | undefined;
  branding: ChapterTabBranding;
  name: string;
}): string {
  const shown = resolveChapterMark({
    logoUrl: input.logoUrl,
    branding: {
      ...input.branding,
      show_greek_letters:
        input.branding.show_greek_letters !== false &&
        !chapterLettersHidden(input.name),
    },
    name: input.name,
  });
  if (shown.logoUrl) return "Logo";
  return shown.source === "initials" ? "Initials" : shown.text;
}

// ── Identity & founding ─────────────────────────────────────────────────

export type ChapterIdentityDraft = {
  greekLetters: string;
  designation: string;
  schoolShort: string;
  foundedYear: string;
};

export function chapterIdentityDraftOf(
  branding: ChapterTabBranding,
): ChapterIdentityDraft {
  return {
    greekLetters: branding.greek_letters ?? "",
    designation: branding.designation ?? "",
    schoolShort: branding.school_short ?? "",
    foundedYear: branding.founded_at != null ? String(branding.founded_at) : "",
  };
}

/**
 * The founded year as typed, checked by the rule the chapter wizards apply,
 * so a year either one stores never blocks this form's save.
 *
 * Empty is fine for a chapter with no year stored, but not as a way to remove
 * one (`cleared`): the config PATCH deep-merges, so an omitted year keeps the
 * stored value, and `null` would store something the branding schema refuses
 * on read. Saying so beats a save that reports success and keeps the year.
 */
export function checkFoundedYear(
  draft: string,
  stored: number | undefined,
): { valid: boolean; cleared: boolean; year: number | undefined } {
  const trimmed = draft.trim();
  const year = parseFoundedYear(trimmed);
  const cleared = trimmed === "" && stored != null;
  const valid = (trimmed === "" && !cleared) || year !== undefined;
  return { valid, cleared, year };
}

/**
 * What Identity & founding's Save sends. A field emptied by the officer is
 * sent as "" so the clear reaches the server (the PATCH deep-merges); a field
 * that was never set stays out. Call only when `checkFoundedYear` is valid.
 */
export function chapterIdentityBrandingDiff(
  draft: ChapterIdentityDraft,
  stored: ChapterTabBranding,
): ChapterTabBranding {
  const diff: ChapterTabBranding = {};
  const text = (value: string, was: string | undefined) => {
    const trimmed = value.trim();
    return trimmed || was ? trimmed : undefined;
  };
  const letters = text(draft.greekLetters, stored.greek_letters);
  if (letters !== undefined) diff.greek_letters = letters;
  const designation = text(draft.designation, stored.designation);
  if (designation !== undefined) diff.designation = designation;
  const schoolShort = text(draft.schoolShort, stored.school_short);
  if (schoolShort !== undefined) diff.school_short = schoolShort;
  const { year } = checkFoundedYear(draft.foundedYear, stored.founded_at);
  if (year !== undefined) diff.founded_at = year;
  return diff;
}

/** Whether Identity & founding holds an edit: the phone's Save waits on it. */
export function chapterIdentityChanged(
  draft: ChapterIdentityDraft,
  branding: ChapterTabBranding,
): boolean {
  const stored = chapterIdentityDraftOf(branding);
  return (Object.keys(stored) as (keyof ChapterIdentityDraft)[]).some(
    (key) => draft[key].trim() !== stored[key].trim(),
  );
}

/** The Identity & founding row's value: the first fact the chapter filled in. */
export function chapterIdentityValue(
  branding: ChapterTabBranding,
  name: string,
): string {
  return (
    branding.designation?.trim() ||
    (branding.founded_at != null
      ? `Founded ${branding.founded_at}`
      : undefined) ||
    branding.school_short?.trim() ||
    (chapterLettersHidden(name) ? undefined : branding.greek_letters?.trim()) ||
    "Not set"
  );
}

// ── Organization type ───────────────────────────────────────────────────

/**
 * What switching the organization type sends: the new type, with its modules
 * and vocabulary reset to that type's defaults. Roles and identity stay.
 */
export function chapterArchetypeSwitchPatch(
  key: ArchetypeKey,
): PatchChapterConfig {
  const next = getArchetype(key);
  return {
    org_archetype: next.key,
    vocabulary: { ...VOCABULARY_DEFAULTS[next.key] },
    enabled_modules: { ...next.modules },
  };
}

// ── Vocabulary ──────────────────────────────────────────────────────────

export type ChapterVocabularyKey =
  "recruitment" | "pledge" | "class" | "order" | "tier";

/** The five words, in the order both apps draw them. */
export const CHAPTER_VOCABULARY_FIELDS: readonly {
  key: ChapterVocabularyKey;
  label: string;
  /** The word a blank field falls back to, shown as its placeholder. */
  placeholder: (archetype: Archetype) => string;
}[] = [
  {
    key: "recruitment",
    label: "Recruitment process",
    placeholder: (a) => a.recruitmentLanguage,
  },
  {
    key: "pledge",
    label: "New member term",
    placeholder: (a) => a.pledgeLanguage,
  },
  { key: "class", label: "Cohort label", placeholder: (a) => a.classLanguage },
  {
    key: "order",
    label: "Member order number",
    placeholder: (a) => a.orderLanguage,
  },
  // What the chapter calls a tier of roles (#4068 decision 5).
  { key: "tier", label: "Role tier", placeholder: () => DEFAULT_TIER_WORD },
];

export type ChapterVocabularyDraft = Record<ChapterVocabularyKey, string>;

export function chapterVocabularyDraftOf(
  vocabulary: Readonly<Record<string, string | undefined>>,
): ChapterVocabularyDraft {
  return {
    recruitment: vocabulary.recruitment ?? "",
    pledge: vocabulary.pledge ?? "",
    class: vocabulary.class ?? "",
    order: vocabulary.order ?? "",
    tier: vocabulary.tier ?? "",
  };
}

/**
 * What Vocabulary's Save sends: every word, trimmed. A cleared field is sent
 * as "", which `memberViewVocabulary` reads as "use the type's word"; leaving
 * it out, as this did before #3939, saved nothing and the old word came back.
 */
export function chapterVocabularyPatch(
  draft: ChapterVocabularyDraft,
): PatchChapterConfig {
  return {
    vocabulary: {
      recruitment: draft.recruitment.trim(),
      pledge: draft.pledge.trim(),
      class: draft.class.trim(),
      order: draft.order.trim(),
      tier: draft.tier.trim(),
    },
  };
}

/** Whether Vocabulary holds an edit: the phone's Save waits on it. */
export function chapterVocabularyChanged(
  draft: ChapterVocabularyDraft,
  vocabulary: Readonly<Record<string, string | undefined>>,
): boolean {
  const stored = chapterVocabularyDraftOf(vocabulary);
  return CHAPTER_VOCABULARY_FIELDS.some(
    ({ key }) => draft[key].trim() !== stored[key].trim(),
  );
}

/** The Vocabulary row's value: "Custom" once any word differs from the type's. */
export function chapterVocabularyValue(
  vocabulary: Readonly<Record<string, string | undefined>>,
  archetypeKey: string,
): "Custom" | "Defaults" {
  const defaults: Record<string, string | undefined> = {
    ...VOCABULARY_DEFAULTS[getArchetype(archetypeKey).key],
  };
  const custom = CHAPTER_VOCABULARY_FIELDS.some(
    ({ key }) => !!vocabulary[key] && vocabulary[key] !== defaults[key],
  );
  return custom ? "Custom" : "Defaults";
}

// ── Birthday posts ──────────────────────────────────────────────────────

/** The channel fields the birthday picker reads from the channel list. */
export type BirthdayChannelRow = {
  id?: string;
  name?: string;
  type?: string;
  archived_at?: string | null;
  is_audit_log?: boolean;
};

/**
 * Whether a channel can take the birthday posts: the chapter's public,
 * unarchived channels, never the audit feed. The API's check
 * (`isBirthdayPostChannel`) refuses anything else.
 */
export function offersBirthdayPosts(
  channel: BirthdayChannelRow,
): channel is BirthdayChannelRow & { id: string; name: string } {
  return (
    !!channel.id &&
    !!channel.name &&
    !channel.archived_at &&
    !channel.is_audit_log &&
    channel.type === "PUBLIC"
  );
}

/**
 * What the birthday picker offers and says, from the channel list as loaded
 * (`undefined` until it has). A saved channel the list no longer offers
 * (archived, made private, gone) still shows as picked and the posts read as
 * paused, since the sweep skips it; only once the list has loaded, since
 * before then it isn't known.
 */
export function birthdayPostChoices(
  rows: readonly BirthdayChannelRow[] | undefined,
  channelId: string | null,
): {
  loaded: boolean;
  channels: (BirthdayChannelRow & { id: string; name: string })[];
  paused: boolean;
  /**
   * The picked channel's name, `#general`, "A removed channel", or "Off";
   * `null` while a picked channel's name isn't known yet (the list loading,
   * or failed), never a guess.
   */
  value: string | null;
} {
  const loaded = rows !== undefined;
  const list = rows ?? [];
  const channels = list.filter(offersBirthdayPosts);
  const paused =
    loaded && channelId !== null && !channels.some((c) => c.id === channelId);
  const name = list.find((c) => c.id === channelId)?.name;
  const value =
    channelId === null
      ? BIRTHDAY_POSTS_COPY.off
      : name
        ? `#${name}`
        : loaded
          ? BIRTHDAY_POSTS_COPY.removedChannel
          : null;
  return { loaded, channels, paused, value };
}

/** Birthday posts' words, on web's card and the phone's row and sheet. */
export const BIRTHDAY_POSTS_COPY = {
  title: "Birthday posts",
  hint: "Frapp wishes members a happy birthday on the day, if they share their birthday with the chapter.",
  label: "Post in",
  off: "Off",
  removedChannel: "A removed channel",
  pausedSuffix: "(paused)",
  paused:
    "Paused: that channel can't take them now. Pick another, or turn them off.",
  when: "Posts go out from 9 AM in each member's own time zone, once.",
  saveFailed: "Couldn't change birthday posts. Try again.",
  /** On the phone's row, which retries on a tap. */
  loadFailed: "Couldn't load the channels. Tap to try again.",
} as const;

// ── Copy ────────────────────────────────────────────────────────────────

/** The words both apps' Chapter tab pages share. */
export const CHAPTER_TAB_COPY = {
  /** Under a form the member's role can't save. Says what, never which key. */
  readOnly: "Your role can't change chapter settings.",
  /**
   * The second line of a phone row its viewer can't open: it says who sets
   * it, so the row doesn't read as broken (design-system README §5).
   */
  rowReadOnly: "Set by an officer with chapter settings access.",
  markHint: (lettersHidden: boolean) =>
    lettersHidden
      ? "Shown in the nav and on mobile's Chat home: your logo, or else your short name."
      : "Shown in the nav and on mobile's Chat home: your logo, or else your short name, or else your Greek letters.",
  showLettersLine:
    "Off hides them wherever Frapp would show them. The letters stay saved under Identity & founding.",
  identityHint: (lettersHidden: boolean) =>
    lettersHidden
      ? "Saving writes an entry to the chapter audit log."
      : "Whether the letters show is set under Chapter mark. Saving writes an entry to the chapter audit log.",
  typeHint: (archetype: Archetype) =>
    `${archetype.description} Sets defaults for modules and vocabulary.`,
  typeConfirmTitle: (archetype: Archetype) => `Switch to ${archetype.label}?`,
  typeConfirmBody: (archetype: Archetype) =>
    `This resets modules and vocabulary to ${archetype.short} defaults. Your chapter identity, branding, and custom fields are kept. An entry is written to the audit log.`,
  typeConfirmAction: "Switch archetype",
  vocabularyHint: (archetype: Archetype) =>
    `Defaults follow the ${archetype.short} archetype.`,
} as const;
