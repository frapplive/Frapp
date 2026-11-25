import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  DEFAULT_RUSH_STAGES,
  RUSH_CONTACT_LOOKBACK_DAYS,
  RUSH_CONTACT_NOTE_MAX,
  RUSH_FOLLOW_UP_AHEAD_DAYS,
  RUSH_FOLLOW_UP_NOTE_MAX,
  RUSH_NOTE_MAX,
  RUSH_RATING_MAX,
  RUSH_RATING_MIN,
  RUSH_TAG_LABEL_MAX,
  RUSH_STALE_DAYS_DEFAULT,
  RUSH_TAGS_MAX,
  firstVisibleRushStage,
  isRushContactKind,
  isRushManualClosedReason,
  shiftRushDayKey,
  rushStagesProblem,
  sortRushStages,
  type RushStageCategory,
} from '@repo/validation';
import { RUSH_PIPELINE_REPOSITORY } from '#domain/repositories/rush-pipeline.repository.interface';
import type {
  IRushPipelineRepository,
  RushStageWrite,
} from '#domain/repositories/rush-pipeline.repository.interface';
import { RUSH_CANDIDATE_REPOSITORY } from '#domain/repositories/rush-candidate.repository.interface';
import type { IRushCandidateRepository } from '#domain/repositories/rush-candidate.repository.interface';
import { USER_REPOSITORY } from '#domain/repositories/user.repository.interface';
import type { IUserRepository } from '#domain/repositories/user.repository.interface';
import { isUniqueViolation } from '#domain/constants/postgres-error-codes';
import { SystemPermissions } from '#domain/constants/permissions';
import type {
  RushCandidate,
  RushCandidateRow,
} from '#domain/entities/rush-candidate.entity';
import type {
  RushContactView,
  RushNoteView,
  RushPipeline,
  RushPipelineCandidate,
  RushStage,
  RushTag,
} from '#domain/entities/rush-pipeline.entity';
import { RbacService } from './rbac.service';
import { rushBidPeople, rushBidView } from './rush-bid.service';
import { RUSH_BID_REPOSITORY } from '#domain/repositories/rush-bid.repository.interface';
import type { IRushBidRepository } from '#domain/repositories/rush-bid.repository.interface';

/**
 * Who is reading the pipeline. The two permission reads are promises so the
 * controller can start them alongside the service's own reads (as
 * `RushViewer` does for the card).
 */
export interface RushPipelineViewer {
  id: string;
  canViewResults: Promise<boolean>;
}

export interface RushStageInput {
  id?: string;
  label: string;
  category: RushStageCategory;
  hidden: boolean;
}

/**
 * The recruitment pipeline (#5924, `spec/behavior/rush.md` § Pipeline):
 * stages in fixed categories, the chapter's tags, members' notes and 1-to-5
 * ratings. The chat card's routes stay in `RushService`.
 */
@Injectable()
export class RushPipelineService {
  constructor(
    @Inject(RUSH_PIPELINE_REPOSITORY)
    private readonly pipelineRepo: IRushPipelineRepository,
    @Inject(RUSH_CANDIDATE_REPOSITORY)
    private readonly candidateRepo: IRushCandidateRepository,
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    private readonly rbac: RbacService,
    @Inject(RUSH_BID_REPOSITORY) private readonly bidRepo: IRushBidRepository,
  ) {}

  /**
   * The chapter's stages, writing the six defaults first when it has none.
   * The insert skips keys that exist, so two first reads at once converge.
   */
  async listStages(chapterId: string): Promise<RushStage[]> {
    const stages = await this.pipelineRepo.listStages(chapterId);
    if (stages.length > 0) return sortRushStages(stages);
    await this.pipelineRepo.insertStagesIfMissing(
      chapterId,
      DEFAULT_RUSH_STAGES.map((stage, index) => ({
        key: stage.key,
        label: stage.label,
        category: stage.category,
        position: index,
        hidden: false,
      })),
    );
    return sortRushStages(await this.pipelineRepo.listStages(chapterId));
  }

  /**
   * Where a new candidate lands: the first visible stage in the New
   * category. New always keeps a visible stage, so this is never empty; the
   * `'new'` fallback only covers a list nobody could have saved.
   */
  async stageForNewCandidate(chapterId: string): Promise<string> {
    const stages = await this.listStages(chapterId);
    return firstVisibleRushStage(stages, 'new')?.key ?? 'new';
  }

