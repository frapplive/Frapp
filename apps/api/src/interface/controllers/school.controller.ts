import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SchoolService } from '../../application/services/school.service';
import type { SchoolMember } from '#domain/entities/school.entity';
import { SupabaseAuthGuard } from '../guards/supabase-auth.guard';
import { SchoolGuard, SCHOOL_HEADER } from '../guards/school.guard';
import { AuthSyncInterceptor } from '../interceptors/auth-sync.interceptor';
import {
  CurrentSchoolMember,
  CurrentUser,
} from '../decorators/current-user.decorator';
import type { RequestContext } from '../types/request-context.types';
import {
  ConfirmSchoolVerificationDto,
  MySchoolDto,
  SchoolSummaryDto,
  SearchSchoolsQueryDto,
  SentSchoolCodeDto,
  StartSchoolVerificationDto,
} from '../dtos/school.dto';

/**
 * Finding your school and proving you go there (school layer 1, #5929;
 * `spec/architecture/school-layer.md` § 2.2). About the person, not a
 * chapter, so there is no `ChapterGuard`: every route acts for the caller
 * alone. The code's ceilings (per address, per IP and per account) are the
 * database's, counted under a lock (`SchoolService.startVerification`).
 */
@ApiTags('Schools')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@UseInterceptors(AuthSyncInterceptor)
@Controller('schools')
export class SchoolController {
  constructor(private readonly schools: SchoolService) {}

  @Get()
  @ApiOperation({
    summary: 'Search schools',
    description:
      'Schools by name, short name or another name, best match first, at most 20. Each says whether a student can verify there today.',
  })
  @ApiOkResponse({ type: [SchoolSummaryDto] })
  search(@Query() query: SearchSchoolsQueryDto): Promise<SchoolSummaryDto[]> {
    return this.schools.search(query.q);
  }

  @Get('mine')
  @ApiOperation({
    summary: 'Your schools',
    description:
      "The schools where the caller proved a school address, newest first. Empty for someone who hasn't verified, or skipped.",
  })
  @ApiOkResponse({ type: [MySchoolDto] })
  listMine(@CurrentUser('id') userId: string): Promise<MySchoolDto[]> {
    return this.schools.listMine(userId);
  }

  @Post(':schoolId/verification')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send a code to your school email',
    description:
      "Emails a six-digit code to an address on one of the school's verified domains. 404 `school.not_found`; 409 `school.verification_unavailable` when the school can't verify students yet; 400 `school.email.invalid` for anything but a plain `local@domain` address, or `school.email.wrong_domain`; 429 `school.code.cooldown` within a minute of the last code, or `school.code.rate_limited` past the hourly ceilings per address, IP or account; 503 `school.code.send_failed`.",
  })
  @ApiOkResponse({ type: SentSchoolCodeDto })
  startVerification(
    @CurrentUser('id') userId: string,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Body() body: StartSchoolVerificationDto,
    @Req() request: RequestContext,
  ): Promise<SentSchoolCodeDto> {
    return this.schools.startVerification(
      userId,
      schoolId,
      body.email,
      request.ip,
    );
  }

  @Post(':schoolId/verification/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirm your school email with its code',
    description:
      'Checks the code and makes the caller a member of the school. 400 `school.code.missing`, `school.code.expired` or `school.code.wrong`; 429 `school.code.too_many_attempts`; 409 `school.email.taken` when another account verified that address, or `school.verification_unavailable`.',
  })
  @ApiOkResponse({ type: MySchoolDto })
  confirmVerification(
    @CurrentUser('id') userId: string,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Body() body: ConfirmSchoolVerificationDto,
  ): Promise<MySchoolDto> {
    return this.schools.confirmVerification(userId, schoolId, body.code);
  }
}

/**
 * A campus page's school (ADR-27 decision 3): the request names it in
 * `x-school-id`, and `SchoolGuard` serves only its live members.
 */
@ApiTags('Schools')
@ApiBearerAuth()
@ApiHeader({
  name: SCHOOL_HEADER,
  required: true,
  description: 'The school a campus page (`/s/<slug>`) acts in.',
})
@UseGuards(SupabaseAuthGuard, SchoolGuard)
@Controller('school')
export class SchoolPageController {
  constructor(private readonly schools: SchoolService) {}

  @Get()
  @ApiOperation({
    summary: 'The school a campus page names',
    description:
      "The school in `x-school-id` and the caller's membership there. 403 `school.context.invalid` for a school the caller isn't verified at (or that doesn't exist); 400 `school.context.required` without the header.",
  })
  @ApiOkResponse({ type: MySchoolDto })
  get(@CurrentSchoolMember() membership: SchoolMember): Promise<MySchoolDto> {
    return this.schools.getForMember(membership);
  }
}
