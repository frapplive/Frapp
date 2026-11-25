import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { PnmService } from '../../application/services/pnm.service';
import { SupabaseAuthGuard } from '../guards/supabase-auth.guard';
import { ChapterGuard } from '../guards/chapter.guard';
import { PermissionsGuard } from '../guards/permissions.guard';
import { RequirePermissions } from '../decorators/permissions.decorator';
import { TenantKinds } from '../decorators/tenant-kinds.decorator';
import { FreeTier } from '../decorators/subscription.decorator';
import {
  CurrentChapterId,
  CurrentUser,
} from '../decorators/current-user.decorator';
import {
  ChapterPnmDto,
  CreateRecruitmentSeasonDto,
  DismissDuplicateDto,
  DuplicatePairDto,
  MasterListDto,
  MergedPnmsDto,
  MergePnmsDto,
  PnmPhoneDto,
  RecruitmentSeasonDto,
  SeasonTermParamDto,
  UpdateRecruitmentSeasonDto,
} from '../dtos/pnm.dto';
import { SystemPermissions } from '#domain/constants/permissions';

const RECRUITMENT_OFF =
  '403 `council.recruitment_off` for a council whose recruitment model is `none`.';

/**
 * A council's PNM records (#5974, `school-layer.md` § 2.5, § 3.3, § 4.2
 * rule 4). Council kind only (§ 4.2 rule 1), `@FreeTier` for the pilot
 * (§ 1). The master list is the council's own registrations for a term, for
 * PNMs at its own school, with interests limited to its accepted chapters;
 * an unverified council, or one with no accepted chapter, gets an empty
 * list. While a season isn't closed, interests are counts only (Winston,
 * 2026-11-11). Every read of a record is logged in `council_pnm_access_log`;
 * a phone number needs `council:recruitment_manage` (Paul, 2026-11-11).
 */
@ApiTags('Council recruitment')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard, ChapterGuard, PermissionsGuard)
@TenantKinds('council')
@FreeTier()
@Controller('council/recruitment')
export class CouncilRecruitmentController {
  constructor(private readonly pnms: PnmService) {}

  @Get('seasons')
  @RequirePermissions(SystemPermissions.COUNCIL_RECRUITMENT_VIEW)
  @ApiOperation({
    summary: "The council's recruitment seasons",
    description: `Newest first. ${RECRUITMENT_OFF}`,
  })
  @ApiOkResponse({ type: [RecruitmentSeasonDto] })
  listSeasons(
    @CurrentChapterId() councilId: string,
  ): Promise<RecruitmentSeasonDto[]> {
    return this.pnms.listSeasons(councilId);
  }

  @Post('seasons')
  @RequirePermissions(SystemPermissions.COUNCIL_RECRUITMENT_MANAGE)
  @ApiOperation({
    summary: 'Add a recruitment season',
    description: `409 \`council.season_exists\` for a term the council already has; 400 when it closes before it opens. ${RECRUITMENT_OFF}`,
  })
  @ApiCreatedResponse({ type: RecruitmentSeasonDto })
  createSeason(
    @CurrentChapterId() councilId: string,
    @Body() dto: CreateRecruitmentSeasonDto,
  ): Promise<RecruitmentSeasonDto> {
    return this.pnms.createSeason(councilId, dto);
  }

  @Patch('seasons/:term')
  @RequirePermissions(SystemPermissions.COUNCIL_RECRUITMENT_MANAGE)
  @ApiOperation({
    summary: 'Change a season: its dates, status or retention',
    description: `404 \`council.season_not_found\`. ${RECRUITMENT_OFF}`,
  })
  @ApiOkResponse({ type: RecruitmentSeasonDto })
  updateSeason(
    @CurrentChapterId() councilId: string,
    @Param() params: SeasonTermParamDto,
    @Body() dto: UpdateRecruitmentSeasonDto,
  ): Promise<RecruitmentSeasonDto> {
    return this.pnms.updateSeason(councilId, params.term, dto);
  }