  /**
   * Saves the chapter's whole stage list, in order. Stages can be renamed,
   * reordered, hidden and added; none is ever deleted, because candidates
   * point at its key, so every existing stage must still be in the list.
   */
  async saveStages(
    chapterId: string,
    input: readonly RushStageInput[],
  ): Promise<RushStage[]> {
    const problem = rushStagesProblem(input);
    if (problem) throw new BadRequestException(problem);

    const existing = await this.listStages(chapterId);
    const byId = new Map(existing.map((stage) => [stage.id, stage]));
    const kept = new Set<string>();
    for (const stage of input) {
      if (!stage.id) continue;
      const current = byId.get(stage.id);
      if (!current) {
        throw new BadRequestException(
          'A stage in the list is not this chapter’s',
        );
      }
      if (kept.has(stage.id)) {
        throw new BadRequestException('A stage is in the list twice');
      }
      if (current.category !== stage.category) {
        throw new BadRequestException(
          `"${current.label}" can't move to another category`,
        );
      }
      kept.add(stage.id);
    }
    if (kept.size !== existing.length) {
      throw new BadRequestException(
        'Stages can be hidden but not removed. Send every existing stage.',
      );
    }

    const writes: RushStageWrite[] = input.map((stage, position) => {
      const current = stage.id ? byId.get(stage.id) : undefined;
      return {
        id: current?.id,
        key: current?.key ?? `s_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
        label: stage.label.trim(),
        category: stage.category,
        position,
        hidden: stage.hidden,
      };
    });
    return sortRushStages(
      await this.pipelineRepo.saveStages(chapterId, writes),
    );
  }

  async getPipeline(
    chapterId: string,
    viewer: RushPipelineViewer,
  ): Promise<RushPipeline> {
    const [
      stages,
      tags,
      candidates,
      candidateTags,
      ratings,
      votes,
      results,
      staleDays,
      emailed,
    ] = await Promise.all([
      this.listStages(chapterId),
      this.pipelineRepo.listTags(chapterId),
      this.pipelineRepo.listCandidates(chapterId),
      this.pipelineRepo.listCandidateTags(chapterId),
      this.pipelineRepo.listRatings(chapterId),
      this.pipelineRepo.listVotes(chapterId),
      viewer.canViewResults,
      this.staleDays(chapterId),
      this.bidRepo.candidatesWithConfirmationEmail(chapterId),
    ]);

    const names = await this.userNames(
      candidates.flatMap((candidate) => [
        candidate.created_by,
        candidate.owner_id,
        candidate.last_contact_by,
        candidate.follow_up_user_id,
        ...rushBidPeople(candidate),
      ]),
    );
    const nameOf = (id: string | null) =>
      id === null ? null : (names.get(id) ?? 'Unknown member');

    const tagIds = groupBy(candidateTags, (row) => row.candidate_id);
    const ratingsBy = groupBy(ratings, (row) => row.candidate_id);
    const votesBy = groupBy(votes, (row) => row.candidate_id);

    return {
      stages,
      tags,
      stale_days: staleDays,
      candidates: candidates.map((candidate): RushPipelineCandidate => {
        const own = ratingsBy.get(candidate.id) ?? [];
        const ballots = votesBy.get(candidate.id) ?? [];
        const average =
          own.length === 0
            ? null
            : own.reduce((sum, row) => sum + row.rating, 0) / own.length;
        return {
          ...rushBidView(candidate, names, emailed.has(candidate.id)),
          id: candidate.id,
          display_name: candidate.display_name,
          user_id: candidate.user_id,
          stage: candidate.stage,
          closed_reason: candidate.closed_reason,
          bid_status: candidate.bid_status,
          created_by: candidate.created_by,
          created_by_name: candidate.created_by
            ? (names.get(candidate.created_by) ?? 'Unknown member')
            : null,
          origin: candidate.origin,
          created_at: candidate.created_at,
          tag_ids: (tagIds.get(candidate.id) ?? []).map((row) => row.tag_id),
          ...(results
            ? {
                rating_average: average,
                rating_count: own.length,
                vote_count: ballots.length,
              }
            : {}),
          viewer_rating:
            own.find((row) => row.rater_id === viewer.id)?.rating ?? null,
          viewer_has_voted: ballots.some((row) => row.voter_id === viewer.id),
          owner_id: candidate.owner_id,
          owner_name: nameOf(candidate.owner_id),
          last_contact_on: candidate.last_contact_on,
          last_contact_by: candidate.last_contact_by,
          last_contact_by_name: nameOf(candidate.last_contact_by),
          follow_up_on: candidate.follow_up_on,
          // What to do about a prospect is the chapter's words about them,
          // so a member linked to the prospect doesn't read it, as with notes.
          follow_up_note:
            candidate.user_id === viewer.id ? null : candidate.follow_up_note,
          follow_up_user_id: candidate.follow_up_user_id,
          follow_up_user_name: nameOf(candidate.follow_up_user_id),
        };
      }),
    };
  }

  /**
   * Moves a candidate to one of the chapter's visible stages. A Closed stage
   * needs one of the reasons a member may pick; leaving Closed clears it.
   */
  async moveStage(
    candidateId: string,
    chapterId: string,
    stageKey: string,
    closedReason: string | null | undefined,
  ): Promise<RushCandidate> {
    const candidate = await this.requireRow(candidateId, chapterId);
    const stages = await this.listStages(chapterId);
    const target = stages.find((stage) => stage.key === stageKey);
    if (!target) throw new BadRequestException('Unknown stage');
    if (target.hidden && candidate.stage !== target.key) {
      throw new BadRequestException(`"${target.label}" is hidden`);
    }
    let reason = null;
    if (target.category === 'closed') {
      if (!isRushManualClosedReason(closedReason)) {
        throw new BadRequestException(
          'Closing a prospect needs a reason: not_interested, not_eligible, chapter_passed or no_response',
        );
      }
      reason = closedReason;
    } else if (closedReason != null) {
      // `null` is "no reason", as the response types it.
      throw new BadRequestException('Only a Closed stage takes a reason');
    }
    const moved = await this.pipelineRepo.setCandidateStage(
      candidateId,
      chapterId,
      target.key,
      reason,
    );
    // A closed prospect takes no follow-up (`rush.md` § Contacts, owner and
    // follow-ups), so closing drops it rather than keeping it to come back,
    // due and pushed, if they are reopened.
    if (target.category === 'closed' && candidate.follow_up_on !== null) {
      await this.pipelineRepo.setFollowUp(candidateId, chapterId, null);
    }
    return moved;
  }

  async createTag(chapterId: string, label: string): Promise<RushTag> {
    const clean = this.tagLabel(label);
    const existing = await this.pipelineRepo.listTags(chapterId);
    if (existing.length >= RUSH_TAGS_MAX) {
      throw new BadRequestException(
        `A chapter can have up to ${RUSH_TAGS_MAX} tags`,
      );
    }
    try {
      return await this.pipelineRepo.createTag(chapterId, clean);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(`There's already a "${clean}" tag`);
      }
      throw error;
    }
  }

  async renameTag(
    tagId: string,
    chapterId: string,
    label: string,
  ): Promise<RushTag> {
    const clean = this.tagLabel(label);
    if (!(await this.pipelineRepo.findTag(tagId, chapterId))) {
      throw new NotFoundException('Tag not found');
    }
    try {
      return await this.pipelineRepo.renameTag(tagId, chapterId, clean);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(`There's already a "${clean}" tag`);
      }
      throw error;
    }
  }

