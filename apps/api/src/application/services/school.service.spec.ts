import { HttpException } from '@nestjs/common';
import {
  SCHOOL_CODE_LENGTH,
  SCHOOL_CODE_MAX_ATTEMPTS,
  SCHOOL_CODE_RESEND_SECONDS,
  SCHOOL_CODE_TTL_SECONDS,
  SCHOOL_CODE_WINDOW_SECONDS,
  SCHOOL_CODES_PER_ACCOUNT,
  SCHOOL_CODES_PER_ADDRESS,
  SCHOOL_CODES_PER_IP,
  SCHOOL_REFUSAL,
  SCHOOL_STEP_COPY,
} from '@repo/validation';
import type { IEmailProvider } from '#domain/adapters/email.interface';
import type { ISchoolRepository } from '#domain/repositories/school.repository.interface';
import type { School, SchoolMember } from '#domain/entities/school.entity';
import {
  SchoolService,
  hashSchoolCode,
  hashSchoolCodeIp,
} from './school.service';

const SCHOOL_ID = '9dbf89e9-f9eb-4705-8f12-4b24b5577b80';
const USER_ID = 'user-1';

function school(overrides: Partial<School> = {}): School {
  return {
    id: SCHOOL_ID,
    name: 'Rensselaer Polytechnic Institute',
    short_name: 'RPI',
    aliases: ['Rensselaer'],
    status: 'verified',
    directory_university: 'Rensselaer Polytechnic Institute',
    created_by: null,
    created_at: '2026-11-23T00:00:00Z',
    updated_at: '2026-11-23T00:00:00Z',
    ...overrides,
  };
}

function membership(overrides: Partial<SchoolMember> = {}): SchoolMember {
  return {
    id: 'm-1',
    school_id: SCHOOL_ID,
    user_id: USER_ID,
    status: 'member',
    verified_via: 'email_code',
    verified_email: 'student@rpi.edu',
    verified_at: '2026-11-23T00:00:00Z',
    directory_visibility: 'hidden',
    left_at: null,
    created_at: '2026-11-23T00:00:00Z',
    ...overrides,
  };
}

