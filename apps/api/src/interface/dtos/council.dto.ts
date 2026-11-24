import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Equals,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import {
  COUNCIL_NAME_MAX,
  COUNCIL_TITLE_MAX,
  COUNCIL_TYPES,
  RECRUITMENT_MODELS,
  TENANT_KINDS,
  type CouncilType,
  type RecruitmentModel,
  type TenantKind,
} from '@repo/validation';
import { IsStrictBoolean } from '../decorators/is-strict-boolean.decorator';

/** `POST /v1/councils` (#5933, `school-layer.md` § 5.3). */
export class CreateCouncilDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'The school the council is at. The caller must hold a verified school email there.',
  })
  @IsUUID()
  school_id: string;

  @ApiProperty({ enum: COUNCIL_TYPES })
  @IsIn(COUNCIL_TYPES)
  council_type: CouncilType;

  @ApiProperty({ example: 'RPI IFC', maxLength: COUNCIL_NAME_MAX })
  @IsString()
  @MaxLength(COUNCIL_NAME_MAX)
  name: string;

  @ApiProperty({
    description:
      "The founder's title: a seeded title's key from the type's role pack (`pickableCouncilTitles` in `@repo/validation`), or `custom` with `custom_title`.",
    example: 'vp_recruitment',
    maxLength: 40,
  })
  @IsString()
  @MaxLength(40)
  title_key: string;

  @ApiPropertyOptional({
    description:
      "With `title_key: 'custom'`: the founder's own title, a new role in the Executive board.",
    example: 'Recruitment Chair',
    maxLength: COUNCIL_TITLE_MAX,
  })
  @IsOptional()
  @IsString()
  @MaxLength(COUNCIL_TITLE_MAX)
  custom_title?: string;

  @ApiProperty({
    description:
      'The founder accepted the Terms of Service and Privacy Policy, for the council and for themselves. Must be true, as chapter onboarding requires (spec/behavior/legal.md).',
  })
  @IsStrictBoolean()
  @Equals(true, {
    message: 'Terms of Service and Privacy Policy must be accepted',
  })
  accept_terms_privacy: boolean;
}

/** What `POST /v1/councils` answers: the new tenant, for the switcher. */
export class CreatedCouncilDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ enum: TENANT_KINDS, example: 'council' })
  kind: TenantKind;
}

export class CouncilSchoolDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Rensselaer Polytechnic Institute' })
  name: string;

  @ApiProperty({ example: 'RPI' })
  short_name: string;
}

/** `GET /v1/council`: the active council's own profile. */
export class CouncilProfileDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ enum: COUNCIL_TYPES })
  council_type: CouncilType;

  @ApiProperty({ enum: RECRUITMENT_MODELS })
  recruitment_model: RecruitmentModel;

  @ApiProperty({
    description:
      'Whether Frapp staff verified the council (`council_verified_at`). Every council starts unverified.',
  })
  verified: boolean;

  @ApiProperty({ type: CouncilSchoolDto, nullable: true })
  school: CouncilSchoolDto | null;
}
