/**
 * School-email verification (school layer 1, #5929;
 * `spec/architecture/school-layer.md` § 2.2): its limits, its refusal codes
 * and the words both apps and the API show. The API passes the limits to the
 * database function that counts under a lock
 * (`start_school_email_verification`), so this file is their one source.
 *
 * The code works like sign-in's emailed code: six digits, typed on the same
 * screen, a resend after a short wait (`EMAIL_CODE_LENGTH` and
 * `EMAIL_RESEND_COOLDOWN_SECONDS` in `@repo/hooks/auth-error-copy`).
 */

/** Digits in a school-email code. */
export const SCHOOL_CODE_LENGTH = 6;

/** How long a code works, in seconds. */
export const SCHOOL_CODE_TTL_SECONDS = 10 * 60;

/** The wait before the same account can ask the same school for another code. */
export const SCHOOL_CODE_RESEND_SECONDS = 60;

/** Wrong tries one code allows before it stops working. */
export const SCHOOL_CODE_MAX_ATTEMPTS = 5;

/** The rolling window the three ceilings below count over, in seconds. */
export const SCHOOL_CODE_WINDOW_SECONDS = 60 * 60;

/**
 * Codes one address can be sent per window, from any account: someone typing
 * a stranger's address can't flood their inbox.
 */
export const SCHOOL_CODES_PER_ADDRESS = 5;

/**
 * Codes one IP can ask for per window, across accounts and addresses. A dorm
 * or campus network shares an IP, so this is the loosest of the three.
 */
export const SCHOOL_CODES_PER_IP = 20;

/** Codes one account can ask for per window, across addresses and schools. */
export const SCHOOL_CODES_PER_ACCOUNT = 10;

/** School search asks nothing for fewer characters (the API answers `[]`). */
export const SCHOOL_SEARCH_MIN_LENGTH = 2;

/**
 * A plain `local@domain` address: one `@`, no quotes, spaces or other
 * characters a quoted local part needs. School-issued addresses are always
 * this shape, and refusing the rest means the domain the database checks
 * (after the last `@`) is the only domain in the address.
 */
const PLAIN_EMAIL =
  /^[^\s@"(),:;<>[\]\\]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

/** Whether an address is the plain shape a school code goes to. */
export function isPlainSchoolEmail(email: string): boolean {
  return PLAIN_EMAIL.test(email.trim());
}

/** The refusal codes the school routes answer with. */
export const SCHOOL_REFUSAL = {
  notFound: "school.not_found",
  unavailable: "school.verification_unavailable",
  wrongDomain: "school.email.wrong_domain",
  invalidEmail: "school.email.invalid",
  emailTaken: "school.email.taken",
  cooldown: "school.code.cooldown",
  rateLimited: "school.code.rate_limited",
  sendFailed: "school.code.send_failed",
  noCode: "school.code.missing",
  expired: "school.code.expired",
  wrongCode: "school.code.wrong",
  tooManyAttempts: "school.code.too_many_attempts",
  contextRequired: "school.context.required",
  contextInvalid: "school.context.invalid",
} as const;

export type SchoolRefusalCode =
  (typeof SCHOOL_REFUSAL)[keyof typeof SCHOOL_REFUSAL];

/** The onboarding step's words, the same on web and the phone. */
export const SCHOOL_STEP_COPY = {
  title: "Where do you go to school?",
  searchLabel: "School",
  searchPlaceholder: "Search for your school",
  noMatch: "No school matches that. Check the spelling, or skip for now.",
  searchFailed: "Couldn't search schools. Check your connection and try again.",
  notSetUp: "Your school isn't set up for verification yet.",
  change: "Change",
  emailLabel: "School email",
  sendCode: "Send code",
  codeLabel: "Code",
  verify: "Verify",
  resend: "Send a new code",
  useAnotherEmail: "Use another email",
  skip: "Not a student? Skip for now",
  continue: "Continue",
  goToChat: "Go to chat",
  notAnEmail: "Enter your school email address.",
  codeIncomplete: `Enter the ${SCHOOL_CODE_LENGTH}-digit code from the email.`,
  sendFailed: "Couldn't send the code. Check your connection and try again.",
  verifyFailed: "Couldn't check the code. Check your connection and try again.",
} as const;

/** "Enter the 6-digit code we sent to you@rpi.edu." */
export function schoolCodeSentLine(email: string): string {
  return `Enter the ${SCHOOL_CODE_LENGTH}-digit code we sent to ${email}.`;
}

/** "Send a new code in 42s", while the resend waits. */
export function schoolResendWaitLine(seconds: number): string {
  return `Send a new code in ${Math.max(1, Math.ceil(seconds))}s`;
}

/** "You're verified at Rensselaer Polytechnic Institute". */
export function schoolVerifiedLine(schoolName: string): string {
  return `You're verified at ${schoolName}`;
}

/** The address field's placeholder: `you@rpi.edu`, else a generic one. */
export function schoolEmailPlaceholder(domains: readonly string[]): string {
  return domains[0] ? `you@${domains[0]}` : "you@school.edu";
}

/** The `@rpi.edu` list a wrong address is told to use. */
function domainList(domains: readonly string[]): string {
  const shown = domains.map((domain) => `@${domain}`);
  if (shown.length <= 1) return shown[0] ?? "your school's address";
  return `${shown.slice(0, -1).join(", ")} or ${shown[shown.length - 1]}`;
}

/** The refusal for an address on another domain. */
export function schoolWrongDomainLine(
  schoolName: string,
  domains: readonly string[],
): string {
  return `Use your ${schoolName} email, ending in ${domainList(domains)}.`;
}

/** The refusal for a ceiling, with how long to wait. */
export function schoolRateLimitedLine(retryAfterSeconds: number): string {
  const minutes = Math.ceil(retryAfterSeconds / 60);
  const wait =
    retryAfterSeconds < 60
      ? `${Math.max(1, Math.ceil(retryAfterSeconds))} seconds`
      : minutes === 1
        ? "a minute"
        : `${minutes} minutes`;
  return `Too many codes asked for. Try again in ${wait}.`;
}

/** The fixed refusal sentences; the API sends them as each refusal's message. */
export const SCHOOL_REFUSAL_COPY = {
  notFound: "That school isn't on Frapp.",
  emailTaken: "That address is already verified on another Frapp account.",
  noCode: "Send a code first.",
  expired: "That code has expired. Send a new one.",
  wrongCode: "That code isn't right. Check the email and try again.",
  tooManyAttempts: "Too many wrong tries. Send a new code.",
  sendFailed: "Couldn't send the code right now. Try again in a moment.",
  contextRequired: "Open a school page to do this.",
  contextInvalid: "You're not verified at that school.",
} as const;
