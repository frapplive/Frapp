import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsString, Matches, MaxLength } from 'class-validator';
import { SCHOOL_CODE_LENGTH } from '@repo/validation';

export class SearchSchoolsQueryDto {
  @ApiProperty({
    description:
      'Part of the school\'s name, short name or another name for it ("rens", "RPI"). Under 2 characters answers an empty list.',
    example: 'rensselaer',
    maxLength: 100,
  })
  @IsString()
  @MaxLength(100)
  q: string;
}

export class StartSchoolVerificationDto {
  @ApiProperty({
    description:
      "The caller's school address. Only an address on one of the school's verified domains is sent a code.",
    example: 'student@rpi.edu',
    maxLength: 254,
  })
  @IsEmail()
  @MaxLength(254)
  email: string;
}

export class ConfirmSchoolVerificationDto {
  @ApiProperty({
    description: 'The six-digit code from the email.',
    example: '123456',
    minLength: SCHOOL_CODE_LENGTH,
    maxLength: SCHOOL_CODE_LENGTH,
  })
  @IsString()
  @Matches(new RegExp(`^\\s*\\d{${SCHOOL_CODE_LENGTH}}\\s*$`), {
    message: `code must be ${SCHOOL_CODE_LENGTH} digits`,
  })
  code: string;
}

/** A school, as search and the caller's own list show it. */
export class SchoolSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Rensselaer Polytechnic Institute' })
  name: string;

  @ApiProperty({ example: 'RPI' })
  short_name: string;

  @ApiProperty({
    nullable: true,
    type: String,
    description: "The school's current URL slug (`/s/<slug>`, ADR-27).",
    example: 'rpi',
  })
  slug: string | null;

  @ApiProperty({
    description:
      'Whether a student can verify at this school today: the school is verified and has at least one verified email domain.',
  })
  verifiable: boolean;

  @ApiProperty({
    type: [String],
    description:
      "The school's verified email domains, for the address field's placeholder. Empty when it can't verify students.",
    example: ['rpi.edu'],
  })
  email_domains: string[];
}

/** One of the caller's schools: where they've proved a school address. */
export class MySchoolDto {
  @ApiProperty({ type: SchoolSummaryDto })
  school: SchoolSummaryDto;

  @ApiProperty({ enum: ['pnm', 'member', 'alum'] })
  status: 'pnm' | 'member' | 'alum';

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'The school address the code went to.',
  })
  verified_email: string | null;

  @ApiProperty({ format: 'date-time' })
  verified_at: string;
}

/** A code that went out. */
export class SentSchoolCodeDto {
  @ApiProperty({ description: 'The address the code went to, in lower case.' })
  email: string;

  @ApiProperty({
    format: 'date-time',
    description: 'When the code stops working.',
  })
  expires_at: string;

  @ApiPropertyOptional({
    description: 'Seconds before another code can be asked for.',
    example: 60,
  })
  resend_after_seconds: number;
}
