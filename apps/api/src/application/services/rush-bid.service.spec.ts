import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { RushBidService, hashToken } from './rush-bid.service';
import type { RushSettingsService } from './rush-settings.service';
import type { InviteService } from './invite.service';
import type {
  IRushBidRepository,
  RushBidConfirmation,
  RushBidTransition,
} from '#domain/repositories/rush-bid.repository.interface';
import type { IRushPipelineRepository } from '#domain/repositories/rush-pipeline.repository.interface';
import type { IUserRepository } from '#domain/repositories/user.repository.interface';
import type { IChapterRepository } from '#domain/repositories/chapter.repository.interface';
import type { IEmailProvider } from '#domain/adapters/email.interface';
import type { RushCandidateRow } from '#domain/entities/rush-candidate.entity';

const CHAPTER = 'ch-1';
const MEMBER = 'member-1';
const OFFICER = 'officer-1';
const NOW = new Date('2026-11-24T15:00:00Z');
const LATER = new Date('2026-11-26T15:00:00Z');
const AFTER_EXPIRY = new Date('2026-12-02T15:00:00Z');

function row(over: Partial<RushCandidateRow> = {}): RushCandidateRow {
  return {
    id: 'cand-1',
    chapter_id: CHAPTER,
    display_name: 'Jake Smith',
    name_key: 'jake smith',
    user_id: null,
    stage: 'bid_ready',
    closed_reason: null,
    bid_status: 'none',
    bid_state: 'none',
    created_by: MEMBER,
    created_at: '2026-11-01T00:00:00Z',
    owner_id: null,
    last_contact_on: null,
    last_contact_by: null,
    follow_up_on: null,
    follow_up_note: null,
    follow_up_user_id: null,
    bid_extended_at: null,
    bid_extended_by: null,
    bid_expires_at: null,
    bid_acceptance_recorded_at: null,
    bid_acceptance_recorded_by: null,
    bid_answered_at: null,
    bid_answered_by: null,
    bid_answered_via: null,
    bid_rescind_reason: null,
    bid_invite_sent: null,
    ...over,
  };
}

/**
 * The bid columns in memory, applying each transition's compare-and-set the
 * way `SupabaseRushBidRepository` writes it: the `from` states, an open bid
 * by `now`, and a recorded acceptance or none.
 */
class FakeBids implements IRushBidRepository {
  candidate: RushCandidateRow = row();
  confirmation: RushBidConfirmation | null = null;

  transition(
    _id: string,
    _chapter: string,
    t: RushBidTransition,
  ): Promise<RushCandidateRow | null> {
    const c = this.candidate;
    const open = c.bid_expires_at === null || c.bid_expires_at > t.now;
    if (
      !t.from.includes(c.bid_state) ||
      (t.open && !open) ||
      (t.recorded === true && c.bid_acceptance_recorded_at === null) ||
      (t.recorded === false && c.bid_acceptance_recorded_at !== null)
    ) {
      return Promise.resolve(null);
    }
    const state = t.set.bid_state ?? c.bid_state;
    this.candidate = {
      ...c,
      ...t.set,
      bid_status:
        state === 'extended' || state === 'accepted' ? 'extended' : 'none',
    };
    return Promise.resolve(this.candidate);
  }

  saveConfirmation(r: {
    candidateId: string;
    chapterId: string;
    email: string | null;
    tokenHash: string | null;
  }): Promise<void> {
    this.confirmation = {
      candidate_id: r.candidateId,
      chapter_id: r.chapterId,
      email: r.email,
      token_hash: r.tokenHash,
      emailed_at: null,
      created_at: NOW.toISOString(),
    };
    return Promise.resolve();
  }

  markConfirmationEmailed(_c: string, _ch: string, at: string): Promise<void> {
    if (this.confirmation) this.confirmation.emailed_at = at;
    return Promise.resolve();
  }

  setInviteSent(
    _c: string,
    _ch: string,
    sent: boolean,
  ): Promise<RushCandidateRow | null> {
    if (this.candidate.bid_state !== 'accepted') return Promise.resolve(null);
    this.candidate = { ...this.candidate, bid_invite_sent: sent };
    return Promise.resolve(this.candidate);
  }

