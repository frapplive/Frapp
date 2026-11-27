"use client";

import { useMyPermissions } from "@repo/hooks";
import {
  activePreview,
  useRolePreviewStore,
} from "@/lib/stores/role-preview-store";
import { useShellCached } from "@/lib/shell-cache/shell-cache-sync";
import { readIsOffline } from "@/components/shared/async-states";
import { useNetwork } from "@/lib/providers/network-provider";
import { useChapterStore } from "@/lib/stores/chapter-store";

/**
 * The viewer's permissions as the nav's doors read them (`isNavItemVisible`,
 * `hasSettingsDestination`), with "not known yet" split in two (#3854):
 *
 * - `undefined` while the read is in flight, or after it failed online: gated
 *   rows stay hidden, so a member never sees an officer's door drawn and taken
 *   back. `<Can>` hides on an online failure too.
 * - `null` when the read cannot be answered because the dashboard is offline
 *   with nothing cached (paused, or failing while `useNetwork()` says OFFLINE):
 *   gated rows show, the way the module gate does. An unresolved permission is
 *   not a held one, but neither is it a denial (`spec/ui/design-system/README.md`
 *   §5 rule 4), so a member keeps the Directory and Backwork rows they hold, and
 *   each destination states the outage itself.
 *
 * Once the shell has an answer the query stays mounted for the session, so
 * going offline later keeps the answer and changes nothing here.
 *
 * `fromShellCache` (the shell's nav and page title only, #5049): while the
 * read is still out, the permissions this browser last saw for this member
 * and chapter stand in, so a revisit draws its rows at once. Only for
 * drawing: anything that decides (a redirect, `<Can>`, a page's own gate)
 * calls this without it and waits for the answer. Never during a role
 * preview, whose permissions aren't the ones kept.
 */
export function useNavPermissions(
  options: { fromShellCache?: boolean } = {},
): readonly string[] | null | undefined {
  const activeChapterId = useChapterStore((s) => s.activeChapterId);
  const read = useMyPermissions({ enabled: Boolean(activeChapterId) });
  const { isOffline } = useNetwork();
  const preview = useRolePreviewStore((s) =>
    activePreview(s.preview, activeChapterId),
  );
  const kept = useShellCached<{ permissions?: unknown }>("permissions");
  const permissions = read.data?.permissions;
  if (permissions) return permissions;
  if (
    options.fromShellCache &&
    read.isLoading &&
    !preview &&
    Array.isArray(kept?.permissions)
  ) {
    return kept.permissions as readonly string[];
  }
  if (activeChapterId && readIsOffline(isOffline, read)) return null;
  return undefined;
}
