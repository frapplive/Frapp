import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ChatTimeoutService } from '../../application/services/chat-timeout.service';
import { SupabaseAuthGuard } from '../guards/supabase-auth.guard';
import { ChapterGuard } from '../guards/chapter.guard';
import { PermissionsGuard } from '../guards/permissions.guard';
import { RequirePermissions } from '../decorators/permissions.decorator';
import { FreeTier } from '../decorators/subscription.decorator';
import { TenantKinds } from '../decorators/tenant-kinds.decorator';
import {
  CurrentChapterId,
  CurrentUser,
} from '../decorators/current-user.decorator';
import { SystemPermissions } from '#domain/constants/permissions';
import {
  ChatTimeoutStateDto,
  MemberChatTimeoutDto,
  SetChatTimeoutDto,
} from '../dtos/chat-timeout.dto';

/**
 * Chat timeouts (#6006, `spec/behavior/chat/README.md` § Timeouts): an
 * officer holding `members:timeout` stops a member ranked below them from
 * posting or reacting in the chapter's channels for a while, and can lift it.
 * `ChatTimeoutService` applies the rank rule; `ChannelAccessService` enforces
 * the timeout on every channel write.
 *
 * `@FreeTier()` because chat is a free module (`ChatController` carries the
 * same): moderating it can't wait on billing.
 */
@ApiTags('Chat')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard, ChapterGuard, PermissionsGuard)
@RequirePermissions(SystemPermissions.MEMBERS_VIEW)
@FreeTier()
// Councils too (#5933): a council's channels are moderated the same way, and
// its profile read serves `viewer_can_timeout` like a chapter's.
@TenantKinds('chapter', 'council')
@Controller()
export class ChatTimeoutController {
  constructor(private readonly timeouts: ChatTimeoutService) {}

  @Get('chat/timeout')
  @ApiOperation({
    summary:
      "The caller's own chat timeout in this chapter: until when they can't post or react in channels, or nulls",
  })
  @ApiOkResponse({ type: ChatTimeoutStateDto })
  async mine(
    @CurrentChapterId() chapterId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.timeouts.mine(chapterId, userId);
  }

  @Put('members/:id/chat-timeout')
  @ApiOperation({
    summary:
      "Time a member out of the chapter's channels for 5 minutes, 1 hour, 1 day or 1 week, replacing any timeout they have. Only a member ranked below you, never the President.",
  })
  @ApiOkResponse({ type: MemberChatTimeoutDto })
  @RequirePermissions(SystemPermissions.MEMBERS_TIMEOUT)
  async timeOut(
    @CurrentChapterId() chapterId: string,
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) memberId: string,
    @Body() dto: SetChatTimeoutDto,
  ) {
    return this.timeouts.timeOut({
      chapterId,
      memberId,
      actorUserId: userId,
      duration: dto.duration,
      reason: dto.reason ?? null,
    });
  }

  @Delete('members/:id/chat-timeout')
  @ApiOperation({
    summary:
      "Lift a member's chat timeout early. Under the same rank rule as setting one.",
  })
  @ApiOkResponse({ type: MemberChatTimeoutDto })
  @RequirePermissions(SystemPermissions.MEMBERS_TIMEOUT)
  async lift(
    @CurrentChapterId() chapterId: string,
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) memberId: string,
  ) {
    return this.timeouts.lift({ chapterId, memberId, actorUserId: userId });
  }
}
