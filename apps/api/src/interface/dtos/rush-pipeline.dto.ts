import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  RUSH_CLOSED_REASONS,
  RUSH_CONTACT_KINDS,
  RUSH_CONTACT_NOTE_MAX,
  RUSH_FOLLOW_UP_NOTE_MAX,
  RUSH_STALE_DAYS_MAX,
  RUSH_STALE_DAYS_MIN,
  RUSH_MANUAL_CLOSED_REASONS,
  RUSH_NOTE_MAX,
  RUSH_RATING_MAX,
  RUSH_RATING_MIN,
  RUSH_STAGE_CATEGORIES,
  RUSH_STAGE_LABEL_MAX,
  RUSH_STAGES_MAX,
  RUSH_TAG_LABEL_MAX,
  RUSH_TAGS_MAX,
  type RushClosedReason,
  type RushContactKind,
  type RushManualClosedReason,
  type RushStageCategory,
} from '@repo/validation';
import type {
  RushContactView,
  RushNoteView,
  RushPipeline,
  RushPipelineCandidate,
  RushSettings,
  RushSettingsPatch,
  RushSettingsSkippedMember,
  RushStage,
  RushTag,
} from '#domain/entities/rush-pipeline.entity';
import type { RushFollowUpView } from '../../application/services/rush-pipeline.service';
import type { RushBidStatus } from '#domain/entities/rush-candidate.entity';
import type { AssertNever } from './drift-guard';
import { IsStrictBoolean } from '../decorators/is-strict-boolean.decorator';

export class RushStageDto implements RushStage {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  chapter_id: string;

  @ApiProperty({
    description:
      "What a candidate's `stage` holds. Fixed once made; a rename changes `label` only.",
  })
  key: string;

  @ApiProperty()
  label: string;

  @ApiProperty({ enum: RUSH_STAGE_CATEGORIES })
  category: RushStageCategory;

  @ApiProperty({ description: 'Order within its category.' })
  position: number;

  @ApiProperty()
  hidden: boolean;

  @ApiProperty({ format: 'date-time' })
  created_at: string;

  @ApiProperty({ format: 'date-time' })
  updated_at: string;
}

export class RushTagDto implements RushTag {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  chapter_id: string;

  @ApiProperty()
  label: string;

  @ApiProperty({ format: 'date-time' })
  created_at: string;
}

export class RushPipelineCandidateDto implements RushPipelineCandidate {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  display_name: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  user_id: string | null;

  @ApiProperty({ description: "The key of one of the chapter's stages." })
  stage: string;

  @ApiProperty({ enum: RUSH_CLOSED_REASONS, nullable: true })
  closed_reason: RushClosedReason | null;

  @ApiProperty({ enum: ['none', 'extended'] })
  bid_status: RushBidStatus;

  @ApiProperty({ format: 'uuid' })
  created_by: string;

  @ApiProperty({ description: 'Who added the candidate, by current name.' })
  created_by_name: string;

  @ApiProperty({ format: 'date-time' })
  created_at: string;

  @ApiProperty({ type: [String], format: 'uuid' })
  tag_ids: string[];

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description:
      'Average 1-to-5 rating; null when nobody has rated. Absent without `rush:view_results`.',
  })
  rating_average?: number | null;

  @ApiPropertyOptional({
    description: 'How many members rated. Absent without `rush:view_results`.',
  })
  rating_count?: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: "The caller's own rating, or null.",
  })
  viewer_rating: number | null;

  @ApiPropertyOptional({
    description: 'Ballot count. Absent without `rush:view_results`.',
  })
  vote_count?: number;

  @ApiProperty()
  viewer_has_voted: boolean;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: "The member who is the prospect's main point of contact.",
  })
  owner_id: string | null;

  @ApiProperty({ type: String, nullable: true })
  owner_name: string | null;

  @ApiProperty({
    type: String,
    format: 'date',
    nullable: true,
    description: 'The day of the newest logged contact.',
  })
  last_contact_on: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  last_contact_by: string | null;

  @ApiProperty({ type: String, nullable: true })
  last_contact_by_name: string | null;

  @ApiProperty({
    type: String,
    format: 'date',
    nullable: true,
    description: 'The day the open follow-up comes due.',
  })
  follow_up_on: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'What to do, such as "invite to house dinner".',
  })
  follow_up_note: string | null;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Who the follow-up is for; they get the push.',
  })
  follow_up_user_id: string | null;

  @ApiProperty({ type: String, nullable: true })
  follow_up_user_name: string | null;
}

