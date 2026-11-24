import type { ConfigService } from '@nestjs/config';
import {
  INTEREST_FORM_AGREE_BOX,
  INTEREST_FORM_CONSENT_VERSION,
  interestFormConsentPlain,
} from '@repo/validation';
import type { IEmailProvider } from '#domain/adapters/email.interface';
import type { Chapter } from '#domain/entities/chapter.entity';
import type { ChapterInterestForm } from '#domain/entities/interest-form.entity';
import type { IChapterGroupRepository } from '#domain/repositories/chapter-group.repository.interface';
import type { IChapterRepository } from '#domain/repositories/chapter.repository.interface';
import type { IInterestFormRepository } from '#domain/repositories/interest-form.repository.interface';
import type { IUserRepository } from '#domain/repositories/user.repository.interface';
import {
  hashInterestFormSecret,
  InterestFormService,
  mintInterestFormSlug,
} from './interest-form.service';
import type { NotificationService } from './notification.service';
import type { RbacService } from './rbac.service';

const CHAPTER = '11111111-1111-4111-8111-111111111111';
const COUNCIL = '22222222-2222-4222-8222-222222222222';
const ACTOR = 'user-officer';
const SLUG = 'k3mz8qpt2a';
const VERIFICATION = '33333333-3333-4333-8333-333333333333';
const SECRET = 'a'.repeat(43);

function chapter(overrides: Partial<Chapter> = {}): Chapter {
  return {
    id: CHAPTER,
    name: 'Phi Gamma Delta',
    university: 'RPI',
    kind: 'chapter',
    org_archetype: 'ifc',
    enabled_modules: { rush: true },
    accent_color: '#3366ff',
    branding: {},
    ...overrides,
  } as Chapter;
}

function form(overrides: Partial<ChapterInterestForm> = {}): ChapterInterestForm {
  return {
    id: 'form-1',
    chapter_id: CHAPTER,
    slug: SLUG,
    is_open: true,
    blurb: 'Come meet us.',
    questions: [
      { id: 'q1', type: 'short_answer', title: 'Your major?', required: true },
    ],
    ask_referrer: true,
    contacts_group_id: null,
    replaced_at: null,
    created_by: ACTOR,
    created_at: '2026-11-24T00:00:00.000Z',
    updated_at: '2026-11-24T00:00:00.000Z',
    ...overrides,
  };
}

const AT_SCHOOL = {
  schools: [{ id: 'school-1', name: 'RPI', domains: ['rpi.edu'] }],
  council: { id: COUNCIL, name: 'RPI IFC' },
};

function setup() {
  const forms: jest.Mocked<IInterestFormRepository> = {
    findLiveForm: jest.fn().mockResolvedValue(form()),
    createForm: jest.fn().mockResolvedValue(form({ is_open: false })),
    updateForm: jest
      .fn()
      .mockImplementation((_id, _chapter, patch) =>
        Promise.resolve(form(patch)),
      ),
    replaceForm: jest.fn().mockResolvedValue(form({ slug: 'newslug234' })),
    findBySlug: jest.fn().mockResolvedValue(form()),
    findLabels: jest.fn().mockResolvedValue([]),
    addLabel: jest.fn().mockResolvedValue({
      id: 'label-1',
      form_id: 'form-1',
      label: 'tabling-quad',
      created_at: '',
    }),
    removeLabel: jest.fn().mockResolvedValue(true),
    findPlace: jest.fn().mockResolvedValue(AT_SCHOOL),
    startCode: jest.fn().mockResolvedValue({
      ok: true,
      id: VERIFICATION,
      expires_at: '2026-11-24T00:10:00.000Z',
    }),
    discardCode: jest.fn().mockResolvedValue(undefined),
    findLatestCode: jest.fn().mockResolvedValue({
      id: VERIFICATION,
      code_salt: 'salt',
    }),
    confirmCode: jest.fn().mockResolvedValue({ ok: true, email: 'a@rpi.edu' }),
    findPrefill: jest.fn().mockResolvedValue(null),
    submit: jest.fn().mockResolvedValue({
      ok: true,
      candidate_id: 'cand-1',
      candidate_created: true,
      pushed_up: true,
      council_id: COUNCIL,
      email: 'a@rpi.edu',
      display_name: 'Alex Smith',
    }),
    pushUpChapter: jest
      .fn()
      .mockResolvedValue({ council_id: null, pushed: [] }),
    findLatestSubmission: jest.fn().mockResolvedValue(null),
  } as unknown as jest.Mocked<IInterestFormRepository>;
  const chapters = {
    findById: jest
      .fn()
      .mockImplementation((id: string) =>
        Promise.resolve(
          id === COUNCIL
            ? chapter({ id: COUNCIL, name: 'RPI IFC', kind: 'council' })
            : chapter(),
        ),
      ),
  };
  const groups = {
    findById: jest.fn().mockResolvedValue({ id: 'group-1' }),
    findMemberIds: jest.fn().mockResolvedValue([]),
  };
  const users = {
    findById: jest.fn().mockResolvedValue(null),
    findByIds: jest.fn().mockResolvedValue([]),
  };
  const email = {
    sendInterestFormCodeEmail: jest.fn().mockResolvedValue(true),
    sendInterestFormReceiptEmail: jest.fn().mockResolvedValue(true),
    sendInterestFormPushedUpEmail: jest.fn().mockResolvedValue(true),
  };
  const holders: Record<string, string[]> = {
    'rush:manage': ['manager'],
    'rush:view': ['manager', 'viewer'],
  };
  const rbac = {
    findUserIdsWithPermissions: jest
      .fn()
      .mockImplementation((_chapter: string, keys: string[]) =>
        Promise.resolve(holders[keys[0]] ?? []),
      ),
  };
  const notifications = { notifyMembers: jest.fn().mockResolvedValue(undefined) };
  const config = { get: jest.fn().mockReturnValue('https://app.frapp.live') };
  const service = new InterestFormService(
    forms,
    chapters as unknown as IChapterRepository,
    groups as unknown as IChapterGroupRepository,
    users as unknown as IUserRepository,
    email as unknown as IEmailProvider,
    rbac as unknown as RbacService,
    notifications as unknown as NotificationService,
    config as unknown as ConfigService,
  );
  return { service, forms, chapters, groups, users, email, notifications };
}

