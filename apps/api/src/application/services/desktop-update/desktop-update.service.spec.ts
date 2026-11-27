import {
  DesktopReleaseStoreError,
  type IDesktopReleaseStore,
} from '#domain/adapters/desktop-release-store.interface';
import {
  DesktopUpdateService,
  LINK_REUSE_MARGIN_MS,
  PUBLISHED_FRESH_MS,
  PUBLISHED_RECHECK_MS,
} from './desktop-update.service';

const HOUR = 60 * 60 * 1000;

const PUBLISHED = [
  'desktop/latest.yml',
  'desktop/latest-mac.yml',
  'desktop/beta.yml',
  'desktop/Frapp-Setup-0.2.0.exe',
];

function storeSigning(at: () => number) {
  const published = [...PUBLISHED];
  let count = 0;
  const signedReadUrl = jest.fn((object: string) => {
    count += 1;
    return Promise.resolve({
      url: `https://storage.example/${object}?sig=${count}`,
      expiresAt: at() + HOUR,
    });
  });
  const publishedObjects = jest.fn(() => Promise.resolve(new Set(published)));
  const store: IDesktopReleaseStore = { signedReadUrl, publishedObjects };
  return { store, signedReadUrl, publishedObjects, published };
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

  it('answers null, and asks the store nothing, for a name no release could publish', async () => {
    const { store, signedReadUrl, publishedObjects } = storeSigning(() => 0);
    const service = new DesktopUpdateService(store);

    await expect(
      service.linkFor('feeds/0.2.0/latest.yml', 0),
    ).resolves.toBeNull();
    await expect(service.linkFor('../latest.yml', 0)).resolves.toBeNull();
    expect(signedReadUrl).not.toHaveBeenCalled();
    expect(publishedObjects).not.toHaveBeenCalled();
  });

  // The route is public: a flood of well-shaped names must cost neither a
  // signature each nor a read of the bucket each.
  it('signs nothing for well-shaped names the bucket does not hold, and reads the bucket once per window', async () => {
    const { store, signedReadUrl, publishedObjects } = storeSigning(() => 0);
    const service = new DesktopUpdateService(store);

    for (let i = 0; i < 50; i += 1) {
      await expect(
        service.linkFor(`Frapp-9.9.${i}-universal.dmg`, i),
      ).resolves.toBeNull();
    }
    expect(signedReadUrl).not.toHaveBeenCalled();
    expect(publishedObjects).toHaveBeenCalledTimes(1);

    await service.linkFor('Frapp-9.9.0-universal.dmg', PUBLISHED_RECHECK_MS);
    expect(publishedObjects).toHaveBeenCalledTimes(2);
  });

  it('finds a file uploaded since the list was read', async () => {
    const { store, published } = storeSigning(() => 0);
    const service = new DesktopUpdateService(store);
    await service.linkFor('latest.yml', 0);

    published.push('desktop/Frapp-Setup-0.3.0.exe');
    await expect(
      service.linkFor('Frapp-Setup-0.3.0.exe', PUBLISHED_RECHECK_MS),
    ).resolves.toBe(
      'https://storage.example/desktop/Frapp-Setup-0.3.0.exe?sig=2',
    );
  });

  it('reads the list again once it is a minute old, and forgets links to files that left', async () => {
    const { store, signedReadUrl, publishedObjects, published } = storeSigning(
      () => 0,
    );
    const service = new DesktopUpdateService(store);
    await service.linkFor('Frapp-Setup-0.2.0.exe', 0);
    await service.linkFor('Frapp-Setup-0.2.0.exe', PUBLISHED_FRESH_MS - 1);
    expect(publishedObjects).toHaveBeenCalledTimes(1);

    published.splice(published.indexOf('desktop/Frapp-Setup-0.2.0.exe'), 1);
    await expect(
      service.linkFor('Frapp-Setup-0.2.0.exe', PUBLISHED_FRESH_MS),
    ).resolves.toBeNull();
    expect(publishedObjects).toHaveBeenCalledTimes(2);
    expect(signedReadUrl).toHaveBeenCalledTimes(1);
  });

  it('fails, and remembers nothing, when the list cannot be read', async () => {
    const { store, publishedObjects } = storeSigning(() => 0);
    publishedObjects.mockRejectedValueOnce(
      new DesktopReleaseStoreError('list_403'),
    );
    const service = new DesktopUpdateService(store);

    await expect(service.linkFor('latest.yml', 0)).rejects.toBeInstanceOf(
      DesktopReleaseStoreError,
    );
    await expect(service.linkFor('latest.yml', 0)).resolves.toContain(
      'desktop/latest.yml',
    );
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
    const service = new DesktopUpdateService({
      signedReadUrl,
      publishedObjects: () => Promise.resolve(new Set(PUBLISHED)),
    });

    await expect(service.linkFor('latest.yml', 0)).rejects.toBeInstanceOf(
      DesktopReleaseStoreError,
    );
    await expect(service.linkFor('latest.yml', 0)).resolves.toBe(
      'https://storage.example/ok',
    );
  });
});