export class RushPipelineDto implements RushPipeline {
  @ApiProperty({
    type: [RushStageDto],
    description: 'In board order: by category, then position.',
  })
  stages: RushStageDto[];

  @ApiProperty({ type: [RushTagDto] })
  tags: RushTagDto[];

  @ApiProperty({
    type: [RushPipelineCandidateDto],
    description: 'Newest first.',
  })
  candidates: RushPipelineCandidateDto[];

  @ApiProperty({
    description:
      'Days without a logged contact before an open prospect needs a follow-up.',
  })
  stale_days: number;
}

export class RushStageInputDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'An existing stage. Omit to add a new one.',
  })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({ maxLength: RUSH_STAGE_LABEL_MAX })
  @IsString()
  @MinLength(1)
  @MaxLength(RUSH_STAGE_LABEL_MAX)
  label: string;

  @ApiProperty({
    enum: RUSH_STAGE_CATEGORIES,
    description: "An existing stage's category can't change.",
  })
  @IsIn(RUSH_STAGE_CATEGORIES)
  category: RushStageCategory;

  @ApiProperty()
  @IsStrictBoolean()
  hidden: boolean;
}

export class SaveRushStagesDto {
  @ApiProperty({
    type: [RushStageInputDto],
    maxItems: RUSH_STAGES_MAX,
    description:
      'Every stage, in order. Each existing stage must be included: stages are hidden, never removed. New and Closed each keep a visible stage.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(RUSH_STAGES_MAX)
  @ValidateNested({ each: true })
  @Type(() => RushStageInputDto)
  stages: RushStageInputDto[];
}

export class MoveRushCandidateStageDto {
  @ApiProperty({
    description: "The key of one of the chapter's visible stages.",
  })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  stage: string;

  @ApiPropertyOptional({
    enum: RUSH_MANUAL_CLOSED_REASONS,
    description: 'Required for a Closed stage, refused for any other.',
  })
  @IsOptional()
  @IsIn(RUSH_MANUAL_CLOSED_REASONS)
  closed_reason?: RushManualClosedReason | null;
}

export class RushCandidateStageDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  stage: string;

  @ApiProperty({ enum: RUSH_CLOSED_REASONS, nullable: true })
  closed_reason: RushClosedReason | null;
}

export class RushTagInputDto {
  @ApiProperty({ maxLength: RUSH_TAG_LABEL_MAX })
  @IsString()
  @MinLength(1)
  @MaxLength(RUSH_TAG_LABEL_MAX)
  label: string;
}

export class SetRushCandidateTagsDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    description: "The candidate's tags after the call, replacing what it had.",
  })
  @IsArray()
  @ArrayMaxSize(RUSH_TAGS_MAX)
  @IsUUID('all', { each: true })
  tag_ids: string[];
}

export class RushCandidateTagsDto {
  @ApiProperty({ type: [String], format: 'uuid' })
  tag_ids: string[];
}

export class RateRushCandidateDto {
  @ApiProperty({ minimum: RUSH_RATING_MIN, maximum: RUSH_RATING_MAX })
  @IsInt()
  @Min(RUSH_RATING_MIN)
  @Max(RUSH_RATING_MAX)
  rating: number;
}

export class RushNoteInputDto {
  @ApiProperty({ maxLength: RUSH_NOTE_MAX })
  @IsString()
  @MinLength(1)
  @MaxLength(RUSH_NOTE_MAX)
  body: string;
}

export class RushNoteDto implements RushNoteView {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  candidate_id: string;

  @ApiProperty({ format: 'uuid' })
  author_id: string;

  @ApiProperty()
  author_name: string;

  @ApiProperty()
  body: string;

  @ApiProperty({ format: 'date-time' })
  created_at: string;

  @ApiProperty({ format: 'date-time' })
  updated_at: string;
}

export class RushSettingsSkippedMemberDto implements RushSettingsSkippedMember {
  @ApiProperty({ format: 'uuid' })
  user_id: string;

  @ApiProperty()
  display_name: string;
}

export class RushSettingsDto implements RushSettings {
  @ApiProperty({
    minimum: RUSH_STALE_DAYS_MIN,
    maximum: RUSH_STALE_DAYS_MAX,
    description:
      'Days without a logged contact before an open prospect needs a follow-up.',
  })
  stale_days: number;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description:
      'The role an accepted PNM’s invite carries, as picked. Null means the default.',
  })
  new_member_role_id: string | null;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description:
      'The default new-member role: the first role in the New members tier. Null when the chapter has no such tier or it holds no role.',
  })
  default_new_member_role_id: string | null;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description:
      'The recruitment contacts Group, told about each interest-form submission.',
  })
  contacts_group_id: string | null;

  @ApiProperty({
    type: [RushSettingsSkippedMemberDto],
    description:
      'Members of the contacts Group who lack `rush:view` and so are skipped.',
  })
  contacts_group_skipped: RushSettingsSkippedMemberDto[];

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description:
      'Where an interest-form submission’s candidate card is posted. Null posts none.',
  })
  card_channel_id: string | null;
}