const SUBMISSION = {
  proof: `${VERIFICATION}.${SECRET}`,
  first_name: 'Alex',
  last_name: 'Smith',
  class_year: 2030,
  answers: { q1: 'Physics' },
  referrer: 'Sam Lee',
  source_label: 'tabling-quad',
  agree: true,
};

describe('InterestFormService — settings', () => {
  it('mints a slug a QR code and a phone read cleanly', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(mintInterestFormSlug()).toMatch(/^[a-hjkmnp-z2-9]{10}$/);
    }
  });

  it('writes the form closed on the first read, as it exists once Rush is on', async () => {
    const { service, forms } = setup();
    forms.findLiveForm.mockResolvedValueOnce(null);
    const view = await service.getSettings(CHAPTER, ACTOR);
    expect(forms.createForm).toHaveBeenCalledWith(
      CHAPTER,
      expect.stringMatching(/^[a-z0-9]{10}$/),
      ACTOR,
    );
    expect(view.offered).toBe(true);
    expect(view.form?.is_open).toBe(false);
    expect(view.form?.path).toBe(`/f/${SLUG}`);
  });

  it('offers no form to an NPHC chapter, and refuses to make one', async () => {
    const { service, forms, chapters } = setup();
    chapters.findById.mockResolvedValue(chapter({ org_archetype: 'nphc' }));
    await expect(service.getSettings(CHAPTER, ACTOR)).resolves.toMatchObject({
      offered: false,
      form: null,
    });
    await expect(
      service.updateSettings(CHAPTER, ACTOR, { is_open: true }),
    ).rejects.toMatchObject({
      response: { code: 'interest_form.not_offered' },
    });
    expect(forms.createForm).not.toHaveBeenCalled();
    expect(forms.updateForm).not.toHaveBeenCalled();
  });

  it('refuses a question on a topic Frapp never collects, and says which', async () => {
    const { service, forms } = setup();
    await expect(
      service.updateSettings(CHAPTER, ACTOR, {
        questions: [
          { id: 'q1', type: 'short_answer', title: 'What is your religion?' },
        ],
      }),
    ).rejects.toMatchObject({
      response: {
        code: 'interest_form.question.sensitive',
        message: expect.stringContaining('religion'),
      },
    });
    expect(forms.updateForm).not.toHaveBeenCalled();
  });

  it('refuses more than ten questions', async () => {
    const { service } = setup();
    const questions = Array.from({ length: 11 }, (_, i) => ({
      id: `q${i}`,
      type: 'short_answer',
      title: `Question ${i}`,
    }));
    await expect(
      service.updateSettings(CHAPTER, ACTOR, { questions }),
    ).rejects.toMatchObject({
      response: { code: 'interest_form.questions.invalid' },
    });
  });

  it('saves questions in the chat form card shape, and a trimmed blurb', async () => {
    const { service, forms } = setup();
    await service.updateSettings(CHAPTER, ACTOR, {
      blurb: '  Rush with us.  ',
      questions: [
        {
          id: 'q1',
          type: 'multiple_choice',
          title: 'When can you meet?',
          required: true,
          options: [
            { id: 'a', label: 'Weekdays' },
            { id: 'b', label: 'Weekends' },
          ],
        },
      ],
    });
    expect(forms.updateForm).toHaveBeenCalledWith('form-1', CHAPTER, {
      blurb: 'Rush with us.',
      questions: [
        {
          id: 'q1',
          type: 'multiple_choice',
          title: 'When can you meet?',
          required: true,
          options: [
            { id: 'a', label: 'Weekdays' },
            { id: 'b', label: 'Weekends' },
          ],
        },
      ],
    });
  });

  it('refuses a contacts group from another chapter', async () => {
    const { service, groups } = setup();
    groups.findById.mockResolvedValue(null);
    await expect(
      service.updateSettings(CHAPTER, ACTOR, {
        contacts_group_id: '44444444-4444-4444-8444-444444444444',
      }),
    ).rejects.toMatchObject({
      response: { code: 'interest_form.group.not_found' },
    });
  });

  it('folds a typed label to its stored shape and refuses a duplicate', async () => {
    const { service, forms } = setup();
    await service.addLabel(CHAPTER, ACTOR, ' Tabling Quad ');
    expect(forms.addLabel).toHaveBeenCalledWith('form-1', 'tabling-quad');

    forms.addLabel.mockResolvedValueOnce(null);
    await expect(
      service.addLabel(CHAPTER, ACTOR, 'tabling-quad'),
    ).rejects.toMatchObject({ response: { code: 'interest_form.label.exists' } });
  });

  it('names the contacts who lack rush:view, since they are not told', async () => {
    const { service, forms, groups, users } = setup();
    forms.findLiveForm.mockResolvedValue(
      form({ contacts_group_id: 'group-1' }),
    );
    groups.findMemberIds.mockResolvedValue(['viewer', 'pledge']);
    users.findByIds.mockResolvedValue([
      { id: 'pledge', display_name: 'Pat Pledge' },
    ]);
    const view = await service.getSettings(CHAPTER, ACTOR);
    expect(users.findByIds).toHaveBeenCalledWith(['pledge']);
    expect(view.contacts_skipped).toEqual([
      { user_id: 'pledge', display_name: 'Pat Pledge' },
    ]);
  });
});

