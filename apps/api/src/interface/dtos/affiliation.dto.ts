import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsUUID } from 'class-validator';
import {
  COUNCIL_LINK_DECISIONS,
  COUNCIL_LINK_SIDES,
  COUNCIL_LINK_STATUSES,
  COUNCIL_TYPES,
  SCHOOL_LINK_DECISIONS,
  SCHOOL_LINK_STATUSES,
  type CouncilLinkDecision,
  type SchoolLinkDecision,
} from '@repo/validation';

// Requests --------------------------------------------------------------------

export class LinkSchoolDto {
  @ApiProperty({
    format: 'uuid',
    description:
      "The chapter's school. The officer naming it confirms it in the same step.",
  })
  @IsUUID()
  school_id: string;
}

export class DecideSchoolLinkDto {
  @ApiProperty({
    enum: SCHOOL_LINK_DECISIONS,
    description:
      "`active` confirms a proposed link, `declined` refuses it, `ended` unlinks a confirmed one (and ends the chapter's council links at that school).",
  })
  @IsIn(SCHOOL_LINK_DECISIONS)
  status: SchoolLinkDecision;
}

export class RequestCouncilDto {
  @ApiProperty({ format: 'uuid', description: 'The council to ask to join.' })
  @IsUUID()
  council_id: string;
}

export class InviteChapterDto {
  @ApiProperty({ format: 'uuid', description: 'The chapter to invite.' })
  @IsUUID()
  chapter_id: string;
}

export class DecideCouncilLinkDto {
  @ApiProperty({
    enum: COUNCIL_LINK_DECISIONS,
    description:
      "`accepted` or `declined` answers the other side's proposal; `accepted` also lifts the council's own suspension. `suspended` is the council's, on a member chapter. `ended` withdraws a proposal or ends a membership, from either side.",
  })
  @IsIn(COUNCIL_LINK_DECISIONS)
  status: CouncilLinkDecision;
}

// Responses -------------------------------------------------------------------

export class AffiliationSchoolSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Rensselaer Polytechnic Institute' })
  name: string;

  @ApiProperty({ example: 'RPI' })
  short_name: string;
}

export class AffiliationSchoolDto {
  @ApiProperty({ format: 'uuid' })
  link_id: string;

  @ApiProperty({ enum: SCHOOL_LINK_STATUSES })
  status: (typeof SCHOOL_LINK_STATUSES)[number];

  @ApiProperty()
  is_primary: boolean;

  @ApiProperty({ type: AffiliationSchoolSummaryDto })
  school: AffiliationSchoolSummaryDto;
}

export class SchoolLinkDecisionDto {
  @ApiProperty({ format: 'uuid' })
  link_id: string;

  @ApiProperty({ enum: SCHOOL_LINK_STATUSES })
  status: (typeof SCHOOL_LINK_STATUSES)[number];
}

export class CouncilLinkDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: COUNCIL_LINK_STATUSES })
  status: (typeof COUNCIL_LINK_STATUSES)[number];

  @ApiProperty({
    enum: COUNCIL_LINK_SIDES,
    description: 'Who proposed it: the council invited, or the chapter asked.',
  })
  proposed_by_side: (typeof COUNCIL_LINK_SIDES)[number];

  @ApiProperty({ format: 'date-time' })
  created_at: string;

  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  decided_at: string | null;
}

export class AffiliationCouncilSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'RPI IFC' })
  name: string;

  @ApiProperty({ enum: COUNCIL_TYPES, nullable: true })
  council_type: (typeof COUNCIL_TYPES)[number] | null;

  @ApiProperty({ description: 'Whether Frapp staff verified the council.' })
  verified: boolean;

  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  school_id: string | null;
}

export class ChapterCouncilDto {
  @ApiProperty({ type: AffiliationCouncilSummaryDto })
  council: AffiliationCouncilSummaryDto;

  @ApiProperty({
    type: CouncilLinkDto,
    nullable: true,
    description: "The live link, or null when the chapter isn't linked.",
  })
  link: CouncilLinkDto | null;

  @ApiProperty({
    description:
      "Whether this council's type is offered the chapter's archetype (council-types.md § Link offers). A chapter may still ask any council at its school.",
  })
  offered: boolean;
}

export class ChapterAffiliationsDto {
  @ApiProperty({
    type: [AffiliationSchoolDto],
    description: "The chapter's live school links, primary first.",
  })
  schools: AffiliationSchoolDto[];

  @ApiProperty({
    type: [ChapterCouncilDto],
    description:
      "The councils at the chapter's confirmed schools, and any it is linked to.",
  })
  councils: ChapterCouncilDto[];
}

export class ChapterListingDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Phi Gamma Delta' })
  name: string;

  @ApiProperty({ nullable: true, type: String, example: 'ifc' })
  org_archetype: string | null;

  @ApiProperty({ example: 'Rensselaer Polytechnic Institute' })
  university: string;
}

export class CouncilChapterDto {
  @ApiProperty({ type: CouncilLinkDto })
  link: CouncilLinkDto;

  @ApiProperty({
    type: ChapterListingDto,
    description:
      "The chapter's public listing only: never its members or data (#4068 decision 11).",
  })
  chapter: ChapterListingDto;
}

export class InviteCandidateDto {
  @ApiProperty({ type: ChapterListingDto })
  chapter: ChapterListingDto;

  @ApiProperty({
    description:
      "Whether the council's type is offered this chapter's archetype; offered chapters come first.",
  })
  offered: boolean;
}
