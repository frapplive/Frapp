import type { IChapterDocumentRepository } from '#domain/repositories/chapter-document.repository.interface';
import type { Meeting } from '#domain/entities/meeting.entity';
import { MinutesDocumentService } from './minutes-document.service';
import type { MeetingService, PostedMinutesListener } from './meeting.service';
import { MinutesDocumentSweepService } from '../workers/minutes-document-sweep.service';

describe('MinutesDocumentService (#5949)', () => {
  function setup() {
    const listeners: PostedMinutesListener[] = [];
    const meetings = {
      onPostedMinutesSaved: jest.fn((listener: PostedMinutesListener) => {
        listeners.push(listener);
      }),
    } as unknown as jest.Mocked<MeetingService>;
    const documents = {
      fileMinutes: jest.fn().mockResolvedValue('doc-1'),
      fileUnfiledMinutes: jest.fn().mockResolvedValue(3),
    } as unknown as jest.Mocked<IChapterDocumentRepository>;
    const service = new MinutesDocumentService(meetings, documents);
    return { service, documents, listeners };
  }
  const meeting = {
    id: 'mtg-1',
    chapter_id: 'ch-1',
    status: 'posted',
  } as Meeting;

  it('files the minutes when they post, and again on each later save so the row follows the name', async () => {
    const { service, documents, listeners } = setup();
    service.onModuleInit();
    expect(listeners).toHaveLength(1);

    await listeners[0](meeting, { reason: 'posted', actorId: 'user-1' });
    await listeners[0](meeting, { reason: 'edited', actorId: 'user-1' });
    expect(documents.fileMinutes.mock.calls).toEqual([
      ['ch-1', 'mtg-1'],
      ['ch-1', 'mtg-1'],
    ]);
  });

  it('lets a filing failure reach the caller, which reports it and never fails the post', async () => {
    const { service, documents, listeners } = setup();
    service.onModuleInit();
    documents.fileMinutes.mockRejectedValue(new Error('database down'));
    await expect(
      listeners[0](meeting, { reason: 'posted', actorId: 'user-1' }),
    ).rejects.toThrow('database down');
  });

  describe('the sweep', () => {
    it('files what has no row yet, a bounded batch a tick', async () => {
      const { service, documents } = setup();
      const sweep = new MinutesDocumentSweepService(service);
      await sweep.handleMinutesDocumentSweep();
      expect(documents.fileUnfiledMinutes).toHaveBeenCalledWith(500);
    });

    it('never runs two ticks at once, and runs again after a failure', async () => {
      const { service, documents } = setup();
      const sweep = new MinutesDocumentSweepService(service);
      let release: (filed: number) => void = () => undefined;
      documents.fileUnfiledMinutes.mockReturnValueOnce(
        new Promise<number>((resolve) => {
          release = resolve;
        }),
      );
      const first = sweep.handleMinutesDocumentSweep();
      await sweep.handleMinutesDocumentSweep();
      expect(documents.fileUnfiledMinutes).toHaveBeenCalledTimes(1);
      release(0);
      await first;

      documents.fileUnfiledMinutes.mockRejectedValueOnce(new Error('down'));
      // `@ReportedCron` reports the failure and resolves.
      await sweep.handleMinutesDocumentSweep();
      await sweep.handleMinutesDocumentSweep();
      expect(documents.fileUnfiledMinutes).toHaveBeenCalledTimes(3);
    });
  });
});
