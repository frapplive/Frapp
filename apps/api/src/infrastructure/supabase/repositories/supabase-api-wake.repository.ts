import { Inject, Injectable } from '@nestjs/common';
import { SUPABASE_CLIENT } from '../supabase.provider';
import type { FrappSupabaseClient } from '../database.types';
import { SupabaseQueryError } from '../supabase-query-error';
import type { IApiWakeRepository } from '#domain/repositories/api-wake.repository.interface';

/** `api_wake`'s one row (#6123); the contract is on {@link IApiWakeRepository}. */
@Injectable()
export class SupabaseApiWakeRepository implements IApiWakeRepository {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: FrappSupabaseClient,
  ) {}

  async setUrl(url: string): Promise<void> {
    // An upsert, so a database whose seed row is missing still gets one.
    const { error } = await this.supabase
      .from('api_wake')
      .upsert(
        { id: true, url, updated_at: new Date().toISOString() },
        { onConflict: 'id' },
      );
    if (error) throw new SupabaseQueryError(error);
  }
}
