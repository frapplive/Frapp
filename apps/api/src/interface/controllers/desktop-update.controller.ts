import {
  Controller,
  Get,
  Logger,
  NotFoundException,
  Param,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ApiFoundResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { DesktopUpdateService } from '../../application/services/desktop-update/desktop-update.service';
import { DesktopReleaseStoreError } from '#domain/adapters/desktop-release-store.interface';

/**
 * Where an installed desktop app looks for updates (#4843, ADR-29 decision
 * 8; `apps/desktop/electron-builder.yml` names this address). Each file
 * answers with a redirect to a time-limited link into the private releases
 * bucket, so the bucket is never public and the app never holds a Google
 * address.
 *
 * No auth guard, deliberately: the updater runs before anyone signs in, and
 * what it fetches is the installer anyone may download. The per-address read
 * limit applies as it does to any public read; an app asks for two small
 * feeds every few hours and a handful of files per update.
 */
@ApiTags('Desktop updates')
@Controller('desktop/updates')
export class DesktopUpdateController {
  private readonly logger = new Logger(DesktopUpdateController.name);

  constructor(private readonly updates: DesktopUpdateService) {}

  @Get(':file')
  @ApiOperation({
    summary:
      'A desktop release file or update feed: redirects to a time-limited download link',
  })
  @ApiParam({
    name: 'file',
    description:
      'A feed (`latest.yml`, `latest-mac.yml`, `beta.yml`, `beta-mac.yml`) or a file a feed names',
  })
  @ApiFoundResponse({ description: 'The download link, in `Location`' })
  @ApiNotFoundResponse({ description: 'Not a file a release publishes' })
  @ApiServiceUnavailableResponse({
    description: 'This API cannot reach the releases bucket',
  })
  async file(
    @Param('file') file: string,
    @Res() response: Response,
  ): Promise<void> {
    let link: string | null;
    try {
      link = await this.updates.linkFor(file);
    } catch (error) {
      if (!(error instanceof DesktopReleaseStoreError)) throw error;
      this.logger.warn(`Desktop update link unavailable: ${error.reason}`);
      throw new ServiceUnavailableException('Desktop updates are unavailable');
    }
    if (!link) throw new NotFoundException();
    // The link is good for an hour and differs per signing; nothing between
    // the app and this API may keep the redirect.
    response.setHeader('Cache-Control', 'no-store');
    response.redirect(302, link);
  }
}
