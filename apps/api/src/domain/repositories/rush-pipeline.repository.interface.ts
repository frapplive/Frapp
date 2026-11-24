import type {
  RushClosedReason,
  RushContactKind,
  RushStageCategory,
} from '@repo/validation';
import type {
  RushCandidateContact,
  RushCandidateNote,
  RushCandidateRating,
  RushCandidateTag,
  RushSettingsPatch,
  RushSettingsRow,
  RushStage,
  RushTag,
} from '../entities/rush-pipeline.entity';
import type {
  RushCandidate,
  RushCandidateRow,
} from '../entities/rush-candidate.entity';

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

  listCandidates(chapterId: string): Promise<RushCandidateRow[]>;
  /** One candidate with the pipeline's columns, or null. */
  findCandidate(
    candidateId: string,
    chapterId: string,
  ): Promise<RushCandidateRow | null>;
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

  // Contacts, owner, follow-ups and settings (#5934) -------------------------

  /** A candidate's logged contacts, newest day first. */
  listContacts(
    candidateId: string,
    chapterId: string,
  ): Promise<RushCandidateContact[]>;
  createContact(input: {
    candidateId: string;
    chapterId: string;
    loggedBy: string;
    kind: RushContactKind;
    contactedOn: string;
    note: string | null;
  }): Promise<RushCandidateContact>;
  /**
   * Moves the candidate's last contact to this one, only forward: a row
   * whose `last_contact_on` is already later keeps it, so two contacts
   * logged at once settle on the later day.
   */
  advanceLastContact(
    candidateId: string,
    chapterId: string,
    contactedOn: string,
    loggedBy: string,
  ): Promise<void>;
  /**
   * Sets the owner. With `onlyIfOwnedBy`, the write lands only while the
   * current owner is that value (`null`: unowned), so two claims at once
   * leave one owner; `null` comes back for the one that lost.
   */
  setOwner(
    candidateId: string,
    chapterId: string,
    ownerId: string | null,
    onlyIfOwnedBy?: string | null,
  ): Promise<RushCandidateRow | null>;
  /** Sets the one open follow-up, or clears it with `null`. */
  setFollowUp(
    candidateId: string,
    chapterId: string,
    followUp: { on: string; note: string | null; userId: string } | null,
  ): Promise<RushCandidateRow>;
  findSettings(chapterId: string): Promise<RushSettingsRow | null>;
  /** Writes the fields `patch` names, creating the row on the first save. */
  saveSettings(
    chapterId: string,
    patch: RushSettingsPatch,
  ): Promise<RushSettingsRow>;
}
