import { randomBytes, randomInt } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  chapterTextMark,
  INTEREST_FORM_AGREE_BOX,
  INTEREST_FORM_AGREE_LABEL,
  INTEREST_FORM_BLURB_MAX_LENGTH,
  INTEREST_FORM_CODE_LENGTH,
  INTEREST_FORM_CODE_MAX_ATTEMPTS,
  INTEREST_FORM_CODE_RESEND_SECONDS,
  INTEREST_FORM_CODE_TTL_SECONDS,
  INTEREST_FORM_CODE_WINDOW_SECONDS,
  INTEREST_FORM_CODES_PER_ADDRESS,
  INTEREST_FORM_CODES_PER_IP,
  INTEREST_FORM_CONSENT_VERSION,
  INTEREST_FORM_LABEL_PATTERN,
  INTEREST_FORM_LABELS_MAX,
  INTEREST_FORM_PHONE_MAX_LENGTH,
  INTEREST_FORM_PHONE_MIN_LENGTH,
  INTEREST_FORM_PROOF_TTL_SECONDS,
  INTEREST_FORM_QUESTIONS_MAX,
  INTEREST_FORM_REFUSAL,
  INTEREST_FORM_REFUSAL_COPY,
  INTEREST_FORM_SETTINGS_COPY,
  INTEREST_FORM_COPY,
  interestFormConsentText,
  interestFormPath,
  interestFormSensitiveLine,
  interestFormSensitiveTopic,
  isPlainSchoolEmail,
  normalizeInterestFormLabel,
  schoolRateLimitedLine,
  schoolWrongDomainLine,
  type ConsentRun,
} from '@repo/validation';
import { orgHidingGreekLettersIn } from '@repo/org-archetypes';
import { EMAIL_PROVIDER } from '#domain/adapters/email.interface';
import type { IEmailProvider } from '#domain/adapters/email.interface';
import { SystemPermissions } from '#domain/constants/permissions';
import type { Chapter } from '#domain/entities/chapter.entity';
import type {
  ChapterInterestForm,
  ChapterInterestFormLabel,
  InterestFormSubmission,
} from '#domain/entities/interest-form.entity';
import {
  CHAPTER_GROUP_REPOSITORY,
  type IChapterGroupRepository,
} from '#domain/repositories/chapter-group.repository.interface';
import {
  CHAPTER_REPOSITORY,
  type IChapterRepository,
} from '#domain/repositories/chapter.repository.interface';
import {
  INTEREST_FORM_REPOSITORY,
  type IInterestFormRepository,
  type InterestFormPatch,
  type InterestFormPlace,
  type InterestFormPrefill,
} from '#domain/repositories/interest-form.repository.interface';
import {
  USER_REPOSITORY,
  type IUserRepository,
} from '#domain/repositories/user.repository.interface';
import {
  normalizeFormAnswers,
  normalizeFormQuestions,
  type FormQuestion,
} from '#domain/utils/form-card-rules';
import { resolveAppOrigin } from '../../infrastructure/email/invite-link.util';
import { reportCaughtFailure } from '../../infrastructure/observability/report-caught-failure';
import { EMAIL_SEND_CONCURRENCY, mapWithConcurrency } from './email-send-pool';
import { NotificationService } from './notification.service';
import { hashCodeIp, hashSchoolCode } from './school.service';
import { RbacService } from './rbac.service';

/** The officer's view of the form on the Recruitment module page. */
export interface InterestFormSettingsView {
  /** False for an NPHC chapter, which never gets a form. */
  offered: boolean;
  form: {
    id: string;
    slug: string;
    path: string;
    is_open: boolean;
    blurb: string | null;
    questions: FormQuestion[];
    ask_referrer: boolean;
    contacts_group_id: string | null;
    updated_at: string;
  } | null;
  labels: { id: string; label: string; path: string }[];
  /** Members of the contacts Group who lack `rush:view`, so aren't told. */
  contacts_skipped: { user_id: string; display_name: string }[];
}

