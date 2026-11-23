import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  RUSH_CLOSED_REASONS,
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
  type RushManualClosedReason,
  type RushStageCategory,
} from '@repo/validation';
import type {
  RushNoteView,
  RushPipeline,
  RushPipelineCandidate,
  RushStage,
  RushTag,
} from '#domain/entities/rush-pipeline.entity';
import type { RushBidStatus } from '#domain/entities/rush-candidate.entity';
import type { AssertNever } from './drift-guard';

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
  @IsBoolean()
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
  closed_reason?: RushManualClosedReason;
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
