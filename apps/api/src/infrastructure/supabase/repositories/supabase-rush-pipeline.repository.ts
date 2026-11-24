import { Inject, Injectable } from '@nestjs/common';
import type { RushClosedReason } from '@repo/validation';
import { SUPABASE_CLIENT } from '../supabase.provider';
import type { FrappSupabaseClient } from '../database.types';
import { SupabaseQueryError } from '../supabase-query-error';
import type {
  IRushPipelineRepository,
  RushStageWrite,
} from '#domain/repositories/rush-pipeline.repository.interface';
import type {
  RushCandidateNote,
  RushCandidateRating,
  RushCandidateTag,
  RushStage,
  RushTag,
} from '#domain/entities/rush-pipeline.entity';
import type { RushCandidate } from '#domain/entities/rush-candidate.entity';

@Injectable()
export class SupabaseRushPipelineRepository implements IRushPipelineRepository {
  constructor(
    @Inject(SUPABASE_CLIENT)
    private readonly supabase: FrappSupabaseClient,
  ) {}

  async listStages(chapterId: string): Promise<RushStage[]> {
    const { data, error } = await this.supabase
      .from('rush_stages')
      .select('*')
      .eq('chapter_id', chapterId)
      .order('position', { ascending: true });
    if (error) throw new SupabaseQueryError(error);
    return data ?? [];
  }

  async insertStagesIfMissing(
    chapterId: string,
    stages: readonly RushStageWrite[],
  ): Promise<void> {
    const { error } = await this.supabase.from('rush_stages').upsert(
      stages.map((stage) => ({
        chapter_id: chapterId,
        key: stage.key,
        label: stage.label,
        category: stage.category,
        position: stage.position,
        hidden: stage.hidden,
      })),
      { onConflict: 'chapter_id,key', ignoreDuplicates: true },
    );
    if (error) throw new SupabaseQueryError(error);
  }

  async saveStages(
    chapterId: string,
    stages: readonly RushStageWrite[],
  ): Promise<RushStage[]> {
    const now = new Date().toISOString();
    const existing = stages.filter((stage) => stage.id);
    const added = stages.filter((stage) => !stage.id);
    // One update per stage, each filtered on the chapter, so an id from
    // another chapter matches nothing. A chapter has at most 30 stages.
    const results = await Promise.all(
      existing.map((stage) =>
        this.supabase
          .from('rush_stages')
          .update({
            label: stage.label,
            position: stage.position,
            hidden: stage.hidden,
            updated_at: now,
          })
          .eq('id', stage.id!)
          .eq('chapter_id', chapterId),
      ),
    );
    for (const { error } of results) {
      if (error) throw new SupabaseQueryError(error);
    }
    if (added.length > 0) {
      const { error } = await this.supabase.from('rush_stages').insert(
        added.map((stage) => ({
          chapter_id: chapterId,
          key: stage.key,
          label: stage.label,
          category: stage.category,
          position: stage.position,
          hidden: stage.hidden,
        })),
      );
      if (error) throw new SupabaseQueryError(error);
    }
    return this.listStages(chapterId);
  }

  async listCandidates(chapterId: string): Promise<RushCandidate[]> {
    const { data, error } = await this.supabase
      .from('rush_candidates')
      .select('*')
      .eq('chapter_id', chapterId)
      .order('created_at', { ascending: false });
    if (error) throw new SupabaseQueryError(error);
    return data ?? [];
  }

  async setCandidateStage(
    candidateId: string,
    chapterId: string,
    stage: string,
    closedReason: RushClosedReason | null,
  ): Promise<RushCandidate> {
    const { data, error } = await this.supabase
      .from('rush_candidates')
      .update({ stage, closed_reason: closedReason })
      .eq('id', candidateId)
      .eq('chapter_id', chapterId)
      .select()
      .single();
    if (error) throw new SupabaseQueryError(error);
    return data;
  }

  async listTags(chapterId: string): Promise<RushTag[]> {
    const { data, error } = await this.supabase
      .from('rush_tags')
      .select('*')
      .eq('chapter_id', chapterId)
      .order('label', { ascending: true });
    if (error) throw new SupabaseQueryError(error);
    return data ?? [];
  }

  async findTag(tagId: string, chapterId: string): Promise<RushTag | null> {
    const { data, error } = await this.supabase
      .from('rush_tags')
      .select('*')
      .eq('id', tagId)
      .eq('chapter_id', chapterId)
      .maybeSingle();
    if (error) throw new SupabaseQueryError(error);
    return data;
  }

  async createTag(chapterId: string, label: string): Promise<RushTag> {
    const { data, error } = await this.supabase
      .from('rush_tags')
      .insert({ chapter_id: chapterId, label })
      .select()
      .single();
    if (error) throw new SupabaseQueryError(error);
    return data;
  }

