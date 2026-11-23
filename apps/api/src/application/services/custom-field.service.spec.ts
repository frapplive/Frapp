import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  CustomFieldService,
  type UpdateCustomFieldInput,
} from './custom-field.service';
import { ChapterAuditLogService } from './chapter-audit-log.service';
import { createAuditLogServiceMock } from '#test/helpers/audit-log.mock';
import { allowedVisibilities } from './custom-field-visibility';
import { SystemPermissions } from '#domain/constants/permissions';
import {
  CUSTOM_FIELD_REPOSITORY,
  CustomFieldKeyConflictError,
  type ICustomFieldRepository,
} from '#domain/repositories/custom-field.repository.interface';

const CHAPTER_ID = 'chapter-1';
const ACTOR_ID = 'user-1';

/** See `createAuditLogServiceMock` for why the row shape is asserted elsewhere. */
const auditLog = createAuditLogServiceMock();

beforeEach(() => {
  auditLog.record.mockClear();
});

type RepoMock = { [K in keyof ICustomFieldRepository]: jest.Mock };

/**
 * A repository double. `create` echoes its payload back as the stored row
 * unless a test overrides it, so the payload the service built is what the
 * assertions read.
 */
function makeRepo(
  opts: {
    /** Row returned by `findById`, read before update/delete. */
    existingField?: Record<string, unknown> | null;
    /** Highest `sort` in the chapter; `null`/omitted = no fields yet. */
    maxSort?: number | null;
  } = {},
): RepoMock {
  return {
    findByChapter: jest.fn().mockResolvedValue([]),
    findByVisibility: jest.fn().mockResolvedValue([]),
    findIdsByVisibility: jest.fn().mockResolvedValue([]),
    findById: jest.fn().mockResolvedValue(opts.existingField ?? null),
    findMaxSort: jest.fn().mockResolvedValue(opts.maxSort ?? null),
    create: jest.fn((row: Record<string, unknown>) =>
      Promise.resolve({ id: 'f-new', ...row }),
    ),
    seedDefaults: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(null),
    delete: jest.fn().mockResolvedValue(undefined),
    findValuesForMember: jest.fn().mockResolvedValue([]),
    findValuesByFieldIds: jest.fn().mockResolvedValue([]),
    upsertValues: jest.fn().mockResolvedValue(undefined),
    deleteValues: jest.fn().mockResolvedValue(undefined),
  };
}

async function buildService(repo: RepoMock) {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      CustomFieldService,
      { provide: CUSTOM_FIELD_REPOSITORY, useValue: repo },
      { provide: ChapterAuditLogService, useValue: auditLog },
    ],
  }).compile();
  return module.get(CustomFieldService);
}