  async deleteTag(tagId: string, chapterId: string): Promise<void> {
    if (!(await this.pipelineRepo.findTag(tagId, chapterId))) {
      throw new NotFoundException('Tag not found');
    }
    await this.pipelineRepo.deleteTag(tagId, chapterId);
  }

  async setCandidateTags(
    candidateId: string,
    chapterId: string,
    tagIds: readonly string[],
  ): Promise<string[]> {
    await this.requireCandidate(candidateId, chapterId);
    const unique = [...new Set(tagIds)];
    const tags = await this.pipelineRepo.listTags(chapterId);
    const known = new Set(tags.map((tag) => tag.id));
    if (unique.some((id) => !known.has(id))) {
      throw new BadRequestException('A tag in the list is not this chapter’s');
    }
    await this.pipelineRepo.setCandidateTags(candidateId, chapterId, unique);
    return unique;
  }

  async rate(
    candidateId: string,
    chapterId: string,
    raterId: string,
    rating: number,
  ): Promise<void> {
    if (
      !Number.isInteger(rating) ||
      rating < RUSH_RATING_MIN ||
      rating > RUSH_RATING_MAX
    ) {
      throw new BadRequestException(
        `A rating is a whole number from ${RUSH_RATING_MIN} to ${RUSH_RATING_MAX}`,
      );
    }
    await this.requireCandidate(candidateId, chapterId);
    await this.pipelineRepo.upsertRating(
      candidateId,
      chapterId,
      raterId,
      rating,
    );
  }

