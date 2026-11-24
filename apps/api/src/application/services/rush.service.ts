import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { RUSH_CANDIDATE_REPOSITORY } from '#domain/repositories/rush-candidate.repository.interface';
import type { IRushCandidateRepository } from '#domain/repositories/rush-candidate.repository.interface';
import { USER_REPOSITORY } from '#domain/repositories/user.repository.interface';
import type { IUserRepository } from '#domain/repositories/user.repository.interface';
import { isUniqueViolation } from '#domain/constants/postgres-error-codes';
import type {
  RushCandidate,
  RushCandidateView,
} from '#domain/entities/rush-candidate.entity';
import { ChatService } from './chat.service';
import { RushPipelineService } from './rush-pipeline.service';
import { RushBidService } from './rush-bid.service';
import { logThrowable } from '../../infrastructure/observability/log-throwable';

export interface CreateRushCandidateInput {
  chapter_id: string;
  display_name: string;
  created_by: string;
  user_id?: string | null;
  channel_id?: string;
  client_message_id?: string;
}

/**
 * Who is reading a candidate, and whether they may see its vote count
 * (`rush:view_results`, #4084). The count is left out of the view, not
 * zeroed, so no client can mistake a hidden count for none.
 *
 * `canViewResults` is a promise so the caller can start the permission read
 * before the candidate read and the two overlap; the controller attaches a
 * handler to it, so a request that 404s first leaves no unhandled rejection.
 */
export interface RushViewer {
  id: string;
  canViewResults: Promise<boolean>;
}

/** The 409's `code` when a name lookup matches several prospects. */
export const RUSH_SEVERAL_MATCH_CODE = 'rush.several_match';

/** One prospect a name matched, enough to tell two apart in a picker. */
export interface RushNameMatch {
  id: string;
  display_name: string;
  stage: string;
  /** The stage's name in this chapter, for the picker. */
  stage_label: string;
  created_at: string;
}

export type CreateRushCandidateResult = RushCandidate & {
  card_posted?: boolean;
};

@Injectable()
export class RushService {
  private readonly logger = new Logger(RushService.name);

  constructor(
    @Inject(RUSH_CANDIDATE_REPOSITORY)
    private readonly rushRepo: IRushCandidateRepository,
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    private readonly chatService: ChatService,
    private readonly pipelineService: RushPipelineService,
    private readonly bidService: RushBidService,
  ) {}

  async findView(
    id: string,
    chapterId: string,
    viewer: RushViewer,
  ): Promise<RushCandidateView> {
    const candidate = await this.rushRepo.findById(id, chapterId);
    if (!candidate) {
      throw new NotFoundException('Candidate not found');
    }
    return this.toView(candidate, viewer);
  }

  async findViewByName(
    chapterId: string,
    viewer: RushViewer,
    name: string,
  ): Promise<RushCandidateView> {
    const nameKey = lowerTrim(name ?? '');
    if (!nameKey) {
      throw new BadRequestException('Candidate name is required');
    }
    const matches = await this.rushRepo.findByNameKey(chapterId, nameKey);
    if (matches.length === 0) {
      throw new NotFoundException('Candidate not found');
    }
    // Two prospects can share a name once candidates link to PNMs, so a
    // lookup never picks one silently: it answers 409 with each match, and
    // the slash command offers a picker (`ifc-recruitment.md` § Name lookup).
    if (matches.length > 1) {
      const stages = await this.pipelineService.listStages(chapterId);
      const labelOf = new Map(stages.map((stage) => [stage.key, stage.label]));
      throw new ConflictException({
        code: RUSH_SEVERAL_MATCH_CODE,
        message: 'Several prospects match',
        candidates: matches.map((match): RushNameMatch => ({
          id: match.id,
          display_name: match.display_name,
          stage: match.stage,
          stage_label: labelOf.get(match.stage) ?? match.stage,
          created_at: match.created_at,
        })),
      });
    }
    return this.toView(matches[0], viewer);
  }

