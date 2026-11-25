import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  Equals,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  FORM_QUESTION_TYPES,
  INTEREST_FORM_BLURB_MAX_LENGTH,
  INTEREST_FORM_CODE_LENGTH,
  INTEREST_FORM_LABEL_MAX_LENGTH,
  INTEREST_FORM_NAME_MAX_LENGTH,
  INTEREST_FORM_PHONE_MAX_LENGTH,
  INTEREST_FORM_PHONE_MIN_LENGTH,
  INTEREST_FORM_QUESTIONS_MAX,
  INTEREST_FORM_REFERRER_MAX_LENGTH,
  type FormQuestionType,
} from '@repo/validation';
import { IsStrictBoolean } from '../decorators/is-strict-boolean.decorator';

// Requests ------------------------------------------------------------------------

export class UpdateInterestFormDto {
  @ApiPropertyOptional({ description: 'Open or close the public page.' })
  @IsOptional()
  @IsStrictBoolean()
  is_open?: boolean;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: INTEREST_FORM_BLURB_MAX_LENGTH,
    description: 'A few lines at the top of the form; empty or null clears it.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(INTEREST_FORM_BLURB_MAX_LENGTH)
  blurb?: string | null;

  @ApiPropertyOptional({
    type: () => [InterestFormQuestionDto],
    maxItems: INTEREST_FORM_QUESTIONS_MAX,
    description:
      "The chapter's own questions, replacing the list: the chat form card's question shape (`id`, `type`, `title`, `required`, `options`). A question on a topic Frapp never collects is refused with 400 `interest_form.question.sensitive`.",
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(INTEREST_FORM_QUESTIONS_MAX)
  @IsObject({ each: true })
  questions?: InterestFormQuestionDto[];

  @ApiPropertyOptional({ description: 'Ask "Who referred you?".' })
  @IsOptional()
  @IsStrictBoolean()
  ask_referrer?: boolean;
}

export class AddInterestFormLabelDto {
  @ApiProperty({
    description:
      'A QR source label, such as `tabling-quad`. Spaces and capitals are folded to dashes and lowercase.',
    maxLength: INTEREST_FORM_LABEL_MAX_LENGTH,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(INTEREST_FORM_LABEL_MAX_LENGTH)
  label: string;
}

export class StartInterestFormCodeDto {
  @ApiProperty({
    description:
      "The PNM's address. At a chapter with a school, only an address on one of the school's verified domains is sent a code.",
    example: 'student@rpi.edu',
    maxLength: 254,
  })
  @IsEmail()
  @MaxLength(254)
  email: string;
}

export class ConfirmInterestFormCodeDto {
  @ApiProperty({ maxLength: 254 })
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({
    description: 'The six-digit code from the email.',
    minLength: INTEREST_FORM_CODE_LENGTH,
    maxLength: INTEREST_FORM_CODE_LENGTH,
  })
  @IsString()
  @Matches(new RegExp(`^\\s*\\d{${INTEREST_FORM_CODE_LENGTH}}\\s*$`), {
    message: `code must be ${INTEREST_FORM_CODE_LENGTH} digits`,
  })
  code: string;
}

export class SubmitInterestFormDto {
  @ApiProperty({
    description:
      'The proof a matched code answered (`POST …/verify`). Spent by this submission.',
    maxLength: 100,
  })
  @IsString()
  @MaxLength(100)
  proof: string;

  @ApiProperty({ maxLength: INTEREST_FORM_NAME_MAX_LENGTH })
  @IsString()
  @Matches(/\S/, { message: 'first_name must not be blank' })
  @MaxLength(INTEREST_FORM_NAME_MAX_LENGTH)
  first_name: string;

  @ApiProperty({ maxLength: INTEREST_FORM_NAME_MAX_LENGTH })
  @IsString()
  @Matches(/\S/, { message: 'last_name must not be blank' })
  @MaxLength(INTEREST_FORM_NAME_MAX_LENGTH)
  last_name: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: INTEREST_FORM_NAME_MAX_LENGTH,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(INTEREST_FORM_NAME_MAX_LENGTH)
  preferred_name?: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true, example: 2030 })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1900)
  @Max(2200)
  class_year?: number | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    minLength: INTEREST_FORM_PHONE_MIN_LENGTH,
    maxLength: INTEREST_FORM_PHONE_MAX_LENGTH,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsString()
  @Matches(/^[0-9+().\-\s]+$/, { message: 'phone must be a phone number' })
  @MinLength(INTEREST_FORM_PHONE_MIN_LENGTH)
  @MaxLength(INTEREST_FORM_PHONE_MAX_LENGTH)
  phone?: string | null;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: {
      oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    },
    description:
      "Answers to the chapter's questions keyed by question id, as a chat form card's answers are.",
  })
  @IsOptional()
  @IsObject()
  answers?: Record<string, unknown>;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: INTEREST_FORM_REFERRER_MAX_LENGTH,
    description: '"Who referred you?", free text.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(INTEREST_FORM_REFERRER_MAX_LENGTH)
  referrer?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: INTEREST_FORM_LABEL_MAX_LENGTH,
    description:
      "The QR code's source label; one the form doesn't have is recorded as none.",
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(INTEREST_FORM_LABEL_MAX_LENGTH)
  source_label?: string | null;

  @ApiProperty({
    description: '"I agree, and I\'m 18 or older": must be true.',
  })
  @IsStrictBoolean()
  @Equals(true, { message: 'agree must be true' })
  agree: boolean;
}