describe('CustomFieldService', () => {
  describe('findByChapter', () => {
    it('returns chapter custom fields ordered by sort', async () => {
      const rows = [{ id: 'f1', sort: 0 }];
      const repo = makeRepo();
      repo.findByChapter.mockResolvedValue(rows);
      const service = await buildService(repo);

      const result = await service.findByChapter(CHAPTER_ID);

      expect(result).toEqual(rows);
      expect(repo.findByChapter).toHaveBeenCalledWith(CHAPTER_ID);
    });
  });

  describe('create', () => {
    it('inserts a field with defaults and writes an audit row', async () => {
      const created = {
        id: 'f1',
        chapter_id: CHAPTER_ID,
        key: 'major',
        label: 'Major',
        type: 'text',
        required: false,
        visibility: 'chapter',
        sensitive: false,
        options: null,
        sort: 0,
      };
      const repo = makeRepo();
      repo.create.mockResolvedValue(created);
      const service = await buildService(repo);

      const result = await service.create(CHAPTER_ID, ACTOR_ID, {
        key: 'major',
        label: 'Major',
        type: 'text',
      });

      expect(result).toEqual(created);
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          chapter_id: CHAPTER_ID,
          key: 'major',
          type: 'text',
          required: false,
          visibility: 'chapter',
          sensitive: false,
          options: null,
          sort: 0,
        }),
      );
      expect(auditLog.record).toHaveBeenCalledTimes(1);
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          chapterId: CHAPTER_ID,
          actorUserId: ACTOR_ID,
          action: 'chapter_custom_field_created',
          targetType: 'chapter_custom_field',
          targetId: created.id,
        }),
      );
      // Left unset so `record`'s default (true) applies — the row value is
      // pinned in chapter-audit-log.service.spec.ts. Asserted explicitly
      // because `objectContaining` tolerates extra keys, so a later
      // `memberVisible: false` here would otherwise pass every assertion
      // while silently dropping field changes out of `#chapter-audit`.
      expect(auditLog.record.mock.calls[0][0].memberVisible).toBeUndefined();
    });

    it('appends after the highest existing sort when none is supplied', async () => {
      // The Fields tab sends no `sort`. A fixed default of 0 would place every
      // hand-added field ahead of the fields seeded at onboarding (#572), since
      // findByChapter orders by sort then created_at.
      const repo = makeRepo({ maxSort: 7 });
      const service = await buildService(repo);

      await service.create(CHAPTER_ID, ACTOR_ID, {
        key: 'nickname',
        label: 'Nickname',
        type: 'text',
      });

      expect(repo.findMaxSort).toHaveBeenCalledWith(CHAPTER_ID);
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ sort: 8 }),
      );
    });

    it('starts at 0 in a chapter with no fields yet', async () => {
      const repo = makeRepo({ maxSort: null });
      const service = await buildService(repo);

      await service.create(CHAPTER_ID, ACTOR_ID, {
        key: 'nickname',
        label: 'Nickname',
        type: 'text',
      });

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ sort: 0 }),
      );
    });

    it('appends after a highest sort of 0 rather than reusing it', async () => {
      // 0 is a real sort, not a miss: a chapter whose only field sits at 0
      // must hand the next one 1.
      const repo = makeRepo({ maxSort: 0 });
      const service = await buildService(repo);

      await service.create(CHAPTER_ID, ACTOR_ID, {
        key: 'nickname',
        label: 'Nickname',
        type: 'text',
      });

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ sort: 1 }),
      );
    });

    it('honours an explicitly supplied sort', async () => {
      const repo = makeRepo({ maxSort: 7 });
      const service = await buildService(repo);

      await service.create(CHAPTER_ID, ACTOR_ID, {
        key: 'nickname',
        label: 'Nickname',
        type: 'text',
        sort: 2,
      });

      expect(repo.findMaxSort).not.toHaveBeenCalled();
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ sort: 2 }),
      );
    });

    it('rejects a select field with no choices and does not audit', async () => {
      const repo = makeRepo();
      const service = await buildService(repo);

      await expect(
        service.create(CHAPTER_ID, ACTOR_ID, {
          key: 'shirt',
          label: 'Shirt size',
          type: 'select',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.create).not.toHaveBeenCalled();
      expect(auditLog.record).not.toHaveBeenCalled();
    });

    it('deep-clones options so the persisted row never shares a reference', async () => {
      const repo = makeRepo();
      const service = await buildService(repo);

      const options = { choices: ['S', 'M', 'L'] };
      await service.create(CHAPTER_ID, ACTOR_ID, {
        key: 'shirt',
        label: 'Shirt size',
        type: 'select',
        options,
      });

      const persisted = repo.create.mock.calls[0][0] as {
        options: { choices: string[] };
      };
      expect(persisted.options).toEqual(options);
      expect(persisted.options).not.toBe(options);
      expect(persisted.options.choices).not.toBe(options.choices);
    });

    it('maps a duplicate key to 409 Conflict and does not audit', async () => {
      const repo = makeRepo();
      repo.create.mockRejectedValue(new CustomFieldKeyConflictError());
      const service = await buildService(repo);

      await expect(
        service.create(CHAPTER_ID, ACTOR_ID, {
          key: 'dup',
          label: 'Dup',
          type: 'text',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(auditLog.record).not.toHaveBeenCalled();
    });

    it('lets any other repository failure through unmapped', async () => {
      const failure = new Error('connection reset');
      const repo = makeRepo();
      repo.create.mockRejectedValue(failure);
      const service = await buildService(repo);

      await expect(
        service.create(CHAPTER_ID, ACTOR_ID, {
          key: 'x',
          label: 'X',
          type: 'text',
        }),
      ).rejects.toBe(failure);
    });
  });

  describe('remove', () => {
    it('deletes any field and audits the deletion (no core guard)', async () => {
      const repo = makeRepo({
        existingField: { id: 'f1', chapter_id: CHAPTER_ID },
      });
      const service = await buildService(repo);

      const result = await service.remove('f1', CHAPTER_ID, ACTOR_ID);

      expect(result).toEqual({ success: true });
      expect(repo.delete).toHaveBeenCalledWith('f1', CHAPTER_ID);
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'chapter_custom_field_deleted',
          targetType: 'chapter_custom_field',
        }),
      );
    });

    it('throws 404 when the field is missing', async () => {
      const repo = makeRepo({ existingField: null });
      const service = await buildService(repo);

      await expect(
        service.remove('missing', CHAPTER_ID, ACTOR_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.delete).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('applies a partial patch and audits the change', async () => {
      const existing = {
        id: 'f1',
        chapter_id: CHAPTER_ID,
        label: 'Old',
        required: false,
      };
      const updated = { ...existing, label: 'New' };
      const repo = makeRepo({ existingField: existing });
      repo.update.mockResolvedValue(updated);
      const service = await buildService(repo);

      const result = await service.update('f1', CHAPTER_ID, ACTOR_ID, {
        label: 'New',
      });

      expect(result).toEqual(updated);
      expect(repo.update).toHaveBeenCalledWith('f1', CHAPTER_ID, {
        label: 'New',
      });
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'chapter_custom_field_updated' }),
      );
    });

    it('returns the existing field without auditing when the patch is empty', async () => {
      const existing = { id: 'f1', chapter_id: CHAPTER_ID };
      const repo = makeRepo({ existingField: existing });
      const service = await buildService(repo);

      const result = await service.update('f1', CHAPTER_ID, ACTOR_ID, {});

      expect(result).toEqual(existing);
      expect(repo.update).not.toHaveBeenCalled();
      expect(auditLog.record).not.toHaveBeenCalled();
    });

    it('throws 404 when the write matches no row', async () => {
      const repo = makeRepo({
        existingField: { id: 'f1', chapter_id: CHAPTER_ID },
      });
      repo.update.mockResolvedValue(null);
      const service = await buildService(repo);

      await expect(
        service.update('f1', CHAPTER_ID, ACTOR_ID, { label: 'New' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(auditLog.record).not.toHaveBeenCalled();
    });

    it('refuses to strip the choices off an existing select field', async () => {
      const existing = {
        id: 'f1',
        chapter_id: CHAPTER_ID,
        type: 'select',
        options: { choices: ['S', 'M'] },
      };
      // Nulling options on a select field would leave it with no choices —
      // the same invariant create() enforces.
      const bodies: UpdateCustomFieldInput[] = [
        { options: null },
        { options: { choices: [] } },
      ];
      for (const body of bodies) {
        const service = await buildService(
          makeRepo({ existingField: existing }),
        );
        await expect(
          service.update('f1', CHAPTER_ID, ACTOR_ID, body),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(auditLog.record).not.toHaveBeenCalled();
      }
    });
  });

  /**
   * A member's own values (#581). The seeded chapter set, one field per type
   * and tier, so each rule is exercised against the definition it reads.
   */
  describe('own values', () => {
    const MEMBER_ID = 'member-1';
    const def = <T extends Record<string, unknown>>(over: T) => ({
      chapter_id: CHAPTER_ID,
      required: false,
      sensitive: false,
      options: null,
      sort: 0,
      created_at: '',
      updated_at: '',
      ...over,
    });
    const FIELDS = [
      def({
        id: 'f-major',
        key: 'major',
        label: 'Major',
        type: 'text',
        visibility: 'chapter',
        required: true,
      }),
      def({
        id: 'f-year',
        key: 'graduation_year',
        label: 'Graduation year',
        type: 'number',
        visibility: 'chapter',
      }),
      def({
        id: 'f-shirt',
        key: 't_shirt_size',
        label: 'T-shirt size',
        type: 'select',
        visibility: 'chapter',
        options: { choices: ['S', 'M', 'L'] },
      }),
      def({
        id: 'f-allergy',
        key: 'allergies',
        label: 'Allergies',
        type: 'text',
        visibility: 'exec',
        sensitive: true,
        options: { max_length: 20 },
      }),
      def({
        id: 'f-ec-phone',
        key: 'emergency_contact_phone',
        label: 'Emergency contact (phone)',
        type: 'phone',
        visibility: 'exec',
        required: true,
      }),
      def({
        id: 'f-gpa',
        key: 'cumulative_gpa',
        label: 'Cumulative GPA',
        type: 'decimal',
        visibility: 'president',
      }),
      def({
        id: 'f-vote',
        key: 'can_drive',
        label: 'Can drive',
        type: 'boolean',
        visibility: 'self',
      }),
      def({
        id: 'f-kids',
        key: 'siblings',
        label: 'Siblings',
        type: 'number',
        visibility: 'chapter',
      }),
    ];

    function repoWith(
      stored: { field_id: string; value: string | null }[] = [],
    ) {
      const repo = makeRepo();
      repo.findByChapter.mockResolvedValue(FIELDS);
      repo.findValuesForMember.mockResolvedValue(stored);
      return repo;
    }

    it('lists every tier to the member, without the fields the profile already owns', async () => {
      const repo = repoWith([{ field_id: 'f-allergy', value: 'Peanuts' }]);
      const service = await buildService(repo);

      const own = await service.findOwnFields(CHAPTER_ID, MEMBER_ID);

      expect(own.map((f) => f.key)).toEqual([
        't_shirt_size',
        'allergies',
        'emergency_contact_phone',
        'cumulative_gpa',
        'can_drive',
        'siblings',
      ]);
      expect(own.find((f) => f.key === 'allergies')).toMatchObject({
        visibility: 'exec',
        value: 'Peanuts',
        max_length: 20,
        choices: null,
      });
      expect(own.find((f) => f.key === 't_shirt_size')?.choices).toEqual([
        'S',
        'M',
        'L',
      ]);
      // Only the member's own values are read, for the listed fields.
      expect(repo.findValuesForMember).toHaveBeenCalledWith(MEMBER_ID, [
        'f-shirt',
        'f-allergy',
        'f-ec-phone',
        'f-gpa',
        'f-vote',
        'f-kids',
      ]);
    });

    it('writes valid values for the caller member, normalized, and clears blanks', async () => {
      const repo = repoWith([{ field_id: 'f-allergy', value: 'Peanuts' }]);
      const service = await buildService(repo);

      await service.updateOwnValues(CHAPTER_ID, MEMBER_ID, [
        { field_id: 'f-shirt', value: 'M' },
        { field_id: 'f-ec-phone', value: '(518) 555-0142' },
        { field_id: 'f-gpa', value: '3.40' },
        { field_id: 'f-vote', value: 'true' },
        { field_id: 'f-kids', value: ' 02 ' },
        { field_id: 'f-allergy', value: '  ' },
      ]);

      expect(repo.upsertValues).toHaveBeenCalledWith([
        {
          chapter_id: CHAPTER_ID,
          member_id: MEMBER_ID,
          field_id: 'f-shirt',
          value: 'M',
        },
        {
          chapter_id: CHAPTER_ID,
          member_id: MEMBER_ID,
          field_id: 'f-ec-phone',
          value: '+15185550142',
        },
        {
          chapter_id: CHAPTER_ID,
          member_id: MEMBER_ID,
          field_id: 'f-gpa',
          value: '3.4',
        },
        {
          chapter_id: CHAPTER_ID,
          member_id: MEMBER_ID,
          field_id: 'f-vote',
          value: 'true',
        },
        {
          chapter_id: CHAPTER_ID,
          member_id: MEMBER_ID,
          field_id: 'f-kids',
          value: '2',
        },
      ]);
      expect(repo.deleteValues).toHaveBeenCalledWith(CHAPTER_ID, MEMBER_ID, [
        'f-allergy',
      ]);
      // A member's own profile edit is not a chapter settings change.
      expect(auditLog.record).not.toHaveBeenCalled();
    });

    it.each([
      ['a choice the field does not list', 'f-shirt', 'XXL'],
      ['text over the field cap', 'f-allergy', 'x'.repeat(21)],
      ['a phone that is not a number', 'f-ec-phone', 'call my mom'],
      ['a decimal with a comma', 'f-gpa', '3,4'],
      ['a boolean that is not true or false', 'f-vote', 'yes'],
      ['a fraction for a whole number', 'f-kids', '1.5'],
    ])('refuses %s and writes nothing', async (_case, fieldId, value) => {
      const repo = repoWith();
      const service = await buildService(repo);

      await expect(
        // A valid value rides beside the refused one: one refusal refuses
        // the whole save.
        service.updateOwnValues(CHAPTER_ID, MEMBER_ID, [
          ...(fieldId === 'f-kids' ? [] : [{ field_id: 'f-kids', value: '2' }]),
          { field_id: fieldId, value },
        ]),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.upsertValues).not.toHaveBeenCalled();
      expect(repo.deleteValues).not.toHaveBeenCalled();
    });

    it('refuses clearing a required field that has a value', async () => {
      const repo = repoWith([
        { field_id: 'f-ec-phone', value: '+15185550142' },
      ]);
      const service = await buildService(repo);

      await expect(
        service.updateOwnValues(CHAPTER_ID, MEMBER_ID, [
          { field_id: 'f-ec-phone', value: '' },
        ]),
      ).rejects.toThrow('Emergency contact (phone) is required.');
      expect(repo.deleteValues).not.toHaveBeenCalled();
    });

    it('lets a required field with no value stay empty', async () => {
      const repo = repoWith();
      const service = await buildService(repo);

      await service.updateOwnValues(CHAPTER_ID, MEMBER_ID, [
        { field_id: 'f-ec-phone', value: null },
      ]);

      expect(repo.upsertValues).toHaveBeenCalledWith([]);
      expect(repo.deleteValues).toHaveBeenCalledWith(CHAPTER_ID, MEMBER_ID, []);
    });

    it.each([
      ['a field from another chapter or none', 'f-elsewhere'],
      ['a field the profile already owns', 'f-year'],
    ])('refuses %s', async (_case, fieldId) => {
      const repo = repoWith();
      const service = await buildService(repo);

      await expect(
        service.updateOwnValues(CHAPTER_ID, MEMBER_ID, [
          { field_id: fieldId, value: '2027' },
        ]),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.upsertValues).not.toHaveBeenCalled();
    });

    it("keeps a member's sensitive value out of a plain member's read of them", async () => {
      // The member wrote their allergy (exec tier) through the own path; a
      // plain member viewing them reads only the chapter tier, and the exec
      // field's value is never even selected.
      const repo = repoWith();
      repo.findByVisibility.mockImplementation(
        (_chapter: string, tiers: string[]) =>
          Promise.resolve(FIELDS.filter((f) => tiers.includes(f.visibility))),
      );
      repo.findValuesForMember.mockImplementation(
        (_member: string, ids: string[]) =>
          Promise.resolve(
            [{ field_id: 'f-allergy', value: 'Peanuts' }].filter((v) =>
              ids.includes(v.field_id),
            ),
          ),
      );
      const service = await buildService(repo);

      const seen = await service.findVisibleValuesForMember(
        CHAPTER_ID,
        MEMBER_ID,
        allowedVisibilities([SystemPermissions.MEMBERS_VIEW], false),
      );

      expect(seen.map((f) => f.key)).not.toContain('allergies');
      expect(repo.findValuesForMember).not.toHaveBeenCalledWith(
        MEMBER_ID,
        expect.arrayContaining(['f-allergy']),
      );
    });

    it('refuses the same field twice in one save', async () => {
      const service = await buildService(repoWith());

      await expect(
        service.updateOwnValues(CHAPTER_ID, MEMBER_ID, [
          { field_id: 'f-shirt', value: 'M' },
          { field_id: 'f-shirt', value: 'L' },
        ]),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
