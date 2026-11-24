import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { RushBidService } from '../../application/services/rush-bid.service';
import { SupabaseAuthGuard } from '../guards/supabase-auth.guard';
import { ChapterGuard } from '../guards/chapter.guard';
import { PermissionsGuard } from '../guards/permissions.guard';
import { RequirePermissions } from '../decorators/permissions.decorator';
import { RequireModule } from '../decorators/module.decorator';
import {
  CurrentChapterId,
  CurrentUser,
} from '../decorators/current-user.decorator';
import {
  RecordRushAcceptanceDto,
  RescindRushBidDto,
  RushBidDto,
} from '../dtos/rush-pipeline.dto';
import { SystemPermissions } from '#domain/constants/permissions';

/**
 * A bid's answers (#5973, `spec/behavior/ifc-recruitment.md` § Bids). Extend
 * is the chat card's `POST /v1/rush/candidates/:id/bid` (`RushController`).
 * Same class gates as the other recruitment routes: the `rush` module on and
 * `members:view`, plus each route's key.
 *
 * | Route | Key |
 * | --- | --- |
 * | Record a decline; record an acceptance (which waits) | `rush:bid` |
 * | Confirm a recorded acceptance; rescind | `rush:manage` |
 *
 * Each answers 409, in words, when the bid isn't in a state the action
 * takes, so two members acting at once can't both win.
 */
@ApiTags('Rush')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard, ChapterGuard, PermissionsGuard)
@RequirePermissions(SystemPermissions.MEMBERS_VIEW)
@RequireModule('rush')
@Controller('rush/candidates/:id/bid')
export class RushBidController {
  constructor(private readonly bidService: RushBidService) {}

  @Post('decline')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(SystemPermissions.RUSH_BID)
  @ApiOperation({ summary: 'Record a decline the PNM gave on paper or aloud' })
  @ApiOkResponse({ type: RushBidDto })
  @ApiConflictResponse({ description: 'No open bid to decline' })
  async decline(
    @CurrentChapterId() chapterId: string,
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.bidService.recordDecline(id, chapterId, userId);
  }

  @Post('accept')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(SystemPermissions.RUSH_BID)
  @ApiOperation({
    summary:
      'Record an acceptance the PNM gave on paper or aloud; it waits for the PNM or `rush:manage` to confirm',
  })
  @ApiOkResponse({ type: RushBidDto })
  @ApiConflictResponse({
    description: 'No open bid, or an acceptance is already recorded',
  })
  async accept(
    @CurrentChapterId() chapterId: string,
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordRushAcceptanceDto,
  ) {
    return this.bidService.recordAcceptance(id, chapterId, userId, dto.email);
  }

  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(SystemPermissions.RUSH_MANAGE)
  @ApiOperation({
    summary:
      "Confirm a recorded acceptance; the PNM is invited with the chapter's new-member role",
  })
  @ApiOkResponse({ type: RushBidDto })
  @ApiConflictResponse({ description: 'No recorded acceptance to confirm' })
  async confirm(
    @CurrentChapterId() chapterId: string,
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.bidService.confirm(id, chapterId, userId);
  }

  @Post('rescind')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(SystemPermissions.RUSH_MANAGE)
  @ApiOperation({ summary: 'Take back an open bid, with a reason' })
  @ApiOkResponse({ type: RushBidDto })
  @ApiConflictResponse({ description: 'No open bid to rescind' })
  async rescind(
    @CurrentChapterId() chapterId: string,
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RescindRushBidDto,
  ) {
    return this.bidService.rescind(id, chapterId, userId, dto.reason);
  }
}
