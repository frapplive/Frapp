/**
 * A chapter's interest form (#5977, `spec/behavior/ifc-recruitment.md`
 * § Chapter interest forms): the public page at `/f/<form-slug>` a PNM fills
 * in, and its settings on the Recruitment module page. One home for its
 * limits, its refusal codes, its words and the approved consent text, so the
 * API, web and the phone say the same thing.
 *
 * The form's own questions share the chat form card's question types
 * (`FORM_QUESTION_TYPES`, #3926), so one builder serves both.
 */
import { SCHOOL_CODE_LENGTH } from "./school-verification";

/** The chapter's blurb on the public page. */
export const INTEREST_FORM_BLURB_MAX_LENGTH = 500;
/** The chapter's own questions, after the fixed fields. */
export const INTEREST_FORM_QUESTIONS_MAX = 10;
/** QR source labels on one form. */
export const INTEREST_FORM_LABELS_MAX = 20;
/** A label is lowercase letters, digits and dashes: `tabling-quad`. */
export const INTEREST_FORM_LABEL_PATTERN = /^[a-z0-9][a-z0-9-]{0,59}$/;
export const INTEREST_FORM_LABEL_MAX_LENGTH = 60;
/** The free-text "Who referred you?" answer. */
export const INTEREST_FORM_REFERRER_MAX_LENGTH = 200;
/** A name field on the form, as `pnms` stores it. */
export const INTEREST_FORM_NAME_MAX_LENGTH = 100;
/** A phone number, digits and punctuation. */
export const INTEREST_FORM_PHONE_MIN_LENGTH = 7;
export const INTEREST_FORM_PHONE_MAX_LENGTH = 32;

/** Six digits, as the school code (#5929). */
export const INTEREST_FORM_CODE_LENGTH = SCHOOL_CODE_LENGTH;
export const INTEREST_FORM_CODE_TTL_SECONDS = 10 * 60;
export const INTEREST_FORM_CODE_RESEND_SECONDS = 30;
export const INTEREST_FORM_CODE_MAX_ATTEMPTS = 5;
export const INTEREST_FORM_CODE_WINDOW_SECONDS = 60 * 60;
/** Codes one address may ask for in the window, across every form. */
export const INTEREST_FORM_CODES_PER_ADDRESS = 6;
/**
 * Codes one IP may ask for in the window. High on purpose: on tabling day
 * 30 to 50 PNMs fill the form on one campus Wi-Fi address in an hour
 * (`ifc-recruitment.md` § A recruitment week at real scale), and every
 * submission needs its own code, so this is also the per-IP ceiling on
 * submissions.
 */
export const INTEREST_FORM_CODES_PER_IP = 200;
/** How long a matched code's proof lets the person finish the form. */
export const INTEREST_FORM_PROOF_TTL_SECONDS = 30 * 60;

/** The required box's value as stored on the submission. */
export const INTEREST_FORM_AGREE_BOX = "agree_18";

/**
 * The version of the consent text a submission stores. Change it with any
 * change to {@link interestFormConsentText}'s words: the stored version
 * must name the words the person saw.
 */
export const INTEREST_FORM_CONSENT_VERSION = "2026-11-24";

/** The required box, word for word (Paul approved, #5932, 2026-11-24). */
export const INTEREST_FORM_AGREE_LABEL = "I agree, and I'm 18 or older";

/** A run of the consent text; `strong` is a name shown in bold. */
export interface ConsentRun {
  text: string;
  strong?: boolean;
}

/** What the consent text names. */
export interface ConsentNames {
  chapter: string;
  /** The school the chapter is at; null for a chapter with no school. */
  school: string | null;
  /** The chapter's council on Frapp; null when it has none yet. */
  council: string | null;
}

/**
 * The consent and privacy text above the submit button
 * (`ifc-recruitment.md` § Consent and privacy text), approved by Paul on
 * #5932 (2026-11-24). Legal copy: don't reword it here, change the spec
 * first and bump {@link INTEREST_FORM_CONSENT_VERSION}.
 *
 * How the draft's placeholders fill:
 * - `{ at {School}}` and the `{At a school:}` sentence appear only at a
 *   school. A chapter with no school has no council, no master list and no
 *   eligibility check, so the sentences about those are left out too.
 * - `{Council}` is the council's name; with none yet, the draft's own
 *   alternative, "the council it joins", stands in its place.
 * - `{Under option B or C, …}` adds nothing under option A, the MVP
 *   (Paul, 2026-11-11).
 */
