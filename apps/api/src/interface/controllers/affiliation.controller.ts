import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AffiliationService } from '../../application/services/affiliation.service';
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
  AffiliationSchoolDto,
  ChapterAffiliationsDto,
  CouncilChapterDto,
  CouncilLinkDto,
  DecideCouncilLinkDto,
  DecideSchoolLinkDto,
  InviteCandidateDto,
  InviteChapterDto,
  LinkSchoolDto,
  RequestCouncilDto,
  SchoolLinkDecisionDto,
} from '../dtos/affiliation.dto';
import { SystemPermissions } from '#domain/constants/permissions';

const LINK_REFUSALS =
  "404 `affiliation.not_found` for a link or tenant that isn't there for this side; 409 `affiliation.exists`, `affiliation.invalid_transition` (the link moved, or the step is the other side's) or `affiliation.no_shared_school` (the chapter hasn't confirmed the council's school).";

/**
 * A chapter's school and council links (#5974, `school-layer.md` § 2.4).
 * Chapter kind only (ADR-27's default). An officer with
 * `chapter-config:manage` confirms the school and answers or asks the
 * council; `chapter-config:view` reads where things stand.
 */
@ApiTags('Affiliations')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard, ChapterGuard, PermissionsGuard)
@Controller('chapter/affiliations')
export class ChapterAffiliationController {
  constructor(private readonly affiliations: AffiliationService) {}

  @Get()
  @RequirePermissions(SystemPermissions.CHAPTER_CONFIG_VIEW)
  @ApiOperation({
    summary: "The chapter's school and councils",
    description:
      "Its live school links, and the councils at its confirmed schools with the chapter's link to each, if any.",
  })
  @ApiOkResponse({ type: ChapterAffiliationsDto })
  get(@CurrentChapterId() chapterId: string): Promise<ChapterAffiliationsDto> {
    return this.affiliations.getForChapter(chapterId);
  }

  @Post('school')
  @RequirePermissions(SystemPermissions.CHAPTER_CONFIG_MANAGE)
  @ApiOperation({
    summary: "Name and confirm the chapter's school",
    description: `Proposes the link and, since the caller is the chapter's officer, confirms it. A second school becomes a secondary link. ${LINK_REFUSALS}`,
  })
  @ApiCreatedResponse({ type: AffiliationSchoolDto })
  linkSchool(
    @CurrentChapterId() chapterId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: LinkSchoolDto,
  ): Promise<AffiliationSchoolDto> {
    return this.affiliations.linkSchool(chapterId, userId, dto.school_id);
  }

  @Patch('school/:linkId')
  @RequirePermissions(SystemPermissions.CHAPTER_CONFIG_MANAGE)
  @ApiOperation({
    summary: 'Confirm, decline or end a school link',
    description: `Ending a confirmed link ends the chapter's council links at that school. ${LINK_REFUSALS}`,
  })
  @ApiOkResponse({ type: SchoolLinkDecisionDto })
  decideSchool(
    @CurrentChapterId() chapterId: string,
    @CurrentUser('id') userId: string,
    @Param('linkId', ParseUUIDPipe) linkId: string,
    @Body() dto: DecideSchoolLinkDto,
  ): Promise<SchoolLinkDecisionDto> {
    return this.affiliations.decideSchoolLink(
      chapterId,
      userId,
      linkId,
      dto.status,
    );
  }

  @Post('councils')
  @RequirePermissions(SystemPermissions.CHAPTER_CONFIG_MANAGE)
  @ApiOperation({
    summary: 'Ask to join a council',
    description: `The council at the chapter's confirmed school accepts or declines. ${LINK_REFUSALS}`,
  })
  @ApiCreatedResponse({ type: CouncilLinkDto })
  requestCouncil(
    @CurrentChapterId() chapterId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: RequestCouncilDto,
  ): Promise<CouncilLinkDto> {
    return this.affiliations.requestCouncil(chapterId, userId, dto.council_id);
  }

  @Patch('councils/:linkId')
  @RequirePermissions(SystemPermissions.CHAPTER_CONFIG_MANAGE)
  @ApiOperation({
    summary: "Answer a council's invitation, or leave",
    description: `\`accepted\` or \`declined\` answers an invitation; \`ended\` withdraws the chapter's request or leaves. ${LINK_REFUSALS}`,
  })
  @ApiOkResponse({ type: CouncilLinkDto })
  decideCouncil(
    @CurrentChapterId() chapterId: string,
    @CurrentUser('id') userId: string,
    @Param('linkId', ParseUUIDPipe) linkId: string,
    @Body() dto: DecideCouncilLinkDto,
  ): Promise<CouncilLinkDto> {
    return this.affiliations.decideForChapter(
      chapterId,
      userId,
      linkId,
      dto.status,
    );
  }
}

/**
 * A council's member chapters (#5974, `school-layer.md` § 2.4): its
 * **Chapters** module. Council kind only (§ 4.2 rule 1); `@FreeTier`, since
 * a council gathers its chapters before anyone pays (§ 1). It lists each
 * chapter's public listing and the link, never chapter data (#4068
 * decision 11).
 */
@ApiTags('Councils')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard, ChapterGuard, PermissionsGuard)
@TenantKinds('council')
@FreeTier()
@Controller('council/chapters')
export class CouncilChaptersController {
  constructor(private readonly affiliations: AffiliationService) {}

  @Get()
  @RequirePermissions(SystemPermissions.MEMBERS_VIEW)
  @ApiOperation({
    summary: "The council's chapters",
    description:
      'Member chapters, suspended ones, invitations out and requests waiting on the council, newest first.',
  })
  @ApiOkResponse({ type: [CouncilChapterDto] })
  list(@CurrentChapterId() councilId: string): Promise<CouncilChapterDto[]> {
    return this.affiliations.listForCouncil(councilId);
  }

  @Get('candidates')
  @RequirePermissions(SystemPermissions.COUNCIL_CHAPTERS_MANAGE)
  @ApiOperation({
    summary: 'Chapters the council can invite',
    description:
      "Chapters that confirmed the council's school and have no live link to it, offered archetypes first.",
  })
  @ApiOkResponse({ type: [InviteCandidateDto] })
  candidates(
    @CurrentChapterId() councilId: string,
  ): Promise<InviteCandidateDto[]> {
    return this.affiliations.inviteCandidates(councilId);
  }

  @Post()
  @RequirePermissions(SystemPermissions.COUNCIL_CHAPTERS_MANAGE)
  @ApiOperation({
    summary: 'Invite a chapter',
    description: `The chapter's officers accept or decline. ${LINK_REFUSALS}`,
  })
  @ApiCreatedResponse({ type: CouncilLinkDto })
  invite(
    @CurrentChapterId() councilId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: InviteChapterDto,
  ): Promise<CouncilLinkDto> {
    return this.affiliations.invite(councilId, userId, dto.chapter_id);
  }

  @Patch(':linkId')
  @RequirePermissions(SystemPermissions.COUNCIL_CHAPTERS_MANAGE)
  @ApiOperation({
    summary: "Answer a chapter's request, suspend, reinstate or remove",
    description: `${LINK_REFUSALS}`,
  })
  @ApiOkResponse({ type: CouncilLinkDto })
  decide(
    @CurrentChapterId() councilId: string,
    @CurrentUser('id') userId: string,
    @Param('linkId', ParseUUIDPipe) linkId: string,
    @Body() dto: DecideCouncilLinkDto,
  ): Promise<CouncilLinkDto> {
    return this.affiliations.decideForCouncil(
      councilId,
      userId,
      linkId,
      dto.status,
    );
  }
}
