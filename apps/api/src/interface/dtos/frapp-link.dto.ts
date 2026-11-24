import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  FRAPP_LINK_KINDS,
  FRAPP_LINK_STATES,
  FRAPP_LINK_TITLE_MAX,
  FRAPP_LINKS_RESOLVE_MAX,
  FRAPP_RECORD_LINK_KINDS,
  TASK_PROOF_LINK_MAX,
  type FrappLinkKind,
  type FrappLinkResolved,
  type FrappLinkState,
  type FrappRecordLinkKind,
} from '@repo/validation';

/**
 * One Frapp link (`spec/behavior/frapp-links.md`): a titled web address, or
 * one of the chapter's records (a Chapter Files document, minutes, an event,
 * a chat message). A flat shape rather than a `oneOf`, so the SDK type stays
 * one object; `kind` says which ids it carries. Tasks' and events' lists use
 * it, sent whole.
 */
export class FrappLinkDto {
  @ApiProperty({
    maxLength: 64,
    description: "The client's id for the entry. Unique within its list.",
  })
  @IsString()
  @MaxLength(64)
  id: string;

  @ApiProperty({ enum: FRAPP_LINK_KINDS })
  @IsIn([...FRAPP_LINK_KINDS])
  kind: FrappLinkKind;

  @ApiPropertyOptional({
    maxLength: TASK_PROOF_LINK_MAX,
    description: "A `link`'s address: http or https only. Never fetched.",
  })
  @ValidateIf((o: FrappLinkDto) => o.kind === 'link')
  @IsString()
  @MaxLength(TASK_PROOF_LINK_MAX)
  url?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      "A `document`'s Chapter Files document. A new one that isn't the chapter's is a 400.",
  })
  @ValidateIf((o: FrappLinkDto) => o.kind === 'document')
  @IsUUID()
  document_id?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: '`minutes`: the meeting whose minutes it opens.',
  })
  @ValidateIf((o: FrappLinkDto) => o.kind === 'minutes')
  @IsUUID()
  meeting_id?: string;

  @ApiPropertyOptional({ format: 'uuid', description: '`event`: the event.' })
  @ValidateIf((o: FrappLinkDto) => o.kind === 'event')
  @IsUUID()
  event_id?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      "`message`: the message's channel. On a save it is taken from the message, whatever is sent.",
  })
  @ValidateIf((o: FrappLinkDto) => o.kind === 'message')
  @IsUUID()
  channel_id?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: '`message`: the message.',
  })
  @ValidateIf((o: FrappLinkDto) => o.kind === 'message')
  @IsUUID()
  message_id?: string;

  @ApiPropertyOptional({
    maxLength: FRAPP_LINK_TITLE_MAX,
    description:
      "A `link`'s title (its domain when empty). An event's `document` keeps the name it had when attached, for older phone builds; every other record's name is read live with `POST /v1/frapp-links/resolve` and never stored.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(FRAPP_LINK_TITLE_MAX)
  title?: string;
}

/** One record to resolve: a Frapp link's kind and ids, without its list id. */
export class FrappLinkTargetDto {
  @ApiProperty({ enum: FRAPP_RECORD_LINK_KINDS })
  @IsIn([...FRAPP_RECORD_LINK_KINDS])
  kind: FrappRecordLinkKind;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((o: FrappLinkTargetDto) => o.kind === 'document')
  @IsUUID()
  document_id?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((o: FrappLinkTargetDto) => o.kind === 'minutes')
  @IsUUID()
  meeting_id?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((o: FrappLinkTargetDto) => o.kind === 'event')
  @IsUUID()
  event_id?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((o: FrappLinkTargetDto) => o.kind === 'message')
  @IsUUID()
  channel_id?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((o: FrappLinkTargetDto) => o.kind === 'message')
  @IsUUID()
  message_id?: string;
}

export class ResolveFrappLinksDto {
  @ApiProperty({
    type: [FrappLinkTargetDto],
    maxItems: FRAPP_LINKS_RESOLVE_MAX,
    description: `The records to read, at most ${FRAPP_LINKS_RESOLVE_MAX}. A record asked twice is answered once.`,
  })
  @IsArray()
  @ArrayMaxSize(FRAPP_LINKS_RESOLVE_MAX)
  @ValidateNested({ each: true })
  @Type(() => FrappLinkTargetDto)
  targets: FrappLinkTargetDto[];
}

export class FrappLinkResolvedDto implements FrappLinkResolved {
  @ApiProperty({
    description:
      'Which target this answers: `document:<id>`, `minutes:<id>`, `event:<id>` or `message:<message id>`.',
  })
  key: string;

  @ApiProperty({
    enum: FRAPP_LINK_STATES,
    description:
      '`ok`: the caller may open it. `hidden`: it exists but they may not, and its name is not sent. `removed`: deleted, or not this chapter’s.',
  })
  state: FrappLinkState;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      "The document's, meeting's or event's name; a message's channel name. Null unless `ok`.",
  })
  title: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      "The meeting's or event's start, or when the message was sent (ISO 8601). Null unless `ok`, and on a document.",
  })
  date: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Who sent the message. Null on every other kind.',
  })
  author: string | null;
}

export class ResolveFrappLinksResponseDto {
  @ApiProperty({ type: [FrappLinkResolvedDto] })
  links: FrappLinkResolvedDto[];
}