  /**
   * A candidate's notes, newest first. A member never reads notes on a
   * candidate linked to their own account, whatever keys they hold; they get
   * an empty list, which says nothing about whether notes exist.
   */
  async listNotes(
    candidateId: string,
    chapterId: string,
    viewerId: string,
  ): Promise<RushNoteView[]> {
    const candidate = await this.requireCandidate(candidateId, chapterId);
    if (candidate.user_id === viewerId) return [];
    const notes = await this.pipelineRepo.listNotes(candidateId, chapterId);
    const names = await this.userNames(notes.map((note) => note.author_id));
    return notes.map((note) => ({
      id: note.id,
      candidate_id: note.candidate_id,
      author_id: note.author_id,
      author_name: names.get(note.author_id) ?? 'Unknown member',
      body: note.body,
      created_at: note.created_at,
      updated_at: note.updated_at,
    }));
  }

  async addNote(
    candidateId: string,
    chapterId: string,
    authorId: string,
    body: string,
  ): Promise<RushNoteView> {
    const candidate = await this.requireCandidate(candidateId, chapterId);
    this.refuseSelf(candidate, authorId);
    const note = await this.pipelineRepo.createNote(
      candidateId,
      chapterId,
      authorId,
      this.noteBody(body),
    );
    return this.noteView(note);
  }

  async editNote(
    noteId: string,
    candidateId: string,
    chapterId: string,
    editorId: string,
    body: string,
  ): Promise<RushNoteView> {
    const candidate = await this.requireCandidate(candidateId, chapterId);
    this.refuseSelf(candidate, editorId);
    const note = await this.pipelineRepo.findNote(
      noteId,
      candidateId,
      chapterId,
    );
    if (!note) throw new NotFoundException('Note not found');
    if (note.author_id !== editorId) {
      throw new ForbiddenException('Only its author can edit a note');
    }
    return this.noteView(
      await this.pipelineRepo.updateNote(
        noteId,
        chapterId,
        this.noteBody(body),
      ),
    );
  }

  /** Its author, or a holder of `rush:manage`, deletes a note. */
  async deleteNote(
    noteId: string,
    candidateId: string,
    chapterId: string,
    viewerId: string,
    canManage: boolean,
  ): Promise<void> {
    const candidate = await this.requireCandidate(candidateId, chapterId);
    this.refuseSelf(candidate, viewerId);
    const note = await this.pipelineRepo.findNote(
      noteId,
      candidateId,
      chapterId,
    );
    if (!note) throw new NotFoundException('Note not found');
    if (note.author_id !== viewerId && !canManage) {
      throw new ForbiddenException(
        'Only its author or someone who manages recruitment can delete a note',
      );
    }
    await this.pipelineRepo.deleteNote(noteId, chapterId);
  }

  // Contacts, owner, follow-ups and the stale setting (#5934) ---------------

  /**
   * The chapter's stale days, the one setting the pipeline reads; no row reads
   * as the default. The rest of the settings page is `RushSettingsService`'s.
   */
  async staleDays(chapterId: string): Promise<number> {
    const row = await this.pipelineRepo.findSettings(chapterId);
    return row?.stale_days ?? RUSH_STALE_DAYS_DEFAULT;
  }

  /**
   * A candidate's logged contacts, newest first. Each contact's note reads
   * like a recruitment note: only with `rush:read_notes`, and never on a
   * candidate linked to the reader, who still sees that contacts happened.
   */
  async listContacts(
    candidateId: string,
    chapterId: string,
    viewer: { id: string; canReadNotes: boolean },
  ): Promise<RushContactView[]> {
    const candidate = await this.requireRow(candidateId, chapterId);
    const contacts = await this.pipelineRepo.listContacts(
      candidateId,
      chapterId,
    );
    const names = await this.userNames(contacts.map((row) => row.logged_by));
    const notes = viewer.canReadNotes && candidate.user_id !== viewer.id;
    return contacts.map((row) => ({
      id: row.id,
      candidate_id: row.candidate_id,
      logged_by: row.logged_by,
      logged_by_name: names.get(row.logged_by) ?? 'Unknown member',
      kind: row.kind,
      contacted_on: row.contacted_on,
      ...(notes ? { note: row.note } : {}),
      created_at: row.created_at,
    }));
  }

