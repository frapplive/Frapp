import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { InterestFormService } from '../../application/services/interest-form.service';
import { SupabaseAuthGuard } from '../guards/supabase-auth.guard';
import { ChapterGuard } from '../guards/chapter.guard';
import { PermissionsGuard } from '../guards/permissions.guard';
import { RequirePermissions } from '../decorators/permissions.decorator';
import { RequireModule } from '../decorators/module.decorator';
import {
  CurrentChapterId,
  CurrentUser,
} from '../decorators/current-user.decorator';
import {
  AddInterestFormLabelDto,
  CandidateFormDto,
  ConfirmInterestFormCodeDto,
  InterestFormCodeSentDto,
  InterestFormSettingsDto,
  InterestFormSubmittedDto,
  InterestFormVerifiedDto,
  PublicInterestFormDto,
  StartInterestFormCodeDto,
  SubmitInterestFormDto,
  UpdateInterestFormDto,
} from '../dtos/interest-form.dto';
import { SystemPermissions } from '#domain/constants/permissions';
import type { RequestContext } from '../types/request-context.types';

/**
 * The chapter's interest form, on the Recruitment module page (#5977,
 * `ifc-recruitment.md` § Where the chapter's settings live). Reading it
 * takes `rush:view`; every change `rush:manage` (§ Permission map). The
 * rush class gates hold: the module on, and `members:view`.
 */
@ApiTags('Rush')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard, ChapterGuard, PermissionsGuard)
@RequirePermissions(SystemPermissions.MEMBERS_VIEW)
@RequireModule('rush')
@Controller('rush')
export class InterestFormController {
  constructor(private readonly forms: InterestFormService) {}

  @Get('interest-form')
  @RequirePermissions(SystemPermissions.RUSH_VIEW)
  @ApiOperation({
    summary: "The chapter's interest form, its QR codes and who it tells",
    description:
      'Written closed on the first read, as the form exists once Rush is on. `offered: false` for an NPHC chapter, which never gets one.',
  })
  @ApiOkResponse({ type: InterestFormSettingsDto })
  get(
    @CurrentChapterId() chapterId: string,
    @CurrentUser('id') userId: string,
  ): Promise<InterestFormSettingsDto> {
    return this.forms.getSettings(chapterId, userId);
  }

  @Patch('interest-form')
  @RequirePermissions(SystemPermissions.RUSH_MANAGE)
  @ApiOperation({
    summary:
      'Open or close the form, or change its blurb, questions or contacts',
  })
  @ApiOkResponse({ type: InterestFormSettingsDto })
  update(
    @CurrentChapterId() chapterId: string,
    @CurrentUser('id') userId: string,
    @Body() body: UpdateInterestFormDto,
  ): Promise<InterestFormSettingsDto> {
    return this.forms.updateSettings(chapterId, userId, body);
  }

  @Post('interest-form/labels')
  @RequirePermissions(SystemPermissions.RUSH_MANAGE)
  @ApiOperation({ summary: 'Add a QR source label' })
  @ApiOkResponse({ type: InterestFormSettingsDto })
  @HttpCode(HttpStatus.OK)
  addLabel(
    @CurrentChapterId() chapterId: string,
    @CurrentUser('id') userId: string,
    @Body() body: AddInterestFormLabelDto,
  ): Promise<InterestFormSettingsDto> {
    return this.forms.addLabel(chapterId, userId, body.label);
  }

  @Delete('interest-form/labels/:labelId')
  @RequirePermissions(SystemPermissions.RUSH_MANAGE)
  @ApiOperation({ summary: 'Remove a QR source label' })
  @ApiOkResponse({ type: InterestFormSettingsDto })
  removeLabel(
    @CurrentChapterId() chapterId: string,
    @CurrentUser('id') userId: string,
    @Param('labelId', ParseUUIDPipe) labelId: string,
  ): Promise<InterestFormSettingsDto> {
    return this.forms.removeLabel(chapterId, userId, labelId);
  }

