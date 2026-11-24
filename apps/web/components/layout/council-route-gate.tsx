"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useIsCouncil } from "@/lib/hooks/use-tenant-kind";

/**
 * The dashboard routes a council's space serves (#5933): chat, the
 * Directory, Council settings (Roles and groups is a tab of it, which
 * `/roles` redirects to), and the member's own Profile, Settings and What's
 * new. Every other page reads a chapter route that refuses a council
 * (`chapter.context.invalid`).
 */
export const COUNCIL_ROUTES = [
  "/chat",
  "/members",
  "/settings",
  "/roles",
  "/profile",
  "/preferences",
  "/whats-new",
] as const;

/** Whether a council's space serves `pathname`. */
export function isCouncilRoute(pathname: string | null): boolean {
  if (!pathname) return true;
  return COUNCIL_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

/**
 * Sends a council member who opens a chapter page (a bookmark, a link from a
 * chapter, a typed URL) to the council's chat, rather than drawing a page
 * whose every read fails. The nav already offers none of them
 * (`NavItem.kinds`). Nothing moves while the tenant's kind is unknown.
 */
export function CouncilRouteGate() {
  const pathname = usePathname();
  const router = useRouter();
  const isCouncil = useIsCouncil();
  const away = isCouncil && !isCouncilRoute(pathname);

  useEffect(() => {
    if (away) router.replace("/chat");
  }, [away, router]);

  return null;
}
