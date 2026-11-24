import { Inject, Injectable } from '@nestjs/common';
import { SUPABASE_CLIENT } from '../supabase.provider';
import type { FrappSupabaseClient, Json } from '../database.types';
import { SupabaseQueryError } from '../supabase-query-error';
import { isUniqueViolation } from '#domain/constants/postgres-error-codes';
import type {
  ChapterInterestForm,
  ChapterInterestFormLabel,
  ConfirmInterestFormCodeResult,
  InterestFormSubmission,
  InterestFormVerification,
  InterestFormWithdrawalPreview,
  InterestFormWithdrawalResult,
  InterestFormWithdrawalScope,
  PushUpChapterFormResult,
  StartInterestFormCodeResult,
  SubmitInterestFormResult,
} from '#domain/entities/interest-form.entity';
import type {
  IInterestFormRepository,
  InterestFormPatch,
  InterestFormPlace,
  InterestFormPrefill,
} from '#domain/repositories/interest-form.repository.interface';

const PREFILL_COLUMNS =
  'first_name, last_name, preferred_name, class_year, phone' as const;

/**
 * Interest forms (#5977). Officer reads and writes are keyed by the chapter;
 * the public page's by the form its slug named. Codes, the submission and the
 * push-up are the database functions' (`20261124210747`), each one
 * transaction.
 */
@Injectable()
export class SupabaseInterestFormRepository implements IInterestFormRepository {
  constructor(
    @Inject(SUPABASE_CLIENT)
    private readonly supabase: FrappSupabaseClient,
  ) {}

  async findLiveForm(chapterId: string): Promise<ChapterInterestForm | null> {
    const { data, error } = await this.supabase
      .from('chapter_interest_forms')
      .select('*')
      .eq('chapter_id', chapterId)
      .is('replaced_at', null)
      .maybeSingle();
    if (error) throw new SupabaseQueryError(error);
    return data;
  }

  async createForm(
    chapterId: string,
    slug: string,
    actor: string,
  ): Promise<ChapterInterestForm> {
    const { data, error } = await this.supabase
      .from('chapter_interest_forms')
      .insert({ chapter_id: chapterId, slug, created_by: actor })
      .select('*')
      .single();
    if (error) {
      // Two first reads at once: the one-live index keeps one, and the
      // other answers it.
      if (isUniqueViolation(error)) {
        const live = await this.findLiveForm(chapterId);
        if (live) return live;
      }
      throw new SupabaseQueryError(error);
    }
    return data;
  }

  async updateForm(
    formId: string,
    chapterId: string,
    patch: InterestFormPatch,
  ): Promise<ChapterInterestForm> {
    const { data, error } = await this.supabase
      .from('chapter_interest_forms')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', formId)
      .eq('chapter_id', chapterId)
      .is('replaced_at', null)
      .select('*')
      .single();
    if (error) throw new SupabaseQueryError(error);
    return data;
  }

  async replaceForm(
    chapterId: string,
    slug: string,
    actor: string,
  ): Promise<ChapterInterestForm | null> {
    // One transaction (`replace_interest_form`): the old row's settings,
    // open state and labels carry over before it closes.
    const { data, error } = await this.supabase.rpc('replace_interest_form', {
      p_chapter_id: chapterId,
      p_slug: slug,
      p_actor: actor,
    });
    if (error) throw new SupabaseQueryError(error);
    const row = data as unknown as ChapterInterestForm | null;
    return row?.id ? row : null;
  }

  async findBySlug(slug: string): Promise<ChapterInterestForm | null> {
    const { data, error } = await this.supabase
      .from('chapter_interest_forms')
      .select('*')
      .eq('slug', slug)
      .maybeSingle();
    if (error) throw new SupabaseQueryError(error);
    return data;
  }

  async findLabels(formId: string): Promise<ChapterInterestFormLabel[]> {
    const { data, error } = await this.supabase
      .from('chapter_interest_form_labels')
      .select('*')
      .eq('form_id', formId)
      .order('created_at', { ascending: true });
    if (error) throw new SupabaseQueryError(error);
    return data ?? [];
  }

  async addLabel(
    formId: string,
    label: string,
  ): Promise<ChapterInterestFormLabel | null> {
    const { data, error } = await this.supabase
      .from('chapter_interest_form_labels')
      .insert({ form_id: formId, label })
      .select('*')
      .single();
    if (error) {
      if (isUniqueViolation(error)) return null;
      throw new SupabaseQueryError(error);
    }
    return data;
  }

