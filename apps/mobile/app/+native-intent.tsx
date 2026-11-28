import { systemPathForWebLink } from "@/lib/links/web-address-link";

/**
 * Rewrites a link the system opened the app with (#6050).
 *
 * A web dashboard address (`https://app.frapp.live/events?event=…`) becomes
 * the phone screen the shared table names (`lib/links/web-address-link.ts`),
 * so a link from Notes, Messages or Mail opens the same screen as on the web.
 * Anything else passes through as it came: the invite (`/join`), the
 * check-in code (`/check-in`), and the app's own `frapp://` links, which
 * already name phone routes.
 *
 * expo-router calls this for every incoming URL, cold start and warm, and a
 * throw here can crash the app, so it never throws.
 */
export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}): string {
  try {
    return systemPathForWebLink(path) ?? path;
  } catch {
    return path;
  }
}
