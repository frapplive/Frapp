import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import {
  RUSH_BID_RESCIND_REASON_MAX,
  assertHttpsJoinOrigin,
  canExtendRushBid,
} from '@repo/validation';
import { RUSH_BID_REPOSITORY } from '#domain/repositories/rush-bid.repository.interface';
import type {
  IRushBidRepository,
  RushBidTransition,
} from '#domain/repositories/rush-bid.repository.interface';
import { RUSH_PIPELINE_REPOSITORY } from '#domain/repositories/rush-pipeline.repository.interface';
import type { IRushPipelineRepository } from '#domain/repositories/rush-pipeline.repository.interface';
import { USER_REPOSITORY } from '#domain/repositories/user.repository.interface';
import type { IUserRepository } from '#domain/repositories/user.repository.interface';
import { CHAPTER_REPOSITORY } from '#domain/repositories/chapter.repository.interface';
import type { IChapterRepository } from '#domain/repositories/chapter.repository.interface';
import { EMAIL_PROVIDER } from '#domain/adapters/email.interface';
import type { IEmailProvider } from '#domain/adapters/email.interface';
import type {
  RushBidAnsweredVia,
  RushBidState,
  RushCandidateRow,
} from '#domain/entities/rush-candidate.entity';
import { resolveAppOrigin } from '../../infrastructure/email/invite-link.util';
import { logThrowable } from '../../infrastructure/observability/log-throwable';
import { InviteService } from './invite.service';
import { RushSettingsService } from './rush-settings.service';

/** A bid as a member reads it, with names in place of ids (#5973). */
export interface RushBidView {
  id: string;
  bid_state: RushBidState;
  bid_extended_at: string | null;
  bid_extended_by_name: string | null;
  bid_expires_at: string | null;
  /** A recorded acceptance waiting for confirmation, and who recorded it. */
  bid_acceptance_recorded_at: string | null;
  bid_acceptance_recorded_by_name: string | null;
  /**
   * Whether the PNM was emailed the one-tap confirmation. The address itself
   * never reaches a member (Winston, 2026-11-24).
   */
  bid_confirm_emailed: boolean;
  bid_answered_at: string | null;
  bid_answered_by_name: string | null;
  bid_answered_via: RushBidAnsweredVia | null;
  bid_rescind_reason: string | null;
}

/** A write's answer: the bid after, and what it sent. */
export interface RushBidResult extends RushBidView {
  /** On a confirmation: whether the accepted PNM's invite went out. */
  invite_sent?: boolean;
}

/** What the PNM's one-tap page shows before and after the tap. */
export interface RushBidConfirmationPreview {
  chapter_name: string;
  recorded_by_name: string | null;
  expires_at: string | null;
  /**
   * `waiting`: the tap confirms it. `confirmed`: it already was. `closed`:
   * the bid expired, was declined or was rescinded, so there is nothing to do.
   */
  status: 'waiting' | 'confirmed' | 'closed';
}

const NOT_FOUND = 'Candidate not found';

/** A link that matches no waiting confirmation, the same answer for any. */
const LINK_GONE = "This link doesn't work any more";

/** The path the emailed link opens, its token in the fragment. */
const RUSH_BID_CONFIRM_PATH = '/recruitment/confirm';

/**
 * A chapter's bids (#5973, `spec/behavior/ifc-recruitment.md` § Bids): extend,
 * record a decline, record an acceptance, confirm it, rescind, and expire.
 *
 * Every write is a compare-and-set on the bid's state (`IRushBidRepository`),
 * so two members acting on one bid at once can't both win, and an old chat
 * card's Extend can't undo an answer: Extend is taken only from `none` or
 * `expired`, anything else is 409.
 *
 * **A recorded acceptance waits** (Paul, #4218). Every member holds
 * `rush:bid` by default, and an acceptance reaches other chapters once the
 * master list exists, so one member's mistaken tap must not. It stays
 * `extended` until the PNM confirms it with one tap from the email sent at
 * once, or a `rush:manage` holder confirms it; a bid nobody confirms expires
 * as usual. The PNM's email is stored apart from the candidate, only to send
 * that link and the invite, and is deleted once the bid is answered.
 */