  async removeLabel(formId: string, labelId: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('chapter_interest_form_labels')
      .delete()
      .eq('id', labelId)
      .eq('form_id', formId)
      .select('id');
    if (error) throw new SupabaseQueryError(error);
    return (data ?? []).length > 0;
  }

  async findPlace(chapterId: string): Promise<InterestFormPlace> {
    const { data: links, error } = await this.supabase
      .from('school_chapters')
      .select('school_id, created_at')
      .eq('chapter_id', chapterId)
      .eq('status', 'active')
      .order('created_at', { ascending: true });
    if (error) throw new SupabaseQueryError(error);
    const schoolIds = (links ?? []).map((row) => row.school_id);
    if (!schoolIds.length) return { schools: [], council: null };

    const [schoolRows, domainRows, councilLinks] = await Promise.all([
      this.supabase.from('schools').select('id, name').in('id', schoolIds),
      this.supabase
        .from('school_email_domains')
        .select('school_id, domain')
        .in('school_id', schoolIds)
        .eq('status', 'verified')
        .order('domain'),
      this.supabase
        .from('council_chapters')
        .select('council_id')
        .eq('chapter_id', chapterId)
        .eq('status', 'accepted'),
    ]);
    if (schoolRows.error) throw new SupabaseQueryError(schoolRows.error);
    if (domainRows.error) throw new SupabaseQueryError(domainRows.error);
    if (councilLinks.error) throw new SupabaseQueryError(councilLinks.error);

    const names = new Map(
      (schoolRows.data ?? []).map((row) => [row.id, row.name]),
    );
    const schools = schoolIds.flatMap((id) => {
      const name = names.get(id);
      if (!name) return [];
      const domains = (domainRows.data ?? [])
        .filter((row) => row.school_id === id)
        .map((row) => row.domain);
      return [{ id, name, domains }];
    });

    let council: InterestFormPlace['council'] = null;
    const councilIds = (councilLinks.data ?? []).map((row) => row.council_id);
    if (councilIds.length) {
      const { data: councils, error: councilError } = await this.supabase
        .from('chapters')
        .select('id, name, council_school_id, council_verified_at')
        .in('id', councilIds)
        .eq('kind', 'council')
        .in('council_school_id', schoolIds)
        .not('council_verified_at', 'is', null)
        // The council the submission is pushed to: one that recruits
        // (`interest_form_push_target`), so the consent text never names a
        // council that receives nothing.
        .neq('recruitment_model', 'none')
        .order('name');
      if (councilError) throw new SupabaseQueryError(councilError);
      const first = (councils ?? [])[0];
      if (first) council = { id: first.id, name: first.name };
    }
    return { schools, council };
  }

  async startCode(params: {
    formId: string;
    email: string;
    codeSalt: string;
    codeHash: string;
    ipHash: string | null;
    ttlSeconds: number;
    windowSeconds: number;
    maxPerAddress: number;
    maxPerIp: number;
    cooldownSeconds: number;
  }): Promise<StartInterestFormCodeResult> {
    const { data, error } = await this.supabase.rpc(
      'start_interest_form_code',
      {
        p_form_id: params.formId,
        p_email: params.email,
        p_code_salt: params.codeSalt,
        p_code_hash: params.codeHash,
        p_ip_hash: params.ipHash,
        p_ttl_seconds: params.ttlSeconds,
        p_window_seconds: params.windowSeconds,
        p_max_per_address: params.maxPerAddress,
        p_max_per_ip: params.maxPerIp,
        p_cooldown_seconds: params.cooldownSeconds,
      },
    );
    if (error) throw new SupabaseQueryError(error);
    return data as unknown as StartInterestFormCodeResult;
  }

  async discardCode(formId: string, verificationId: string): Promise<void> {
    const { error } = await this.supabase
      .from('interest_form_verifications')
      .delete()
      .eq('id', verificationId)
      .eq('form_id', formId)
      .is('closed_at', null);
    if (error) throw new SupabaseQueryError(error);
  }

  async findLatestCode(
    formId: string,
    email: string,
  ): Promise<InterestFormVerification | null> {
    const { data, error } = await this.supabase
      .from('interest_form_verifications')
      .select('*')
      .eq('form_id', formId)
      .eq('email', email.trim().toLowerCase())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new SupabaseQueryError(error);
    return data;
  }

