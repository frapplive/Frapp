import { redirect } from "next/navigation";
import { standingHref } from "@/components/standing/standing-doors";

/**
 * Points stopped being a page with #5950: a member's own points open from
 * their Profile, as a panel; standings are a sort in Directory and the
 * chapter ledger is in Chapter settings. This route only redirects old links,
 * bookmarks and notifications to the member's own points.
 */
export default function PointsRedirect() {
  redirect(standingHref("points"));
}
