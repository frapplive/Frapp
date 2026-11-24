import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  CUSTOM_FIELD_TEXT_MAX_LENGTH,
  CUSTOM_FIELD_VALUES_PER_SAVE_MAX,
} from '@repo/validation';
import { POSITION_MAX } from '#domain/constants/field-limits';
import { IsStrictBoolean } from '../decorators/is-strict-boolean.decorator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const FIELD_TYPES = [
  'text',
  'number',
  'decimal',
  'phone',
  'select',
  'boolean',
] as const;
const FIELD_VISIBILITIES = ['self', 'chapter', 'exec', 'president'] as const;

/**
 * Type-specific configuration carried in the `options` jsonb column. `choices`
 * holds a `select` field's option list; `max_length` is an optional cap for
 * `text`. The precise per-type shape is enforced by the shared zod schema
 * (`@repo/validation`); this DTO does coarse structural validation.
 */
export class CustomFieldOptionsDto {
  @ApiPropertyOptional({
    type: [String],
    description: 'Option list for select',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  choices?: string[];

  @ApiPropertyOptional({ description: 'Max length for text fields' })
  @IsOptional()
  @IsInt()
  @Min(1)
  max_length?: number;
}

/**
 * A custom member field persisted to `chapter_custom_fields` (Settings →
 * Fields). `key` is a machine-readable slug unique per chapter; `type` and
 * `key` are immutable after creation (changing `type` would orphan stored
 * member values). Unlike custom roles there is no `core` flag — every field is
 * deletable.
 */
export class CreateCustomFieldDto {
  @ApiProperty({ description: 'Machine-readable slug, unique per chapter' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9_]+$/, {
    message: 'key must be lowercase letters, numbers, and underscores',
  })
  key: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  label: string;

  @ApiProperty({ enum: FIELD_TYPES })
  @IsIn(FIELD_TYPES)
  type: (typeof FIELD_TYPES)[number];

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsStrictBoolean()
  required?: boolean;

  @ApiPropertyOptional({ enum: FIELD_VISIBILITIES, default: 'chapter' })
  @IsOptional()
  @IsIn(FIELD_VISIBILITIES)
  visibility?: (typeof FIELD_VISIBILITIES)[number];

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsStrictBoolean()
  sensitive?: boolean;

  @ApiPropertyOptional({ type: () => CustomFieldOptionsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CustomFieldOptionsDto)
  options?: CustomFieldOptionsDto;

  @ApiPropertyOptional({
    description: 'Display order; lower sorts first',
    maximum: POSITION_MAX,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(POSITION_MAX)
  sort?: number;
}

/** Body for `PATCH /custom-fields/:id` (`key` and `type` are immutable). */
export class UpdateCustomFieldDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  label?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsStrictBoolean()
  required?: boolean;

  @ApiPropertyOptional({ enum: FIELD_VISIBILITIES })
  @IsOptional()
  @IsIn(FIELD_VISIBILITIES)
  visibility?: (typeof FIELD_VISIBILITIES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsStrictBoolean()
  sensitive?: boolean;

  @ApiPropertyOptional({ type: () => CustomFieldOptionsDto, nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => CustomFieldOptionsDto)
  options?: CustomFieldOptionsDto | null;

  @ApiPropertyOptional({ maximum: POSITION_MAX })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(POSITION_MAX)
  sort?: number;
}

/** Response shape for a `chapter_custom_fields` row (for OpenAPI/SDK typing). */
export class CustomFieldDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  chapter_id: string;

  @ApiProperty()
  key: string;

  @ApiProperty()
  label: string;

  @ApiProperty({ enum: FIELD_TYPES })
  type: (typeof FIELD_TYPES)[number];

  @ApiProperty()
  required: boolean;

  @ApiProperty({ enum: FIELD_VISIBILITIES })
  visibility: (typeof FIELD_VISIBILITIES)[number];

  @ApiProperty()
  sensitive: boolean;

  @ApiPropertyOptional({ type: () => CustomFieldOptionsDto, nullable: true })
  options: CustomFieldOptionsDto | null;

  @ApiProperty()
  sort: number;

  @ApiProperty()
  created_at: string;

  @ApiProperty()
  updated_at: string;
}

/** Response for `DELETE /custom-fields/:id`. */
export class RemoveCustomFieldResponseDto {
  @ApiProperty({ example: true })
  success: boolean;
}

/**
 * A member's value for a custom field on `GET /members/:id`, already filtered
 * server-side to the fields the requesting viewer may see (Chunk 09). `value` is
 * null when the member has no value set for an (otherwise visible) field.
 */
export class MemberCustomFieldValueDto {
  @ApiProperty()
  field_id: string;

  @ApiProperty()
  key: string;

  @ApiProperty()
  label: string;

  @ApiProperty({ enum: FIELD_TYPES })
  type: (typeof FIELD_TYPES)[number];

  @ApiProperty({ enum: FIELD_VISIBILITIES })
  visibility: (typeof FIELD_VISIBILITIES)[number];

  @ApiProperty({ type: String, nullable: true })
  value: string | null;
}

/**
 * One of the chapter's fields as its own member reads it on their profile
 * (#581): every tier, with the member's own value. `visibility` is who else
 * sees it, which the form says beside the field.
 */
export class OwnCustomFieldDto {
  @ApiProperty()
  field_id: string;

  @ApiProperty()
  key: string;

  @ApiProperty()
  label: string;

  @ApiProperty({ enum: FIELD_TYPES })
  type: (typeof FIELD_TYPES)[number];

  @ApiProperty({ enum: FIELD_VISIBILITIES })
  visibility: (typeof FIELD_VISIBILITIES)[number];

  @ApiProperty()
  required: boolean;

  @ApiProperty({
    type: [String],
    nullable: true,
    description: "A select field's choices; null for every other type",
  })
  choices: string[] | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: "A text field's own length cap, when it sets one",
  })
  max_length: number | null;

  @ApiProperty({ type: String, nullable: true })
  value: string | null;
}

/** One value in `PATCH /members/me/custom-fields`. */
export class OwnCustomFieldValueDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  field_id: string;

  @ApiProperty({
    type: String,
    nullable: true,
    maxLength: CUSTOM_FIELD_TEXT_MAX_LENGTH,
    description:
      'The value as text: a whole number, a decimal like 3.4, a phone number, one of a select field\'s choices, or "true"/"false". null or an empty string clears it; a required field with a value cannot be cleared.',
  })
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(CUSTOM_FIELD_TEXT_MAX_LENGTH)
  value: string | null;
}

/** Body for `PATCH /members/me/custom-fields` (#581). */
export class UpdateOwnCustomFieldsDto {
  @ApiProperty({
    type: () => OwnCustomFieldValueDto,
    isArray: true,
    maxItems: CUSTOM_FIELD_VALUES_PER_SAVE_MAX,
  })
  @IsArray()
  @ArrayMaxSize(CUSTOM_FIELD_VALUES_PER_SAVE_MAX)
  @ValidateNested({ each: true })
  @Type(() => OwnCustomFieldValueDto)
  values: OwnCustomFieldValueDto[];
}
