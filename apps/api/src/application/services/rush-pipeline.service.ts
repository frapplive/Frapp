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
  RUSH_NOTE_MAX,
  RUSH_RATING_MAX,
  RUSH_RATING_MIN,
  RUSH_TAG_LABEL_MAX,
  RUSH_TAGS_MAX,
  firstVisibleRushStage,
  isRushManualClosedReason,
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
import type { RushCandidate } from '#domain/entities/rush-candidate.entity';
import type {
  RushNoteView,
  RushPipeline,
  RushPipelineCandidate,
  RushStage,
  RushTag,
} from '#domain/entities/rush-pipeline.entity';

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
    const [stages, tags, candidates, candidateTags, ratings, votes, results] =
      await Promise.all([
        this.listStages(chapterId),
        this.pipelineRepo.listTags(chapterId),
        this.pipelineRepo.listCandidates(chapterId),
        this.pipelineRepo.listCandidateTags(chapterId),
        this.pipelineRepo.listRatings(chapterId),
        this.pipelineRepo.listVotes(chapterId),
        viewer.canViewResults,
      ]);

    const names = await this.userNames(
      candidates.map((candidate) => candidate.created_by),
    );

    const tagIds = groupBy(candidateTags, (row) => row.candidate_id);
    const ratingsBy = groupBy(ratings, (row) => row.candidate_id);
    const votesBy = groupBy(votes, (row) => row.candidate_id);

    return {
      stages,
      tags,
      candidates: candidates.map((candidate): RushPipelineCandidate => {
        const own = ratingsBy.get(candidate.id) ?? [];
        const ballots = votesBy.get(candidate.id) ?? [];
        const average =
          own.length === 0
            ? null
            : own.reduce((sum, row) => sum + row.rating, 0) / own.length;
        return {
          id: candidate.id,
          display_name: candidate.display_name,
          user_id: candidate.user_id,
          stage: candidate.stage,
          closed_reason: candidate.closed_reason,
          bid_status: candidate.bid_status,
          created_by: candidate.created_by,
          created_by_name: names.get(candidate.created_by) ?? 'Unknown member',
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
    const candidate = await this.requireCandidate(candidateId, chapterId);
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
    return this.pipelineRepo.setCandidateStage(
      candidateId,
      chapterId,
      target.key,
      reason,
    );
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
    ids: readonly string[],
  ): Promise<Map<string, string>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const users = await this.userRepo.findByIds(unique);
    return new Map(users.map((user) => [user.id, user.display_name]));
  }
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