  /**
   * Logs a contact (`spec/behavior/rush.md` § Contacts, owner and follow-ups). It
   * becomes the candidate's last contact unless a later one is logged,
   * clears their follow-up, and on the first contact moves a candidate still
   * in a New stage to the first visible Contacted stage.
   */
  async logContact(
    candidateId: string,
    chapterId: string,
    userId: string,
    input: { kind: string; contacted_on: string; note?: string | null },
    now: Date = new Date(),
  ): Promise<RushContactView> {
    if (!isRushContactKind(input.kind)) {
      throw new BadRequestException(
        'kind is one of text, call, in_person, social_dm, email, event',
      );
    }
    // A day ahead of the server's date is allowed, for a member whose own
    // calendar has already turned over.
    const today = now.toISOString().slice(0, 10);
    const day = input.contacted_on;
    if (
      !isDayKey(day) ||
      day > shiftRushDayKey(today, 1) ||
      // A day of slack each way: the member's calendar can sit a day either
      // side of the server's UTC date, and the clients count from their own.
      day < shiftRushDayKey(today, -(RUSH_CONTACT_LOOKBACK_DAYS + 1))
    ) {
      throw new BadRequestException(
        `contacted_on is a real day, not in the future and within ${RUSH_CONTACT_LOOKBACK_DAYS} days`,
      );
    }
    const note = this.optionalText(
      input.note,
      RUSH_CONTACT_NOTE_MAX,
      'A contact note',
    );
    const candidate = await this.requireRow(candidateId, chapterId);
    if (candidate.user_id === userId) {
      throw new ForbiddenException("You can't log a contact with yourself");
    }

    const contact = await this.pipelineRepo.createContact({
      candidateId,
      chapterId,
      loggedBy: userId,
      kind: input.kind,
      contactedOn: day,
      note,
    });
    await this.pipelineRepo.advanceLastContact(
      candidateId,
      chapterId,
      day,
      userId,
    );
    if (candidate.follow_up_on !== null) {
      await this.pipelineRepo.setFollowUp(candidateId, chapterId, null);
    }
    if (candidate.last_contact_on === null) {
      await this.moveToContacted(candidate, chapterId);
    }

    const names = await this.userNames([userId]);
    return {
      id: contact.id,
      candidate_id: contact.candidate_id,
      logged_by: contact.logged_by,
      logged_by_name: names.get(userId) ?? 'Unknown member',
      kind: contact.kind,
      contacted_on: contact.contacted_on,
      note: contact.note,
      created_at: contact.created_at,
    };
  }

  /**
   * Sets or clears a candidate's owner. A holder of `rush:add` claims an
   * unowned candidate or lets go of their own; anything else, assigning
   * someone else or taking one over, needs `rush:manage`. The owner must be
   * a member who can work prospects (`rush:add`).
   */
  async setOwner(
    candidateId: string,
    chapterId: string,
    actorId: string,
    ownerId: string | null,
    canManage: boolean,
  ): Promise<{
    id: string;
    owner_id: string | null;
    owner_name: string | null;
  }> {
    const candidate = await this.requireRow(candidateId, chapterId);
    if (ownerId !== null && ownerId === candidate.user_id) {
      throw new BadRequestException('Nobody owns themself as a prospect');
    }
    if (ownerId !== null) await this.requireWorker(chapterId, ownerId);

    let saved: RushCandidateRow | null;
    if (canManage) {
      saved = await this.pipelineRepo.setOwner(candidateId, chapterId, ownerId);
    } else if (ownerId === actorId) {
      if (candidate.owner_id === actorId) saved = candidate;
      else if (candidate.owner_id !== null) {
        throw new ForbiddenException(
          'Someone already owns this prospect. Someone who manages recruitment can reassign them.',
        );
      } else {
        saved = await this.pipelineRepo.setOwner(
          candidateId,
          chapterId,
          actorId,
          null,
        );
      }
    } else if (ownerId === null && candidate.owner_id === actorId) {
      saved = await this.pipelineRepo.setOwner(
        candidateId,
        chapterId,
        null,
        actorId,
      );
    } else {
      throw new ForbiddenException(
        'Only someone who manages recruitment can assign a prospect to someone else',
      );
    }
    if (!saved) {
      throw new ConflictException('Someone else just claimed this prospect');
    }
    // A follow-up that was the old owner's goes with the prospect to the new
    // one, so the push reaches whoever owns them now (#5934's "a push to
    // their owner"). One set for someone else stays theirs.
    if (
      saved.owner_id !== null &&
      saved.owner_id !== candidate.owner_id &&
      candidate.follow_up_on !== null &&
      candidate.follow_up_user_id === candidate.owner_id
    ) {
      await this.pipelineRepo.setFollowUp(candidateId, chapterId, {
        on: candidate.follow_up_on,
        note: candidate.follow_up_note,
        userId: saved.owner_id,
      });
    }
    const names = await this.userNames([saved.owner_id]);
    return {
      id: saved.id,
      owner_id: saved.owner_id,
      owner_name:
        saved.owner_id === null
          ? null
          : (names.get(saved.owner_id) ?? 'Unknown member'),
    };
  }

