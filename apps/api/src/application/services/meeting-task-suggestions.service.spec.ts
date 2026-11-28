import type { Meeting } from '#domain/entities/meeting.entity';
import { actionItemKey } from '#domain/utils/minutes-task-proposals';
import { MeetingTaskSuggestionsService } from './meeting-task-suggestions.service';

const CHAPTER = '11111111-1111-4111-8111-111111111111';
const WHO_SOLO = {
  audience: null,
  audience_name: null,
  assignee_ids: ['u-1'],
};
const OFFICER = '22222222-2222-4222-8222-222222222222';
const JAKE = '33333333-3333-4333-8333-333333333333';
const MEETING = '55555555-5555-4555-8555-555555555555';

const meeting = (over: Partial<Meeting> = {}): Meeting => ({
  id: MEETING,
  chapter_id: CHAPTER,
  event_id: null,
  event_name: 'Chapter meeting',
  event_start_time: '2026-11-09T00:00:00.000Z',
  meeting_type: 'chapter',
  other_label: null,
  status: 'posted',
  content: {
    action_items: [
      { text: 'Book the bus', owner_user_id: JAKE, due_date: '2026-11-14' },
      { text: 'Order shirts', owner_user_id: null, due_date: null },
    ],
  },
  created_by: OFFICER,
  updated_by: OFFICER,
  posted_by: OFFICER,
  posted_at: '2026-11-10T00:00:00.000Z',
  created_at: '2026-11-09T00:00:00.000Z',
  updated_at: '2026-11-10T00:00:00.000Z',
  transcript: null,
  ...over,
});

function build(switchOn = true) {
  const listeners: ((m: Meeting, c: never) => Promise<void>)[] = [];
  const meetings = {
    onPostedMinutesSaved: jest.fn((listener) => listeners.push(listener)),
    get: jest.fn(async () => ({ meeting: meeting() })),
    listWithFacts: jest.fn(async () => ({
      rows: [] as Meeting[],
      facts: new Map<string, { series_key: string | null }>(),
    })),
  };
  const suggestions = {
    reconcileSource: jest.fn(async () => ({ created: [], withdrawn: 0 })),
    accept: jest.fn(async () => ({})),
  };
  const consent = { chapterSwitchOn: jest.fn(async () => switchOn) };
  const tasks = {
    doneMarks: jest.fn(async () => new Map()),
    create: jest.fn(
      async (): Promise<{ id: string; group_id: string | null }> => ({
        id: 't-new',
        group_id: null,
      }),
    ),
    delete: jest.fn(async () => undefined),
    copyOfGroups: jest.fn(async () => new Map<string, string>()),
  };
  const itemTasks = {
    claim: jest.fn(async () => true),
    setTask: jest.fn(async () => undefined),
    release: jest.fn(async () => undefined),
    listForMeeting: jest.fn(
      async () =>
        [] as {
          item_key: string;
          task_id: string | null;
          task_group_id?: string | null;
        }[],
    ),
  };
  const repo = {
    listKeyedForSource: jest.fn(
      async (_chapterId: string, _source: { id: string }) => [] as unknown[],
    ),
  };
  const service = new MeetingTaskSuggestionsService(
    meetings as never,
    suggestions as never,
    consent as never,
    tasks as never,
    repo as never,
    itemTasks as never,
  );
  return {
    service,
    meetings,
    suggestions,
    consent,
    listeners,
    tasks,
    repo,
    itemTasks,
  };
}

