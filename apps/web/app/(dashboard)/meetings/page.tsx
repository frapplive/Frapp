import { redirect } from "next/navigation";
import { MINUTES_DOCUMENTS_HREF } from "@/components/documents/document-links";
import {
  NEW_INTENT_PARAM,
  newIntentHref,
} from "@/components/layout/new-intent";

// The Meetings list folded into Documents (#5949, Paul 2026-11-24: "File
// minutes as documents"): posted minutes are filed there, under the Minutes
// filter, and a meeting's own minutes page (`/meetings/<id>`) stays. Kept as a
// redirect so links, notifications and bookmarks to `/meetings` still land on
// the chapter's minutes, and New's old `/meetings?new=1` still opens New
// minutes there. Writing minutes starts from the event's page, New minutes in
// Documents and New, and Activity's To do.
export default async function MeetingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const asked = (await searchParams)[NEW_INTENT_PARAM] === "1";
  redirect(
    asked
      ? newIntentHref(MINUTES_DOCUMENTS_HREF, "minutes")
      : MINUTES_DOCUMENTS_HREF,
  );
}
