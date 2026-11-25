import {
  DesktopReleaseStoreError,
  type IDesktopReleaseStore,
} from '#domain/adapters/desktop-release-store.interface';
import {
  DesktopUpdateService,
  LINK_REUSE_MARGIN_MS,
  REMEMBERED_LINKS,
} from './desktop-update.service';

const HOUR = 60 * 60 * 1000;

function storeSigning(at: () => number) {
  let count = 0;
  const signedReadUrl = jest.fn((object: string) => {
    count += 1;
    return Promise.resolve({
      url: `https://storage.example/${object}?sig=${count}`,
      expiresAt: at() + HOUR,
    });
  });
  const store: IDesktopReleaseStore = { signedReadUrl };
  return { store, signedReadUrl };
}

describe('DesktopUpdateService', () => {
  it('signs a link to the release object for a published file name', async () => {
    const { store, signedReadUrl } = storeSigning(() => 0);
    const service = new DesktopUpdateService(store);

    await expect(service.linkFor('latest-mac.yml', 0)).resolves.toBe(
      'https://storage.example/desktop/latest-mac.yml?sig=1',
    );
    expect(signedReadUrl).toHaveBeenCalledWith('desktop/latest-mac.yml');
  });

  it('answers null, and signs nothing, for a name no release publishes', async () => {
    const { store, signedReadUrl } = storeSigning(() => 0);
    const service = new DesktopUpdateService(store);

    await expect(
      service.linkFor('feeds/0.2.0/latest.yml', 0),
    ).resolves.toBeNull();
    await expect(service.linkFor('../latest.yml', 0)).resolves.toBeNull();
    expect(signedReadUrl).not.toHaveBeenCalled();
  });

  it('hands the same link out again while it has long enough left', async () => {
    const { store, signedReadUrl } = storeSigning(() => 0);
    const service = new DesktopUpdateService(store);

    const first = await service.linkFor('Frapp-Setup-0.2.0.exe', 0);
    const later = await service.linkFor(
      'Frapp-Setup-0.2.0.exe',
      HOUR - LINK_REUSE_MARGIN_MS - 1,
    );

    expect(later).toBe(first);
    expect(signedReadUrl).toHaveBeenCalledTimes(1);
  });

  it('signs a new link once the remembered one is close to expiring', async () => {
    let now = 0;
    const { store, signedReadUrl } = storeSigning(() => now);
    const service = new DesktopUpdateService(store);

    const first = await service.linkFor('Frapp-Setup-0.2.0.exe', now);
    now = HOUR - LINK_REUSE_MARGIN_MS;
    const second = await service.linkFor('Frapp-Setup-0.2.0.exe', now);

    expect(second).not.toBe(first);
    expect(signedReadUrl).toHaveBeenCalledTimes(2);
  });

  it('shares one signature between requests that arrive together', async () => {
    const { store, signedReadUrl } = storeSigning(() => 0);
    const service = new DesktopUpdateService(store);

    const links = await Promise.all([
      service.linkFor('latest.yml', 0),
      service.linkFor('latest.yml', 0),
      service.linkFor('latest.yml', 0),
    ]);

    expect(new Set(links).size).toBe(1);
    expect(signedReadUrl).toHaveBeenCalledTimes(1);
  });

  it('does not remember a failure: the next request signs again', async () => {
    const signedReadUrl = jest
      .fn<ReturnType<IDesktopReleaseStore['signedReadUrl']>, [string]>()
      .mockRejectedValueOnce(new DesktopReleaseStoreError('sign_403'))
      .mockResolvedValueOnce({
        url: 'https://storage.example/ok',
        expiresAt: HOUR,
      });
    const service = new DesktopUpdateService({ signedReadUrl });

    await expect(service.linkFor('latest.yml', 0)).rejects.toBeInstanceOf(
      DesktopReleaseStoreError,
    );
    await expect(service.linkFor('latest.yml', 0)).resolves.toBe(
      'https://storage.example/ok',
    );
  });

  it('remembers a bounded number of links, dropping the oldest', async () => {
    const { store, signedReadUrl } = storeSigning(() => 0);
    const service = new DesktopUpdateService(store);

    for (let i = 0; i <= REMEMBERED_LINKS; i += 1) {
      await service.linkFor(`Frapp-0.0.${i}-universal.dmg`, 0);
    }
    await service.linkFor(`Frapp-0.0.${REMEMBERED_LINKS}-universal.dmg`, 0);
    expect(signedReadUrl).toHaveBeenCalledTimes(REMEMBERED_LINKS + 1);
    await service.linkFor('Frapp-0.0.0-universal.dmg', 0);
    expect(signedReadUrl).toHaveBeenCalledTimes(REMEMBERED_LINKS + 2);
  });
});