describe('MeetingTaskSuggestionsService (#4313)', () => {
  const env = process.env.AI_ENABLED;
  beforeEach(() => {
    process.env.AI_ENABLED = 'true';
  });
  afterAll(() => {
    if (env === undefined) delete process.env.AI_ENABLED;
    else process.env.AI_ENABLED = env;
  });

  it('proposes the action items of posted minutes and tells the officer who posted them', async () => {
    const { service, suggestions, consent } = build();
    await service.sync(meeting(), { reason: 'posted', actorId: OFFICER });

    expect(consent.chapterSwitchOn).toHaveBeenCalledWith(
      CHAPTER,
      'meeting_notes',
    );
    expect(suggestions.reconcileSource).toHaveBeenCalledWith({
      chapterId: CHAPTER,
      requestedFor: OFFICER,
      source: {
        type: 'meeting',
        id: MEETING,
        title: 'Chapter meeting',
        text: 'Book the bus\nOrder shirts',
      },
      kind: 'task',
      proposals: [
        {
          dedupeKey: actionItemKey('Book the bus'),
          payload: {
            title: 'Book the bus',
            description: null,
            assignee_id: JAKE,
            due_date: '2026-11-14',
          },
          quote: 'Book the bus',
        },
        {
          dedupeKey: actionItemKey('Order shirts'),
          payload: {
            title: 'Order shirts',
            description: null,
            assignee_id: null,
            due_date: null,
          },
          quote: 'Order shirts',
        },
      ],
      notify: [OFFICER],
    });
  });

  it('tells nobody about an edit after posting', async () => {
    const { service, suggestions } = build();
    await service.sync(meeting(), { reason: 'edited', actorId: OFFICER });
    expect(suggestions.reconcileSource).toHaveBeenCalledWith(
      expect.objectContaining({ notify: [] }),
    );
  });

  it('still runs for minutes with no action items, so removed items are taken back', async () => {
    const { service, suggestions } = build();
    await service.sync(meeting({ content: { action_items: [] } }), {
      reason: 'edited',
      actorId: OFFICER,
    });
    expect(suggestions.reconcileSource).toHaveBeenCalledWith(
      expect.objectContaining({ proposals: [] }),
    );
  });

  it('does nothing while the server has AI off, without reading the chapter', async () => {
    delete process.env.AI_ENABLED;
    const { service, suggestions, consent } = build();
    expect(
      await service.sync(meeting(), { reason: 'posted', actorId: OFFICER }),
    ).toBeNull();
    expect(consent.chapterSwitchOn).not.toHaveBeenCalled();
    expect(suggestions.reconcileSource).not.toHaveBeenCalled();
  });

  it('proposes nothing while the president has meeting notes off, and takes back what was waiting', async () => {
    const { service, suggestions } = build(false);
    await service.sync(meeting(), { reason: 'posted', actorId: OFFICER });
    expect(suggestions.reconcileSource).toHaveBeenCalledWith(
      expect.objectContaining({ proposals: [], notify: [] }),
    );
  });

  it('does nothing for a draft', async () => {
    const { service, suggestions } = build();
    await service.sync(meeting({ status: 'draft' }), {
      reason: 'edited',
      actorId: OFFICER,
    });
    expect(suggestions.reconcileSource).not.toHaveBeenCalled();
  });

  it('listens for posted minutes from the moment the module starts', async () => {
    const { service, meetings, suggestions, listeners } = build();
    service.onModuleInit();
    expect(meetings.onPostedMinutesSaved).toHaveBeenCalledTimes(1);
    await listeners[0](meeting(), {
      reason: 'posted',
      actorId: OFFICER,
    } as never);
    expect(suggestions.reconcileSource).toHaveBeenCalledTimes(1);
  });
});

