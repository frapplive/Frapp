import type {
  RushCandidate,
  RushCandidateVote,
} from '../entities/rush-candidate.entity';

export const RUSH_CANDIDATE_REPOSITORY = 'RUSH_CANDIDATE_REPOSITORY';

export interface IRushCandidateRepository {
  findById(id: string, chapterId: string): Promise<RushCandidate | null>;
  /**
   * Every candidate in the chapter with this name key, oldest first. Names
   * are unique only among unlinked candidates (`ifc-recruitment.md` § Name
   * lookup), so a lookup can match several.
   */
  findByNameKey(chapterId: string, nameKey: string): Promise<RushCandidate[]>;
  create(
    data: Omit<RushCandidate, 'id' | 'name_key' | 'created_at'> & {
      id?: string;
      created_at?: string;
    },
  ): Promise<RushCandidate>;
  insertVote(
    candidateId: string,
    chapterId: string,
    voterId: string,
  ): Promise<'inserted' | 'duplicate'>;
  countVotes(candidateId: string, chapterId: string): Promise<number>;
  viewerHasVoted(
    candidateId: string,
    chapterId: string,
    voterId: string,
  ): Promise<boolean>;
}

export type { RushCandidateVote };