/** What the public page reads: the form's public fields only. */
export interface PublicInterestFormView {
  slug: string;
  is_open: boolean;
  chapter: {
    name: string;
    university: string;
    mark_text: string | null;
    accent_color: string | null;
  };
  blurb: string | null;
  questions: FormQuestion[];
  ask_referrer: boolean;
  /** The source label from the QR code, when the form has it. */
  source_label: string | null;
  verify: {
    /** The school whose address the code goes to; null for any address. */
    school_name: string | null;
    domains: string[];
  };
  consent: {
    version: string;
    runs: ConsentRun[];
    agree_label: string;
  };
}

export interface InterestFormCodeSent {
  email: string;
  expires_at: string;
  resend_after_seconds: number;
}

export interface InterestFormVerified {
  email: string;
  /** Spent once by the submission; good for `INTEREST_FORM_PROOF_TTL_SECONDS`. */
  proof: string;
  prefill: InterestFormPrefill | null;
}

export interface InterestFormSubmitInput {
  proof: string;
  first_name: string;
  last_name: string;
  preferred_name?: string | null;
  class_year?: number | null;
  phone?: string | null;
  answers?: Record<string, unknown>;
  referrer?: string | null;
  source_label?: string | null;
  agree: boolean;
}

export interface InterestFormSubmitted {
  chapter_name: string;
}

/** A candidate's newest form submission, as the chapter reads it. */
export interface CandidateFormView {
  submitted_at: string;
  email: string;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  class_year: number | null;
  phone: string | null;
  source_label: string | null;
  referrer_text: string | null;
  referrer_suggestion: { user_id: string; display_name: string } | null;
  answers: { question: string; answer: string }[];
}

/**
 * A salted SHA-256, hex: the code with its row's salt, a proof with its
 * verification's id. #5929's school code hash, one rule for both.
 */
export const hashInterestFormSecret = hashSchoolCode;

/** The IP the form's ceilings count by, hashed (`hashCodeIp`'s caveat holds). */
export function hashInterestFormIp(ip: string | undefined): string | null {
  return hashCodeIp(ip, 'interest-form-ip');
}

/** A form slug: 10 characters a printed QR code and a phone both read cleanly. */
const SLUG_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const SLUG_LENGTH = 10;

const SLUG_DIGITS = '23456789';

/**
 * Always holds a digit, so analytics never mistakes the slug for a screen
 * name (`SCREEN_SEGMENT` in `@repo/observability`'s `analytics-path.ts`
 * keeps an all-letter segment) and records `/f/[id]`.
 */
export function mintInterestFormSlug(): string {
  const chars: string[] = [];
  for (let i = 0; i < SLUG_LENGTH; i += 1) {
    chars.push(SLUG_ALPHABET[randomInt(0, SLUG_ALPHABET.length)]);
  }
  chars[randomInt(0, SLUG_LENGTH)] =
    SLUG_DIGITS[randomInt(0, SLUG_DIGITS.length)];
  return chars.join('');
}

/** `<verification uuid>.<43-character secret>`; anything else is refused before the database. */
const PROOF_SHAPE =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/;
const SLUG_SHAPE = /^[a-z0-9]{8,32}$/;

function refused(
  status: HttpStatus,
  code: string,
  message: string,
): HttpException {
  return new HttpException({ code, message }, status);
}

function formNotFound(): NotFoundException {
  return new NotFoundException({
    code: INTEREST_FORM_REFUSAL.notFound,
    message: INTEREST_FORM_COPY.notFoundBody,
  });
}

function formClosed(): ConflictException {
  return new ConflictException({
    code: INTEREST_FORM_REFUSAL.closed,
    message: INTEREST_FORM_COPY.closedBody,
  });
}

/** Whether the chapter may take interest at all (`interest_form_chapter_ok`). */
function chapterTakesInterest(chapter: Chapter | null): chapter is Chapter {
  return (
    !!chapter &&
    (chapter.kind ?? 'chapter') === 'chapter' &&
    chapter.org_archetype !== 'nphc' &&
    chapter.enabled_modules?.rush !== false
  );
}

/**
 * A chapter's interest form (#5977, `spec/behavior/ifc-recruitment.md`
 * § Chapter interest forms): its settings for `rush:manage`, the public
 * page at `/f/<form-slug>` (ADR-27), the one-time code that comes first,
 * the submission, and telling the chapter.
 *
 * The code is #5929's pattern (six digits, salted hash, ceilings counted by
 * the database under locks), keyed on the form rather than an account,
 * since a PNM has none. A matched code mints a proof, `<id>.<secret>`; the
 * submission spends it once, so every submission is one verified address's
 * own, and the per-address and per-IP code ceilings are the submission
 * ceilings too. Everything the submission writes happens in
 * `submit_interest_form`, one transaction; the push and inbox item, and the
 * emails, follow it and never fail it.
 */
