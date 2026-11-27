import type { GoogleCalendarStatus } from "./use-google-calendar";

/**
 * Settings → Linked apps (#5407): every outside account a member has tied to
 * Frapp, one row each, with the state drawn rather than written out. The same
 * three states Discord's Connections, Slack's Connected apps and Google's
 * "Third-party connections" draw:
 *
 * - `connected`: a green check, and the account it is connected as.
 * - `off`: the row greyed, with Connect.
 * - `expired`: red, with Reconnect. The link exists but the provider stopped
 *   honoring it (Google Calendar's `needs_reconnect`), so nothing syncs.
 *
 * Web and the phone draw the rows; this file is what each row says, so the two
 * never disagree.
 */
export type LinkedAppTone = "connected" | "off" | "expired";

export interface LinkedAppState {
  tone: LinkedAppTone;
  /** The short line under the app's name. */
  detail: string;
}

/** Google Calendar's row. Null where the server doesn't offer it. */
export function googleCalendarLinkedState(
  status:
    | Pick<
        GoogleCalendarStatus,
        "available" | "connected" | "status" | "google_email"
      >
    | undefined,
): LinkedAppState | null {
  if (!status?.available) return null;
  if (!status.connected) return { tone: "off", detail: "Not connected" };
  if (status.status === "needs_reconnect") {
    return {
      tone: "expired",
      detail: "Sign-in expired",
    };
  }
  return {
    tone: "connected",
    detail: status.google_email ?? "Connected",
  };
}

/** Discord's row: the account a member's imported messages are tied to. */
export function discordLinkedState(
  link:
    | { linked: boolean; available?: boolean; discord_username?: string | null }
    | undefined,
): LinkedAppState | null {
  if (!link) return null;
  if (link.linked) {
    return {
      tone: "connected",
      detail: link.discord_username ?? "Linked",
    };
  }
  if (link.available === false) return null;
  // Says what linking is for: `available` is the server's Discord app, not
  // whether this chapter imported, so the row can't assume the member knows.
  return { tone: "off", detail: "Link to claim your imported messages" };
}

/** What a status mark is read as, on web and the phone alike. */
export function linkedStatusLabel(tone: LinkedAppTone): string {
  return tone === "connected"
    ? "Connected"
    : tone === "expired"
      ? "Expired"
      : "Not connected";
}

/** One way a member can sign in to Frapp. */
export type SignInMethodKey = "email" | "google" | "apple";

/** The sign-in methods a member can link to, or unlink from, an account they're in (#2223). */
export type LinkableSignInMethodKey = Exclude<SignInMethodKey, "email">;

export interface SignInMethod<
  I extends SignInIdentity = SignInIdentity,
> extends LinkedAppState {
  key: SignInMethodKey;
  label: string;
  /** The account's identity for this method, or null when it isn't set up. */
  identity: I | null;
  /**
   * Google or Apple, not yet on the account: Link adds it (#2223). Email is
   * the account's own address, so it is never linked or unlinked here.
   */
  canLink: boolean;
  /**
   * Google or Apple on an account that has another way in, so taking this one
   * away can't lock the member out. GoTrue refuses the last identity too
   * (`single_identity_not_deletable`); this keeps the control from offering it.
   */
  canUnlink: boolean;
}

/** The fields of a Supabase Auth identity a row reads. */
export interface SignInIdentity {
  provider: string;
  identity_data?: { email?: unknown } | null;
}

const SIGN_IN_METHODS: readonly { key: SignInMethodKey; label: string }[] = [
  // "Email", not "Email and password": Supabase gives a magic-link account
  // the same `email` identity as a password one, and which it has can't be
  // read from the identity.
  { key: "email", label: "Email" },
  { key: "google", label: "Google" },
  { key: "apple", label: "Apple" },
];

/** Whether a row's key is Google or Apple, the two a member links and unlinks. */
export function isLinkableSignInMethod(
  key: SignInMethodKey,
): key is LinkableSignInMethodKey {
  return key !== "email";
}

/**
 * The sign-in rows, from the account's Supabase Auth identities. Every method
 * Frapp offers is listed, so a member sees which they could also use; the
 * ones on the account carry a check and the address they sign in with.
 */
export function signInMethodsFrom<I extends SignInIdentity>(
  identities: readonly I[],
  accountEmail?: string | null,
): SignInMethod<I>[] {
  return SIGN_IN_METHODS.map(({ key, label }) => {
    const identity = identities.find((i) => i.provider === key) ?? null;
    const linkable = isLinkableSignInMethod(key);
    if (!identity) {
      return {
        key,
        label,
        tone: "off",
        detail: "Not set up",
        identity: null,
        canLink: linkable,
        canUnlink: false,
      };
    }
    const email = identity.identity_data?.email;
    return {
      key,
      label,
      tone: "connected",
      detail:
        typeof email === "string" && email ? email : (accountEmail ?? "Set up"),
      identity,
      canLink: false,
      canUnlink: linkable && identities.length > 1,
    };
  });
}

/** The sign-in rows' query key: the account's own, cleared with the cache on sign-out. */
export const signInMethodsQueryKey = ["auth", "sign-in-methods"] as const;

/** The two Supabase Auth reads the sign-in rows need (web's and the phone's client both have them). */
export interface SignInMethodsAuth<I extends SignInIdentity = SignInIdentity> {
  getUserIdentities(): Promise<{
    data: { identities: I[] } | null;
    error: unknown;
  }>;
  getUser(): Promise<{ data: { user: { email?: string | null } | null } }>;
}

/** Reads the account's identities and maps them to rows. Throws on a failed read. */
export async function loadSignInMethods<I extends SignInIdentity>(
  auth: SignInMethodsAuth<I>,
): Promise<SignInMethod<I>[]> {
  const [{ data, error }, user] = await Promise.all([
    auth.getUserIdentities(),
    auth.getUser(),
  ]);
  if (error) throw error;
  return signInMethodsFrom(
    data?.identities ?? [],
    user.data.user?.email ?? null,
  );
}

/**
 * What linking or unlinking a sign-in method says (#2223), web and phone
 * alike. Unlink asks first, the way Google's "Ways you sign in" and GitHub's
 * sign-in methods confirm a removal; Link needs no confirm, since the
 * provider's own page is the confirm.
 */
export const SIGN_IN_LINK_COPY = {
  link: "Link",
  unlink: "Unlink",
  unlinkTitle: (label: string) => `Unlink ${label}?`,
  unlinkBody: (label: string) =>
    `You won't be able to sign in with ${label} anymore. You can link it again later.`,
  unlinked: (label: string) => `${label} unlinked`,
  linked: (label: string) => `${label} linked`,
  linkFailedTitle: (label: string) => `Couldn't link ${label}`,
  unlinkFailedTitle: (label: string) => `Couldn't unlink ${label}`,
  /** The desktop app can't show Google's or Apple's page (they refuse embedded windows). */
  desktopLinkReason: "Open Frapp in your browser to link this.",
} as const;