export function interestFormConsentText(names: ConsentNames): ConsentRun[] {
  const runs: ConsentRun[] = [
    { text: "By submitting, you share this information with " },
    { text: names.chapter, strong: true },
  ];
  if (names.school) {
    runs.push({ text: ` at ${names.school}` });
  }
  runs.push({ text: " so they can contact you about joining." });
  if (names.school) {
    runs.push({ text: " Your name, email, class year and phone also go to " });
    if (names.council) {
      runs.push(
        { text: names.council, strong: true },
        { text: `, the council ${names.chapter} belongs to on Frapp` },
      );
    } else {
      runs.push({ text: "the council it joins" });
    }
    runs.push({
      text: `, which keeps one recruitment list for ${names.school}. The council sees how many chapters you've signed up with, and which one you join. Other chapters don't see that you signed up here.`,
    });
  }
  runs.push({
    text: " Frapp stores this for them. You can withdraw from this chapter, or delete your recruitment information entirely, at any time from the link we email you. We don't ask for your grades here.",
  });
  if (names.school) {
    runs.push({
      text: ` If the council checks eligibility, you'll be asked to sign a separate release in Frapp, unless you've already signed one with ${names.school}. Either way, we'll tell you when your eligibility is checked, and you can revoke at any time.`,
    });
  }
  return runs;
}

/** The consent text as one string, as an email or a test reads it. */
export function interestFormConsentPlain(names: ConsentNames): string {
  return interestFormConsentText(names)
    .map((run) => run.text)
    .join("");
}

/**
 * Topics a form never asks about (`ifc-recruitment.md` § Fields, "Never
 * collected"). A guard against mistakes, not a classifier: the builder
 * refuses a question whose words name one, and says which.
 */
const SENSITIVE_TOPICS: readonly { topic: string; pattern: RegExp }[] = [
  { topic: "race or ethnicity", pattern: /\b(race|racial|ethnic(ity)?)\b/i },
  {
    topic: "religion",
    pattern: /\b(religion|religious|faith|church|mosque|synagogue)\b/i,
  },
  {
    topic: "health",
    pattern:
      /\b(health|medical|disabilit(y|ies)|diagnos(is|ed)|medication|mental illness)\b/i,
  },
  {
    topic: "sexual orientation",
    pattern: /\b(sexual(ity)?|gay|lesbian|bisexual|queer|lgbtq?)\b/i,
  },
  {
    topic: "immigration status",
    pattern:
      /\b(immigration|citizenship|citizen|visa|undocumented|green card)\b/i,
  },
  { topic: "a photo", pattern: /\b(photo|picture|selfie|headshot)\b/i },
];

/** The sensitive topic a question's words name, or null. */
export function interestFormSensitiveTopic(text: string): string | null {
  return (
    SENSITIVE_TOPICS.find(({ pattern }) => pattern.test(text))?.topic ?? null
  );
}

/** Why the builder refuses a question on a sensitive topic. */
export function interestFormSensitiveLine(topic: string): string {
  return `Recruitment forms can't ask about ${topic}. Frapp never collects it, so PNMs aren't asked to share it.`;
}

/** A label typed by an officer, as stored: `Tabling Quad` → `tabling-quad`. */
export function normalizeInterestFormLabel(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, INTEREST_FORM_LABEL_MAX_LENGTH);
}

/** The public page's path for a form, with its label when given. */
export function interestFormPath(slug: string, label?: string | null): string {
  return label ? `/f/${slug}?src=${encodeURIComponent(label)}` : `/f/${slug}`;
}

export const INTEREST_FORM_REFUSAL = {
  notFound: "interest_form.not_found",
  closed: "interest_form.closed",
  wrongDomain: "interest_form.email.wrong_domain",
  invalidEmail: "interest_form.email.invalid",
  unavailable: "interest_form.verification_unavailable",
  cooldown: "interest_form.code.cooldown",
  rateLimited: "interest_form.code.rate_limited",
  sendFailed: "interest_form.code.send_failed",
  noCode: "interest_form.code.missing",
  expired: "interest_form.code.expired",
  wrongCode: "interest_form.code.wrong",
  tooManyAttempts: "interest_form.code.too_many_attempts",
  badProof: "interest_form.proof.invalid",
  consentRequired: "interest_form.consent.required",
  invalidAnswers: "interest_form.answers.invalid",
  sensitiveQuestion: "interest_form.question.sensitive",
  invalidQuestions: "interest_form.questions.invalid",
  invalidLabel: "interest_form.label.invalid",
  labelExists: "interest_form.label.exists",
  tooManyLabels: "interest_form.label.too_many",
  notOffered: "interest_form.not_offered",
  groupNotFound: "interest_form.group.not_found",
} as const;

export type InterestFormRefusalCode =
  (typeof INTEREST_FORM_REFUSAL)[keyof typeof INTEREST_FORM_REFUSAL];

