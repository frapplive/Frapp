import type { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import { supabaseProvider } from './supabase.provider';
import { createSupabaseFetch } from './supabase-fetch';

jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
jest.mock('./supabase-fetch', () => ({
  createSupabaseDispatcher: jest.fn(() => 'the pool'),
  createSupabaseFetch: jest.fn(() => 'the pooled fetch'),
}));

describe('supabaseProvider', () => {
  it('builds the client on the pooled fetch, so its connections outlive a burst', () => {
    const config = {
      getOrThrow: (key: string) => `value of ${key}`,
    } as unknown as ConfigService;
    const { useFactory } = supabaseProvider as unknown as {
      useFactory: (config: ConfigService) => unknown;
    };

    useFactory(config);

    expect(createSupabaseFetch).toHaveBeenCalledWith('the pool');
    expect(createClient).toHaveBeenCalledWith(
      'value of SUPABASE_URL',
      'value of SUPABASE_SERVICE_ROLE_KEY',
      expect.objectContaining({ global: { fetch: 'the pooled fetch' } }),
    );
  });
});