  @Get('pnms')
  @RequirePermissions(SystemPermissions.COUNCIL_RECRUITMENT_VIEW)
  @ApiOperation({
    summary: "The council's master list for a season",
    description: `Shared fields, never a phone number. Counts only until the season is closed. 404 \`council.season_not_found\`. ${RECRUITMENT_OFF}`,
  })
  @ApiOkResponse({ type: MasterListDto })
  masterList(
    @CurrentChapterId() councilId: string,
    @CurrentUser('id') userId: string,
    @Query() query: SeasonTermParamDto,
  ): Promise<MasterListDto> {
    return this.pnms.masterList(councilId, userId, query.term);
  }

  @Get('pnms/:pnmId/phone')
  @RequirePermissions(SystemPermissions.COUNCIL_RECRUITMENT_MANAGE)
  @ApiOperation({
    summary: "A PNM's phone number",
    description: `Logged before it is read. 404 \`pnm.not_found\` for anyone not on this council's list. ${RECRUITMENT_OFF}`,
  })
  @ApiOkResponse({ type: PnmPhoneDto })
  phone(
    @CurrentChapterId() councilId: string,
    @CurrentUser('id') userId: string,
    @Param('pnmId', ParseUUIDPipe) pnmId: string,
  ): Promise<PnmPhoneDto> {
    return this.pnms.revealPhone(councilId, userId, pnmId);
  }

  @Get('duplicates')
  @RequirePermissions(SystemPermissions.COUNCIL_RECRUITMENT_MANAGE)
  @ApiOperation({
    summary: 'The merge queue',
    description: `Suspected duplicates on the council's list: the same name and phone, or the same name and class year. Never merged automatically. ${RECRUITMENT_OFF}`,
  })
  @ApiOkResponse({ type: [DuplicatePairDto] })
  duplicates(
    @CurrentChapterId() councilId: string,
    @CurrentUser('id') userId: string,
  ): Promise<DuplicatePairDto[]> {
    return this.pnms.duplicates(councilId, userId);
  }

  @Post('duplicates/dismiss')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(SystemPermissions.COUNCIL_RECRUITMENT_MANAGE)
  @ApiOperation({
    summary: 'Not the same person',
    description: `The pair stops being suggested. 404 \`pnm.not_found\`. ${RECRUITMENT_OFF}`,
  })
  @ApiNoContentResponse()
  async dismiss(
    @CurrentChapterId() councilId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: DismissDuplicateDto,
  ): Promise<void> {
    await this.pnms.dismissDuplicate(councilId, userId, dto.a, dto.b);
  }

  @Post('merges')
  @RequirePermissions(SystemPermissions.COUNCIL_RECRUITMENT_MANAGE)
  @ApiOperation({
    summary: 'Merge two records of one person',
    description: `Moves registrations and interests to the survivor and repoints each chapter's candidate where it can. Logged; no unmerge. 404 \`pnm.not_found\`; 409 \`pnm.already_merged\` or \`pnm.two_accounts\`. ${RECRUITMENT_OFF}`,
  })
  @ApiCreatedResponse({ type: MergedPnmsDto })
  merge(
    @CurrentChapterId() councilId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: MergePnmsDto,
  ): Promise<MergedPnmsDto> {
    return this.pnms.merge(councilId, userId, dto.survivor_id, dto.loser_id);
  }
}

/**
 * A chapter reading a PNM it is linked to (#5974, `school-layer.md` § 4.2
 * rule 4): the PNM showed interest in this chapter, or its own candidate is
 * linked. Any other id is 404, not 403, because PNM ids are guessable
 * (`multi-tenancy.md` § 403 vs 404). Chapter kind only.
 */
@ApiTags('Rush')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard, ChapterGuard, PermissionsGuard)
@Controller('pnms')
export class ChapterPnmController {
  constructor(private readonly pnms: PnmService) {}

  @Get(':pnmId')
  @RequirePermissions(SystemPermissions.RUSH_VIEW)
  @ApiOperation({
    summary: 'A PNM linked to this chapter',
    description:
      'Their shared fields, and their phone only when they chose to share it. 404 `pnm.not_found` for any PNM not linked to this chapter.',
  })
  @ApiOkResponse({ type: ChapterPnmDto })
  get(
    @CurrentChapterId() chapterId: string,
    @Param('pnmId', ParseUUIDPipe) pnmId: string,
  ): Promise<ChapterPnmDto> {
    return this.pnms.getForChapter(chapterId, pnmId);
  }
}