@Injectable()
export class InterestFormService {
  private readonly logger = new Logger(InterestFormService.name);

  constructor(
    @Inject(INTEREST_FORM_REPOSITORY)
    private readonly forms: IInterestFormRepository,
    @Inject(CHAPTER_REPOSITORY) private readonly chapters: IChapterRepository,
    @Inject(CHAPTER_GROUP_REPOSITORY)
    private readonly groups: IChapterGroupRepository,
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(EMAIL_PROVIDER) private readonly email: IEmailProvider,
    private readonly rbac: RbacService,
    private readonly notifications: NotificationService,
    private readonly config: ConfigService,
  ) {}

  // The chapter's side ---------------------------------------------------------

  /**
   * The form's settings. The form exists as soon as the Rush module is on
   * (§ Every chapter has one), so the first read writes it, closed.
   */
  async getSettings(
    chapterId: string,
    actor: string,
  ): Promise<InterestFormSettingsView> {
    const chapter = await this.chapters.findById(chapterId);
    if (!chapterTakesInterest(chapter)) {
      return { offered: false, form: null, labels: [], contacts_skipped: [] };
    }
    const form = await this.liveForm(chapterId, actor);
    return this.settingsView(chapterId, form);
  }

  async updateSettings(
    chapterId: string,
    actor: string,
    input: {
      is_open?: boolean;
      blurb?: string | null;
      questions?: unknown[];
      ask_referrer?: boolean;
      contacts_group_id?: string | null;
    },
  ): Promise<InterestFormSettingsView> {
    const form = await this.offeredForm(chapterId, actor);
    const patch: InterestFormPatch = {};
    if (input.is_open !== undefined) patch.is_open = input.is_open;
    if (input.ask_referrer !== undefined) {
      patch.ask_referrer = input.ask_referrer;
    }
    if (input.blurb !== undefined) {
      const blurb = input.blurb?.trim() ?? '';
      if (blurb.length > INTEREST_FORM_BLURB_MAX_LENGTH) {
        throw new BadRequestException(
          `The blurb can be at most ${INTEREST_FORM_BLURB_MAX_LENGTH} characters`,
        );
      }
      patch.blurb = blurb || null;
    }
    if (input.questions !== undefined) {
      patch.questions = this.checkQuestions(input.questions);
    }
    if (input.contacts_group_id !== undefined) {
      if (input.contacts_group_id) {
        const group = await this.groups.findById(
          input.contacts_group_id,
          chapterId,
        );
        if (!group) {
          throw new NotFoundException({
            code: INTEREST_FORM_REFUSAL.groupNotFound,
            message: 'That group isn’t in this chapter.',
          });
        }
      }
      patch.contacts_group_id = input.contacts_group_id ?? null;
    }
    const updated = Object.keys(patch).length
      ? await this.forms.updateForm(form.id, chapterId, patch)
      : form;
    return this.settingsView(chapterId, updated);
  }

  async addLabel(
    chapterId: string,
    actor: string,
    raw: string,
  ): Promise<InterestFormSettingsView> {
    const form = await this.offeredForm(chapterId, actor);
    const label = normalizeInterestFormLabel(raw);
    if (!INTEREST_FORM_LABEL_PATTERN.test(label)) {
      throw new BadRequestException({
        code: INTEREST_FORM_REFUSAL.invalidLabel,
        message: 'Name the code with letters or digits, such as tabling-quad.',
      });
    }
    const labels = await this.forms.findLabels(form.id);
    if (labels.length >= INTEREST_FORM_LABELS_MAX) {
      throw new BadRequestException({
        code: INTEREST_FORM_REFUSAL.tooManyLabels,
        message: `A form can have at most ${INTEREST_FORM_LABELS_MAX} QR codes.`,
      });
    }
    const added = await this.forms.addLabel(form.id, label);
    if (!added) {
      throw new ConflictException({
        code: INTEREST_FORM_REFUSAL.labelExists,
        message: `The form already has a ${label} code.`,
      });
    }
    return this.settingsView(chapterId, form);
  }