  /**
   * Sets the candidate's one follow-up: a day, what to do, and who it's for
   * (the owner by default, else the caller). Whoever it's for must be able
   * to work prospects. A follow-up on a passed day is refused; today is fine.
   */
  async setFollowUp(
    candidateId: string,
    chapterId: string,
    actorId: string,
    input: { due_on: string; note?: string | null; for_user_id?: string },
    now: Date = new Date(),
  ): Promise<RushFollowUpView> {
    const today = now.toISOString().slice(0, 10);
    const day = input.due_on;
    if (
      !isDayKey(day) ||
      // A day of slack each way, as `logContact` allows.
      day < shiftRushDayKey(today, -1) ||
      day > shiftRushDayKey(today, RUSH_FOLLOW_UP_AHEAD_DAYS + 1)
    ) {
      throw new BadRequestException(
        `due_on is a real day, from today to ${RUSH_FOLLOW_UP_AHEAD_DAYS} days ahead`,
      );
    }
    const note = this.optionalText(
      input.note,
      RUSH_FOLLOW_UP_NOTE_MAX,
      'A follow-up',
    );
    const candidate = await this.requireRow(candidateId, chapterId);
    this.refuseSelfFollowUp(candidate, actorId);
    if (candidate.closed_reason !== null) {
      throw new BadRequestException(
        'This prospect is closed. Move them back to an open stage first.',
      );
    }
    // Named: it must be someone who can work prospects. Not named: the
    // owner while they still can, else whoever sets it, so an owner who
    // left the chapter doesn't block every follow-up on the prospect.
    let forUser = input.for_user_id ?? null;
    // Re-saving a follow-up whose member has since left names them again
    // (the phone keeps who it's for); that falls back like an unnamed one.
    if (
      forUser !== null &&
      forUser === candidate.follow_up_user_id &&
      !(await this.canWork(chapterId, forUser))
    ) {
      forUser = null;
    }
    if (forUser === null) {
      const owner = candidate.owner_id;
      forUser =
        owner !== null &&
        owner !== candidate.user_id &&
        (await this.canWork(chapterId, owner))
          ? owner
          : actorId;
    }
    if (candidate.user_id === forUser) {
      throw new BadRequestException(
        "A follow-up can't be for the prospect themself",
      );
    }
    await this.requireWorker(chapterId, forUser);
    const saved = await this.pipelineRepo.setFollowUp(candidateId, chapterId, {
      on: day,
      note,
      userId: forUser,
    });
    return this.followUpView(saved);
  }

  async clearFollowUp(
    candidateId: string,
    chapterId: string,
    actorId: string,
  ): Promise<RushFollowUpView> {
    this.refuseSelfFollowUp(
      await this.requireRow(candidateId, chapterId),
      actorId,
    );
    return this.followUpView(
      await this.pipelineRepo.setFollowUp(candidateId, chapterId, null),
    );
  }

  /** The first logged contact's automatic move, by category, never name. */
  private async moveToContacted(
    candidate: RushCandidateRow,
    chapterId: string,
  ): Promise<void> {
    const stages = await this.listStages(chapterId);
    const current = stages.find((stage) => stage.key === candidate.stage);
    if (current && current.category !== 'new') return;
    const target = firstVisibleRushStage(stages, 'contacted');
    if (!target) return;
    await this.pipelineRepo.setCandidateStage(
      candidate.id,
      chapterId,
      target.key,
      null,
    );
  }