  @Post('interest-form/replace')
  @RequirePermissions(SystemPermissions.RUSH_MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Replace the form: a new link, the old link and QR codes stop working',
  })
  @ApiOkResponse({ type: InterestFormSettingsDto })
  replace(
    @CurrentChapterId() chapterId: string,
    @CurrentUser('id') userId: string,
  ): Promise<InterestFormSettingsDto> {
    return this.forms.replace(chapterId, userId);
  }

  @Get('candidates/:id/form')
  @RequirePermissions(SystemPermissions.RUSH_VIEW)
  @ApiOperation({
    summary:
      "A candidate's newest interest-form submission: contact details and answers",
  })
  @ApiOkResponse({ type: CandidateFormDto })
  async candidateForm(
    @CurrentChapterId() chapterId: string,
    @Param('id', ParseUUIDPipe) candidateId: string,
  ): Promise<CandidateFormDto> {
    return {
      submission: await this.forms.candidateForm(chapterId, candidateId),
    };
  }
}

/**
 * The public page's routes (`/f/<form-slug>`, ADR-27): no account, no
 * `ChapterGuard`. The slug is the only key; a replaced form's slug, an
 * unknown one and a chapter that takes no interest all answer 404
 * `interest_form.not_found`. Codes and submissions are held to ceilings per
 * address and per IP by the database (`start_interest_form_code`), on top of
 * the global per-address write limit.
 */
@ApiTags('Interest form')
@Controller('interest-forms')
export class PublicInterestFormController {
  constructor(private readonly forms: InterestFormService) {}

  @Get(':slug')
  @ApiOperation({
    summary: "An interest form's public fields, with no account needed",
  })
  @ApiQuery({
    name: 'src',
    required: false,
    description: "The QR code's source label.",
  })
  @ApiOkResponse({ type: PublicInterestFormDto })
  get(
    @Param('slug') slug: string,
    @Query('src') src?: string,
  ): Promise<PublicInterestFormDto> {
    return this.forms.getPublic(
      slug,
      typeof src === 'string' ? src.slice(0, 60) : null,
    );
  }

  @Post(':slug/code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send a one-time code to the address, before the form shows',
    description:
      "409 `interest_form.closed`; 400 `interest_form.email.invalid` or `interest_form.email.wrong_domain` (an address off the chapter's school domains); 409 `interest_form.verification_unavailable`; 429 `interest_form.code.cooldown` or `interest_form.code.rate_limited`; 503 `interest_form.code.send_failed`.",
  })
  @ApiOkResponse({ type: InterestFormCodeSentDto })
  startCode(
    @Param('slug') slug: string,
    @Body() body: StartInterestFormCodeDto,
    @Req() request: RequestContext,
  ): Promise<InterestFormCodeSentDto> {
    return this.forms.startCode(slug, body.email, request.ip);
  }

  @Post(':slug/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Check the code; answers the proof the submission spends',
    description:
      '400 `interest_form.code.missing`, `interest_form.code.expired` or `interest_form.code.wrong`; 429 `interest_form.code.too_many_attempts`.',
  })
  @ApiOkResponse({ type: InterestFormVerifiedDto })
  verify(
    @Param('slug') slug: string,
    @Body() body: ConfirmInterestFormCodeDto,
  ): Promise<InterestFormVerifiedDto> {
    return this.forms.confirmCode(slug, body.email, body.code);
  }

  @Post(':slug/submissions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "Submit the form: the PNM joins the chapter's pipeline, and the council's master list once the link is accepted",
    description:
      '400 `interest_form.proof.invalid` (expired or spent: verify again), `interest_form.consent.required` or `interest_form.answers.invalid`; 409 `interest_form.closed`.',
  })
  @ApiOkResponse({ type: InterestFormSubmittedDto })
  submit(
    @Param('slug') slug: string,
    @Body() body: SubmitInterestFormDto,
  ): Promise<InterestFormSubmittedDto> {
    return this.forms.submit(slug, body);
  }
}