  async renameTag(
    tagId: string,
    chapterId: string,
    label: string,
  ): Promise<RushTag> {
    const { data, error } = await this.supabase
      .from('rush_tags')
      .update({ label })
      .eq('id', tagId)
      .eq('chapter_id', chapterId)
      .select()
      .single();
    if (error) throw new SupabaseQueryError(error);
    return data;
  }

  async deleteTag(tagId: string, chapterId: string): Promise<void> {
    const { error } = await this.supabase
      .from('rush_tags')
      .delete()
      .eq('id', tagId)
      .eq('chapter_id', chapterId);
    if (error) throw new SupabaseQueryError(error);
  }

  async listCandidateTags(chapterId: string): Promise<RushCandidateTag[]> {
    const { data, error } = await this.supabase
      .from('rush_candidate_tags')
      .select('*')
      .eq('chapter_id', chapterId);
    if (error) throw new SupabaseQueryError(error);
    return data ?? [];
  }

  async setCandidateTags(
    candidateId: string,
    chapterId: string,
    tagIds: readonly string[],
  ): Promise<void> {
    // Delete what's no longer wanted, then add what's new: a retry of the
    // same list converges, and a tag kept on both sides is never touched.
    let removal = this.supabase
      .from('rush_candidate_tags')
      .delete()
      .eq('candidate_id', candidateId)
      .eq('chapter_id', chapterId);
    if (tagIds.length > 0) {
      removal = removal.not('tag_id', 'in', `(${tagIds.join(',')})`);
    }
    const { error: removeError } = await removal;
    if (removeError) throw new SupabaseQueryError(removeError);
    if (tagIds.length === 0) return;
    const { error } = await this.supabase.from('rush_candidate_tags').upsert(
      tagIds.map((tagId) => ({
        candidate_id: candidateId,
        tag_id: tagId,
        chapter_id: chapterId,
      })),
      { onConflict: 'candidate_id,tag_id', ignoreDuplicates: true },
    );
    if (error) throw new SupabaseQueryError(error);
  }

  async listRatings(chapterId: string): Promise<RushCandidateRating[]> {
    const { data, error } = await this.supabase
      .from('rush_candidate_ratings')
      .select('*')
      .eq('chapter_id', chapterId);
    if (error) throw new SupabaseQueryError(error);
    return data ?? [];
  }

  async upsertRating(
    candidateId: string,
    chapterId: string,
    raterId: string,
    rating: number,
  ): Promise<void> {
    const { error } = await this.supabase.from('rush_candidate_ratings').upsert(
      {
        candidate_id: candidateId,
        chapter_id: chapterId,
        rater_id: raterId,
        rating,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'candidate_id,rater_id' },
    );
    if (error) throw new SupabaseQueryError(error);
  }

  async listVotes(
    chapterId: string,
  ): Promise<{ candidate_id: string; voter_id: string }[]> {
    const { data, error } = await this.supabase
      .from('rush_candidate_votes')
      .select('candidate_id, voter_id')
      .eq('chapter_id', chapterId);
    if (error) throw new SupabaseQueryError(error);
    return data ?? [];
  }

  async listNotes(
    candidateId: string,
    chapterId: string,
  ): Promise<RushCandidateNote[]> {
    const { data, error } = await this.supabase
      .from('rush_candidate_notes')
      .select('*')
      .eq('candidate_id', candidateId)
      .eq('chapter_id', chapterId)
      .order('created_at', { ascending: false });
    if (error) throw new SupabaseQueryError(error);
    return data ?? [];
  }

  async findNote(
    noteId: string,
    candidateId: string,
    chapterId: string,
  ): Promise<RushCandidateNote | null> {
    const { data, error } = await this.supabase
      .from('rush_candidate_notes')
      .select('*')
      .eq('id', noteId)
      .eq('candidate_id', candidateId)
      .eq('chapter_id', chapterId)
      .maybeSingle();
    if (error) throw new SupabaseQueryError(error);
    return data;
  }

  async createNote(
    candidateId: string,
    chapterId: string,
    authorId: string,
    body: string,
  ): Promise<RushCandidateNote> {
    const { data, error } = await this.supabase
      .from('rush_candidate_notes')
      .insert({
        candidate_id: candidateId,
        chapter_id: chapterId,
        author_id: authorId,
        body,
      })
      .select()
      .single();
    if (error) throw new SupabaseQueryError(error);
    return data;
  }

  async updateNote(
    noteId: string,
    chapterId: string,
    body: string,
  ): Promise<RushCandidateNote> {
    const { data, error } = await this.supabase
      .from('rush_candidate_notes')
      .update({ body, updated_at: new Date().toISOString() })
      .eq('id', noteId)
      .eq('chapter_id', chapterId)
      .select()
      .single();
    if (error) throw new SupabaseQueryError(error);
    return data;
  }

  async deleteNote(noteId: string, chapterId: string): Promise<void> {
    const { error } = await this.supabase
      .from('rush_candidate_notes')
      .delete()
      .eq('id', noteId)
      .eq('chapter_id', chapterId);
    if (error) throw new SupabaseQueryError(error);
  }
}