describe("actionItemTasks: the minutes' checkboxes", () => {
  const accepted = (text: string, taskId: string) => ({
    status: 'accepted',
    result_id: taskId,
    dedupe_key: actionItemKey(text),
  });

  it('marks each item an officer made a task with whether it is done, and tells nothing about the rest', async () => {
    const { service, repo, tasks, meetings } = build();
    repo.listKeyedForSource.mockResolvedValue([
      accepted('Book the bus', 't-bus'),
      // A dismissed one has no task.
      {
        status: 'dismissed',
        result_id: null,
        dedupe_key: actionItemKey('Order shirts'),
      },
    ]);
    tasks.doneMarks.mockResolvedValue(
      new Map([['t-bus', { done: true, group: null, who: WHO_SOLO }]]),
    );

    // Only the done mark, unless the caller may read every task.
    await expect(
      service.actionItemTasks(CHAPTER, MEETING, OFFICER),
    ).resolves.toEqual([{ index: 0, done: true, group: null, task: null }]);
    expect(meetings.get).toHaveBeenCalledWith(CHAPTER, MEETING, OFFICER);
    expect(tasks.doneMarks).toHaveBeenCalledWith(CHAPTER, ['t-bus']);
  });

  it('passes on a task for everyone with its counts', async () => {
    const { service, repo, tasks } = build();
    repo.listKeyedForSource.mockResolvedValue([
      accepted('Order shirts', 't-shirts'),
    ]);
    tasks.doneMarks.mockResolvedValue(
      new Map([
        [
          't-shirts',
          { done: false, group: { done: 14, total: 20 }, who: WHO_SOLO },
        ],
      ]),
    );
    await expect(
      service.actionItemTasks(CHAPTER, MEETING, OFFICER),
    ).resolves.toEqual([
      { index: 1, done: false, group: { done: 14, total: 20 }, task: null },
    ]);
  });

  it('tells an officer who manages tasks which task each item became, and whose (#6051)', async () => {
    const { service, repo, tasks } = build();
    repo.listKeyedForSource.mockResolvedValue([
      accepted('Book the bus', 't-bus'),
    ]);
    const who = {
      audience: 'role' as const,
      audience_name: 'Cabinet',
      assignee_ids: [],
    };
    tasks.doneMarks.mockResolvedValue(
      new Map([['t-bus', { done: false, group: { done: 0, total: 6 }, who }]]),
    );
    await expect(
      service.actionItemTasks(CHAPTER, MEETING, OFFICER, { withTask: true }),
    ).resolves.toEqual([
      {
        index: 0,
        done: false,
        group: { done: 0, total: 6 },
        task: { id: 't-bus', who },
      },
    ]);
  });

  it('gives a task to the first of two items that read the same', async () => {
    const { service, repo, tasks, meetings } = build();
    meetings.get.mockResolvedValue({
      meeting: meeting({
        content: {
          ...meeting().content,
          action_items: [
            { text: 'Order shirts', owner_user_id: null, due_date: null },
            { text: 'order shirts.', owner_user_id: null, due_date: null },
          ],
        },
      }),
    });
    repo.listKeyedForSource.mockResolvedValue([
      accepted('Order shirts', 't-shirts'),
    ]);
    tasks.doneMarks.mockResolvedValue(
      new Map([['t-shirts', { done: true, group: null, who: WHO_SOLO }]]),
    );
    await expect(
      service.actionItemTasks(CHAPTER, MEETING, OFFICER),
    ).resolves.toEqual([{ index: 0, done: true, group: null, task: null }]);
  });

  it('leaves out an item whose task was deleted since', async () => {
    const { service, repo } = build();
    repo.listKeyedForSource.mockResolvedValue([
      accepted('Book the bus', 't-gone'),
    ]);
    await expect(
      service.actionItemTasks(CHAPTER, MEETING, OFFICER),
    ).resolves.toEqual([]);
  });

  it('says nothing for a draft', async () => {
    const { service, repo, meetings } = build();
    meetings.get.mockResolvedValue({ meeting: meeting({ status: 'draft' }) });
    await expect(
      service.actionItemTasks(CHAPTER, MEETING, OFFICER),
    ).resolves.toEqual([]);
    expect(repo.listKeyedForSource).not.toHaveBeenCalled();
  });
});