  async confirmCode(params: {
    formId: string;
    verificationId: string;
    codeHash: string;
    proofHash: string;
    proofTtlSeconds: number;
    maxAttempts: number;
  }): Promise<ConfirmInterestFormCodeResult> {
    const { data, error } = await this.supabase.rpc(
      'confirm_interest_form_code',
      {
        p_form_id: params.formId,
        p_verification_id: params.verificationId,
        p_code_hash: params.codeHash,
        p_proof_hash: params.proofHash,
        p_proof_ttl_seconds: params.proofTtlSeconds,
        p_max_attempts: params.maxAttempts,
      },
    );
    if (error) throw new SupabaseQueryError(error);
    return data as unknown as ConfirmInterestFormCodeResult;
  }

  async findPrefill(
    chapterId: string,
    schoolIds: string[],
    email: string,
  ): Promise<InterestFormPrefill | null> {
    const address = email.trim().toLowerCase();
    const { data, error } = await this.supabase
      .from('interest_form_submissions')
      .select(PREFILL_COLUMNS)
      .eq('chapter_id', chapterId)
      .eq('email', address)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new SupabaseQueryError(error);
    if (data) return data;
    if (!schoolIds.length) return null;

    const { data: pnm, error: pnmError } = await this.supabase
      .from('pnms')
      .select(PREFILL_COLUMNS)
      .in('school_id', schoolIds)
      .eq('school_email', address)
      .is('merged_into_id', null)
      .not('email_verified_at', 'is', null)
      .limit(1)
      .maybeSingle();
    if (pnmError) throw new SupabaseQueryError(pnmError);
    return pnm;
  }

  async submit(params: {
    formId: string;
    verificationId: string;
    proofHash: string;
    firstName: string;
    lastName: string;
    preferredName: string | null;
    classYear: number | null;
    phone: string | null;
    answers: Record<string, string | string[]>;
    referrerText: string | null;
    sourceLabel: string | null;
    consentVersion: string;
    consentBoxes: string[];
    withdrawTokenHash: string;
    withdrawTtlSeconds: number;
  }): Promise<SubmitInterestFormResult> {
    const { data, error } = await this.supabase.rpc('submit_interest_form', {
      p_form_id: params.formId,
      p_verification_id: params.verificationId,
      p_proof_hash: params.proofHash,
      p_first_name: params.firstName,
      p_last_name: params.lastName,
      p_preferred_name: params.preferredName,
      p_class_year: params.classYear,
      p_phone: params.phone,
      p_answers: params.answers as Json,
      p_referrer_text: params.referrerText,
      p_source_label: params.sourceLabel,
      p_consent_version: params.consentVersion,
      p_consent_boxes: params.consentBoxes,
      p_withdraw_token_hash: params.withdrawTokenHash,
      p_withdraw_ttl_seconds: params.withdrawTtlSeconds,
    });
    if (error) throw new SupabaseQueryError(error);
    return data as unknown as SubmitInterestFormResult;
  }

  async previewWithdrawal(
    tokenHash: string,
  ): Promise<InterestFormWithdrawalPreview> {
    const { data, error } = await this.supabase.rpc(
      'preview_interest_form_withdrawal',
      { p_token_hash: tokenHash },
    );
    if (error) throw new SupabaseQueryError(error);
    return data as unknown as InterestFormWithdrawalPreview;
  }

  async withdraw(
    tokenHash: string,
    scope: InterestFormWithdrawalScope,
  ): Promise<InterestFormWithdrawalResult> {
    const { data, error } = await this.supabase.rpc('withdraw_interest_form', {
      p_token_hash: tokenHash,
      p_scope: scope,
    });
    if (error) throw new SupabaseQueryError(error);
    return data as unknown as InterestFormWithdrawalResult;
  }

  async pushUpChapter(chapterId: string): Promise<PushUpChapterFormResult> {
    const { data, error } = await this.supabase.rpc(
      'push_up_chapter_form_interests',
      { p_chapter_id: chapterId },
    );
    if (error) throw new SupabaseQueryError(error);
    return data as unknown as PushUpChapterFormResult;
  }

  async findLatestSubmission(
    chapterId: string,
    candidateId: string,
  ): Promise<InterestFormSubmission | null> {
    const { data, error } = await this.supabase
      .from('interest_form_submissions')
      .select('*')
      .eq('chapter_id', chapterId)
      .eq('candidate_id', candidateId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new SupabaseQueryError(error);
    return data;
  }
}
