import { useEffect, useRef, useState } from "react";
import {
  useCurrentChapter,
  useOrgConfig,
  usePatchOrgConfig,
  usePermissionList,
} from "@repo/hooks";
import {
  readKeptDraft,
  useKeptDraftKeys,
  useKeptFormDraft,
} from "@repo/hooks/kept-drafts";
import {
  chapterLettersHidden,
  readChapterBranding,
} from "@repo/hooks/chapter-tab";
import { getArchetype } from "@repo/org-archetypes";
import { CHAPTER_PROFILE_PERMISSIONS, can, canAll } from "@repo/validation";
import { chapterSettingsAccess } from "@/lib/more/chapter-settings";
import { useServesChapterFeatures } from "@/lib/tenant-kind";

/**
 * What the phone's Chapter settings → Chapter part reads (#6027): the profile,
 * the branding, the organization type and its words, and who may change
 * which, as web's Chapter tab reads them (`settings-page.tsx`). Chapter
 * settings and each page its rows open call this, so they agree on every
 * value and every gate.
 *
 * Two gates, because two routes: the profile, the logo, the accent and the
 * chat background go through `PATCH /v1/chapters/current` and the logo
 * routes, which take `CHAPTER_PROFILE_PERMISSIONS` (`canEditProfile`); the
 * mark's short name and switch, identity, type, vocabulary, birthday posts
 * and member names go through the audited config PATCH, which takes
 * `chapter-config:manage` (`canManage`).
 *
 * The config read is a chapter route that refuses a council (#5933), so
 * `chapterFeatures` is false there and the parts that need it don't draw.
 */
export function useChapterTab() {
  const permissions = usePermissionList();
  const access = chapterSettingsAccess(permissions);
  const chapterFeatures = useServesChapterFeatures();
  const chapterQuery = useCurrentChapter();
  const orgConfig = useOrgConfig({
    enabled: access.chapter && chapterFeatures,
  });
  const patchConfig = usePatchOrgConfig();
  const chapter = chapterQuery.data;
  const config = orgConfig.data;
  const name = chapter?.name ?? "";
  return {
    access,
    chapterFeatures,
    chapterQuery,
    orgConfig,
    patchConfig,
    canManage: can("chapter-config:manage", permissions),
    canEditProfile: canAll(CHAPTER_PROFILE_PERMISSIONS, permissions),
    /** The profile as stored, or `undefined` until the chapter is read. */
    profile: chapter
      ? {
          name,
          university: chapter.university ?? "",
          donation_url: chapter.donation_url ?? "",
        }
      : undefined,
    name,
    logoUrl: chapter?.logo_url || null,
    /** Read key by key, so one malformed key never empties the rest (#2844). */
    branding: readChapterBranding(config?.branding),
    /** FIJI's chapters never show their letters (`orgHidingGreekLettersIn`). */
    lettersHidden: chapterLettersHidden(name),
    archetype: getArchetype(config?.org_archetype ?? "ifc"),
    vocabulary: (config?.vocabulary ?? {}) as Record<
      string,
      string | undefined
    >,
  };
}

/**
 * A Chapter settings form's draft (#6027): what an officer typed and hasn't
 * saved survives going back, and comes back with them, by member, chapter
 * and form, in the store web's forms use (rulebook § 4: keep the draft,
 * never "are you sure"; `@repo/hooks/kept-drafts`).
 *
 * `stored` is the saved value in the form's own shape, `undefined` while it
 * loads. The form opens on a kept draft if there is one, else on `stored`
 * once it arrives. When `stored` changes later (this save landing, another
 * officer's, a type switch resetting the vocabulary), the form takes it, as
 * web's forms re-seed from the query, and keeps nothing until it is edited
 * again.
 *
 * Call `kept.hold()` as a save starts, `kept.drop()` when it lands and
 * `kept.release()` when it fails.
 */
export function useChapterFormDraft<T>(form: string, stored: T | undefined) {
  const keys = useKeptDraftKeys();
  const [opening] = useState(() => readKeptDraft<T>(keys.draft(form)));
  const [draft, setDraft] = useState<T | undefined>(opening ?? stored);
  const kept = useKeptFormDraft(form, draft !== undefined, draft, {
    restoredAtMount: opening !== undefined,
  });
  const storedKey = stored === undefined ? undefined : JSON.stringify(stored);
  // The stored value the form last took, or opened beside.
  const seeded = useRef<string | undefined>(
    stored === undefined ? undefined : storedKey,
  );
  const { discard, rebase } = kept;
  useEffect(() => {
    if (storedKey === undefined || seeded.current === storedKey) return;
    const first = seeded.current === undefined;
    seeded.current = storedKey;
    // A kept draft outranks the first read that arrives under it.
    if (first && opening !== undefined) return;
    setDraft(JSON.parse(storedKey) as T);
    if (!first) discard();
    rebase();
  }, [storedKey, opening, discard, rebase]);
  return { draft, setDraft, kept };
}