  async removeLabel(
    chapterId: string,
    actor: string,
    labelId: string,
  ): Promise<InterestFormSettingsView> {
    const form = await this.offeredForm(chapterId, actor);
    const removed = await this.forms.removeLabel(form.id, labelId);
    if (!removed) throw new NotFoundException('No such QR code');
    return this.settingsView(chapterId, form);
  }

  /**
   * Replaces the form: its slug and every printed code stop answering, and
   * a new slug takes their place with the same settings and labels (ADR-27).
   */
  async replace(
    chapterId: string,
    actor: string,
  ): Promise<InterestFormSettingsView> {
    await this.offeredForm(chapterId, actor);
    const next = await this.forms.replaceForm(
      chapterId,
      mintInterestFormSlug(),
      actor,
    );
    return this.settingsView(
      chapterId,
      next ?? (await this.liveForm(chapterId, actor)),
    );
  }

  /** A candidate's newest form submission, for the candidate's page. */
  async candidateForm(
    chapterId: string,
    candidateId: string,
  ): Promise<CandidateFormView | null> {
    const submission = await this.forms.findLatestSubmission(
      chapterId,
      candidateId,
    );
    if (!submission) return null;
    // The questions as the PNM saw them: an officer may have since retitled,
    // retyped or removed one, and the answers belong to the asked words.
    const questions = submission.questions ?? [];
    const referrer = submission.referrer_user_id
      ? await this.users.findById(submission.referrer_user_id)
      : null;
    return {
      submitted_at: submission.created_at,
      email: submission.email,
      first_name: submission.first_name,
      last_name: submission.last_name,
      preferred_name: submission.preferred_name,
      class_year: submission.class_year,
      phone: submission.phone,
      source_label: submission.source_label,
      referrer_text: submission.referrer_text,
      referrer_suggestion: referrer
        ? { user_id: referrer.id, display_name: referrer.display_name }
        : null,
      answers: answerLines(questions, submission),
    };
  }

  /**
   * After a chapter's council link is accepted or a season opened: the chapter's form PNMs join the master list, and each
   * is emailed that their details went to the council (§ Before the
   * chapter's council link is accepted). Never throws: the step that
   * triggered it has already happened.
   */
  async pushUpChapter(chapterId: string): Promise<number> {
    try {
      const result = await this.forms.pushUpChapter(chapterId);
      if (!result.council_id || result.pushed.length === 0) return 0;
      const [chapter, council] = await Promise.all([
        this.chapters.findById(chapterId),
        this.chapters.findById(result.council_id),
      ]);
      if (chapter && council) {
        const sent = await mapWithConcurrency(
          result.pushed,
          EMAIL_SEND_CONCURRENCY,
          (pnm) =>
            this.email.sendInterestFormPushedUpEmail({
              to: pnm.email,
              chapterName: chapter.name,
              councilName: council.name,
            }),
        );
        const failed = sent.filter((ok) => !ok).length;
        if (failed > 0) {
          this.logger.warn(
            `${failed} of ${sent.length} push-up emails did not go out (chapter ${chapterId})`,
          );
        }
      }
      return result.pushed.length;
    } catch (error) {
      reportCaughtFailure(this.logger, {
        level: 'warning',
        site: 'interest-form-push-up',
        message: `Could not push chapter ${chapterId}'s form PNMs up to its council`,
        error,
      });
      return 0;
    }
  }

  // The public page --------------------------------------------------------------

  async getPublic(
    slug: string,
    sourceLabel?: string | null,
  ): Promise<PublicInterestFormView> {
    const { form, chapter } = await this.publicForm(slug);
    const [place, labels] = await Promise.all([
      this.forms.findPlace(chapter.id),
      this.forms.findLabels(form.id),
    ]);
    const label = sourceLabel ? normalizeInterestFormLabel(sourceLabel) : '';
    const school = place.schools[0] ?? null;
    const branding = orgHidingGreekLettersIn(chapter.name)
      ? { ...chapter.branding, show_greek_letters: false }
      : chapter.branding;
    return {
      slug: form.slug,
      is_open: form.is_open,
      chapter: {
        name: chapter.name,
        university: chapter.university,
        mark_text: chapterTextMark(branding)?.text ?? null,
        accent_color: chapter.accent_color,
      },
      blurb: form.blurb,
      questions: form.is_open ? form.questions : [],
      ask_referrer: form.ask_referrer,
      source_label: labels.some((row) => row.label === label) ? label : null,
      verify: {
        school_name: school?.name ?? null,
        domains: place.schools.flatMap((row) => row.domains),
      },
      consent: {
        version: INTEREST_FORM_CONSENT_VERSION,
        runs: interestFormConsentText(consentNames(chapter, place)),
        agree_label: INTEREST_FORM_AGREE_LABEL,
      },
    };
  }

