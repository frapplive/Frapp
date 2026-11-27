import { Module } from '@nestjs/common';
import { DesktopUpdateService } from '../../application/services/desktop-update/desktop-update.service';
import { DesktopUpdateController } from '../../interface/controllers/desktop-update.controller';
import { GcsSignedUrlClient } from '../../infrastructure/google/gcs-signed-url.client';
import { DESKTOP_RELEASE_STORE } from '#domain/adapters/desktop-release-store.interface';

/** `GET /v1/desktop/updates/:file`: the desktop app's update address (#4843). */
@Module({
  controllers: [DesktopUpdateController],
  providers: [
    DesktopUpdateService,
    { provide: DESKTOP_RELEASE_STORE, useClass: GcsSignedUrlClient },
  ],
})
export class DesktopUpdateModule {}