  private async followUpView(row: RushCandidateRow): Promise<RushFollowUpView> {
    const names = await this.userNames([row.follow_up_user_id]);
    return {
      id: row.id,
      follow_up_on: row.follow_up_on,
      follow_up_note: row.follow_up_note,
      follow_up_user_id: row.follow_up_user_id,
      follow_up_user_name:
        row.follow_up_user_id === null
          ? null
          : (names.get(row.follow_up_user_id) ?? 'Unknown member'),
    };
  }

  /** A member linked to the prospect doesn't work their own follow-up. */
  private refuseSelfFollowUp(
    candidate: RushCandidateRow,
    userId: string,
  ): void {
    if (candidate.user_id === userId) {
      throw new ForbiddenException(
        "You can't set or clear a follow-up about yourself",
      );
    }
  }

  private canWork(chapterId: string, userId: string): Promise<boolean> {
    return this.rbac.memberHasAnyPermission(chapterId, userId, [
      SystemPermissions.RUSH_ADD,
    ]);
  }

  /** A member of the chapter who can work prospects, or a 400 saying so. */
  private async requireWorker(
    chapterId: string,
    userId: string,
  ): Promise<void> {
    const ok = await this.canWork(chapterId, userId);
    if (!ok) {
      throw new BadRequestException(
        "That member can't work prospects. Their role needs “Add and work prospects”.",
      );
    }
  }

  private async requireRow(
    candidateId: string,
    chapterId: string,
  ): Promise<RushCandidateRow> {
    const candidate = await this.pipelineRepo.findCandidate(
      candidateId,
      chapterId,
    );
    if (!candidate) throw new NotFoundException('Candidate not found');
    return candidate;
  }

  private optionalText(
    value: string | null | undefined,
    max: number,
    what: string,
  ): string | null {
    const clean = (value ?? '').trim();
    if (clean.length === 0) return null;
    if (clean.length > max) {
      throw new BadRequestException(`${what} can be up to ${max} characters`);
    }
    return clean;
  }

  private async requireCandidate(
    candidateId: string,
    chapterId: string,
  ): Promise<RushCandidate> {
    const candidate = await this.candidateRepo.findById(candidateId, chapterId);
    if (!candidate) throw new NotFoundException('Candidate not found');
    return candidate;
  }

  /** Notes about yourself are off limits, to read or to write. */
  private refuseSelf(candidate: RushCandidate, userId: string): void {
    if (candidate.user_id === userId) {
      throw new ForbiddenException(
        "You can't see or write notes about yourself",
      );
    }
  }

  private tagLabel(label: string): string {
    const clean = (label ?? '').trim();
    if (clean.length === 0) throw new BadRequestException('Name the tag');
    if (clean.length > RUSH_TAG_LABEL_MAX) {
      throw new BadRequestException(
        `Tag names can be up to ${RUSH_TAG_LABEL_MAX} characters`,
      );
    }
    return clean;
  }

  private noteBody(body: string): string {
    const clean = (body ?? '').trim();
    if (clean.length === 0) throw new BadRequestException('Write the note');
    if (clean.length > RUSH_NOTE_MAX) {
      throw new BadRequestException(
        `A note can be up to ${RUSH_NOTE_MAX} characters`,
      );
    }
    return clean;
  }

  private async noteView(note: {
    id: string;
    candidate_id: string;
    author_id: string;
    body: string;
    created_at: string;
    updated_at: string;
  }): Promise<RushNoteView> {
    const names = await this.userNames([note.author_id]);
    return {
      ...note,
      author_name: names.get(note.author_id) ?? 'Unknown member',
    };
  }

  private async userNames(
    ids: readonly (string | null)[],
  ): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((id): id is string => id !== null))];
    if (unique.length === 0) return new Map();
    const users = await this.userRepo.findByIds(unique);
    return new Map(users.map((user) => [user.id, user.display_name]));
  }
}

/** A candidate's follow-up after a write. */
export interface RushFollowUpView {
  id: string;
  follow_up_on: string | null;
  follow_up_note: string | null;
  follow_up_user_id: string | null;
  follow_up_user_name: string | null;
}

/** Whether `day` is a `YYYY-MM-DD` that exists on the calendar. */
function isDayKey(day: unknown): day is string {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return false;
  }
  const at = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(at.getTime()) && at.toISOString().slice(0, 10) === day;
}

function groupBy<T>(
  rows: readonly T[],
  key: (row: T) => string,
): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = out.get(k);
    if (list) list.push(row);
    else out.set(k, [row]);
  }
  return out;
}
