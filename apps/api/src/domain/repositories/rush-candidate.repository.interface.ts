import type {
  RushCandidate,
  RushCandidateVote,
} from '../entities/rush-candidate.entity';

export const RUSH_CANDIDATE_REPOSITORY = 'RUSH_CANDIDATE_REPOSITORY';

/** A name lookup reads at most this many matches; two already answer 409. */
export const RUSH_NAME_MATCHES_MAX = 10;

export interface IRushCandidateRepository {
  findById(id: string, chapterId: string): Promise<RushCandidate | null>;
  /**
   * Every candidate with the name, oldest first, up to
   * {@link RUSH_NAME_MATCHES_MAX}. Two PNMs from the interest form may share
   * a name (`ifc-recruitment.md` § Name lookup).
   */
  findByNameKey(chapterId: string, nameKey: string): Promise<RushCandidate[]>;
  create(
    data: Omit<RushCandidate, 'id' | 'name_key' | 'created_at'> & {
      id?: string;
      created_at?: string;
    },
  ): Promise<RushCandidate>;
  setBidExtended(id: string, chapterId: string): Promise<RushCandidate>;
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
