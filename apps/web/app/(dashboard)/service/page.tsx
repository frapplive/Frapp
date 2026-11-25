import { redirect } from "next/navigation";
import { NEW_INTENT_PARAM, newIntentHref } from "@/components/layout/new-intent";
import { standingHref } from "@/components/standing/standing-doors";

/**
 * Service hours stopped being a page with #5950: a member's own log, with
 * Log hours, opens from their Profile as a panel; reviewing hours is
 * Activity's and the chapter's reviewed entries are in Chapter settings. This
 * route only redirects old links, bookmarks and notifications to the
 * member's own log, keeping New's "open the form" mark (`?new=1`).
 */
export default async function ServiceRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const asked = (await searchParams)[NEW_INTENT_PARAM] === "1";
  redirect(
    asked ? newIntentHref(standingHref("service")) : standingHref("service"),
  );
}