  async startCode(
    slug: string,
    rawEmail: string,
    ip: string | undefined,
  ): Promise<InterestFormCodeSent> {
    const { form, chapter } = await this.publicForm(slug);
    if (!form.is_open) throw formClosed();
    const email = rawEmail.trim().toLowerCase();
    if (!isPlainSchoolEmail(email)) {
      throw new BadRequestException({
        code: INTEREST_FORM_REFUSAL.invalidEmail,
        message: INTEREST_FORM_COPY.notAnEmail,
      });
    }

    const code = randomInt(0, 10 ** INTEREST_FORM_CODE_LENGTH)
      .toString()
      .padStart(INTEREST_FORM_CODE_LENGTH, '0');
    const salt = randomBytes(16).toString('hex');
    const result = await this.forms.startCode({
      formId: form.id,
      email,
      codeSalt: salt,
      codeHash: hashInterestFormSecret(salt, code),
      ipHash: hashInterestFormIp(ip),
      ttlSeconds: INTEREST_FORM_CODE_TTL_SECONDS,
      windowSeconds: INTEREST_FORM_CODE_WINDOW_SECONDS,
      maxPerAddress: INTEREST_FORM_CODES_PER_ADDRESS,
      maxPerIp: INTEREST_FORM_CODES_PER_IP,
      cooldownSeconds: INTEREST_FORM_CODE_RESEND_SECONDS,
    });

    if (!result.ok || !result.id || !result.expires_at) {
      switch (result.reason) {
        case 'form_closed':
          throw formClosed();
        case 'wrong_domain': {
          const place = await this.forms.findPlace(chapter.id);
          throw new BadRequestException({
            code: INTEREST_FORM_REFUSAL.wrongDomain,
            message: schoolWrongDomainLine(
              place.schools[0]?.name ?? 'school',
              place.schools.flatMap((row) => row.domains),
            ),
          });
        }
        case 'school_not_verifiable':
          throw new ConflictException({
            code: INTEREST_FORM_REFUSAL.unavailable,
            message: INTEREST_FORM_REFUSAL_COPY.unavailable,
          });
        case 'cooldown':
          throw refused(
            HttpStatus.TOO_MANY_REQUESTS,
            INTEREST_FORM_REFUSAL.cooldown,
            schoolRateLimitedLine(result.retry_after_seconds ?? 30),
          );
        default:
          // address_limit, ip_limit: one sentence for both, so the refusal
          // doesn't say whose ceiling it is.
          throw refused(
            HttpStatus.TOO_MANY_REQUESTS,
            INTEREST_FORM_REFUSAL.rateLimited,
            schoolRateLimitedLine(
              result.retry_after_seconds ?? INTEREST_FORM_CODE_WINDOW_SECONDS,
            ),
          );
      }
    }

    const sent = await this.email.sendInterestFormCodeEmail({
      to: email,
      code,
      chapterName: chapter.name,
      validMinutes: Math.round(INTEREST_FORM_CODE_TTL_SECONDS / 60),
    });
    if (!sent) {
      await this.forms.discardCode(form.id, result.id).catch(() => undefined);
      this.logger.warn(
        `Interest form code email did not go out (form ${form.id})`,
      );
      throw new ServiceUnavailableException({
        code: INTEREST_FORM_REFUSAL.sendFailed,
        message: INTEREST_FORM_REFUSAL_COPY.sendFailed,
      });
    }
    return {
      email,
      expires_at: result.expires_at,
      resend_after_seconds: INTEREST_FORM_CODE_RESEND_SECONDS,
    };
  }

