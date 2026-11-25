import { ProfilePhotoUrlService } from '../../src/application/services/profile-photo-url.service';
import { STORAGE_PROVIDER } from '#domain/adapters/storage.interface';

/** The URL {@link profilePhotoProviders} signs `path` to. */
export function signedPhotoUrl(path: string): string {
  return `https://storage.example/signed/${path}`;
}

/**
 * The real `ProfilePhotoUrlService` over a storage provider that signs every
 * path to {@link signedPhotoUrl}, for a test module whose subject reads
 * profile photos. Its ownership rule still applies: only a path in the row
 * owner's own folder is signed.
 */
export function profilePhotoProviders() {
  return [
    ProfilePhotoUrlService,
    {
      provide: STORAGE_PROVIDER,
      useValue: {
        getSignedDownloadUrls: jest.fn(
          async (_bucket: string, paths: string[]) =>
            Object.fromEntries(
              paths.map((path) => [path, signedPhotoUrl(path)]),
            ),
        ),
      },
    },
  ];
}