describe('InterestFormService — the public page', () => {
  it('answers 404 for a replaced form, an unknown slug and a malformed one alike', async () => {
    const { service, forms } = setup();
    forms.findBySlug.mockResolvedValueOnce(
      form({ replaced_at: '2026-11-24T01:00:00.000Z' }),
    );
    await expect(service.getPublic(SLUG)).rejects.toMatchObject({
      response: { code: 'interest_form.not_found' },
    });
    forms.findBySlug.mockResolvedValueOnce(null);
    await expect(service.getPublic(SLUG)).rejects.toMatchObject({
      response: { code: 'interest_form.not_found' },
    });
    await expect(service.getPublic('../etc')).rejects.toMatchObject({
      response: { code: 'interest_form.not_found' },
    });
  });

  it('shows only public fields, the approved consent text and the known label', async () => {
    const { service, forms } = setup();
    forms.findLabels.mockResolvedValue([
      { id: 'l', form_id: 'form-1', label: 'tabling-quad', created_at: '' },
    ]);
    const view = await service.getPublic(SLUG, 'Tabling-Quad');
    expect(view.source_label).toBe('tabling-quad');
    expect(view.chapter).toEqual({
      name: 'Phi Gamma Delta',
      university: 'RPI',
      mark_text: null,
      accent_color: '#3366ff',
    });
    expect(view.consent.version).toBe(INTEREST_FORM_CONSENT_VERSION);
    expect(view.consent.agree_label).toBe("I agree, and I'm 18 or older");
    expect(view.consent.runs.map((run) => run.text).join('')).toBe(
      interestFormConsentPlain({
        chapter: 'Phi Gamma Delta',
        school: 'RPI',
        council: 'RPI IFC',
      }),
    );
    expect(Object.keys(view).sort()).toEqual([
      'ask_referrer',
      'blurb',
      'chapter',
      'consent',
      'is_open',
      'questions',
      'slug',
      'source_label',
      'verify',
    ]);

    const unknown = await service.getPublic(SLUG, 'somewhere-else');
    expect(unknown.source_label).toBeNull();
  });

  it('hides the questions while the form is closed', async () => {
    const { service, forms } = setup();
    forms.findBySlug.mockResolvedValue(form({ is_open: false }));
    const view = await service.getPublic(SLUG);
    expect(view.is_open).toBe(false);
    expect(view.questions).toEqual([]);
    await expect(
      service.startCode(SLUG, 'a@rpi.edu', '1.2.3.4'),
    ).rejects.toMatchObject({ response: { code: 'interest_form.closed' } });
  });

  it("sends a code under the form's ceilings, hashed, and never the code itself", async () => {
    const { service, forms, email } = setup();
    const sent = await service.startCode(SLUG, ' A@RPI.edu ', '1.2.3.4');
    expect(sent.email).toBe('a@rpi.edu');
    const call = forms.startCode.mock.calls[0][0];
    const mail = email.sendInterestFormCodeEmail.mock.calls[0][0];
    expect(call.codeHash).toBe(hashInterestFormSecret(call.codeSalt, mail.code));
    expect(call.codeHash).not.toContain(mail.code);
    expect(call.ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(call.maxPerIp).toBeGreaterThanOrEqual(50);
  });

  it("names the school's domains when an address is off them", async () => {
    const { service, forms, email } = setup();
    forms.startCode.mockResolvedValue({ ok: false, reason: 'wrong_domain' });
    await expect(
      service.startCode(SLUG, 'a@gmail.com', '1.2.3.4'),
    ).rejects.toMatchObject({
      response: {
        code: 'interest_form.email.wrong_domain',
        message: 'Use your RPI email, ending in @rpi.edu.',
      },
    });
    expect(email.sendInterestFormCodeEmail).not.toHaveBeenCalled();
  });

  it('answers 429 for a ceiling without saying whose', async () => {
    const { service, forms } = setup();
    forms.startCode.mockResolvedValue({
      ok: false,
      reason: 'ip_limit',
      retry_after_seconds: 600,
    });
    await expect(
      service.startCode(SLUG, 'a@rpi.edu', '1.2.3.4'),
    ).rejects.toMatchObject({
      status: 429,
      response: { code: 'interest_form.code.rate_limited' },
    });
  });

  it('undoes the code when its email does not go out', async () => {
    const { service, forms, email } = setup();
    email.sendInterestFormCodeEmail.mockResolvedValue(false);
    await expect(
      service.startCode(SLUG, 'a@rpi.edu', '1.2.3.4'),
    ).rejects.toMatchObject({ status: 503 });
    expect(forms.discardCode).toHaveBeenCalledWith('form-1', VERIFICATION);
  });

  it('fills in the details only after the code matched', async () => {
    const { service, forms } = setup();
    forms.confirmCode.mockResolvedValueOnce({
      ok: false,
      reason: 'wrong_code',
      attempts_left: 4,
    });
    await expect(
      service.confirmCode(SLUG, 'a@rpi.edu', '000000'),
    ).rejects.toMatchObject({ response: { code: 'interest_form.code.wrong' } });
    expect(forms.findPrefill).not.toHaveBeenCalled();

    forms.findPrefill.mockResolvedValue({
      first_name: 'Alex',
      last_name: 'Smith',
      preferred_name: null,
      class_year: 2030,
      phone: null,
    });
    const verified = await service.confirmCode(SLUG, 'a@rpi.edu', '123456');
    expect(verified.prefill?.first_name).toBe('Alex');
    expect(forms.findPrefill).toHaveBeenCalledWith(
      CHAPTER,
      ['school-1'],
      'a@rpi.edu',
    );
    const [id, secret] = verified.proof.split('.');
    expect(id).toBe(VERIFICATION);
    expect(forms.confirmCode.mock.calls[1][0].proofHash).toBe(
      hashInterestFormSecret(VERIFICATION, secret),
    );
  });
});

describe('InterestFormService — a submission', () => {
  it('refuses without the 18+ box, before writing anything', async () => {
    const { service, forms } = setup();
    await expect(
      service.submit(SLUG, { ...SUBMISSION, agree: false }),
    ).rejects.toMatchObject({
      response: { code: 'interest_form.consent.required' },
    });
    expect(forms.submit).not.toHaveBeenCalled();
  });

  it('refuses a malformed proof and a missing required answer', async () => {
    const { service, forms } = setup();
    await expect(
      service.submit(SLUG, { ...SUBMISSION, proof: 'nope' }),
    ).rejects.toMatchObject({ response: { code: 'interest_form.proof.invalid' } });
    await expect(
      service.submit(SLUG, { ...SUBMISSION, answers: {} }),
    ).rejects.toMatchObject({
      response: { code: 'interest_form.answers.invalid' },
    });
    expect(forms.submit).not.toHaveBeenCalled();
  });

  it('writes the whole submission in one call, with the consent record', async () => {
    const { service, forms } = setup();
    await service.submit(SLUG, SUBMISSION);
    expect(forms.submit).toHaveBeenCalledTimes(1);
    expect(forms.submit).toHaveBeenCalledWith({
      formId: 'form-1',
      verificationId: VERIFICATION,
      proofHash: hashInterestFormSecret(VERIFICATION, SECRET),
      firstName: 'Alex',
      lastName: 'Smith',
      preferredName: null,
      classYear: 2030,
      phone: null,
      answers: { q1: 'Physics' },
      referrerText: 'Sam Lee',
      sourceLabel: 'tabling-quad',
      consentVersion: INTEREST_FORM_CONSENT_VERSION,
      consentBoxes: [INTEREST_FORM_AGREE_BOX],
    });
  });

  it('drops the referrer when the form does not ask for one', async () => {
    const { service, forms } = setup();
    forms.findBySlug.mockResolvedValue(form({ ask_referrer: false }));
    await service.submit(SLUG, SUBMISSION);
    expect(forms.submit.mock.calls[0][0].referrerText).toBeNull();
  });

  it('tells rush:manage and the contacts who can see recruitment, then emails a receipt', async () => {
    const { service, forms, groups, notifications, email } = setup();
    forms.findBySlug.mockResolvedValue(form({ contacts_group_id: 'group-1' }));
    groups.findMemberIds.mockResolvedValue(['viewer', 'pledge']);
    const done = await service.submit(SLUG, SUBMISSION);

    expect(done).toEqual({ chapter_name: 'Phi Gamma Delta' });
    expect(notifications.notifyMembers).toHaveBeenCalledWith(
      CHAPTER,
      ['manager', 'viewer'],
      expect.objectContaining({
        title: 'New interest form',
        body: 'Alex Smith filled in your interest form.',
        data: { target: { screen: 'rush', candidateId: 'cand-1' } },
      }),
    );
    // Name only: no contact details and no answers in the push.
    const payload = notifications.notifyMembers.mock.calls[0][2];
    expect(JSON.stringify(payload)).not.toContain('a@rpi.edu');
    expect(JSON.stringify(payload)).not.toContain('Physics');
    expect(email.sendInterestFormReceiptEmail).toHaveBeenCalledWith({
      to: 'a@rpi.edu',
      chapterName: 'Phi Gamma Delta',
      formUrl: `https://app.frapp.live/f/${SLUG}`,
      councilName: 'RPI IFC',
    });
  });

  it('says "updated" for a repeat submission, which the database matched', async () => {
    const { service, forms, notifications } = setup();
    forms.submit.mockResolvedValue({
      ok: true,
      candidate_id: 'cand-1',
      candidate_created: false,
      pushed_up: false,
      council_id: null,
      email: 'a@rpi.edu',
      display_name: 'Alex Smith',
    });
    await service.submit(SLUG, SUBMISSION);
    expect(notifications.notifyMembers.mock.calls[0][2].title).toBe(
      'Interest form updated',
    );
  });

  it('keeps the submission when telling the chapter fails', async () => {
    const { service, notifications } = setup();
    notifications.notifyMembers.mockRejectedValue(new Error('push down'));
    await expect(service.submit(SLUG, SUBMISSION)).resolves.toEqual({
      chapter_name: 'Phi Gamma Delta',
    });
  });

  it('answers a spent or expired proof with "verify again"', async () => {
    const { service, forms } = setup();
    forms.submit.mockResolvedValue({ ok: false, reason: 'bad_proof' });
    await expect(service.submit(SLUG, SUBMISSION)).rejects.toMatchObject({
      response: { code: 'interest_form.proof.invalid' },
    });
  });
});

describe('InterestFormService — the push-up', () => {
  it('emails each PNM that joined the master list', async () => {
    const { service, forms, email } = setup();
    forms.pushUpChapter.mockResolvedValue({
      council_id: COUNCIL,
      pushed: [{ pnm_id: 'p1', email: 'a@rpi.edu', first_name: 'Alex' }],
    });
    await expect(service.pushUpChapter(CHAPTER)).resolves.toBe(1);
    expect(email.sendInterestFormPushedUpEmail).toHaveBeenCalledWith({
      to: 'a@rpi.edu',
      chapterName: 'Phi Gamma Delta',
      councilName: 'RPI IFC',
    });
  });

  it('never throws: the link was already accepted', async () => {
    const { service, forms } = setup();
    forms.pushUpChapter.mockRejectedValue(new Error('db down'));
    await expect(service.pushUpChapter(CHAPTER)).resolves.toBe(0);
  });
});