export class InterestFormWithdrawTokenDto {
  @ApiProperty({
    description:
      'The token from the "Withdraw or delete my info" link in the confirmation email.',
    maxLength: 64,
  })
  @IsString()
  @MaxLength(64)
  token: string;
}

export class InterestFormWithdrawDto extends InterestFormWithdrawTokenDto {
  @ApiProperty({
    enum: ['chapter', 'everywhere'],
    description:
      "`chapter` withdraws from the form's chapter; `everywhere` deletes the recruitment information.",
  })
  @IsIn(['chapter', 'everywhere'])
  scope: 'chapter' | 'everywhere';
}

// Responses -----------------------------------------------------------------------

export class InterestFormOptionDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  label: string;
}

export class InterestFormQuestionDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: FORM_QUESTION_TYPES })
  type: FormQuestionType;

  @ApiProperty()
  title: string;

  @ApiProperty()
  required: boolean;

  @ApiPropertyOptional({ type: [InterestFormOptionDto] })
  options?: InterestFormOptionDto[];
}

export class InterestFormDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ description: 'The public page is `/f/<slug>`.' })
  slug: string;

  @ApiProperty({ example: '/f/k3mz8qpt2a' })
  path: string;

  @ApiProperty()
  is_open: boolean;

  @ApiProperty({ type: String, nullable: true })
  blurb: string | null;

  @ApiProperty({ type: [InterestFormQuestionDto] })
  questions: InterestFormQuestionDto[];

  @ApiProperty()
  ask_referrer: boolean;

  @ApiProperty({ format: 'date-time' })
  updated_at: string;
}

export class InterestFormLabelDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'tabling-quad' })
  label: string;

  @ApiProperty({
    example: '/f/k3mz8qpt2a?src=tabling-quad',
    description: "The path the label's QR code opens.",
  })
  path: string;
}

export class InterestFormSettingsDto {
  @ApiProperty({
    description:
      'False for an NPHC chapter, which never gets an interest form.',
  })
  offered: boolean;

  @ApiProperty({ type: InterestFormDto, nullable: true })
  form: InterestFormDto | null;

  @ApiProperty({ type: [InterestFormLabelDto] })
  labels: InterestFormLabelDto[];
}

export class PublicInterestFormChapterDto {
  @ApiProperty()
  name: string;

  @ApiProperty()
  university: string;

  @ApiProperty({ type: String, nullable: true })
  mark_text: string | null;

  @ApiProperty({ type: String, nullable: true })
  accent_color: string | null;
}

export class PublicInterestFormVerifyDto {
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'The school whose address gets the code; null takes any address.',
  })
  school_name: string | null;

  @ApiProperty({ type: [String] })
  domains: string[];
}

export class ConsentRunDto {
  @ApiProperty()
  text: string;

  @ApiPropertyOptional({ description: 'A name shown in bold.' })
  strong?: boolean;
}

