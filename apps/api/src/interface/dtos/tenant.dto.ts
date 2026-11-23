import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';
import { TENANT_KINDS, type TenantKind } from '@repo/validation';

export class ResolveTenantQueryDto {
  @ApiProperty({
    description:
      "The slug from the page's URL (`/c/<slug>/…`). Matched in lower case; anything that is not a slug the caller's own tenant holds or held answers 404.",
    example: 'fiji-rpi',
    maxLength: 64,
  })
  @IsString()
  @MaxLength(64)
  slug: string;
}

/**
 * A tenant the caller belongs to, found by its slug (ADR-27, #5918). The
 * client sends `id` as `x-chapter-id` from that page on.
 */
export class ResolvedTenantDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ enum: TENANT_KINDS })
  kind: TenantKind;

  @ApiProperty({
    description:
      "The tenant's current slug. Differs from the one asked for when that slug was retired, in which case the client replaces its URL with this one.",
    example: 'fiji-rpi',
  })
  slug: string;

  @ApiProperty({
    description:
      'True when the slug asked for is one this tenant has retired, so the URL should move to `slug`.',
  })
  redirected: boolean;
}
