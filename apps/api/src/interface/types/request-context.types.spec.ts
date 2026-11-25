import {
  getOptionalChapterId,
  type RequestContext,
} from './request-context.types';
import type { JwtPayload } from '@supabase/supabase-js';

const CHAPTER_A = '11111111-1111-4111-8111-111111111111';
const CHAPTER_B = '22222222-2222-4222-8222-222222222222';

/** A signed-in access token whose custom claim names `chapterId`. */
function claims(chapterId: string): JwtPayload {
  return {
    iss: 'https://project.supabase.co/auth/v1',
    sub: 'auth-user-1',
    aud: 'authenticated',
    exp: 2_000_000_000,
    iat: 1_900_000_000,
    role: 'authenticated',
    aal: 'aal1',
    session_id: 'session-1',
    active_chapter_id: chapterId,
  };
}

function request(
  overrides: Partial<
    Pick<RequestContext, 'chapterId' | 'jwtClaims' | 'headers'>
  > = {},
): Pick<RequestContext, 'chapterId' | 'jwtClaims' | 'headers'> {
  return {
    headers: {},
    ...overrides,
  };
}

describe('getOptionalChapterId', () => {
  it('returns undefined when no chapter is in context', () => {
    expect(getOptionalChapterId(request())).toBeUndefined();
  });

  it('reads x-chapter-id when the JWT claim is absent', () => {
    expect(
      getOptionalChapterId(request({ headers: { 'x-chapter-id': CHAPTER_A } })),
    ).toBe(CHAPTER_A);
  });

  it('prefers the x-chapter-id header over the JWT claim (ADR-27, #5918)', () => {
    // Header A, claim B: a tab in chapter A on a token whose claim is B gets
    // A's analytics group, as ChapterGuard serves it A.
    expect(
      getOptionalChapterId(
        request({
          jwtClaims: claims(CHAPTER_B),
          headers: { 'x-chapter-id': CHAPTER_A },
        }),
      ),
    ).toBe(CHAPTER_A);
  });

  it('falls back to the JWT claim when no header is sent', () => {
    expect(
      getOptionalChapterId(request({ jwtClaims: claims(CHAPTER_B) })),
    ).toBe(CHAPTER_B);
  });

  it('treats an empty header as absent', () => {
    expect(
      getOptionalChapterId(
        request({
          jwtClaims: claims(CHAPTER_B),
          headers: { 'x-chapter-id': '' },
        }),
      ),
    ).toBe(CHAPTER_B);
  });

  it('prefers ChapterGuard-resolved request.chapterId over JWT and header', () => {
    expect(
      getOptionalChapterId(
        request({
          chapterId: CHAPTER_A,
          jwtClaims: claims(CHAPTER_B),
          headers: { 'x-chapter-id': CHAPTER_B },
        }),
      ),
    ).toBe(CHAPTER_A);
  });

  it('does not 403 on a JWT/header mismatch — identity still needs the user digest', () => {
    expect(() =>
      getOptionalChapterId(
        request({
          jwtClaims: claims(CHAPTER_A),
          headers: { 'x-chapter-id': CHAPTER_B },
        }),
      ),
    ).not.toThrow();
  });
});
