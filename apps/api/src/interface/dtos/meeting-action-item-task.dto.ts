import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  MEETING_ITEM_TEXT_MAX_LENGTH,
  TASK_GROUP_AUDIENCES,
  TASK_PEOPLE_MAX,
  TASK_TITLE_MAX_LENGTH,
  type TaskGroupAudience,
} from '@repo/validation';
import type { ActionItemTask } from '../../application/services/meeting-task-suggestions.service';

/** A task for everyone's progress: copies done out of all of them. */
export class ActionItemTaskGroupDto {
  @ApiProperty({ minimum: 0 })
  done!: number;

  @ApiProperty({ minimum: 0 })
  total!: number;
}

/** Who an action item's task went to (#6051). */
export class ActionItemTaskWhoDto {
  @ApiProperty({
    enum: TASK_GROUP_AUDIENCES,
    nullable: true,
    description:
      'A task for everyone’s audience; null for a task for one member.',
  })
  audience!: TaskGroupAudience | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'The role’s, group’s or tier’s name, when it went to one.',
  })
  audience_name!: string | null;

  @ApiProperty({
    type: [String],
    description:
      'The member, or the named people of a task for several. Empty for a role, group, tier or everyone.',
  })
  assignee_ids!: string[];
}

/** The task an action item became, for an officer (#6051). */
export class ActionItemTaskRefDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: ActionItemTaskWhoDto })
  who!: ActionItemTaskWhoDto;
}

/**
 * Where an action item of posted minutes stands as a task, for the minutes'
 * checkbox. Only the done mark is told, never the task's fields: a member
 * may read the minutes without being able to read the task. An officer who
 * manages tasks, who may read every task, is also told which task and whose.
 */
export class MeetingActionItemTaskDto {
  @ApiProperty({
    minimum: 0,
    description: 'The action item’s place in the minutes’ list, from 0.',
  })
  index!: number;

  @ApiProperty({
    description:
      'Marked done: by its member, or by every copy of a task for everyone.',
  })
  done!: boolean;

  @ApiProperty({
    type: ActionItemTaskGroupDto,
    nullable: true,
    description: 'A task for everyone: how many of its copies are done.',
  })
  group!: ActionItemTaskGroupDto | null;

  @ApiProperty({
    type: ActionItemTaskRefDto,
    nullable: true,
    description:
      'The task and who it went to, for a caller with `tasks:manage`; null for everyone else.',
  })
  task!: ActionItemTaskRefDto | null;

  static from(mark: ActionItemTask): MeetingActionItemTaskDto {
    return {
      index: mark.index,
      done: mark.done,
      group: mark.group,
      task: mark.task
        ? {
            id: mark.task.id,
            who: {
              audience: mark.task.who.audience,
              audience_name: mark.task.who.audience_name,
              assignee_ids: mark.task.who.assignee_ids,
            },
          }
        : null,
    };
  }
}

/** An action item still open, as the series screen lists it (#5482). */
export class OpenActionItemDto {
  @ApiProperty({
    minimum: 0,
    description: 'The action item’s place in its minutes’ list, from 0.',
  })
  index!: number;

  @ApiProperty()
  text!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  owner_user_id!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'A calendar day, `YYYY-MM-DD`.',
  })
  due_date!: string | null;

  @ApiProperty({
    type: ActionItemTaskGroupDto,
    nullable: true,
    description: 'A task for everyone: how many of its copies are done.',
  })
  group!: ActionItemTaskGroupDto | null;
}

/** One posted minutes of a series and its open action items. */
export class SeriesOpenActionItemsDto {
  @ApiProperty({ format: 'uuid' })
  meeting_id!: string;

  @ApiProperty({ format: 'date-time' })
  event_start_time!: string;

  @ApiProperty({ type: [OpenActionItemDto] })
  items!: OpenActionItemDto[];
}

/**
 * Makes an action item of posted minutes a task from the minutes (#6062):
 * the people it goes to, and the task's words, prefilled from the item.
 */
export class MakeActionItemTaskDto {
  @ApiProperty({
    description:
      'The item’s text as the officer saw it, so an edit to the minutes meanwhile is caught.',
    maxLength: MEETING_ITEM_TEXT_MAX_LENGTH,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(MEETING_ITEM_TEXT_MAX_LENGTH)
  text!: string;

  @ApiProperty({
    type: [String],
    format: 'uuid',
    minItems: 1,
    maxItems: TASK_PEOPLE_MAX,
    description: 'One member gets the task; several each get their own copy.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(TASK_PEOPLE_MAX)
  @IsUUID(undefined, { each: true })
  assignee_ids!: string[];

  @ApiPropertyOptional({
    maxLength: TASK_TITLE_MAX_LENGTH,
    description: 'Defaults to the item’s text.',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(TASK_TITLE_MAX_LENGTH)
  title?: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      '`YYYY-MM-DD`, or null for none. Defaults to the day the minutes named.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  due_date?: string | null;
}
