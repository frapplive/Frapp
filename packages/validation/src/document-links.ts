/**
 * Links into Documents that open it on a filter (#5949), one param and value
 * for web (`/documents?type=minutes`) and the phone (`documents` with
 * `{ type: "minutes" }`).
 *
 * Documents opened on the Minutes file type lists the chapter's posted
 * minutes, which are filed as documents (`spec/behavior/chapter-docs.md`
 * § Minutes). It is where the retired Meetings and Minutes lists land, and
 * what a meeting's minutes go back to. Each app reads the param once, into its
 * Type filter.
 */
export const DOCUMENTS_TYPE_PARAM = "type";
export const MINUTES_TYPE_PARAM_VALUE = "minutes";