@Injectable()
export class RushBidService {
  private readonly logger = new Logger(RushBidService.name);

  constructor(
    @Inject(RUSH_BID_REPOSITORY) private readonly bidRepo: IRushBidRepository,
    @Inject(RUSH_PIPELINE_REPOSITORY)
    private readonly pipelineRepo: IRushPipelineRepository,
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    @Inject(CHAPTER_REPOSITORY)
    private readonly chapterRepo: IChapterRepository,
    @Inject(EMAIL_PROVIDER) private readonly emailProvider: IEmailProvider,
    private readonly settings: RushSettingsService,
    private readonly inviteService: InviteService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Extends a bid from `none` or `expired`, open for the chapter's bid days.
   * Doesn't move the stage (`rush.md` § Stages).
   */
  async extend(
    candidateId: string,
    chapterId: string,
    actorId: string,
    now: Date = new Date(),
  ): Promise<RushCandidateRow> {
    const candidate = await this.requireRow(candidateId, chapterId);
    if (candidate.user_id === actorId) {
      throw new ForbiddenException("You can't extend a bid to yourself");
    }
    if (!canExtendRushBid(candidate.bid_state)) {
      throw new ConflictException(alreadyAnswered(candidate.bid_state));
    }
    this.checkEligibility(candidate);
    const { bid_expiry_days: days } = await this.settings.get(chapterId);
    const at = now.toISOString();
    const row = await this.apply(candidateId, chapterId, {
      from: ['none', 'expired'],
      now: at,
      set: {
        bid_state: 'extended',
        bid_extended_at: at,
        bid_extended_by: actorId,
        bid_expires_at: new Date(
          now.getTime() + days * 24 * 60 * 60 * 1000,
        ).toISOString(),
        bid_acceptance_recorded_at: null,
        bid_acceptance_recorded_by: null,
        bid_answered_at: null,
        bid_answered_by: null,
        bid_answered_via: null,
        bid_rescind_reason: null,
      },
    });
    this.pushUp('extended', row);
    return row;
  }

  /** Records a decline the PNM gave on paper or in person. */
  async recordDecline(
    candidateId: string,
    chapterId: string,
    actorId: string,
    now: Date = new Date(),
  ): Promise<RushBidResult> {
    const candidate = await this.requireRow(candidateId, chapterId);
    this.refuseSelf(candidate, actorId);
    const at = now.toISOString();
    const row = await this.apply(candidateId, chapterId, {
      from: ['extended'],
      open: true,
      now: at,
      set: {
        bid_state: 'declined',
        bid_acceptance_recorded_at: null,
        bid_acceptance_recorded_by: null,
        bid_answered_at: at,
        bid_answered_by: actorId,
        bid_answered_via: 'member',
      },
    });
    await this.bidRepo.deleteConfirmation(candidateId, chapterId);
    this.pushUp('declined', row);
    return this.view(row, false);
  }

  /**
   * Records an acceptance the PNM gave on paper or in person. It stays
   * `extended`, "Waiting to confirm", until the PNM or a `rush:manage`
   * holder confirms it. With an email (the one typed, else a linked
   * member's account), the PNM is sent the one-tap link at once; without
   * one, only a `rush:manage` holder can confirm it.
   */
  async recordAcceptance(
    candidateId: string,
    chapterId: string,
    actorId: string,
    typedEmail: string | null | undefined,
    now: Date = new Date(),
  ): Promise<RushBidResult> {
    const candidate = await this.requireRow(candidateId, chapterId);
    this.refuseSelf(candidate, actorId);
    const email = await this.emailFor(candidate, typedEmail);
    const at = now.toISOString();
    const row = await this.apply(candidateId, chapterId, {
      from: ['extended'],
      open: true,
      recorded: false,
      now: at,
      set: {
        bid_acceptance_recorded_at: at,
        bid_acceptance_recorded_by: actorId,
      },
    });

    if (email === null) {
      await this.bidRepo.saveConfirmation({
        candidateId,
        chapterId,
        email: null,
        tokenHash: null,
      });
      return this.view(row, false);
    }
    const token = randomBytes(32).toString('base64url');
    await this.bidRepo.saveConfirmation({
      candidateId,
      chapterId,
      email,
      tokenHash: hashToken(token),
    });
    const emailed = await this.sendConfirmEmail(row, chapterId, email, token);
    return this.view(row, emailed);
  }

  /** A `rush:manage` holder confirms a recorded acceptance. */
  async confirm(
    candidateId: string,
    chapterId: string,
    actorId: string,
    now: Date = new Date(),
  ): Promise<RushBidResult> {
    const candidate = await this.requireRow(candidateId, chapterId);
    this.refuseSelf(candidate, actorId);
    return this.accept(candidate, chapterId, actorId, 'member', now);
  }

  /** What the emailed link's page shows. Anything unknown is 404, alike. */
  async previewByToken(
    token: string,
    now: Date = new Date(),
  ): Promise<RushBidConfirmationPreview> {
    const confirmation = await this.bidRepo.findConfirmationByTokenHash(
      hashToken(token),
    );
    if (!confirmation) throw new NotFoundException(LINK_GONE);
    const candidate = await this.pipelineRepo.findCandidate(
      confirmation.candidate_id,
      confirmation.chapter_id,
    );
    if (!candidate) throw new NotFoundException(LINK_GONE);
    const [chapter, names] = await Promise.all([
      this.chapterRepo.findById(confirmation.chapter_id),
      this.names([candidate.bid_acceptance_recorded_by]),
    ]);
    const open =
      candidate.bid_state === 'extended' &&
      candidate.bid_acceptance_recorded_at !== null &&
      !expired(candidate, now);
    return {
      chapter_name: chapter?.name ?? 'The chapter',
      recorded_by_name: nameOf(names, candidate.bid_acceptance_recorded_by),
      expires_at: candidate.bid_expires_at,
      status: open ? 'waiting' : 'closed',
    };
  }

  /**
   * The PNM's one tap from the emailed link. The token is the credential:
   * only the PNM's inbox has it. A confirmed bid's row is gone, so a second
   * tap reads as `LINK_GONE`, and the page says it was already confirmed
   * from its own first answer.
   */
  async confirmByToken(
    token: string,
    now: Date = new Date(),
  ): Promise<RushBidConfirmationPreview> {
    const confirmation = await this.bidRepo.findConfirmationByTokenHash(
      hashToken(token),
    );
    if (!confirmation) throw new NotFoundException(LINK_GONE);
    const candidate = await this.pipelineRepo.findCandidate(
      confirmation.candidate_id,
      confirmation.chapter_id,
    );
    if (!candidate) throw new NotFoundException(LINK_GONE);
    const preview = await this.previewByToken(token, now);
    if (preview.status !== 'waiting') return preview;
    await this.accept(candidate, confirmation.chapter_id, null, 'pnm', now);
    return { ...preview, status: 'confirmed' };
  }

  /** A `rush:manage` holder takes back an open bid, with a reason. */
  async rescind(
    candidateId: string,
    chapterId: string,
    actorId: string,
    reason: string,
    now: Date = new Date(),
  ): Promise<RushBidResult> {
    const clean = (reason ?? '').trim();
    if (clean.length === 0) {
      throw new BadRequestException('Say why the bid is rescinded');
    }
    if (clean.length > RUSH_BID_RESCIND_REASON_MAX) {
      throw new BadRequestException(
        `A reason can be up to ${RUSH_BID_RESCIND_REASON_MAX} characters`,
      );
    }
    const candidate = await this.requireRow(candidateId, chapterId);
    this.refuseSelf(candidate, actorId);
    const at = now.toISOString();
    const row = await this.apply(candidateId, chapterId, {
      from: ['extended'],
      now: at,
      set: {
        bid_state: 'rescinded',
        bid_acceptance_recorded_at: null,
        bid_acceptance_recorded_by: null,
        bid_answered_at: at,
        bid_answered_by: actorId,
        bid_answered_via: 'member',
        bid_rescind_reason: clean,
      },
    });
    await this.bidRepo.deleteConfirmation(candidateId, chapterId);
    this.pushUp('rescinded', row);
    return this.view(row, false);
  }

  /**
   * Confirms a recorded acceptance, then runs its effects: the accepted
   * PNM's invite, carrying the chapter's new-member role, to the email kept
   * for it, and the email's deletion. `actorId` is null for the PNM's tap.
   */
  private async accept(
    candidate: RushCandidateRow,
    chapterId: string,
    actorId: string | null,
    via: RushBidAnsweredVia,
    now: Date,
  ): Promise<RushBidResult> {
    const at = now.toISOString();
    const confirmation = await this.bidRepo.findConfirmation(
      candidate.id,
      chapterId,
    );
    const row = await this.apply(candidate.id, chapterId, {
      from: ['extended'],
      open: true,
      recorded: true,
      now: at,
      set: {
        bid_state: 'accepted',
        bid_answered_at: at,
        bid_answered_by: actorId,
        bid_answered_via: via,
      },
    });
    let inviteSent = false;
    // Sent as from whoever confirmed it, else whoever recorded it.
    const sender = actorId ?? row.bid_acceptance_recorded_by;
    if (confirmation?.email && sender) {
      const roleId = await this.settings.newMemberRoleId(chapterId);
      if (roleId) {
        inviteSent = await this.inviteService.createForAcceptedProspect({
          chapterId,
          createdBy: sender,
          roleId,
          email: confirmation.email,
        });
      }
    }
    await this.bidRepo.deleteConfirmation(candidate.id, chapterId);
    this.pushUp('accepted', row);
    return { ...(await this.view(row, false)), invite_sent: inviteSent };
  }

  /** Runs a transition, answering 409 in plain words when it lost. */
  private async apply(
    candidateId: string,
    chapterId: string,
    transition: RushBidTransition,
  ): Promise<RushCandidateRow> {
    const row = await this.bidRepo.transition(
      candidateId,
      chapterId,
      transition,
    );
    if (row) return row;
    const now = await this.requireRow(candidateId, chapterId);
    if (
      now.bid_state === 'extended' &&
      expired(now, new Date(transition.now))
    ) {
      throw new ConflictException('This bid has expired');
    }
    if (transition.recorded === false && now.bid_acceptance_recorded_at) {
      throw new ConflictException(
        'An acceptance is already recorded and waiting to be confirmed',
      );
    }
    if (transition.recorded === true && now.bid_state === 'extended') {
      throw new ConflictException('No acceptance is recorded on this bid');
    }
    throw new ConflictException(alreadyAnswered(now.bid_state));
  }

  /** The typed email, else a linked member's account email, else none. */
  private async emailFor(
    candidate: RushCandidateRow,
    typed: string | null | undefined,
  ): Promise<string | null> {
    const clean = typed?.trim().toLowerCase();
    if (clean) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean) || clean.length > 320) {
        throw new BadRequestException("That email doesn't look right");
      }
      return clean;
    }
    if (candidate.user_id === null) return null;
    const user = await this.userRepo.findById(candidate.user_id);
    return user?.email?.trim().toLowerCase() || null;
  }

  private async sendConfirmEmail(
    row: RushCandidateRow,
    chapterId: string,
    email: string,
    token: string,
  ): Promise<boolean> {
    try {
      const origin = resolveAppOrigin(this.config);
      const url = assertHttpsJoinOrigin(new URL(RUSH_BID_CONFIRM_PATH, origin));
      url.hash = token;
      const [chapter, names] = await Promise.all([
        this.chapterRepo.findById(chapterId),
        this.names([row.bid_acceptance_recorded_by]),
      ]);
      return await this.emailProvider.sendBidConfirmEmail({
        to: email,
        confirmUrl: url.toString(),
        chapterName: chapter?.name ?? 'Your chapter',
        recorderName: nameOf(names, row.bid_acceptance_recorded_by),
        expiresOn: row.bid_expires_at
          ? new Date(row.bid_expires_at).toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            })
          : 'soon',
      });
    } catch (error) {
      logThrowable(
        this.logger,
        'warn',
        `Bid confirmation email was not sent (candidate ${row.id})`,
        error,
      );
      return false;
    }
  }

  private async view(
    row: RushCandidateRow,
    emailed: boolean,
  ): Promise<RushBidResult> {
    return rushBidView(row, await this.names(rushBidPeople(row)), emailed);
  }

  /**
   * The eligibility check before a bid (`ifc-recruitment.md` § Bids): blocked
   * or warned for Not eligible, warned for Pending, as the council chooses.
   * A hook that allows every bid until the eligibility slice records
   * verdicts (§ Phasing, step 5).
   */
  private checkEligibility(candidate: RushCandidateRow): void {
    void candidate;
  }

  /**
   * The push-up to the council (`ifc-recruitment.md` § What the council
   * receives): bid extended, declined, rescinded or expired, and a confirmed
   * acceptance, which also closes the PNM's other open bids under the
   * one-acceptance rule. A hook that sends nothing until the master list
   * exists (§ Phasing, step 4).
   */
  private pushUp(
    event: 'extended' | 'declined' | 'accepted' | 'rescinded',
    candidate: RushCandidateRow,
  ): void {
    void event;
    void candidate;
  }

  private refuseSelf(candidate: RushCandidateRow, actorId: string): void {
    if (candidate.user_id === actorId) {
      throw new ForbiddenException("You can't answer a bid to yourself");
    }
  }

  private async requireRow(
    candidateId: string,
    chapterId: string,
  ): Promise<RushCandidateRow> {
    const row = await this.pipelineRepo.findCandidate(candidateId, chapterId);
    if (!row) throw new NotFoundException(NOT_FOUND);
    return row;
  }

  private async names(
    ids: readonly (string | null)[],
  ): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((id): id is string => id !== null))];
    if (unique.length === 0) return new Map();
    const users = await this.userRepo.findByIds(unique);
    return new Map(users.map((user) => [user.id, user.display_name]));
  }
}

