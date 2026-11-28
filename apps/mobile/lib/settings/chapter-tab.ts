import {
  useCurrentChapter,
  useOrgConfig,
  usePatchOrgConfig,
  usePermissionList,
} from "@repo/hooks";
import {
  chapterLettersHidden,
  readChapterBranding,
} from "@repo/hooks/chapter-tab";
import { errorCopy } from "@repo/hooks/error-copy";
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

/**
 * One Chapter setting's save, for a field that saves on its own (#6033,
 * `SavedTextField`): resolves true once it lands, or the words of the
 * failure, which the field says under itself. The phone has no toast.
 */
export async function saveSetting(
  send: () => Promise<unknown>,
  fallback: string,
): Promise<true | string> {
  try {
    await send();
    return true;
  } catch (error) {
    return errorCopy(error, fallback);
  }
}