  async create(
    input: CreateRushCandidateInput,
  ): Promise<CreateRushCandidateResult> {
    const displayName = input.display_name.trim();
    if (displayName.length === 0) {
      throw new BadRequestException('display_name is required');
    }
    if (displayName.length > 200) {
      throw new BadRequestException('display_name is too long (max 200)');
    }

    let candidate: RushCandidate;
    try {
      candidate = await this.rushRepo.create({
        chapter_id: input.chapter_id,
        display_name: displayName,
        user_id: input.user_id ?? null,
        // The first visible stage in the New category (#5924): a chapter
        // that renamed or replaced New still gets its candidates there.
        stage: await this.pipelineService.stageForNewCandidate(
          input.chapter_id,
        ),
        closed_reason: null,
        bid_status: 'none',
        bid_state: 'none',
        created_by: input.created_by,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'A candidate with that name already exists in this chapter',
        );
      }
      throw error;
    }

    const cardPosted = await this.tryPostRushCard(input, candidate);
    return cardPosted === undefined
      ? candidate
      : { ...candidate, card_posted: cardPosted };
  }

  async vote(
    id: string,
    chapterId: string,
    voter: RushViewer,
  ): Promise<RushCandidateView> {
    const candidate = await this.rushRepo.findById(id, chapterId);
    if (!candidate) {
      throw new NotFoundException('Candidate not found');
    }
    await this.rushRepo.insertVote(id, chapterId, voter.id);
    return this.toView(candidate, voter);
  }

  async bid(
    id: string,
    chapterId: string,
    viewer: RushViewer,
  ): Promise<RushCandidateView> {
    // Extend only from `none` or `expired`; anything else is 409, so an old
    // card's Extend can't undo an answer (`ifc-recruitment.md` § Bids).
    await this.bidService.extend(id, chapterId, viewer.id);
    const candidate = await this.rushRepo.findById(id, chapterId);
    if (!candidate) {
      throw new NotFoundException('Candidate not found');
    }
    return this.toView(candidate, viewer);
  }

  private async toView(
    candidate: RushCandidate,
    viewer: RushViewer,
  ): Promise<RushCandidateView> {
    const [voteCount, viewerHasVoted] = await Promise.all([
      viewer.canViewResults.then((canViewResults) =>
        canViewResults
          ? this.rushRepo.countVotes(candidate.id, candidate.chapter_id)
          : undefined,
      ),
      this.rushRepo.viewerHasVoted(
        candidate.id,
        candidate.chapter_id,
        viewer.id,
      ),
    ]);
    return {
      ...candidate,
      ...(voteCount === undefined ? {} : { vote_count: voteCount }),
      viewer_has_voted: viewerHasVoted,
    };
  }

  /**
   * Returns whether the card posted, or `undefined` when no card was due
   * (no chat context) — the three-way distinction `card_posted` publishes.
   */
  private async tryPostRushCard(
    input: CreateRushCandidateInput,
    candidate: RushCandidate,
  ): Promise<boolean | undefined> {
    if (!input.channel_id || !input.client_message_id) return undefined;

    try {
      await this.postRushCard(input, candidate);
      return true;
    } catch (error) {
      logThrowable(
        this.logger,
        'warn',
        `Failed to post rush card to chat (candidate ${candidate.id}, channel ${input.channel_id}, chapter ${input.chapter_id})`,
        error,
      );
      return false;
    }
  }

  /**
   * Post the `kind:"rush"` candidate card. The display name is embedded at
   * write time as a snapshot; live vote/bid state is read back through GET.
   * Server-originated — a client cannot forge `kind:"rush"`.
   */
  private async postRushCard(
    input: CreateRushCandidateInput,
    candidate: RushCandidate,
  ): Promise<void> {
    const users = await this.userRepo.findByIds([input.created_by]);
    const addedByName =
      users.find((u) => u.id === input.created_by)?.display_name ??
      'Unknown member';

    const payload = {
      candidate_id: candidate.id,
      display_name: candidate.display_name,
      added_by_user_id: input.created_by,
      added_by_name: addedByName,
      stage: candidate.stage,
      bid_status: candidate.bid_status,
      created_at: candidate.created_at,
    };

    const content = `Added candidate ${candidate.display_name}`;

    await this.chatService.sendMessage({
      chapter_id: input.chapter_id,
      channel_id: input.channel_id!,
      sender_id: input.created_by,
      content,
      kind: 'rush',
      payload,
      client_message_id: input.client_message_id,
      system_originated: true,
    });
  }
}

function lowerTrim(value: string): string {
  return value.trim().toLowerCase();
}
