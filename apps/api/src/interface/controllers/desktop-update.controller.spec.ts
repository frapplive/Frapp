import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { Response } from 'express';
import { DesktopReleaseStoreError } from '#domain/adapters/desktop-release-store.interface';
import type { DesktopUpdateService } from '../../application/services/desktop-update/desktop-update.service';
import { DesktopUpdateController } from './desktop-update.controller';

function setup(linkFor: jest.Mock) {
  const controller = new DesktopUpdateController({
    linkFor,
  } as unknown as DesktopUpdateService);
  const response = { setHeader: jest.fn(), redirect: jest.fn() };
  return { controller, response, send: response as unknown as Response };
}

describe('DesktopUpdateController', () => {
  it('redirects to the link, uncached', async () => {
    const { controller, response, send } = setup(
      jest
        .fn()
        .mockResolvedValue('https://storage.example/desktop/latest.yml?sig=1'),
    );

    await controller.file('latest.yml', send);

    expect(response.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'no-store',
    );
    expect(response.redirect).toHaveBeenCalledWith(
      302,
      'https://storage.example/desktop/latest.yml?sig=1',
    );
  });

  it('answers 404 for a name no release publishes', async () => {
    const { controller, response, send } = setup(
      jest.fn().mockResolvedValue(null),
    );

    await expect(controller.file('secrets.yml', send)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(response.redirect).not.toHaveBeenCalled();
  });

  it('answers 503, without the reason, when the bucket cannot be reached', async () => {
    const { controller, send } = setup(
      jest.fn().mockRejectedValue(new DesktopReleaseStoreError('sign_403')),
    );

    const failure = await controller
      .file('latest.yml', send)
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ServiceUnavailableException);
    expect((failure as Error).message).not.toContain('sign_403');
  });

  it('lets any other error through', async () => {
    const { controller, send } = setup(
      jest.fn().mockRejectedValue(new TypeError('bug')),
    );
    await expect(controller.file('latest.yml', send)).rejects.toBeInstanceOf(
      TypeError,
    );
  });
});
