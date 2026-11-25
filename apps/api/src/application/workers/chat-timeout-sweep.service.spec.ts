import { ChatTimeoutSweepService } from './chat-timeout-sweep.service';
import type { IMemberRepository } from '#domain/repositories/member.repository.interface';
import type { ChatTimeoutService } from '../services/chat-timeout.service';
import type { Member } from '#domain/entities/member.entity';

const NOW = Date.parse('2026-11-25T15:00:00.000Z');

const ended = (id: string, until: string) =>
  ({
    id,
    chapter_id: 'chap-1',
    user_id: `user-${id}`,
    chat_timeout_until: until,
  }) as Member;

/** The end of a chat timeout (#6006). */
describe('ChatTimeoutSweepService', () => {
  let memberRepo: {
    findEndedChatTimeouts: jest.Mock;
    clearChatTimeout: jest.Mock;
  };
  let timeouts: { notifyEnded: jest.Mock };
  let sweep: ChatTimeoutSweepService;

  beforeEach(() => {
    memberRepo = {
      findEndedChatTimeouts: jest.fn(),
      clearChatTimeout: jest.fn(async (id: string) => ({ id })),
    };
    timeouts = { notifyEnded: jest.fn() };
    sweep = new ChatTimeoutSweepService(
      memberRepo as unknown as IMemberRepository,
      timeouts as unknown as ChatTimeoutService,
    );
  });

  it('clears each ended timeout by the time it read, and tells the member', async () => {
    const a = ended('a', '2026-11-25T14:59:00.000Z');
    const b = ended('b', '2026-11-25T14:00:00.000Z');
    memberRepo.findEndedChatTimeouts.mockResolvedValue([b, a]);

    await expect(sweep.sweep(NOW)).resolves.toEqual({ cleared: 2 });

    expect(memberRepo.findEndedChatTimeouts).toHaveBeenCalledWith(
      '2026-11-25T15:00:00.000Z',
      expect.any(Number),
    );
    expect(memberRepo.clearChatTimeout).toHaveBeenCalledWith(
      'a',
      '2026-11-25T14:59:00.000Z',
    );
    expect(timeouts.notifyEnded).toHaveBeenCalledWith(a);
    expect(timeouts.notifyEnded).toHaveBeenCalledWith(b);
  });

  it('sends nothing for a row another replica or an officer got to first', async () => {
    memberRepo.findEndedChatTimeouts.mockResolvedValue([
      ended('a', '2026-11-25T14:59:00.000Z'),
    ]);
    memberRepo.clearChatTimeout.mockResolvedValue(null);

    await expect(sweep.sweep(NOW)).resolves.toEqual({ cleared: 0 });
    expect(timeouts.notifyEnded).not.toHaveBeenCalled();
  });

  it('keeps going past one row that fails', async () => {
    memberRepo.findEndedChatTimeouts.mockResolvedValue([
      ended('a', '2026-11-25T14:59:00.000Z'),
      ended('b', '2026-11-25T14:58:00.000Z'),
    ]);
    memberRepo.clearChatTimeout
      .mockRejectedValueOnce(new Error('db blip'))
      .mockResolvedValueOnce({ id: 'b' });

    await expect(sweep.sweep(NOW)).resolves.toEqual({ cleared: 1 });
  });
});
