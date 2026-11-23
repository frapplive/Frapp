import {
  Controller,
  Get,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { TenantService } from '../../application/services/tenant.service';
import { SupabaseAuthGuard } from '../guards/supabase-auth.guard';
import { AuthSyncInterceptor } from '../interceptors/auth-sync.interceptor';
import { CurrentUser } from '../decorators/current-user.decorator';
import { ResolveTenantQueryDto, ResolvedTenantDto } from '../dtos/tenant.dto';

/**
 * Tenants by URL (ADR-27, #5918). No `ChapterGuard`: the page asking hasn't
 * got a chapter id yet, which is what this answers. Scoped to the caller's
 * own memberships by `TenantService.resolve`, which answers 404 for anything
 * else.
 */
@ApiTags('Tenants')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@UseInterceptors(AuthSyncInterceptor)
@Controller('tenants')
export class TenantController {
  constructor(private readonly tenants: TenantService) {}

  @Get('resolve')
  @ApiOperation({
    summary: 'Find one of your tenants by its URL slug',
    description:
      "Returns the chapter or council a slug names, only if the caller is its member. A slug the tenant retired returns the tenant with its current slug and `redirected: true`. An unknown slug, and another tenant's current or retired slug, all answer the same 404 `tenant.not_found`.",
  })
  @ApiOkResponse({ type: ResolvedTenantDto })
  resolve(
    @CurrentUser('id') userId: string,
    @Query() query: ResolveTenantQueryDto,
  ): Promise<ResolvedTenantDto> {
    return this.tenants.resolve(userId, query.slug);
  }
}
