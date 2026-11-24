import type {
  ChapterInterestForm,
  ChapterInterestFormLabel,
  ConfirmInterestFormCodeResult,
  InterestFormSubmission,
  InterestFormVerification,
  PushUpChapterFormResult,
  StartInterestFormCodeResult,
  SubmitInterestFormResult,
} from '../entities/interest-form.entity';
import type { FormQuestion } from '../utils/form-card-rules';

export const INTEREST_FORM_REPOSITORY = 'INTEREST_FORM_REPOSITORY';

/** What an officer may change on the live form. */
export type InterestFormPatch = Partial<{
  is_open: boolean;
  blurb: string | null;
  questions: FormQuestion[];
  ask_referrer: boolean;
  contacts_group_id: string | null;
}>;

/** The chapter's place, for the public page and the consent text. */
export interface InterestFormPlace {
  /** The chapter's active schools, oldest link first. */
  schools: { id: string; name: string; domains: string[] }[];
  /** Its accepted, verified council at one of them, or null. */
  council: { id: string; name: string } | null;
}

/** What a verified person's form is filled with: their last answers. */
export interface InterestFormPrefill {
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  class_year: number | null;
  phone: string | null;
}

/**
 * Interest forms (#5977, `ifc-recruitment.md` § Chapter interest forms).
 * An officer's reads and writes are keyed by the chapter; the public page's
 * by the form, whose slug it found. Codes, the submission and the push-up
 * run in the database functions, so each holds in one transaction.
 */
export interface IInterestFormRepository {
  /** The chapter's live form, or null. */
  findLiveForm(chapterId: string): Promise<ChapterInterestForm | null>;
  /**
   * Creates the chapter's live form, closed. When another request made it
   * first (the one-live index), answers that one.
   */
  createForm(
    chapterId: string,
    slug: string,
    actor: string,
  ): Promise<ChapterInterestForm>;
  updateForm(
    formId: string,
    chapterId: string,
    patch: InterestFormPatch,
  ): Promise<ChapterInterestForm>;
  /**
   * Retires the live form and opens its replacement at `slug` with the same
   * settings and labels. Null when the chapter had no live form.
   */
  replaceForm(
    chapterId: string,
    slug: string,
    actor: string,
  ): Promise<ChapterInterestForm | null>;
  /** The form at a slug, live or replaced; null for none. */
  findBySlug(slug: string): Promise<ChapterInterestForm | null>;

  findLabels(formId: string): Promise<ChapterInterestFormLabel[]>;
  /** Null when the form already has the label. */
  addLabel(
    formId: string,
    label: string,
  ): Promise<ChapterInterestFormLabel | null>;
  /** Whether a label of this form was removed. */
  removeLabel(formId: string, labelId: string): Promise<boolean>;

  findPlace(chapterId: string): Promise<InterestFormPlace>;

  startCode(params: {
    formId: string;
    email: string;
    codeSalt: string;
    codeHash: string;
    ipHash: string | null;
    ttlSeconds: number;
    windowSeconds: number;
    maxPerAddress: number;
    maxPerIp: number;
    cooldownSeconds: number;
  }): Promise<StartInterestFormCodeResult>;
  /** Deletes an open code whose email didn't go out. */
  discardCode(formId: string, verificationId: string): Promise<void>;
  /** The address's newest code on the form, open or closed. */
  findLatestCode(
    formId: string,
    email: string,
  ): Promise<InterestFormVerification | null>;
  confirmCode(params: {
    formId: string;
    verificationId: string;
    codeHash: string;
    proofHash: string;
    proofTtlSeconds: number;
    maxAttempts: number;
  }): Promise<ConfirmInterestFormCodeResult>;
  /** The details last given for this address at this chapter or school. */
  findPrefill(
    chapterId: string,
    schoolIds: string[],
    email: string,
  ): Promise<InterestFormPrefill | null>;

  submit(params: {
    formId: string;
    verificationId: string;
    proofHash: string;
    firstName: string;
    lastName: string;
    preferredName: string | null;
    classYear: number | null;
    phone: string | null;
    answers: Record<string, string | string[]>;
    referrerText: string | null;
    sourceLabel: string | null;
    consentVersion: string;
    consentBoxes: string[];
  }): Promise<SubmitInterestFormResult>;

  pushUpChapter(chapterId: string): Promise<PushUpChapterFormResult>;

  /** A candidate's newest submission at the chapter, or null. */
  findLatestSubmission(
    chapterId: string,
    candidateId: string,
  ): Promise<InterestFormSubmission | null>;
}
