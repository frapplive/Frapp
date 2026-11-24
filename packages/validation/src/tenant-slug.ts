import { z } from "zod";

/**
 * Tenant slugs and kinds (ADR-27 decision 5, `spec/architecture/adr/adr-27.md`).
 *
 * A tenant is a chapter or a council, both rows of `chapters`, told apart by
 * `chapters.kind`. Each has one current slug in `tenant_slugs`, the name its
 * pages will live under (`/c/<slug>/…`, rollout step 2).
 */
export const TENANT_KINDS = ["chapter", "council"] as const;
export type TenantKind = (typeof TENANT_KINDS)[number];

export function isTenantKind(value: unknown): value is TenantKind {
  return (
    typeof value === "string" &&
    (TENANT_KINDS as readonly string[]).includes(value)
  );
}

/**
 * 3 to 40 characters of `a-z`, `0-9` and single hyphens, with no hyphen at
 * either end. ASCII only, so no lookalike letters. The database's
 * `tenant_slugs_slug_format` CHECK is this same pattern.
 */
export const TENANT_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){2,39}$/;

/**
 * Words no tenant may take. A chapter can be `rpi-ifc` but not `ifc`.
 *
 * The database's `is_reserved_tenant_slug` holds the same list, for the
 * default slugs its trigger assigns, and `tenant-slug-reserved-lockstep.spec.ts`
 * in `apps/api` fails while the two differ. Adding a word here needs a
 * migration that redefines that function.
 */
export const RESERVED_TENANT_SLUGS: readonly string[] = [
  // Platform words.
  "new",
  "join",
  "start",
  "me",
  "settings",
  "admin",
  "api",
  "app",
  "www",
  "help",
  "support",
  "status",
  "frapp",
  "signet",
  "staff",
  "official",
  // Council words on their own.
  "ifc",
  "panhellenic",
  "phc",
  "nphc",
  "mgc",
  "council",
  "school",
  // The web's first-level route names (`apps/web/app`). `c`, `s` and `f`,
  // the tenant, campus and form prefixes, are too short to be a slug at all.
  "activity",
  "alumni",
  "ask",
  "auth",
  "backwork",
  "billing",
  "chat",
  "chat-admin",
  "check-in",
  "dashboard",
  "discord-import",
  "documents",
  "events",
  "geofences",
  "meetings",
  "members",
  "no-access",
  "points",
  "preferences",
  "profile",
  "reports",
  "roles",
  "service",
  "sign-in",
  "sign-up",
  "study",
  "tasks",
  "welcome",
  "whats-new",
];

const RESERVED = new Set(RESERVED_TENANT_SLUGS);

export function isReservedTenantSlug(slug: string): boolean {
  return RESERVED.has(slug);
}

/** A slug a tenant may hold: the format, and not a reserved word. */
export const tenantSlugSchema = z
  .string()
  .regex(
    TENANT_SLUG_PATTERN,
    "Use 3 to 40 lowercase letters, numbers and hyphens",
  )
  .refine((slug) => !isReservedTenantSlug(slug), "That name is reserved");