describe('makeTask: an action item made a task from the minutes (#6062)', () => {
  const MODULES = null;
  const mark = {
    done: false,
    group: null,
    who: { audience: null, audience_name: null, assignee_ids: [JAKE] },
  };
  const expected = (index: number, id: string) => ({
    index,
    done: mark.done,
    group: mark.group,
    task: { id, who: mark.who },
  });

  it('claims the item, makes the task linked to the meeting, and fills the claim', async () => {
    const { service, tasks, itemTasks } = build();
    itemTasks.listForMeeting
      .mockResolvedValueOnce([])
      .mockResolvedValue([
        { item_key: actionItemKey('Book the bus'), task_id: 't-new' },
      ]);
    tasks.doneMarks.mockResolvedValue(new Map([['t-new', mark]]));

    await expect(
      service.makeTask(
        CHAPTER,
        OFFICER,
        MEETING,
        0,
        { text: 'Book the bus', assignee_ids: [JAKE] },
        MODULES,
      ),
    ).resolves.toEqual(expected(0, 't-new'));

    expect(itemTasks.claim).toHaveBeenCalledWith(
      expect.objectContaining({
        meeting_id: MEETING,
        item_key: actionItemKey('Book the bus'),
        chapter_id: CHAPTER,
        created_by: OFFICER,
      }),
      expect.any(String),
    );
    expect(tasks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        chapter_id: CHAPTER,
        title: 'Book the bus',
        // A list even of one, so the pick is held to the active-member rule.
        assignee_id: null,
        assignee_ids: [JAKE],
        // The day the minutes named, when none is sent.
        due_date: '2026-11-14',
        meeting_id: MEETING,
        created_by: OFFICER,
      }),
    );
    expect(itemTasks.setTask).toHaveBeenCalledWith(
      CHAPTER,
      MEETING,
      actionItemKey('Book the bus'),
      { id: 't-new', group_id: null },
    );
  });

  it('gives several members each their own copy, with the words and day sent', async () => {
    const OTHER = '44444444-4444-4444-8444-444444444444';
    const { service, tasks, itemTasks } = build();
    itemTasks.listForMeeting
      .mockResolvedValueOnce([])
      .mockResolvedValue([
        { item_key: actionItemKey('Order shirts'), task_id: 't-new' },
      ]);
    tasks.doneMarks.mockResolvedValue(new Map([['t-new', mark]]));
    await service.makeTask(
      CHAPTER,
      OFFICER,
      MEETING,
      1,
      {
        text: 'Order shirts',
        assignee_ids: [JAKE, OTHER, JAKE],
        title: 'Order chapter shirts',
        due_date: null,
      },
      MODULES,
    );
    expect(tasks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Order chapter shirts',
        assignee_id: null,
        assignee_ids: [JAKE, OTHER],
        due_date: null,
      }),
    );
  });

  it('makes nothing for an item already a task through Suggested tasks', async () => {
    const { service, repo, tasks, itemTasks } = build();
    repo.listKeyedForSource.mockResolvedValue([
      {
        status: 'accepted',
        result_id: 't-bus',
        dedupe_key: actionItemKey('Book the bus'),
      },
    ]);
    tasks.doneMarks.mockResolvedValue(new Map([['t-bus', mark]]));
    await expect(
      service.makeTask(
        CHAPTER,
        OFFICER,
        MEETING,
        0,
        { text: 'Book the bus', assignee_ids: [JAKE] },
        MODULES,
      ),
    ).resolves.toEqual(expected(0, 't-bus'));
    expect(tasks.create).not.toHaveBeenCalled();
    expect(itemTasks.claim).not.toHaveBeenCalled();
  });

  it('accepts a suggestion still waiting for the item instead of making a second task', async () => {
    const { service, repo, tasks, suggestions, itemTasks } = build();
    const waiting = {
      id: 'sugg-1',
      status: 'pending',
      expires_at: '2999-01-01T00:00:00.000Z',
      result_id: null,
      dedupe_key: actionItemKey('Book the bus'),
    };
    repo.listKeyedForSource
      .mockResolvedValueOnce([waiting])
      .mockResolvedValue([
        { ...waiting, status: 'accepted', result_id: 't-bus' },
      ]);
    tasks.doneMarks.mockResolvedValue(new Map([['t-bus', mark]]));
    await expect(
      service.makeTask(
        CHAPTER,
        OFFICER,
        MEETING,
        0,
        { text: 'Book the bus', assignee_ids: [JAKE] },
        MODULES,
      ),
    ).resolves.toEqual(expected(0, 't-bus'));
    expect(suggestions.accept).toHaveBeenCalledWith(
      CHAPTER,
      OFFICER,
      'sugg-1',
      expect.objectContaining({
        edits: {
          kind: 'task',
          fields: expect.objectContaining({
            title: 'Book the bus',
            assignee_id: JAKE,
          }),
        },
      }),
    );
    expect(tasks.create).not.toHaveBeenCalled();
    expect(itemTasks.claim).not.toHaveBeenCalled();
  });

  it('leaves the suggestion its own day and time when the officer sent none', async () => {
    const { service, repo, tasks, suggestions } = build();
    const waiting = {
      id: 'sugg-1',
      status: 'pending',
      expires_at: '2999-01-01T00:00:00.000Z',
      result_id: null,
      dedupe_key: actionItemKey('Book the bus'),
    };
    repo.listKeyedForSource
      .mockResolvedValueOnce([waiting])
      .mockResolvedValue([
        { ...waiting, status: 'accepted', result_id: 't-bus' },
      ]);
    tasks.doneMarks.mockResolvedValue(new Map([['t-bus', mark]]));
    await service.makeTask(
      CHAPTER,
      OFFICER,
      MEETING,
      0,
      { text: 'Book the bus', assignee_ids: [JAKE] },
      MODULES,
    );
    const fields = (
      suggestions.accept.mock.calls as unknown as [
        string,
        string,
        string,
        { edits: { fields: Record<string, unknown> } },
      ][]
    )[0][3].edits.fields;
    expect(fields).not.toHaveProperty('due_date');
  });

  it.each([
    ['expired but not yet swept', 'pending', '2000-01-01T00:00:00.000Z'],
    ['dismissed', 'dismissed', '2999-01-01T00:00:00.000Z'],
  ])(
    'makes the task itself past a suggestion %s',
    async (_label, status, expiresAt) => {
      const { service, repo, suggestions, tasks } = build();
      repo.listKeyedForSource.mockResolvedValue([
        {
          id: 'sugg-x',
          status,
          expires_at: expiresAt,
          result_id: null,
          dedupe_key: actionItemKey('Book the bus'),
        },
      ]);
      tasks.doneMarks.mockResolvedValue(new Map([['t-new', mark]]));
      await service.makeTask(
        CHAPTER,
        OFFICER,
        MEETING,
        0,
        { text: 'Book the bus', assignee_ids: [JAKE] },
        MODULES,
      );
      expect(suggestions.accept).not.toHaveBeenCalled();
      expect(tasks.create).toHaveBeenCalled();
    },
  );

  it.each([
    ['being accepted right now', 'accepting', null],
    // Up for grabs: its result is a posting, not a task, until claimed.
    ['accepted as a task up for grabs', 'accepted', 'posting-1'],
  ])(
    'refuses an item whose suggestion is %s, making nothing',
    async (_label, status, resultId) => {
      const { service, repo, tasks, itemTasks } = build();
      repo.listKeyedForSource.mockResolvedValue([
        {
          id: 'sugg-1',
          status,
          expires_at: '2999-01-01T00:00:00.000Z',
          result_id: resultId,
          dedupe_key: actionItemKey('Book the bus'),
        },
      ]);
      await expect(
        service.makeTask(
          CHAPTER,
          OFFICER,
          MEETING,
          0,
          { text: 'Book the bus', assignee_ids: [JAKE] },
          MODULES,
        ),
      ).rejects.toMatchObject({
        response: { code: 'meeting.action_item.already_task' },
      });
      expect(tasks.create).not.toHaveBeenCalled();
      expect(itemTasks.claim).not.toHaveBeenCalled();
    },
  );

  it('refuses while the chapter has Meetings off', async () => {
    const { service, meetings } = build();
    await expect(
      service.makeTask(
        CHAPTER,
        OFFICER,
        MEETING,
        0,
        { text: 'Book the bus', assignee_ids: [JAKE] },
        { meetings: false },
      ),
    ).rejects.toThrow();
    expect(meetings.get).not.toHaveBeenCalled();
  });

  it('refuses an item of only punctuation', async () => {
    const { service, meetings, tasks } = build();
    meetings.get.mockResolvedValue({
      meeting: meeting({
        content: {
          action_items: [{ text: '...', owner_user_id: null, due_date: null }],
        },
      }),
    });
    await expect(
      service.makeTask(
        CHAPTER,
        OFFICER,
        MEETING,
        0,
        { text: '...', assignee_ids: [JAKE] },
        MODULES,
      ),
    ).rejects.toMatchObject({
      response: { code: 'meeting.action_item.empty' },
    });
    expect(tasks.create).not.toHaveBeenCalled();
  });

  it('takes the task back and frees the item when linking it fails', async () => {
    const { service, tasks, itemTasks } = build();
    itemTasks.setTask.mockRejectedValue(new Error('link failed'));
    await expect(
      service.makeTask(
        CHAPTER,
        OFFICER,
        MEETING,
        0,
        { text: 'Book the bus', assignee_ids: [JAKE] },
        MODULES,
      ),
    ).rejects.toThrow('link failed');
    expect(tasks.delete).toHaveBeenCalledWith('t-new', CHAPTER);
    expect(itemTasks.release).toHaveBeenCalled();
  });

  it('keeps the original error when giving the claim back fails too', async () => {
    const { service, tasks, itemTasks } = build();
    tasks.create.mockRejectedValue(new Error('not an active member'));
    itemTasks.release.mockRejectedValue(new Error('db down'));
    await expect(
      service.makeTask(
        CHAPTER,
        OFFICER,
        MEETING,
        0,
        { text: 'Book the bus', assignee_ids: [JAKE] },
        MODULES,
      ),
    ).rejects.toThrow('not an active member');
  });

  it('follows another copy of a group whose linked copy was deleted', async () => {
    const { service, tasks, itemTasks } = build();
    itemTasks.listForMeeting.mockResolvedValue([
      {
        item_key: actionItemKey('Order shirts'),
        task_id: null,
        task_group_id: 'group-1',
      },
    ]);
    tasks.copyOfGroups.mockResolvedValue(new Map([['group-1', 't-sam']]));
    tasks.doneMarks.mockResolvedValue(new Map([['t-sam', mark]]));
    await expect(
      service.actionItemTasks(CHAPTER, MEETING, OFFICER, { withTask: true }),
    ).resolves.toEqual([expected(1, 't-sam')]);
    expect(tasks.copyOfGroups).toHaveBeenCalledWith(CHAPTER, ['group-1']);
  });

  it('refuses when the minutes changed since the officer read them', async () => {
    const { service, tasks } = build();
    await expect(
      service.makeTask(
        CHAPTER,
        OFFICER,
        MEETING,
        0,
        { text: 'Book the van', assignee_ids: [JAKE] },
        MODULES,
      ),
    ).rejects.toMatchObject({
      response: { code: 'meeting.action_item.changed' },
    });
    expect(tasks.create).not.toHaveBeenCalled();
  });

  it('refuses a draft', async () => {
    const { service, meetings } = build();
    meetings.get.mockResolvedValue({ meeting: meeting({ status: 'draft' }) });
    await expect(
      service.makeTask(
        CHAPTER,
        OFFICER,
        MEETING,
        0,
        { text: 'Book the bus', assignee_ids: [JAKE] },
        MODULES,
      ),
    ).rejects.toMatchObject({
      response: { code: 'meeting.action_item.not_posted' },
    });
  });

  it('tells the second of two officers at once that it is a task already', async () => {
    const { service, tasks, itemTasks } = build();
    itemTasks.claim.mockResolvedValue(false);
    await expect(
      service.makeTask(
        CHAPTER,
        OFFICER,
        MEETING,
        0,
        { text: 'Book the bus', assignee_ids: [JAKE] },
        MODULES,
      ),
    ).rejects.toMatchObject({
      response: { code: 'meeting.action_item.already_task' },
    });
    expect(tasks.create).not.toHaveBeenCalled();
  });

  it('gives the claim back when the task could not be made', async () => {
    const { service, tasks, itemTasks } = build();
    tasks.create.mockRejectedValue(new Error('boom'));
    await expect(
      service.makeTask(
        CHAPTER,
        OFFICER,
        MEETING,
        0,
        { text: 'Book the bus', assignee_ids: [JAKE] },
        MODULES,
      ),
    ).rejects.toThrow('boom');
    expect(itemTasks.release).toHaveBeenCalledWith(
      CHAPTER,
      MEETING,
      actionItemKey('Book the bus'),
    );
    expect(itemTasks.setTask).not.toHaveBeenCalled();
  });

  it('reads a task made from the minutes on the checkboxes', async () => {
    const { service, tasks, itemTasks } = build();
    itemTasks.listForMeeting.mockResolvedValue([
      { item_key: actionItemKey('Order shirts'), task_id: 't-made' },
      // A claim still being made has no task to read.
      { item_key: actionItemKey('Book the bus'), task_id: null },
    ]);
    tasks.doneMarks.mockResolvedValue(new Map([['t-made', mark]]));
    await expect(
      service.actionItemTasks(CHAPTER, MEETING, OFFICER, { withTask: true }),
    ).resolves.toEqual([expected(1, 't-made')]);
  });

  it('never suggests an item already made a task from the minutes', async () => {
    const env = process.env.AI_ENABLED;
    process.env.AI_ENABLED = 'true';
    const { service, suggestions, itemTasks } = build();
    itemTasks.listForMeeting.mockResolvedValue([
      { item_key: actionItemKey('Book the bus'), task_id: 't-made' },
    ]);
    try {
      await service.sync(meeting(), { reason: 'edited', actorId: OFFICER });
    } finally {
      if (env === undefined) delete process.env.AI_ENABLED;
      else process.env.AI_ENABLED = env;
    }
    const call = (
      suggestions.reconcileSource.mock.calls as unknown as [
        { proposals: { dedupeKey: string }[] },
      ][]
    )[0][0];
    expect(call.proposals.map((proposal) => proposal.dedupeKey)).toEqual([
      actionItemKey('Order shirts'),
    ]);
  });
});

