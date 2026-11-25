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
  /** "Withdraw or delete my info": the single-purpose link (#5977). */
  withdrawUrl: string;
}

export interface SendInterestFormPushedUpEmailParams {
  to: string;
  chapterName: string;
  councilName: string;
}

export interface SendBidConfirmEmailParams {
  /** The PNM's address, as the member who recorded the acceptance gave it. */
  to: string;
  /** The one-tap page, its token in the fragment so no server logs it. */
  confirmUrl: string;
  /** The chapter's name, for the subject and body. */
  chapterName: string;
  /** Who recorded the acceptance, by display name. Null drops it. */
  recorderName: string | null;
  /**
   * Whole days until the bid expires if nobody confirms it ("in 7 days"),
   * not a date, which would need the PNM's time zone; null for a bid with no
   * expiry, which drops the line.
   */
  expiresInDays: number | null;
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
  /**
   * A recorded bid acceptance's one-tap confirmation (#5973). Same contract:
   * never throws, `false` when it didn't go out.
   */
  sendBidConfirmEmail(params: SendBidConfirmEmailParams): Promise<boolean>;
}
