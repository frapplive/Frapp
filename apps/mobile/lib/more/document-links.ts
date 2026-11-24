import type { Href } from "expo-router";

/**
 * Links into Documents that open it on a filter (#5949), web's
 * `components/documents/document-links.ts` on the phone: the same param and
 * value as web's `/documents?type=minutes`.
 *
 * Documents opened on the Minutes file type is where `/minutes` lands now
 * that a meeting's posted minutes are filed as documents
 * (`spec/behavior/chapter-docs.md`), and where a meeting's minutes go back to
 * when nothing is under them. Documents reads the param once, into its Type
 * filter.
 */
export const DOCUMENTS_TYPE_PARAM = "type";
export const MINUTES_TYPE_PARAM_VALUE = "minutes";
export const MINUTES_DOCUMENTS_HREF: Href = {
  pathname: "/documents",
  params: { [DOCUMENTS_TYPE_PARAM]: MINUTES_TYPE_PARAM_VALUE },
};