  /**
   * Checks a typed code. On a match, answers the proof the submission
   * spends and, only now, the details this address last gave (verify
   * first: a stranger who types someone's address learns nothing).
   */
  async confirmCode(
    slug: string,
    rawEmail: string,
    rawCode: string,
  ): Promise<InterestFormVerified> {
    const { form, chapter } = await this.publicForm(slug);
    if (!form.is_open) throw formClosed();
    const email = rawEmail.trim().toLowerCase();
    const latest = await this.forms.findLatestCode(form.id, email);
    if (!latest) {
      throw new BadRequestException({
        code: INTEREST_FORM_REFUSAL.noCode,
        message: INTEREST_FORM_REFUSAL_COPY.noCode,
      });
    }
    const secret = randomBytes(32).toString('base64url');
    const result = await this.forms.confirmCode({
      formId: form.id,
      verificationId: latest.id,
      codeHash: hashInterestFormSecret(latest.code_salt, rawCode.trim()),
      proofHash: hashInterestFormSecret(latest.id, secret),
      proofTtlSeconds: INTEREST_FORM_PROOF_TTL_SECONDS,
      maxAttempts: INTEREST_FORM_CODE_MAX_ATTEMPTS,
    });
    if (!result.ok) {
      switch (result.reason) {
        case 'expired':
          throw new BadRequestException({
            code: INTEREST_FORM_REFUSAL.expired,
            message: INTEREST_FORM_REFUSAL_COPY.expired,
          });
        case 'too_many_attempts':
          throw refused(
            HttpStatus.TOO_MANY_REQUESTS,
            INTEREST_FORM_REFUSAL.tooManyAttempts,
            INTEREST_FORM_REFUSAL_COPY.tooManyAttempts,
          );
        case 'wrong_code':
          throw new BadRequestException({
            code: INTEREST_FORM_REFUSAL.wrongCode,
            message: INTEREST_FORM_REFUSAL_COPY.wrongCode,
          });
        default:
          throw new BadRequestException({
            code: INTEREST_FORM_REFUSAL.noCode,
            message: INTEREST_FORM_REFUSAL_COPY.noCode,
          });
      }
    }
    const place = await this.forms.findPlace(chapter.id);
    const prefill = await this.forms.findPrefill(
      chapter.id,
      place.schools.map((row) => row.id),
      email,
    );
    return { email, proof: `${latest.id}.${secret}`, prefill };
  }

  async submit(
    slug: string,
    input: InterestFormSubmitInput,
  ): Promise<InterestFormSubmitted> {
    const { form, chapter } = await this.publicForm(slug);
    if (!form.is_open) throw formClosed();
    if (input.agree !== true) {
      throw new BadRequestException({
        code: INTEREST_FORM_REFUSAL.consentRequired,
        message: INTEREST_FORM_REFUSAL_COPY.consentRequired,
      });
    }
    const proof = PROOF_SHAPE.exec(input.proof ?? '');
    if (!proof) throw badProof();
    const [, verificationId, secret] = proof;

    // Checked on the trimmed value, as stored: a phone counts digits.
    const phone = input.phone?.trim() || null;
    if (
      phone &&
      (phone.replace(/\D/g, '').length < INTEREST_FORM_PHONE_MIN_LENGTH ||
        phone.length > INTEREST_FORM_PHONE_MAX_LENGTH)
    ) {
      throw new BadRequestException({
        code: INTEREST_FORM_REFUSAL.invalidAnswers,
        message: INTEREST_FORM_COPY.phoneInvalid,
      });
    }

    const checked = normalizeFormAnswers(form.questions, input.answers ?? {});
    if ('error' in checked) {
      throw new BadRequestException({
        code: INTEREST_FORM_REFUSAL.invalidAnswers,
        message: checked.error,
      });
    }

    const result = await this.forms.submit({
      formId: form.id,
      verificationId,
      proofHash: hashInterestFormSecret(verificationId, secret),
      firstName: input.first_name.trim(),
      lastName: input.last_name.trim(),
      preferredName: input.preferred_name?.trim() || null,
      classYear: input.class_year ?? null,
      phone,
      answers: checked.answers,
      referrerText: form.ask_referrer ? input.referrer?.trim() || null : null,
      sourceLabel: input.source_label?.trim() || null,
      consentVersion: INTEREST_FORM_CONSENT_VERSION,
      consentBoxes: [INTEREST_FORM_AGREE_BOX],
    });
    if (!result.ok || !result.candidate_id || !result.email) {
      switch (result.reason) {
        case 'bad_proof':
          throw badProof();
        case 'form_closed':
          throw formClosed();
        default:
          // `wrong_domain`, `not_at_school`, `school_not_found`: the
          // chapter's school changed between the code and the submission.
          this.logger.warn(
            `Interest form submission refused (${result.reason ?? 'unknown'}, form ${form.id})`,
          );
          throw new ConflictException({
            code: INTEREST_FORM_REFUSAL.unavailable,
            message: INTEREST_FORM_REFUSAL_COPY.unavailable,
          });
      }
    }

    await this.tellChapter(chapter, form, {
      candidateId: result.candidate_id,
      displayName: result.display_name ?? input.first_name,
      created: result.candidate_created === true,
    });
    const council = result.council_id
      ? await this.chapters.findById(result.council_id).catch(() => null)
      : null;
    await this.email.sendInterestFormReceiptEmail({
      to: result.email,
      chapterName: chapter.name,
      formUrl: `${resolveAppOrigin(this.config)}${interestFormPath(form.slug)}`,
      councilName: council?.name ?? null,
    });
    return { chapter_name: chapter.name };
  }

