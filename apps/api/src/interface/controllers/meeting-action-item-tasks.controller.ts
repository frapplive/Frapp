import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
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
import { MeetingTaskSuggestionsService } from '../../application/services/meeting-task-suggestions.service';
import { RbacService } from '../../application/services/rbac.service';
import { SystemPermissions } from '#domain/constants/permissions';
import { SupabaseAuthGuard } from '../guards/supabase-auth.guard';
import { ChapterGuard } from '../guards/chapter.guard';
import { PermissionsGuard } from '../guards/permissions.guard';
import { RequirePermissions } from '../decorators/permissions.decorator';
import { RequireModule } from '../decorators/module.decorator';
import {
  CurrentChapterId,
  CurrentEnabledModules,
  CurrentUser,
} from '../decorators/current-user.decorator';
import {
  MakeActionItemTaskDto,
  MeetingActionItemTaskDto,
  SeriesOpenActionItemsDto,
} from '../dtos/meeting-action-item-task.dto';
import { VerifySessionLocally } from '../decorators/session-check.decorator';

/**
 * The tasks posted minutes' action items became, for the minutes' checkboxes
 * (`spec/behavior/meetings.md` § Suggested tasks). It lives beside the
 * suggestions, which link an item to its task, rather than in the meetings
 * module, which the suggestions module already imports. The guards and the
 * read rule are the minutes' own.
 */
@ApiTags('Meetings')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard, ChapterGuard, PermissionsGuard)
@RequirePermissions(SystemPermissions.MEMBERS_VIEW)
@RequireModule('meetings')
@Controller('meetings')
export class MeetingActionItemTasksController {
  constructor(
    private readonly suggestions: MeetingTaskSuggestionsService,
    private readonly rbac: RbacService,
  ) {}

  @Get(':id/action-item-tasks')
  @VerifySessionLocally()
  @ApiOperation({
    summary:
      'Which action items of posted minutes became tasks, and whether each is done. Empty for a draft. A caller with `tasks:manage` also gets each task’s id and who it went to (#6051)',
  })
  @ApiOkResponse({ type: MeetingActionItemTaskDto, isArray: true })
  async list(
    @CurrentChapterId() chapterId: string,
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<MeetingActionItemTaskDto[]> {
    // Who may read every task may be told which task and whose (#6051);
    // everyone else sees only the done mark (`tasks.md` § Visibility).
    const withTask = await this.rbac.memberHasAnyPermission(chapterId, userId, [
      SystemPermissions.TASKS_MANAGE,
    ]);
    const marks = await this.suggestions.actionItemTasks(
      chapterId,
      id,
      userId,
      { withTask },
    );
    return marks.map((mark) => MeetingActionItemTaskDto.from(mark));
  }

  @Post(':id/action-items/:index/task')
  @RequirePermissions(SystemPermissions.TASKS_MANAGE)
  @RequireModule('tasks')
  @ApiOperation({
    summary:
      'Make an action item of posted minutes a task for these members, when no suggestion is waiting for it (#6062). An item already a task keeps it; one with a suggestion waiting accepts that suggestion. The service also checks Meetings is on',
  })
  @ApiCreatedResponse({ type: MeetingActionItemTaskDto })
  @ApiConflictResponse({
    description:
      'The minutes changed since they were read, or the item is a task already (another officer made it at the same moment, or it was accepted up for grabs)',
  })
  async makeTask(
    @CurrentChapterId() chapterId: string,
    @CurrentUser('id') userId: string,
    @CurrentEnabledModules() enabledModules: Record<string, boolean> | null,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('index', ParseIntPipe) index: number,
    @Body() body: MakeActionItemTaskDto,
  ): Promise<MeetingActionItemTaskDto> {
    return MeetingActionItemTaskDto.from(
      await this.suggestions.makeTask(
        chapterId,
        userId,
        id,
        index,
        body,
        enabledModules,
      ),
    );
  }

  @Get('series/:key/open-action-items')
  @ApiOperation({
    summary:
      'The action items still open across one repeating meeting’s posted minutes, newest first: open until the task each became is done (#5482)',
  })
  @ApiOkResponse({ type: SeriesOpenActionItemsDto, isArray: true })
  async seriesOpen(
    @CurrentChapterId() chapterId: string,
    @CurrentUser('id') userId: string,
    @Param('key', ParseUUIDPipe) key: string,
  ): Promise<SeriesOpenActionItemsDto[]> {
    return this.suggestions.seriesOpenActionItems(chapterId, userId, key);
  }
}
