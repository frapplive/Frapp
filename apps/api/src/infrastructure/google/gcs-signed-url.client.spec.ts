import { createVerify } from 'node:crypto';
import { DesktopReleaseStoreError } from '#domain/adapters/desktop-release-store.interface';
import {
  GcsSignedUrlClient,
  SIGNED_URL_TTL_SECONDS,
  signedUrlParts,
} from './gcs-signed-url.client';

// Links Google's own client library (@google-cloud/storage 7, getSignedUrl
// v4) signed for these objects on 2026-11-25, with a key pair made for the
// purpose whose private half was thrown away. The public half checks that the
// text this client would send to be signed is the text Google's library
// signed.
const REFERENCE = {
  publicKey:
    '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAyJPpiFZdHGLYYNB+T8Xg\njejmbCxpOv4clR3jyrbFUbUQhm4QjnIuchZcJW1PKA39i5GH+TdFyO/8QK8bGATq\nKdXAH+RVV8gR9a5hts+RjKAA0n+JjfSxPjO3jKM50S9nbVgwemZdlU46knVbR+cX\nLtnb+K69VstY0ZdsaJdyR/+hgEfPMBtADNLlPm5fJGwSKMAblukb6MOfOIhN6BMO\ncj8ADlQV7viH+ZtKxVM0JjOPq6PG7e9f69516j8UQ68y4QdKQUCUUX8ZIMM43olL\nttSZFLIcxLyqJB6A/qKR6BeDeIHeJnlMR0/++mgUSy8OY3CnIM/40CqMnd2N+L93\nTQIDAQAB\n-----END PUBLIC KEY-----\n',
  email: 'frapp-api-runtime@cs-project-example.iam.gserviceaccount.com',
  at: '2026-11-25T03:04:05.678Z',
  links: [
    {
      object: 'desktop/latest-mac.yml',
      url: 'https://storage.googleapis.com/frapp-live-downloads/desktop/latest-mac.yml?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Credential=frapp-api-runtime%40cs-project-example.iam.gserviceaccount.com%2F20261125%2Fauto%2Fstorage%2Fgoog4_request&X-Goog-Date=20261125T030405Z&X-Goog-Expires=3600&X-Goog-SignedHeaders=host&X-Goog-Signature=58552682fcedd0cf9ab48909f2aff05e4a66d8054ea6ca3f6d651b969e573a271224350c7c5b15fefb274fdf0d339e492e3a99d7022cd30deb96914d66747781f4d65edce07b1ba0689d261be4c69683b9add3e7a63ae7ace8ff7147ca69264b8cab67477447d3d9ad5dd129438d2b8be732bdd5ef855297da2d87d2e490193fdf6c7a78a08e65289b555c18a76357e8629c66046cdb4c0663cf77b877d5b026ff641bb2a1f68d007247ca3568479e85e7afb195608fa0c2c357223663b549c24d8921c135510287042c8ccbc8ebed42fb999d437512b746507caca8833bc8c464e59e5548c9e121c1a1249f8cafa4de52fa4c7a1dc00eac4c0c3695de0acd4b',
    },
    {
      object: 'desktop/Frapp-Setup-0.2.0.exe.blockmap',
      url: 'https://storage.googleapis.com/frapp-live-downloads/desktop/Frapp-Setup-0.2.0.exe.blockmap?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Credential=frapp-api-runtime%40cs-project-example.iam.gserviceaccount.com%2F20261125%2Fauto%2Fstorage%2Fgoog4_request&X-Goog-Date=20261125T030405Z&X-Goog-Expires=3600&X-Goog-SignedHeaders=host&X-Goog-Signature=bafd9a4260dc1a09a81c202eb7ff8ed441f3c43b922730f32728713fb98eb458ecf3a98a467ce98b1b9b5f129577beb6dc03ed3df2df5da586c643462ef83c9ade895ebca72692534922221d4e7c283c3e00419300b2c731539062173c332fb02656150b13a36afc25b1b6cc2dc5dbe08dcf7aca9737952aba149d47843eae13e679a95437ded1b938d0e64f4ea44ed71c2c7db5bde6f316ac392fa48270f96fd6ca762201c7d47cf65b1f99fcc0a6ac0a572f55ac28f59120f725fa89731df5a888f19fbd76364fac9a5d78017da7854c4fe39921ade137d08d81ebe75e1a589b806d5b57dad09c3741cba0d4df7d4f15166ee08869cb6f13cb69ae67e8869e',
    },
    {
      object: "desktop/odd name (1)'*!.zip",
      url: 'https://storage.googleapis.com/frapp-live-downloads/desktop/odd%20name%20%281%29%27%2A%21.zip?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Credential=frapp-api-runtime%40cs-project-example.iam.gserviceaccount.com%2F20261125%2Fauto%2Fstorage%2Fgoog4_request&X-Goog-Date=20261125T030405Z&X-Goog-Expires=3600&X-Goog-SignedHeaders=host&X-Goog-Signature=122bfa4f3085782b0f92dc6166ce0a7bb375fa0d7a52459583f015c14526fbaa64acac17b1834bf0b834b06d24d174fa0e4a8717b89e581a8aaec554e5868d15d0d79efa32fbfa9ee85d34b2b933eaa712a3c322b4947bb5d9ea215417d4f8c94b6fa57b66e2ce3be584391ae34e645682636f6aeefef5e38df413d752a645f265963cb818fc94bcd8149eda7416005bc8310b7eee5d0605faf183164c837be698d74495240e80f0f17c69ebd89801ac47931b21bae970b0e62de26bca190d202c5321c63240a916d4aa4993be2f289bbdf3b3c29428b9d553934498ab10a372c653228a782c528ee8e623181b7d9a1870f5a9f5b425c24454d5442722d702f6',
    },
  ],
};

