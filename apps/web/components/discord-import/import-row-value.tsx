"use client";

import { useDiscordImports } from "@repo/hooks";
import type { ImportRow } from "./import-progress";
import { importRowState } from "./current-import";

/**
 * The Chat page's Discord import row's value: the import's state, read from
 * the list the import's own page reads (one cached query, polled while an
 * import moves). Nothing until it loads, and nothing if it fails: the row
 * still opens the page, which says what went wrong.
 */
export function DiscordImportRowValue() {
  const imports = useDiscordImports();
  if (!imports.data) return null;
  return <>{importRowState(imports.data as ImportRow[])}</>;
}
