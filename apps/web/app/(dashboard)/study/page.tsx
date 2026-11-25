import { redirect } from "next/navigation";
import { standingHref } from "@/components/standing/standing-doors";

/**
 * Study hours stopped being a page with #5950: a session runs on the phone,
 * and a member's own sessions open from their Profile as a panel. This route
 * only redirects old links and bookmarks there.
 */
export default function StudyRedirect() {
  redirect(standingHref("study"));
}
