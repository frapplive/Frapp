import { Logger } from '@nestjs/common';
import { NoopEmailProvider } from './noop-email.provider';

const params = {
  to: 'member@example.com',
  joinUrl: 'https://app.frapp.live/join?token=abc',
  role: 'Member',
  validDays: 7,
};

describe('NoopEmailProvider', () => {
  it('reports success without sending (local / CI default)', async () => {
    const provider = new NoopEmailProvider();

    await expect(provider.sendInviteEmail(params)).resolves.toBe(true);
  });

  it('reports delivery failure when constructed for production', async () => {
    const provider = new NoopEmailProvider(true);

    await expect(provider.sendInviteEmail(params)).resolves.toBe(false);
  });

  it('sends no school code, and logs neither the code nor the address (#5929)', async () => {
    const debug = jest
      .spyOn(Logger.prototype, 'debug')
      .mockImplementation(() => undefined);
    const params = {
      to: 'student@rpi.edu',
      code: '042917',
      schoolName: 'RPI',
      validMinutes: 10,
    };

    await expect(
      new NoopEmailProvider().sendSchoolCodeEmail(params),
    ).resolves.toBe(true);
    await expect(
      new NoopEmailProvider(true).sendSchoolCodeEmail(params),
    ).resolves.toBe(false);
    const logged = debug.mock.calls.map((call) => String(call[0])).join(' ');
    expect(logged).not.toContain('042917');
    expect(logged).not.toContain('student@rpi.edu');
  });
});