  // Internals ---------------------------------------------------------------------

  /**
   * A push and an inbox item to `rush:manage` holders and the recruitment
   * contacts Group; a member of the Group without `rush:view` is skipped
   * (§ What a submission does, 5). Best-effort: the submission stands.
   */
  private async tellChapter(
    chapter: Chapter,
    form: ChapterInterestForm,
    candidate: { candidateId: string; displayName: string; created: boolean },
  ): Promise<void> {
    try {
      const receivers = await this.receivers(chapter.id, form);
      if (receivers.length === 0) return;
      await this.notifications.notifyMembers(chapter.id, receivers, {
        title: candidate.created
          ? 'New interest form'
          : 'Interest form updated',
        body: candidate.created
          ? `${candidate.displayName} filled in your interest form.`
          : `${candidate.displayName} sent your interest form again.`,
        priority: 'NORMAL',
        category: 'members',
        data: {
          target: { screen: 'rush', candidateId: candidate.candidateId },
        },
      });
    } catch (error) {
      reportCaughtFailure(this.logger, {
        level: 'warning',
        site: 'interest-form-notify',
        message: `Could not tell chapter ${chapter.id} about a form submission`,
        error,
      });
    }
  }

  private async receivers(
    chapterId: string,
    form: ChapterInterestForm,
  ): Promise<string[]> {
    const [managers, viewers, contacts] = await Promise.all([
      this.rbac.findUserIdsWithPermissions(chapterId, [
        SystemPermissions.RUSH_MANAGE,
      ]),
      this.rbac.findUserIdsWithPermissions(chapterId, [
        SystemPermissions.RUSH_VIEW,
      ]),
      form.contacts_group_id
        ? this.groups.findMemberIds(chapterId, form.contacts_group_id)
        : Promise.resolve([] as string[]),
    ]);
    const canView = new Set(viewers);
    return [
      ...new Set([...managers, ...contacts.filter((id) => canView.has(id))]),
    ];
  }

  private async settingsView(
    chapterId: string,
    form: ChapterInterestForm,
  ): Promise<InterestFormSettingsView> {
    const [labels, skipped] = await Promise.all([
      this.forms.findLabels(form.id),
      this.skippedContacts(chapterId, form),
    ]);
    return {
      offered: true,
      form: {
        id: form.id,
        slug: form.slug,
        path: interestFormPath(form.slug),
        is_open: form.is_open,
        blurb: form.blurb,
        questions: form.questions,
        ask_referrer: form.ask_referrer,
        contacts_group_id: form.contacts_group_id,
        updated_at: form.updated_at,
      },
      labels: labels.map((row: ChapterInterestFormLabel) => ({
        id: row.id,
        label: row.label,
        path: interestFormPath(form.slug, row.label),
      })),
      contacts_skipped: skipped,
    };
  }

