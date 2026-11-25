import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CouncilService } from '../../application/services/council.service';
import { SupabaseAuthGuard } from '../guards/supabase-auth.guard';
import { ChapterGuard } from '../guards/chapter.guard';
import { PermissionsGuard } from '../guards/permissions.guard';
import { RequirePermissions } from '../decorators/permissions.decorator';
import { TenantKinds } from '../decorators/tenant-kinds.decorator';
import { FreeTier } from '../decorators/subscription.decorator';
import { AuthSyncInterceptor } from '../interceptors/auth-sync.interceptor';
import {
  CurrentChapterId,
  CurrentUser,
} from '../decorators/current-user.decorator';
import {
  CouncilProfileDto,
  CreateCouncilDto,
  CreatedCouncilDto,
} from '../dtos/council.dto';
import { SystemPermissions } from '#domain/constants/permissions';

/**
 * Starting a council (#5933, `school-layer.md` § 5.3). About the person,
 * not a tenant they're in yet, so there is no `ChapterGuard`: the founder
 * must hold a verified school email at the council's school.
 */
@ApiTags('Councils')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@UseInterceptors(AuthSyncInterceptor)
@Controller('councils')
export class CouncilsController {
  constructor(private readonly councils: CouncilService) {}

  @Post()
  @ApiOperation({
    summary: 'Start a council',
    description:
      "Creates a council of the chosen type at a school where the caller holds a verified school email, seeded with its type's role pack. The caller holds Council admin and the title they picked. 403 `council.school_unverified` without a verified school email there; 409 `council.type_taken` when the school already has a council of that type (`other` aside); 429 `chapter.start_daily_limit` past the daily ceiling chapters share.",
  })
  @ApiCreatedResponse({ type: CreatedCouncilDto })
  async create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateCouncilDto,
  ): Promise<CreatedCouncilDto> {
    const council = await this.councils.create(userId, dto);
    return { id: council.id, name: council.name, kind: 'council' };
  }
}

/**
 * The council tenant's own routes (#5933). Every one declares
 * `@TenantKinds('council')` (`school-layer.md` § 4.2 rule 1), so a chapter
 * named here is refused as a non-member is, `403 chapter.context.invalid`.
 * `@FreeTier`: a council sets itself up before anyone pays (§ 1).
 */
@ApiTags('Councils')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard, ChapterGuard, PermissionsGuard)
@TenantKinds('council')
@FreeTier()
@Controller('council')
export class CouncilController {
  constructor(private readonly councils: CouncilService) {}

  @Get()
  @RequirePermissions(SystemPermissions.MEMBERS_VIEW)
  @ApiOperation({
    summary: 'The active council',
    description:
      'Its type, recruitment model, whether staff verified it, and its school. Serves the council tenant kind only.',
  })
  @ApiOkResponse({ type: CouncilProfileDto })
  get(@CurrentChapterId() councilId: string): Promise<CouncilProfileDto> {
    return this.councils.getProfile(councilId);
  }
}
