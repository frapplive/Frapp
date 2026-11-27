import * as Sentry from '@sentry/nestjs';
import type { ConfigService } from '@nestjs/config';
import { ApiWakeTargetService, wakeOrigin } from './api-wake-target.service';

jest.mock('@sentry/nestjs', () => ({
  ...jest.requireActual<typeof import('@sentry/nestjs')>('@sentry/nestjs'),
  captureException: jest.fn(),
}));

function serviceWith(apiUrl: string | undefined, setUrl: jest.Mock) {
  const config = { get: jest.fn(() => apiUrl) } as unknown as ConfigService;
  return new ApiWakeTargetService(config, { setUrl });
}

describe('wakeOrigin (#6123)', () => {
  it('keeps an https base and drops a stale /v1', () => {
    expect(wakeOrigin('https://api-staging.frapp.live/v1')).toBe(
      'https://api-staging.frapp.live',
    );
    expect(wakeOrigin(' https://api.frapp.live ')).toBe(
      'https://api.frapp.live',
    );
  });

  it('refuses anything a deployed API would not have', () => {
    expect(wakeOrigin(undefined)).toBeNull();
    expect(wakeOrigin('')).toBeNull();
    expect(wakeOrigin('http://localhost:3001')).toBeNull();
    expect(wakeOrigin('not a url')).toBeNull();
  });
});

describe('ApiWakeTargetService (#6123)', () => {
  beforeEach(() => jest.mocked(Sentry.captureException).mockClear());

  it("writes the API's https origin", async () => {
    const setUrl = jest.fn().mockResolvedValue(undefined);
    await serviceWith('https://api-staging.frapp.live/v1', setUrl).record();
    expect(setUrl).toHaveBeenCalledWith('https://api-staging.frapp.live');
  });

  it('writes nothing for a local API', async () => {
    const setUrl = jest.fn();
    await serviceWith('http://localhost:3001', setUrl).record();
    expect(setUrl).not.toHaveBeenCalled();
  });

  it('a failed write is reported and does not throw', async () => {
    const setUrl = jest.fn().mockRejectedValue(new Error('pg down'));
    await expect(
      serviceWith('https://api.frapp.live', setUrl).record(),
    ).resolves.toBeUndefined();
    expect(
      jest.mocked(Sentry.captureException).mock.calls[0]?.[1],
    ).toMatchObject({
      level: 'warning',
      tags: { caught_at: 'api-wake-target-write' },
    });
  });
});