  private async skippedContacts(
    chapterId: string,
    form: ChapterInterestForm,
  ): Promise<{ user_id: string; display_name: string }[]> {
    if (!form.contacts_group_id) return [];
    const [members, viewers] = await Promise.all([
      this.groups.findMemberIds(chapterId, form.contacts_group_id),
      this.rbac.findUserIdsWithPermissions(chapterId, [
        SystemPermissions.RUSH_VIEW,
      ]),
    ]);
    const canView = new Set(viewers);
    const ids = members.filter((id) => !canView.has(id));
    if (!ids.length) return [];
    const users = await this.users.findByIds(ids);
    return users
      .map((user) => ({ user_id: user.id, display_name: user.display_name }))
      .sort((a, b) => a.display_name.localeCompare(b.display_name));
  }

  private checkQuestions(raw: unknown[]): FormQuestion[] {
    if (raw.length > INTEREST_FORM_QUESTIONS_MAX) {
      throw new BadRequestException({
        code: INTEREST_FORM_REFUSAL.invalidQuestions,
        message: `A form can have at most ${INTEREST_FORM_QUESTIONS_MAX} questions of your own.`,
      });
    }
    const checked = normalizeFormQuestions(raw);
    if ('error' in checked) {
      throw new BadRequestException({
        code: INTEREST_FORM_REFUSAL.invalidQuestions,
        message: checked.error,
      });
    }
    for (const question of checked.questions) {
      const words = [
        question.title,
        ...(question.options ?? []).map((option) => option.label),
      ].join(' ');
      const topic = interestFormSensitiveTopic(words);
      if (topic) {
        throw new BadRequestException({
          code: INTEREST_FORM_REFUSAL.sensitiveQuestion,
          message: interestFormSensitiveLine(topic),
        });
      }
    }
    return checked.questions;
  }

  private async liveForm(
    chapterId: string,
    actor: string,
  ): Promise<ChapterInterestForm> {
    return (
      (await this.forms.findLiveForm(chapterId)) ??
      (await this.forms.createForm(chapterId, mintInterestFormSlug(), actor))
    );
  }

  private async offeredForm(
    chapterId: string,
    actor: string,
  ): Promise<ChapterInterestForm> {
    const chapter = await this.chapters.findById(chapterId);
    if (!chapterTakesInterest(chapter)) {
      throw new ConflictException({
        code: INTEREST_FORM_REFUSAL.notOffered,
        message: INTEREST_FORM_SETTINGS_COPY.nphc,
      });
    }
    return this.liveForm(chapterId, actor);
  }

  /**
   * The live form a slug names, and its chapter. A replaced form, an unknown
   * slug and a chapter that takes no interest all answer the same 404, so
   * the page tells a guesser nothing.
   */
  private async publicForm(
    slug: string,
  ): Promise<{ form: ChapterInterestForm; chapter: Chapter }> {
    if (!SLUG_SHAPE.test(slug)) throw formNotFound();
    const form = await this.forms.findBySlug(slug);
    if (!form || form.replaced_at) throw formNotFound();
    const chapter = await this.chapters.findById(form.chapter_id);
    if (!chapterTakesInterest(chapter)) throw formNotFound();
    return { form, chapter };
  }
}

function badProof(): BadRequestException {
  return new BadRequestException({
    code: INTEREST_FORM_REFUSAL.badProof,
    message: INTEREST_FORM_REFUSAL_COPY.badProof,
  });
}

function consentNames(chapter: Chapter, place: InterestFormPlace) {
  const school = place.schools[0] ?? null;
  return {
    chapter: chapter.name,
    school: school?.name ?? null,
    council: school ? (place.council?.name ?? null) : null,
  };
}

/** The submission's answers, each as its question's words and the answer's. */
function answerLines(
  questions: readonly FormQuestion[],
  submission: InterestFormSubmission,
): { question: string; answer: string }[] {
  const lines: { question: string; answer: string }[] = [];
  for (const question of questions) {
    const raw = submission.answers[question.id];
    if (raw === undefined) continue;
    const labelOf = (id: string) =>
      question.options?.find((option) => option.id === id)?.label ?? id;
    const answer = Array.isArray(raw)
      ? raw.map(labelOf).join(', ')
      : question.type === 'yes_no'
        ? raw === 'yes'
          ? 'Yes'
          : 'No'
        : question.options
          ? labelOf(raw)
          : raw;
    lines.push({ question: question.title, answer });
  }
  return lines;
}