  findConfirmation(): Promise<RushBidConfirmation | null> {
    return Promise.resolve(this.confirmation);
  }

  findConfirmationByTokenHash(
    hash: string,
  ): Promise<RushBidConfirmation | null> {
    return Promise.resolve(
      this.confirmation?.token_hash === hash ? this.confirmation : null,
    );
  }

  deleteConfirmation(): Promise<void> {
    this.confirmation = null;
    return Promise.resolve();
  }

  candidatesWithConfirmationEmail(): Promise<Set<string>> {
    return Promise.resolve(
      new Set(
        this.confirmation?.emailed_at ? [this.confirmation.candidate_id] : [],
      ),
    );
  }
}

describe('RushBidService (#5973)', () => {
  let bids: FakeBids;
  let email: { sendBidConfirmEmail: jest.Mock };
  let invites: { createForAcceptedProspect: jest.Mock };
  let settings: { bidExpiryDays: jest.Mock; newMemberRoleId: jest.Mock };
  let service: RushBidService;

  beforeEach(() => {
    bids = new FakeBids();
    email = { sendBidConfirmEmail: jest.fn().mockResolvedValue(true) };
    invites = { createForAcceptedProspect: jest.fn().mockResolvedValue(true) };
    settings = {
      bidExpiryDays: jest.fn().mockResolvedValue(7),
      newMemberRoleId: jest.fn().mockResolvedValue('role-new-member'),
    };
    const pipelineRepo = {
      findCandidate: jest.fn(() => Promise.resolve(bids.candidate)),
    };
    const users = {
      findById: jest.fn((id: string) =>
        Promise.resolve({
          id,
          email: id === MEMBER ? 'chris@rpi.edu' : 'Linked@RPI.edu',
          display_name: id,
        }),
      ),
      findByIds: jest.fn((ids: string[]) =>
        Promise.resolve(
          ids.map((id) => ({
            id,
            display_name: id === MEMBER ? 'Chris' : 'Dana',
          })),
        ),
      ),
    };
    const chapters = {
      findById: jest.fn().mockResolvedValue({ id: CHAPTER, name: 'FIJI' }),
    };
    const config = {
      get: jest.fn(() => 'https://app.frapp.live'),
    };
    service = new RushBidService(
      bids,
      pipelineRepo as unknown as IRushPipelineRepository,
      users as unknown as IUserRepository,
      chapters as unknown as IChapterRepository,
      email as unknown as IEmailProvider,
      settings as unknown as RushSettingsService,
      invites as unknown as InviteService,
      config as unknown as ConfigService,
    );
  });

  async function extended() {
    await service.extend('cand-1', CHAPTER, MEMBER, NOW);
  }

  describe('extend', () => {
    it("opens a bid for the chapter's bid days, keeping bid_status in step", async () => {
      settings.bidExpiryDays.mockResolvedValue(3);
      const after = await service.extend('cand-1', CHAPTER, MEMBER, NOW);
      expect(after).toMatchObject({
        bid_state: 'extended',
        bid_status: 'extended',
        bid_extended_by: MEMBER,
        bid_extended_at: NOW.toISOString(),
        bid_expires_at: '2026-11-27T15:00:00.000Z',
        stage: 'bid_ready',
      });
    });

    it('extends again after an expiry', async () => {
      bids.candidate = row({ bid_state: 'expired' });
      await expect(
        service.extend('cand-1', CHAPTER, MEMBER, NOW),
      ).resolves.toMatchObject({ bid_state: 'extended' });
    });

    it.each([
      ['extended', 'A bid is already out to this prospect'],
      ['accepted', 'This prospect already accepted'],
      ['declined', 'This prospect declined the bid'],
      ['rescinded', 'This bid was rescinded'],
    ] as const)(
      'refuses from %s with 409, so an old card can not undo an answer',
      async (state, message) => {
        bids.candidate = row({
          bid_state: state,
          bid_status:
            state === 'extended' || state === 'accepted' ? 'extended' : 'none',
        });
        await expect(
          service.extend('cand-1', CHAPTER, MEMBER, NOW),
        ).rejects.toThrow(new ConflictException(message));
        expect(bids.candidate.bid_state).toBe(state);
      },
    );

    it('refuses a bid to yourself', async () => {
      bids.candidate = row({ user_id: MEMBER });
      await expect(
        service.extend('cand-1', CHAPTER, MEMBER, NOW),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('record a decline', () => {
    it('answers the bid, recorded by the member', async () => {
      await extended();
      const view = await service.recordDecline(
        'cand-1',
        CHAPTER,
        MEMBER,
        LATER,
      );
      expect(view).toMatchObject({
        bid_state: 'declined',
        bid_answered_by_name: 'Chris',
        bid_answered_via: 'member',
      });
      expect(bids.candidate.bid_status).toBe('none');
    });

    it('is 409 with no open bid, and once the bid has expired', async () => {
      await expect(
        service.recordDecline('cand-1', CHAPTER, MEMBER, LATER),
      ).rejects.toThrow(
        new ConflictException('No bid is out to this prospect'),
      );
      await extended();
      await expect(
        service.recordDecline('cand-1', CHAPTER, MEMBER, AFTER_EXPIRY),
      ).rejects.toThrow(new ConflictException('This bid has expired'));
    });
  });

  describe('record an acceptance', () => {
    it('stays extended, waiting, and emails the PNM a one-tap link at once', async () => {
      await extended();
      const view = await service.recordAcceptance(
        'cand-1',
        CHAPTER,
        MEMBER,
        ' Jake@RPI.edu ',
        LATER,
      );
      expect(view).toMatchObject({
        bid_state: 'extended',
        bid_acceptance_recorded_at: LATER.toISOString(),
        bid_acceptance_recorded_by_name: 'Chris',
        bid_confirm_emailed: true,
      });
      // The shipped card still reads a bid out; nothing reaches anyone else.
      expect(bids.candidate.bid_status).toBe('extended');
      expect(bids.confirmation?.email).toBe('jake@rpi.edu');
      const sent = email.sendBidConfirmEmail.mock.calls[0][0] as {
        to: string;
        confirmUrl: string;
        chapterName: string;
        recorderName: string;
        expiresInDays: number;
      };
      // Days, not a date: the PNM's time zone isn't known (finding: a UTC
      // date read a day late in the Americas).
      expect(sent).toMatchObject({
        to: 'jake@rpi.edu',
        chapterName: 'FIJI',
        recorderName: 'Chris',
        expiresInDays: 5,
      });
      // The token rides in the fragment, and only its hash is stored.
      const url = new URL(sent.confirmUrl);
      expect(url.pathname).toBe('/recruitment/confirm');
      expect(url.search).toBe('');
      expect(bids.confirmation?.token_hash).toBe(hashToken(url.hash.slice(1)));
      expect(bids.confirmation?.emailed_at).toBe(LATER.toISOString());
      expect(invites.createForAcceptedProspect).not.toHaveBeenCalled();
    });

    it('says not emailed, and keeps no sent mark, when the send fails', async () => {
      email.sendBidConfirmEmail.mockResolvedValue(false);
      await extended();
      const view = await service.recordAcceptance(
        'cand-1',
        CHAPTER,
        MEMBER,
        'jake@rpi.edu',
        LATER,
      );
      expect(view.bid_confirm_emailed).toBe(false);
      expect(bids.confirmation?.emailed_at).toBeNull();
      await expect(bids.candidatesWithConfirmationEmail()).resolves.toEqual(
        new Set(),
      );
    });

    it("refuses the recorder's own address, whose link would let them confirm alone", async () => {
      await extended();
      await expect(
        service.recordAcceptance(
          'cand-1',
          CHAPTER,
          MEMBER,
          'Chris@RPI.edu',
          LATER,
        ),
      ).rejects.toThrow("That's your own email");
      expect(bids.candidate.bid_acceptance_recorded_at).toBeNull();
    });

    it('takes the email back off, and sends nothing, when the bid was answered meanwhile', async () => {
      await extended();
      const save = bids.saveConfirmation.bind(bids);
      jest.spyOn(bids, 'saveConfirmation').mockImplementation(async (r) => {
        // A decline lands between the recording and the save.
        bids.candidate = { ...bids.candidate, bid_state: 'declined' };
        await save(r);
      });
      await expect(
        service.recordAcceptance(
          'cand-1',
          CHAPTER,
          MEMBER,
          'jake@rpi.edu',
          LATER,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(bids.confirmation).toBeNull();
      expect(email.sendBidConfirmEmail).not.toHaveBeenCalled();
    });

    it("uses a linked member's account email when none is typed", async () => {
      bids.candidate = row({ user_id: 'linked-user' });
      await extended();
      await service.recordAcceptance('cand-1', CHAPTER, MEMBER, null, LATER);
      expect(bids.confirmation?.email).toBe('linked@rpi.edu');
    });

    it('with no email sends nothing, and leaves it to rush:manage', async () => {
      await extended();
      const view = await service.recordAcceptance(
        'cand-1',
        CHAPTER,
        MEMBER,
        undefined,
        LATER,
      );
      expect(view.bid_confirm_emailed).toBe(false);
      expect(email.sendBidConfirmEmail).not.toHaveBeenCalled();
      expect(bids.confirmation).toMatchObject({
        email: null,
        token_hash: null,
      });
    });

    it('refuses a bad email, a second recording and no open bid', async () => {
      await expect(
        service.recordAcceptance('cand-1', CHAPTER, MEMBER, null, LATER),
      ).rejects.toBeInstanceOf(ConflictException);
      await extended();
      await expect(
        service.recordAcceptance('cand-1', CHAPTER, MEMBER, 'nope', LATER),
      ).rejects.toBeInstanceOf(BadRequestException);
      await service.recordAcceptance('cand-1', CHAPTER, MEMBER, null, LATER);
      await expect(
        service.recordAcceptance('cand-1', CHAPTER, OFFICER, null, LATER),
      ).rejects.toThrow(
        new ConflictException(
          'An acceptance is already recorded and waiting to be confirmed',
        ),
      );
    });
  });

  describe('confirm', () => {
    it('by rush:manage: accepted, and the PNM invited with the new-member role', async () => {
      await extended();
      await service.recordAcceptance(
        'cand-1',
        CHAPTER,
        MEMBER,
        'jake@rpi.edu',
        LATER,
      );
      const view = await service.confirm('cand-1', CHAPTER, OFFICER, LATER);
      expect(view).toMatchObject({
        bid_state: 'accepted',
        bid_answered_by_name: 'Dana',
        bid_answered_via: 'member',
        invite_sent: true,
      });
      // Sent as from the confirmer first, then the recorder and extender:
      // the first the invite rules let invite into the role.
      expect(invites.createForAcceptedProspect).toHaveBeenCalledWith({
        chapterId: CHAPTER,
        senders: [OFFICER, MEMBER, MEMBER],
        roleId: 'role-new-member',
        email: 'jake@rpi.edu',
      });
      // The email is gone once the bid is answered, and the invite noted.
      expect(bids.confirmation).toBeNull();
      expect(bids.candidate).toMatchObject({
        bid_status: 'extended',
        bid_invite_sent: true,
      });
    });

    it('accepts and deletes the email even when the invite step throws', async () => {
      await extended();
      await service.recordAcceptance(
        'cand-1',
        CHAPTER,
        MEMBER,
        'jake@rpi.edu',
        LATER,
      );
      settings.newMemberRoleId.mockRejectedValue(new Error('read failed'));
      await expect(
        service.confirm('cand-1', CHAPTER, OFFICER, LATER),
      ).resolves.toMatchObject({ bid_state: 'accepted', invite_sent: false });
      expect(bids.confirmation).toBeNull();
      expect(bids.candidate.bid_invite_sent).toBe(false);
    });

    it('with no email accepts, sending no invite', async () => {
      await extended();
      await service.recordAcceptance('cand-1', CHAPTER, MEMBER, null, LATER);
      const view = await service.confirm('cand-1', CHAPTER, OFFICER, LATER);
      expect(view).toMatchObject({ bid_state: 'accepted', invite_sent: false });
      expect(invites.createForAcceptedProspect).not.toHaveBeenCalled();
    });

    it('is 409 with nothing recorded, and after the bid expired', async () => {
      await extended();
      await expect(
        service.confirm('cand-1', CHAPTER, OFFICER, LATER),
      ).rejects.toThrow(
        new ConflictException('No acceptance is recorded on this bid'),
      );
      await service.recordAcceptance('cand-1', CHAPTER, MEMBER, null, LATER);
      await expect(
        service.confirm('cand-1', CHAPTER, OFFICER, AFTER_EXPIRY),
      ).rejects.toThrow(new ConflictException('This bid has expired'));
    });
  });

  describe("the PNM's one tap", () => {
    async function recorded(): Promise<string> {
      await extended();
      await service.recordAcceptance(
        'cand-1',
        CHAPTER,
        MEMBER,
        'jake@rpi.edu',
        LATER,
      );
      const sent = email.sendBidConfirmEmail.mock.calls[0][0] as {
        confirmUrl: string;
      };
      return new URL(sent.confirmUrl).hash.slice(1);
    }

    it('previews without confirming, then confirms on the tap', async () => {
      const token = await recorded();
      await expect(service.previewByToken(token)).resolves.toEqual({
        chapter_name: 'FIJI',
        recorded_by_name: 'Chris',
        expires_at: '2026-12-01T15:00:00.000Z',
        status: 'waiting',
      });
      expect(bids.candidate.bid_state).toBe('extended');

      await expect(service.confirmByToken(token, LATER)).resolves.toMatchObject(
        { status: 'confirmed', invite_sent: true },
      );
      expect(bids.candidate).toMatchObject({
        bid_state: 'accepted',
        bid_answered_by: null,
        bid_answered_via: 'pnm',
      });
      // No confirmer on the PNM's tap: the recorder, then the extender.
      expect(invites.createForAcceptedProspect).toHaveBeenCalledWith(
        expect.objectContaining({
          senders: [MEMBER, MEMBER],
          email: 'jake@rpi.edu',
        }),
      );
      // A second tap finds nothing.
      await expect(service.confirmByToken(token, LATER)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('confirms nothing once the bid was declined or rescinded', async () => {
      const token = await recorded();
      await service.rescind(
        'cand-1',
        CHAPTER,
        OFFICER,
        'Changed our mind',
        LATER,
      );
      await expect(service.confirmByToken(token, LATER)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(bids.candidate.bid_state).toBe('rescinded');
    });

    it('says closed, and changes nothing, once the day has passed', async () => {
      const token = await recorded();
      await expect(
        service.confirmByToken(token, AFTER_EXPIRY),
      ).resolves.toMatchObject({ status: 'closed' });
      expect(bids.candidate.bid_state).toBe('extended');
    });

    it('is the same 404 for a token nobody was sent', async () => {
      await recorded();
      await expect(
        service.previewByToken('x'.repeat(43)),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('rescind', () => {
    it('takes back an open bid with its reason, and drops a waiting email', async () => {
      await extended();
      await service.recordAcceptance(
        'cand-1',
        CHAPTER,
        MEMBER,
        'jake@rpi.edu',
        LATER,
      );
      const view = await service.rescind(
        'cand-1',
        CHAPTER,
        OFFICER,
        '  Grades came back  ',
        LATER,
      );
      expect(view).toMatchObject({
        bid_state: 'rescinded',
        bid_rescind_reason: 'Grades came back',
        bid_acceptance_recorded_at: null,
      });
      expect(bids.confirmation).toBeNull();
    });

    it('refuses a bid whose day has passed, as every action does', async () => {
      await extended();
      await expect(
        service.rescind('cand-1', CHAPTER, OFFICER, 'Too late', AFTER_EXPIRY),
      ).rejects.toThrow(new ConflictException('This bid has expired'));
    });

    it('needs a reason', async () => {
      await extended();
      await expect(
        service.rescind('cand-1', CHAPTER, OFFICER, '   ', LATER),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
