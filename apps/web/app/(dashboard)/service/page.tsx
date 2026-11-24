import { redirect } from "next/navigation";
import { standingHref } from "@/components/standing/standing-doors";

/**
 * Service hours stopped being a page with #5950: a member's own log, with
 * Log hours, opens from their Profile as a panel; reviewing hours is
 * Activity's and the chapter's reviewed entries are in Chapter settings. This
 * route only redirects old links, bookmarks and notifications to the
 * member's own log.
 */
export default function ServiceRedirect() {
  redirect(standingHref("service"));
}
