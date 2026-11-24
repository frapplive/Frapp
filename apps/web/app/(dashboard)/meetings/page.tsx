import { redirect } from "next/navigation";
import { MINUTES_DOCUMENTS_HREF } from "@/components/documents/document-links";

// The Meetings list folded into Documents (#5949, Paul 2026-11-24: "File
// minutes as documents"): posted minutes are filed there, under the Minutes
// filter, and a meeting's own minutes page (`/meetings/<id>`) stays. Kept as a
// redirect so links, notifications and bookmarks to `/meetings` still land on
// the chapter's minutes. Writing minutes starts from the event's page, New
// minutes in Documents, and Activity's To do.
export default function MeetingsPage() {
  redirect(MINUTES_DOCUMENTS_HREF);
}
