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
import { RbacService } from '../../application/services/rbac.service';

/**
 * The tasks posted minutes' action items became, for the minutes' checkboxes
 * and faces, and making an item a task from the minutes (#6062;
 * `spec/behavior/meetings.md` § Suggested tasks). It lives beside the
 * suggestions, which link an item to its task, rather than in the meetings
 * module, which the suggestions module already imports. The reads take the
 * minutes' guards and read rule; the write also takes `tasks:manage` and
 * Tasks on (and the service checks Meetings on, which the guard can't name
 * beside Tasks).
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
      'Which action items of posted minutes became tasks: whether each is done, its status, and who has it; the task id only for a viewer who can manage tasks. Empty for a draft',
  })
  @ApiOkResponse({ type: MeetingActionItemTaskDto, isArray: true })
  async list(
    @CurrentChapterId() chapterId: string,
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<MeetingActionItemTaskDto[]> {
    const [marks, manages] = await Promise.all([
      this.suggestions.actionItemTasks(chapterId, id, userId),
      this.rbac.memberHasAnyPermission(chapterId, userId, [
        SystemPermissions.TASKS_MANAGE,
      ]),
    ]);
    // Only a task manager can open the task; anyone else sees who has it
    // and where it stands, as the minutes already say who owes it.
    return manages ? marks : marks.map((mark) => ({ ...mark, task_id: null }));
  }

  @Post(':id/action-items/:index/task')
  @RequirePermissions(SystemPermissions.TASKS_MANAGE)
  @RequireModule('tasks')
  @ApiOperation({
    summary:
      'Make an action item of posted minutes a task, assigned to these members (#6062). An item already a task keeps it; one with a suggestion waiting accepts that suggestion',
  })
  @ApiCreatedResponse({ type: MeetingActionItemTaskDto })
  @ApiConflictResponse({
    description:
      'The minutes changed since they were read, or another officer made the item a task at the same moment',
  })
  async makeTask(
    @CurrentChapterId() chapterId: string,
    @CurrentUser('id') userId: string,
    @CurrentEnabledModules() enabledModules: Record<string, boolean> | null,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('index', ParseIntPipe) index: number,
    @Body() body: MakeActionItemTaskDto,
  ): Promise<MeetingActionItemTaskDto> {
    return this.suggestions.makeTask(
      chapterId,
      userId,
      id,
      index,
      body,
      enabledModules,
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
