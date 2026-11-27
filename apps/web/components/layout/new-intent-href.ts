import { ONE_SHOT_ADDRESS_PARAMS } from "@repo/validation";

/**
 * New's mark on a page's address (`?new=1`, `new-intent.ts`). Kept out of
 * that "use client" module: a server component importing from one gets
 * client references, not values, and the redirect pages (`/service`,
 * `/meetings`) read and mint the mark on the server.
 */
export const NEW_INTENT_PARAM = ONE_SHOT_ADDRESS_PARAMS.new;

/**
 * Which form the mark asks for, where a page holds more than one: Documents
 * holds Upload (`"1"`, its own button's) and New minutes (`"minutes"`), since
 * minutes are filed there (#5949).
 */
export type NewIntent = "1" | "minutes";

/**
 * The address that opens `href`'s create form. `href` may carry a query of
 * its own (`/profile?open=service`, a panel that holds the form, #5950).
 */
export function newIntentHref(href: string, intent: NewIntent = "1"): string {
  return `${href}${href.includes("?") ? "&" : "?"}${NEW_INTENT_PARAM}=${intent}`;
}
