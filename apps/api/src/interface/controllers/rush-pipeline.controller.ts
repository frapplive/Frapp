import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
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
import { RushPipelineService } from '../../application/services/rush-pipeline.service';
import { RbacService } from '../../application/services/rbac.service';
import { SupabaseAuthGuard } from '../guards/supabase-auth.guard';
import { ChapterGuard } from '../guards/chapter.guard';
import { PermissionsGuard } from '../guards/permissions.guard';
import {
  RequireAnyOfPermissions,
  RequirePermissions,
} from '../decorators/permissions.decorator';
import { RequireModule } from '../decorators/module.decorator';
import {
  CurrentChapterId,
  CurrentUser,
} from '../decorators/current-user.decorator';
import {
  MoveRushCandidateStageDto,
  RushCandidateStageDto,
  RateRushCandidateDto,
  RushCandidateTagsDto,
  RushNoteDto,
  RushNoteInputDto,
  RushPipelineDto,
  RushStageDto,
  RushTagDto,
  RushTagInputDto,
  SaveRushStagesDto,
  SetRushCandidateTagsDto,
} from '../dtos/rush-pipeline.dto';
import { SystemPermissions } from '#domain/constants/permissions';

/**
 * The recruitment pipeline (#5924, `spec/behavior/rush.md` § Pipeline). Same
 * class gates as `RushController`: the `rush` module on and `members:view`,
 * plus each route's own key.
 *
 * | Route | Key |
 * | --- | --- |
 * | Read the pipeline, stages, tags | `rush:view` |
 * | Move a candidate's stage | `rush:add` |
 * | Tag a candidate; write, edit (own) a note | `rush:notes` |
 * | Read notes | `rush:read_notes` |
 * | Rate | `rush:vote` |
 * | Edit stages and the tag list; delete anyone's note | `rush:manage` |
 */
@ApiTags('Rush')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard, ChapterGuard, PermissionsGuard)
@RequirePermissions(SystemPermissions.MEMBERS_VIEW)
@RequireModule('rush')
@Controller('rush')
export class RushPipelineController {
  constructor(
    private readonly pipelineService: RushPipelineService,
    private readonly rbacService: RbacService,
  ) {}

  @Get('pipeline')
  @RequirePermissions(SystemPermissions.RUSH_VIEW)
  @ApiOperation({
    summary: "The chapter's stages, tags and candidates, for the pipeline",
  })
  @ApiOkResponse({ type: RushPipelineDto })
  async pipeline(
    @CurrentChapterId() chapterId: string,
    @CurrentUser('id') userId: string,
  ) {
    const canViewResults = this.rbacService.memberHasAnyPermission(
      chapterId,
      userId,
      [SystemPermissions.RUSH_VIEW_RESULTS],
    );
    // Marks the rejection handled if a read below fails first; the service
    // still awaits it and sees the rejection.
    canViewResults.catch(() => undefined);
    return this.pipelineService.getPipeline(chapterId, {
      id: userId,
      canViewResults,
    });
  }

  @Get('stages')
  @RequirePermissions(SystemPermissions.RUSH_VIEW)
  @ApiOperation({
    summary: "The chapter's stages, in board order (written on first read)",
  })
  @ApiOkResponse({ type: [RushStageDto] })
  async stages(@CurrentChapterId() chapterId: string) {
    return this.pipelineService.listStages(chapterId);
  }

  @Put('stages')
  @RequirePermissions(SystemPermissions.RUSH_MANAGE)
  @ApiOperation({
    summary: 'Save the stage list: rename, reorder, hide and add stages',
  })
  @ApiOkResponse({ type: [RushStageDto] })
  async saveStages(
    @CurrentChapterId() chapterId: string,
    @Body() dto: SaveRushStagesDto,
  ) {
    return this.pipelineService.saveStages(chapterId, dto.stages);
  }

  @Patch('candidates/:id/stage')
  @RequirePermissions(SystemPermissions.RUSH_ADD)
  @ApiOperation({
    summary: 'Move a candidate to a stage (a Closed stage needs a reason)',
  })
  @ApiOkResponse({ type: RushCandidateStageDto })
  async moveStage(
    @CurrentChapterId() chapterId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MoveRushCandidateStageDto,
  ): Promise<RushCandidateStageDto> {
    const moved = await this.pipelineService.moveStage(
      id,
      chapterId,
      dto.stage,
      dto.closed_reason,
    );
    return {
      id: moved.id,
      stage: moved.stage,
      closed_reason: moved.closed_reason,
    };
  }