/** The public page's words. PNM-facing copy says "recruitment" (§ Words). */
export const INTEREST_FORM_COPY = {
  closedTitle: "Recruitment isn't open",
  closedBody:
    "This chapter isn't taking interest right now. Check back later, or ask a member.",
  notFoundTitle: "This form isn't here",
  notFoundBody:
    "The link may be old, or the chapter replaced its form. Ask a member for the new one.",
  emailLabel: "Email",
  schoolEmailLabel: "School email",
  emailHint:
    "We'll send a code to check it's yours. Nothing else shows until you enter it.",
  sendCode: "Send code",
  codeLabel: "Code",
  verify: "Verify",
  resend: "Send a new code",
  useAnotherEmail: "Use another email",
  firstName: "First name",
  lastName: "Last name",
  preferredName: "Preferred name",
  optional: "Optional",
  classYear: "Class year",
  phone: "Phone",
  referrer: "Who referred you?",
  referrerHint: "A member's name",
  submit: "Send",
  submitting: "Sending…",
  notAnEmail: "Enter your email address.",
  codeIncomplete: `Enter the ${SCHOOL_CODE_LENGTH}-digit code from the email.`,
  sendFailed: "Couldn't send the code. Check your connection and try again.",
  verifyFailed: "Couldn't check the code. Check your connection and try again.",
  submitFailed: "Couldn't send the form. Check your connection and try again.",
  nameRequired: "Enter your first and last name.",
  classYearInvalid: "Enter a four-digit class year.",
  phoneInvalid: "Enter a phone number with at least 7 digits.",
  agreeRequired: "Tick the box to agree before you send.",
  answerRequired: "Answer this question.",
  doneTitle: "You're on the list",
  privacy: "Privacy Policy",
  terms: "Terms",
  getTheApp: "Get the app",
} as const;

export const INTEREST_FORM_REFUSAL_COPY = {
  noCode: "Send a code first.",
  expired: "That code has expired. Send a new one.",
  wrongCode: "That code isn't right. Check the email and try again.",
  tooManyAttempts: "Too many wrong tries. Send a new code.",
  sendFailed: "Couldn't send the code right now. Try again in a moment.",
  badProof: "Your check timed out. Enter your email again to get a new code.",
  unavailable:
    "This chapter's school isn't set up to check email addresses yet.",
  consentRequired: "Tick the box to agree before you send.",
} as const;

/** After a code goes out. */
export function interestFormCodeSentLine(email: string): string {
  return `Enter the ${INTEREST_FORM_CODE_LENGTH}-digit code we sent to ${email}.`;
}

/** The refusal for an address off the chapter's school domains. */
export function interestFormWrongDomainLine(
  schoolName: string,
  domains: readonly string[],
): string {
  const shown = domains.map((domain) => `@${domain}`);
  const list =
    shown.length <= 1
      ? (shown[0] ?? "your school's address")
      : `${shown.slice(0, -1).join(", ")} or ${shown[shown.length - 1]}`;
  return `Use your ${schoolName} email, ending in ${list}.`;
}

/** After submitting. */
export function interestFormDoneLine(chapterName: string): string {
  return `${chapterName} has your details and will be in touch. We've emailed you a copy.`;
}

/** The Recruitment module page's words for the form's settings. */
export const INTEREST_FORM_SETTINGS_COPY = {
  title: "Interest form",
  intro:
    "A public page PNMs fill in from a link or a QR code. Each submission lands in your pipeline's first stage.",
  open: "Taking interest",
  closed: "Closed",
  openAction: "Open the form",
  closeAction: "Close the form",
  link: "Link",
  copyLink: "Copy link",
  copied: "Copied",
  blurb: "Blurb",
  blurbHint: "A few lines PNMs read at the top of the form.",
  questions: "Your questions",
  questionsHint: `Up to ${INTEREST_FORM_QUESTIONS_MAX}, after name, email, class year and phone. Answers stay with your chapter.`,
  addQuestion: "Add a question",
  askReferrer: "Ask “Who referred you?”",
  labels: "QR codes",
  labelsHint:
    "One code per place you share it, such as tabling-quad. Each submission records which code it came from.",
  addLabel: "Add a code",
  labelPlaceholder: "tabling-quad",
  downloadQr: "Download QR",
  defaultQr: "Main link",
  contacts: "Recruitment contacts",
  contactsHint:
    "A group told about each new submission, beside everyone who manages recruitment.",
  contactsNone: "Only those who manage recruitment",
  contactsSkipped: (names: readonly string[]) =>
    `${names.join(", ")} can't see recruitment, so ${names.length === 1 ? "isn't" : "aren't"} told.`,
  replace: "Replace form",
  replaceConfirm:
    "Replace the form? Its link and every QR code stop working, and a new link takes their place. Your questions and codes carry over.",
  save: "Save",
  saved: "Saved",
  readOnly: "Only members who manage recruitment can change the form.",
  nphc: "Interest forms aren't offered for NPHC chapters, whose intake works differently.",
  loadFailed: "Couldn't load the interest form.",
  saveFailed: "Couldn't save. Try again.",
} as const;
