"use client";

import { useMemo } from "react";
import { can } from "@repo/validation";
import { useDocuments } from "./use-documents";

/**
 * Features a member isn't sent to until an officer sets them up
 * (`spec/product/modules.md` § Not-set-up features).
 *
 * A chapter with no documents has a Documents page that can only say so,
 * which no member can fix, so the web nav and the phone's You tab leave it
 * out until the first document exists. It stays for whoever can upload,
 * because its page is where the upload happens.
 *
 * Study hours was the other such row until it left both navs (#5950): the
 * web's study sessions open from Profile, and the phone's from the Study
 * gauge and New, so nothing here hides it any more. The rule in
 * `spec/product/modules.md` stands for any entry point that comes back.
 *
 * Backwork is not here: members upload it themselves (`backwork:upload` is in
 * the Member and New Member roles), so an empty library is theirs to start,
 * and hiding it would hide the only way to add the first file.
 *
 * Nothing hides while permissions, the chapter's modules or the list are
 * still loading, or after the list's read fails. A row hides on a read that
 * answers "none", or on the list's module being off, since then nothing can
 * be in it (and the read would be refused).
 */
export type UnsetFeatureKey = "documents";

interface UnsetFeatureDefinition {
  /**
   * Holding this means the viewer makes the first item on the feature's own
   * page, so always sees it. Null when the page has no way to set it up, so
   * it hides from everyone.
   */
  setUpBy: string | null;
  /**
   * The module the list's read is gated on. While it is off the list can't
   * be read and nothing in it can be made, so it counts as empty.
   */
  module: string;
}

const UNSET_FEATURES: Readonly<
  Record<UnsetFeatureKey, UnsetFeatureDefinition>
> = {
  documents: { setUpBy: "chapter_docs:upload", module: "documents" },
};

const UNSET_FEATURE_KEYS = Object.keys(UNSET_FEATURES) as UnsetFeatureKey[];

export interface UnsetFeatureInput {
  /** Undefined or null while the viewer's permissions load. */
  permissions: readonly string[] | null | undefined;
  /** The chapter's module gate; undefined while the chapter read loads. */
  isModuleEnabled: ((moduleKey: string) => boolean) | undefined;
  /**
   * How many items each feature's list holds for the viewer. Undefined while
   * the list loads, after its read fails, or when it was never read.
   */
  counts: Partial<Record<UnsetFeatureKey, number | undefined>>;
}

/** Whether the viewer is one the feature could be hidden from, as far as is known yet. */
function canHide(
  key: UnsetFeatureKey,
  permissions: UnsetFeatureInput["permissions"],
  isModuleEnabled: UnsetFeatureInput["isModuleEnabled"],
): isModuleEnabled is (moduleKey: string) => boolean {
  return (
    permissions !== undefined &&
    permissions !== null &&
    isModuleEnabled !== undefined &&
    !canSetUp(key, permissions)
  );
}

function canSetUp(key: UnsetFeatureKey, permissions: readonly string[]) {
  const setUpBy = UNSET_FEATURES[key].setUpBy;
  return setUpBy !== null && can(setUpBy, permissions);
}

/** Whether a feature's list has to be read to decide: the viewer can't set it up, and its module is on. */
function needsUnsetFeatureRead(
  key: UnsetFeatureKey,
  permissions: UnsetFeatureInput["permissions"],
  isModuleEnabled: UnsetFeatureInput["isModuleEnabled"],
): boolean {
  return (
    canHide(key, permissions, isModuleEnabled) &&
    isModuleEnabled(UNSET_FEATURES[key].module)
  );
}

/** Undefined while a list loads and after its read fails: either way, hide nothing. */
function lengthOf(data: unknown): number | undefined {
  return Array.isArray(data) ? data.length : undefined;
}

/**
 * Only active zones count: a member can study only in those, and a zone with
 * sessions can't be deleted, so a chapter done with zones deactivates them.
 * The setup checklist reads this (`setup-checklist.ts`).
 */
export function activeZoneCount(data: unknown): number | undefined {
  return Array.isArray(data)
    ? data.filter(
        (zone) => (zone as { is_active?: unknown })?.is_active !== false,
      ).length
    : undefined;
}

/** The features to leave out for this viewer. */
export function selectHiddenUnsetFeatures({
  permissions,
  isModuleEnabled,
  counts,
}: UnsetFeatureInput): ReadonlySet<UnsetFeatureKey> {
  const hidden = new Set<UnsetFeatureKey>();
  for (const key of UNSET_FEATURE_KEYS) {
    if (!canHide(key, permissions, isModuleEnabled)) continue;
    const count = isModuleEnabled(UNSET_FEATURES[key].module) ? counts[key] : 0;
    if (count === 0) hidden.add(key);
  }
  return hidden;
}

/**
 * The features to leave out for this viewer, reading a feature's list only
 * when the viewer can't set it up and its module is on.
 * The read shares its cache with the Documents screen.
 */
export function useHiddenUnsetFeatures(
  permissions: UnsetFeatureInput["permissions"],
  isModuleEnabled: UnsetFeatureInput["isModuleEnabled"],
): ReadonlySet<UnsetFeatureKey> {
  const documents = useDocuments({
    enabled: needsUnsetFeatureRead("documents", permissions, isModuleEnabled),
  });
  const documentCount = lengthOf(documents.data);
  return useMemo(
    () =>
      selectHiddenUnsetFeatures({
        permissions,
        isModuleEnabled,
        counts: { documents: documentCount },
      }),
    [permissions, isModuleEnabled, documentCount],
  );
}
