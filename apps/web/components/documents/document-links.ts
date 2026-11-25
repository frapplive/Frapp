import {
  DOCUMENTS_TYPE_PARAM,
  MINUTES_TYPE_PARAM_VALUE,
} from "@repo/validation";

/**
 * `/documents?type=minutes`: Documents opened on the Minutes filter, the
 * chapter's posted minutes (#5949). Where `/meetings` lands, and what a
 * meeting's minutes page goes back to. The param and value are shared with the
 * phone (`@repo/validation` `document-links`).
 */
export const MINUTES_DOCUMENTS_HREF = `/documents?${DOCUMENTS_TYPE_PARAM}=${MINUTES_TYPE_PARAM_VALUE}`;
