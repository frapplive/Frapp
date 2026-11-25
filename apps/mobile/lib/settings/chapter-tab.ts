import { useCallback, useEffect, useRef, useState } from "react";
import {
  useCurrentChapter,
  useOrgConfig,
  usePatchOrgConfig,
  usePermissionList,
} from "@repo/hooks";
import {
  keepEditsOver,
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
    /** The viewer's permission list, for the screen's other sections. */
    permissions,
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

/** What a Chapter form keeps: the edit, and the record it was made over. */
type KeptChapterDraft<T> = { base: T; edits: T };

/** What a save through {@link useChapterFormDraft} came to. */
export type ChapterSaveResult = { ok: true } | { ok: false; error: unknown };

/**
 * A Chapter settings form's draft (#6027): what an officer typed and hasn't
 * saved survives going back, and comes back with them, by member, chapter
 * and form, in the store web's forms use (rulebook § 4: keep the draft,
 * never "are you sure"; `@repo/hooks/kept-drafts`).
 *
 * `stored` is the saved value in the form's own shape, `undefined` while it
 * loads. The form opens on it, or on a kept draft laid over it: only the
 * fields the officer changed come from the draft (`keepEditsOver`, #4872),
 * so a draft kept for days never sends back a field another officer has
 * changed since. When `stored` changes under an open form (another officer's
 * save), the form takes it the same way, keeping the officer's own edits.
 *
 * Saves go through `save(send)`, which awaits the request: the draft leaves
 * the store while it is out, comes back if it fails (also once the officer
 * has left the page, which a `mutate` callback would never hear), and the
 * form takes the saved record once it lands. Nothing re-seeds while a save
 * is out, so the config PATCH's optimistic write and its rollback on a
 * failure never touch what the officer typed.
 */
export function useChapterFormDraft<T extends object>(
  form: string,
  stored: T | undefined,
) {
  const keys = useKeptDraftKeys();
  const [opening] = useState(() =>
    readKeptDraft<KeptChapterDraft<T>>(keys.draft(form)),
  );
  const fields = (value: T) => Object.keys(value) as (keyof T)[];
  const [state, setState] = useState<KeptChapterDraft<T> | undefined>(() => {
    if (opening && stored) {
      return {
        base: stored,
        edits: keepEditsOver(
          opening.edits,
          opening.base,
          stored,
          fields(stored),
        ),
      };
    }
    if (opening) return opening;
    return stored ? { base: stored, edits: stored } : undefined;
  });
  const [saving, setSaving] = useState(false);
  // Set once a save lands: the next stored value is the saved record, taken
  // whole rather than merged, so trimmed text replaces what was typed.
  const [adopt, setAdopt] = useState(false);
  const kept = useKeptFormDraft(form, state !== undefined, state, {
    restoredAtMount: opening !== undefined,
    // An edit is the edits changing, never the base under them.
    signature: state ? JSON.stringify(state.edits) : "",
  });
  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
  });
  const storedKey = stored === undefined ? undefined : JSON.stringify(stored);
  const seeded = useRef<string | undefined>(storedKey);
  const { discard, rebase } = kept;
  /* eslint-disable react-hooks/set-state-in-effect -- re-seed the form from the chapter's query, as web's Chapter tab does */
  useEffect(() => {
    if (saving || storedKey === undefined || seeded.current === storedKey) {
      return;
    }
    seeded.current = storedKey;
    const now = JSON.parse(storedKey) as T;
    if (adopt) {
      setAdopt(false);
      setState({ base: now, edits: now });
      discard();
      rebase();
      return;
    }
    const prev = latest.current;
    const edited =
      prev !== undefined &&
      JSON.stringify(prev.edits) !== JSON.stringify(prev.base);
    setState(
      prev
        ? {
            base: now,
            edits: keepEditsOver(prev.edits, prev.base, now, fields(now)),
          }
        : { base: now, edits: now },
    );
    // A read that fills an untouched form isn't an edit; one that lands
    // under the officer's edits keeps them as the draft.
    if (!edited && !opening) rebase();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `fields` is a pure helper
  }, [storedKey, saving, adopt, opening, discard, rebase]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const { hold, release, drop } = kept;
  const save = useCallback(
    async (send: () => Promise<unknown>): Promise<ChapterSaveResult> => {
      hold();
      setSaving(true);
      try {
        await send();
        drop();
        setAdopt(true);
        return { ok: true };
      } catch (error) {
        release();
        return { ok: false, error };
      } finally {
        setSaving(false);
      }
    },
    [hold, release, drop],
  );

  return {
    draft: state?.edits,
    setDraft: (edits: T) =>
      setState((prev) => (prev ? { ...prev, edits } : prev)),
    /** Back to the saved record, keeping nothing (a save with nothing to send). */
    reset: () => {
      if (!stored) return;
      setState({ base: stored, edits: stored });
      discard();
      rebase();
    },
    saving,
    save,
  };
}
