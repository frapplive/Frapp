import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { FrappLinkTarget } from '@repo/validation';
import { FrappLinkService } from '../../application/services/frapp-link/frapp-link.service';
import { SupabaseAuthGuard } from '../guards/supabase-auth.guard';
import { ChapterGuard } from '../guards/chapter.guard';
import { PermissionsGuard } from '../guards/permissions.guard';
import { RequirePermissions } from '../decorators/permissions.decorator';
import {
  CurrentChapterId,
  CurrentEnabledModules,
  CurrentUser,
} from '../decorators/current-user.decorator';
import { SystemPermissions } from '#domain/constants/permissions';
import {
  FrappLinkTargetDto,
  ResolveFrappLinksDto,
  ResolveFrappLinksResponseDto,
} from '../dtos/frapp-link.dto';

function targetOf(dto: FrappLinkTargetDto): FrappLinkTarget {
  switch (dto.kind) {
    case 'document':
      return { kind: 'document', document_id: dto.document_id ?? '' };
    case 'minutes':
      return { kind: 'minutes', meeting_id: dto.meeting_id ?? '' };
    case 'event':
      return { kind: 'event', event_id: dto.event_id ?? '' };
    case 'message':
      return {
        kind: 'message',
        channel_id: dto.channel_id ?? '',
        message_id: dto.message_id ?? '',
      };
  }
}

/**
 * Frapp links (`spec/behavior/frapp-links.md`): the one read both apps make
 * to name the records a task's or an event's attachments point at. A read
 * with a body (a POST), since a task's list is up to ten records of four
 * kinds; it changes nothing.
 */
@ApiTags('Frapp links')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard, ChapterGuard, PermissionsGuard)
@RequirePermissions(SystemPermissions.MEMBERS_VIEW)
@Controller('frapp-links')
export class FrappLinkController {
  constructor(private readonly links: FrappLinkService) {}

  @Post('resolve')
  @HttpCode(200)
  @ApiOperation({
    summary:
      "What each record names for the caller: its live name when they may open it, `hidden` (no name) when they may not, `removed` when it's gone",
  })
  @ApiOkResponse({ type: ResolveFrappLinksResponseDto })
  async resolve(
    @CurrentChapterId() chapterId: string,
    @CurrentUser('id') userId: string,
    @CurrentEnabledModules() enabledModules: Record<string, boolean> | null,
    @Body() dto: ResolveFrappLinksDto,
  ): Promise<ResolveFrappLinksResponseDto> {
    return {
      links: await this.links.resolve(
        chapterId,
        userId,
        dto.targets.map(targetOf),
        enabledModules,
      ),
    };
  }
}