/** A bid's fields as a member reads them, with names resolved by the caller. */
export function rushBidView(
  row: RushCandidateRow,
  names: ReadonlyMap<string, string>,
  emailed: boolean,
): RushBidView {
  return {
    id: row.id,
    bid_state: row.bid_state,
    bid_extended_at: row.bid_extended_at,
    bid_extended_by_name: nameOf(names, row.bid_extended_by),
    bid_expires_at: row.bid_expires_at,
    bid_acceptance_recorded_at: row.bid_acceptance_recorded_at,
    bid_acceptance_recorded_by_name: nameOf(
      names,
      row.bid_acceptance_recorded_by,
    ),
    bid_confirm_emailed: emailed,
    bid_answered_at: row.bid_answered_at,
    bid_answered_by_name: nameOf(names, row.bid_answered_by),
    bid_answered_via: row.bid_answered_via,
    bid_rescind_reason: row.bid_rescind_reason,
  };
}

/** The member ids a {@link rushBidView} names. */
export function rushBidPeople(row: RushCandidateRow): (string | null)[] {
  return [
    row.bid_extended_by,
    row.bid_acceptance_recorded_by,
    row.bid_answered_by,
  ];
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function nameOf(
  names: ReadonlyMap<string, string>,
  id: string | null,
): string | null {
  return id === null ? null : (names.get(id) ?? 'Unknown member');
}

function expired(row: RushCandidateRow, now: Date): boolean {
  return row.bid_expires_at !== null && new Date(row.bid_expires_at) <= now;
}

/** Why a bid can't be extended or answered, in its state's words. */
function alreadyAnswered(state: RushBidState): string {
  switch (state) {
    case 'extended':
      return 'A bid is already out to this prospect';
    case 'accepted':
      return 'This prospect already accepted';
    case 'declined':
      return 'This prospect declined the bid';
    case 'rescinded':
      return 'This bid was rescinded';
    case 'expired':
      return 'This bid has expired';
    default:
      return 'No bid is out to this prospect';
  }
}