describe('seriesOpenActionItems: what a repeating meeting still owes (#5482)', () => {
  const accepted = (text: string, taskId: string) => ({
    status: 'accepted',
    result_id: taskId,
    dedupe_key: actionItemKey(text),
  });
  const item = (text: string) => ({
    text,
    owner_user_id: null,
    due_date: null,
  });

  it("lists the open items of the series' posted minutes only, under the viewer's read", async () => {
    const { service, repo, tasks, meetings } = build();
    const newer = meeting({
      id: 'm-newer',
      event_start_time: '2026-11-16T00:00:00.000Z',
      content: { action_items: [item('Book the bus'), item('Order shirts')] },
    });
    const older = meeting({
      id: 'm-older',
      content: { action_items: [item('Send the reminder')] },
    });
    const draft = meeting({ id: 'm-draft', status: 'draft' });
    const other = meeting({ id: 'm-other' });
    meetings.listWithFacts.mockResolvedValue({
      rows: [newer, draft, older, other],
      facts: new Map([
        ['m-newer', { series_key: 'head' }],
        ['m-draft', { series_key: 'head' }],
        ['m-older', { series_key: 'head' }],
        ['m-other', { series_key: 'elsewhere' }],
      ]),
    });
    repo.listKeyedForSource.mockImplementation(
      async (_c: string, source: { id: string }) =>
        source.id === 'm-newer'
          ? [
              accepted('Book the bus', 't-bus'),
              accepted('Order shirts', 't-shirts'),
            ]
          : [],
    );
    tasks.doneMarks.mockResolvedValue(
      new Map([
        ['t-bus', { done: true, group: null }],
        ['t-shirts', { done: false, group: { done: 3, total: 20 } }],
      ]),
    );

    await expect(
      service.seriesOpenActionItems(CHAPTER, OFFICER, 'head'),
    ).resolves.toEqual([
      {
        meeting_id: 'm-newer',
        event_start_time: '2026-11-16T00:00:00.000Z',
        items: [
          {
            index: 1,
            text: 'Order shirts',
            owner_user_id: null,
            due_date: null,
            group: { done: 3, total: 20 },
          },
        ],
      },
      {
        meeting_id: 'm-older',
        event_start_time: '2026-11-09T00:00:00.000Z',
        // Nobody made a task of it: open.
        items: [
          {
            index: 0,
            text: 'Send the reminder',
            owner_user_id: null,
            due_date: null,
            group: null,
          },
        ],
      },
    ]);
    expect(meetings.listWithFacts).toHaveBeenCalledWith(CHAPTER, OFFICER);
  });

  it('closes a later copy of an item with the first copy’s task', async () => {
    const { service, repo, tasks, meetings } = build();
    const twice = meeting({
      content: { action_items: [item('Order shirts'), item('order shirts.')] },
    });
    meetings.listWithFacts.mockResolvedValue({
      rows: [twice],
      facts: new Map([[MEETING, { series_key: 'head' }]]),
    });
    repo.listKeyedForSource.mockResolvedValue([
      accepted('Order shirts', 't-shirts'),
    ]);
    tasks.doneMarks.mockResolvedValue(
      new Map([['t-shirts', { done: true, group: null }]]),
    );
    await expect(
      service.seriesOpenActionItems(CHAPTER, OFFICER, 'head'),
    ).resolves.toEqual([]);
  });
});
