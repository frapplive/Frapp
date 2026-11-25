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
  TASK_PEOPLE_MAX,
  TASK_TITLE_MAX_LENGTH,
} from '@repo/validation';
import { TaskStatus } from '#domain/entities/task.entity';

/** A task for everyone's progress: copies done out of all of them. */
export class ActionItemTaskGroupDto {
  @ApiProperty({ minimum: 0 })
  done!: number;

  @ApiProperty({ minimum: 0 })
  total!: number;
}

/**
 * Where an action item of posted minutes stands as a task, for the minutes'
 * checkbox and faces (#6062). Who has it and where it stands are told, as
 * the minutes say who owes an item; the task's other fields are not, since a
 * member may read the minutes without being able to read the task.
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
    enum: TaskStatus,
    description:
      'The task’s status; a task for everyone’s copies read as one (done when all are, overdue when an open one is).',
  })
  status!: TaskStatus;

  @ApiProperty({
    type: [String],
    format: 'uuid',
    description: 'Who has it: its member, or every copy’s.',
  })
  assignee_ids!: string[];

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description:
      'The task, for a viewer who can manage tasks; null for anyone else.',
  })
  task_id!: string | null;
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
