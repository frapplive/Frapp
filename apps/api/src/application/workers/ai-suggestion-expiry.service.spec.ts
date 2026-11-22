import { AiSuggestionExpiryService } from './ai-suggestion-expiry.service';

describe('AiSuggestionExpiryService (#4309)', () => {
  it('puts back stale accepts, then expires, and a tick never overlaps another', async () => {
    let finish: (n: number) => void = () => undefined;
    const order: string[] = [];
    const suggestions = {
      releaseStaleAccepts: jest.fn(async () => {
        order.push('release');
        return 1;
      }),
      deleteExpiredChanges: jest.fn(async () => 0),
      expireDue: jest.fn(async () => {
        order.push('expire');
        return 0;
      }),
    };
    suggestions.expireDue.mockImplementationOnce(
      () =>
        new Promise<number>((resolve) => {
          order.push('expire');
          finish = resolve;
        }),
    );
    const nextAgenda = {
      placeWaitingEverywhere: jest.fn(async () => 0),
      deleteExpired: jest.fn(async () => 0),
      forgetWords: jest.fn(async () => 0),
    };
    const sweep = new AiSuggestionExpiryService(
      suggestions as never,
      nextAgenda as never,
    );
    const first = sweep.handleAiSuggestionExpirySweep();
    await new Promise((resolve) => setImmediate(resolve));
    await sweep.handleAiSuggestionExpirySweep();
    expect(suggestions.expireDue).toHaveBeenCalledTimes(1);
    finish(3);
    await first;
    await sweep.handleAiSuggestionExpirySweep();
    expect(order).toEqual(['release', 'expire', 'release', 'expire']);
    // Items sent to a next meeting never created go after 30 days (#5790).
    expect(nextAgenda.placeWaitingEverywhere).toHaveBeenCalledTimes(2);
    expect(nextAgenda.deleteExpired).toHaveBeenCalledTimes(2);
    expect(nextAgenda.forgetWords).toHaveBeenCalledTimes(2);
    expect(suggestions.deleteExpiredChanges).toHaveBeenCalledTimes(2);
  });

  it('deletes change logs past 90 days on its own: its failure stops nothing, and no failure stops it', async () => {
    const suggestions = {
      releaseStaleAccepts: jest.fn(async () => {
        throw new Error('release failed');
      }),
      deleteExpiredChanges: jest.fn(async () => 2),
      expireDue: jest.fn(async () => 0),
    };
    const nextAgenda = {
      placeWaitingEverywhere: jest.fn(async () => 0),
      deleteExpired: jest.fn(async () => 0),
      forgetWords: jest.fn(async () => 0),
    };
    const sweep = new AiSuggestionExpiryService(
      suggestions as never,
      nextAgenda as never,
    );
    // The cron reports the failure and skips the rest of the tick.
    await sweep.handleAiSuggestionExpirySweep();
    expect(suggestions.expireDue).not.toHaveBeenCalled();
    expect(suggestions.deleteExpiredChanges).toHaveBeenCalledTimes(1);

    suggestions.releaseStaleAccepts.mockResolvedValue(0 as never);
    suggestions.deleteExpiredChanges.mockRejectedValueOnce(
      new Error('delete failed'),
    );
    await sweep.handleAiSuggestionExpirySweep();
    expect(suggestions.expireDue).toHaveBeenCalledTimes(1);
    expect(nextAgenda.forgetWords).toHaveBeenCalledTimes(1);
  });
});
