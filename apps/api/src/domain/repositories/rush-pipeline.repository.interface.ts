import type { RushClosedReason, RushStageCategory } from '@repo/validation';
import type {
  RushCandidateNote,
  RushCandidateRating,
  RushCandidateTag,
  RushStage,
  RushTag,
} from '../entities/rush-pipeline.entity';
import type { RushCandidate } from '../entities/rush-candidate.entity';

export const RUSH_PIPELINE_REPOSITORY = 'RUSH_PIPELINE_REPOSITORY';

/** One row of a stage list being saved; `id` is absent for a new stage. */
export interface RushStageWrite {
  id?: string;
  key: string;
  label: string;
  category: RushStageCategory;
  position: number;
  hidden: boolean;
}

/**
 * The recruitment pipeline's chapter-scoped tables (#5924): stages, tags,
 * notes and ratings. Every read and write is filtered on `chapter_id`.
 */
export interface IRushPipelineRepository {
  listStages(chapterId: string): Promise<RushStage[]>;
  /** Inserts the given stages, skipping any key the chapter already has. */
  insertStagesIfMissing(
    chapterId: string,
    stages: readonly RushStageWrite[],
  ): Promise<void>;
  /** Writes the whole list: updates rows with an id, inserts the rest. */
  saveStages(
    chapterId: string,
    stages: readonly RushStageWrite[],
  ): Promise<RushStage[]>;

  listCandidates(chapterId: string): Promise<RushCandidate[]>;
  setCandidateStage(
    candidateId: string,
    chapterId: string,
    stage: string,
    closedReason: RushClosedReason | null,
  ): Promise<RushCandidate>;

  listTags(chapterId: string): Promise<RushTag[]>;
  findTag(tagId: string, chapterId: string): Promise<RushTag | null>;
  createTag(chapterId: string, label: string): Promise<RushTag>;
  renameTag(tagId: string, chapterId: string, label: string): Promise<RushTag>;
  deleteTag(tagId: string, chapterId: string): Promise<void>;
  listCandidateTags(chapterId: string): Promise<RushCandidateTag[]>;
  /** Replaces the candidate's tags with exactly these. */
  setCandidateTags(
    candidateId: string,
    chapterId: string,
    tagIds: readonly string[],
  ): Promise<void>;

  listRatings(chapterId: string): Promise<RushCandidateRating[]>;
  upsertRating(
    candidateId: string,
    chapterId: string,
    raterId: string,
    rating: number,
  ): Promise<void>;

  /** Every ballot in the chapter, voter ids included, for counting only. */
  listVotes(
    chapterId: string,
  ): Promise<{ candidate_id: string; voter_id: string }[]>;

  listNotes(
    candidateId: string,
    chapterId: string,
  ): Promise<RushCandidateNote[]>;
  findNote(
    noteId: string,
    candidateId: string,
    chapterId: string,
  ): Promise<RushCandidateNote | null>;
  createNote(
    candidateId: string,
    chapterId: string,
    authorId: string,
    body: string,
  ): Promise<RushCandidateNote>;
  updateNote(
    noteId: string,
    chapterId: string,
    body: string,
  ): Promise<RushCandidateNote>;
  deleteNote(noteId: string, chapterId: string): Promise<void>;
}
