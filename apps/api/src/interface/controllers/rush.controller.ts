import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  RushService,
  type RushViewer,
} from '../../application/services/rush.service';
import { RbacService } from '../../application/services/rbac.service';
import { SupabaseAuthGuard } from '../guards/supabase-auth.guard';
import { ChapterGuard } from '../guards/chapter.guard';
import { PermissionsGuard } from '../guards/permissions.guard';
import { RequirePermissions } from '../decorators/permissions.decorator';
import { RequireModule } from '../decorators/module.decorator';
import {
  FeatureEvent,
  type FeatureEventInput,
} from '../decorators/feature-event.decorator';
import {
  CurrentChapterId,
  CurrentUser,
} from '../decorators/current-user.decorator';
import {
  CreateRushCandidateDto,
  CreateRushCandidateResponseDto,
  LookupRushCandidateQueryDto,
  LookupRushNameMatchesQueryDto,
  RushCandidateViewDto,
  RushNameMatchDto,
} from '../dtos/rush-candidate.dto';
import { SystemPermissions } from '#domain/constants/permissions';

/**
 * Recruitment. Every route needs the `rush` module on, `members:view`, and
 * its own `rush:*` permission (#4070); `PermissionsGuard` requires the class
 * and handler lists together. The slash commands and the chat card call these
 * routes, so they carry the same gates.
 *
 * `rush:view_results` gates no route: it decides whether a candidate read,
 * vote or bid answers with `vote_count` (#4084), so it is resolved here.
 */
@ApiTags('Rush')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard, ChapterGuard, PermissionsGuard)
@RequirePermissions(SystemPermissions.MEMBERS_VIEW)
@RequireModule('rush')
@Controller('rush/candidates')
export class RushController {
  constructor(
    private readonly rushService: RushService,
    private readonly rbacService: RbacService,
  ) {}

  /**
   * The caller, with their `rush:view_results` read started but not awaited,
   * so it overlaps the service's candidate read. The empty `catch` only marks
   * the rejection handled for a request that fails before the service awaits
   * it; the service's own await still sees the rejection.
   */
  private viewer(chapterId: string, userId: string): RushViewer {
    const canViewResults = this.rbacService.memberHasAnyPermission(
      chapterId,
      userId,
      [SystemPermissions.RUSH_VIEW_RESULTS],
    );
    canViewResults.catch(() => undefined);
    return { id: userId, canViewResults };
  }

  @Get()
  @RequirePermissions(SystemPermissions.RUSH_VIEW)
  @ApiOperation({ summary: 'Look up a candidate by display name' })
  @ApiOkResponse({ type: RushCandidateViewDto })
  @ApiConflictResponse({
    description:
      '`code: rush.several_match`: the name matches several prospects. Never a silent pick: read `GET /v1/rush/candidates/matches` and pick one by id.',
  })
  async lookup(
    @CurrentChapterId() chapterId: string,
    @CurrentUser('id') userId: string,
    @Query() query: LookupRushCandidateQueryDto,
  ) {
    return this.rushService.findViewByName(
      chapterId,
      this.viewer(chapterId, userId),
      query.name,
    );
  }

  @Get('matches')
  @RequirePermissions(SystemPermissions.RUSH_VIEW)
  @ApiOperation({
    summary:
      'Every candidate a display name matches, with stage and day added, for a picker',
  })
  @ApiOkResponse({ type: [RushNameMatchDto] })
  async matches(
    @CurrentChapterId() chapterId: string,
    @Query() query: LookupRushNameMatchesQueryDto,
  ) {
    return this.rushService.findNameMatches(chapterId, query.name);
  }

  @Get(':id')
  @RequirePermissions(SystemPermissions.RUSH_VIEW)
  @ApiOperation({ summary: 'Get a candidate with live vote and bid status' })
  @ApiOkResponse({ type: RushCandidateViewDto })
  async getOne(
    @CurrentChapterId() chapterId: string,
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.rushService.findView(
      id,
      chapterId,
      this.viewer(chapterId, userId),
    );
  }

  @Post()
  @RequirePermissions(SystemPermissions.RUSH_ADD)
  @ApiOperation({ summary: 'Add a recruitment candidate' })
  @ApiCreatedResponse({ type: CreateRushCandidateResponseDto })
  @FeatureEvent(
    'rush-candidate-added',
    ({
      body,
      result,
    }: FeatureEventInput<
      CreateRushCandidateDto,
      CreateRushCandidateResponseDto
    >) => ({
      is_existing_user: !!body.user_id,
      // `card_posted` is absent when no card was due and false when it failed.
      posted_to_chat: result.card_posted === true,
    }),
  )
  async create(
    @CurrentChapterId() chapterId: string,
    @CurrentUser('id') createdBy: string,
    @Body() dto: CreateRushCandidateDto,
  ) {
    return this.rushService.create({
      chapter_id: chapterId,
      display_name: dto.display_name,
      created_by: createdBy,
      user_id: dto.user_id,
      channel_id: dto.channel_id,
      client_message_id: dto.client_message_id,
    });
  }

  @Post(':id/vote')
  @RequirePermissions(SystemPermissions.RUSH_VOTE)
  @ApiOperation({
    summary:
      'Cast a vote on a candidate (idempotent; a repeat vote returns 201 again, not a conflict)',
  })
  @ApiCreatedResponse({ type: RushCandidateViewDto })
  @FeatureEvent('rush-candidate-voted')
  async vote(
    @CurrentChapterId() chapterId: string,
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.rushService.vote(id, chapterId, this.viewer(chapterId, userId));
  }

  @Post(':id/bid')
  @RequirePermissions(SystemPermissions.RUSH_BID)
  @ApiOperation({
    summary:
      'Extend a bid (idempotent; a repeat bid returns 201 again, not a conflict)',
  })
  @ApiCreatedResponse({ type: RushCandidateViewDto })
  @FeatureEvent('rush-candidate-bid')
  async bid(
    @CurrentChapterId() chapterId: string,
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.rushService.bid(id, chapterId, this.viewer(chapterId, userId));
  }
}
