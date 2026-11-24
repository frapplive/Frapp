export const EMAIL_PROVIDER = 'EMAIL_PROVIDER';

export interface SendInviteEmailParams {
  /** Recipient address. */
  to: string;
  /** Full `${origin}/join?token=…` URL the recipient redeems. */
  joinUrl: string;
  /**
   * Name of the role the invite grants, shown in the email body. Null when
   * it grants only the chapter's Everyone role, which joins as nobody in
   * particular, so the email names no role (as the invite card does).
   */
  role: string | null;
  /** How many days the invite works for, written out in the email. */
  validDays: number;
  /** The chapter's name, for the subject and body. Null drops it. */
  chapterName?: string | null;
  /** Who sent the invite, by display name. Null drops it. */
  inviterName?: string | null;
}

export interface SendSchoolCodeEmailParams {
  /** The school address the code proves. */
  to: string;
  /** The six-digit code, the only copy outside the person's inbox. */
  code: string;
  /** The school's name, for the subject and body. */
  schoolName: string;
  /** How many minutes the code works for, written out in the email. */
  validMinutes: number;
}

export interface SendInterestFormCodeEmailParams {
  /** The address the PNM typed on the form. */
  to: string;
  /** The six-digit code. */
  code: string;
  /** The chapter whose form asked for it. */
  chapterName: string;
  validMinutes: number;
}

export interface SendInterestFormReceiptEmailParams {
  to: string;
  chapterName: string;
  /** The public form, so the person can find it again. */
  formUrl: string;
  /** The council their details also went to, or null for none. */
  councilName: string | null;
}

export interface SendInterestFormPushedUpEmailParams {
  to: string;
  chapterName: string;
  councilName: string;
}

/**
 * Transport for transactional invite email. Delivery is best-effort per
 * address: implementations must never throw, and report success/failure via
 * the return value so a bulk send can report which addresses actually went
 * out without failing the whole batch.
 */
export interface IEmailProvider {
  sendInviteEmail(params: SendInviteEmailParams): Promise<boolean>;
  /**
   * The school-email one-time code (#5929). Same contract: never throws,
   * `false` when the code didn't go out.
   */
  sendSchoolCodeEmail(params: SendSchoolCodeEmailParams): Promise<boolean>;
  /** The interest form's one-time code (#5977). Same contract. */
  sendInterestFormCodeEmail(
    params: SendInterestFormCodeEmailParams,
  ): Promise<boolean>;
  /** The confirmation after an interest-form submission (#5977). */
  sendInterestFormReceiptEmail(
    params: SendInterestFormReceiptEmailParams,
  ): Promise<boolean>;
  /**
   * A form submitter's details went to the council once the chapter's link
   * was accepted (`ifc-recruitment.md` § Before the chapter's council link
   * is accepted).
   */
  sendInterestFormPushedUpEmail(
    params: SendInterestFormPushedUpEmailParams,
  ): Promise<boolean>;
}
