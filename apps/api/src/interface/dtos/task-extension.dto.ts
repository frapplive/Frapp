import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  TASK_EXTENSION_DECLINE_MAX_LENGTH,
  TASK_EXTENSION_NEEDS_OFFICER,
  TASK_EXTENSION_REASON_MAX_LENGTH,
  TASK_EXTENSION_STATUSES,
} from '@repo/validation';
import type {
  TaskExtensionAiVerdict,
  TaskExtensionNeedsOfficer,
  TaskExtensionRequest,
  TaskExtensionStatus,
} from '#domain/entities/task-extension-request.entity';
import type { TaskExtensionSummary } from '#domain/entities/task.entity';

const trimmed = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** `POST /v1/tasks/:id/extension-requests` (#6096). */
export class RequestTaskExtensionDto {
  @ApiProperty({
    format: 'date',
    description:
      "The day asked for (`YYYY-MM-DD`), later than the task's. For a task due at a time, the day of `due_at` as the member sees it.",
  })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'due_date must be YYYY-MM-DD' })
  due_date: string;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      'The moment asked for: required on a task due at a time, refused on one due by a day.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  due_at?: string | null;

  @ApiProperty({
    minLength: 1,
    maxLength: TASK_EXTENSION_REASON_MAX_LENGTH,
    description: 'Why the member needs more time, in one short line.',
  })
  @Transform(trimmed)
  @IsString()
  @MinLength(1, { message: 'Say why you need more time' })
  @MaxLength(TASK_EXTENSION_REASON_MAX_LENGTH)
  reason: string;
}

/** `POST /v1/tasks/:id/extension-requests/:requestId/decline` (#6096). */
export class DeclineTaskExtensionDto {
  @ApiProperty({
    minLength: 1,
    maxLength: TASK_EXTENSION_DECLINE_MAX_LENGTH,
    description: 'Why not, shown to the member.',
  })
  @Transform(trimmed)
  @IsString()
  @MinLength(1, { message: 'Say why not' })
  @MaxLength(TASK_EXTENSION_DECLINE_MAX_LENGTH)
  reason: string;
}

/** `POST /v1/tasks/extension-requests/restore` (#6096). */
export class RestoreTaskExtensionsDto {
  @ApiProperty({ format: 'uuid', description: 'The member to restore.' })
  @IsUUID()
  user_id: string;
}

/** A request for more time, as a task read carries its latest (#6096). */
export class TaskExtensionSummaryDto implements TaskExtensionSummary {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: TASK_EXTENSION_STATUSES })
  status: TaskExtensionStatus;

  @ApiProperty()
  reason: string;

  @ApiProperty({ format: 'date' })
  from_due_date: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  from_due_at: string | null;

  @ApiProperty({ format: 'date' })
  to_due_date: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  to_due_at: string | null;

  @ApiProperty({
    enum: TASK_EXTENSION_NEEDS_OFFICER,
    nullable: true,
    description:
      'Why it waits on an officer; null when it was approved automatically.',
  })
  needs_officer: TaskExtensionNeedsOfficer | null;

  @ApiProperty()
  auto_approved: boolean;

  @ApiProperty({ type: String, nullable: true })
  decline_reason: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  decided_at: string | null;

  @ApiProperty({ format: 'date-time' })
  created_at: string;
}

/** A request for more time in full, for the officers who decide it. */
export class TaskExtensionRequestDto
  extends TaskExtensionSummaryDto
  implements TaskExtensionRequest
{
  @ApiProperty({ format: 'uuid' })
  chapter_id: string;

  @ApiProperty({ format: 'uuid' })
  task_id: string;

  @ApiProperty({ format: 'uuid' })
  requester_id: string;

  @ApiProperty({
    enum: ['valid', 'invalid'],
    nullable: true,
    description:
      "What AI made of the reason; null when it wasn't asked (over a day, a second request, back to back) or couldn't answer.",
  })
  ai_verdict: TaskExtensionAiVerdict | null;

  @ApiProperty({ type: String, nullable: true })
  ai_note: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  decided_by: string | null;
}

/** The answer to asking for more time. */
export class RequestTaskExtensionResponseDto {
  @ApiProperty({ type: () => TaskExtensionSummaryDto })
  extension: TaskExtensionSummaryDto;

  @ApiProperty({
    description:
      "True when this extension was the 3rd in 30 days: the member can't ask again until an officer restores it.",
  })
  now_blocked: boolean;
}

/** An officer's decision. */
export class DecideTaskExtensionResponseDto {
  @ApiProperty({ type: () => TaskExtensionRequestDto })
  extension: TaskExtensionRequestDto;
}

/** `GET /v1/tasks/extension-requests/blocked` (#6096). */
export class BlockedFromExtensionsDto {
  @ApiProperty({ format: 'uuid' })
  user_id: string;

  @ApiProperty({ format: 'date-time' })
  blocked_at: string;
}
