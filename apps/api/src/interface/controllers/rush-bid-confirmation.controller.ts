import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { RushBidService } from '../../application/services/rush-bid.service';
import { ThrottlePublicTokenRead } from '../decorators/throttle-profiles.decorator';
import {
  RushBidConfirmTokenDto,
  RushBidConfirmationPreviewDto,
} from '../dtos/rush-pipeline.dto';

/**
 * The PNM's one tap (#5973, `spec/behavior/ifc-recruitment.md` § Bids): the
 * page the confirmation email links to, which needs no account. A PNM may
 * have none, and until the PNM's own view lands (§ Phasing, step 7) the
 * emailed link is how they reach it.
 *
 * A controller of its own, unguarded, because every other recruitment route
 * is guarded at the class level (as `InviteDetailsController` is apart from
 * `InviteController`). The token is the credential: only the PNM's inbox has
 * it, and the database keeps only its hash. Both routes are POSTs so the
 * token rides in the body, never in a URL a log keeps; the email puts it in
 * the link's fragment, which no server sees. The page reads first and
 * confirms only on the tap, so a mail scanner that opens the link confirms
 * nothing. An unknown, used or expired token is the same 404.
 */
@ApiTags('Rush')
@Controller('rush/bid-confirmations')
export class RushBidConfirmationController {
  constructor(private readonly bidService: RushBidService) {}

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @ThrottlePublicTokenRead()
  @ApiOperation({
    summary:
      "A recorded bid acceptance's chapter, who recorded it and whether it waits, with no account needed",
  })
  @ApiOkResponse({ type: RushBidConfirmationPreviewDto })
  @ApiNotFoundResponse({ description: 'No waiting confirmation for that link' })
  async preview(@Body() dto: RushBidConfirmTokenDto) {
    return this.bidService.previewByToken(dto.token);
  }

  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  @ThrottlePublicTokenRead()
  @ApiOperation({
    summary:
      'The PNM confirms the acceptance a member recorded, with one tap from the emailed link',
  })
  @ApiOkResponse({ type: RushBidConfirmationPreviewDto })
  @ApiNotFoundResponse({ description: 'No waiting confirmation for that link' })
  async confirm(@Body() dto: RushBidConfirmTokenDto) {
    return this.bidService.confirmByToken(dto.token);
  }
}