/** A settings save: each field it names is written; one left out is kept. */
export class SaveRushSettingsDto implements RushSettingsPatch {
  @ApiPropertyOptional({
    minimum: RUSH_STALE_DAYS_MIN,
    maximum: RUSH_STALE_DAYS_MAX,
  })
  @IsOptional()
  @IsInt()
  @Min(RUSH_STALE_DAYS_MIN)
  @Max(RUSH_STALE_DAYS_MAX)
  stale_days?: number;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'A role of this chapter; null goes back to the default.',
  })
  @IsOptional()
  @IsUUID()
  new_member_role_id?: string | null;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  contacts_group_id?: string | null;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description:
      'A channel everyone who can read holds `rush:view`; null posts no card.',
  })
  @IsOptional()
  @IsUUID()
  card_channel_id?: string | null;
}

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class LogRushContactDto {
  @ApiProperty({ enum: RUSH_CONTACT_KINDS })
  @IsIn(RUSH_CONTACT_KINDS)
  kind: RushContactKind;

  @ApiProperty({
    format: 'date',
    description: 'The day of the contact: today or earlier.',
  })
  @IsString()
  @Matches(DAY_PATTERN)
  contacted_on: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: RUSH_CONTACT_NOTE_MAX,
    description: 'Read only by roles that can read recruitment notes.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(RUSH_CONTACT_NOTE_MAX)
  note?: string | null;
}

export class RushContactDto implements RushContactView {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  candidate_id: string;

  @ApiProperty({ format: 'uuid' })
  logged_by: string;

  @ApiProperty()
  logged_by_name: string;

  @ApiProperty({ enum: RUSH_CONTACT_KINDS })
  kind: RushContactKind;

  @ApiProperty({ format: 'date' })
  contacted_on: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'Absent without `rush:read_notes`, and on a prospect linked to the reader.',
  })
  note?: string | null;

  @ApiProperty({ format: 'date-time' })
  created_at: string;
}

export class SetRushOwnerDto {
  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description:
      'The new owner, or null to leave the prospect unowned. Claiming an unowned prospect or letting go of your own needs `rush:add`; anything else needs `rush:manage`.',
  })
  @ValidateIf((_dto, value) => value !== null)
  @IsUUID()
  owner_id: string | null;
}

export class RushOwnerDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  owner_id: string | null;

  @ApiProperty({ type: String, nullable: true })
  owner_name: string | null;
}

export class SetRushFollowUpDto {
  @ApiProperty({ format: 'date', description: 'Today or later.' })
  @IsString()
  @Matches(DAY_PATTERN)
  due_on: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: RUSH_FOLLOW_UP_NOTE_MAX,
    description: 'What to do, such as "invite to house dinner".',
  })
  @IsOptional()
  @IsString()
  @MaxLength(RUSH_FOLLOW_UP_NOTE_MAX)
  note?: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Who it is for. Defaults to the owner, else the caller.',
  })
  @IsOptional()
  @IsUUID()
  for_user_id?: string;
}

export class RushFollowUpDto implements RushFollowUpView {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ type: String, format: 'date', nullable: true })
  follow_up_on: string | null;

  @ApiProperty({ type: String, nullable: true })
  follow_up_note: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  follow_up_user_id: string | null;

  @ApiProperty({ type: String, nullable: true })
  follow_up_user_name: string | null;
}

/** @driftguard */
export type RushContactDtoMissingFields = AssertNever<
  Exclude<keyof RushContactView, keyof RushContactDto>
>;

/** @driftguard */
export type RushPipelineCandidateDtoMissingFields = AssertNever<
  Exclude<keyof RushPipelineCandidate, keyof RushPipelineCandidateDto>
>;

/** @driftguard */
export type RushPipelineCandidateDtoExtraFields = AssertNever<
  Exclude<keyof RushPipelineCandidateDto, keyof RushPipelineCandidate>
>;

/** @driftguard */
export type RushStageDtoMissingFields = AssertNever<
  Exclude<keyof RushStage, keyof RushStageDto>
>;

/** @driftguard */
export type RushNoteDtoMissingFields = AssertNever<
  Exclude<keyof RushNoteView, keyof RushNoteDto>
>;
