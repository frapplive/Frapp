import { Redirect } from "expo-router";
import { MINUTES_DOCUMENTS_HREF } from "@/lib/more/document-links";

/**
 * The Minutes list's old address (#4415, #5290). Since #5949 a meeting's
 * posted minutes are filed as documents, so the list is gone and this route
 * forwards to Documents opened on the Minutes file type, as web's `/meetings`
 * lands on `/documents?type=minutes` (`spec/ui/mobile/screens.md` § Minutes).
 * It stays because the stack layout registers it and a link or push already
 * sent may name it. `Redirect` replaces it, so going back from Documents
 * doesn't stop on this empty route.
 */
export default function MinutesRoute() {
  return <Redirect href={MINUTES_DOCUMENTS_HREF} />;
}
