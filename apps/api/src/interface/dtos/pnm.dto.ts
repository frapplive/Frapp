import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  PNM_RETENTION_DEFAULT_DAYS,
  RECRUITMENT_TERM_MAX,
} from '@repo/validation';

const SEASON_STATUSES = ['planned', 'open', 'closed'] as const;
const PNM_SOURCES = [
  'interest_form',
  'council_registration',
  'council_import',
] as const;

// Seasons -----------------------------------------------------------------------

export class RecruitmentSeasonDto {
  @ApiProperty({ example: 'Spring 2027' })
  term: string;

  @ApiProperty({ format: 'date-time' })
  opens_at: string;

  @ApiProperty({ format: 'date-time' })
  closes_at: string;

  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  bid_window_opens_at: string | null;

  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  bid_window_closes_at: string | null;

  @ApiProperty({
    enum: SEASON_STATUSES,
    description:
      'Until it is `closed`, the council sees interests as counts only.',
  })
  status: (typeof SEASON_STATUSES)[number];

  @ApiProperty({
    description:
      'Days after `closes_at` a PNM record is kept (default and most 180).',
    example: PNM_RETENTION_DEFAULT_DAYS,
  })
  pnm_retention_days: number;
}

export class CreateRecruitmentSeasonDto {
  @ApiProperty({ example: 'Spring 2027', maxLength: RECRUITMENT_TERM_MAX })
  @IsString()
  @Matches(/\S/, { message: 'term must not be blank' })
  @MaxLength(RECRUITMENT_TERM_MAX)
  term: string;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601({ strict: true })
  opens_at: string;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601({ strict: true })
  closes_at: string;

  @ApiPropertyOptional({ format: 'date-time', nullable: true, type: String })
  @IsOptional()
  @IsISO8601({ strict: true })
  bid_window_opens_at?: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true, type: String })
  @IsOptional()
  @IsISO8601({ strict: true })
  bid_window_closes_at?: string | null;

  @ApiPropertyOptional({ enum: SEASON_STATUSES })
  @IsOptional()
  @IsIn(SEASON_STATUSES)
  status?: (typeof SEASON_STATUSES)[number];

  @ApiPropertyOptional({ minimum: 0, maximum: PNM_RETENTION_DEFAULT_DAYS })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(PNM_RETENTION_DEFAULT_DAYS)
  pnm_retention_days?: number;
}

export class UpdateRecruitmentSeasonDto {
  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601({ strict: true })
  opens_at?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601({ strict: true })
  closes_at?: string;

  @ApiPropertyOptional({ format: 'date-time', nullable: true, type: String })
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsISO8601({ strict: true })
  bid_window_opens_at?: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true, type: String })
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsISO8601({ strict: true })
  bid_window_closes_at?: string | null;

  @ApiPropertyOptional({ enum: SEASON_STATUSES })
  @IsOptional()
  @IsIn(SEASON_STATUSES)
  status?: (typeof SEASON_STATUSES)[number];

  @ApiPropertyOptional({ minimum: 0, maximum: PNM_RETENTION_DEFAULT_DAYS })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(PNM_RETENTION_DEFAULT_DAYS)
  pnm_retention_days?: number;
}

export class SeasonTermParamDto {
  @ApiProperty({ example: 'Spring 2027', maxLength: RECRUITMENT_TERM_MAX })
  @IsString()
  @MaxLength(RECRUITMENT_TERM_MAX)
  term: string;
}

// PNMs --------------------------------------------------------------------------

export class PnmSharedDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  first_name: string;

  @ApiProperty()
  last_name: string;

  @ApiProperty({ nullable: true, type: String })
  preferred_name: string | null;

  @ApiProperty({ example: 'student@rpi.edu' })
  school_email: string;

  @ApiProperty({ nullable: true, type: Number, example: 2030 })
  class_year: number | null;

  @ApiProperty({
    description:
      "Whether the person proved the school address. An imported record that hasn't reaches no chapter.",
  })
  email_verified: boolean;

  @ApiProperty({ enum: PNM_SOURCES })
  source: (typeof PNM_SOURCES)[number];
}

export class MasterListRowDto extends PnmSharedDto {
  @ApiProperty({ format: 'date-time' })
  registered_at: string;

  @ApiProperty({
    description:
      'Whether a phone number is on file. Reading it is `GET …/phone`, logged.',
  })
  has_phone: boolean;

  @ApiProperty({
    description:
      "How many of the council's member chapters they showed interest in.",
  })
  interest_count: number;

  @ApiProperty({
    type: [String],
    nullable: true,
    description:
      'Which member chapters, by id: null until the season is closed (counts only in season).',
  })
  interested_chapter_ids: string[] | null;
}

export class ChapterTotalDto {
  @ApiProperty({ format: 'uuid' })
  chapter_id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  interested: number;
}

export class MasterListDto {
  @ApiProperty({ type: RecruitmentSeasonDto })
  season: RecruitmentSeasonDto;

  @ApiProperty({
    description:
      "True while the season isn't closed: interests are counts only.",
  })
  counts_only: boolean;

  @ApiProperty({ type: [ChapterTotalDto] })
  chapter_totals: ChapterTotalDto[];

  @ApiProperty({ type: [MasterListRowDto] })
  pnms: MasterListRowDto[];
}

export class PnmPhoneDto {
  @ApiProperty({ nullable: true, type: String })
  phone: string | null;
}

export class DuplicatePairDto {
  @ApiProperty({ type: PnmSharedDto })
  a: PnmSharedDto;

  @ApiProperty({ type: PnmSharedDto })
  b: PnmSharedDto;

  @ApiProperty({
    type: [String],
    enum: ['same_name_and_phone', 'same_name_and_class_year'],
    isArray: true,
  })
  reasons: ('same_name_and_phone' | 'same_name_and_class_year')[];
}

export class MergePnmsDto {
  @ApiProperty({ format: 'uuid', description: 'The record that stays.' })
  @IsUUID()
  survivor_id: string;

  @ApiProperty({ format: 'uuid', description: 'The record merged into it.' })
  @IsUUID()
  loser_id: string;
}

export class MergedPnmsDto {
  @ApiProperty({ format: 'uuid' })
  survivor_id: string;

  @ApiProperty({
    description:
      'Chapters that already had a candidate for each record keep both until they merge them themselves.',
  })
  candidate_conflicts: number;
}

export class DismissDuplicateDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  a: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  b: string;
}

export class ChapterPnmDto extends PnmSharedDto {
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Only when the PNM chose to share it.',
  })
  phone: string | null;
}
