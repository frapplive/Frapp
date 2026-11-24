/**
 * Links into Documents that open it on a filter (#5949).
 *
 * `/documents?type=minutes` opens on the Minutes filter: the chapter's posted
 * minutes, which are filed as documents (`spec/behavior/chapter-docs.md`
 * § Minutes). It is where `/meetings` lands now that the Meetings list page
 * is gone, and what a meeting's minutes page goes back to.
 */
export const DOCUMENT_TYPE_PARAM = "type";
export const MINUTES_TYPE_PARAM_VALUE = "minutes";
export const MINUTES_DOCUMENTS_HREF = `/documents?${DOCUMENT_TYPE_PARAM}=${MINUTES_TYPE_PARAM_VALUE}`;
