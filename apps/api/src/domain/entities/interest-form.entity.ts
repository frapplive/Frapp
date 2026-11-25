/**
 * A chapter's interest form (#5977, `ifc-recruitment.md` § Chapter interest
 * forms; `20261125005308_chapter_interest_forms.sql`). Every table is RLS on
 * with no policies, reached only through the service-role client.
 */
import type { FormQuestion } from '../utils/form-card-rules';

/** A row of `chapter_interest_forms`. */
export interface ChapterInterestForm {
  id: string;
  chapter_id: string;
  /** The public page is `/f/<slug>`; never reused. */
  slug: string;
  is_open: boolean;
  blurb: string | null;
  /** The chapter's own questions, the chat form card's shape (#3926). */
  questions: FormQuestion[];
  ask_referrer: boolean;
  /** Set when the chapter replaced the form; its slug stops answering. */
  replaced_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** A row of `chapter_interest_form_labels`: one QR source label. */
export interface ChapterInterestFormLabel {
  id: string;
  form_id: string;
  label: string;
  created_at: string;
}

export type InterestFormVerificationOutcome =
  'verified' | 'superseded' | 'exhausted' | 'used';

/** A row of `interest_form_verifications`: one code sent from the form. */
export interface InterestFormVerification {
  id: string;
  form_id: string;
  email: string;
  code_salt: string;
  code_hash: string;
  ip_hash: string | null;
  attempts: number;
  expires_at: string;
  closed_at: string | null;
  outcome: InterestFormVerificationOutcome | null;
  proof_hash: string | null;
  proof_expires_at: string | null;
  created_at: string;
}

/** A row of `interest_form_submissions`, with its consent record. */
export interface InterestFormSubmission {
  id: string;
  form_id: string;
  chapter_id: string;
  pnm_id: string | null;
  candidate_id: string | null;
  email: string;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  class_year: number | null;
  phone: string | null;
  /** Answers keyed by question id, as `normalizeFormAnswers` stores them. */
  answers: Record<string, string | string[]>;
  /** The questions as the form asked them when this was sent. */
  questions: FormQuestion[];
  referrer_text: string | null;
  referrer_user_id: string | null;
  link_candidate_id: string | null;
  source_label: string | null;
  consent_version: string;
  consent_boxes: string[];
  /** The emailed withdraw link's token, hashed; spent by the withdrawal. */
  withdraw_token_hash: string | null;
  withdraw_expires_at: string | null;
  consented_at: string;
  created_at: string;
}

/** What `start_interest_form_code` answers. */
export interface StartInterestFormCodeResult {
  ok: boolean;
  reason?:
    | 'form_closed'
    | 'wrong_domain'
    | 'school_not_verifiable'
    | 'cooldown'
    | 'address_limit'
    | 'ip_limit';
  id?: string;
  expires_at?: string;
  retry_after_seconds?: number;
}

/** What `confirm_interest_form_code` answers. */
export interface ConfirmInterestFormCodeResult {
  ok: boolean;
  reason?: 'no_code' | 'expired' | 'too_many_attempts' | 'wrong_code';
  attempts_left?: number;
  email?: string;
}

/** What `submit_interest_form` answers. */
export interface SubmitInterestFormResult {
  ok: boolean;
  reason?: string;
  submission_id?: string;
  chapter_id?: string;
  pnm_id?: string | null;
  candidate_id?: string;
  candidate_created?: boolean;
  pushed_up?: boolean;
  council_id?: string | null;
  email?: string;
  display_name?: string;
}

/** One PNM `push_up_chapter_form_interests` added to a master list. */
export interface PushedUpPnm {
  pnm_id: string;
  email: string;
  first_name: string;
}

/** What `push_up_chapter_form_interests` answers. */
export interface PushUpChapterFormResult {
  council_id: string | null;
  pushed: PushedUpPnm[];
}

/** What `preview_interest_form_withdrawal` answers. */
export interface InterestFormWithdrawalPreview {
  ok: boolean;
  reason?: 'bad_token';
  chapter_name?: string;
  /** Whether the address has a school-wide record "everywhere" deletes. */
  at_school?: boolean;
}

export type InterestFormWithdrawalScope = 'chapter' | 'everywhere';

/** What `withdraw_interest_form` answers. */
export interface InterestFormWithdrawalResult {
  ok: boolean;
  reason?: 'bad_token' | 'bad_scope';
  candidates?: number;
}
