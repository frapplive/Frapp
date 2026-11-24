import type { Href } from "expo-router";
import {
  DOCUMENTS_TYPE_PARAM,
  MINUTES_TYPE_PARAM_VALUE,
} from "@repo/validation";

/**
 * Documents opened on the Minutes filter (#5949), the phone's twin of web's
 * `/documents?type=minutes`, with the param and value both apps share
 * (`@repo/validation` `document-links`). Where `/minutes` lands, and where a
 * meeting's minutes go back to when nothing is under them.
 */
export const MINUTES_DOCUMENTS_HREF: Href = {
  pathname: "/documents",
  params: { [DOCUMENTS_TYPE_PARAM]: MINUTES_TYPE_PARAM_VALUE },
};