describe('signedUrlParts', () => {
  it.each(REFERENCE.links)(
    "builds the link and signing text Google's library does for $object",
    ({ object, url }) => {
      const [unsigned, signature] = url.split('&X-Goog-Signature=');
      const parts = signedUrlParts({
        bucket: 'frapp-live-downloads',
        object,
        account: REFERENCE.email,
        at: new Date(REFERENCE.at),
        ttlSeconds: 3600,
      });
      expect(parts.unsignedUrl).toBe(unsigned);
      expect(
        createVerify('RSA-SHA256')
          .update(parts.stringToSign)
          .verify(REFERENCE.publicKey, signature, 'hex'),
      ).toBe(true);
    },
  );
});

describe('GcsSignedUrlClient', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    jest.useRealTimers();
  });

  function respond(routes: Record<string, () => Response>): jest.Mock {
    const mock = jest.fn((input: string | URL | Request) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      const match = Object.keys(routes).find((part) => url.includes(part));
      if (!match) return Promise.reject(new Error(`unexpected call: ${url}`));
      return Promise.resolve(routes[match]());
    });
    global.fetch = mock;
    return mock;
  }

  const signedBlob = Buffer.from([0xab, 0xcd, 0x01]).toString('base64');
  const healthy = {
    '/default/email': () =>
      new Response('runtime@prod.iam.gserviceaccount.com\n'),
    '/default/token': () =>
      Response.json({ access_token: 'runtime-token', expires_in: 3600 }),
    ':signBlob': () => Response.json({ signedBlob }),
  };

  it('signs as the runtime identity through IAM and appends the signature as hex', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-25T03:04:05.000Z') });
    const fetchMock = respond(healthy);

    const link = await new GcsSignedUrlClient().signedReadUrl(
      'desktop/latest.yml',
    );

    expect(link.url).toMatch(
      /^https:\/\/storage\.googleapis\.com\/frapp-live-downloads\/desktop\/latest\.yml\?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Credential=runtime%40prod\.iam\.gserviceaccount\.com%2F20261125%2Fauto%2Fstorage%2Fgoog4_request&X-Goog-Date=20261125T030405Z&X-Goog-Expires=3600&X-Goog-SignedHeaders=host&X-Goog-Signature=abcd01$/,
    );
    expect(link.expiresAt).toBe(
      Date.parse('2026-11-25T03:04:05.000Z') + SIGNED_URL_TTL_SECONDS * 1000,
    );
    const sign = fetchMock.mock.calls.find(([url]) =>
      String(url).includes(':signBlob'),
    );
    expect(String(sign?.[0])).toBe(
      'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/runtime%40prod.iam.gserviceaccount.com:signBlob',
    );
    const init = sign?.[1] as RequestInit;
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer runtime-token',
    });
    const { payload } = JSON.parse(init.body as string) as { payload: string };
    expect(Buffer.from(payload, 'base64').toString()).toMatch(
      /^GOOG4-RSA-SHA256\n20261125T030405Z\n20261125\/auto\/storage\/goog4_request\n[0-9a-f]{64}$/,
    );
  });

  it('asks the metadata server once for the identity and reuses its token', async () => {
    const fetchMock = respond(healthy);
    const client = new GcsSignedUrlClient();

    await client.signedReadUrl('desktop/latest.yml');
    await client.signedReadUrl('desktop/beta.yml');

    const calls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(calls.filter((url) => url.endsWith('/email'))).toHaveLength(1);
    expect(calls.filter((url) => url.endsWith('/token'))).toHaveLength(1);
    expect(calls.filter((url) => url.includes(':signBlob'))).toHaveLength(2);
  });

  it('fetches a new token once the held one is within five minutes of expiring', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-25T03:00:00.000Z') });
    const fetchMock = respond(healthy);
    const client = new GcsSignedUrlClient();
    const tokenCalls = () =>
      fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/token'))
        .length;

    await client.signedReadUrl('desktop/latest.yml');
    jest.setSystemTime(new Date('2026-11-25T03:54:59.000Z'));
    await client.signedReadUrl('desktop/latest.yml');
    expect(tokenCalls()).toBe(1);

    jest.setSystemTime(new Date('2026-11-25T03:55:00.000Z'));
    await client.signedReadUrl('desktop/latest.yml');
    expect(tokenCalls()).toBe(2);
  });

  it('never keeps a token whose lifetime the metadata server did not state', async () => {
    const fetchMock = respond({
      ...healthy,
      '/default/token': () => Response.json({ access_token: 'runtime-token' }),
    });
    const client = new GcsSignedUrlClient();

    await client.signedReadUrl('desktop/latest.yml');
    await client.signedReadUrl('desktop/latest.yml');

    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/token')),
    ).toHaveLength(2);
  });

  it('shares one token request between calls that arrive together', async () => {
    const fetchMock = respond(healthy);
    const client = new GcsSignedUrlClient();

    await Promise.all([
      client.publishedObjects().catch(() => null),
      client.publishedObjects().catch(() => null),
      client.publishedObjects().catch(() => null),
    ]);

    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/token')),
    ).toHaveLength(1);
  });

  it("lists the release prefix's own objects, following pages", async () => {
    const pages = [
      {
        items: [{ name: 'desktop/latest.yml' }, { name: 'desktop/beta.yml' }],
        nextPageToken: 'next',
      },
      { items: [{ name: 'desktop/Frapp-Setup-0.2.0.exe' }] },
    ];
    const fetchMock = respond({
      ...healthy,
      '/storage/v1/b/': () => Response.json(pages.shift()),
    });

    const names = await new GcsSignedUrlClient().publishedObjects();

    expect([...names]).toEqual([
      'desktop/latest.yml',
      'desktop/beta.yml',
      'desktop/Frapp-Setup-0.2.0.exe',
    ]);
    const lists = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('/storage/v1/b/'),
    );
    expect(String(lists[0][0])).toBe(
      'https://storage.googleapis.com/storage/v1/b/frapp-live-downloads/o?prefix=desktop%2F&delimiter=%2F&fields=items%28name%29%2CnextPageToken',
    );
    expect(String(lists[1][0])).toContain('&pageToken=next');
    expect((lists[0][1] as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer runtime-token',
    });
  });

  it('answers an empty set for a bucket no release has reached', async () => {
    respond({ ...healthy, '/storage/v1/b/': () => Response.json({}) });
    await expect(new GcsSignedUrlClient().publishedObjects()).resolves.toEqual(
      new Set(),
    );
  });

  it('fails the listing with a named reason when Google refuses it', async () => {
    respond({
      ...healthy,
      '/storage/v1/b/': () => new Response('{}', { status: 403 }),
    });
    const failure = await new GcsSignedUrlClient()
      .publishedObjects()
      .catch((error: unknown) => error);
    expect((failure as DesktopReleaseStoreError).reason).toBe('list_403');
  });

  it.each([
    ['there is no metadata server', {}, 'no_runtime_identity'],
    [
      'the token reply is cut off',
      { ...healthy, '/default/token': () => new Response('{"access_to') },
      'no_runtime_token',
    ],
    [
      'the signing reply is not JSON',
      { ...healthy, ':signBlob': () => new Response('<html>') },
      'sign_unreadable',
    ],
    [
      'the metadata server gives no token',
      { ...healthy, '/default/token': () => new Response('', { status: 404 }) },
      'no_runtime_token',
    ],
    [
      'Google refuses the signature (no Token Creator grant)',
      { ...healthy, ':signBlob': () => new Response('{}', { status: 403 }) },
      'sign_403',
    ],
    [
      'the answer carries no signature',
      { ...healthy, ':signBlob': () => Response.json({}) },
      'sign_no_signature',
    ],
  ])('fails with a named reason when %s', async (_name, routes, reason) => {
    respond(routes);
    const failure = await new GcsSignedUrlClient()
      .signedReadUrl('desktop/latest.yml')
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(DesktopReleaseStoreError);
    expect((failure as DesktopReleaseStoreError).reason).toBe(reason);
  });
});