/** The refusal's body, from whatever the promise rejected with. */
async function refusal(promise: Promise<unknown>) {
  const error = await promise.then(
    () => {
      throw new Error('expected a refusal');
    },
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(HttpException);
  const http = error as HttpException;
  return {
    status: http.getStatus(),
    body: http.getResponse() as {
      code: string;
      message: string;
      [key: string]: unknown;
    },
  };
}

describe('SchoolService', () => {
  let repo: jest.Mocked<ISchoolRepository>;
  let email: jest.Mocked<IEmailProvider>;
  let service: SchoolService;

  beforeEach(() => {
    repo = {
      search: jest.fn().mockResolvedValue([]),
      findById: jest.fn().mockResolvedValue(school()),
      findByIds: jest.fn().mockResolvedValue([school()]),
      findCurrentSlugs: jest
        .fn()
        .mockResolvedValue(new Map([[SCHOOL_ID, 'rpi']])),
      findVerifiedDomains: jest
        .fn()
        .mockResolvedValue(new Map([[SCHOOL_ID, ['rpi.edu']]])),
      findLiveMembershipsByUser: jest.fn().mockResolvedValue([]),
      findLiveMembership: jest.fn().mockResolvedValue(membership()),
      findLatestVerification: jest.fn().mockResolvedValue({
        id: 'v-1',
        email: 'student@rpi.edu',
        code_salt: 'salt',
        expires_at: '2026-11-23T00:10:00Z',
      }),
      startVerification: jest.fn().mockResolvedValue({
        ok: true,
        id: 'v-1',
        expires_at: '2026-11-23T00:10:00Z',
      }),
      confirmVerification: jest
        .fn()
        .mockResolvedValue({ ok: true, member_id: 'm-1' }),
      discardVerification: jest.fn().mockResolvedValue(undefined),
      findSchoolIdForDirectoryRow: jest.fn().mockResolvedValue(SCHOOL_ID),
      proposeChapterLink: jest.fn().mockResolvedValue(undefined),
    };
    email = {
      sendInviteEmail: jest.fn().mockResolvedValue(true),
      sendSchoolCodeEmail: jest.fn().mockResolvedValue(true),
      sendBidConfirmEmail: jest.fn().mockResolvedValue(true),
    };
    service = new SchoolService(repo, email);
  });

  describe('search', () => {
    it('asks nothing for under two characters', async () => {
      await expect(service.search(' r ')).resolves.toEqual([]);
      expect(repo.search).not.toHaveBeenCalled();
    });

    it('passes the trimmed query and the cap', async () => {
      await service.search('  rens ');
      expect(repo.search).toHaveBeenCalledWith('rens', 20);
    });
  });

  describe('startVerification', () => {
    it('emails a six-digit code and stores only its salted hash', async () => {
      const sent = await service.startVerification(
        USER_ID,
        SCHOOL_ID,
        '  Student@RPI.edu ',
        '203.0.113.9',
      );

      const call = repo.startVerification.mock.calls[0][0];
      const mail = email.sendSchoolCodeEmail.mock.calls[0][0];
      expect(mail.code).toMatch(new RegExp(`^\\d{${SCHOOL_CODE_LENGTH}}$`));
      expect(mail).toMatchObject({
        to: 'student@rpi.edu',
        schoolName: 'Rensselaer Polytechnic Institute',
        validMinutes: SCHOOL_CODE_TTL_SECONDS / 60,
      });
      expect(call.codeHash).toBe(hashSchoolCode(call.codeSalt, mail.code));
      expect(JSON.stringify(call)).not.toContain(mail.code);
      expect(call).toMatchObject({
        userId: USER_ID,
        schoolId: SCHOOL_ID,
        email: 'student@rpi.edu',
        ipHash: hashSchoolCodeIp('203.0.113.9'),
        ttlSeconds: SCHOOL_CODE_TTL_SECONDS,
        windowSeconds: SCHOOL_CODE_WINDOW_SECONDS,
        maxPerAddress: SCHOOL_CODES_PER_ADDRESS,
        maxPerIp: SCHOOL_CODES_PER_IP,
        maxPerAccount: SCHOOL_CODES_PER_ACCOUNT,
        cooldownSeconds: SCHOOL_CODE_RESEND_SECONDS,
      });
      expect(call.ipHash).not.toContain('203.0.113.9');
      expect(sent).toEqual({
        email: 'student@rpi.edu',
        expires_at: '2026-11-23T00:10:00Z',
        resend_after_seconds: SCHOOL_CODE_RESEND_SECONDS,
      });
    });

    it("refuses a school that can't verify students yet, before anything is written", async () => {
      repo.findVerifiedDomains.mockResolvedValue(new Map());

      const { status, body } = await refusal(
        service.startVerification(USER_ID, SCHOOL_ID, 'a@rpi.edu', undefined),
      );

      expect(status).toBe(409);
      expect(body).toMatchObject({
        code: SCHOOL_REFUSAL.unavailable,
        message: SCHOOL_STEP_COPY.notSetUp,
      });
      expect(repo.startVerification).not.toHaveBeenCalled();
      expect(email.sendSchoolCodeEmail).not.toHaveBeenCalled();
    });

    it('refuses an unverified school the same way, domains or not', async () => {
      repo.findById.mockResolvedValue(school({ status: 'unverified' }));

      const { status } = await refusal(
        service.startVerification(USER_ID, SCHOOL_ID, 'a@rpi.edu', undefined),
      );

      expect(status).toBe(409);
    });

    it('answers 404 for a school that is unknown or suspended', async () => {
      repo.findById.mockResolvedValueOnce(null);
      expect(
        (
          await refusal(
            service.startVerification(
              USER_ID,
              SCHOOL_ID,
              'a@rpi.edu',
              undefined,
            ),
          )
        ).body.code,
      ).toBe(SCHOOL_REFUSAL.notFound);

      repo.findById.mockResolvedValueOnce(school({ status: 'suspended' }));
      expect(
        (
          await refusal(
            service.startVerification(
              USER_ID,
              SCHOOL_ID,
              'a@rpi.edu',
              undefined,
            ),
          )
        ).status,
      ).toBe(404);
    });

    it('refuses an address on another domain with the domains to use', async () => {
      repo.startVerification.mockResolvedValue({
        ok: false,
        reason: 'wrong_domain',
      });

      const { status, body } = await refusal(
        service.startVerification(USER_ID, SCHOOL_ID, 'a@gmail.com', undefined),
      );

      expect(status).toBe(400);
      expect(body).toEqual({
        code: SCHOOL_REFUSAL.wrongDomain,
        message:
          'Use your Rensselaer Polytechnic Institute email, ending in @rpi.edu.',
      });
      expect(email.sendSchoolCodeEmail).not.toHaveBeenCalled();
    });

    it('says how long to wait inside the resend minute', async () => {
      repo.startVerification.mockResolvedValue({
        ok: false,
        reason: 'cooldown',
        retry_after_seconds: 42,
      });

      const { status, body } = await refusal(
        service.startVerification(USER_ID, SCHOOL_ID, 'a@rpi.edu', undefined),
      );

      expect(status).toBe(429);
      expect(body).toMatchObject({
        code: SCHOOL_REFUSAL.cooldown,
        message: 'Too many codes asked for. Try again in 42 seconds.',
      });
    });

    it.each(['address_limit', 'ip_limit', 'account_limit'] as const)(
      'answers %s with one 429 that names no ceiling',
      async (reason) => {
        repo.startVerification.mockResolvedValue({
          ok: false,
          reason,
          retry_after_seconds: 1500,
        });

        const { status, body } = await refusal(
          service.startVerification(USER_ID, SCHOOL_ID, 'a@rpi.edu', undefined),
        );

        expect(status).toBe(429);
        expect(body.code).toBe(SCHOOL_REFUSAL.rateLimited);
        expect(body.message).toBe(
          'Too many codes asked for. Try again in 25 minutes.',
        );
        expect(email.sendSchoolCodeEmail).not.toHaveBeenCalled();
      },
    );

    it('answers 503 when the email did not go out, and discards the unsent code', async () => {
      email.sendSchoolCodeEmail.mockResolvedValue(false);

      const { status, body } = await refusal(
        service.startVerification(USER_ID, SCHOOL_ID, 'a@rpi.edu', undefined),
      );

      expect(status).toBe(503);
      expect(body.code).toBe(SCHOOL_REFUSAL.sendFailed);
      // Neither spends the ceilings nor hides the code already sent.
      expect(repo.discardVerification).toHaveBeenCalledWith(USER_ID, 'v-1');
    });

    it.each(['"a@rpi.edu@x"@evil.com', 'a b@rpi.edu', 'a@rpi'])(
      'refuses %s, which is not a plain address, before anything is written',
      async (address) => {
        const { status, body } = await refusal(
          service.startVerification(USER_ID, SCHOOL_ID, address, undefined),
        );

        expect(status).toBe(400);
        expect(body).toEqual({
          code: SCHOOL_REFUSAL.invalidEmail,
          message: SCHOOL_STEP_COPY.notAnEmail,
        });
        expect(repo.startVerification).not.toHaveBeenCalled();
        expect(email.sendSchoolCodeEmail).not.toHaveBeenCalled();
      },
    );

    it('skips only the IP ceiling when there is no IP', async () => {
      await service.startVerification(USER_ID, SCHOOL_ID, 'a@rpi.edu', '');
      expect(repo.startVerification.mock.calls[0][0].ipHash).toBeNull();
    });
  });

  describe('confirmVerification', () => {
    it("hashes the typed code with the open code's salt and returns the school", async () => {
      const mine = await service.confirmVerification(
        USER_ID,
        SCHOOL_ID,
        ' 123456 ',
      );

      expect(repo.confirmVerification).toHaveBeenCalledWith({
        userId: USER_ID,
        schoolId: SCHOOL_ID,
        verificationId: 'v-1',
        codeHash: hashSchoolCode('salt', '123456'),
        maxAttempts: SCHOOL_CODE_MAX_ATTEMPTS,
      });
      expect(mine).toEqual({
        school: {
          id: SCHOOL_ID,
          name: 'Rensselaer Polytechnic Institute',
          short_name: 'RPI',
          slug: 'rpi',
          verifiable: true,
          email_domains: ['rpi.edu'],
        },
        status: 'member',
        verified_email: 'student@rpi.edu',
        verified_at: '2026-11-23T00:00:00Z',
      });
    });

    it('asks for a code first when none is open', async () => {
      repo.findLatestVerification.mockResolvedValue(null);

      const { status, body } = await refusal(
        service.confirmVerification(USER_ID, SCHOOL_ID, '123456'),
      );

      expect(status).toBe(400);
      expect(body.code).toBe(SCHOOL_REFUSAL.noCode);
      expect(repo.confirmVerification).not.toHaveBeenCalled();
    });

    it.each([
      ['wrong_code', 400, SCHOOL_REFUSAL.wrongCode],
      ['expired', 400, SCHOOL_REFUSAL.expired],
      ['too_many_attempts', 429, SCHOOL_REFUSAL.tooManyAttempts],
      ['address_taken', 409, SCHOOL_REFUSAL.emailTaken],
      ['school_not_verifiable', 409, SCHOOL_REFUSAL.unavailable],
      ['no_code', 400, SCHOOL_REFUSAL.noCode],
    ] as const)('answers %s with %d %s', async (reason, status, code) => {
      repo.confirmVerification.mockResolvedValue({
        ok: false,
        reason,
        attempts_left: 3,
      });

      const answer = await refusal(
        service.confirmVerification(USER_ID, SCHOOL_ID, '000000'),
      );

      expect(answer.status).toBe(status);
      expect(answer.body.code).toBe(code);
      expect(answer.body.message).toMatch(/^[A-Z]/);
    });
  });

  it('answers the written membership when the read-back misses, rather than an error', async () => {
    repo.findLiveMembership.mockResolvedValue(null);

    const mine = await service.confirmVerification(
      USER_ID,
      SCHOOL_ID,
      '123456',
    );

    expect(mine).toMatchObject({
      school: { id: SCHOOL_ID },
      status: 'member',
      verified_email: 'student@rpi.edu',
    });
  });

  describe('listMine', () => {
    it('asks nothing more when the person has no school', async () => {
      await expect(service.listMine(USER_ID)).resolves.toEqual([]);
      expect(repo.findByIds).not.toHaveBeenCalled();
    });

    it('returns each live membership with its school', async () => {
      repo.findLiveMembershipsByUser.mockResolvedValue([membership()]);

      const [mine] = await service.listMine(USER_ID);

      expect(repo.findLiveMembershipsByUser).toHaveBeenCalledWith(USER_ID);
      expect(mine.school).toMatchObject({ slug: 'rpi', verifiable: true });
    });
  });

  describe('proposeLinkFromDirectory', () => {
    it("proposes the row's school for the chapter", async () => {
      await expect(
        service.proposeLinkFromDirectory('ch-1', 'dir-1', USER_ID),
      ).resolves.toBe(SCHOOL_ID);
      expect(repo.proposeChapterLink).toHaveBeenCalledWith(
        SCHOOL_ID,
        'ch-1',
        USER_ID,
      );
    });

    it('proposes nothing when the row has no school', async () => {
      repo.findSchoolIdForDirectoryRow.mockResolvedValue(null);

      await expect(
        service.proposeLinkFromDirectory('ch-1', 'dir-1', USER_ID),
      ).resolves.toBeNull();
      expect(repo.proposeChapterLink).not.toHaveBeenCalled();
    });
  });
});
