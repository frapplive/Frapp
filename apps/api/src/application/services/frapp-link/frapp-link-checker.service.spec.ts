import { FrappLinkChecker } from './frapp-link-checker.service';

function checker(enabledModules: Record<string, boolean> = {}) {
  const none = { findByIds: jest.fn().mockResolvedValue([]) };
  return new FrappLinkChecker(
    {
      findById: jest
        .fn()
        .mockResolvedValue({ id: 'ch-1', enabled_modules: enabledModules }),
    } as never,
    none as never,
    none as never,
    none as never,
    { findById: jest.fn().mockResolvedValue(null) } as never,
    none as never,
  );
}

describe('FrappLinkChecker', () => {
  it('keeps the channel a held message was stored with, whatever the request names', async () => {
    const stored = [
      {
        id: 'a',
        kind: 'message' as const,
        channel_id: 'real-channel',
        message_id: 'm1',
      },
    ];
    const sent = [{ ...stored[0], channel_id: 'claimed-channel' }];
    await expect(checker().checked('ch-1', sent, stored)).resolves.toEqual(
      stored,
    );
  });

  it('refuses a newly added record whose module is off, but keeps a held one', async () => {
    const doc = { id: 'a', kind: 'document' as const, document_id: 'd1' };
    await expect(
      checker({ documents: false }).checked('ch-1', [doc]),
    ).rejects.toThrow('Chapter Files is off in this chapter');
    await expect(
      checker({ documents: false }).checked('ch-1', [doc], [doc]),
    ).resolves.toEqual([doc]);
  });
});
