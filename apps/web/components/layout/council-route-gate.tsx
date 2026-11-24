"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTenantKind } from "@/lib/hooks/use-tenant-kind";

/**
 * The dashboard routes a council's space serves (#5933): chat, the
 * Directory, its Chapters (#5974), Council settings (Roles and groups is a tab of it, which
 * `/roles` redirects to), and the member's own Profile, Settings and What's
 * new. Every other page reads a chapter route that refuses a council
 * (`chapter.context.invalid`).
 */
export const COUNCIL_ROUTES = [
  "/chat",
  "/members",
  "/chapters",
  "/settings",
  "/roles",
  "/profile",
  "/preferences",
  "/whats-new",
] as const;

/**
 * Routes only a council's space serves (#5974): a chapter has no member
 * chapters, and `GET /v1/council/chapters` refuses it.
 */
export const COUNCIL_ONLY_ROUTES = ["/chapters"] as const;

function matches(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

/** Whether only a council's space serves `pathname`. */
export function isCouncilOnlyRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return COUNCIL_ONLY_ROUTES.some((route) => matches(pathname, route));
}

/** Whether a council's space serves `pathname`. */
export function isCouncilRoute(pathname: string | null): boolean {
  if (!pathname) return true;
  return COUNCIL_ROUTES.some((route) => matches(pathname, route));
}

/**
 * Sends a council member who opens a chapter page (a bookmark, a link from a
 * chapter, a typed URL) to the council's chat, rather than drawing a page
 * whose every read fails. The nav already offers none of them
 * (`NavItem.kinds`). The other way round, a chapter member who opens a
 * council's page (`COUNCIL_ONLY_ROUTES`) goes to chat too. Nothing moves
 * while the tenant's kind is unknown.
 */
export function CouncilRouteGate() {
  const pathname = usePathname();
  const router = useRouter();
  const kind = useTenantKind();
  const away =
    (kind === "council" && !isCouncilRoute(pathname)) ||
    (kind === "chapter" && isCouncilOnlyRoute(pathname));

  useEffect(() => {
    if (away) router.replace("/chat");
  }, [away, router]);

  return null;
}