  @Post('tags')
  @RequirePermissions(SystemPermissions.RUSH_MANAGE)
  @ApiOperation({ summary: 'Add a tag to the chapter’s list' })
  @ApiCreatedResponse({ type: RushTagDto })
  async createTag(
    @CurrentChapterId() chapterId: string,
    @Body() dto: RushTagInputDto,
  ) {
    return this.pipelineService.createTag(chapterId, dto.label);
  }

  @Patch('tags/:tagId')
  @RequirePermissions(SystemPermissions.RUSH_MANAGE)
  @ApiOperation({ summary: 'Rename a tag' })
  @ApiOkResponse({ type: RushTagDto })
  async renameTag(
    @CurrentChapterId() chapterId: string,
    @Param('tagId', ParseUUIDPipe) tagId: string,
    @Body() dto: RushTagInputDto,
  ) {
    return this.pipelineService.renameTag(tagId, chapterId, dto.label);
  }

  @Delete('tags/:tagId')
  @HttpCode(204)
  @RequirePermissions(SystemPermissions.RUSH_MANAGE)
  @ApiOperation({ summary: 'Delete a tag, taking it off every candidate' })
  @ApiNoContentResponse()
  async deleteTag(
    @CurrentChapterId() chapterId: string,
    @Param('tagId', ParseUUIDPipe) tagId: string,
  ) {
    await this.pipelineService.deleteTag(tagId, chapterId);
  }

  @Put('candidates/:id/tags')
  @RequirePermissions(SystemPermissions.RUSH_NOTES)
  @ApiOperation({ summary: "Set a candidate's tags" })
  @ApiOkResponse({ type: RushCandidateTagsDto })
  async setTags(
    @CurrentChapterId() chapterId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetRushCandidateTagsDto,
  ) {
    return {
      tag_ids: await this.pipelineService.setCandidateTags(
        id,
        chapterId,
        dto.tag_ids,
      ),
    };
  }

  @Put('candidates/:id/rating')
  @HttpCode(204)
  @RequirePermissions(SystemPermissions.RUSH_VOTE)
  @ApiOperation({
    summary: "Set the caller's 1-to-5 rating of a candidate (replaces it)",
  })
  @ApiNoContentResponse()
  async rate(
    @CurrentChapterId() chapterId: string,
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RateRushCandidateDto,
  ) {
    await this.pipelineService.rate(id, chapterId, userId, dto.rating);
  }

  @Get('candidates/:id/notes')
  @RequirePermissions(SystemPermissions.RUSH_READ_NOTES)
  @ApiOperation({
    summary:
      "A candidate's notes, newest first (empty for a candidate linked to the caller)",
  })
  @ApiOkResponse({ type: [RushNoteDto] })
  async notes(
    @CurrentChapterId() chapterId: string,
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.pipelineService.listNotes(id, chapterId, userId);
  }

  @Post('candidates/:id/notes')
  @RequirePermissions(SystemPermissions.RUSH_NOTES)
  @ApiOperation({ summary: 'Write a note on a candidate' })
  @ApiCreatedResponse({ type: RushNoteDto })
  async addNote(
    @CurrentChapterId() chapterId: string,
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RushNoteInputDto,
  ) {
    return this.pipelineService.addNote(id, chapterId, userId, dto.body);
  }

  @Patch('candidates/:id/notes/:noteId')
  @RequirePermissions(SystemPermissions.RUSH_NOTES)
  @ApiOperation({ summary: 'Edit your own note' })
  @ApiOkResponse({ type: RushNoteDto })
  async editNote(
    @CurrentChapterId() chapterId: string,
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('noteId', ParseUUIDPipe) noteId: string,
    @Body() dto: RushNoteInputDto,
  ) {
    return this.pipelineService.editNote(
      noteId,
      id,
      chapterId,
      userId,
      dto.body,
    );
  }

  @Delete('candidates/:id/notes/:noteId')
  @HttpCode(204)
  @RequireAnyOfPermissions(
    SystemPermissions.RUSH_NOTES,
    SystemPermissions.RUSH_MANAGE,
  )
  @ApiOperation({
    summary: 'Delete a note: your own, or any with `rush:manage`',
  })
  @ApiNoContentResponse()
  async deleteNote(
    @CurrentChapterId() chapterId: string,
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('noteId', ParseUUIDPipe) noteId: string,
  ) {
    const canManage = await this.rbacService.memberHasAnyPermission(
      chapterId,
      userId,
      [SystemPermissions.RUSH_MANAGE],
    );
    await this.pipelineService.deleteNote(
      noteId,
      id,
      chapterId,
      userId,
      canManage,
    );
  }
}