export class PublicInterestFormConsentDto {
  @ApiProperty({ description: 'Stored with each submission.' })
  version: string;

  @ApiProperty({
    type: [ConsentRunDto],
    description:
      'The approved consent text (`ifc-recruitment.md` § Consent and privacy text), shown above the submit button.',
  })
  runs: ConsentRunDto[];

  @ApiProperty({ example: "I agree, and I'm 18 or older" })
  agree_label: string;
}

export class PublicInterestFormDto {
  @ApiProperty()
  slug: string;

  @ApiProperty({ description: 'False shows "Recruitment isn\'t open".' })
  is_open: boolean;

  @ApiProperty({ type: PublicInterestFormChapterDto })
  chapter: PublicInterestFormChapterDto;

  @ApiProperty({ type: String, nullable: true })
  blurb: string | null;

  @ApiProperty({
    type: [InterestFormQuestionDto],
    description: 'Empty while the form is closed.',
  })
  questions: InterestFormQuestionDto[];

  @ApiProperty()
  ask_referrer: boolean;

  @ApiProperty({
    type: String,
    nullable: true,
    description: "The `src` label, when it's one of the form's QR codes.",
  })
  source_label: string | null;

  @ApiProperty({ type: PublicInterestFormVerifyDto })
  verify: PublicInterestFormVerifyDto;

  @ApiProperty({ type: PublicInterestFormConsentDto })
  consent: PublicInterestFormConsentDto;
}

export class InterestFormCodeSentDto {
  @ApiProperty()
  email: string;

  @ApiProperty({ format: 'date-time' })
  expires_at: string;

  @ApiProperty()
  resend_after_seconds: number;
}

export class InterestFormPrefillDto {
  @ApiProperty()
  first_name: string;

  @ApiProperty()
  last_name: string;

  @ApiProperty({ type: String, nullable: true })
  preferred_name: string | null;

  @ApiProperty({ type: Number, nullable: true })
  class_year: number | null;

  @ApiProperty({ type: String, nullable: true })
  phone: string | null;
}

export class InterestFormVerifiedDto {
  @ApiProperty()
  email: string;

  @ApiProperty({
    description:
      'Send with the submission. Good for 30 minutes and spent once.',
  })
  proof: string;

  @ApiProperty({
    type: InterestFormPrefillDto,
    nullable: true,
    description:
      'The details this address last gave, filled in only after the code matched.',
  })
  prefill: InterestFormPrefillDto | null;
}

export class InterestFormSubmittedDto {
  @ApiProperty()
  chapter_name: string;
}

export class CandidateFormAnswerDto {
  @ApiProperty()
  question: string;

  @ApiProperty()
  answer: string;
}

export class CandidateFormReferrerDto {
  @ApiProperty({ format: 'uuid' })
  user_id: string;

  @ApiProperty()
  display_name: string;
}

export class CandidateFormSubmissionDto {
  @ApiProperty({ format: 'date-time' })
  submitted_at: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  first_name: string;

  @ApiProperty()
  last_name: string;

  @ApiProperty({ type: String, nullable: true })
  preferred_name: string | null;

  @ApiProperty({ type: Number, nullable: true })
  class_year: number | null;

  @ApiProperty({ type: String, nullable: true })
  phone: string | null;

  @ApiProperty({ type: String, nullable: true })
  source_label: string | null;

  @ApiProperty({ type: String, nullable: true })
  referrer_text: string | null;

  @ApiProperty({
    type: CandidateFormReferrerDto,
    nullable: true,
    description: 'The member the referrer text names, when exactly one does.',
  })
  referrer_suggestion: CandidateFormReferrerDto | null;

  @ApiProperty({ type: [CandidateFormAnswerDto] })
  answers: CandidateFormAnswerDto[];
}

export class CandidateFormDto {
  @ApiProperty({
    type: CandidateFormSubmissionDto,
    nullable: true,
    description: "The candidate's newest form submission; null for none.",
  })
  submission: CandidateFormSubmissionDto | null;
}

export class InterestFormWithdrawalPreviewDto {
  @ApiProperty()
  chapter_name: string;

  @ApiProperty({
    description:
      'Whether the address has a school-wide recruitment record that `everywhere` deletes.',
  })
  at_school: boolean;
}
