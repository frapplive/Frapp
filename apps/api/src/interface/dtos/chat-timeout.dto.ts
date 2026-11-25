import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CHAT_TIMEOUT_DURATION_KEYS,
  CHAT_TIMEOUT_REASON_MAX,
  type ChatTimeoutDurationKey,
} from '@repo/validation';

/** `PUT /v1/members/{id}/chat-timeout`: how long, and why (#6006). */
export class SetChatTimeoutDto {
  @ApiProperty({
    enum: CHAT_TIMEOUT_DURATION_KEYS,
    description: '5 minutes, 1 hour, 1 day or 1 week.',
  })
  @IsIn(CHAT_TIMEOUT_DURATION_KEYS)
  duration: ChatTimeoutDurationKey;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: CHAT_TIMEOUT_REASON_MAX,
    description:
      'Shown to the member and to officers who can time out. Optional.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(CHAT_TIMEOUT_REASON_MAX)
  reason?: string | null;
}

/** The caller's own chat timeout (`GET /v1/chat/timeout`). */
export class ChatTimeoutStateDto {
  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      "Until when the caller can't post or react in the chapter's channels; null when they can.",
  })
  until: string | null;

  @ApiProperty({ type: String, nullable: true })
  reason: string | null;
}

/** A member's chat timeout after an officer set or lifted it. */
export class MemberChatTimeoutDto extends ChatTimeoutStateDto {
  @ApiProperty({ format: 'uuid' })
  member_id: string;
}
